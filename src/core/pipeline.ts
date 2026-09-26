import { cleanTrack } from './clean';
import { anchorTrack, compressRadially, fitBounds, quantile, type Bounds } from './layout';
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
  workoutCount: number;
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

export function buildScene(workouts: Workout[], filters: Filters, opts: LayoutOptions): Scene {
  const selected = filterWorkouts(workouts, filters)
    .map((w) => ({ id: w.id, track: cleanTrack(w.track as Track) }))
    .filter((w) => w.track.t.length >= 2);

  let heat: HeatGrid | null = null;
  if (opts.colorMode === 'frequency') {
    heat = new HeatGrid();
    for (const w of selected) heat.add(w.track);
  }

  let tracks: LocalTrack[] = selected.map((w) => {
    const { x, y } = anchorTrack(w.track);
    // Negate pace so larger always means "hotter" (faster).
    const value = heat ? heat.series(w.track) : paceSeries(w.track).map((p) => -p);
    return { workoutId: w.id, x, y, value };
  });

  tracks = compressRadially(tracks, opts.radialExponent);

  return {
    tracks,
    bounds: fitBounds(tracks, opts.fitPercentile),
    domain: colorDomain(tracks, opts.colorMode),
    workoutCount: tracks.length,
  };
}

function colorDomain(tracks: LocalTrack[], mode: ColorMode): [number, number] {
  const all: number[] = [];
  for (const t of tracks) for (const v of t.value) all.push(v);
  if (all.length === 0) return [0, 1];
  // Pace is clipped to its 5th–95th percentile so a single GPS glitch can't
  // stretch the scale. Frequency starts at 0 (log of one visit), so streets
  // visited once always get color A, and tops out at the 99th percentile.
  const lo = mode === 'frequency' ? 0 : quantile(all, 0.05);
  const hi = quantile(all, mode === 'frequency' ? 0.99 : 0.95);
  return [lo, hi > lo ? hi : lo + 1];
}
