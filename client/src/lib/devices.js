// Pure device filtering, sorting, counting and CSV export.
import { ipToNumber } from './format.js';
import { activityOf, displayName, isServer } from './model.js';

export function inScope(device, scope) {
  if (scope === 'all') return true;
  if (scope === 'direct') return device.switchId === null;
  if (scope.startsWith('sw:')) return device.switchId === scope.slice(3);
  return device.switchId !== null; // 'switches'
}

const searchIndex = new WeakMap();
function searchText(d) {
  if (!searchIndex.has(d)) {
    searchIndex.set(d, [
      ...d.ipCandidates.map((c) => c.ip), d.mac, d.mac.replaceAll(':', ''), d.name, d.hostname, d.vendor, d.os, d.custom?.notes,
      d.switchId, d.port, d.interface, d.vlan != null ? `vlan ${d.vlan}` : null,
    ].filter(Boolean).join(' ').toLowerCase());
  }
  return searchIndex.get(d);
}

// Accept MACs typed with dashes (aa-bb-cc) as well as colons.
export function normalizeNeedle(q) {
  const needle = q.trim().toLowerCase();
  return /^[0-9a-f]{2}(-[0-9a-f]{2})+$/.test(needle) ? needle.replaceAll('-', ':') : needle;
}

/** Does `d` pass every filter? `skip` ignores one filter, to preview counts for its options. */
export function matches(d, filters, needle, skip) {
  return inScope(d, filters.scope)
    && (skip === 'vlan' || !filters.vlan || String(d.vlan) === filters.vlan)
    && (skip === 'activity' || filters.activity === 'all' || activityOf(d) === filters.activity)
    && (!filters.hasIp || Boolean(d.ip))
    && (!filters.servers || isServer(d))
    && (!filters.port || d.port === filters.port)
    && (!needle || searchText(d).includes(needle));
}

const SORT_KEYS = {
  lastSeen: (d) => d.lastSeenSecondsAgo,
  ip: (d) => ipToNumber(d.ip),
  hostname: (d) => (d.name || d.hostname)?.toLowerCase() ?? null,
  mac: (d) => d.mac,
  vendor: (d) => d.vendor?.toLowerCase() ?? null,
  port: (d) => d.portId,
  vlan: (d) => d.vlan,
};

function compare(a, b) {
  // Missing values always sort last, whichever direction is chosen.
  if (a == null && b == null) return 0;
  if (a == null) return Infinity;
  if (b == null) return -Infinity;
  return a < b ? -1 : a > b ? 1 : 0;
}

function sorter({ key, dir }) {
  const sign = dir === 'desc' ? -1 : 1;
  if (key === 'switch') {
    return (a, b) => {
      const bySwitch = compare(a.switchId, b.switchId);
      if (!Number.isFinite(bySwitch)) return bySwitch > 0 ? 1 : -1;
      return sign * bySwitch || compare(a.portId, b.portId) || compare(a.vlan, b.vlan) || compare(a.mac, b.mac);
    };
  }
  const get = SORT_KEYS[key] ?? SORT_KEYS.lastSeen;
  return (a, b) => {
    const c = compare(get(a), get(b));
    if (!Number.isFinite(c)) return c > 0 ? 1 : -1;
    return sign * c || compare(a.mac, b.mac);
  };
}

export function filterDevices(devices, filters, sort) {
  const needle = normalizeNeedle(filters.q);
  return devices.filter((d) => matches(d, filters, needle)).sort(sorter(sort));
}

/** Option counts for the scope, VLAN and activity controls. */
export function filterCounts(devices, filters, switchIds) {
  const needle = normalizeNeedle(filters.q);
  const scope = { switches: 0, all: devices.length, direct: 0 };
  for (const id of switchIds) scope[`sw:${id}`] = 0;
  const vlans = new Map();
  const activity = { all: 0, active: 0, idle: 0, inactive: 0 };

  for (const d of devices) {
    if (d.switchId === null) scope.direct++;
    else {
      scope.switches++;
      scope[`sw:${d.switchId}`] = (scope[`sw:${d.switchId}`] ?? 0) + 1;
    }
    // VLAN and activity counts reflect every other active filter, so they preview the result.
    if (d.vlan != null && matches(d, filters, needle, 'vlan')) vlans.set(d.vlan, (vlans.get(d.vlan) ?? 0) + 1);
    if (matches(d, filters, needle, 'activity')) {
      activity.all++;
      activity[activityOf(d)]++;
    }
  }
  if (filters.vlan && !vlans.has(Number(filters.vlan))) vlans.set(Number(filters.vlan), 0);
  return { scope, vlans: [...vlans.entries()].sort((a, b) => a[0] - b[0]), activity };
}

function csvCell(value) {
  if (value == null) return '';
  let s = String(value);
  // Neutralise spreadsheet formulas: hostnames come from the devices themselves.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Download `rows` as a CSV file. */
export function downloadCsv(rows) {
  const header = ['name', 'ip', 'hostname', 'mac', 'vendor', 'os', 'server', 'switch', 'port', 'vlan', 'activity', 'last_seen_seconds', 'other_ips', 'notes'];
  const lines = [header, ...rows.map((d) => [
    displayName(d), d.ip, d.hostname, d.mac, d.vendor, d.os, isServer(d) ? 'yes' : 'no', d.switchId, d.port, d.vlan,
    d.manualOnly ? 'not detected' : activityOf(d), d.lastSeenSecondsAgo, d.ipCandidates.slice(1).map((c) => c.ip).join(' '), d.custom?.notes,
  ])].map((r) => r.map(csvCell).join(','));

  const url = URL.createObjectURL(new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `devices-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
