import type { GeoPoint, Track } from './types';

export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  speed?: number;
  hAcc?: number;
}

export function trackFromPoints(points: TrackPoint[]): Track {
  const n = points.length;
  const track: Track = {
    t: new Float64Array(n),
    lat: new Float64Array(n),
    lon: new Float64Array(n),
    speed: new Float32Array(n),
    hAcc: new Float32Array(n),
  };
  points.forEach((p, i) => {
    track.t[i] = p.t;
    track.lat[i] = p.lat;
    track.lon[i] = p.lon;
    track.speed[i] = p.speed ?? NaN;
    track.hAcc[i] = p.hAcc ?? NaN;
  });
  return track;
}

const EARTH_RADIUS_M = 6_371_008.8;

export const METERS_PER_DEG_LAT = (EARTH_RADIUS_M * Math.PI) / 180;

/** Meters per degree of longitude at a latitude. */
export function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Distance in meters on a locally flat Earth. Accurate over the few meters
 * between GPS fixes and much cheaper than a great-circle formula.
 */
export function flatDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.hypot((lon2 - lon1) * metersPerDegLon(lat1), (lat2 - lat1) * METERS_PER_DEG_LAT);
}

/**
 * Positions as meters east (x) and north (y) of an origin, on a locally flat
 * Earth: exact enough over the few kilometers a drawing spans. Every
 * "meters around a point" in the project goes through this and its inverse.
 */
export function projectAround(lat: ArrayLike<number>, lon: ArrayLike<number>, origin: GeoPoint): { x: Float32Array; y: Float32Array } {
  const n = lat.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const mLon = metersPerDegLon(origin.lat);
  for (let i = 0; i < n; i++) {
    x[i] = (lon[i]! - origin.lon) * mLon;
    y[i] = (lat[i]! - origin.lat) * METERS_PER_DEG_LAT;
  }
  return { x, y };
}

/** Back from meters around an origin to degrees: the inverse of projectAround. */
export function unprojectFrom(x: ArrayLike<number>, y: ArrayLike<number>, origin: GeoPoint): { lat: Float64Array; lon: Float64Array } {
  const n = x.length;
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const mLon = metersPerDegLon(origin.lat);
  for (let i = 0; i < n; i++) {
    lat[i] = origin.lat + y[i]! / METERS_PER_DEG_LAT;
    lon[i] = origin.lon + x[i]! / mLon;
  }
  return { lat, lon };
}
