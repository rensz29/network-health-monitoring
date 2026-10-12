import { useEffect, useState } from 'react';
import { pageFor } from './useRouter.js';

export const DEFAULT_FILTERS = { q: '', scope: 'switches', vlan: '', activity: 'all', hasIp: false, servers: false, port: '' };
export const DEFAULT_SORT = { key: 'switch', dir: 'asc' };
const SERVER_OS_FILTERS = ['windows', 'linux', 'other'];

function parse(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const open = p.get('open');
  const sep = open?.indexOf(':') ?? -1;
  return {
    // Devices page
    filters: {
      q: p.get('q') ?? '',
      scope: p.get('scope') ?? DEFAULT_FILTERS.scope,
      vlan: p.get('vlan') ?? '',
      activity: ['active', 'idle', 'inactive'].includes(p.get('activity')) ? p.get('activity') : 'all',
      hasIp: p.get('ip') === '1',
      servers: p.get('servers') === '1',
      port: p.get('port') ?? '',
    },
    sort: { key: p.get('sort') ?? DEFAULT_SORT.key, dir: p.get('dir') === 'desc' ? 'desc' : 'asc' },
    page: Math.max(1, Number(p.get('page')) || 1),
    // Dashboard page
    view: p.get('view') === 'table' ? 'table' : 'cards',
    serverOs: SERVER_OS_FILTERS.includes(p.get('os')) ? p.get('os') : 'all',
    mapServers: p.get('mapsrv') !== '0',
    wall: p.get('wall') === '1',
    // Both
    open: sep > 0 ? { type: open.slice(0, sep), id: open.slice(sep + 1) } : null,
  };
}

/** Only the keys that belong to `page` go into its URL. */
function serialize(state, page) {
  const p = new URLSearchParams();
  if (page === 'devices') {
    const f = state.filters;
    if (f.q) p.set('q', f.q);
    if (f.scope !== DEFAULT_FILTERS.scope) p.set('scope', f.scope);
    if (f.vlan) p.set('vlan', f.vlan);
    if (f.activity !== 'all') p.set('activity', f.activity);
    if (f.hasIp) p.set('ip', '1');
    if (f.servers) p.set('servers', '1');
    if (f.port) p.set('port', f.port);
    if (state.sort.key !== DEFAULT_SORT.key || state.sort.dir !== DEFAULT_SORT.dir) {
      p.set('sort', state.sort.key);
      p.set('dir', state.sort.dir);
    }
    if (state.page > 1) p.set('page', state.page);
  } else {
    if (state.view !== 'cards') p.set('view', state.view);
    if (state.serverOs !== 'all') p.set('os', state.serverOs);
    if (!state.mapServers) p.set('mapsrv', '0');
    if (state.wall) p.set('wall', '1');
  }
  if (state.open) p.set('open', `${state.open.type}:${state.open.id}`);
  return p.toString();
}

/** Re-read the URL, replacing only the current page's keys (the other page keeps its state). */
function mergeFromUrl(prev, page) {
  const next = parse(window.location.hash);
  return page === 'devices'
    ? { ...prev, filters: next.filters, sort: next.sort, page: next.page, open: next.open }
    : { ...prev, view: next.view, serverOs: next.serverOs, mapServers: next.mapServers, wall: next.wall, open: next.open };
}

/**
 * View state (filters, sort, page, dashboard view, open panel) mirrored into location.hash
 * so any view can be bookmarked or shared. Uses replaceState, so filtering doesn't flood
 * history; each page only writes its own keys.
 */
export function useHashState(page) {
  const [state, setState] = useState(() => parse(window.location.hash));

  useEffect(() => {
    // Read the page from the URL itself: on Back/Forward this may run before the router re-renders.
    const onUrlChange = () => setState((prev) => mergeFromUrl(prev, pageFor(window.location.pathname)));
    window.addEventListener('hashchange', onUrlChange);
    window.addEventListener('popstate', onUrlChange);
    return () => {
      window.removeEventListener('hashchange', onUrlChange);
      window.removeEventListener('popstate', onUrlChange);
    };
  }, []);

  useEffect(() => {
    const hash = serialize(state, page);
    if (hash === window.location.hash.replace(/^#/, '')) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}${hash ? `#${hash}` : ''}`);
  }, [state, page]);

  return [state, setState];
}
