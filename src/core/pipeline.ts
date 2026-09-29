import { cleanTrack } from './clean';
import { anchorTrack, compressRadially, fitBounds, quantiles } from './layout';
import { flatDistance } from './track';
import { HeatGrid, paceSeries } from './values';
import type { ActivityType, Bounds, LocalTrack, Track, Workout } from './types';

export type ColorMode = 'pace' | 'frequency';

export interface Filters {
  types: ActivityType[];
  /** Unix ms, inclusive; null for no limit. */
  from: number | null;
  to: number | null;
}

export interface LayoutOptions {
  colorMode: ColorMode;
  /** Share of workouts (50–100) that must fit fully on the canvas. */
  fitPercentile: number;
  /** 1 is true scale; lower values pull long routes inward. */
  radialExponent: number;
}

export interface Scene {
  tracks: LocalTrack[];
  bounds: Bounds;
  /**
   * The value range mapped onto the color scale. Values are oriented so the
   * low end is color A and the high end color B: slow to fast for pace, rare
   * to frequent for frequency.
   */
  domain: [number, number];
  /** Carried through so the renderer can draw an accurate distance scale. */
  radialExponent: number;
  workoutCount: number;
  /** Start times of the first and last workout drawn, or null if none. */
  dateRange: [number, number] | null;
  /** Total GPS distance of the workouts drawn, in meters. */
  totalDistanceM: number;
  /** Which activity types are drawn, for wording like "412 runs". */
  activityTypes: ActivityType[];
}

/**
 * An outdoor workout reduced to what drawing needs, computed once when data is
 * loaded: the cleaned positions (for the real-world visit grid), the anchored
 * shape with its pace values and extent, and the distance. The raw GPS track
 * (timestamps, accuracy, reported speed) can then be dropped, which cuts memory
 * by about two thirds for large histories.
 */
export interface PreparedWorkout {
  id: string;
  type: ActivityType;
  start: number;
  lat: Float64Array;
  lon: Float64Array;
  /** Anchored shape in meters from the start, with pace values and extent. */
  local: LocalTrack;
  distanceM: number;
}

/** Prepares every outdoor workout with a usable GPS track; the rest are left out. */
export function prepareWorkouts(workouts: Workout[]): PreparedWorkout[] {
  const out: PreparedWorkout[] = [];
  for (const w of workouts) {
    if (w.indoor || !w.track) continue;
    const track = cleanTrack(w.track);
    if (track.t.length < 2) continue;
    // Negate pace so larger always means "hotter" (faster).
    const pace = paceSeries(track);
    const value = new Float32Array(pace.length);
    for (let i = 0; i < pace.length; i++) value[i] = -pace[i]!;
    out.push({
      id: w.id,
      type: w.type,
      start: w.start,
      lat: track.lat,
      lon: track.lon,
      local: { ...anchorTrack(track), value },
      distanceM: trackDistance(track),
    });
  }
  return out;
}

export function filterWorkouts(workouts: PreparedWorkout[], filters: Filters): PreparedWorkout[] {
  return workouts.filter(
    (w) =>
      filters.types.includes(w.type) &&
      (filters.from === null || w.start >= filters.from) &&
      (filters.to === null || w.start <= filters.to),
  );
}

/**
 * Visit counts depend only on which workouts are selected, so the last grid's
 * values are reused until the selection changes.
 */
let heatCache: { key: string; values: Map<string, Float32Array> } | null = null;

function frequencyValues(selected: PreparedWorkout[]): Map<string, Float32Array> {
  const key = selected.map((w) => w.id).join('|');
  if (heatCache?.key !== key) {
    const heat = new HeatGrid();
    for (const w of selected) heat.add(w);
    heatCache = { key, values: new Map(selected.map((w) => [w.id, heat.series(w)])) };
  }
  return heatCache.values;
}

export function buildScene(workouts: PreparedWorkout[], filters: Filters, opts: LayoutOptions): Scene {
  const selected = filterWorkouts(workouts, filters);
  const heat = opts.colorMode === 'frequency' ? frequencyValues(selected) : null;
  const tracks = compressRadially(
    selected.map((w) => (heat ? { ...w.local, value: heat.get(w.id)! } : w.local)),
    opts.radialExponent,
  );

  let first = Infinity;
  let last = -Infinity;
  for (const w of selected) {
    first = Math.min(first, w.start);
    last = Math.max(last, w.start);
  }

  return {
    tracks,
    bounds: fitBounds(tracks, opts.fitPercentile),
    domain: colorDomain(tracks, opts.colorMode),
    radialExponent: opts.radialExponent,
    workoutCount: tracks.length,
    totalDistanceM: selected.reduce((sum, w) => sum + w.distanceM, 0),
    activityTypes: [...new Set(selected.map((w) => w.type))],
    dateRange: selected.length ? [first, last] : null,
  };
}

function colorDomain(tracks: LocalTrack[], mode: ColorMode): [number, number] {
  // Gather an even sample of values rather than all of them (there can be millions).
  const total = tracks.reduce((n, t) => n + t.value.length, 0);
  if (total === 0) return [0, 1];
  const stride = Math.max(1, Math.floor(total / 200_000));
  const sample: number[] = [];
  let i = 0;
  for (const t of tracks) {
    for (; i < t.value.length; i += stride) sample.push(t.value[i]!);
    i -= t.value.length;
  }
  // Pace is clipped to its 5th–95th percentile so a single GPS glitch can't
  // stretch the scale. Frequency starts at 0 (log of one visit), so streets
  // visited once always get color A, and tops out at the 99th percentile.
  const [p05, p95, p99] = quantiles(sample, [0.05, 0.95, 0.99]) as [number, number, number];
  const lo = mode === 'frequency' ? 0 : p05;
  const hi = mode === 'frequency' ? p99 : p95;
  return [lo, hi > lo ? hi : lo + 1];
}

function trackDistance(track: Track): number {
  let total = 0;
  for (let i = 1; i < track.t.length; i++) {
    total += flatDistance(track.lat[i - 1]!, track.lon[i - 1]!, track.lat[i]!, track.lon[i]!);
  }
  return total;
}
