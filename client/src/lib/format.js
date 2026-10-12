export const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

export const fmtPct = (v) => (v == null ? '—' : `${Math.round(v)}%`);

export const fmtSpeed = (mbps) => {
  if (!mbps) return '—';
  return mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`;
};

export function fmtBps(bps) {
  if (bps == null) return '—';
  const units = ['b/s', 'Kb/s', 'Mb/s', 'Gb/s'];
  let value = bps;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return `${i === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function fmtDuration(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

export function fmtAgo(seconds) {
  if (seconds == null) return '—';
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const fmtClock = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const fmtClockSeconds = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const plural = (n, one, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/** Dotted IPv4 -> sortable number; anything else sorts last. */
export function ipToNumber(ip) {
  const parts = (ip ?? '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p))) return null;
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}
