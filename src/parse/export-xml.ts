import { SaxesParser } from 'saxes';
import type { ActivityType } from '../core/types';

/** A workout as described in export.xml, before its route file is read. */
export interface WorkoutEntry {
  type: ActivityType;
  start: number;
  end: number;
  distanceM: number | null;
  indoor: boolean;
  /** Path of the GPX file inside the export, e.g. "/workout-routes/route_2024-05-01_7.12am.gpx". */
  routePath: string | null;
}

const ACTIVITY_TYPES: Record<string, ActivityType> = {
  HKWorkoutActivityTypeWalking: 'walking',
  HKWorkoutActivityTypeRunning: 'running',
  HKWorkoutActivityTypeHiking: 'hiking',
};

const DISTANCE_STAT = 'HKQuantityTypeIdentifierDistanceWalkingRunning';

const METERS_PER_UNIT: Record<string, number> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };

/**
 * Streaming parser for export.xml. The file is often several gigabytes, so
 * chunks are pushed in with write() and only walk/run/hike workouts are kept.
 * Handles both the pre-iOS 16 layout (totalDistance attributes on <Workout>)
 * and the newer one (<WorkoutStatistics> children).
 */
export class ExportXmlParser {
  readonly workouts: WorkoutEntry[] = [];
  private parser = new SaxesParser();
  private current: WorkoutEntry | null = null;
  private inRoute = false;

  constructor() {
    this.parser.on('opentag', (node) => {
      const a = node.attributes as Record<string, string>;
      if (node.name === 'Workout') {
        const type = ACTIVITY_TYPES[a.workoutActivityType ?? ''];
        if (!type) return;
        this.current = {
          type,
          start: parseHealthDate(a.startDate),
          end: parseHealthDate(a.endDate),
          distanceM: toMeters(a.totalDistance, a.totalDistanceUnit),
          indoor: false,
          routePath: null,
        };
        return;
      }
      const w = this.current;
      if (!w) return;
      switch (node.name) {
        case 'MetadataEntry':
          if (!this.inRoute && a.key === 'HKIndoorWorkout') w.indoor = a.value === '1';
          break;
        case 'WorkoutStatistics':
          if (a.type === DISTANCE_STAT) w.distanceM = toMeters(a.sum, a.unit) ?? w.distanceM;
          break;
        case 'WorkoutRoute':
          this.inRoute = true;
          break;
        case 'FileReference':
          if (this.inRoute && a.path) w.routePath = a.path;
          break;
      }
    });
    this.parser.on('closetag', (node) => {
      if (node.name === 'WorkoutRoute') this.inRoute = false;
      if (node.name === 'Workout' && this.current) {
        this.workouts.push(this.current);
        this.current = null;
      }
    });
  }

  write(chunk: string): void {
    this.parser.write(chunk);
  }

  close(): WorkoutEntry[] {
    this.parser.close();
    return this.workouts;
  }
}

/** Parses Health's "2024-05-01 07:12:03 -0700" format to Unix ms. */
export function parseHealthDate(s: string | undefined): number {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (!m) return s ? Date.parse(s) : NaN;
  return Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
}

function toMeters(value: string | undefined, unit: string | undefined): number | null {
  const n = Number(value);
  const k = METERS_PER_UNIT[unit ?? ''];
  return value !== undefined && Number.isFinite(n) && k ? n * k : null;
}
