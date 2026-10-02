/// <reference lib="webworker" />
import { Reader } from '@zip.js/zip.js/lib/zip-core-native.js';
import { prepareWithReport } from '../core/pipeline';
import type { Workout } from '../core/types';
import { readExport, type Progress } from '../parse/import';
import { PosterEngine, type MapResult, type PosterRequest } from '../app/poster';
import { MapLoader } from '../map/tiles';
import { NO_ROUTES } from './messages';
import { syntheticWorkouts } from '../sample/synthetic';

/**
 * The page's engine. It holds the workouts and does all the heavy work (reading
 * the export, building the scene, writing the SVG) off the page's main thread,
 * so the controls stay responsive however many routes there are. Everything
 * stays on this device.
 */

export type EngineRequest =
  // Each load is numbered; only the newest one's results are kept.
  | { kind: 'load-file'; load: number; size: number }
  | { kind: 'chunk'; id: number; buffer: ArrayBuffer }
  | { kind: 'load-sample'; load: number }
  | ({ kind: 'render'; seq: number } & PosterRequest);

export type { MapResult };

export type EngineMessage =
  | { kind: 'read'; load: number; id: number; offset: number; length: number }
  | { kind: 'progress'; load: number; progress: Progress }
  | { kind: 'loaded'; load: number; withGps: number; duplicates: number; firstStart: number | null; lastStart: number | null }
  | { kind: 'rendered'; seq: number; svg: string; width: number; height: number; shown: number; withGps: number; map: MapResult | null }
  | { kind: 'error'; message: string; during: 'load' | 'render'; seq?: number };

// Draws from the workouts loaded last (only their prepared form is kept; the
// raw GPS tracks are freed). Map tiles are kept across data sets.
const mapLoader = new MapLoader();
let engine = new PosterEngine([], mapLoader);

const post = (msg: EngineMessage) => self.postMessage(msg);

/**
 * Reads the export by asking the page for byte ranges. Safari won't let a
 * worker read a file chosen on a page opened from disk (file://), but the page
 * itself can, so the page reads each range and hands it over. Only the ranges
 * being unzipped are in memory at once, even for multi-GB exports.
 */
const chunkWaiters = new Map<number, (buffer: ArrayBuffer) => void>();
let nextChunkId = 0;

class PageFileReader extends Reader<number> {
  constructor(
    size: number,
    private readonly load: number,
  ) {
    super(size);
    this.size = size;
  }

  readUint8Array(offset: number, length: number): Promise<Uint8Array> {
    const id = nextChunkId++;
    return new Promise((resolve) => {
      chunkWaiters.set(id, (buffer) => resolve(new Uint8Array(buffer)));
      post({ kind: 'read', load: this.load, id, offset, length: Math.min(length, this.size - offset) });
    });
  }
}

/** The newest load; an older one that finishes later is ignored. */
let currentLoad = 0;

function loaded(list: Workout[], load: number) {
  const { workouts: prepared, duplicates } = prepareWithReport(list);
  // An export with nothing to draw leaves the data already loaded in place.
  if (!prepared.length) throw new Error(NO_ROUTES);
  engine = new PosterEngine(prepared, mapLoader);
  let first = Infinity;
  let last = -Infinity;
  for (const w of prepared) {
    first = Math.min(first, w.start);
    last = Math.max(last, w.start);
  }
  post({
    kind: 'loaded',
    load,
    withGps: prepared.length,
    duplicates,
    firstStart: first,
    lastStart: last,
  });
}

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const req = event.data;
  if (req.kind === 'chunk') {
    chunkWaiters.get(req.id)?.(req.buffer);
    chunkWaiters.delete(req.id);
    return;
  }
  const during = req.kind === 'render' ? 'render' : 'load';
  const load = req.kind === 'render' ? 0 : req.load;
  try {
    if (req.kind === 'load-file') {
      currentLoad = load;
      const list = await readExport(new PageFileReader(req.size, load), (progress) => post({ kind: 'progress', load, progress }));
      if (load === currentLoad) loaded(list, load);
    } else if (req.kind === 'load-sample') {
      currentLoad = load;
      loaded(syntheticWorkouts(), load);
    } else {
      const { svg, scene, map } = await engine.render(req);
      post({ kind: 'rendered', seq: req.seq, svg, width: req.style.width, height: req.style.height, shown: scene.workoutCount, withGps: engine.workouts.length, map });
    }
  } catch (err) {
    // A replaced load's failure (often caused by being replaced) isn't news.
    if (during === 'load' && load !== currentLoad) return;
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err), during, seq: req.kind === 'render' ? req.seq : undefined });
  }
};
