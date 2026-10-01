import { flatDistance, METERS_PER_DEG_LAT, metersPerDegLon } from './track';
import type { Track } from './types';

/** Below this speed the person is standing still, and pace is meaningless. */
const STATIONARY_MPS = 0.4;

/**
 * Pace in seconds per kilometer for each point, smoothed over a time window so
 * GPS jitter doesn't turn the line into confetti. Points where the person was
 * stationary borrow the pace of their neighbours.
 */
export function paceSeries(track: Track, windowS = 20): Float64Array {
  const n = track.t.length;
  const speed = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const reported = track.speed[i]!;
    if (reported >= 0) {
      speed[i] = reported;
    } else if (i > 0) {
      const dt = (track.t[i]! - track.t[i - 1]!) / 1000;
      const d = flatDistance(track.lat[i - 1]!, track.lon[i - 1]!, track.lat[i]!, track.lon[i]!);
      speed[i] = dt > 0 ? d / dt : NaN;
    } else {
      speed[i] = NaN;
    }
  }

  // Time-windowed moving average of speed (two pointers).
  const smoothed = new Float64Array(n);
  const halfMs = (windowS * 1000) / 2;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && track.t[hi]! <= track.t[i]! + halfMs) {
      if (!Number.isNaN(speed[hi]!)) { sum += speed[hi]!; count++; }
      hi++;
    }
    while (track.t[lo]! < track.t[i]! - halfMs) {
      if (!Number.isNaN(speed[lo]!)) { sum -= speed[lo]!; count--; }
      lo++;
    }
    smoothed[i] = count > 0 ? sum / count : NaN;
  }

  const pace = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = smoothed[i]!;
    pace[i] = s > STATIONARY_MPS ? 1000 / s : NaN;
  }
  return fillGaps(pace);
}

/** Replaces NaN runs with the nearest valid value. */
function fillGaps(values: Float64Array): Float64Array {
  const n = values.length;
  let last = NaN;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(values[i]!)) values[i] = last;
    else last = values[i]!;
  }
  last = NaN;
  for (let i = n - 1; i >= 0; i--) {
    if (Number.isNaN(values[i]!)) values[i] = last;
    else last = values[i]!;
  }
  return values;
}

/** Just the positions of a track: all the visit grid needs. */
export interface LatLon {
  lat: Float64Array;
  lon: Float64Array;
}

/**
 * Counts how many distinct workouts passed through each cell of a real-world
 * grid. Cells are measured on the ground, not in the anchored drawing, so a
 * street is "hot" when it was actually visited often, wherever the workouts
 * started.
 */
export class HeatGrid {
  /** Workouts per cell, keyed by a single number packed from the cell's column and row. */
  private counts = new Map<number, number>();
  /** Busiest count in each cell's 3×3 neighbourhood, filled in as cells are looked up. */
  private neighbourhood = new Map<number, number>();

  constructor(private readonly cellM = 15) {}

  /** The last row's meters per degree of longitude: consecutive points are almost always in the same row. */
  private row = { cy: NaN, mLon: 0 };

  private cellOf(lat: number, lon: number): number {
    const cy = Math.floor((lat * METERS_PER_DEG_LAT) / this.cellM);
    // Use the latitude of the cell's own row so the column width is stable.
    if (cy !== this.row.cy) this.row = { cy, mLon: metersPerDegLon(((cy + 0.5) * this.cellM) / METERS_PER_DEG_LAT) };
    const cx = Math.floor((lon * this.row.mLon) / this.cellM);
    return pack(cx, cy);
  }

  add(track: LatLon): void {
    const seen = new Set<number>();
    const n = track.lat.length;
    for (let i = 0; i < n; i++) {
      seen.add(this.cellOf(track.lat[i]!, track.lon[i]!));
      // Fill gaps between sparse points so a fast segment doesn't skip cells.
      if (i > 0) {
        const d = flatDistance(track.lat[i - 1]!, track.lon[i - 1]!, track.lat[i]!, track.lon[i]!);
        const steps = Math.floor(d / (this.cellM / 2));
        for (let s = 1; s < steps; s++) {
          const f = s / steps;
          seen.add(
            this.cellOf(
              track.lat[i - 1]! + (track.lat[i]! - track.lat[i - 1]!) * f,
              track.lon[i - 1]! + (track.lon[i]! - track.lon[i - 1]!) * f,
            ),
          );
        }
      }
    }
    for (const key of seen) this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.neighbourhood.clear();
  }

  /**
   * Visit count at a point. GPS error means the same street can land in
   * neighbouring cells on different days, so this takes the busiest cell in
   * the 3x3 neighbourhood.
   */
  countAt(lat: number, lon: number): number {
    return this.countInCell(this.cellOf(lat, lon));
  }

  private countInCell(cell: number): number {
    let best = this.neighbourhood.get(cell);
    if (best !== undefined) return best;
    const [cx, cy] = unpack(cell);
    best = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        best = Math.max(best, this.counts.get(pack(cx + dx, cy + dy)) ?? 0);
      }
    }
    this.neighbourhood.set(cell, best);
    return best;
  }

  /** Visit count for each point of a track, on a log scale (visit counts are very uneven). */
  series(track: LatLon): Float32Array {
    const out = new Float32Array(track.lat.length);
    let lastCell = NaN;
    let lastValue = 0;
    for (let i = 0; i < out.length; i++) {
      // Consecutive GPS points usually share a cell.
      const cell = this.cellOf(track.lat[i]!, track.lon[i]!);
      if (cell !== lastCell) {
        lastCell = cell;
        lastValue = Math.log(this.countInCell(cell));
      }
      out[i] = lastValue;
    }
    return out;
  }
}

// Cells are packed into one number (fast Map keys). Offsets keep both parts
// positive; 2^23 cells of 15 m covers the whole Earth in each direction.
const OFFSET = 2 ** 23;
const pack = (cx: number, cy: number) => (cx + OFFSET) * 2 ** 24 + (cy + OFFSET);
const unpack = (key: number): [number, number] => [Math.floor(key / 2 ** 24) - OFFSET, (key % 2 ** 24) - OFFSET];
