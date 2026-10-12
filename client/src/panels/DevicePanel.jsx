import { Icon } from '../components/Icon.jsx';
import { ACTIVITY, AlertList, CopyButton, Facts, PingHistory, Pill, Section } from '../components/ui.jsx';
import { fmtAgo, fmtDuration, fmtInt } from '../lib/format.js';
import { activityOf, displayName, isServer, serverHealth, switchStatus } from '../lib/model.js';
import { PanelHeader } from './shared.jsx';

const SOURCE_LABEL = { arp: 'ARP table', inventory: 'Device inventory', dhcp: 'DHCP lease', manual: 'Entered by you' };
const KIND_LABEL = { server: 'Server (added by you)', device: 'Device' };

function WithCopy({ text, label }) {
  return <><span className="mono">{text}</span><CopyButton text={text} label={label} /></>;
}

export function devicePanel(d, { idx, actions }) {
  const act = activityOf(d);
  const sw = d.switchId ? idx.switchById.get(d.switchId) : null;
  const swStatus = sw ? switchStatus(sw, idx) : null;
  const showPort = () => actions.showDevices({ scope: `sw:${d.switchId}`, port: d.port });
  const alerts = idx.alertsByTarget.get(d.mac) ?? [];
  const sub = [d.name && d.hostname && `Detected as ${d.hostname}`, d.vendor, d.os].filter(Boolean).join(' · ') || 'Unknown vendor';
  // Idle / inactive are not faults, so only "active" borrows a status color.
  const health = serverHealth(d);
  const status = health
    ? { level: health.level, label: health.label, icon: health.icon }
    : d.manualOnly
      ? { level: 'warning', label: 'Not detected' }
      : { level: act === 'active' ? 'good' : null, label: ACTIVITY[act].label, icon: ACTIVITY[act].icon };
  const h = d.health;
  const secondsSince = (t) => (t ? Math.max(0, (Date.now() - t) / 1000) : null);

  return {
    key: `device:${d.mac}`,
    header: (
      <PanelHeader
        icon={isServer(d) ? 'server' : 'devices'}
        title={displayName(d)}
        sub={sub}
        status={status}
        extra={
          <span className="panel-actions">
            {!isServer(d) && (
              <button className="btn btn-sm btn-primary" type="button" onClick={() => actions.openPromote(d.mac)}>
                <Icon name="plus" />Add to servers
              </button>
            )}
            <button className="btn btn-sm" type="button" onClick={() => actions.openEditor(d.mac)}>
              <Icon name="pencil" />{d.custom ? 'Edit' : 'Rename'}
            </button>
          </span>
        }
      />
    ),
    body: (
      <>
        {alerts.length > 0 && (
          <Section title="Alerts">
            <div className="panel-alerts"><AlertList alerts={alerts} /></div>
          </Section>
        )}

        {d.manualOnly && (
          <p className="callout" style={{ marginTop: 16 }}>
            <Icon name="info" />
            <span>
              You added this device by MAC address, but no switch currently sees it.
              {d.switchId && ` Check that it is powered on and connected to ${d.switchId}${d.port ? ` ${d.port}` : ''}.`}
            </span>
          </p>
        )}

        {isServer(d) && (
          <Section title="Reachability">
            {!h ? (
              <p className="muted">Waiting for the first ping…</p>
            ) : h.status === 'no-ip' ? (
              <p className="callout">
                <Icon name="info" />
                <span>
                  This server cannot be pinged because its IP is unknown.{' '}
                  <button className="btn-link" type="button" onClick={() => actions.openEditor(d.mac)}>Add its IP</button> to monitor it.
                </span>
              </p>
            ) : (
              <div className="stack">
                <Facts rows={[
                  ['Ping status', <Pill level={health.level} label={health.label} icon={health.icon} />],
                  ['Pinged address', <span className="mono">{h.ip}</span>],
                  ['Response time', h.status === 'up' && h.rttMs != null ? `${h.rttMs < 1 ? '<1' : Math.round(h.rttMs)} ms` : '—'],
                  [h.status === 'down' ? 'Down for' : 'Up for', fmtDuration(secondsSince(h.changedAt))],
                  ['Last reply', h.lastUpAt ? `${fmtAgo(secondsSince(h.lastUpAt))} (${new Date(h.lastUpAt).toLocaleTimeString()})` : 'None yet'],
                  ['Last check', fmtAgo(secondsSince(h.checkedAt))],
                ]} />
                <PingHistory history={h.history} />
                <p className="field-hint">Pinged every 10 s from the dashboard server; marked down after 2 missed replies in a row.</p>
              </div>
            )}
          </Section>
        )}

        <Section title="Connection">
          <Facts rows={[
            ['IP address', d.ip ? <WithCopy text={d.ip} label="IP address" /> : <span className="muted">Not known</span>],
            ['MAC address', <WithCopy text={d.mac} label="MAC address" />],
            ['Switch', sw
              ? <button className="btn-link" type="button" onClick={() => actions.openSwitch(sw.id)}>{sw.id}</button>
              : d.switchId ?? 'Not behind a FortiSwitch'],
            ['Port', d.port ? <button className="btn-link mono" type="button" onClick={showPort}>{d.port}</button> : '—'],
            ['VLAN', d.vlan ?? '—'],
            ['FortiGate interface', d.interface ?? '—'],
            ['Last seen', d.manualOnly ? 'Not detected' : d.lastSeenSecondsAgo != null ? `${fmtAgo(d.lastSeenSecondsAgo)} (${fmtInt(d.lastSeenSecondsAgo)}s)` : '—'],
            ['Switch health', swStatus ? <Pill level={swStatus.level} label={swStatus.label} /> : '—'],
          ]} />
        </Section>

        <Section title="Classification">
          <Facts rows={[
            ['Type', KIND_LABEL[d.custom?.kind] ?? 'Device'],
            ['Operating system', d.custom?.os ? `${d.custom.os} (set by you)` : d.os ?? 'Not detected'],
            d.custom?.name && ['Display name', `${d.custom.name} (set by you)`],
            d.custom?.notes && ['Notes', <span style={{ whiteSpace: 'pre-wrap' }}>{d.custom.notes}</span>, { wide: true }],
            d.custom && ['Last edited', new Date(d.custom.updatedAt).toLocaleString()],
          ]} />
        </Section>

        <Section title={`IP addresses · ${d.ipCandidates.length}`}>
          {d.ipCandidates.length ? (
            <div className="stack">
              <table className="table simple-table">
                <thead>
                  <tr>{['IP address', 'Learned from', 'ARP age'].map((t) => <th key={t} scope="col" className="plain">{t}</th>)}</tr>
                </thead>
                <tbody>
                  {d.ipCandidates.map((c, i) => (
                    <tr key={c.ip} className="empty-row">
                      <td><span className="mono">{c.ip}</span>{i === 0 && <span className="more">Primary</span>}</td>
                      <td>{c.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}</td>
                      <td>{c.arpAgeSeconds != null ? fmtAgo(c.arpAgeSeconds).replace(' ago', '') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.ipCandidates.length > 1 && (
                <p className="callout">
                  <Icon name="info" />
                  <span>More than one IP is known for this MAC. The primary is the most recent ARP entry; the others may be stale.</span>
                </p>
              )}
            </div>
          ) : (
            <p className="callout">
              <Icon name="info" />
              <span>
                The FortiGate has not seen IP traffic from this device. It is probably on a VLAN routed by another device, or only talks at layer 2.
                {' '}You can set its IP with <button className="btn-link" type="button" onClick={() => actions.openEditor(d.mac)}>Edit</button>.
              </span>
            </p>
          )}
        </Section>

        {d.port && d.switchId && (
          <Section title="Same port">
            <button className="btn" type="button" onClick={showPort}>
              <Icon name="devices" />Show all devices on {d.switchId} {d.port}
            </button>
          </Section>
        )}
      </>
    ),
  };
}
