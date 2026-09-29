/**
 * Writes a fake Apple Health export.zip built from the synthetic workouts, for
 * testing the import path without anyone's real data.
 *
 *   npm run sample-export -- out/sample-export.zip 60
 */
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { syntheticWorkouts } from '../src/sample/synthetic';

export async function makeSampleExport(path: string, count: number): Promise<void> {
  const fmt = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' +0000';
  const types = { running: 'Running', walking: 'Walking', hiking: 'Hiking' } as const;
  const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE HealthData [\n<!ELEMENT HealthData ANY>\n]>\n<HealthData locale="en_US">\n';
  for (const w of syntheticWorkouts(count)) {
    const file = `route_${w.id}.gpx`;
    xml += ` <Workout workoutActivityType="HKWorkoutActivityType${types[w.type]}" startDate="${fmt(w.start)}" endDate="${fmt(w.end)}">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="${(w.distanceM! / 1000).toFixed(2)}" unit="km"/>
  <WorkoutRoute><FileReference path="/workout-routes/${file}"/></WorkoutRoute>
 </Workout>\n`;
    const t = w.track!;
    const points: string[] = [];
    for (let i = 0; i < t.t.length; i++) {
      points.push(
        `<trkpt lon="${t.lon[i]}" lat="${t.lat[i]}"><time>${new Date(t.t[i]!).toISOString()}</time><extensions><speed>${t.speed[i]}</speed><hAcc>${t.hAcc[i]}</hAcc></extensions></trkpt>`,
      );
    }
    const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>\n${points.join('\n')}\n</trkseg></trk></gpx>`;
    await zip.add(`apple_health_export/workout-routes/${file}`, new TextReader(gpx));
  }
  xml += '</HealthData>\n';
  await zip.add('apple_health_export/export.xml', new TextReader(xml));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await (await zip.close()).arrayBuffer()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [path = 'out/sample-export.zip', count = '60'] = process.argv.slice(2);
  await makeSampleExport(path, Number(count));
  console.log(`Wrote ${path}`);
}
