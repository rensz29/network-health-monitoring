// User customisations (stored by the server, keyed by MAC) layered over what the FortiGate detects.
import { fmtDuration } from './format.js';

export const NAME_MAX = 64;
export const NOTES_MAX = 500;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const PORT = /^[A-Za-z0-9_./-]{1,32}$/;

/** aa:bb:cc:dd:ee:ff, aa-bb-cc-dd-ee-ff, aabb.ccdd.eeff or aabbccddeeff -> aa:bb:cc:dd:ee:ff (or null). */
export function normalizeMac(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!/^[0-9a-f:.\-]+$/.test(raw)) return null;
  const hex = raw.replace(/[^0-9a-f]/g, '');
  return hex.length === 12 ? hex.match(/../g).join(':') : null;
}

export const isValidIp = (value) => IPV4.test(value);
export const isValidPort = (value) => PORT.test(value);

const portNumber = (port) => {
  const m = /(\d+)$/.exec(port ?? '');
  return m ? Number(m[1]) : null;
};

/**
 * Overlay customisations on detected devices. A customised MAC that no switch currently
 * sees is still listed (manualOnly), at the switch/port it was saved with.
 */
export function mergeCustom(devices, custom) {
  if (!custom.length) return devices;
  const byMac = new Map(custom.map((c) => [c.mac, c]));
  const seen = new Set();

  const merged = devices.map((d) => {
    const c = byMac.get(d.mac);
    if (!c) return d;
    seen.add(d.mac);
    const ipCandidates = c.ip && !d.ipCandidates.some((x) => x.ip === c.ip)
      ? [...d.ipCandidates, { ip: c.ip, sources: ['manual'] }]
      : d.ipCandidates;
    return { ...d, custom: c, name: c.name, ip: d.ip ?? c.ip, ipCandidates, os: c.os ?? d.os, detectedOs: d.os };
  });

  for (const c of custom) {
    if (seen.has(c.mac)) continue;
    merged.push({
      mac: c.mac,
      ip: c.ip,
      ipCandidates: c.ip ? [{ ip: c.ip, sources: ['manual'] }] : [],
      hostname: null,
      name: c.name,
      vendor: null,
      os: c.os,
      detectedOs: null,
      online: null,
      switchId: c.switchId,
      port: c.port,
      portId: portNumber(c.port),
      vlan: null,
      lastSeenSecondsAgo: null,
      interface: null,
      custom: c,
      manualOnly: true,
    });
  }
  return merged;
}

/**
 * Servers the user added or customised are treated as monitored: warn when their MAC is not
 * on any switch, or has not been seen for over an hour.
 */
export function customAlerts(devices, { displayName, isServer, idleSeconds }) {
  const alerts = [];
  for (const d of devices) {
    if (!d.custom || !isServer(d)) continue;
    const name = displayName(d);
    const where = d.switchId ? `${d.switchId}${d.port ? ` ${d.port}` : ''}` : 'its switch';
    const target = { type: 'device', id: d.mac };
    const h = d.health;
    if (h?.status === 'down') {
      const since = h.lastUpAt ? `; last reply at ${new Date(h.lastUpAt).toLocaleTimeString()}` : '';
      alerts.push({ severity: 'critical', title: `${name} is down`, detail: `No reply to ping from ${h.ip} on ${where}${since}`, target });
      continue;
    }
    // Answering pings is proof of life; how long ago the switch saw its MAC no longer matters.
    if (h?.status === 'up') continue;
    if (d.manualOnly) {
      alerts.push({ severity: 'warning', title: `${name} not detected`, detail: `Expected on ${where}; MAC ${d.mac} is not on any switch`, target });
    } else if (d.lastSeenSecondsAgo > idleSeconds) {
      alerts.push({ severity: 'warning', title: `${name} not seen for ${fmtDuration(d.lastSeenSecondsAgo)}`, detail: `Last seen on ${where}`, target });
    }
  }
  return alerts;
}
