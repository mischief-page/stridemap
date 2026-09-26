import { METERS_PER_DEG_LAT } from './track';
import type { LocalTrack, Track } from './types';

/**
 * Converts a track to meters east (x) and north (y) of its first point, so
 * every workout starts at the same anchor while keeping its true direction and
 * scale. The absolute location is discarded here.
 */
export function anchorTrack(track: Track): { x: Float64Array; y: Float64Array } {
  const n = track.t.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  if (n === 0) return { x, y };
  const lat0 = track.lat[0]!;
  const lon0 = track.lon[0]!;
  const mPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    x[i] = (track.lon[i]! - lon0) * mPerDegLon;
    y[i] = (track.lat[i]! - lat0) * METERS_PER_DEG_LAT;
  }
  return { x, y };
}

/**
 * Pulls long routes inward while keeping their direction exact. An exponent of
 * 1 is true scale; 0.5 is a square-root squash.
 */
export function compressRadially(tracks: LocalTrack[], exponent: number): LocalTrack[] {
  if (exponent === 1) return tracks;
  return tracks.map((t) => {
    const x = new Float64Array(t.x.length);
    const y = new Float64Array(t.y.length);
    for (let i = 0; i < t.x.length; i++) {
      const r = Math.hypot(t.x[i]!, t.y[i]!);
      const k = r > 0 ? r ** exponent / r : 0;
      x[i] = t.x[i]! * k;
      y[i] = t.y[i]! * k;
    }
    return { ...t, x, y };
  });
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * The box to fit on the canvas. With a percentile below 100, each side is
 * placed so that share of workouts reach no further, and the rest run off the
 * edge. This stops one unusually long route from shrinking everything else.
 */
export function fitBounds(tracks: LocalTrack[], percentile: number): Bounds {
  if (tracks.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  const minX: number[] = [];
  const maxX: number[] = [];
  const minY: number[] = [];
  const maxY: number[] = [];
  for (const t of tracks) {
    let a = 0, b = 0, c = 0, d = 0; // every track contains the anchor at (0, 0)
    for (let i = 0; i < t.x.length; i++) {
      a = Math.min(a, t.x[i]!);
      b = Math.max(b, t.x[i]!);
      c = Math.min(c, t.y[i]!);
      d = Math.max(d, t.y[i]!);
    }
    minX.push(a); maxX.push(b); minY.push(c); maxY.push(d);
  }
  const p = Math.min(100, Math.max(50, percentile)) / 100;
  return {
    minX: quantile(minX, 1 - p),
    maxX: quantile(maxX, p),
    minY: quantile(minY, 1 - p),
    maxY: quantile(maxY, p),
  };
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(values: ArrayLike<number>, q: number): number {
  const sorted = Array.from(values).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
