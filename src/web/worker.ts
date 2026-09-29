/// <reference lib="webworker" />
import { Reader } from '@zip.js/zip.js';
import { buildScene, prepareWorkouts, type Filters, type LayoutOptions, type OtherStarts, type PreparedWorkout, type Scene } from '../core/pipeline';
import type { Workout } from '../core/types';
import { readHealthExport, type Progress } from '../parse/health-export';
import { renderSvg, visibleMeters, type StyleOptions } from '../render/svg';
import type { MapRequest } from '../render/settings';
import { detectHome, type GeoPoint } from '../map/anchor';
import { mapScene } from '../map/scene';
import { MapLoader, type MapFeatures } from '../map/tiles';
import { syntheticWorkouts } from '../sample/synthetic';

/**
 * The page's engine. It holds the workouts and does all the heavy work (reading
 * the export, building the scene, writing the SVG) off the page's main thread,
 * so the controls stay responsive however many routes there are. Everything
 * stays on this device.
 */

export type EngineRequest =
  | { kind: 'load-file'; size: number }
  | { kind: 'chunk'; id: number; buffer: ArrayBuffer }
  | { kind: 'load-sample' }
  | { kind: 'render'; seq: number; filters: Filters; layout: LayoutOptions; style: StyleOptions; map: MapRequest | null };

/** How the map went: where it's centred, how many routes are on it, or why it isn't shown. */
export type MapResult =
  | { ok: true; at: GeoPoint; detected: boolean; others: OtherStarts; near: number; elsewhere: number; elsewhereDrawn: number }
  | { ok: false; reason: 'no-point' | 'no-routes' | 'offline'; message?: string };

export type EngineMessage =
  | { kind: 'read'; id: number; offset: number; length: number }
  | { kind: 'progress'; progress: Progress }
  | { kind: 'loaded'; withGps: number; firstStart: number | null; lastStart: number | null }
  | { kind: 'rendered'; seq: number; svg: string; shown: number; withGps: number; map: MapResult | null }
  | { kind: 'error'; message: string; during: 'load' | 'render' };

// Only the prepared form is kept; the raw GPS tracks are freed after loading.
let workouts: PreparedWorkout[] = [];
// Style-only changes (colors, legend, scale…) reuse the last scene.
let sceneCache: { key: string; scene: Scene } | null = null;
// The most common start, found once per data set.
let home: ReturnType<typeof detectHome> | undefined;
const mapLoader = new MapLoader();

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
  constructor(size: number) {
    super(size);
    this.size = size;
  }

  readUint8Array(offset: number, length: number): Promise<Uint8Array> {
    const id = nextChunkId++;
    return new Promise((resolve) => {
      chunkWaiters.set(id, (buffer) => resolve(new Uint8Array(buffer)));
      post({ kind: 'read', id, offset, length: Math.min(length, this.size - offset) });
    });
  }
}

function loaded(list: Workout[]) {
  workouts = prepareWorkouts(list);
  sceneCache = null;
  home = undefined;
  let first = Infinity;
  let last = -Infinity;
  for (const w of workouts) {
    first = Math.min(first, w.start);
    last = Math.max(last, w.start);
  }
  post({
    kind: 'loaded',
    withGps: workouts.length,
    firstStart: workouts.length ? first : null,
    lastStart: workouts.length ? last : null,
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
  try {
    if (req.kind === 'load-file') {
      loaded(await readHealthExport(new PageFileReader(req.size), (progress) => post({ kind: 'progress', progress })));
    } else if (req.kind === 'load-sample') {
      loaded(syntheticWorkouts());
    } else {
      const { svg, scene, map } = await draw(req.filters, req.layout, req.style, req.map);
      post({ kind: 'rendered', seq: req.seq, svg, shown: scene.workoutCount, withGps: workouts.length, map });
    }
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err), during });
  }
};

const pick = ({ near, elsewhere, elsewhereDrawn }: NonNullable<Scene['geoAnchor']>) => ({ near, elsewhere, elsewhereDrawn });

function sceneFor(filters: Filters, layout: LayoutOptions): Scene {
  const key = JSON.stringify([filters, layout]);
  if (sceneCache?.key !== key) sceneCache = { key, scene: buildScene(workouts, filters, layout) };
  return sceneCache.scene;
}

/**
 * Draws the picture, with the map behind it when asked for. With a map the
 * routes are placed in their true position around its point; if the map
 * can't be drawn, the routes are drawn as usual and the reason is reported.
 */
async function draw(filters: Filters, layout: LayoutOptions, style: StyleOptions, map: MapRequest | null) {
  const plain = () => sceneFor(filters, layout);
  if (!map) return { svg: renderSvg(plain(), style), scene: plain(), map: null };
  if (map.at === 'detected' && home === undefined) home = detectHome(workouts.map((w) => ({ lat: w.lat[0]!, lon: w.lon[0]! })));
  const at = map.at === 'detected' ? home : map.at;
  const fail = (reason: 'no-point' | 'no-routes' | 'offline', message?: string) => {
    const scene = plain();
    return { svg: renderSvg(scene, style), scene, map: { ok: false as const, reason, message } };
  };
  if (!at) return fail('no-point');
  const scene = mapScene(sceneFor, filters, layout, style, at, map.others);
  if (!scene.geoAnchor!.near) return fail('no-routes');
  let features: MapFeatures;
  try {
    features = await mapLoader.load({ lat: at.lat, lon: at.lon }, visibleMeters(scene, style));
  } catch (err) {
    return fail('offline', err instanceof Error ? err.message : String(err));
  }
  return {
    svg: renderSvg(scene, style, features),
    scene,
    map: { ok: true as const, at: { lat: at.lat, lon: at.lon }, detected: map.at === 'detected', others: map.others, ...pick(scene.geoAnchor!) },
  };
}
