/// <reference lib="webworker" />
import { buildScene, prepareWorkouts, type Filters, type LayoutOptions, type PreparedWorkout, type Scene } from '../core/pipeline';
import type { Workout } from '../core/types';
import { readHealthExport, type Progress } from '../parse/health-export';
import { renderSvg, type StyleOptions } from '../render/svg';
import { syntheticWorkouts } from '../sample/synthetic';

/**
 * The page's engine. It holds the workouts and does all the heavy work (reading
 * the export, building the scene, writing the SVG) off the page's main thread,
 * so the controls stay responsive however many routes there are. Everything
 * stays on this device.
 */

export type EngineRequest =
  | { kind: 'load-file'; file: File }
  | { kind: 'load-sample' }
  | { kind: 'render'; seq: number; filters: Filters; layout: LayoutOptions; style: StyleOptions };

export type EngineMessage =
  | { kind: 'progress'; progress: Progress }
  | { kind: 'loaded'; withGps: number; firstStart: number | null; lastStart: number | null }
  | { kind: 'rendered'; seq: number; svg: string; shown: number; withGps: number }
  | { kind: 'error'; message: string };

// Only the prepared form is kept; the raw GPS tracks are freed after loading.
let workouts: PreparedWorkout[] = [];
// Style-only changes (colors, legend, scale…) reuse the last scene.
let sceneCache: { key: string; scene: Scene } | null = null;

const post = (msg: EngineMessage) => self.postMessage(msg);

function loaded(list: Workout[]) {
  workouts = prepareWorkouts(list);
  sceneCache = null;
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
  try {
    if (req.kind === 'load-file') {
      loaded(await readHealthExport(req.file, (progress) => post({ kind: 'progress', progress })));
    } else if (req.kind === 'load-sample') {
      loaded(syntheticWorkouts());
    } else {
      const key = JSON.stringify([req.filters, req.layout]);
      if (sceneCache?.key !== key) sceneCache = { key, scene: buildScene(workouts, req.filters, req.layout) };
      const { scene } = sceneCache;
      post({ kind: 'rendered', seq: req.seq, svg: renderSvg(scene, req.style), shown: scene.workoutCount, withGps: workouts.length });
    }
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
