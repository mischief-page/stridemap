import { BlobReader, ZipReader, type FileEntry, type Reader } from '@zip.js/zip.js';
import type { Workout } from '../core/types';
import { readHealthEntries, type Progress } from './health-export';
import { findStravaCsv, readStravaEntries } from './strava-export';

export type { Progress };

/**
 * Reads a zip of someone's workouts: an Apple Health export or a Strava
 * account download, told apart by what's inside (Strava's has an
 * activities.csv). The zip is streamed, entry by entry.
 */
export async function readExport(zip: Blob | Reader<unknown>, onProgress?: (p: Progress) => void): Promise<Workout[]> {
  const reader = new ZipReader(zip instanceof Blob ? new BlobReader(zip) : zip, { useWebWorkers: false });
  try {
    const files = (await reader.getEntries()).filter((e): e is FileEntry => !e.directory);
    return findStravaCsv(files) ? await readStravaEntries(files, onProgress) : await readHealthEntries(files, onProgress);
  } finally {
    await reader.close();
  }
}
