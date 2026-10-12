// Usage: npm run devices -- [switch_id] [--off-switch] [--json]
//   no switch_id   every device on every FortiSwitch
//   --off-switch   also devices the FortiGate sees that are not behind a FortiSwitch
import { getDevices, isValidSwitchId } from './devices.js';

const args = process.argv.slice(2);
const switchId = args.find((a) => !a.startsWith('--'));
const asJson = args.includes('--json');
const includeOffSwitch = args.includes('--off-switch');

if (switchId && !isValidSwitchId(switchId)) {
  console.error('Usage: npm run devices -- [switch_id] [--off-switch] [--json]');
  process.exit(1);
}

try {
  const result = await getDevices({ switchId, includeOffSwitch });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.table(
      result.devices.map((d) => ({
        ip: d.ip ?? '-',
        mac: d.mac,
        switch: d.switchId ?? '-',
        port: d.port ?? '-',
        vlan: d.vlan ?? '-',
        hostname: d.hostname ?? '',
        online: d.online,
        'other ips': d.ipCandidates.slice(1).map((c) => c.ip).join(', '),
      })),
    );
    for (const s of result.bySwitch) {
      console.log(`${s.switchId ?? '(not on a switch)'}: ${s.total} devices, ${s.withIp} with an IP`);
    }
    console.log(`Total: ${result.total} devices, ${result.withIp} with an IP`);
    for (const w of result.warnings) console.warn(`warning: ${w}`);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
