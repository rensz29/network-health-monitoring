import { useCallback, useEffect, useState } from 'react';

/** Browser fullscreen (the Fullscreen API) for the whole page. */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Must be called from a click/keypress: browsers only allow fullscreen on a user gesture.
  const enter = useCallback(() => {
    if (!document.fullscreenElement && document.fullscreenEnabled) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  }, []);
  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  return { isFullscreen, supported: Boolean(document.fullscreenEnabled), enter, exit };
}

/**
 * Keep the screen on while `active` (a wall display shouldn't go to sleep). Browsers allow
 * this only on https or localhost; elsewhere it silently does nothing.
 */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release();
      } catch {
        // Not allowed here (insecure origin, battery saver...): the display may sleep.
      }
    };
    // The lock is dropped whenever the tab is hidden; take it again when it comes back.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

/** True after `ms` without mouse movement (used to hide the cursor on a wall display). */
export function useIdle(ms, active) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [ms, active]);
  return active && idle;
}
