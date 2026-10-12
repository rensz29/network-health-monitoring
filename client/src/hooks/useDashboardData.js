import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from '../lib/api.js';
import { derive, REFRESH_MS } from '../lib/model.js';

const EMPTY = { network: null, devices: null, custom: [], health: new Map(), idx: null, loadedAt: null };
// Ping results are in the dashboard server's memory, so polling them is cheap.
const HEALTH_POLL_MS = 10_000;
const toHealthMap = (res) => new Map(res.checks.map((c) => [c.mac, c]));
const customUrl = (mac) => `/api/custom-devices/${encodeURIComponent(mac)}`;

/**
 * Loads /api/network, /api/devices and the user's device customisations, refreshing every
 * REFRESH_MS. Polling pauses while the tab is hidden (catching up when it is shown again) or
 * when the user pauses it. `onUpdate(previousNetwork, nextNetwork)` runs after each refresh.
 * saveCustom / deleteCustom apply edits immediately, without waiting for the next refresh.
 */
export function useDashboardData({ onUpdate, onHealthChange } = {}) {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState({ loading: false, manual: false, error: null });
  const [paused, setPaused] = useState(false);
  const [nextRefreshAt, setNextRefreshAt] = useState(null);

  const dataRef = useRef(EMPTY);
  const pausedRef = useRef(false);
  const inflightRef = useRef(false);
  const timerRef = useRef(null);
  const refreshRef = useRef(null);
  // Bumped by every edit, so a refresh that started before the edit doesn't undo it.
  const customVersionRef = useRef(0);
  const onUpdateRef = useRef(onUpdate);
  const onHealthChangeRef = useRef(onHealthChange);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onHealthChangeRef.current = onHealthChange;
  });

  const commit = useCallback((next) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current);
    if (pausedRef.current || document.hidden) {
      setNextRefreshAt(null);
      return;
    }
    setNextRefreshAt(Date.now() + REFRESH_MS);
    timerRef.current = setTimeout(() => refreshRef.current(), REFRESH_MS);
  }, []);

  const refresh = useCallback(async ({ manual = false } = {}) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    clearTimeout(timerRef.current);
    setNextRefreshAt(null);
    setStatus((s) => ({ ...s, loading: true, manual }));
    const customVersion = customVersionRef.current;
    try {
      const [network, devices, fetchedCustom, health] = await Promise.all([
        requestJson('/api/network'),
        requestJson('/api/devices?offSwitch=true'),
        // Customisations and ping results are overlays: if they fail to load, keep the last copy.
        requestJson('/api/custom-devices').then((r) => r.devices, () => dataRef.current.custom),
        requestJson('/api/health-checks').then(toHealthMap, () => dataRef.current.health),
      ]);
      const custom = customVersionRef.current === customVersion ? fetchedCustom : dataRef.current.custom;
      const previous = dataRef.current.network;
      const previousHealth = dataRef.current.health;
      const idx = derive(network, devices, custom, health);
      commit({ network, devices, custom, health, idx, loadedAt: Date.now() });
      setStatus({ loading: false, manual: false, error: null });
      if (previous) {
        onUpdateRef.current?.(previous, network);
        onHealthChangeRef.current?.(previousHealth, health, idx);
      }
    } catch (error) {
      setStatus({ loading: false, manual: false, error });
    } finally {
      inflightRef.current = false;
      schedule();
    }
  }, [schedule, commit]);
  // Declared before the mount effect below, so the ref is set when that effect runs.
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const applyCustom = useCallback((change) => {
    customVersionRef.current++;
    const current = dataRef.current;
    const custom = change(current.custom);
    commit({ ...current, custom, idx: current.network ? derive(current.network, current.devices, custom, current.health) : null });
  }, [commit]);

  const pollHealth = useCallback(async () => {
    if (pausedRef.current || document.hidden || !dataRef.current.network) return;
    try {
      const health = toHealthMap(await requestJson('/api/health-checks'));
      const current = dataRef.current;
      const idx = derive(current.network, current.devices, current.custom, health);
      commit({ ...current, health, idx });
      onHealthChangeRef.current?.(current.health, health, idx);
    } catch {
      // Keep the last results; the main refresh reports connection problems.
    }
  }, [commit]);
  useEffect(() => {
    const id = setInterval(pollHealth, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [pollHealth]);

  /** Create or replace the customisation for `mac`; resolves with the saved entry. */
  const saveCustom = useCallback(async (mac, fields) => {
    const entry = await requestJson(customUrl(mac), { method: 'PUT', body: fields });
    applyCustom((list) => [...list.filter((c) => c.mac !== entry.mac), entry]);
    return entry;
  }, [applyCustom]);

  const deleteCustom = useCallback(async (mac) => {
    try {
      await requestJson(customUrl(mac), { method: 'DELETE' });
    } catch (err) {
      if (err.status !== 404) throw err; // already gone is fine
    }
    applyCustom((list) => list.filter((c) => c.mac !== mac));
  }, [applyCustom]);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    const stale = dataRef.current.loadedAt && Date.now() - dataRef.current.loadedAt > REFRESH_MS;
    if (!pausedRef.current && stale) refreshRef.current();
    else schedule();
  }, [schedule]);

  useEffect(() => {
    refreshRef.current();
    // Don't poll a hidden tab; catch up as soon as it becomes visible again.
    const onVisibility = () => {
      if (document.hidden) return schedule();
      const { loadedAt } = dataRef.current;
      if (!pausedRef.current && (!loadedAt || Date.now() - loadedAt >= REFRESH_MS)) refreshRef.current();
      else schedule();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(timerRef.current);
    };
  }, [schedule]);

  return { ...data, ...status, paused, nextRefreshAt, refresh, togglePause, saveCustom, deleteCustom };
}
