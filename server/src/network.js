import { fgGet, fgRequest } from './fortigate.js';

// Throughput is derived from byte counters between two samples. Older samples would
// average traffic over too long a window to be useful, so they are discarded.
const MAX_RATE_WINDOW_MS = 5 * 60 * 1000;
const HIGH_UTILIZATION = 0.8;
// FortiGate CPU / memory thresholds (percent).
const GATEWAY_WARN = 80;
const GATEWAY_CRIT = 90;

let previousSample = null; // { at, counters: Map<"switch:port", { tx, rx }> }

const portKey = (node, port) => `${node}:${port}`;
const SEVERITY_ORDER = { critical: 0, warning: 1 };

// S148FNTF24001285 -> FS-148F. Unknown prefixes fall back to the raw serial prefix.
function modelFromSerial(serial = '') {
  const m = /^S(\d{3}[A-Z])/.exec(serial);
  return m ? `FS-${m[1]}` : serial.slice(0, 6);
}

// "S148FN-v7.6.0-build1015,240812 (GA)" -> "v7.6.0 build 1015"
function parseFirmware(osVersion) {
  const m = /-(v[\d.]+)-build(\d+)/.exec(osVersion ?? '');
  return m ? `${m[1]} build ${m[2]}` : osVersion ?? null;
}

// ["1000full", "10000full", "auto-module"] -> 10000
function maxSpeed(supported = []) {
  const speeds = supported.map((s) => parseInt(s, 10)).filter(Number.isFinite);
  return speeds.length ? Math.max(...speeds) : null;
}

// FortiSwitch reports "good" for healthy metrics; anything else needs attention.
function normalizeRating(rating) {
  if (!rating) return null;
  const r = String(rating).toLowerCase();
  if (r === 'good') return 'good';
  return /crit|bad|poor|fail/.test(r) ? 'critical' : 'warning';
}

function metric(entry) {
  return entry ? { value: entry.value, rating: normalizeRating(entry.rating) } : null;
}

function parseSwitchHealth(summary) {
  if (!summary) return null;
  const fans = Object.values(summary.fan ?? {});
  const fan = fans.find((f) => normalizeRating(f.rating) !== 'good') ?? fans[0];
  return {
    cpu: metric(summary.cpu),
    memory: metric(summary.memory),
    temperature: metric(summary.temperature),
    uptimeSeconds: summary.uptime?.value ?? null,
    fan: fan ? { value: fan.value, rating: normalizeRating(fan.rating) } : null,
  };
}

function thresholdRating(value) {
  if (value == null) return null;
  return value >= GATEWAY_CRIT ? 'critical' : value >= GATEWAY_WARN ? 'warning' : 'good';
}

// resource/usage entry -> { value, rating, history: [[epochMs, value], ...] oldest first }
function usage(entry) {
  if (!entry) return null;
  const values = entry.historical?.['1-hour']?.values ?? [];
  return { value: entry.current, rating: thresholdRating(entry.current), history: [...values].reverse() };
}

const formatSpeed = (mbps) => (mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`);

/**
 * Health snapshot of the FortiGate and its managed FortiSwitches: per-switch health
 * and ports, the uplinks between them (oriented FortiGate -> core -> access), live
 * uplink throughput, and a list of alerts.
 */
export async function getNetworkHealth() {
  const [status, switchRows, enrichment] = await Promise.all([
    fgRequest('monitor/system/status'),
    fgGet('monitor/switch-controller/managed-switch/status'),
    Promise.allSettled([
      fgGet('monitor/switch-controller/managed-switch/health-status'),
      fgGet('monitor/switch-controller/managed-switch/port-stats'),
      fgGet('monitor/system/resource/usage', { interval: '1-hour' }),
    ]),
  ]);

  const warnings = [];
  const [healthRows, portStatRows, resources] = enrichment.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    warnings.push(`${['switch health', 'port statistics', 'FortiGate resource usage'][i]} unavailable: ${r.reason.message}`);
    return null;
  });

  const now = Date.now();
  const alerts = [];

  const gateway = {
    id: status.serial,
    hostname: status.results?.hostname ?? status.serial,
    model: status.results?.model ?? 'FortiGate',
    version: status.version ?? null,
    build: status.build ?? null,
    cpu: usage(resources?.cpu?.[0]),
    memory: usage(resources?.mem?.[0]),
    sessions: usage(resources?.session?.[0]),
  };
  for (const [name, m] of [['CPU', gateway.cpu], ['Memory', gateway.memory]]) {
    if (m?.rating && m.rating !== 'good') {
      alerts.push({
        severity: m.rating,
        title: `FortiGate ${name.toLowerCase()} at ${m.value}%`,
        detail: `${gateway.hostname} is above the ${m.rating === 'critical' ? GATEWAY_CRIT : GATEWAY_WARN}% threshold`,
        target: { type: 'gateway', id: gateway.id },
      });
    }
  }

  const healthById = new Map((healthRows ?? []).map((h) => [h['switch-id'], h.summary]));

  const counters = new Map();
  for (const row of portStatRows ?? []) {
    for (const [port, s] of Object.entries(row.ports ?? {})) {
      counters.set(portKey(row['switch-id'], port), {
        tx: s['tx-bytes'],
        rx: s['rx-bytes'],
        errors: (s['rx-errors'] ?? 0) + (s['tx-errors'] ?? 0) + (s['crc-alignments'] ?? 0),
        drops: (s['rx-drops'] ?? 0) + (s['tx-drops'] ?? 0),
      });
    }
  }

  // ---- Switches and the raw (unoriented) links between them ----
  const switches = [];
  const linksByKey = new Map();
  const portIndex = new Map(); // "node:port" -> port object

  for (const s of switchRows) {
    const id = s['switch-id'];
    const online = s.status === 'Connected';
    const ports = (s.ports ?? []).map((p) => {
      let peer = null;
      // Any FortiLink peer is the FortiGate (in an HA pair it may name the other member).
      if (p.fortilink_port && p.fgt_peer_device_name) {
        peer = { node: gateway.id, port: p.fgt_peer_port_name, kind: 'fortilink' };
      } else if (p.isl_peer_device_name) {
        peer = { node: p.isl_peer_device_name, port: p.isl_peer_port_name, kind: 'isl', trunk: p.isl_peer_trunk_name };
      }
      const port = {
        name: p.interface,
        up: p.status === 'up',
        speedMbps: p.speed || 0,
        maxSpeedMbps: maxSpeed(p.supported_port_speeds),
        vlan: p.vlan || null,
        poe: Boolean(p.poe_capable),
        peer,
      };
      portIndex.set(portKey(id, port.name), port);
      return port;
    });

    for (const port of ports) {
      if (!port.peer) continue;
      const key = [portKey(id, port.name), portKey(port.peer.node, port.peer.port)].sort().join('|');
      if (!linksByKey.has(key)) {
        linksByKey.set(key, {
          id: key,
          kind: port.peer.kind,
          trunk: port.peer.trunk ?? null,
          ends: [{ node: id, port: port.name }, { node: port.peer.node, port: port.peer.port }],
        });
      }
    }

    switches.push({
      id,
      serial: s.serial,
      model: modelFromSerial(s.serial),
      online,
      status: s.status,
      ip: s.connecting_from || null,
      firmware: parseFirmware(s.os_version),
      health: online ? parseSwitchHealth(healthById.get(id)) : null,
      portsUp: ports.filter((p) => p.up).length,
      ports,
      role: null,
      depth: null,
      uplink: null,
    });
  }

  // ---- Orient links parent -> child with a breadth-first walk from the FortiGate ----
  const switchById = new Map(switches.map((s) => [s.id, s]));
  const adjacency = new Map();
  for (const link of linksByKey.values()) {
    for (const [self, other] of [link.ends, [...link.ends].reverse()]) {
      if (!adjacency.has(self.node)) adjacency.set(self.node, []);
      adjacency.get(self.node).push({ link, self, other });
    }
  }

  const depth = new Map([[gateway.id, 0]]);
  const queue = [gateway.id];
  const treeLinks = new Set();
  while (queue.length) {
    const node = queue.shift();
    for (const { link, self, other } of adjacency.get(node) ?? []) {
      if (depth.has(other.node)) continue;
      depth.set(other.node, depth.get(node) + 1);
      link.a = self;
      link.b = other;
      treeLinks.add(link);
      const child = switchById.get(other.node);
      if (child) {
        child.depth = depth.get(other.node);
        // Switches attached straight to the FortiGate over FortiLink form the core tier.
        child.role = child.depth === 1 ? 'core' : 'access';
        child.uplink = { linkId: link.id, parent: self.node, parentPort: self.port, port: other.port };
      }
      queue.push(other.node);
    }
  }

  // ---- Per-link status, speed, counters, throughput ----
  const links = [...linksByKey.values()].map((link) => {
    const inTree = treeLinks.has(link);
    const [a, b] = inTree ? [link.a, link.b] : link.ends;
    const portA = portIndex.get(portKey(a.node, a.port)); // undefined for the FortiGate end
    const portB = portIndex.get(portKey(b.node, b.port));
    const switchPorts = [portA, portB].filter(Boolean);

    const up = switchPorts.every((p) => p.up);
    const speedMbps = Math.min(...switchPorts.map((p) => p.speedMbps || Infinity));
    // Only judge negotiated speed when both ends are switches we can see.
    const capableMbps = portA?.maxSpeedMbps && portB?.maxSpeedMbps
      ? Math.min(portA.maxSpeedMbps, portB.maxSpeedMbps)
      : null;

    const endCounters = [counters.get(portKey(a.node, a.port)), counters.get(portKey(b.node, b.port))];
    const errors = endCounters.reduce((sum, c) => sum + (c?.errors ?? 0), 0);
    const drops = endCounters.reduce((sum, c) => sum + (c?.drops ?? 0), 0);

    // Traffic is measured on the child end: its TX goes upstream, its RX comes downstream.
    const childKey = portKey(b.node, b.port);
    const cur = counters.get(childKey);
    const prev = previousSample?.counters.get(childKey);
    let rate = null;
    if (cur && prev && now - previousSample.at <= MAX_RATE_WINDOW_MS) {
      const seconds = (now - previousSample.at) / 1000;
      const upstreamBps = ((cur.tx - prev.tx) * 8) / seconds;
      const downstreamBps = ((cur.rx - prev.rx) * 8) / seconds;
      // Negative deltas mean the counters reset (switch reboot); skip this sample.
      if (seconds > 0 && upstreamBps >= 0 && downstreamBps >= 0) {
        rate = { upstreamBps, downstreamBps, windowSeconds: Math.round(seconds) };
      }
    }
    const utilization = rate && Number.isFinite(speedMbps)
      ? Math.max(rate.upstreamBps, rate.downstreamBps) / (speedMbps * 1e6)
      : null;

    const label = `${a.node} ${a.port} ↔ ${b.node} ${b.port}`;
    const issues = [];
    if (!up) {
      issues.push({ severity: 'critical', title: 'Uplink down', detail: label });
    } else {
      if (capableMbps && speedMbps < capableMbps) {
        issues.push({
          severity: 'warning',
          title: `Uplink running at ${formatSpeed(speedMbps)}`,
          detail: `Both ends support ${formatSpeed(capableMbps)} (${label})`,
        });
      }
      if (errors > 0) {
        issues.push({
          severity: 'warning',
          title: `${errors.toLocaleString('en-US')} errors on uplink`,
          detail: `CRC / RX / TX errors since the switches booted (${label})`,
        });
      }
      if (utilization !== null && utilization >= HIGH_UTILIZATION) {
        issues.push({ severity: 'warning', title: `Uplink at ${Math.round(utilization * 100)}% utilization`, detail: label });
      }
    }
    // Link alerts are attributed to the downstream switch, whose uplink it is.
    for (const issue of issues) alerts.push({ ...issue, target: { type: 'switch', id: b.node, linkId: link.id } });

    return {
      id: link.id,
      kind: link.kind,
      inTree,
      trunk: link.trunk,
      a,
      b,
      up,
      health: issues.some((i) => i.severity === 'critical') ? 'critical' : issues.length ? 'warning' : 'good',
      speedMbps: Number.isFinite(speedMbps) ? speedMbps : null,
      capableMbps,
      errors,
      drops,
      rate,
      utilization,
    };
  });

  if (portStatRows) previousSample = { at: now, counters };

  // ---- Switch-level alerts ----
  for (const s of switches) {
    const target = { type: 'switch', id: s.id };
    if (!s.online) {
      alerts.push({ severity: 'critical', title: `${s.id} is offline`, detail: `FortiGate reports status "${s.status}"`, target });
      continue;
    }
    const h = s.health;
    for (const [name, m, unit] of [['CPU', h?.cpu, '%'], ['Memory', h?.memory, '%'], ['Temperature', h?.temperature, '°C']]) {
      if (m?.rating && m.rating !== 'good') {
        alerts.push({ severity: m.rating, title: `${s.id} ${name.toLowerCase()} ${m.value}${unit}`, detail: `FortiSwitch rates ${name.toLowerCase()} as ${m.rating}`, target });
      }
    }
    if (h?.fan?.rating && h.fan.rating !== 'good') {
      alerts.push({ severity: h.fan.rating, title: `${s.id} fan ${h.fan.value}`, detail: 'Fan reported unhealthy', target });
    }
  }

  alerts.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  // Tree order: core first, then access switches by depth; unplaced (offline) switches last.
  switches.sort((x, y) => (x.depth ?? 99) - (y.depth ?? 99) || x.id.localeCompare(y.id));

  return { fetchedAt: new Date(now).toISOString(), gateway, switches, links, alerts, warnings };
}
