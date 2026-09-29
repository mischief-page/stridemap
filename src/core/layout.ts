import { METERS_PER_DEG_LAT, metersPerDegLon } from './track';
import type { Bounds, LocalTrack, Track } from './types';

/**
 * Converts a track to meters east (x) and north (y) of its first point, so
 * every workout starts at the same anchor while keeping its true direction and
 * scale. The absolute location is discarded here.
 */
export function anchorTrack(track: Track): { x: Float32Array; y: Float32Array; bbox: Bounds } {
  const n = track.t.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  if (n === 0) return { x, y, bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  const lat0 = track.lat[0]!;
  const lon0 = track.lon[0]!;
  const mPerDegLon = metersPerDegLon(lat0);
  for (let i = 0; i < n; i++) {
    x[i] = (track.lon[i]! - lon0) * mPerDegLon;
    y[i] = (track.lat[i]! - lat0) * METERS_PER_DEG_LAT;
  }
  return { x, y, bbox: extent(x, y) };
}

/** Extent of a track's points, always including the anchor at (0, 0). */
export function extent(x: Float32Array, y: Float32Array): Bounds {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (let i = 0; i < x.length; i++) {
    const px = x[i]!, py = y[i]!;
    if (px < minX) minX = px; else if (px > maxX) maxX = px;
    if (py < minY) minY = py; else if (py > maxY) maxY = py;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Pulls long routes inward while keeping their direction exact. An exponent of
 * 1 is true scale; 0.5 is a square-root squash.
 */
export function compressRadially(tracks: LocalTrack[], exponent: number): LocalTrack[] {
  if (exponent === 1) return tracks;
  return tracks.map((t) => {
    const x = new Float32Array(t.x.length);
    const y = new Float32Array(t.y.length);
    for (let i = 0; i < t.x.length; i++) {
      const r = Math.hypot(t.x[i]!, t.y[i]!);
      const k = r > 0 ? r ** exponent / r : 0;
      x[i] = t.x[i]! * k;
      y[i] = t.y[i]! * k;
    }
    return { x, y, value: t.value, bbox: extent(x, y) };
  });
}

/**
 * The box to fit on the canvas. With a percentile below 100, each side is
 * placed so that share of workouts reach no further, and the rest run off the
 * edge. This stops one unusually long route from shrinking everything else.
 */
export function fitBounds(tracks: LocalTrack[], percentile: number): Bounds {
  if (tracks.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  const p = Math.min(100, Math.max(50, percentile)) / 100;
  const side = (pick: (b: Bounds) => number, q: number) => quantiles(tracks.map((t) => pick(t.bbox)), [q])[0]!;
  return {
    minX: side((b) => b.minX, 1 - p),
    maxX: side((b) => b.maxX, p),
    minY: side((b) => b.minY, 1 - p),
    maxY: side((b) => b.maxY, p),
  };
}

/** Most values that are sorted to find quantiles; larger inputs are evenly sampled. */
const MAX_QUANTILE_SAMPLE = 200_000;

/**
 * Several quantiles from one sort. Millions of GPS points are sampled down
 * first, which changes the answer by a negligible amount and is far faster.
 */
export function quantiles(values: ArrayLike<number>, qs: number[]): number[] {
  const stride = Math.max(1, Math.floor(values.length / MAX_QUANTILE_SAMPLE));
  const sample: number[] = [];
  for (let i = 0; i < values.length; i += stride) {
    const v = values[i]!;
    if (Number.isFinite(v)) sample.push(v);
  }
  const sorted = Float64Array.from(sample).sort();
  return qs.map((q) => {
    if (sorted.length === 0) return NaN;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  });
}
