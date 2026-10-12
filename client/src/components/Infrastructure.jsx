import { fmtBps, fmtDuration, fmtInt, fmtPct, fmtSpeed } from '../lib/format.js';
import { gatewayStatus, nodeName, switchStatus } from '../lib/model.js';
import { Icon, sevIcon } from './Icon.jsx';
import { LineChart } from './LineChart.jsx';
import { tipProps, useTooltip } from './Tooltip.jsx';
import { buttonProps, Meter, Pill } from './ui.jsx';

export const ROLE_LABEL = { core: 'Core', access: 'Access' };

function Rates({ rate }) {
  if (!rate) return <span className="muted">Measuring traffic…</span>;
  return (
    <span className="rates" title={`Average over the last ${rate.windowSeconds}s`}>
      <span><Icon name="arrow-up" />{fmtBps(rate.upstreamBps)}</span>
      <span><Icon name="arrow-down" />{fmtBps(rate.downstreamBps)}</span>
    </span>
  );
}

function NodeStats({ items }) {
  return (
    <dl className="node-stats">
      {items.map(({ label, value, rating }) => (
        <div key={label} data-sev={rating ?? undefined}>
          <dt>{label}</dt>
          <dd>{value}{rating && rating !== 'good' && <Icon name={sevIcon(rating)} />}</dd>
        </div>
      ))}
    </dl>
  );
}

function SwitchCard({ sw, network, idx, actions }) {
  const status = switchStatus(sw, idx);
  const stats = idx.statsFor(sw.id);
  const link = sw.uplink && idx.linkById.get(sw.uplink.linkId);
  const hl = sw.health;

  return (
    <article
      className={`node-card${sw.online ? '' : ' is-offline'}`}
      data-sev={status.level}
      {...buttonProps(() => actions.openSwitch(sw.id), `${sw.id}, ${status.label}. Open details`)}
    >
      <div className="node-head">
        <span className="node-icon"><Icon name="switch" /></span>
        <div className="node-title">
          <strong title={sw.id}>{sw.id}</strong>
          <span className="node-meta">
            {sw.role && <span className="role-tag">{ROLE_LABEL[sw.role]}</span>}
            {sw.model} · <span className="mono">{sw.ip ?? sw.serial}</span>
          </span>
        </div>
        <Pill level={status.level} label={status.label} />
      </div>

      {sw.online ? (
        <>
          <div className="node-meters">
            <Meter label="CPU" value={hl?.cpu?.value} rating={hl?.cpu?.rating} />
            <Meter label="Memory" value={hl?.memory?.value} rating={hl?.memory?.rating} />
          </div>
          <NodeStats items={[
            { label: 'Temperature', value: hl?.temperature ? `${Math.round(hl.temperature.value)}°C` : '—', rating: hl?.temperature?.rating },
            { label: 'Uptime', value: fmtDuration(hl?.uptimeSeconds) },
            { label: 'Ports up', value: `${sw.portsUp} / ${sw.ports.length}` },
          ]} />
          <div className="node-foot">
            <div className="node-foot-row">
              <Icon name="devices" />
              <span>
                <strong>{fmtInt(stats.total)}</strong> devices · {fmtInt(stats.active)} active
                {stats.servers > 0 && <> · <strong>{fmtInt(stats.servers)}</strong> {stats.servers === 1 ? 'server' : 'servers'}</>}
              </span>
            </div>
            {link && (
              <>
                <div className="node-foot-row" data-sev={link.health}>
                  {link.health === 'good' ? <Icon name="link" /> : <Icon name={sevIcon(link.health)} className="sev-icon" />}
                  <span>Uplink to <strong>{nodeName(network, sw.uplink.parent)}</strong></span>
                </div>
                <div className="node-foot-row node-foot-detail">
                  <span className="mono">{sw.uplink.parentPort} ⇄ {sw.uplink.port}</span>
                  <span>· {fmtSpeed(link.speedMbps)} ·</span>
                  <Rates rate={link.rate} />
                  {link.errors > 0 && <span>· {fmtInt(link.errors)} errors</span>}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="node-offline">
          FortiGate reports this switch as “{sw.status}”. Health data will return when it reconnects.
        </p>
      )}
    </article>
  );
}

function GatewayCard({ network, idx, actions }) {
  const g = network.gateway;
  const status = gatewayStatus(network, idx);
  const peak = Math.max(0, ...(g.cpu?.history ?? []).map((p) => p[1]));

  return (
    <article className="node-card node-gateway" data-sev={status.level} {...buttonProps(actions.openGateway, `${g.hostname}, ${status.label}. Open details`)}>
      <div className="node-head">
        <span className="node-icon"><Icon name="shield" /></span>
        <div className="node-title">
          <strong>{g.hostname}</strong>
          <span className="node-meta">
            <span className="role-tag">Gateway</span>
            {[g.model, g.version].filter(Boolean).join(' · ')}
          </span>
        </div>
        <Pill level={status.level} label={status.label} />
      </div>
      <div className="node-meters">
        <Meter label="CPU" value={g.cpu?.value} rating={g.cpu?.rating} />
        <Meter label="Memory" value={g.memory?.value} rating={g.memory?.rating} />
      </div>
      <div className="spark-row">
        <div className="spark-label"><span>CPU · last hour</span><span>peak {fmtPct(peak)}</span></div>
        <LineChart points={g.cpu?.history} label="CPU" max={100} height={32} spark />
      </div>
      <NodeStats items={[
        { label: 'Sessions', value: fmtInt(g.sessions?.value) },
        { label: 'Direct devices', value: fmtInt(idx.statsFor(null).total) },
        { label: 'Build', value: g.build ?? '—' },
      ]} />
    </article>
  );
}

function Connector({ link, network }) {
  const tooltip = useTooltip();
  return (
    <div
      className="connector"
      data-sev={link.health}
      tabIndex={0}
      {...tipProps(tooltip, () => (
        <>
          <strong>{nodeName(network, link.a.node)} {link.a.port} ⇄ {link.b.node} {link.b.port}</strong>
          <span>{fmtSpeed(link.speedMbps)} · {link.up ? 'up' : 'down'} · {fmtInt(link.errors)} errors</span>
          {link.rate && <span>Upstream {fmtBps(link.rate.upstreamBps)} · downstream {fmtBps(link.rate.downstreamBps)}</span>}
        </>
      ))}
    >
      <div className="connector-badge">
        <strong>
          {link.health !== 'good' && <Icon name={sevIcon(link.health)} className="sev-icon" />}
          {fmtSpeed(link.speedMbps)} FortiLink
        </strong>
        <span className="mono">{link.a.port} ⇄ {link.b.port}</span>
        {link.rate && <span>↑ {fmtBps(link.rate.upstreamBps)}</span>}
      </div>
    </div>
  );
}

function Tier({ label, children }) {
  return (
    <div className="tier">
      <div className="tier-label">{label}</div>
      {children}
    </div>
  );
}

function InfraCards({ network, idx, actions }) {
  const ordered = idx.treeOrder.map((id) => idx.switchById.get(id));
  const core = ordered.filter((s) => s.role === 'core');
  const access = ordered.filter((s) => s.role === 'access');
  const detached = network.switches.filter((s) => !s.role);
  const props = { network, idx, actions };

  return (
    <>
      <Tier label="Gateway & core">
        <div className="backbone">
          <GatewayCard {...props} />
          {core.map((sw) => (
            <ConnectedCore key={sw.id} sw={sw} link={idx.linkById.get(sw.uplink.linkId)} {...props} />
          ))}
        </div>
      </Tier>
      {access.length > 0 && (
        <Tier label={`Access switches · ${access.length}`}>
          <div className="node-grid">{access.map((sw) => <SwitchCard key={sw.id} sw={sw} {...props} />)}</div>
        </Tier>
      )}
      {detached.length > 0 && (
        <Tier label={`Not connected · ${detached.length}`}>
          <div className="node-grid">{detached.map((sw) => <SwitchCard key={sw.id} sw={sw} {...props} />)}</div>
        </Tier>
      )}
    </>
  );
}

function ConnectedCore({ sw, link, ...props }) {
  return (
    <>
      <Connector link={link} network={props.network} />
      <SwitchCard sw={sw} {...props} />
    </>
  );
}

/** Accessible table twin of the cards view. */
function InfraTable({ network, idx, actions }) {
  const g = network.gateway;
  const gs = gatewayStatus(network, idx);
  const switches = [...idx.treeOrder.map((id) => idx.switchById.get(id)), ...network.switches.filter((s) => !s.role)];
  const headers = ['Name', 'Role', 'Status', 'IP', 'CPU', 'Memory', 'Temp', 'Uptime', 'Ports up', 'Devices', 'Servers', 'Uplink'];
  const numeric = new Set(['CPU', 'Memory', 'Temp', 'Ports up', 'Devices', 'Servers']);
  const rowProps = (onOpen) => ({ tabIndex: 0, onClick: onOpen, onKeyDown: (e) => e.key === 'Enter' && onOpen() });

  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="table simple-table">
        <thead>
          <tr>{headers.map((t) => <th key={t} scope="col" className={`plain${numeric.has(t) ? ' num' : ''}`}>{t}</th>)}</tr>
        </thead>
        <tbody>
          <tr {...rowProps(actions.openGateway)}>
            <td>{g.hostname}</td><td>Gateway</td><td><Pill level={gs.level} label={gs.label} /></td><td>—</td>
            <td className="num">{fmtPct(g.cpu?.value)}</td><td className="num">{fmtPct(g.memory?.value)}</td>
            <td className="num">—</td><td>—</td><td className="num">—</td>
            <td className="num">{fmtInt(idx.statsFor(null).total)}</td>
            <td className="num">{fmtInt(idx.statsFor(null).servers)}</td><td>—</td>
          </tr>
          {switches.map((s) => {
            const st = switchStatus(s, idx);
            const link = s.uplink && idx.linkById.get(s.uplink.linkId);
            return (
              <tr key={s.id} {...rowProps(() => actions.openSwitch(s.id))}>
                <td className="mono">{s.id}</td>
                <td>{ROLE_LABEL[s.role] ?? '—'}</td>
                <td><Pill level={st.level} label={st.label} /></td>
                <td className="mono">{s.ip ?? '—'}</td>
                <td className="num">{fmtPct(s.health?.cpu?.value)}</td>
                <td className="num">{fmtPct(s.health?.memory?.value)}</td>
                <td className="num">{s.health?.temperature ? `${Math.round(s.health.temperature.value)}°C` : '—'}</td>
                <td>{fmtDuration(s.health?.uptimeSeconds)}</td>
                <td className="num">{s.online ? `${s.portsUp}/${s.ports.length}` : '—'}</td>
                <td className="num">{fmtInt(idx.statsFor(s.id).total)}</td>
                <td className="num">{fmtInt(idx.statsFor(s.id).servers)}</td>
                <td>
                  {link
                    ? `${nodeName(network, s.uplink.parent)} ${s.uplink.parentPort} · ${fmtSpeed(link.speedMbps)}${link.errors ? ` · ${fmtInt(link.errors)} errors` : ''}`
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Infrastructure({ network, idx, view, actions, ref }) {
  return (
    <section className="card" ref={ref} aria-labelledby="infra-title">
      <header className="card-header">
        <div>
          <h2 id="infra-title">Infrastructure health</h2>
          <p className="card-sub">FortiGate, core and access switches</p>
        </div>
        <div className="seg" role="group" aria-label="Infrastructure view">
          {['cards', 'table'].map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => actions.setView(v)}>
              {v === 'cards' ? 'Cards' : 'Table'}
            </button>
          ))}
        </div>
      </header>
      <div className="card-body">
        {view === 'table' ? <InfraTable network={network} idx={idx} actions={actions} /> : <InfraCards network={network} idx={idx} actions={actions} />}
      </div>
    </section>
  );
}
