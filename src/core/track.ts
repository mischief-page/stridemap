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
const DEG = Math.PI / 180;

/** Great-circle distance in meters. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const METERS_PER_DEG_LAT = EARTH_RADIUS_M * DEG;
