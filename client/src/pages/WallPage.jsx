import { Icon } from '../components/Icon.jsx';
import { NetworkMap } from '../components/NetworkMap.jsx';
import { AlertsPanel, KpiTiles, StatusBanner } from '../components/Overview.jsx';
import { LiveIndicator } from '../components/TopBar.jsx';
import { ServerStatus } from '../components/ui.jsx';
import { useIdle, useWakeLock } from '../hooks/useFullscreen.js';
import { useNow } from '../hooks/useNow.js';
import { displayName } from '../lib/model.js';

function Clock() {
  const now = new Date(useNow(1000));
  return (
    <div className="wall-clock" aria-label={`Time ${now.toLocaleTimeString()}`}>
      <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
      <span>{now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
    </div>
  );
}

// Down first, then not detected / not pingable / checking, then up; alphabetical within.
const RANK = { down: 0, missing: 1, 'no-ip': 2, pending: 2, up: 3 };
const rankOf = (d) => RANK[d.health?.status ?? (d.manualOnly ? 'missing' : 'pending')] ?? 2;

/** Every server you added, with its live status: the at-a-glance list for a wall screen. */
function ServerStatusList({ network, idx, actions }) {
  const switchIds = [...idx.treeOrder, ...network.switches.filter((s) => !s.role).map((s) => s.id), null];
  const servers = switchIds.flatMap((id) => idx.serversFor(id))
    .sort((a, b) => rankOf(a) - rankOf(b) || displayName(a).localeCompare(displayName(b)));
  const down = servers.filter((d) => d.health?.status === 'down').length;
  const up = servers.filter((d) => d.health?.status === 'up').length;

  return (
    <section className="card wall-servers" aria-labelledby="wall-servers-title">
      <header className="card-header">
        <h2 id="wall-servers-title">Servers {servers.length > 0 && <span className="count-badge">{servers.length}</span>}</h2>
        {servers.length > 0 && (
          <span className={`wall-servers-summary${down ? ' has-down' : ''}`}>
            {down > 0 && <><Icon name="x-octagon" />{down} down · </>}{up} up
          </span>
        )}
      </header>
      {servers.length ? (
        <ul className="wall-server-list">
          {servers.map((d) => (
            <li key={d.mac} data-status={d.health?.status ?? (d.manualOnly ? 'missing' : 'pending')}>
              <button type="button" onClick={() => actions.openDevice(d.mac)}>
                <span className="wall-server-name">{displayName(d)}</span>
                <ServerStatus device={d} />
                <span className="wall-server-where">
                  {[d.switchId ?? 'FortiGate', d.port, d.health?.ip ?? d.ip].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No servers added yet.</p>
      )}
    </section>
  );
}

/** Full-screen placeholder while a display screen loads its first data (or can't reach the API). */
export function WallLoading({ error }) {
  return (
    <div className="wall-loading" role="status">
      <span className="brand-mark"><Icon name="pulse" /></span>
      <strong>Network Health</strong>
      <span>{error ? `Can't reach the dashboard API: ${error.message}. Retrying…` : 'Loading network status…'}</span>
    </div>
  );
}

/**
 * Display mode for a wall monitor: one screen, no scrolling. Header with clock, the status
 * and KPI row, the network map filling the main area, alerts and servers in a sidebar.
 */
export function WallPage({ data, actions, fullscreen }) {
  const { network, devices, idx, loadedAt } = data;
  useWakeLock(true);
  const idle = useIdle(3000, true);

  return (
    <div className={`wall${idle ? ' is-idle' : ''}`}>
      <header className="wall-header">
        <div className="brand">
          <span className="brand-mark"><Icon name="pulse" /></span>
          <span className="brand-name">Network Health</span>
        </div>
        <div className="gateway-chip">
          <Icon name="shield" />
          <strong>{network.gateway.hostname}</strong>
          <span>{[network.gateway.model, network.gateway.version].filter(Boolean).join(' · ')}</span>
        </div>
        <Clock />
        <div className="wall-actions">
          <LiveIndicator data={data} />
          {!fullscreen.isFullscreen && fullscreen.supported && (
            <button className="btn btn-sm" type="button" onClick={fullscreen.enter} title="Fill the whole screen (F11 also works)">
              <Icon name="maximize" />Fullscreen
            </button>
          )}
          <button className="btn btn-sm" type="button" onClick={actions.exitDisplay} title="Back to the normal dashboard (Esc)">
            <Icon name="minimize" />Exit display mode
          </button>
        </div>
      </header>

      <div className="wall-summary">
        <StatusBanner network={network} idx={idx} loadedAt={loadedAt} />
        <KpiTiles network={network} idx={idx} actions={actions} />
      </div>

      <div className="wall-main">
        <NetworkMap network={network} idx={idx} showServers actions={actions} display />
        <aside className="wall-side" aria-label="Alerts and servers">
          <AlertsPanel network={network} devices={devices} idx={idx} actions={actions} />
          <ServerStatusList network={network} idx={idx} actions={actions} />
        </aside>
      </div>
    </div>
  );
}
