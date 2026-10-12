import { useNow } from '../hooks/useNow.js';
import { linkProps } from '../hooks/useRouter.js';
import { fmtAgo, fmtInt } from '../lib/format.js';
import { REFRESH_MS } from '../lib/model.js';
import { Icon } from './Icon.jsx';

export function liveState({ loading, error, paused, loadedAt }, now) {
  const since = loadedAt ? fmtAgo((now - loadedAt) / 1000) : null;
  if (loading) return ['loading', since ? `Refreshing… · updated ${since}` : 'Loading…'];
  if (error) return ['error', since ? `Connection problem · updated ${since}` : 'Connection problem'];
  if (paused) return ['paused', since ? `Paused · updated ${since}` : 'Paused'];
  return ['live', since ? `Live · updated ${since}` : 'Connecting…'];
}

/** "Live · updated 12s ago" with a colored dot; re-renders itself every second. */
export function LiveIndicator({ data }) {
  const now = useNow(1000);
  const [mode, label] = liveState(data, now);
  return (
    <div className="live" data-state={mode} role="status">
      <span className="live-dot" aria-hidden="true" />
      <span className="live-text">{label}</span>
    </div>
  );
}

export function TopBar({ data, page, navigate, theme, onToggleTheme, onDisplayMode }) {
  const gateway = data.network?.gateway;
  const deviceCount = data.devices?.devices.length;

  return (
    <header className={`topbar${data.loading ? ' is-loading' : ''}`}>
      <div className="topbar-inner">
        <a className="brand" {...linkProps('dashboard', navigate)}>
          <span className="brand-mark"><Icon name="pulse" /></span>
          <span className="brand-name">Network Health</span>
        </a>
        <nav className="nav-tabs" aria-label="Pages">
          <a {...linkProps('dashboard', navigate)} aria-current={page === 'dashboard' ? 'page' : undefined}>
            <Icon name="pulse" />Dashboard
          </a>
          <a {...linkProps('devices', navigate)} aria-current={page === 'devices' ? 'page' : undefined}>
            <Icon name="devices" />Devices
            {deviceCount != null && <span className="nav-count">{fmtInt(deviceCount)}</span>}
          </a>
        </nav>
        {gateway && (
          <div className="gateway-chip">
            <Icon name="shield" />
            <strong>{gateway.hostname}</strong>
            <span>{[gateway.model, gateway.version].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        <div className="topbar-actions">
          <LiveIndicator data={data} />
          <button
            className="icon-btn"
            type="button"
            aria-pressed={data.paused}
            aria-label={data.paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
            title={data.paused ? 'Resume auto-refresh (P)' : 'Pause auto-refresh (P)'}
            onClick={data.togglePause}
          >
            <Icon name={data.paused ? 'play' : 'pause'} />
          </button>
          <button className="icon-btn refresh-btn" type="button" aria-label="Refresh now" title="Refresh now (R)" onClick={() => data.refresh({ manual: true })}>
            <Icon name="refresh" />
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={onToggleTheme}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Display mode: fullscreen view for a wall monitor"
            title="Display mode – fullscreen for a wall monitor (F)"
            onClick={onDisplayMode}
          >
            <Icon name="maximize" />
          </button>
        </div>
      </div>
      <div className="refresh-track" aria-hidden="true">
        {/* Keyed by the deadline so the countdown animation restarts on every refresh. */}
        {data.nextRefreshAt && <span key={data.nextRefreshAt} style={{ animationDuration: `${REFRESH_MS}ms` }} />}
      </div>
    </header>
  );
}
