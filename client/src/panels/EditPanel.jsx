import { DeviceEditor } from '../components/DeviceEditor.jsx';
import { displayName } from '../lib/model.js';
import { PanelHeader } from './shared.jsx';

/** Edit a device; with `asServer` the form starts with Type = Server ("Add to servers"). */
export function editPanel(device, { network, idx, actions }, { asServer = false } = {}) {
  const key = `${asServer ? 'promote' : 'edit'}:${device.mac}`;
  return {
    key,
    header: (
      <PanelHeader
        icon={asServer ? 'plus' : 'pencil'}
        title={asServer ? `Add ${displayName(device)} to servers` : `Edit ${displayName(device)}`}
        sub={`MAC ${device.mac}`}
      />
    ),
    body: (
      <DeviceEditor
        key={key}
        mode="edit"
        initialKind={asServer ? 'server' : 'device'}
        device={device}
        network={network}
        idx={idx}
        onSave={actions.saveDevice}
        onDelete={actions.removeCustom}
        onCancel={() => actions.openDevice(device.mac)}
      />
    ),
  };
}

export function addPanel(switchId, { network, idx, actions }) {
  return {
    key: `add:${switchId ?? ''}`,
    header: <PanelHeader icon="plus" title="Add server or device" sub="Pick a device a switch already sees, or enter its MAC address" />,
    body: (
      <DeviceEditor
        key={`add:${switchId ?? ''}`}
        mode="add"
        initialSwitchId={switchId}
        network={network}
        idx={idx}
        onSave={actions.saveDevice}
        onCancel={actions.closePanel}
      />
    ),
  };
}
