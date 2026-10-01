export type ActivityType = 'walking' | 'running' | 'hiking';

export const ACTIVITY_TYPES: ActivityType[] = ['walking', 'running', 'hiking'];

/**
 * A GPS track stored as parallel typed arrays, which keeps memory small and
 * lets tracks move between a Web Worker and the page without copying.
 */
export interface Track {
  /** Unix time in milliseconds. */
  t: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  /** Speed in m/s as reported by the device, or NaN when missing. */
  speed: Float32Array;
  /** Horizontal accuracy in meters, or NaN when missing. */
  hAcc: Float32Array;
}

export interface Workout {
  id: string;
  type: ActivityType;
  /** Unix time in milliseconds. */
  start: number;
  end: number;
  distanceM: number | null;
  indoor: boolean;
  track: Track | null;
}

/** A place on Earth, in degrees. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * A track converted to meters east (x) and north (y) of its anchor. Single
 * precision is plenty (well under a millimeter at these distances) and halves
 * memory for histories with millions of points.
 */
export interface LocalTrack {
  x: Float32Array;
  y: Float32Array;
  /** The value that drives color (pace or frequency) for each point. */
  value: Float32Array;
  /** Extent of x and y, including the anchor at (0, 0). */
  bbox: Bounds;
}

/**
 * Street-map features around a point, in the same meters-east/north frame as
 * the routes, from map tiles. Lines and polygons are flat arrays of
 * x, y pairs.
 */
export interface MapFeatures {
  water: Float32Array[][];
  parks: Float32Array[][];
  rivers: Float32Array[];
  majorRoads: Float32Array[];
  minorRoads: Float32Array[];
  paths: Float32Array[];
}

