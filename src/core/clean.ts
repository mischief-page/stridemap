import { METERS_PER_DEG_LAT, metersPerDegLon } from './track';
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

  // Flat-earth distance (see flatDistance), with the longitude scale computed once per track.
  const mPerDegLon = n ? metersPerDegLon(track.lat[0]!) : 0;
  const maxSpeed2 = opts.maxSpeedMps * opts.maxSpeedMps;
  let prev = -1;
  for (let i = start; i < n; i++) {
    if (track.hAcc[i]! > opts.maxAccuracyM) continue;
    if (prev !== -1) {
      const dt = (track.t[i]! - track.t[prev]!) / 1000;
      if (dt <= 0) continue;
      const dx = (track.lon[i]! - track.lon[prev]!) * mPerDegLon;
      const dy = (track.lat[i]! - track.lat[prev]!) * METERS_PER_DEG_LAT;
      if (dx * dx + dy * dy > maxSpeed2 * dt * dt) continue;
    }
    keep.push(i);
    prev = i;
  }

  const m = keep.length;
  const out: Track = {
    t: new Float64Array(m),
    lat: new Float64Array(m),
    lon: new Float64Array(m),
    speed: new Float32Array(m),
    hAcc: new Float32Array(m),
  };
  for (let k = 0; k < m; k++) {
    const i = keep[k]!;
    out.t[k] = track.t[i]!;
    out.lat[k] = track.lat[i]!;
    out.lon[k] = track.lon[i]!;
    out.speed[k] = track.speed[i]!;
    out.hAcc[k] = track.hAcc[i]!;
  }
  return out;
}
