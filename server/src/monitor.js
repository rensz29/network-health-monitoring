// Reachability checks: ping every server the user added, on a fixed interval, in the background.
// A server is "down" after DOWN_AFTER consecutive missed replies, so one lost packet doesn't flap it.
import { execFile } from 'node:child_process';
import { cached } from './cache.js';
import { listCustom } from './custom.js';
import { getDevices } from './devices.js';

export const INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS) || 10_000;
export const DOWN_AFTER = 2;
const PING_TIMEOUT_S = 1;
const HISTORY = 30;
const MAX_PARALLEL = 16;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

const checks = new Map(); // mac -> check state
let running = false;
let rerun = false;
let pingError = null;

/** One ICMP echo via the system ping (no shell; the IP is validated first). */
function ping(ip) {
  if (!IPV4.test(ip)) return Promise.resolve({ up: false, rttMs: null });
  const windows = process.platform === 'win32';
  const args = windows ? ['-n', '1', '-w', String(PING_TIMEOUT_S * 1000), ip] : ['-c', '1', '-W', String(PING_TIMEOUT_S), '-n', ip];
  return new Promise((resolve) => {
    execFile('ping', args, { timeout: (PING_TIMEOUT_S + 2) * 1000 }, (err, stdout) => {
      if (err?.code === 'ENOENT') {
        pingError = 'The ping command is not available on the dashboard server';
        return resolve({ up: false, rttMs: null });
      }
      // Windows exits 0 even for "destination unreachable" replies, so look for a real echo reply.
      const up = windows ? /TTL=/i.test(stdout) : !err;
      const m = /time[=<]([\d.]+)\s*ms/i.exec(stdout);
      resolve({ up, rttMs: up && m ? Number(m[1]) : null });
    });
  });
}

/** Servers to check: the user's IP first, else the IP the FortiGate learned for that MAC. */
async function targets() {
  const servers = (await listCustom()).filter((c) => c.kind === 'server');
  let ipByMac = new Map();
  if (servers.some((s) => !s.ip)) {
    try {
      // Same cache key as GET /api/devices?offSwitch=true, so this rarely costs a FortiGate call.
      const devices = await cached('devices:true', 10_000, () => getDevices({ includeOffSwitch: true }));
      ipByMac = new Map(devices.devices.map((d) => [d.mac, d.ip]));
    } catch {
      // FortiGate unreachable: servers without a typed IP are simply not checked this round.
    }
  }
  return servers.map((s) => ({ mac: s.mac, ip: s.ip ?? ipByMac.get(s.mac) ?? null }));
}

function record(mac, ip, result, now) {
  const prev = checks.get(mac);
  const sameTarget = prev?.ip === ip;
  if (!ip) {
    checks.set(mac, { mac, ip: null, status: 'no-ip', rttMs: null, checkedAt: now, changedAt: prev?.status === 'no-ip' ? prev.changedAt : now, lastUpAt: null, failures: 0, history: [] });
    return;
  }
  const failures = result.up ? 0 : (sameTarget ? prev.failures : 0) + 1;
  let status;
  if (result.up) status = 'up';
  else if (failures >= DOWN_AFTER) status = 'down';
  else status = sameTarget && prev.status !== 'no-ip' ? prev.status : 'pending'; // one miss: keep the last verdict
  const history = [...(sameTarget ? prev.history : []), { t: now, up: result.up, rttMs: result.rttMs }].slice(-HISTORY);
  checks.set(mac, {
    mac,
    ip,
    status,
    rttMs: result.rttMs,
    checkedAt: now,
    changedAt: sameTarget && prev.status === status ? prev.changedAt : now,
    lastUpAt: result.up ? now : sameTarget ? prev.lastUpAt : null,
    failures,
    history,
  });
}

async function runChecks() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    const list = await targets();
    for (let i = 0; i < list.length; i += MAX_PARALLEL) {
      const batch = list.slice(i, i + MAX_PARALLEL);
      const results = await Promise.all(batch.map((t) => (t.ip ? ping(t.ip) : null)));
      const now = Date.now();
      batch.forEach((t, j) => record(t.mac, t.ip, results[j], now));
    }
    // Forget servers that were removed.
    const wanted = new Set(list.map((t) => t.mac));
    for (const mac of checks.keys()) if (!wanted.has(mac)) checks.delete(mac);
  } catch (err) {
    console.error('Health checks failed:', err.message);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      runChecks();
    }
  }
}

export function startMonitor() {
  runChecks();
  setInterval(runChecks, INTERVAL_MS).unref();
}

/** Re-check right away (e.g. after a server is added or its IP changes). */
export function checkSoon() {
  setTimeout(runChecks, 0);
}

export function getHealthChecks() {
  return { intervalMs: INTERVAL_MS, downAfter: DOWN_AFTER, error: pingError, checks: [...checks.values()] };
}
