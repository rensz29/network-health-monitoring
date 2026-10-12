import { Infrastructure } from '../components/Infrastructure.jsx';
import { NetworkMap } from '../components/NetworkMap.jsx';
import { AlertsPanel, KpiTiles, StatusBanner } from '../components/Overview.jsx';
import { ServersSection } from '../components/Servers.jsx';

export function DashboardPage({ data, route, actions, infraRef, serversRef }) {
  const { network, devices, idx, loadedAt } = data;
  return (
    <>
      <StatusBanner network={network} idx={idx} loadedAt={loadedAt} />
      <KpiTiles network={network} idx={idx} actions={actions} />
      <NetworkMap network={network} idx={idx} showServers={route.mapServers} actions={actions} />
      <div className="layout">
        <Infrastructure ref={infraRef} network={network} idx={idx} view={route.view} actions={actions} />
        <AlertsPanel network={network} devices={devices} idx={idx} actions={actions} />
      </div>
      <ServersSection ref={serversRef} network={network} idx={idx} osFilter={route.serverOs} actions={actions} />
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <>
      <section className="status-banner"><div className="skeleton" style={{ height: 44, width: '100%' }} /></section>
      <section className="kpis">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="kpi skeleton-card" />)}</section>
      <div className="layout">
        <section className="card"><div className="card-body"><div className="skeleton" style={{ height: 320 }} /></div></section>
        <section className="card"><div className="skeleton" style={{ height: 64, margin: 16 }} /></section>
      </div>
      <section className="card"><div className="card-body"><div className="skeleton" style={{ height: 200 }} /></div></section>
    </>
  );
}
