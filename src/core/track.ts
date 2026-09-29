import type { Track } from './types';

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
