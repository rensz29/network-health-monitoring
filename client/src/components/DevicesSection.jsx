import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVE_SECONDS, IDLE_SECONDS, isServer, osFamily, osLabel } from '../lib/model.js';
import { fmtAgo, fmtInt, plural } from '../lib/format.js';
import { filterCounts, filterDevices, normalizeNeedle } from '../lib/devices.js';
import { Icon } from './Icon.jsx';
import { ACTIVITY, ActivityBadge, Highlight } from './ui.jsx';

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: 'lastSeen', label: 'Status' },
  { key: 'ip', label: 'IP address' },
  { key: 'hostname', label: 'Hostname' },
  { key: 'mac', label: 'MAC address', className: 'col-mac' },
  { key: 'vendor', label: 'Vendor', className: 'col-vendor' },
  { key: 'switch', label: 'Switch', className: 'col-switch' },
  { key: 'port', label: 'Port', className: 'col-port' },
  { key: 'vlan', label: 'VLAN', className: 'col-vlan num' },
  { key: 'lastSeen', label: 'Last seen', className: 'col-seen num', id: 'seen' },
];

const ACTIVITY_HINT = {
  all: 'Every device',
  active: `Seen in the last ${ACTIVE_SECONDS / 60} minutes`,
  idle: `Last seen ${ACTIVE_SECONDS / 60}–${IDLE_SECONDS / 60} minutes ago`,
  inactive: `Not seen for over ${IDLE_SECONDS / 3600} hour`,
};

function scopeLabel({ scope, servers }) {
  const what = servers ? 'Servers' : 'Devices';
  if (scope === 'all') return `All ${what.toLowerCase()} the FortiGate knows about`;
  if (scope === 'direct') return `${what} seen directly by the FortiGate, not behind a switch`;
  if (scope.startsWith('sw:')) return `${what} on ${scope.slice(3)}`;
  return `${what} on every managed FortiSwitch`;
}

/** Search box with local state, committed to the URL filters after a short pause in typing. */
function SearchBox({ value, onCommit, inputRef }) {
  const [text, setText] = useState(value);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return undefined;
    const id = setTimeout(() => commitRef.current(text), 120);
    return () => clearTimeout(id);
  }, [text, value]);

  return (
    <label className="search">
      <Icon name="search" />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search IP, MAC, hostname, vendor…"
        aria-label="Search devices"
        autoComplete="off"
        spellCheck="false"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.stopPropagation();
            setText('');
            onCommit('');
          }
        }}
      />
      <kbd aria-hidden="true">/</kbd>
    </label>
  );
}

function DeviceRow({ d, needle, selected, onOpen }) {
  const extra = d.ipCandidates.length - 1;
  const name = d.name || d.hostname;
  const muted = (text = '—') => <span className="muted">{text}</span>;
  return (
    <tr
      tabIndex={0}
      aria-selected={selected || undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <td><ActivityBadge device={d} /></td>
      <td>
        {d.ip ? (
          <>
            <span className="mono"><Highlight text={d.ip} needle={needle} /></span>
            {extra > 0 && <span className="more" title={d.ipCandidates.slice(1).map((c) => c.ip).join(', ')}>+{extra}</span>}
          </>
        ) : muted('No IP')}
      </td>
      <td title={d.name && d.hostname ? `Detected hostname: ${d.hostname}` : name ?? ''}>
        {name ? <Highlight text={name} needle={needle} /> : muted()}
        {d.custom && <Icon name="pencil" className="custom-mark" />}
        {isServer(d) && <span className="os-tag" data-os={osFamily(d)?.toLowerCase() ?? 'other'}>{osLabel(d, 'Server')}</span>}
      </td>
      <td className="col-mac mono"><Highlight text={d.mac} needle={needle} /></td>
      <td className="col-vendor" title={d.vendor ?? ''}>{d.vendor ? <Highlight text={d.vendor} needle={needle} /> : muted()}</td>
      <td className="col-switch">
        {d.switchId
          ? <Highlight text={d.switchId} needle={needle} />
          : <span className="sub">{d.interface ? `FortiGate · ${d.interface}` : 'FortiGate'}</span>}
      </td>
      <td className="col-port mono">{d.port ? <Highlight text={d.port} needle={needle} /> : muted()}</td>
      <td className="col-vlan num">{d.vlan ?? muted()}</td>
      <td className="col-seen num" title={d.lastSeenSecondsAgo != null ? `${fmtInt(d.lastSeenSecondsAgo)} seconds ago` : ''}>
        {fmtAgo(d.lastSeenSecondsAgo)}
      </td>
    </tr>
  );
}

export function DevicesSection({ network, idx, route, actions, searchRef, ref }) {
  const switchIds = useMemo(() => network.switches.map((s) => s.id), [network]);
  // A bookmarked switch that no longer exists falls back to "all switches".
  const filters = useMemo(() => {
    const known = route.filters.scope === 'switches' || route.filters.scope === 'all' || route.filters.scope === 'direct'
      || switchIds.includes(route.filters.scope.replace(/^sw:/, ''));
    return known ? route.filters : { ...route.filters, scope: 'switches' };
  }, [route.filters, switchIds]);

  // idx.devices = detected devices with the user's customisations applied (and manually added ones).
  const rows = useMemo(() => filterDevices(idx.devices, filters, route.sort), [idx, filters, route.sort]);
  const counts = useMemo(() => filterCounts(idx.devices, filters, switchIds), [idx, filters, switchIds]);
  const needle = normalizeNeedle(filters.q);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(route.page, pages);
  const start = (page - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const openMac = route.open?.type === 'device' ? route.open.id : null;

  return (
    <section className="card" id="devices" ref={ref} aria-labelledby="devices-title">
      <header className="card-header">
        <div>
          <h2 id="devices-title">Connected devices</h2>
          <p className="card-sub">{scopeLabel(filters)}</p>
        </div>
        <button className="btn" type="button" onClick={() => actions.exportCsv(rows)}>
          <Icon name="download" />Export CSV
        </button>
      </header>

      <div className="filters" role="search">
        <SearchBox value={filters.q} onCommit={(q) => actions.setFilter({ q })} inputRef={searchRef} />

        <select className="select" aria-label="Switch" value={filters.scope} onChange={(e) => actions.setFilter({ scope: e.target.value, vlan: '', port: '' })}>
          <option value="switches">All switches ({fmtInt(counts.scope.switches)})</option>
          <option value="all">Everything ({fmtInt(counts.scope.all)})</option>
          <optgroup label="Switch">
            {switchIds.map((id) => <option key={id} value={`sw:${id}`}>{id} ({fmtInt(counts.scope[`sw:${id}`])})</option>)}
          </optgroup>
          <option value="direct">Not behind a switch ({fmtInt(counts.scope.direct)})</option>
        </select>

        <select className="select" aria-label="VLAN" value={filters.vlan} onChange={(e) => actions.setFilter({ vlan: e.target.value })}>
          <option value="">All VLANs</option>
          {counts.vlans.map(([vlan, n]) => <option key={vlan} value={String(vlan)}>VLAN {vlan} ({fmtInt(n)})</option>)}
        </select>

        <div className="seg" role="group" aria-label="Activity">
          {['all', 'active', 'idle', 'inactive'].map((key) => (
            <button key={key} type="button" title={ACTIVITY_HINT[key]} aria-pressed={filters.activity === key} onClick={() => actions.setFilter({ activity: key })}>
              {key === 'all' ? 'All' : ACTIVITY[key].label}
              <span className="seg-count">{fmtInt(counts.activity[key])}</span>
            </button>
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={filters.hasIp} onChange={(e) => actions.setFilter({ hasIp: e.target.checked })} /> With IP only
        </label>
        <label className="check" title="Devices you added as servers">
          <input type="checkbox" checked={filters.servers} onChange={(e) => actions.setFilter({ servers: e.target.checked })} /> Servers only
        </label>

        {filters.port && (
          <div className="chips">
            <span className="chip">
              Port {filters.port}
              <button type="button" aria-label={`Remove port ${filters.port} filter`} onClick={() => actions.setFilter({ port: '' })}>
                <Icon name="x" />
              </button>
            </span>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = route.sort.key === col.key;
                return (
                  <th
                    key={col.id ?? col.key}
                    scope="col"
                    className={col.className}
                    aria-sort={active ? (route.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" onClick={() => actions.setSort(col.key)}>
                      {col.label}
                      <Icon name={active ? `sort-${route.sort.dir}` : 'sort'} className="sort-icon" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.length ? (
              slice.map((d) => (
                <DeviceRow key={d.mac} d={d} needle={needle} selected={d.mac === openMac} onOpen={() => actions.openDevice(d.mac)} />
              ))
            ) : (
              <tr className="empty-row">
                <td colSpan={COLUMNS.length}>
                  <div className="empty">
                    <Icon name="search" />
                    <strong>No devices match these filters</strong>
                    <span>Try a different search, or clear the filters.</span>
                    <button className="btn" type="button" onClick={() => actions.showDevices({ scope: filters.scope })}>Clear filters</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="table-footer">
        <span className="muted">
          {rows.length > 0 && `Showing ${fmtInt(start + 1)}–${fmtInt(start + slice.length)} of ${plural(rows.length, 'device')}`}
        </span>
        <div className="pager">
          <button className="icon-btn" type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => actions.setPage(page - 1)}>
            <Icon name="chevron-left" />
          </button>
          <span>Page {page} of {pages}</span>
          <button className="icon-btn" type="button" aria-label="Next page" disabled={page >= pages} onClick={() => actions.setPage(page + 1)}>
            <Icon name="chevron-right" />
          </button>
        </div>
      </footer>
    </section>
  );
}
