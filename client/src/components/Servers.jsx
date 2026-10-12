import { useState } from 'react';
import { fmtAgo, fmtInt, plural } from '../lib/format.js';
import { activityOf, displayName, osFamily, osLabel, switchStatus } from '../lib/model.js';
import { Icon } from './Icon.jsx';
import { ROLE_LABEL } from './Infrastructure.jsx';
import { buttonProps, Pill, ServerStatus } from './ui.jsx';

const OS_ICON = { Windows: 'windows', Linux: 'terminal' };
const OS_FILTERS = [['all', 'All'], ['windows', 'Windows'], ['linux', 'Linux'], ['other', 'Other']];

/** 'windows' | 'linux' | 'other' - used for the OS filter and the icon color. */
const osKey = (d) => osFamily(d)?.toLowerCase() ?? 'other';

export function ServerTile({ device, onOpen }) {
  const family = osFamily(device);
  const name = displayName(device);
  const where = [device.port, device.vlan != null && `VLAN ${device.vlan}`].filter(Boolean).join(' · ');
  const seen = device.health?.status === 'down'
    ? `not answering ping since ${device.health.lastUpAt ? new Date(device.health.lastUpAt).toLocaleTimeString() : 'it was added'}`
    : device.manualOnly ? 'not detected on any switch' : `last seen ${fmtAgo(device.lastSeenSecondsAgo)}`;
  return (
    <article
      className={`server-tile${device.manualOnly ? ' is-missing' : ''}${device.health?.status === 'down' ? ' is-down' : ''}`}
      data-act={activityOf(device)}
      title={`${name}${device.name && device.hostname ? ` (detected as ${device.hostname})` : ''} · ${seen}`}
      {...buttonProps(onOpen, `${name}, ${osLabel(device, 'server')}. Open details`)}
    >
      <span className="os-icon" data-os={osKey(device)}><Icon name={OS_ICON[family] ?? 'server'} /></span>
      <div className="server-text">
        <span className="server-name-row">
          <strong className="server-name">{name}</strong>
          {device.custom && <Icon name="pencil" className="custom-mark" />}
        </span>
        {/* Without a name or hostname the IP is already the title, so don't repeat it. */}
        <span className="server-meta">
          {osLabel(device, 'Server')} · {name !== device.ip ? <span className="mono">{device.ip ?? 'No IP'}</span> : 'No hostname'}
        </span>
        {name !== device.mac && <span className="server-mac mono" aria-label={`MAC address ${device.mac}`}>{device.mac}</span>}
        <span className="server-sub"><ServerStatus device={device} />{where && ` · ${where}`}</span>
      </div>
    </article>
  );
}

export function ServerGrid({ servers, actions }) {
  return (
    <div className="server-grid">
      {servers.map((d) => <ServerTile key={d.mac} device={d} onOpen={() => actions.openDevice(d.mac)} />)}
    </div>
  );
}

function ServerGroup({ sw, servers, idx, actions }) {
  const [collapsed, setCollapsed] = useState(false);
  const status = switchStatus(sw, idx);
  const active = servers.filter((d) => activityOf(d) === 'active').length;
  const down = servers.filter((d) => d.health?.status === 'down').length;
  const byOs = { windows: 0, linux: 0, other: 0 };
  for (const d of servers) byOs[osKey(d)]++;
  const mix = Object.entries(byOs).filter(([, n]) => n > 0);
  const bodyId = `servers-${sw.id}`;

  return (
    <div className="server-group">
      <div className="server-group-head">
        <button
          type="button"
          className="icon-btn sm"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? `Show servers on ${sw.id}` : `Hide servers on ${sw.id}`}
          onClick={() => setCollapsed((c) => !c)}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} />
        </button>
        <button type="button" className="server-group-title" title="Open switch details" onClick={() => actions.openSwitch(sw.id)}>
          <span className="node-icon"><Icon name="switch" /></span>
          <strong>{sw.id}</strong>
          {sw.role && <span className="role-tag">{ROLE_LABEL[sw.role]}</span>}
        </button>
        <Pill level={status.level} label={status.label} />
        <span className="server-group-stats">
          {plural(servers.length, 'server')} · {down ? <strong className="down-count">{down} down</strong> : `${fmtInt(active)} active`}
          {mix.length > 1 && ` · ${mix.map(([os, n]) => `${n} ${os === 'other' ? 'other' : OS_FILTERS.find(([k]) => k === os)[1]}`).join(', ')}`}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => actions.openAdd(sw.id)} aria-label={`Add a server to ${sw.id}`}>
          <Icon name="plus" />Add
        </button>
      </div>
      {!collapsed && <div id={bodyId}><ServerGrid servers={servers} actions={actions} /></div>}
    </div>
  );
}

export function ServersSection({ network, idx, osFilter, actions, ref }) {
  const switches = [...idx.treeOrder.map((id) => idx.switchById.get(id)), ...network.switches.filter((s) => !s.role)];
  const all = switches.flatMap((s) => idx.serversFor(s.id));
  const counts = { all: all.length, windows: 0, linux: 0, other: 0 };
  for (const d of all) counts[osKey(d)]++;
  const filters = OS_FILTERS.filter(([key]) => key !== 'other' || counts.other > 0 || osFilter === 'other');
  const shown = (d) => osFilter === 'all' || osKey(d) === osFilter;
  const groups = switches.map((sw) => ({ sw, servers: idx.serversFor(sw.id).filter(shown) })).filter((g) => g.servers.length);
  const withoutServers = switches.filter((sw) => !idx.serversFor(sw.id).length);
  const direct = idx.serversFor(null);
  const osLabelText = OS_FILTERS.find(([key]) => key === osFilter)?.[1];

  return (
    <section className="card" ref={ref} aria-labelledby="servers-title">
      <header className="card-header">
        <div>
          <h2 id="servers-title">Servers by switch {all.length > 0 && <span className="count-badge">{all.length}</span>}</h2>
          <p className="card-sub">The servers you add, grouped by the switch they are connected to</p>
        </div>
        <div className="header-actions">
          <div className="seg" role="group" aria-label="Operating system">
            {filters.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={osFilter === key} onClick={() => actions.setServerOs(key)}>
                {label}<span className="seg-count">{fmtInt(counts[key])}</span>
              </button>
            ))}
          </div>
          <button className="btn" type="button" onClick={() => actions.showDevices({ servers: true })}>
            <Icon name="devices" />View in device list
          </button>
          <button className="btn btn-primary" type="button" onClick={() => actions.openAdd(null)}>
            <Icon name="plus" />Add server
          </button>
        </div>
      </header>

      <div className="card-body servers-body">
        {groups.length ? (
          groups.map(({ sw, servers }) => <ServerGroup key={sw.id} sw={sw} servers={servers} idx={idx} actions={actions} />)
        ) : (
          <div className="empty">
            <Icon name="server" />
            <strong>{all.length ? `No ${osLabelText} servers` : 'No servers added yet'}</strong>
            <span>
              {all.length
                ? 'Choose another operating system above, or add a server.'
                : 'Add the servers you want to monitor: pick a device a switch already sees, or enter its MAC address.'}
            </span>
            <button className="btn btn-primary" type="button" onClick={() => actions.openAdd(null)}><Icon name="plus" />Add server</button>
          </div>
        )}

        {groups.length > 0 && (withoutServers.length > 0 || direct.length > 0) && (
          <div className="servers-notes">
            {withoutServers.length > 0 && (
              <p>
                <Icon name="info" />
                {/* One inline run of text, so the commas sit right after each name. */}
                <span>
                  No servers on{' '}
                  {withoutServers.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ', '}
                      <button className="btn-link" type="button" onClick={() => actions.openAdd(s.id)} title={`Add a server to ${s.id}`}>{s.id}</button>
                    </span>
                  ))}
                  <span className="muted"> · select one to add a server</span>
                </span>
              </p>
            )}
            {direct.length > 0 && (
              <p>
                <Icon name="info" />
                {plural(direct.length, 'server')} you added {direct.length === 1 ? 'is' : 'are'} not behind a switch.{' '}
                <button className="btn-link" type="button" onClick={() => actions.showDevices({ scope: 'direct', servers: true })}>View them</button>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
