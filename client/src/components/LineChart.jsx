import { useState } from 'react';
import { fmtClock } from '../lib/format.js';
import { useTooltip } from './Tooltip.jsx';

const pct = (v) => `${Math.round(v)}%`;

// Round an axis maximum up to a clean value (53 -> 60) so tick labels are tidy.
function niceCeil(v) {
  if (v <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 4, 5, 6, 8, 10].find((step) => step * magnitude >= v) * magnitude;
}

function nearest(points, t) {
  let best = points[0];
  for (const p of points) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
  return best;
}

/**
 * Line chart over [[epochMs, value], ...]. `spark` draws a compact trend line; otherwise
 * axes are added. Both have a crosshair + tooltip readout.
 */
export function LineChart({ points, label, max, height = 40, spark = false, format = pct }) {
  const tooltip = useTooltip();
  const [hover, setHover] = useState(null);

  if (!points?.length) return <p className="chart-empty">No history available</p>;

  const t0 = points[0][0];
  const t1 = points.at(-1)[0];
  const values = points.map((p) => p[1]);
  const dataMax = Math.max(...values);
  const top = max != null ? Math.max(max, dataMax) : niceCeil(dataMax);
  const x = (t) => (t1 === t0 ? 100 : ((t - t0) / (t1 - t0)) * 100);
  const y = (v) => 100 - (v / top) * 100;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join('');
  const last = points.at(-1);

  const onPointerMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = nearest(points, t0 + ((e.clientX - r.left) / r.width) * (t1 - t0));
    setHover(p);
    tooltip.show(e.clientX, r.top, <><strong>{format(p[1])}</strong><span>{label} · {fmtClock(p[0])}</span></>);
  };
  const onPointerLeave = () => {
    setHover(null);
    tooltip.hide();
  };

  const summary = `${label}, last hour: now ${format(last[1])}, min ${format(Math.min(...values))}, max ${format(dataMax)}`;

  const plot = (
    <div className="chart-plot" style={{ '--h': `${height}px` }} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <svg className="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {!spark && [0, 0.5, 1].map((g) => <line key={g} className="chart-grid" x1="0" x2="100" y1={y(top * g)} y2={y(top * g)} />)}
        <path className="chart-area" d={`${line}L100,100L0,100Z`} />
        <path className="chart-line" d={line} />
      </svg>
      {hover && <span className="chart-cross" style={{ left: `${x(hover[0])}%` }} />}
      <span className="chart-dot" style={{ left: `${x(last[0])}%`, top: `${y(last[1])}%` }} />
      {hover && <span className="chart-hover" style={{ left: `${x(hover[0])}%`, top: `${y(hover[1])}%` }} />}
    </div>
  );

  if (spark) {
    return <div className="chart chart-spark" role="img" aria-label={summary}>{plot}</div>;
  }
  return (
    <div className="chart chart-axes" role="img" aria-label={summary}>
      <div className="chart-y" style={{ height }}>
        {[1, 0.5, 0].map((g) => <span key={g} style={{ top: `${y(top * g)}%` }}>{format(top * g)}</span>)}
      </div>
      {plot}
      <div className="chart-x"><span>{fmtClock(t0)}</span><span>Now</span></div>
    </div>
  );
}

/** Min / average / max line under a chart, so values are readable without hovering. */
export function ChartCaption({ points, format = pct }) {
  if (!points?.length) return null;
  const values = points.map((p) => p[1]);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <p className="chart-caption">
      Last hour · min {format(Math.min(...values))} · avg {format(avg)} · max {format(Math.max(...values))}
    </p>
  );
}
