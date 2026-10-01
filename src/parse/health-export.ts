import { Uint8ArrayWriter, type FileEntry } from '@zip.js/zip.js/lib/zip-core-native.js';
import type { Workout } from '../core/types';
import { ExportXmlParser } from './export-xml';
import { parseGpx } from './gpx';

export type Progress =
  | { stage: 'workouts'; done: number; total: number }
  | { stage: 'routes'; done: number; total: number };

/**
 * Reads the export.zip from the Health app ("Export All Health Data") and
 * returns every walk, run and hike with its GPS track. The zip and the large
 * export.xml inside it are streamed, never loaded whole.
 */
export async function readHealthEntries(files: FileEntry[], onProgress?: (p: Progress) => void): Promise<Workout[]> {
  const xmlEntry = findExportXml(files);
  if (!xmlEntry) throw new Error('No export.xml or activities.csv found. Is this an Apple Health export or a Strava download?');

  const parser = new ExportXmlParser();
  const decoder = new TextDecoderStream();
  const written = xmlEntry.getData(decoder.writable, {
    onprogress: async (done, total) => onProgress?.({ stage: 'workouts', done, total }),
  });
  const text = decoder.readable.getReader();
  const parse = async () => {
    for (;;) {
      const { value, done } = await text.read();
      if (done) break;
      parser.write(value);
    }
  };
  // Waited on together, so a failure on either side is reported, not left unhandled.
  await Promise.all([parse(), written]);
  const entries = parser.close();

  const routes = new Map(files.map((f) => [routeKey(f.filename), f]));
  const utf8 = new TextDecoder();
  const workouts: Workout[] = [];
  let routesRead = 0;
  const routeTotal = entries.filter((e) => e.routePath && !e.indoor).length;

  for (const e of entries) {
    let track = null;
    if (e.routePath && !e.indoor) {
      const file = routes.get(routeKey(e.routePath));
      // Bytes plus TextDecoder rather than zip.js's TextWriter, which goes via a
      // Blob: Safari won't let a worker read Blobs on a page opened from disk.
      if (file) track = parseGpx(utf8.decode(await file.getData(new Uint8ArrayWriter())));
      onProgress?.({ stage: 'routes', done: ++routesRead, total: routeTotal });
    }
    workouts.push({
      id: `${e.type}-${e.start}`,
      type: e.type,
      start: e.start,
      end: e.end,
      distanceM: e.distanceM,
      indoor: e.indoor,
      track,
    });
  }
  return workouts;
}

/**
 * The main XML file sits at the top of the export folder. Its name is
 * localised in some languages, so fall back to the largest top-level XML that
 * isn't the clinical-records file.
 */
function findExportXml(files: FileEntry[]): FileEntry | undefined {
  const topLevelXml = files.filter((f) => {
    const depth = normalizePath(f.filename).split('/').length;
    return depth <= 2 && f.filename.endsWith('.xml') && !f.filename.endsWith('_cda.xml');
  });
  return (
    topLevelXml.find((f) => f.filename.endsWith('/export.xml') || f.filename === 'export.xml') ??
    topLevelXml.sort((a, b) => b.uncompressedSize - a.uncompressedSize)[0]
  );
}

/**
 * export.xml refers to routes as "/workout-routes/route_….gpx" while the zip
 * nests them under the export folder, so match on the last two path parts.
 */
function routeKey(path: string): string {
  return path.split('/').slice(-2).join('/');
}

function normalizePath(p: string): string {
  return p.replace(/^\/+/, '');
}
