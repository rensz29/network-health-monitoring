import { fgGet } from './fortigate.js';

// ARP entries older than this are treated as less trustworthy than the device inventory.
const ARP_FRESH_SECONDS = 3600;

// Switch ids look like S148FNTF24001285 or OT_Core_Switch. Restricting the charset keeps
// callers from injecting extra clauses into the FortiOS filter expression.
const SWITCH_ID_RE = /^[A-Za-z0-9_-]+$/;

export function isValidSwitchId(switchId) {
  return SWITCH_ID_RE.test(switchId);
}

const normMac = (mac) => (mac ?? '').toLowerCase();

function groupByMac(rows) {
  const map = new Map();
  for (const row of rows) {
    const mac = normMac(row.mac);
    if (!map.has(mac)) map.set(mac, []);
    map.get(mac).push(row);
  }
  return map;
}

// Lower rank wins: fresh ARP > device inventory > DHCP lease > stale ARP.
function rank(candidate) {
  if (candidate.source === 'arp') {
    return candidate.age <= ARP_FRESH_SECONDS ? [0, candidate.age] : [3, candidate.age];
  }
  return candidate.source === 'inventory' ? [1, 0] : [2, 0];
}

/** Merge every IP seen for a MAC, best first, recording which tables reported it. */
function resolveIps(arpRows, inventoryRow, dhcpRows) {
  const candidates = [
    ...arpRows.map((a) => ({ ip: a.ip, source: 'arp', age: a.age })),
    ...(inventoryRow?.ipv4_address ? [{ ip: inventoryRow.ipv4_address, source: 'inventory' }] : []),
    ...dhcpRows.map((l) => ({ ip: l.ip, source: 'dhcp' })),
  ].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1];
  });

  const byIp = new Map();
  for (const c of candidates) {
    const entry = byIp.get(c.ip) ?? { ip: c.ip, sources: [] };
    entry.sources.push(c.source);
    if (c.source === 'arp') entry.arpAgeSeconds = Math.min(entry.arpAgeSeconds ?? Infinity, c.age);
    byIp.set(c.ip, entry);
  }
  return [...byIp.values()];
}

/**
 * List devices the FortiGate has detected behind its managed FortiSwitches, with IP
 * addresses resolved from the device inventory, ARP table and DHCP leases.
 *
 * @param {object}  [options]
 * @param {string}  [options.switchId]          Only devices on this switch; omit for every switch.
 * @param {boolean} [options.includeOffSwitch]  Also list inventory devices that are not behind
 *                                              any FortiSwitch (ignored when switchId is set).
 */
export async function getDevices({ switchId, includeOffSwitch = false } = {}) {
  const [detected, enrichment] = await Promise.all([
    // Source of truth for "what is on a switch"; it only carries MACs.
    fgGet('monitor/switch-controller/detected-device', switchId ? { filter: `switch_id==${switchId}` } : {}),
    // Enrichment: if one fails (e.g. token lacks that permission) we still return results.
    Promise.allSettled([
      fgGet('monitor/user/device/query', switchId ? { filter: `fortiswitch_id==${switchId}` } : {}),
      fgGet('monitor/network/arp'),
      fgGet('monitor/system/dhcp'),
    ]),
  ]);

  const warnings = [];
  const [inventory, arp, dhcp] = enrichment.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    warnings.push(`${['device inventory', 'ARP table', 'DHCP leases'][i]} unavailable: ${r.reason.message}`);
    return [];
  });

  const inventoryByMac = new Map(inventory.map((d) => [normMac(d.mac), d]));
  const arpByMac = groupByMac(arp);
  const dhcpByMac = groupByMac(dhcp);

  const buildDevice = (mac, inv, location) => {
    const leases = dhcpByMac.get(mac) ?? [];
    const ips = resolveIps(arpByMac.get(mac) ?? [], inv, leases);
    return {
      ip: ips[0]?.ip ?? null,
      mac,
      hostname: inv?.hostname ?? leases[0]?.hostname ?? null,
      vendor: inv?.hardware_vendor ?? null,
      os: inv?.os_name && inv.os_name !== 'Unknown' ? inv.os_name : null,
      online: inv?.is_online ?? null,
      ...location,
      interface: inv?.detected_interface ?? null,
      ipCandidates: ips,
    };
  };

  const devices = detected.map((d) => {
    const mac = normMac(d.mac);
    return buildDevice(mac, inventoryByMac.get(mac), {
      switchId: d.switch_id,
      port: d.port_name,
      portId: d.port_id,
      vlan: d.vlan_id,
      lastSeenSecondsAgo: d.last_seen,
    });
  });

  if (includeOffSwitch && !switchId) {
    const onSwitch = new Set(devices.map((d) => d.mac));
    const nowSeconds = Date.now() / 1000;
    for (const inv of inventory) {
      const mac = normMac(inv.mac);
      if (inv.fortiswitch_id || onSwitch.has(mac)) continue;
      devices.push(
        buildDevice(mac, inv, {
          switchId: null,
          port: null,
          portId: null,
          vlan: null,
          // Inventory last_seen is an epoch timestamp; detected-device's is already "seconds ago".
          lastSeenSecondsAgo: inv.last_seen ? Math.max(0, Math.round(nowSeconds - inv.last_seen)) : null,
        }),
      );
    }
  }

  // Group by switch (off-switch devices last), then port, VLAN and MAC.
  devices.sort(
    (a, b) =>
      (a.switchId === null) - (b.switchId === null) ||
      (a.switchId ?? '').localeCompare(b.switchId ?? '') ||
      (a.portId ?? 0) - (b.portId ?? 0) ||
      (a.vlan ?? 0) - (b.vlan ?? 0) ||
      a.mac.localeCompare(b.mac),
  );

  // Per-switch counts, in the same order as devices; off-switch devices have switchId null.
  const counts = new Map();
  for (const d of devices) {
    if (!counts.has(d.switchId)) counts.set(d.switchId, { switchId: d.switchId, total: 0, withIp: 0 });
    const c = counts.get(d.switchId);
    c.total++;
    if (d.ip) c.withIp++;
  }
  const bySwitch = [...counts.values()];

  return {
    switchId: switchId ?? null,
    includeOffSwitch: includeOffSwitch && !switchId,
    fetchedAt: new Date().toISOString(),
    total: devices.length,
    withIp: devices.filter((d) => d.ip).length,
    bySwitch,
    warnings,
    devices,
  };
}
