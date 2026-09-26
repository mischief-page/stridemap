import { haversine, METERS_PER_DEG_LAT } from './track';
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
      const d = haversine(track.lat[i - 1]!, track.lon[i - 1]!, track.lat[i]!, track.lon[i]!);
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

/**
 * Counts how many distinct workouts passed through each cell of a real-world
 * grid. Cells are measured on the ground, not in the anchored drawing, so a
 * street is "hot" when it was actually visited often, wherever the workouts
 * started.
 */
export class HeatGrid {
  private counts = new Map<string, number>();

  constructor(private readonly cellM = 15) {}

  private cellOf(lat: number, lon: number): [number, number] {
    const cy = Math.floor((lat * METERS_PER_DEG_LAT) / this.cellM);
    // Use the latitude of the cell's own row so the column width is stable.
    const rowLat = ((cy + 0.5) * this.cellM) / METERS_PER_DEG_LAT;
    const mPerDegLon = METERS_PER_DEG_LAT * Math.cos((rowLat * Math.PI) / 180);
    const cx = Math.floor((lon * mPerDegLon) / this.cellM);
    return [cx, cy];
  }

  add(track: Track): void {
    const seen = new Set<string>();
    const visit = (lat: number, lon: number) => {
      const [cx, cy] = this.cellOf(lat, lon);
      seen.add(`${cx},${cy}`);
    };
    const n = track.t.length;
    for (let i = 0; i < n; i++) {
      visit(track.lat[i]!, track.lon[i]!);
      // Fill gaps between sparse points so a fast segment doesn't skip cells.
      if (i > 0) {
        const d = haversine(track.lat[i - 1]!, track.lon[i - 1]!, track.lat[i]!, track.lon[i]!);
        const steps = Math.floor(d / (this.cellM / 2));
        for (let s = 1; s < steps; s++) {
          const f = s / steps;
          visit(
            track.lat[i - 1]! + (track.lat[i]! - track.lat[i - 1]!) * f,
            track.lon[i - 1]! + (track.lon[i]! - track.lon[i - 1]!) * f,
          );
        }
      }
    }
    for (const key of seen) this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  /**
   * Visit count at a point. GPS error means the same street can land in
   * neighbouring cells on different days, so this takes the busiest cell in
   * the 3x3 neighbourhood.
   */
  countAt(lat: number, lon: number): number {
    const [cx, cy] = this.cellOf(lat, lon);
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        best = Math.max(best, this.counts.get(`${cx + dx},${cy + dy}`) ?? 0);
      }
    }
    return best;
  }

  /** Visit count for each point of a track, on a log scale (visit counts are very uneven). */
  series(track: Track): Float64Array {
    return Float64Array.from(track.lat, (lat, i) => Math.log(this.countAt(lat, track.lon[i]!)));
  }
}
