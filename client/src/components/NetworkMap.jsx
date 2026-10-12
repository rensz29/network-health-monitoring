import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtBps, fmtInt, fmtPct, fmtSpeed, plural } from '../lib/format.js';
import { activityOf, displayName, gatewayStatus, nodeName, osFamily, serverHealth, switchStatus } from '../lib/model.js';
import { buildTopology, pathToRoot } from '../lib/topology.js';
import { Icon, sevIcon } from './Icon.jsx';
import { ROLE_LABEL } from './Infrastructure.jsx';
import { tipProps, useTooltip } from './Tooltip.jsx';
import { ACTIVITY, buttonProps, Pill } from './ui.jsx';

/** "Animate traffic" on/off, remembered on this screen (falls back to on if storage is blocked). */
function useAnimatePreference() {
  const [animate, setAnimate] = useState(() => {
    try {
      return localStorage.getItem('nh-map-animate') !== 'off';
    } catch {
      return true;
    }
  });
  const update = (on) => {
    setAnimate(on);
    try {
      localStorage.setItem('nh-map-animate', on ? 'on' : 'off');
    } catch {
      // Not remembered, but still applies for this visit.
    }
  };
  return [animate, update];
}

// Below this the labels get too small to read; the map scrolls sideways instead.
const MIN_SCALE = 0.62;
// On a wall monitor the map may grow to fill the screen, up to this zoom.
const MAX_DISPLAY_SCALE = 1.8;
const OS_ICON = { Windows: 'windows', Linux: 'terminal' };

const lineWidth = (link) => (!link ? 1.5 : link.speedMbps >= 10000 ? 4 : link.speedMbps >= 1000 ? 2.5 : 1.5);

const hasTraffic = (link) => Boolean(link?.up && link.rate && link.rate.upstreamBps + link.rate.downstreamBps > 0);
// A server's line flows when it answers pings (or, without ping data, was just seen on the switch).
const isLive = (d) => (d.health ? d.health.status === 'up' : !d.manualOnly && activityOf(d) === 'active');

const FLOW_PERIOD_MS = 1400; // must match the map-flow animation duration in styles.css

/**
 * Moving dashes along a path. Every flow starts in phase with one shared clock, so the flows
 * of several servers that share a trunk line move as a single stream.
 */
function FlowPath({ d, width }) {
  const [delay] = useState(() => -(performance.now() % FLOW_PERIOD_MS));
  return <path className="map-edge-flow" d={d} style={{ strokeWidth: width, animationDelay: `${delay}ms` }} aria-hidden="true" />;
}

function Edge({ edge, state, animate }) {
  const { link } = edge;
  return (
    <g className={`map-edge ${state}`} data-kind={edge.kind} data-sev={link?.health} data-down={link && !link.up ? '' : undefined}>
      <path className="map-edge-line" d={edge.path} style={{ strokeWidth: lineWidth(link) }} />
      {animate && hasTraffic(link) && <FlowPath d={edge.path} width={lineWidth(link)} />}
    </g>
  );
}

/** The branch into one server: red dashed when it is down, amber dashed when not on any switch. */
function ServerLine({ line, state, animate }) {
  const d = line.device;
  const down = d?.health?.status === 'down';
  const missing = Boolean(d?.manualOnly);
  return (
    <g className={`map-edge ${state}`} data-kind="server" data-sev={down ? 'critical' : missing ? 'warning' : undefined} data-down={down || missing ? '' : undefined}>
      <path className="map-edge-line" d={line.tick} style={{ strokeWidth: 1.5 }} />
      {animate && d && isLive(d) && <FlowPath d={line.flow} width={1.5} />}
    </g>
  );
}

function EdgeLabel({ edge, state, network, actions, tooltip }) {
  const { link, label } = edge;
  const child = edge.to.slice(3); // "sw:<id>"
  return (
    <button
      type="button"
      className={`map-link-label ${state}`}
      data-sev={link.health}
      style={{ left: label.x, top: label.y }}
      aria-label={`${link.kind === 'fortilink' ? 'FortiLink' : 'Uplink'} to ${child}: ${fmtSpeed(link.speedMbps)}, ${link.up ? 'up' : 'down'}`}
      onClick={() => actions.openSwitch(child)}
      {...tipProps(tooltip, () => (
        <>
          <strong>{nodeName(network, link.a.node)} {link.a.port} ⇄ {link.b.node} {link.b.port}</strong>
          <span>{link.kind === 'fortilink' ? 'FortiLink' : 'Inter-switch link'} · {fmtSpeed(link.speedMbps)} · {link.up ? 'up' : 'down'}</span>
          {link.rate && <span>↓ {fmtBps(link.rate.downstreamBps)} to the switch · ↑ {fmtBps(link.rate.upstreamBps)} to the FortiGate</span>}
          {link.utilization != null && <span>{Math.max(0.1, link.utilization * 100).toFixed(1)}% of {fmtSpeed(link.speedMbps)} in use</span>}
          <span>{fmtInt(link.errors)} errors since boot</span>
        </>
      ))}
    >
      <span className="map-link-row">
        {link.health !== 'good' && <Icon name={sevIcon(link.health)} className="sev-icon" />}
        <strong>{fmtSpeed(link.speedMbps)}</strong>
        <span className="mono">{link.a.port} ⇄ {link.b.port}</span>
      </span>
      {link.up && link.rate && (
        <span className="map-link-rates" title="Live throughput: ↓ towards the switch, ↑ towards the FortiGate">
          <span>↓ {fmtBps(link.rate.downstreamBps)}</span>
          <span>↑ {fmtBps(link.rate.upstreamBps)}</span>
        </span>
      )}
    </button>
  );
}

function ServerChip({ device, state, onFocus, onBlur, onOpen }) {
  const family = osFamily(device);
  const health = serverHealth(device);
  const act = device.manualOnly ? 'missing' : activityOf(device);
  // Ping status wins over the slower switch-table activity.
  const actLabel = health?.label ?? (device.manualOnly ? 'Not detected' : ACTIVITY[act].label);
  const actIcon = health?.icon ?? (act === 'missing' ? 'alert-triangle' : ACTIVITY[act].icon);
  const name = displayName(device);
  const down = device.health?.status === 'down';
  return (
    <div
      className={`map-chip ${state}${device.manualOnly ? ' is-missing' : ''}${down ? ' is-down' : ''}`}
      title={`${name} · ${device.os ?? 'Server'} · ${device.ip ?? 'no IP'} · ${device.port ?? ''} · ${actLabel}`}
      onPointerEnter={onFocus}
      onPointerLeave={onBlur}
      onFocus={onFocus}
      onBlur={onBlur}
      {...buttonProps(onOpen, `${name}, server on port ${device.port ?? 'unknown'}, ${actLabel}. Open details`)}
    >
      <span className="os-icon sm" data-os={family?.toLowerCase() ?? 'other'}><Icon name={OS_ICON[family] ?? 'server'} /></span>
      <span className="map-chip-text">
        <span className="map-chip-name">{name}</span>
        <span className="map-chip-sub mono">{[device.port, device.ip ?? (device.manualOnly ? 'not detected' : 'no IP')].filter(Boolean).join(' · ')}</span>
      </span>
      {/* Shape differs per state (dot / clock / dash / warning), so color is never the only cue. */}
      <span className="map-chip-act" data-act={act} data-health={health?.level ?? undefined} aria-hidden="true">
        <Icon name={actIcon} />
      </span>
    </div>
  );
}

function Node({ node, state, network, idx, actions, setFocus, chipState }) {
  const style = { left: node.x, top: node.y, width: node.w, height: node.h };
  const hover = { onPointerEnter: () => setFocus({ node: node.id }), onPointerLeave: () => setFocus(null), onFocus: () => setFocus({ node: node.id }), onBlur: () => setFocus(null) };

  if (node.type === 'gateway') {
    const g = node.gateway;
    const status = gatewayStatus(network, idx);
    return (
      <div className={`map-node map-gateway ${state}`} data-sev={status.level} style={style} {...hover} {...buttonProps(actions.openGateway, `${g.hostname}, FortiGate, ${status.label}. Open details`)}>
        <div className="map-node-head">
          <span className="node-icon"><Icon name="shield" /></span>
          <span className="map-node-title">
            <strong title={g.hostname}>{g.hostname}</strong>
            <span>{[g.model, g.version].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
        <div className="map-node-foot">
          <Pill level={status.level} label={status.label} />
          <span>CPU {fmtPct(g.cpu?.value)} · Mem {fmtPct(g.memory?.value)}</span>
        </div>
      </div>
    );
  }

  if (node.type === 'switch') {
    const { sw } = node;
    const status = switchStatus(sw, idx);
    const stats = idx.statsFor(sw.id);
    return (
      <div
        className={`map-node map-switch ${state}${sw.online ? '' : ' is-offline'}`}
        data-sev={status.level}
        style={style}
        {...hover}
        {...buttonProps(() => actions.openSwitch(sw.id), `${sw.id}, ${ROLE_LABEL[sw.role] ?? ''} switch, ${status.label}. Open details`)}
      >
        <div className="map-node-head">
          <span className="node-icon"><Icon name="switch" /></span>
          <span className="map-node-title">
            <strong title={sw.id}>{sw.id}</strong>
            <span>{sw.role && <span className="role-tag">{ROLE_LABEL[sw.role]}</span>}{sw.ip ? <span className="mono">{sw.ip}</span> : sw.model}</span>
          </span>
        </div>
        <div className="map-node-foot">
          <Pill level={status.level} label={status.label} />
          <span title={stats.servers ? plural(stats.servers, 'server') : undefined}>{sw.online ? plural(stats.total, 'device') : sw.status}</span>
        </div>
      </div>
    );
  }

  // Stack of servers under a switch, in one or more columns (each with its own trunk line).
  const items = node.servers.map((d) => (
    <ServerChip
      key={d.mac}
      device={d}
      state={chipState(node.id, d.mac)}
      onFocus={() => setFocus({ node: `srv:${d.mac}`, server: d.mac })}
      onBlur={() => setFocus(null)}
      onOpen={() => actions.openDevice(d.mac)}
    />
  ));
  if (node.more > 0) {
    items.push(
      <button key="more" type="button" className="map-chip map-chip-more" onClick={() => (node.switchId === 'direct' ? actions.showDevices({ scope: 'direct', servers: true }) : actions.openSwitch(node.switchId))}>
        +{node.more} more {node.more === 1 ? 'server' : 'servers'}
      </button>,
    );
  }
  const columns = Array.from({ length: node.cols }, (_, c) => items.slice(c * node.rows, (c + 1) * node.rows));
  return (
    <div className={`map-stack ${state}`} data-cols={node.cols} style={style} role="group" aria-label={`Servers on ${node.switchId === 'direct' ? 'the FortiGate' : node.switchId}`}>
      {columns.map((col, c) => <div key={c} className="map-stack-col">{col}</div>)}
    </div>
  );
}

function Legend({ animate, onAnimateChange }) {
  const line = (cls, width, dash) => (
    <svg width="30" height="10" aria-hidden="true">
      <line className={cls} x1="1" y1="5" x2="29" y2="5" style={{ strokeWidth: width, strokeDasharray: dash }} />
    </svg>
  );
  return (
    <div className="map-legend">
      <span>{line('lg-ok', 4)}10G link</span>
      <span>{line('lg-ok', 2.5)}1G link</span>
      <span>{line('lg-warning', 2.5)}<Icon name="alert-triangle" className="lg-icon-warning" />Errors or slow link</span>
      <span>{line('lg-critical', 2.5, '6 4')}<Icon name="x-octagon" className="lg-icon-critical" />Link down</span>
      <span>{line('lg-flow', 2.5, '2 6')}Traffic flowing / server connected</span>
      <span className="lg-chip"><i />Server not detected</span>
      <label className="check lg-toggle">
        <input type="checkbox" checked={animate} onChange={(e) => onAnimateChange(e.target.checked)} /> Animate traffic
      </label>
    </div>
  );
}

/**
 * `display` (wall monitor mode): the map fills its container in both directions, may scale
 * above 100%, wraps long server lists into columns, shows every server, and hides edit controls.
 */
export function NetworkMap({ network, idx, showServers, actions, display = false, ref }) {
  const tooltip = useTooltip();
  const [animate, setAnimate] = useAnimatePreference();
  const scrollRef = useRef(null);
  const [available, setAvailable] = useState(null); // { w, h } of the map area
  const [focus, setFocus] = useState(null); // { node, server? }
  const topo = useMemo(
    () => buildTopology(network, idx, display
      ? { showServers: true, maxStackRows: 4, maxServersPerStack: Infinity }
      : { showServers }),
    [network, idx, showServers, display],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    setAvailable({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver(([entry]) => setAvailable({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  let scale = 1;
  if (available?.w) {
    scale = display
      ? Math.max(0.4, Math.min(MAX_DISPLAY_SCALE, available.w / topo.width, available.h / topo.height))
      : Math.max(MIN_SCALE, Math.min(1, available.w / topo.width));
  }

  // Hovering/focusing something lights its path up to the FortiGate and dims the rest.
  const lit = useMemo(() => {
    if (!focus) return null;
    const set = pathToRoot(topo.parentOf, focus.node);
    if (focus.server) set.add(`srv:${focus.server}`);
    // A switch also lights the servers plugged into it.
    else if (focus.node.startsWith('sw:')) set.add(`stack:${focus.node.slice(3)}`);
    return set;
  }, [focus, topo]);
  const stateOf = (id) => (!lit ? '' : lit.has(id) ? 'lit' : 'dim');
  const edgeState = (e) => (!lit ? '' : lit.has(e.from) && lit.has(e.to) ? 'lit' : 'dim');
  const chipState = (stackId, mac) => (!lit ? '' : lit.has(`srv:${mac}`) || (!focus.server && lit.has(stackId)) ? 'lit' : 'dim');
  const serverLineState = (line) => (!lit ? '' : lit.has(line.id) || (!focus.server && lit.has(line.stack)) ? 'lit' : 'dim');
  const trunkState = (t) => {
    if (!lit) return '';
    return lit.has(t.from) && (lit.has(t.stack) || t.macs.some((m) => lit.has(`srv:${m}`))) ? 'lit' : 'dim';
  };

  const servers = idx.treeOrder.reduce((n, id) => n + idx.serversFor(id).length, 0);
  const core = network.switches.filter((s) => s.role === 'core').map((s) => s.id);
  const summary = `Network map. ${network.gateway.hostname} connects to ${core.join(', ') || 'no core switch'}; `
    + `${plural(network.switches.length, 'switch', 'switches')} and ${plural(servers, 'server')} in total. `
    + 'The same information is listed as text in the Infrastructure table and Servers by switch.';

  return (
    <section className={`card map-card${display ? ' is-display' : ''}`} ref={ref} aria-labelledby="map-title">
      <header className="card-header">
        <div>
          <h2 id="map-title">Network map</h2>
          {!display && <p className="card-sub">How the FortiGate, core, switches and your servers connect · hover to trace a path, select for details</p>}
        </div>
        {!display && (
          <div className="header-actions">
            <label className="check">
              <input type="checkbox" checked={showServers} onChange={(e) => actions.setMapServers(e.target.checked)} /> Show servers
            </label>
            <button className="btn btn-sm" type="button" onClick={() => actions.openAdd(null)}><Icon name="plus" />Add server</button>
          </div>
        )}
      </header>

      <div className="map-scroll" ref={scrollRef}>
        <div className="map-sizer" style={{ width: topo.width * scale, height: topo.height * scale }}>
          <div
            className={`map-canvas${lit ? ' has-focus' : ''}`}
            style={{ width: topo.width, height: topo.height, transform: `scale(${scale})` }}
            role="group"
            aria-label={summary}
          >
            {topo.detachedArea && (
              <div className="map-detached" style={{ left: topo.detachedArea.x, top: topo.detachedArea.y, width: topo.detachedArea.w, height: topo.detachedArea.h }}>
                <span>Not connected</span>
              </div>
            )}
            <svg className="map-links" width={topo.width} height={topo.height} aria-hidden="true">
              {topo.edges.map((e) => <Edge key={e.id} edge={e} state={edgeState(e)} animate={animate} />)}
              {topo.stackLines.map((t) => <path key={t.id} className={`map-trunk ${trunkState(t)}`} d={t.path} />)}
              {topo.serverLines.map((l) => <ServerLine key={l.id} line={l} state={serverLineState(l)} animate={animate} />)}
            </svg>
            {topo.edges.filter((e) => e.label).map((e) => (
              <EdgeLabel key={e.id} edge={e} state={edgeState(e)} network={network} actions={actions} tooltip={tooltip} />
            ))}
            {topo.nodes.map((n) => (
              <Node key={n.id} node={n} state={stateOf(n.id)} network={network} idx={idx} actions={actions} setFocus={setFocus} chipState={chipState} />
            ))}
          </div>
        </div>
      </div>

      {showServers && !display && servers === 0 && (
        <p className="map-hint">
          <Icon name="info" />No servers on the map yet. Servers you add appear under the switch they are plugged into.
          <button className="btn-link" type="button" onClick={() => actions.openAdd(null)}>Add a server</button>
        </p>
      )}
      <Legend animate={animate} onAnimateChange={setAnimate} />
    </section>
  );
}

