import { useState } from 'react';
import { Icon, sevIcon } from './Icon.jsx';
import { activityOf, serverHealth } from '../lib/model.js';

/** Status label: color is never the only cue - an icon and text always come with it. */
export function Pill({ level, label, icon }) {
  return (
    <span className="pill" data-sev={level ?? undefined}>
      <Icon name={icon ?? sevIcon(level)} />
      {label}
    </span>
  );
}

export function Meter({ label, value, rating, max = 100, unit = '%' }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const text = value == null ? '—' : `${Math.round(value)}${unit}`;
  return (
    <div className="meter-row">
      <span className="meter-label">{label}</span>
      <div
        className="meter"
        data-sev={rating === 'warning' || rating === 'critical' ? rating : undefined}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? 0}
        aria-valuetext={text}
      >
        <span className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="meter-value">{text}</span>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Definition list of [label, value, { wide }] rows; falsy rows are skipped. */
export function Facts({ rows }) {
  return (
    <dl className="facts">
      {rows.filter(Boolean).map(([term, value, opts = {}]) => (
        <div key={term} className={opts.wide ? 'wide' : undefined}>
          <dt>{term}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A value with a status icon beside it when its rating is not good. */
export function Rated({ children, rating }) {
  return (
    <span data-sev={rating ?? undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {children}
      {rating && rating !== 'good' && <Icon name={sevIcon(rating)} className="sev-icon" />}
    </span>
  );
}

export function AlertList({ alerts, onSelect }) {
  return alerts.map((a, i) => {
    const content = (
      <>
        <Icon name={sevIcon(a.severity)} />
        <span className="alert-text">
          <strong>{a.title}</strong>
          {a.detail && <span>{a.detail}</span>}
        </span>
        {onSelect && <Icon name="chevron-right" className="chev" />}
      </>
    );
    const key = `${a.target?.id ?? ''}|${a.title}|${i}`;
    return onSelect
      ? <button key={key} type="button" className="alert-item" data-sev={a.severity} onClick={() => onSelect(a)}>{content}</button>
      : <div key={key} className="alert-item" data-sev={a.severity}>{content}</div>;
  });
}

/** Copy text; falls back to execCommand when the page is not a secure context (plain http on a LAN IP). */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const onClick = async (e) => {
    e.stopPropagation();
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };
  return (
    <button className={`icon-btn sm copy-btn${copied ? ' copied' : ''}`} type="button" title={`Copy ${label}`} aria-label={`Copy ${label}`} onClick={onClick}>
      <Icon name={copied ? 'check-circle' : 'copy'} />
    </button>
  );
}

/** Wrap case-insensitive matches of `needle` in <mark>. */
export function Highlight({ text, needle }) {
  if (text == null) return null;
  const value = String(text);
  if (!needle) return value;
  const lower = value.toLowerCase();
  const parts = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (at !== -1) {
    if (at > from) parts.push(value.slice(from, at));
    parts.push(<mark key={at}>{value.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < value.length) parts.push(value.slice(from));
  return parts;
}

export const ACTIVITY = {
  active: { label: 'Active', icon: 'dot' },
  idle: { label: 'Idle', icon: 'clock' },
  inactive: { label: 'Inactive', icon: 'minus-circle' },
};

export function ActivityBadge({ device }) {
  if (device.manualOnly) {
    return <span className="activity" data-act="missing"><Icon name="alert-triangle" />Not detected</span>;
  }
  const act = activityOf(device);
  return (
    <span className="activity" data-act={act}>
      <Icon name={ACTIVITY[act].icon} />
      {ACTIVITY[act].label}
    </span>
  );
}

const fmtRtt = (ms) => (ms < 1 ? '<1 ms' : `${Math.round(ms)} ms`);

/** A server's status: its ping result when it is pinged, otherwise switch-table activity. */
export function ServerStatus({ device, showRtt = true }) {
  const health = serverHealth(device);
  if (!health) return <ActivityBadge device={device} />;
  const rtt = device.health.status === 'up' && device.health.rttMs != null ? device.health.rttMs : null;
  return (
    <span className="activity" data-health={health.level ?? 'none'}>
      <Icon name={health.icon} />
      {health.label}
      {showRtt && rtt != null && <span className="rtt">{fmtRtt(rtt)}</span>}
    </span>
  );
}

/** Last N ping results as a strip of ticks (oldest first). */
export function PingHistory({ history }) {
  if (!history?.length) return null;
  const ok = history.filter((h) => h.up).length;
  return (
    <div className="ping-history">
      <div className="ping-ticks" role="img" aria-label={`${ok} of the last ${history.length} pings answered`}>
        {history.map((h) => (
          <span key={h.t} data-up={h.up} title={`${new Date(h.t).toLocaleTimeString()} · ${h.up ? fmtRtt(h.rttMs ?? 0) : 'no reply'}`} />
        ))}
      </div>
      <span className="field-hint">{ok} of the last {history.length} pings answered</span>
    </div>
  );
}

/** Props that make a non-button element (e.g. a card) act like a button. */
export function buttonProps(onActivate, label) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}
