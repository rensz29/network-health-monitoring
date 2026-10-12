import { fmtAgo, fmtClockSeconds, fmtInt, fmtPct, plural } from '../lib/format.js';
import { gatewayStatus, osFamily } from '../lib/model.js';
import { Icon, sevIcon } from './Icon.jsx';
import { AlertList } from './ui.jsx';

export function ErrorBanner({ error, loadedAt, onRetry }) {
  if (!error) return null;
  const stale = loadedAt
    ? `Showing data from ${fmtAgo((Date.now() - loadedAt) / 1000)} (${fmtClockSeconds(loadedAt)}).`
    : 'No data has loaded yet.';
  return (
    <div className="error-banner" role="alert">
      <Icon name="x-octagon" />
      <div className="grow">
        <strong>Can’t reach the dashboard API. </strong>
        <span>{error.message}. {stale}</span>
      </div>
      <button className="btn" type="button" onClick={onRetry}><Icon name="refresh" />Retry now</button>
    </div>
  );
}

export function StatusBanner({ network, idx, loadedAt }) {
  const critical = idx.alerts.filter((a) => a.severity === 'critical');
  const warnings = idx.alerts.filter((a) => a.severity === 'warning');
  const level = critical.length ? 'critical' : warnings.length ? 'warning' : 'good';

  const title = critical.length
    ? `${critical.length} critical ${critical.length === 1 ? 'issue needs' : 'issues need'} attention`
    : warnings.length
      ? `Operational with ${plural(warnings.length, 'warning')}`
      : 'All systems operational';

  const online = network.switches.filter((s) => s.online).length;
  const linksUp = network.links.filter((l) => l.up).length;
  const devices = network.switches.reduce((sum, s) => sum + idx.statsFor(s.id).total, 0);

  return (
    <section className="status-banner" data-sev={level} aria-live="polite">
      <span className="status-icon"><Icon name={sevIcon(level)} /></span>
      <div className="status-text">
        <h1>{title}</h1>
        <p>
          {online} of {plural(network.switches.length, 'switch', 'switches')} online · {linksUp} of{' '}
          {plural(network.links.length, 'uplink')} up · {plural(devices, 'device')} on switches
        </p>
      </div>
      <span className="status-meta">Checked {fmtClockSeconds(loadedAt)}</span>
    </section>
  );
}

function Kpi({ label, icon, value, suffix, sub, subLevel, onClick, title }) {
  return (
    <button className="kpi" type="button" onClick={onClick} title={title}>
      <span className="kpi-label"><Icon name={icon} />{label}</span>
      <span className="kpi-value">{value}{suffix && <small>{suffix}</small>}</span>
      <span className="kpi-sub" data-sev={subLevel ?? undefined}>
        {subLevel && <Icon name={sevIcon(subLevel)} />}
        {sub}
      </span>
    </button>
  );
}

export function KpiTiles({ network, idx, actions }) {
  const { switches, links, gateway } = network;
  const online = switches.filter((s) => s.online).length;
  const healthyLinks = links.filter((l) => l.health === 'good').length;
  const linkIssues = links.length - healthyLinks;
  const totals = switches.reduce((acc, s) => {
    const st = idx.statsFor(s.id);
    return { total: acc.total + st.total, active: acc.active + st.active, withIp: acc.withIp + st.withIp };
  }, { total: 0, active: 0, withIp: 0 });
  const servers = switches.flatMap((s) => idx.serversFor(s.id));
  const windows = servers.filter((d) => osFamily(d) === 'Windows').length;
  const linux = servers.filter((d) => osFamily(d) === 'Linux').length;
  const other = servers.length - windows - linux;
  const down = servers.filter((d) => d.health?.status === 'down').length;
  const up = servers.filter((d) => d.health?.status === 'up').length;
  const gw = gatewayStatus(network, idx);

  return (
    <section className="kpis" aria-label="Summary">
      <Kpi
        label="Switches online" icon="switch" value={online} suffix={`/ ${switches.length}`}
        sub={online === switches.length ? 'All switches online' : `${switches.length - online} offline`}
        subLevel={online === switches.length ? 'good' : 'critical'}
        onClick={actions.scrollToInfra}
      />
      <Kpi
        label="Healthy uplinks" icon="link" value={healthyLinks} suffix={`/ ${links.length}`}
        sub={linkIssues ? `${plural(linkIssues, 'uplink')} need${linkIssues === 1 ? 's' : ''} attention` : 'No errors or slow links'}
        subLevel={links.some((l) => l.health === 'critical') ? 'critical' : linkIssues ? 'warning' : 'good'}
        onClick={actions.scrollToInfra}
      />
      <Kpi
        label="Servers" icon="server" value={fmtInt(servers.length)}
        sub={!servers.length
          ? 'None added yet'
          : down || up
            ? `${down ? `${fmtInt(down)} down · ` : ''}${fmtInt(up)} up`
            : `${fmtInt(windows)} Windows · ${fmtInt(linux)} Linux${other ? ` · ${fmtInt(other)} other` : ''}`}
        subLevel={down ? 'critical' : up ? 'good' : null}
        onClick={actions.scrollToServers} title="Jump to servers by switch"
      />
      <Kpi
        label="Connected devices" icon="devices" value={fmtInt(totals.total)}
        sub={`${fmtInt(totals.active)} active · ${fmtInt(totals.withIp)} with an IP`}
        onClick={() => actions.showDevices({})} title="Open the device list"
      />
      <Kpi
        label="FortiGate load" icon="shield" value={fmtPct(gateway.cpu?.value)} suffix="CPU"
        sub={`Memory ${fmtPct(gateway.memory?.value)} · ${fmtInt(gateway.sessions?.value)} sessions`}
        subLevel={gw.level === 'good' ? null : gw.level}
        onClick={actions.openGateway} title="Open FortiGate details"
      />
    </section>
  );
}

export function AlertsPanel({ network, devices, idx, actions }) {
  const { alerts } = idx;
  const dataWarnings = [...network.warnings, ...devices.warnings].map((w) => ({ severity: 'info', title: 'Partial data', detail: w }));
  const open = (a) => {
    if (a.target.type === 'gateway') actions.openGateway();
    else if (a.target.type === 'device') actions.openDevice(a.target.id);
    else actions.openSwitch(a.target.id);
  };

  return (
    <section className="card" aria-labelledby="alerts-title">
      <header className="card-header">
        <div>
          <h2 id="alerts-title">
            Alerts {alerts.length > 0 && <span className="count-badge">{alerts.length}</span>}
          </h2>
          <p className="card-sub">Select an alert to open the affected device</p>
        </div>
      </header>
      <div className="alerts-body">
        {!alerts.length && !dataWarnings.length ? (
          <div className="empty" data-sev="good">
            <Icon name="check-circle" />
            <strong>No active alerts</strong>
            <span>Every switch and uplink is healthy.</span>
          </div>
        ) : (
          <>
            <AlertList alerts={alerts} onSelect={open} />
            <AlertList alerts={dataWarnings} />
          </>
        )}
      </div>
    </section>
  );
}
