// Domain rules shared by every view.
import { customAlerts, mergeCustom } from './custom.js';

export const REFRESH_MS = 30_000;
// Devices are classified by how recently their MAC address was seen on a switch port.
export const ACTIVE_SECONDS = 5 * 60;
export const IDLE_SECONDS = 60 * 60;

const RANK = { good: 0, warning: 1, critical: 2 };

export function worst(levels) {
  return levels.reduce((acc, level) => (level && RANK[level] > RANK[acc] ? level : acc), 'good');
}

// The FortiGate fingerprints each device's OS from its traffic (or the user sets it).
const OS_FAMILY = { windows: 'Windows', linux: 'Linux' };
/** 'Windows', 'Linux', or null for anything else / unknown. */
export const osFamily = (device) => OS_FAMILY[device.os?.toLowerCase()] ?? null;
/** OS text for display: the reported OS, or a fallback. */
export const osLabel = (device, fallback = 'Unknown OS') => device.os || fallback;

/** Servers are exactly the devices the user added as servers; nothing is classified automatically. */
export const isServer = (device) => device.custom?.kind === 'server';

/** Reachability from the dashboard server's pings (null when the device is not pinged). */
export function serverHealth(device) {
  switch (device.health?.status) {
    case undefined: return null;
    case 'up': return { level: 'good', label: 'Up', icon: 'check-circle' };
    case 'down': return { level: 'critical', label: 'Down', icon: 'x-octagon' };
    case 'no-ip': return { level: null, label: 'No IP to ping', icon: 'info' };
    default: return { level: null, label: 'Checking…', icon: 'clock' };
  }
}

/** The user's name first, then the detected hostname, IP, MAC. */
export const displayName = (device) => device.name || device.hostname || device.ip || device.mac;

export function activityOf(device) {
  const s = device.lastSeenSecondsAgo;
  if (s == null || s > IDLE_SECONDS) return 'inactive';
  return s <= ACTIVE_SECONDS ? 'active' : 'idle';
}

const push = (map, key, value) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
};

const emptyStats = () => ({ total: 0, active: 0, withIp: 0, servers: 0, vlans: new Map() });

/** Index the API payloads once per refresh (and after each edit) so views can look things up directly. */
export function derive(network, devicesPayload, custom = [], health = new Map()) {
  // Ping results only apply to the servers the user added (the ones that are pinged).
  const devices = mergeCustom(devicesPayload.devices, custom)
    .map((d) => (health.has(d.mac) && isServer(d) ? { ...d, health: health.get(d.mac) } : d));
  const SEVERITY = { critical: 0, warning: 1 };
  const alerts = [
    ...network.alerts,
    ...customAlerts(devices, { displayName, isServer, idleSeconds: IDLE_SECONDS }),
  ].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]);

  const switchById = new Map(network.switches.map((s) => [s.id, s]));
  const linkById = new Map(network.links.map((l) => [l.id, l]));

  const downlinks = new Map(); // parent node id -> links to its children
  for (const link of network.links) if (link.inTree) push(downlinks, link.a.node, link);

  const alertsByTarget = new Map();
  for (const alert of alerts) push(alertsByTarget, alert.target.id, alert);

  const deviceByMac = new Map();
  const deviceStats = new Map(); // switch id (null = not behind a switch) -> stats
  const portCounts = new Map(); // "switch:port" -> device count
  const serversBySwitch = new Map(); // switch id (null = not behind a switch) -> server devices
  for (const d of devices) {
    deviceByMac.set(d.mac, d);
    if (!deviceStats.has(d.switchId)) deviceStats.set(d.switchId, emptyStats());
    const stats = deviceStats.get(d.switchId);
    stats.total++;
    if (activityOf(d) === 'active') stats.active++;
    if (d.ip) stats.withIp++;
    if (d.vlan != null) stats.vlans.set(d.vlan, (stats.vlans.get(d.vlan) ?? 0) + 1);
    if (d.port) portCounts.set(`${d.switchId}:${d.port}`, (portCounts.get(`${d.switchId}:${d.port}`) ?? 0) + 1);
    if (isServer(d)) {
      stats.servers++;
      push(serversBySwitch, d.switchId, d);
    }
  }
  for (const list of serversBySwitch.values()) {
    list.sort((a, b) => (a.portId ?? Infinity) - (b.portId ?? Infinity) || displayName(a).localeCompare(displayName(b)));
  }

  // Depth-first order from the FortiGate so each switch is listed right after its parent.
  const treeOrder = [];
  const visit = (nodeId) => {
    const children = (downlinks.get(nodeId) ?? []).map((l) => l.b.node).sort();
    for (const id of children) {
      if (switchById.has(id)) treeOrder.push(id);
      visit(id);
    }
  };
  visit(network.gateway.id);

  const severityOf = (id) => worst((alertsByTarget.get(id) ?? []).map((a) => a.severity));

  return {
    devices,
    alerts,
    switchById,
    linkById,
    downlinks,
    alertsByTarget,
    deviceByMac,
    deviceStats,
    portCounts,
    serversBySwitch,
    treeOrder,
    severityOf,
    statsFor: (switchId) => deviceStats.get(switchId) ?? emptyStats(),
    serversFor: (switchId) => serversBySwitch.get(switchId) ?? [],
  };
}

export function switchStatus(sw, idx) {
  if (!sw.online) return { level: 'critical', label: 'Offline' };
  const level = idx.severityOf(sw.id);
  return { level, label: { good: 'Healthy', warning: 'Warning', critical: 'Critical' }[level] };
}

export function gatewayStatus(network, idx) {
  const level = idx.severityOf(network.gateway.id);
  return { level, label: { good: 'Healthy', warning: 'Warning', critical: 'Critical' }[level] };
}

/** Switch ids from the core down to `switchId` (the FortiGate is implied above the first). */
export function pathFromRoot(idx, switchId) {
  const path = [];
  const seen = new Set();
  let current = idx.switchById.get(switchId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.id);
    current = current.uplink ? idx.switchById.get(current.uplink.parent) : null;
  }
  return path;
}

export const nodeName = (network, id) => (id === network.gateway.id ? network.gateway.hostname : id);
