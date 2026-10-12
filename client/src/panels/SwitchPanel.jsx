import { Icon } from '../components/Icon.jsx';
import { ROLE_LABEL } from '../components/Infrastructure.jsx';
import { ServerGrid } from '../components/Servers.jsx';
import { tipProps, useTooltip } from '../components/Tooltip.jsx';
import { AlertList, Facts, Meter, Rated, Section } from '../components/ui.jsx';
import { fmtBps, fmtDuration, fmtInt, fmtSpeed, plural } from '../lib/format.js';
import { nodeName, pathFromRoot, switchStatus } from '../lib/model.js';
import { DeviceBreakdown, DownlinkSection, PanelHeader } from './shared.jsx';

function UplinkSection({ sw, link, network, idx, actions }) {
  const path = pathFromRoot(idx, sw.id);
  const utilPct = link.utilization == null ? null : link.utilization * 100;
  const linkAlerts = (idx.alertsByTarget.get(sw.id) ?? []).filter((a) => a.target.linkId === link.id);

  return (
    <Section title="Uplink">
      <div className="stack">
        <div className="crumbs">
          <button className="btn-link" type="button" onClick={actions.openGateway}>{network.gateway.hostname}</button>
          {path.map((id) => (
            <span key={id} style={{ display: 'contents' }}>
              <Icon name="chevron-right" />
              {id === sw.id
                ? <strong>{id}</strong>
                : <button className="btn-link" type="button" onClick={() => actions.openSwitch(id)}>{id}</button>}
            </span>
          ))}
        </div>
        {linkAlerts.length > 0 && <div className="panel-alerts"><AlertList alerts={linkAlerts} /></div>}
        <Facts rows={[
          ['Ports', <span className="mono">{nodeName(network, link.a.node)} {link.a.port} ⇄ {link.b.port}</span>, { wide: true }],
          ['Link', `${link.up ? 'Up' : 'Down'} · ${link.kind === 'fortilink' ? 'FortiLink' : 'Inter-switch link'}`],
          ['Speed', link.capableMbps && link.speedMbps < link.capableMbps
            ? <Rated rating="warning">{fmtSpeed(link.speedMbps)} (capable of {fmtSpeed(link.capableMbps)})</Rated>
            : fmtSpeed(link.speedMbps)],
          ['Upstream', link.rate ? fmtBps(link.rate.upstreamBps) : 'Measuring…'],
          ['Downstream', link.rate ? fmtBps(link.rate.downstreamBps) : 'Measuring…'],
          ['Errors since boot', <Rated rating={link.errors ? 'warning' : null}>{fmtInt(link.errors)}</Rated>],
          ['Drops since boot', fmtInt(link.drops)],
        ]} />
        {utilPct != null && <Meter label="Utilization" value={utilPct} rating={utilPct >= 80 ? 'warning' : null} />}
      </div>
    </Section>
  );
}

/** Port map laid out like the hardware: odd ports on top, even below, in blocks of 12. */
function Faceplate({ sw, idx, actions }) {
  const tooltip = useTooltip();
  const groups = [];
  for (let i = 0; i < sw.ports.length; i += 12) groups.push(sw.ports.slice(i, i + 12));

  return (
    <div>
      <div className="faceplate" role="group" aria-label={`${sw.id} ports`}>
        {groups.map((group) => (
          <div key={group[0].name} className="port-group">
            {group.map((p) => {
              const count = idx.portCounts.get(`${sw.id}:${p.name}`) ?? 0;
              return (
                <button
                  key={p.name}
                  className="port"
                  type="button"
                  data-state={p.peer ? 'uplink' : p.up ? 'up' : 'down'}
                  aria-label={`${p.name}, ${p.up ? 'up' : 'down'}${p.peer ? `, link to ${p.peer.node}` : ''}, ${count} devices`}
                  onClick={() => actions.showDevices({ scope: `sw:${sw.id}`, port: p.name })}
                  {...tipProps(tooltip, () => (
                    <>
                      <strong>{p.name}</strong>
                      <span>{p.up ? `Up · ${fmtSpeed(p.speedMbps)}` : 'Down'}</span>
                      {p.peer && <span>⇄ {p.peer.kind === 'fortilink' ? 'FortiGate' : p.peer.node} {p.peer.port}</span>}
                      {p.vlan && <span>VLAN {p.vlan}</span>}
                      <span>{count ? `${plural(count, 'device')} · click to list` : 'No devices'}</span>
                    </>
                  ))}
                >
                  {p.name.replace(/^port/, '')}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i data-state="up" />Up</span>
        <span><i data-state="down" />Down</span>
        <span><i data-state="uplink" />Uplink / FortiLink</span>
      </div>
    </div>
  );
}

export function switchPanel(sw, { network, idx, actions }) {
  const status = switchStatus(sw, idx);
  const hl = sw.health;
  const link = sw.uplink && idx.linkById.get(sw.uplink.linkId);
  const alerts = (idx.alertsByTarget.get(sw.id) ?? []).filter((a) => !a.target.linkId);
  const stats = idx.statsFor(sw.id);
  const servers = idx.serversFor(sw.id);
  const sub = [ROLE_LABEL[sw.role] && `${ROLE_LABEL[sw.role]} switch`, sw.model, sw.serial].filter(Boolean).join(' · ');

  return {
    key: `switch:${sw.id}`,
    header: <PanelHeader icon="switch" title={sw.id} sub={sub} status={status} />,
    body: (
      <>
        {alerts.length > 0 && <Section title="Alerts"><div className="panel-alerts"><AlertList alerts={alerts} /></div></Section>}
        <Section title="Health">
          <div className="stack">
            {sw.online && <Meter label="CPU" value={hl?.cpu?.value} rating={hl?.cpu?.rating} />}
            {sw.online && <Meter label="Memory" value={hl?.memory?.value} rating={hl?.memory?.rating} />}
            <Facts rows={[
              ['Management IP', sw.ip ? <span className="mono">{sw.ip}</span> : '—'],
              ['Firmware', sw.firmware],
              ['Uptime', fmtDuration(hl?.uptimeSeconds)],
              ['Temperature', hl?.temperature ? <Rated rating={hl.temperature.rating}>{Math.round(hl.temperature.value)}°C</Rated> : '—'],
              ['Fan', hl?.fan ? <Rated rating={hl.fan.rating}>{hl.fan.value}</Rated> : '—'],
              ['Ports up', `${sw.portsUp} of ${sw.ports.length}`],
              ['FortiGate status', sw.status],
            ]} />
          </div>
        </Section>
        {link && <UplinkSection sw={sw} link={link} network={network} idx={idx} actions={actions} />}
        <DownlinkSection nodeId={sw.id} idx={idx} actions={actions} />
        {sw.ports.length > 0 && <Section title="Ports"><Faceplate sw={sw} idx={idx} actions={actions} /></Section>}
        <Section title={`Servers · ${servers.length}`}>
          <div className="stack">
            {servers.length > 0 ? <ServerGrid servers={servers} actions={actions} /> : <p className="muted">No servers on this switch yet.</p>}
            <div>
              <button className="btn btn-sm" type="button" onClick={() => actions.openAdd(sw.id)}>
                <Icon name="plus" />Add server to this switch
              </button>
            </div>
          </div>
        </Section>
        <Section title="Connected devices">
          <DeviceBreakdown stats={stats} onShow={() => actions.showDevices({ scope: `sw:${sw.id}` })} showLabel={`Show ${plural(stats.total, 'device')}`} />
        </Section>
      </>
    ),
  };
}
