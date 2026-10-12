import { ChartCaption, LineChart } from '../components/LineChart.jsx';
import { AlertList, Facts, Meter, Section } from '../components/ui.jsx';
import { fmtInt } from '../lib/format.js';
import { gatewayStatus } from '../lib/model.js';
import { DeviceBreakdown, DownlinkSection, PanelHeader } from './shared.jsx';

const pct = (v) => `${Math.round(v)}%`;
const count = (v) => fmtInt(Math.round(v));

function ResourceSection({ title, usage, max, format }) {
  return (
    <Section title={title}>
      {max != null && <Meter label="Now" value={usage?.value} rating={usage?.rating} />}
      <div style={{ marginTop: max != null ? 14 : 0 }}>
        <LineChart points={usage?.history} label={title} max={max} height={96} format={format} />
      </div>
      <ChartCaption points={usage?.history} format={format} />
    </Section>
  );
}

export function gatewayPanel({ network, idx, actions }) {
  const g = network.gateway;
  const alerts = idx.alertsByTarget.get(g.id) ?? [];

  return {
    key: `gateway:${g.id}`,
    header: <PanelHeader icon="shield" title={g.hostname} sub={['FortiGate', g.model, g.id].filter(Boolean).join(' · ')} status={gatewayStatus(network, idx)} />,
    body: (
      <>
        {alerts.length > 0 && <Section title="Alerts"><div className="panel-alerts"><AlertList alerts={alerts} /></div></Section>}
        <Section title="System">
          <Facts rows={[
            ['Model', g.model],
            ['Firmware', [g.version, g.build && `build ${g.build}`].filter(Boolean).join(' ')],
            ['Serial', <span className="mono">{g.id}</span>],
            ['Sessions', fmtInt(g.sessions?.value)],
          ]} />
        </Section>
        <ResourceSection title="CPU" usage={g.cpu} max={100} format={pct} />
        <ResourceSection title="Memory" usage={g.memory} max={100} format={pct} />
        <ResourceSection title="Sessions" usage={g.sessions} format={count} />
        <DownlinkSection nodeId={g.id} idx={idx} actions={actions} />
        <Section title="Devices not behind a switch">
          <p className="card-sub" style={{ margin: '0 0 12px' }}>
            Seen by the FortiGate on its own interfaces rather than on a managed FortiSwitch.
          </p>
          <DeviceBreakdown stats={idx.statsFor(null)} onShow={() => actions.showDevices({ scope: 'direct' })} showLabel="Show these devices" />
        </Section>
      </>
    ),
  };
}
