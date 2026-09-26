import { haversine } from './track';
import type { Track } from './types';

export interface CleanOptions {
  /** Points reporting worse horizontal accuracy than this are dropped. */
  maxAccuracyM: number;
  /**
   * Leading points must report at least this accuracy before the track is
   * considered locked. Watches often drift for a few seconds at the start,
   * which would draw a squiggle at the anchor of every route.
   */
  warmupAccuracyM: number;
  /** Points implying a faster jump than this are GPS glitches. */
  maxSpeedMps: number;
}

export const DEFAULT_CLEAN: CleanOptions = {
  maxAccuracyM: 30,
  warmupAccuracyM: 12,
  maxSpeedMps: 12,
};

/** Returns a copy of the track without warm-up drift, inaccurate points and jumps. */
export function cleanTrack(track: Track, opts: CleanOptions = DEFAULT_CLEAN): Track {
  const n = track.t.length;
  const keep: number[] = [];

  let start = 0;
  // A missing accuracy (NaN) compares false, so tracks without accuracy data start at once.
  while (start < n && track.hAcc[start]! > opts.warmupAccuracyM) start++;
  // If the track never locks to the warm-up accuracy, fall back to the normal threshold.
  if (start === n) start = 0;

  for (let i = start; i < n; i++) {
    const acc = track.hAcc[i]!;
    if (acc > opts.maxAccuracyM) continue;
    const prev = keep[keep.length - 1];
    if (prev !== undefined) {
      const dt = (track.t[i]! - track.t[prev]!) / 1000;
      if (dt <= 0) continue;
      const d = haversine(track.lat[prev]!, track.lon[prev]!, track.lat[i]!, track.lon[i]!);
      if (d / dt > opts.maxSpeedMps) continue;
    }
    keep.push(i);
  }

  return {
    t: Float64Array.from(keep, (i) => track.t[i]!),
    lat: Float64Array.from(keep, (i) => track.lat[i]!),
    lon: Float64Array.from(keep, (i) => track.lon[i]!),
    speed: Float32Array.from(keep, (i) => track.speed[i]!),
    hAcc: Float32Array.from(keep, (i) => track.hAcc[i]!),
  };
}
