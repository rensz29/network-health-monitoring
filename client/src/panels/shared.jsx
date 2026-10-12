import { Icon, sevIcon } from '../components/Icon.jsx';
import { Pill } from '../components/ui.jsx';
import { fmtBps, fmtInt, fmtSpeed } from '../lib/format.js';
import { switchStatus } from '../lib/model.js';
import { Section } from '../components/ui.jsx';

export function PanelHeader({ icon, title, sub, status, extra }) {
  return (
    <div className="panel-head">
      <span className="node-icon lg"><Icon name={icon} /></span>
      <div className="panel-title">
        <h2 id="drawer-title">{title}</h2>
        <p className="panel-sub">{sub}</p>
      </div>
      {extra}
      {status && <Pill level={status.level} label={status.label} icon={status.icon} />}
    </div>
  );
}

/** Links from `nodeId` down to the switches it feeds. */
export function DownlinkSection({ nodeId, idx, actions }) {
  const links = idx.downlinks.get(nodeId) ?? [];
  if (!links.length) return null;
  return (
    <Section title={`Downlinks · ${links.length}`}>
      <div className="link-list">
        {links.map((l) => {
          const child = idx.switchById.get(l.b.node);
          const level = child ? switchStatus(child, idx).level : l.health;
          return (
            <button key={l.id} type="button" className="link-item" data-sev={level} onClick={() => actions.openSwitch(l.b.node)}>
              {level === 'good' ? <Icon name="switch" /> : <Icon name={sevIcon(level)} className="sev-icon" />}
              <span className="grow">
                <strong>{l.b.node}</strong>
                <span>
                  {l.a.port} ⇄ {l.b.port} · {fmtSpeed(l.speedMbps)}
                  {l.rate && ` · ↓ ${fmtBps(l.rate.downstreamBps)}`}
                </span>
              </span>
              <Icon name="chevron-right" />
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/** Totals plus a devices-by-VLAN bar list, with a button to list them in the table. */
export function DeviceBreakdown({ stats, onShow, showLabel }) {
  const vlans = [...stats.vlans.entries()].sort((a, b) => b[1] - a[1]);
  const other = vlans.slice(6).reduce((sum, [, n]) => sum + n, 0);
  const rows = other ? [...vlans.slice(0, 6), ['Other', other]] : vlans;
  const max = Math.max(1, ...rows.map(([, n]) => n));

  return (
    <div className="stack">
      <div className="mini-stats">
        <div className="mini-stat"><span>Total</span><strong>{fmtInt(stats.total)}</strong></div>
        <div className="mini-stat"><span>Active</span><strong>{fmtInt(stats.active)}</strong></div>
        <div className="mini-stat"><span>With IP</span><strong>{fmtInt(stats.withIp)}</strong></div>
      </div>
      {rows.length > 0 && (
        <div className="bars" role="list" aria-label="Devices by VLAN">
          {rows.map(([vlan, n]) => (
            <div key={vlan} className="bar-row" role="listitem">
              <span className="bar-label">{vlan === 'Other' ? 'Other' : `VLAN ${vlan}`}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></span>
              <span className="bar-value">{fmtInt(n)}</span>
            </div>
          ))}
        </div>
      )}
      {stats.total > 0 && (
        <div>
          <button className="btn btn-primary" type="button" onClick={onShow}><Icon name="devices" />{showLabel}</button>
        </div>
      )}
    </div>
  );
}
