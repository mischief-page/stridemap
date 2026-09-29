import { cleanTrack } from './clean';
import { anchorTrack, compressRadially, fitBounds, quantiles, type Bounds } from './layout';
import { METERS_PER_DEG_LAT } from './track';
import { HeatGrid, paceSeries } from './values';
import type { ActivityType, LocalTrack, Track, Workout } from './types';

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

export function filterWorkouts(workouts: Workout[], filters: Filters): Workout[] {
  return workouts.filter(
    (w) =>
      !w.indoor &&
      w.track !== null &&
      filters.types.includes(w.type) &&
      (filters.from === null || w.start >= filters.from) &&
      (filters.to === null || w.start <= filters.to),
  );
}

/** Per-workout work that no setting changes: cleaned GPS, anchored shape and pace. Computed once. */
interface Prepared {
  track: Track;
  x: Float64Array;
  y: Float64Array;
  /** Negated pace, so larger always means "hotter" (faster). */
  speedValue: Float64Array;
  /** Length of the cleaned GPS track, in meters. */
  distanceM: number;
}
const prepared = new WeakMap<Workout, Prepared | null>();

function prepare(w: Workout): Prepared | null {
  let p = prepared.get(w);
  if (p === undefined) {
    const track = cleanTrack(w.track as Track);
    p =
      track.t.length >= 2
        ? { track, ...anchorTrack(track), speedValue: paceSeries(track).map((v) => -v), distanceM: trackDistance(track) }
        : null;
    prepared.set(w, p);
  }
  return p;
}

/**
 * Visit counts depend only on which workouts are selected, so the last grid
 * (and each workout's values from it) is reused until the selection changes.
 */
let heatCache: { key: string; values: WeakMap<Workout, Float64Array> } | null = null;

function frequencyValues(selected: { w: Workout; p: Prepared }[]): Map<Workout, Float64Array> {
  const key = selected.map((s) => s.w.id).join('|');
  if (heatCache?.key !== key) {
    const heat = new HeatGrid();
    for (const s of selected) heat.add(s.p.track);
    const values = new WeakMap<Workout, Float64Array>();
    for (const s of selected) values.set(s.w, heat.series(s.p.track));
    heatCache = { key, values };
  }
  const cache = heatCache.values;
  return new Map(selected.map((s) => [s.w, cache.get(s.w)!]));
}

export function buildScene(workouts: Workout[], filters: Filters, opts: LayoutOptions): Scene {
  const selected = filterWorkouts(workouts, filters)
    .map((w) => ({ w, p: prepare(w) }))
    .filter((s): s is { w: Workout; p: Prepared } => s.p !== null);

  const heat = opts.colorMode === 'frequency' ? frequencyValues(selected) : null;
  let tracks: LocalTrack[] = selected.map(({ w, p }) => ({
    workoutId: w.id,
    x: p.x,
    y: p.y,
    value: heat ? heat.get(w)! : p.speedValue,
  }));

  tracks = compressRadially(tracks, opts.radialExponent);

  return {
    tracks,
    bounds: fitBounds(tracks, opts.fitPercentile),
    domain: colorDomain(tracks, opts.colorMode),
    radialExponent: opts.radialExponent,
    workoutCount: tracks.length,
    totalDistanceM: selected.reduce((sum, s) => sum + s.p.distanceM, 0),
    activityTypes: [...new Set(selected.map((s) => s.w.type))],
    dateRange: selected.length
      ? [Math.min(...selected.map((s) => s.w.start)), Math.max(...selected.map((s) => s.w.start))]
      : null,
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

/** Flat-earth length of a track; accurate over the few meters between GPS fixes. */
function trackDistance(track: Track): number {
  const mPerDegLon = METERS_PER_DEG_LAT * Math.cos((track.lat[0]! * Math.PI) / 180);
  let total = 0;
  for (let i = 1; i < track.t.length; i++) {
    total += Math.hypot(
      (track.lon[i]! - track.lon[i - 1]!) * mPerDegLon,
      (track.lat[i]! - track.lat[i - 1]!) * METERS_PER_DEG_LAT,
    );
  }
  return total;
}
