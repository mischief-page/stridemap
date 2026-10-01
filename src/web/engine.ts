import type { Filters, LayoutOptions } from '../core/pipeline';
import type { MapRequest } from '../render/settings';
import type { StyleOptions } from '../render/svg';
import type { EngineMessage, EngineRequest, MapResult } from './worker';
// Inlined so the page also works as a single file opened straight from disk.
import EngineWorker from './worker?worker&inline';

type RenderRequest = { filters: Filters; layout: LayoutOptions; style: StyleOptions; map: MapRequest | null };

export interface EngineHandlers {
  /** `fraction` is how far through the current stage, 0–1. */
  onProgress(text: string, fraction: number): void;
  onLoaded(info: { withGps: number; firstStart: number | null; lastStart: number | null }): void;
  /** `more` is true when a newer request is already on its way. */
  onRendered(result: { svg: string; width: number; height: number; shown: number; withGps: number; map: MapResult | null }, more: boolean): void;
  onError(message: string, during: 'load' | 'render'): void;
}

/**
 * Talks to the engine worker, which holds the workouts and does all the heavy
 * work off the page's main thread. While a drawing is in progress only the
 * newest request is kept, so dragging a slider never queues up stale frames.
 */
export function createEngine(handlers: EngineHandlers) {
  const worker = new EngineWorker();
  const send = (req: EngineRequest) => worker.postMessage(req);
  let busy = false;
  let pending: RenderRequest | null = null;
  // The export being read, by load number; the worker asks for it a range at a
  // time. Only the newest load counts: messages from older ones are dropped.
  let load = 0;
  let file: File | null = null;
  let seq = 0;

  const start = (req: RenderRequest) => {
    busy = true;
    send({ kind: 'render', seq: ++seq, ...req });
  };
  const next = () => {
    busy = false;
    if (pending) {
      const req = pending;
      pending = null;
      start(req);
    }
  };

  worker.onmessage = (event: MessageEvent<EngineMessage>) => {
    const msg = event.data;
    switch (msg.kind) {
      case 'read': {
        // A replaced load gets nothing to read, so it fails fast and quietly.
        const source = msg.load === load && file ? file.slice(msg.offset, msg.offset + msg.length) : new Blob([]);
        void source.arrayBuffer().then((buffer) => worker.postMessage({ kind: 'chunk', id: msg.id, buffer } satisfies EngineRequest, [buffer]));
        break;
      }
      case 'progress': {
        if (msg.load !== load) break;
        const { stage, done, total } = msg.progress;
        handlers.onProgress(
          stage === 'workouts' ? 'Reading the list of workouts…' : `Reading routes… ${done.toLocaleString()} of ${total.toLocaleString()}`,
          done / Math.max(1, total),
        );
        break;
      }
      case 'loaded':
        if (msg.load === load) handlers.onLoaded(msg);
        break;
      case 'rendered':
        handlers.onRendered(msg, pending !== null);
        next();
        break;
      case 'error':
        handlers.onError(msg.message, msg.during);
        if (msg.during === 'render') next();
        break;
    }
  };
  worker.onerror = (event) => {
    busy = false;
    pending = null;
    handlers.onError(event.message || 'the engine stopped unexpectedly', 'render');
  };

  return {
    loadFile(chosen: File) {
      file = chosen;
      send({ kind: 'load-file', load: ++load, size: chosen.size });
    },
    loadSample() {
      file = null;
      send({ kind: 'load-sample', load: ++load });
    },
    render(req: RenderRequest) {
      if (busy) pending = req;
      else start(req);
    },
  };
}
