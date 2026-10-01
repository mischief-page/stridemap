import { flatDistance, METERS_PER_DEG_LAT, metersPerDegLon } from '../core/track';
import type { GeoPoint } from '../core/types';

export type { GeoPoint };

/** How close a route's start must be to the map's point to be drawn on the map. */
export const NEAR_RADIUS_M = 300;

/**
 * The most common starting spot: start points are counted on a ~100 m grid,
 * the busiest neighbourhood wins, and the result is the average of the starts
 * within NEAR_RADIUS_M of it. Runs entirely in the browser.
 */
export function detectHome(starts: GeoPoint[]): (GeoPoint & { near: number; total: number }) | null {
  if (!starts.length) return null;
  const cell = 100;
  const lat0 = starts[0]!.lat;
  const mLon = metersPerDegLon(lat0);
  const key = (p: GeoPoint) => [Math.floor((p.lon * mLon) / cell), Math.floor((p.lat * METERS_PER_DEG_LAT) / cell)] as const;
  const counts = new Map<string, number>();
  for (const p of starts) {
    const [cx, cy] = key(p);
    counts.set(`${cx},${cy}`, (counts.get(`${cx},${cy}`) ?? 0) + 1);
  }
  // Busiest 3×3 neighbourhood of cells.
  let best = starts[0]!;
  let bestCount = -1;
  for (const p of starts) {
    const [cx, cy] = key(p);
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) n += counts.get(`${cx + dx},${cy + dy}`) ?? 0;
    if (n > bestCount) {
      bestCount = n;
      best = p;
    }
  }
  const near = starts.filter((p) => flatDistance(best.lat, best.lon, p.lat, p.lon) <= NEAR_RADIUS_M);
  const lat = near.reduce((s, p) => s + p.lat, 0) / near.length;
  const lon = near.reduce((s, p) => s + p.lon, 0) / near.length;
  return {
    lat,
    lon,
    near: starts.filter((p) => flatDistance(lat, lon, p.lat, p.lon) <= NEAR_RADIUS_M).length,
    total: starts.length,
  };
}
