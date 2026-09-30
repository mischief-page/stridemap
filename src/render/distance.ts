import { formatHex, interpolate } from 'culori';
import { round1 as r } from './format';

/**
 * 'total': the running total over the span shown, always rising, "how far
 * I've come". 'monthly': distance per month (per week for short spans), a
 * range of peaks for big training blocks and valleys for breaks.
 */
export type DistanceShape = 'total' | 'monthly';

export interface DistanceStyle {
  shape: DistanceShape;
  /** Overall strength, 0–1; the fill is fainter than its top edge. */
  strength: number;
}

/** A workout on the timeline: start time (Unix ms) and GPS distance (m). */
export interface TimelinePoint {
  t: number;
  m: number;
}

interface AreaFrame {
  top: number;
  width: number;
  height: number;
  colorA: string;
  colorB: string;
}

/** How much of the art's height the highest point reaches. */
const PEAK = 0.5;
const DAY = 86_400_000;
/** Spans shorter than this are bucketed by week rather than month. */
const MONTHLY_MIN_SPAN = 120 * DAY;

const GRADIENT_ID = 'stridemap-distance';

/**
 * A quiet area chart of distance over time, across the full width of the art
 * and rising from its bottom edge, shaded along the color scale toward color
 * B (latest). No axes or labels: the legend already gives dates and totals.
 */
export function renderDistance(timeline: TimelinePoint[], style: DistanceStyle, f: AreaFrame): string {
  if (timeline.length < 2) return '';
  const t0 = timeline[0]!.t;
  const t1 = timeline[timeline.length - 1]!.t;
  if (t1 <= t0) return '';

  const bottom = f.top + f.height;
  const xOf = (t: number) => ((t - t0) / (t1 - t0)) * f.width;
  const pts = style.shape === 'total' ? runningTotal(timeline, f.width) : perPeriod(timeline, t1 - t0 >= MONTHLY_MIN_SPAN);
  const max = Math.max(...pts.map((p) => p.v));
  if (!(max > 0)) return '';
  const xy = pts.map((p) => [xOf(p.t), bottom - (p.v / max) * f.height * PEAK] as const);

  // Straight segments suit the running total's steps; per-period values are
  // joined by curves through the midpoints so the peaks read as hills.
  let edge = `M${r(xy[0]![0])} ${r(xy[0]![1])}`;
  if (style.shape === 'total') {
    for (const [x, y] of xy.slice(1)) edge += `L${r(x)} ${r(y)}`;
  } else {
    for (let i = 1; i < xy.length; i++) {
      const [px, py] = xy[i - 1]!;
      const [x, y] = xy[i]!;
      edge += `Q${r(px)} ${r(py)} ${r((px + x) / 2)} ${r((py + y) / 2)}`;
    }
    const [lx, ly] = xy[xy.length - 1]!;
    edge += `L${r(lx)} ${r(ly)}`;
  }
  const [firstX] = xy[0]!;
  const [lastX] = xy[xy.length - 1]!;
  const area = `${edge}L${r(lastX)} ${r(bottom)}L${r(firstX)} ${r(bottom)}Z`;
  const unit = Math.min(f.width, f.height) / 1200;
  // Color A is usually close to the background (it's for rarely used
  // streets), so the chart starts partway along the scale to stay visible.
  const start = formatHex(interpolate([f.colorA, f.colorB], 'oklch')(0.4));

  return `<g class="distance">
<defs><linearGradient id="${GRADIENT_ID}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${start}"/><stop offset="1" stop-color="${f.colorB}"/></linearGradient></defs>
<path d="${area}" fill="url(#${GRADIENT_ID})" fill-opacity="${r2(style.strength * 0.45)}"/>
<path d="${edge}" fill="none" stroke="url(#${GRADIENT_ID})" stroke-opacity="${r2(Math.min(1, style.strength * 1.6))}" stroke-width="${r(1.5 * unit)}" stroke-linejoin="round"/>
</g>`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The running total, sampled at most once per pixel column. */
function runningTotal(timeline: TimelinePoint[], width: number): { t: number; v: number }[] {
  const t0 = timeline[0]!.t;
  const span = timeline[timeline.length - 1]!.t - t0;
  const out: { t: number; v: number }[] = [{ t: t0, v: 0 }];
  let total = 0;
  let lastColumn = -1;
  for (const p of timeline) {
    total += p.m;
    const column = Math.floor(((p.t - t0) / span) * width);
    if (column === lastColumn) out[out.length - 1] = { t: p.t, v: total };
    else out.push({ t: p.t, v: total });
    lastColumn = column;
  }
  return out;
}

/** Distance per calendar month (or per week), placed at each period's middle, and at the span's ends. */
function perPeriod(timeline: TimelinePoint[], monthly: boolean): { t: number; v: number }[] {
  const startOf = (t: number) => {
    const d = new Date(t);
    if (monthly) return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime();
  };
  const next = (start: number) => {
    const d = new Date(start);
    return monthly ? new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime();
  };
  const sums = new Map<number, number>();
  for (const p of timeline) sums.set(startOf(p.t), (sums.get(startOf(p.t)) ?? 0) + p.m);
  // Every period in the span, including empty ones, so breaks show as valleys.
  const t0 = timeline[0]!.t;
  const t1 = timeline[timeline.length - 1]!.t;
  const periods: { t: number; v: number }[] = [];
  for (let s = startOf(t0); s <= t1; s = next(s)) {
    periods.push({ t: Math.min(t1, Math.max(t0, (s + next(s)) / 2)), v: sums.get(s) ?? 0 });
  }
  return [{ t: t0, v: periods[0]!.v }, ...periods, { t: t1, v: periods[periods.length - 1]!.v }];
}
