import { Uint8ArrayWriter, type FileEntry } from '@zip.js/zip.js/lib/zip-core-native.js';
import type { ActivityType, Track, Workout } from '../core/types';
import { parseCsv } from './csv';
import { parseFit } from './fit';
import { parseGpx } from './gpx';
import type { Progress } from './health-export';
import { parseTcx } from './tcx';

/**
 * Reads the zip from Strava's "Download your account" request: activities.csv
 * lists every activity (type, date, and the file holding its track), and the
 * activities/ folder holds the tracks as FIT, GPX or TCX, most of them
 * gzipped. Only walks, runs and hikes are read; rides, swims and the rest are
 * skipped without opening their files.
 */

/** Strava's activity types, as its export names them. Virtual runs are indoors. */
const TYPES: Record<string, ActivityType> = {
  Run: 'running',
  'Trail Run': 'running',
  Walk: 'walking',
  Hike: 'hiking',
};

/** FIT sport codes, for when the export's types are in a language we don't know. */
const FIT_SPORTS: Record<number, ActivityType> = { 1: 'running', 11: 'walking', 17: 'hiking' };

/** The activities.csv of a Strava download, at the top of the zip or one folder down. */
export function findStravaCsv(files: FileEntry[]): FileEntry | undefined {
  return files.find((f) => /^(?:[^/]+\/)?activities\.csv$/.test(f.filename.replace(/^\/+/, '')));
}

export async function readStravaEntries(files: FileEntry[], onProgress?: (p: Progress) => void): Promise<Workout[]> {
  const csvEntry = findStravaCsv(files)!;
  const rows = parseCsv(new TextDecoder().decode(await csvEntry.getData(new Uint8ArrayWriter())));
  const header = rows[0] ?? [];
  const col = (name: string) => header.indexOf(name);
  const idCol = col('Activity ID');
  const dateCol = col('Activity Date');
  const typeCol = col('Activity Type');
  // The Filename column's name could be translated; its values can't.
  let fileCol = col('Filename');
  if (fileCol < 0) fileCol = header.findIndex((_, i) => rows.slice(1).some((r) => r[i]?.startsWith('activities/')));
  if (fileCol < 0) throw new Error("This looks like a Strava download, but its activities.csv doesn't list activity files.");

  const byPath = new Map(files.map((f) => [tail(f.filename), f]));
  const todo = rows.slice(1).flatMap((r) => {
    const path = r[fileCol];
    if (!path) return []; // manual entries have no file
    // With English headers, anything not on foot is skipped unopened. Otherwise
    // (a translated export) the sport is read from inside FIT files.
    const known = typeCol >= 0 ? TYPES[r[typeCol] ?? ''] : undefined;
    if (typeCol >= 0 && !known) return [];
    const file = byPath.get(tail(path)) ?? byPath.get(tail(path.replace(/\.gz$/, '')));
    return file ? [{ row: r, file, type: known ?? null }] : [];
  });

  const workouts: Workout[] = [];
  let done = 0;
  for (const { row, file, type } of todo) {
    onProgress?.({ stage: 'routes', done: done++, total: todo.length });
    let bytes: Uint8Array = await file.getData(new Uint8ArrayWriter());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
    const name = file.filename.replace(/\.gz$/, '').toLowerCase();
    let track: Track;
    let activity = type;
    if (name.endsWith('.fit')) {
      const fit = parseFit(bytes);
      track = fit.track;
      activity ??= fit.sport === null ? null : (FIT_SPORTS[fit.sport] ?? null);
    } else if (name.endsWith('.gpx')) {
      track = parseGpx(new TextDecoder().decode(bytes));
    } else if (name.endsWith('.tcx')) {
      track = parseTcx(new TextDecoder().decode(bytes));
    } else {
      continue;
    }
    if (!activity) continue;
    const n = track.t.length;
    const listed = parseStravaDate(row[dateCol] ?? '');
    const start = n ? track.t[0]! : listed;
    if (start === null) continue;
    workouts.push({
      id: `strava-${row[idCol] ?? start}`,
      type: activity,
      start,
      end: n ? track.t[n - 1]! : start,
      distanceM: null, // worked out from the track, as for Apple Health
      indoor: false,
      track: n ? track : null,
    });
  }
  onProgress?.({ stage: 'routes', done: todo.length, total: todo.length });
  return workouts;
}

/** "activities/123.fit.gz" from any path to it. */
const tail = (path: string) => path.split('/').slice(-2).join('/');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Strava's "Aug 24, 2024, 10:47:26 AM" (UTC) as Unix ms, or null. */
export function parseStravaDate(s: string): number | null {
  const m = s.match(/^(\w{3}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!);
  if (month < 0) return null;
  const hour = (Number(m[4]) % 12) + (m[7] === 'PM' ? 12 : 0);
  return Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5]), Number(m[6]));
}

/**
 * Unzips a .gz file with the platform's own decompressor. The bytes are fed
 * in as a stream, not a Blob: Safari won't let a worker read Blobs on a page
 * opened from disk.
 */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const reader = input.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
