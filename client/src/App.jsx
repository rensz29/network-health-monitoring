import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Drawer } from './components/Drawer.jsx';
import { ErrorBanner } from './components/Overview.jsx';
import { useToast } from './components/Toasts.jsx';
import { useTooltip } from './components/Tooltip.jsx';
import { TopBar } from './components/TopBar.jsx';
import { useDashboardData } from './hooks/useDashboardData.js';
import { useFullscreen } from './hooks/useFullscreen.js';
import { DEFAULT_FILTERS, useHashState } from './hooks/useHashState.js';
import { useRouter } from './hooks/useRouter.js';
import { useTheme } from './hooks/useTheme.js';
import { downloadCsv } from './lib/devices.js';
import { plural } from './lib/format.js';
import { displayName } from './lib/model.js';
import { DashboardPage, DashboardSkeleton } from './pages/DashboardPage.jsx';
import { DevicesPage, DevicesSkeleton } from './pages/DevicesPage.jsx';
import { WallLoading, WallPage } from './pages/WallPage.jsx';
import { devicePanel } from './panels/DevicePanel.jsx';
import { addPanel, editPanel } from './panels/EditPanel.jsx';
import { gatewayPanel } from './panels/GatewayPanel.jsx';
import { switchPanel } from './panels/SwitchPanel.jsx';

const TITLES = { dashboard: 'Network Health', devices: 'Devices · Network Health' };

export default function App() {
  const toast = useToast();
  const tooltip = useTooltip();
  const { theme, toggle: toggleTheme } = useTheme();
  const { page, navigate } = useRouter();
  const [route, setRoute] = useHashState(page);
  const fullscreen = useFullscreen();
  const infraRef = useRef(null);
  const serversRef = useRef(null);
  const devicesRef = useRef(null);
  const searchRef = useRef(null);
  const focusSearchOnArrival = useRef(false);

  // Toast when something changes between refreshes, so a glance at the corner is enough.
  const onUpdate = useCallback((prev, next) => {
    const before = new Map(prev.switches.map((s) => [s.id, s]));
    for (const s of next.switches) {
      if (before.get(s.id)?.online === false && s.online) toast({ level: 'good', title: `${s.id} is back online` });
    }
    const key = (a) => `${a.target.id}|${a.title}`;
    const known = new Set(prev.alerts.map(key));
    for (const a of next.alerts) {
      if (a.severity === 'critical' && !known.has(key(a))) toast({ level: 'critical', title: a.title, detail: a.detail });
    }
  }, [toast]);

  // Pop-up when a server you added stops answering pings, and when it comes back.
  const onHealthChange = useCallback((prev, next, idx) => {
    for (const [mac, check] of next) {
      const before = prev.get(mac)?.status;
      if (!before || before === check.status) continue;
      const device = idx?.deviceByMac.get(mac);
      const name = device ? displayName(device) : mac;
      if (check.status === 'down') toast({ level: 'critical', title: `${name} is down`, detail: `No reply to ping from ${check.ip}` });
      else if (check.status === 'up' && before === 'down') toast({ level: 'good', title: `${name} is back up`, detail: `${check.ip} is answering pings again` });
    }
  }, [toast]);

  const data = useDashboardData({ onUpdate, onHealthChange });
  const { network, devices, idx, refresh, togglePause, saveCustom, deleteCustom } = data;

  const actions = useMemo(() => {
    const openPanel = (open) => {
      tooltip.hide();
      setRoute((r) => ({ ...r, open }));
    };
    return {
      goTo: (to) => {
        tooltip.hide();
        setRoute((r) => ({ ...r, open: null }));
        navigate(to);
      },
      openSwitch: (id) => openPanel({ type: 'switch', id }),
      openGateway: () => openPanel({ type: 'gateway', id: 'fortigate' }),
      openDevice: (mac) => openPanel({ type: 'device', id: mac }),
      openEditor: (mac) => openPanel({ type: 'edit', id: mac }),
      openPromote: (mac) => openPanel({ type: 'promote', id: mac }),
      /** Add a server/device; `switchId` preselects the switch (null = let the user choose). */
      openAdd: (switchId) => openPanel({ type: 'add', id: switchId ?? 'any' }),
      /** Save a customisation, then show the device with it applied. Errors reach the form. */
      saveDevice: async (mac, fields) => {
        const entry = await saveCustom(mac, fields);
        toast({ level: 'good', title: 'Saved', detail: `${entry.name ?? mac} is updated on the dashboard` });
        openPanel({ type: 'device', id: mac });
      },
      removeCustom: async (mac) => {
        await deleteCustom(mac);
        toast({ level: 'good', title: 'Customization removed', detail: `${mac} is back to what the FortiGate detects` });
        setRoute((r) => ({ ...r, open: { type: 'device', id: mac } }));
      },
      closePanel: () => {
        tooltip.hide();
        setRoute((r) => ({ ...r, open: null }));
      },
      /** Open the Devices page with exactly these filters. */
      showDevices: (filters) => {
        tooltip.hide();
        setRoute((r) => ({ ...r, filters: { ...DEFAULT_FILTERS, ...filters }, page: 1, open: null }));
        navigate('devices');
        window.scrollTo({ top: 0 });
      },
      setFilter: (patch) => setRoute((r) => ({ ...r, filters: { ...r.filters, ...patch }, page: 1 })),
      setSort: (key) => setRoute((r) => ({
        ...r,
        sort: r.sort.key === key ? { key, dir: r.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
      })),
      setPage: (n) => {
        setRoute((r) => ({ ...r, page: n }));
        devicesRef.current?.scrollIntoView({ block: 'start' });
      },
      setView: (view) => setRoute((r) => ({ ...r, view })),
      setServerOs: (serverOs) => setRoute((r) => ({ ...r, serverOs })),
      setMapServers: (mapServers) => setRoute((r) => ({ ...r, mapServers })),
      /** Display mode for a wall monitor; also asks the browser for fullscreen (needs a click/key). */
      enterDisplay: () => {
        fullscreen.enter();
        tooltip.hide();
        setRoute((r) => ({ ...r, wall: true, open: null }));
        navigate('dashboard');
      },
      exitDisplay: () => {
        fullscreen.exit();
        setRoute((r) => ({ ...r, wall: false }));
      },
      scrollToInfra: () => infraRef.current?.scrollIntoView({ behavior: 'smooth' }),
      scrollToServers: () => serversRef.current?.scrollIntoView({ behavior: 'smooth' }),
      exportCsv: (rows) => {
        downloadCsv(rows);
        toast({ level: 'good', title: 'Export ready', detail: `${plural(rows.length, 'device')} saved as CSV` });
      },
    };
  }, [setRoute, navigate, toast, tooltip, saveCustom, deleteCustom, fullscreen.enter, fullscreen.exit]);

  // Leaving browser fullscreen (Esc / F11) also leaves display mode.
  const wasFullscreen = useRef(fullscreen.isFullscreen);
  useEffect(() => {
    if (wasFullscreen.current && !fullscreen.isFullscreen && route.wall) setRoute((r) => ({ ...r, wall: false }));
    wasFullscreen.current = fullscreen.isFullscreen;
  }, [fullscreen.isFullscreen, route.wall, setRoute]);

  // Resolve the open panel against the latest data; it may have disappeared since.
  const panel = useMemo(() => {
    if (!route.open || !network) return null;
    const ctx = { network, devices, idx, actions };
    const { type, id } = route.open;
    if (type === 'switch' && idx.switchById.has(id)) return switchPanel(idx.switchById.get(id), ctx);
    if (type === 'gateway') return gatewayPanel(ctx);
    if (type === 'device' && idx.deviceByMac.has(id)) return devicePanel(idx.deviceByMac.get(id), ctx);
    if (type === 'edit' && idx.deviceByMac.has(id)) return editPanel(idx.deviceByMac.get(id), ctx);
    if (type === 'promote' && idx.deviceByMac.has(id)) return editPanel(idx.deviceByMac.get(id), ctx, { asServer: true });
    if (type === 'add') return addPanel(id === 'any' ? null : id, ctx);
    return null;
  }, [route.open, network, devices, idx, actions]);

  useEffect(() => {
    // A panel whose item aged out of the data (e.g. a device) is dropped from the URL.
    if (route.open && network && !panel) setRoute((r) => ({ ...r, open: null }));
  }, [route.open, network, panel, setRoute]);

  useEffect(() => {
    document.title = TITLES[page];
    if (page === 'devices' && focusSearchOnArrival.current && searchRef.current) {
      focusSearchOnArrival.current = false;
      searchRef.current.focus();
    }
  }, [page, network]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && route.open) {
        actions.closePanel();
        return;
      }
      if (e.key === 'Escape' && route.wall) {
        actions.exitDisplay();
        return;
      }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        // Search lives on the Devices page; jump there first if needed.
        e.preventDefault();
        if (page === 'devices') searchRef.current?.focus();
        else {
          focusSearchOnArrival.current = true;
          actions.goTo('devices');
        }
      } else if (e.key === 'r' || e.key === 'R') {
        refresh({ manual: true });
      } else if (e.key === 'p' || e.key === 'P') {
        togglePause();
      } else if (e.key === 'f' || e.key === 'F') {
        if (route.wall) actions.exitDisplay();
        else actions.enterDisplay();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [route.open, route.wall, page, actions, refresh, togglePause]);

  const drawer = (
    <Drawer open={Boolean(panel)} panelKey={panel?.key} header={panel?.header} onClose={actions.closePanel}>
      {panel?.body}
    </Drawer>
  );

  if (page === 'dashboard' && route.wall) {
    if (!network) return <WallLoading error={data.error} />;
    return (
      <>
        <WallPage data={data} actions={actions} fullscreen={fullscreen} />
        {drawer}
      </>
    );
  }

  let content = null;
  if (network) {
    content = page === 'devices'
      ? <DevicesPage data={data} route={route} actions={actions} devicesRef={devicesRef} searchRef={searchRef} />
      : <DashboardPage data={data} route={route} actions={actions} infraRef={infraRef} serversRef={serversRef} />;
  } else if (!data.error) {
    content = page === 'devices' ? <DevicesSkeleton /> : <DashboardSkeleton />;
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <TopBar data={data} page={page} navigate={actions.goTo} theme={theme} onToggleTheme={toggleTheme} onDisplayMode={actions.enterDisplay} />

      {/* A manual refresh dims the current view; it never blanks it. */}
      <main id="main" className={`page${data.loading && data.manual && network ? ' is-refreshing' : ''}`}>
        <ErrorBanner error={data.error} loadedAt={data.loadedAt} onRetry={() => refresh({ manual: true })} />
        {content}
        {network && (
          <p className="shortcuts muted">
            Shortcuts: <kbd>/</kbd> search devices · <kbd>R</kbd> refresh · <kbd>P</kbd> pause · <kbd>F</kbd> display mode · <kbd>Esc</kbd> close panel
          </p>
        )}
      </main>

      {drawer}
    </>
  );
}
