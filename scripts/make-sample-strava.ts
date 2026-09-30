/**
 * Writes a fake Strava account download (the zip from "Download your
 * account") built from the synthetic workouts, for testing the import path
 * without anyone's real data. It mixes the track formats a real download has
 * (gzipped FIT, GPX, gzipped TCX) and includes activities that must be
 * skipped: rides, a virtual run and a manual entry with no file.
 *
 *   npx tsx scripts/make-sample-strava.ts out/strava-export.zip 30
 */
import { Encoder, Profile } from '@garmin/fitsdk';
import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Track, Workout } from '../src/core/types';
import { syntheticWorkouts } from '../src/sample/synthetic';

const TYPES = { running: 'Run', walking: 'Walk', hiking: 'Hike' } as const;
const SEMICIRCLES = 2 ** 31 / 180;
const utf8 = (s: string) => new TextEncoder().encode(s);

/** Strava's "Aug 24, 2024, 10:47:26 AM" in UTC. */
function stravaDate(t: number): string {
  const d = new Date(t);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const h = d.getUTCHours();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h % 12 || 12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
}

export function fitFile(w: Workout): Uint8Array {
  const t = w.track!;
  const encoder = new Encoder();
  // The SDK's typings don't list each message's fields.
  const write = (num: number | undefined, fields: Record<string, unknown>) => encoder.onMesg(num!, fields as never);
  write(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: new Date(w.start), type: 'activity' });
  for (let i = 0; i < t.t.length; i++) {
    write(Profile.MesgNum.RECORD, {
      timestamp: new Date(t.t[i]!),
      positionLat: Math.round(t.lat[i]! * SEMICIRCLES),
      positionLong: Math.round(t.lon[i]! * SEMICIRCLES),
      enhancedSpeed: Number.isFinite(t.speed[i]) ? t.speed[i] : undefined,
    });
  }
  write(Profile.MesgNum.SESSION, {
    timestamp: new Date(w.end),
    startTime: new Date(w.start),
    sport: w.type,
    totalElapsedTime: (w.end - w.start) / 1000,
  });
  return encoder.close();
}

export function gpxFile(t: Track): string {
  const pts = Array.from(t.t, (time, i) => `<trkpt lat="${t.lat[i]}" lon="${t.lon[i]}"><ele>180.2</ele><time>${new Date(time).toISOString().replace('.000', '')}</time></trkpt>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><time>${new Date(t.t[0]!).toISOString()}</time></metadata><trk><name>Morning Run</name><type>running</type><trkseg>\n${pts.join('\n')}\n</trkseg></trk></gpx>`;
}

export function tcxFile(t: Track): string {
  const pts = Array.from(t.t, (time, i) => `<Trackpoint><Time>${new Date(time).toISOString()}</Time><Position><LatitudeDegrees>${t.lat[i]}</LatitudeDegrees><LongitudeDegrees>${t.lon[i]}</LongitudeDegrees></Position><AltitudeMeters>180.0</AltitudeMeters></Trackpoint>`);
  // Strava's TCX files start with whitespace before the XML declaration.
  return `          <?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${new Date(t.t[0]!).toISOString()}</Id><Lap><Track>\n${pts.join('\n')}\n</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export async function makeSampleStrava(path: string, count: number): Promise<{ onFoot: number }> {
  const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
  const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Filename,Moving Time,Distance';
  const rows: string[] = [header];
  const workouts = syntheticWorkouts(count);
  let id = 10_000_000_000;
  for (const [i, w] of workouts.entries()) {
    id++;
    const format = ['fit', 'gpx', 'tcx'][i % 3]!;
    const file = `activities/${id}.${format === 'gpx' ? 'gpx' : `${format}.gz`}`;
    const bytes =
      format === 'fit' ? gzipSync(fitFile(w)) : format === 'gpx' ? utf8(gpxFile(w.track!)) : gzipSync(utf8(tcxFile(w.track!)));
    await zip.add(file, new Uint8ArrayReader(new Uint8Array(bytes)));
    const km = (w.distanceM! / 1000).toFixed(2);
    // A description with a comma, a quote and a line break, as people write them.
    const description = i === 0 ? 'Easy one, "legs" tired.\nNice weather.' : '';
    rows.push([id, q(stravaDate(w.start)), q(`${TYPES[w.type]} ${i}`), TYPES[w.type], q(description), Math.round((w.end - w.start) / 1000), km, file, Math.round((w.end - w.start) / 1000), w.distanceM!.toFixed(1)].join(','));
  }
  // Activities that aren't drawn: two rides with tracks, a virtual run, and a manual walk.
  const ride = workouts[0]!;
  for (const name of ['Ride', 'Ride']) {
    id++;
    await zip.add(`activities/${id}.fit.gz`, new Uint8ArrayReader(new Uint8Array(gzipSync(fitFile(ride)))));
    rows.push(`${id},${q(stravaDate(ride.start))},Commute,${name},"",1800,12.0,activities/${id}.fit.gz,1700,12000.0`);
  }
  id++;
  await zip.add(`activities/${id}.fit.gz`, new Uint8ArrayReader(new Uint8Array(gzipSync(fitFile(ride)))));
  rows.push(`${id},${q(stravaDate(ride.start))},Zwift Run,Virtual Run,"",1800,5.0,activities/${id}.fit.gz,1700,5000.0`);
  rows.push(`${id + 1},${q(stravaDate(ride.start))},Walk with dog,Walk,"",1800,2.0,,1700,2000.0`);

  await zip.add('activities.csv', new Uint8ArrayReader(utf8(rows.join('\n') + '\n')));
  await zip.add('profile.csv', new Uint8ArrayReader(utf8('Athlete ID,First Name\n1,Sam\n')));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await (await zip.close()).arrayBuffer()));
  return { onFoot: workouts.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [path = 'out/strava-export.zip', count = '30'] = process.argv.slice(2);
  await makeSampleStrava(path, Number(count));
  console.log(`Wrote ${path}`);
}
