import { DevicesSection } from '../components/DevicesSection.jsx';

export function DevicesPage({ data, route, actions, devicesRef, searchRef }) {
  return (
    <DevicesSection
      ref={devicesRef}
      network={data.network}
      idx={data.idx}
      route={route}
      actions={actions}
      searchRef={searchRef}
    />
  );
}

export function DevicesSkeleton() {
  return (
    <section className="card">
      <div className="card-body"><div className="skeleton" style={{ height: 36, marginBottom: 16 }} /><div className="skeleton" style={{ height: 480 }} /></div>
    </section>
  );
}
