import { cleanTrack } from './clean';
import { anchorTrack, compressRadially, extent, fitBounds, MAX_QUANTILE_SAMPLE, quantiles } from './layout';
import { flatDistance, projectAround, unprojectFrom } from './track';
import { HeatGrid, paceSeries } from './values';
import type { ActivityType, Bounds, GeoPoint, LocalTrack, Track, Workout } from './types';

export const COLOR_MODES = ['pace', 'frequency'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

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
  /**
   * Lay routes over a map around this real-world point. Routes starting
   * within radiusM are drawn in their true position, and the fit is based on
   * them. Squashing is off (it would pull routes off the streets).
   */
  geoAnchor?: GeoAnchor | null;
}

/**
 * What to do with routes that start further than radiusM from the map's point:
 * 'omit' leaves them out; 'true' draws them where they really went (so they
 * match the map too), keeping only those that cross `view`; 'anchored' draws
 * them from the map's point, as without a map (they won't match the streets).
 */
export const OTHER_STARTS = ['true', 'anchored', 'omit'] as const;
export type OtherStarts = (typeof OTHER_STARTS)[number];

export interface GeoAnchor {
  lat: number;
  lon: number;
  radiusM: number;
  others: OtherStarts;
  /**
   * The area shown, in meters around the point. With 'true', routes that
   * never cross it are left out, so an image never carries routes (and
   * places) it doesn't show. Without it, the fitted bounds are used.
   */
  view?: Bounds | null;
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
  /** Each workout drawn, by start time, for the distance-over-time background. */
  timeline: { t: number; m: number }[];
  /** Which activity types are drawn, for wording like "412 runs". */
  activityTypes: ActivityType[];
  /**
   * With a geoAnchor: the point, how many routes start near it, how many
   * start elsewhere, and how many of those are drawn.
   */
  geoAnchor: { lat: number; lon: number; near: number; elsewhere: number; elsewhereDrawn: number } | null;
}

/**
 * An outdoor workout reduced to what drawing needs, computed once when data is
 * loaded: where it started, the anchored shape with its pace values and
 * extent, and the distance. Real-world positions (for the visit grid and the
 * street map) are worked back out from the shape and the start when needed,
 * so they aren't stored twice. The raw GPS track (timestamps, accuracy,
 * reported speed) is dropped, which cuts memory by about four fifths for
 * large histories.
 */
export interface PreparedWorkout {
  id: string;
  type: ActivityType;
  start: number;
  /** Where the workout started. */
  origin: GeoPoint;
  /** Anchored shape in meters from the start, with pace values and extent. */
  local: LocalTrack;
  distanceM: number;
}

/**
 * Prepares every outdoor workout with a usable GPS track; the rest are left
 * out. Ids are made unique here: per-workout values are keyed by id, and two
 * workouts of the same type can start in the same second (say, recorded by the
 * watch and by another app).
 */
export function prepareWorkouts(workouts: Workout[]): PreparedWorkout[] {
  const out: PreparedWorkout[] = [];
  const seen = new Map<string, number>();
  for (const w of workouts) {
    if (w.indoor || !w.track) continue;
    const track = cleanTrack(w.track);
    if (track.t.length < 2) continue;
    // Negate pace so larger always means "hotter" (faster).
    const pace = paceSeries(track);
    const value = new Float32Array(pace.length);
    for (let i = 0; i < pace.length; i++) value[i] = -pace[i]!;
    const copies = (seen.get(w.id) ?? 0) + 1;
    seen.set(w.id, copies);
    out.push({
      id: copies === 1 ? w.id : `${w.id}#${copies}`,
      type: w.type,
      start: w.start,
      origin: { lat: track.lat[0]!, lon: track.lon[0]! },
      local: { ...anchorTrack(track), value },
      distanceM: trackDistance(track),
    });
  }
  return out;
}

function filterWorkouts(workouts: PreparedWorkout[], filters: Filters): PreparedWorkout[] {
  return workouts.filter(
    (w) =>
      filters.types.includes(w.type) &&
      (filters.from === null || w.start >= filters.from) &&
      (filters.to === null || w.start <= filters.to),
  );
}

/**
 * Work kept between scenes by whoever builds them (the poster engine). Visit
 * counts depend only on which workouts are selected, so the last grid's values
 * are reused until the selection changes.
 */
export interface SceneCaches {
  heat?: { key: string; values: Map<string, Float32Array> };
}

function frequencyValues(selected: PreparedWorkout[], caches: SceneCaches): Map<string, Float32Array> {
  const key = selected.map((w) => w.id).join('|');
  if (caches.heat?.key !== key) {
    const heat = new HeatGrid();
    for (const w of selected) heat.add(positionsOf(w));
    caches.heat = { key, values: new Map(selected.map((w) => [w.id, heat.series(positionsOf(w))])) };
  }
  return caches.heat.values;
}

export function buildScene(workouts: PreparedWorkout[], filters: Filters, opts: LayoutOptions, caches: SceneCaches = {}): Scene {
  const matching = filterWorkouts(workouts, filters);
  const geo = opts.geoAnchor ?? null;
  const radialExponent = geo ? 1 : opts.radialExponent;

  // Each workout with its shape in the drawing's frame.
  let placed: { w: PreparedWorkout; local: LocalTrack; near: boolean }[];
  let nearCount = 0;
  let bounds: Bounds | null = null;
  if (!geo) {
    placed = matching.map((w) => ({ w, local: w.local, near: true }));
  } else {
    placed = [];
    for (const w of matching) {
      const near = flatDistance(geo.lat, geo.lon, w.origin.lat, w.origin.lon) <= geo.radiusM;
      if (near) nearCount++;
      if (near || geo.others === 'true') placed.push({ w, local: placeAround(w, geo), near });
      else if (geo.others === 'anchored') placed.push({ w, local: w.local, near });
    }
    if (geo.others === 'true') {
      // Fit to the routes that start at the point; others are kept where they cross the picture.
      const nearTracks = placed.filter((p) => p.near).map((p) => p.local);
      bounds = fitBounds(nearTracks.length ? nearTracks : placed.map((p) => p.local), opts.fitPercentile);
      const view = geo.view ?? bounds;
      placed = placed.filter((p) => p.near || overlaps(p.local.bbox, view));
    }
  }

  const selected = placed.map((p) => p.w);
  const heat = opts.colorMode === 'frequency' ? frequencyValues(selected, caches) : null;
  const tracks = compressRadially(
    placed.map(({ w, local }) => (heat ? { ...local, value: heat.get(w.id)! } : local)),
    radialExponent,
  );

  let first = Infinity;
  let last = -Infinity;
  for (const w of selected) {
    first = Math.min(first, w.start);
    last = Math.max(last, w.start);
  }
  const near = placed.filter((p) => p.near).length;

  return {
    tracks,
    bounds: bounds ?? fitBounds(tracks, opts.fitPercentile),
    domain: colorDomain(tracks, opts.colorMode),
    radialExponent,
    workoutCount: tracks.length,
    totalDistanceM: selected.reduce((sum, w) => sum + w.distanceM, 0),
    timeline: selected.map((w) => ({ t: w.start, m: w.distanceM })).sort((a, b) => a.t - b.t),
    activityTypes: [...new Set(selected.map((w) => w.type))],
    dateRange: selected.length ? [first, last] : null,
    geoAnchor: geo
      ? {
          lat: geo.lat,
          lon: geo.lon,
          near,
          elsewhere: matching.length - nearCount,
          elsewhereDrawn: placed.length - near,
        }
      : null,
  };
}

const overlaps = (a: Bounds, b: Bounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** A workout's real-world positions, worked back out from its shape and start. */
export function positionsOf(w: PreparedWorkout): { lat: Float64Array; lon: Float64Array } {
  return unprojectFrom(w.local.x, w.local.y, w.origin);
}

/** A route in meters east and north of a real-world point, rather than of its own start. */
function placeAround(w: PreparedWorkout, at: GeoPoint): LocalTrack {
  const { lat, lon } = positionsOf(w);
  const { x, y } = projectAround(lat, lon, at);
  return { x, y, value: w.local.value, bbox: extent(x, y) };
}

function colorDomain(tracks: LocalTrack[], mode: ColorMode): [number, number] {
  // Gather an even sample of values rather than all of them (there can be millions).
  const total = tracks.reduce((n, t) => n + t.value.length, 0);
  if (total === 0) return [0, 1];
  const stride = Math.max(1, Math.floor(total / MAX_QUANTILE_SAMPLE));
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
