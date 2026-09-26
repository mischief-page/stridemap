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

/** A track converted to meters east (x) and north (y) of its anchor. */
export interface LocalTrack {
  workoutId: string;
  x: Float64Array;
  y: Float64Array;
  /** The value that drives color (pace or frequency) for each point. */
  value: Float64Array;
}
