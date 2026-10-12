import { useId, useMemo, useState } from 'react';
import { isValidIp, isValidPort, NAME_MAX, normalizeMac, NOTES_MAX } from '../lib/custom.js';
import { displayName, isServer, osFamily } from '../lib/model.js';
import { Icon } from './Icon.jsx';

const KIND_OPTIONS = [['server', 'Server'], ['device', 'Not a server']];
const OS_OPTIONS = ['Windows', 'Linux', 'Other'];

function initialFields(device, initialKind) {
  const c = device?.custom;
  return {
    name: c?.name ?? '',
    kind: c?.kind === 'server' ? 'server' : initialKind,
    os: c?.os ?? 'auto',
    ip: c?.ip ?? '',
    notes: c?.notes ?? '',
  };
}

function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="field-error" role="alert">{error}</p> : hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** Searchable list of the devices a switch currently sees, to pick one by MAC. */
function DevicePicker({ devices, value, onPick }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? devices.filter((d) => [d.mac, d.ip, d.hostname, d.name, d.port].some((v) => v?.toLowerCase().includes(needle)))
    : devices;

  return (
    <div className="picker">
      <label className="search">
        <Icon name="search" />
        <input type="search" placeholder="Filter by MAC, IP, name or port…" aria-label="Filter devices" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="picker-list" role="radiogroup" aria-label="Device">
        {shown.length === 0 && <p className="picker-empty">No devices match.</p>}
        {shown.map((d) => (
          <button key={d.mac} type="button" role="radio" aria-checked={d.mac === value} className="picker-option" onClick={() => onPick(d)}>
            <span className="picker-port mono">{d.port ?? '—'}</span>
            <span className="picker-main">
              <span className="mono">{d.mac}</span>
              <span className="picker-sub">{[d.name || d.hostname, d.ip ?? 'No IP'].filter(Boolean).join(' · ')}</span>
            </span>
            {isServer(d) && <span className="os-tag" data-os={osFamily(d)?.toLowerCase() ?? 'other'}>Server</span>}
            {d.mac === value && <Icon name="check-circle" className="picker-check" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Add a server/device to a switch, or edit one: display name, type, OS, IP, notes. Detected
 * devices keep their live switch/port; manually entered MACs carry an expected switch/port.
 */
export function DeviceEditor({ mode, device, initialSwitchId, initialKind = mode === 'add' ? 'server' : 'device', network, idx, onSave, onDelete, onCancel }) {
  const id = useId();
  const switchIds = network.switches.map((s) => s.id);
  const [source, setSource] = useState('detected'); // add mode: pick a detected MAC, or type one
  const [switchId, setSwitchId] = useState(device?.switchId ?? initialSwitchId ?? idx.treeOrder[0] ?? switchIds[0] ?? '');
  const [pickedMac, setPickedMac] = useState('');
  const [manualMac, setManualMac] = useState('');
  const [port, setPort] = useState(device?.port ?? '');
  const [fields, setFields] = useState(() => initialFields(device, initialKind));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const candidates = useMemo(
    () => idx.devices
      .filter((d) => d.switchId === switchId && !d.manualOnly)
      .sort((a, b) => (a.portId ?? Infinity) - (b.portId ?? Infinity) || a.mac.localeCompare(b.mac)),
    [idx.devices, switchId],
  );

  // Which MAC is being edited, and what we know about it.
  const mac = mode === 'edit' ? device.mac : source === 'detected' ? pickedMac : normalizeMac(manualMac);
  const target = mode === 'edit' ? device : mac ? idx.deviceByMac.get(mac) : null;
  const detected = Boolean(target && !target.manualOnly);
  const editsLocation = !detected; // a live location always wins over a typed one

  const errors = {
    mac: mode === 'add' && source === 'manual' && manualMac && !normalizeMac(manualMac) ? 'Enter a MAC like bc:24:11:47:62:5a' : null,
    ip: fields.ip.trim() && !isValidIp(fields.ip.trim()) ? 'Enter an IPv4 address like 10.156.116.176' : null,
    port: editsLocation && port.trim() && !isValidPort(port.trim()) ? 'Use letters, digits and . _ / - only (e.g. port5)' : null,
    name: fields.name.length > NAME_MAX ? `At most ${NAME_MAX} characters` : null,
    notes: fields.notes.length > NOTES_MAX ? `At most ${NOTES_MAX} characters` : null,
  };
  const canSave = Boolean(mac) && !Object.values(errors).some(Boolean) && !saving;

  const pick = (d) => {
    setPickedMac(d.mac);
    // Re-opening an already customised device starts from its saved values.
    setFields(initialFields(d, 'server'));
  };

  const detectedOs = target?.detectedOs ?? (target?.custom ? null : target?.os);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(mac, {
        name: fields.name.trim() || null,
        kind: fields.kind === 'auto' ? null : fields.kind,
        os: fields.os === 'auto' ? null : fields.os,
        ip: fields.ip.trim() || null,
        // Detected devices store where they are now, so they stay listed there if they vanish.
        switchId: detected ? target.switchId : switchId || null,
        port: detected ? target.port : port.trim() || null,
        notes: fields.notes.trim() || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    try {
      await onDelete(mac);
    } catch (err) {
      setError(err.message);
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <form className="editor" onSubmit={submit} noValidate>
      {mode === 'add' && (
        <section className="panel-section">
          <h3>Device</h3>
          <div className="stack">
            <div className="seg" role="group" aria-label="How to choose the device">
              <button type="button" aria-pressed={source === 'detected'} onClick={() => setSource('detected')}>Seen on a switch</button>
              <button type="button" aria-pressed={source === 'manual'} onClick={() => setSource('manual')}>Enter MAC address</button>
            </div>
            <Field label="Switch" htmlFor={`${id}-switch`}>
              <select id={`${id}-switch`} className="select wide" value={switchId} onChange={(e) => { setSwitchId(e.target.value); setPickedMac(''); }}>
                {switchIds.map((sid) => <option key={sid} value={sid}>{sid}</option>)}
              </select>
            </Field>
            {source === 'detected' ? (
              <Field label={`Devices on ${switchId} · ${candidates.length}`} hint="Every MAC address this switch currently sees, by port.">
                <DevicePicker devices={candidates} value={pickedMac} onPick={pick} />
              </Field>
            ) : (
              <>
                <Field label="MAC address" htmlFor={`${id}-mac`} error={errors.mac} hint="Any format: bc:24:11:47:62:5a, BC-24-11-47-62-5A, bc24.1147.625a">
                  <input id={`${id}-mac`} className="input mono" value={manualMac} onChange={(e) => setManualMac(e.target.value)} placeholder="bc:24:11:47:62:5a" autoComplete="off" spellCheck="false" />
                </Field>
                {target && !target.manualOnly && (
                  <p className="callout"><Icon name="info" /><span>This MAC is already seen on {target.switchId ?? 'the FortiGate'}{target.port ? ` ${target.port}` : ''}; its live location will be used.</span></p>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <section className="panel-section">
        <h3>Location</h3>
        {mode === 'add' && source === 'detected' && !target ? (
          <p className="field-hint">Choose a device above; its switch and port are filled in automatically.</p>
        ) : detected ? (
          <p className="location-live">
            <Icon name="link" />
            <span>
              {target.switchId ? <>Connected to <strong>{target.switchId}</strong>{target.port && <> · <span className="mono">{target.port}</span></>}{target.vlan != null && ` · VLAN ${target.vlan}`}</> : 'Seen directly by the FortiGate'}
              <span className="field-hint"> Detected live; updates automatically if it moves.</span>
            </span>
          </p>
        ) : (
          <div className="field-row">
            {mode === 'edit' && (
              <Field label="Switch" htmlFor={`${id}-switch2`}>
                <select id={`${id}-switch2`} className="select wide" value={switchId ?? ''} onChange={(e) => setSwitchId(e.target.value)}>
                  {switchIds.map((sid) => <option key={sid} value={sid}>{sid}</option>)}
                </select>
              </Field>
            )}
            <Field label="Port (optional)" htmlFor={`${id}-port`} error={errors.port} hint={mode === 'edit' ? 'Where it should be connected.' : undefined}>
              <input id={`${id}-port`} className="input mono" value={port ?? ''} onChange={(e) => setPort(e.target.value)} placeholder="port5" autoComplete="off" />
            </Field>
          </div>
        )}
      </section>

      <section className="panel-section">
        <h3>Details</h3>
        <div className="stack">
          <Field label="Display name" htmlFor={`${id}-name`} error={errors.name} hint={target?.hostname ? `Detected hostname: ${target.hostname}. Leave empty to use it.` : 'Shown everywhere on the dashboard.'}>
            <input id={`${id}-name`} className="input" value={fields.name} onChange={set('name')} placeholder={target?.hostname ?? 'e.g. Historian server'} maxLength={NAME_MAX + 10} autoComplete="off" />
          </Field>

          <Field label="Type" hint={fields.kind === 'server' ? 'Shown under Servers by switch, and monitored.' : 'Not listed under Servers; your name and notes still apply.'}>
            <div className="seg" role="group" aria-label="Type">
              {KIND_OPTIONS.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={fields.kind === value} onClick={() => setFields((f) => ({ ...f, kind: value }))}>{label}</button>
              ))}
            </div>
          </Field>

          <div className="field-row">
            <Field label="Operating system" htmlFor={`${id}-os`}>
              <select id={`${id}-os`} className="select wide" value={fields.os} onChange={set('os')}>
                <option value="auto">{detectedOs ? `Auto (detected: ${detectedOs})` : 'Auto (not detected)'}</option>
                {OS_OPTIONS.map((os) => <option key={os} value={os}>{os}</option>)}
              </select>
            </Field>
            <Field label="IP address (optional)" htmlFor={`${id}-ip`} error={errors.ip} hint={target?.ipCandidates?.some((c) => !c.sources.includes('manual')) ? `Detected: ${target.ipCandidates.find((c) => !c.sources.includes('manual')).ip}` : 'For devices the FortiGate cannot see an IP for.'}>
              <input id={`${id}-ip`} className="input mono" value={fields.ip} onChange={set('ip')} placeholder="10.156.116.176" inputMode="decimal" autoComplete="off" />
            </Field>
          </div>

          <Field label="Notes (optional)" htmlFor={`${id}-notes`} error={errors.notes}>
            <textarea id={`${id}-notes`} className="input" rows={3} value={fields.notes} onChange={set('notes')} placeholder="Owner, purpose, rack location…" />
          </Field>

          {fields.kind === 'server' && (
            <p className="callout"><Icon name="info" /><span>Servers you add are monitored: pinged every 10 seconds (at the IP above, or the one the FortiGate detects) and marked down with an alert after 2 missed replies.</span></p>
          )}
        </div>
      </section>

      {error && <p className="form-error" role="alert"><Icon name="x-octagon" />{error}</p>}

      <div className="editor-actions">
        <button type="submit" className="btn btn-primary" disabled={!canSave}>
          <Icon name="check-circle" />{saving ? 'Saving…' : mode === 'add' ? 'Add to dashboard' : 'Save changes'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
        {mode === 'edit' && device.custom && (
          <button type="button" className={`btn btn-danger${confirmDelete ? ' confirm' : ''}`} onClick={remove} disabled={saving} onBlur={() => setConfirmDelete(false)}>
            <Icon name="x" />
            {confirmDelete ? 'Click again to confirm' : device.manualOnly ? 'Remove device' : 'Reset to detected'}
          </button>
        )}
      </div>
      {mode === 'add' && !mac && source === 'detected' && <p className="field-hint">Choose a device above to continue.</p>}
      {mode === 'edit' && <p className="field-hint">Editing <span className="mono">{device.mac}</span> · {displayName(device)}</p>}
    </form>
  );
}
