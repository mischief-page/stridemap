import type { Filters, LayoutOptions } from '../core/pipeline';
import type { MapRequest } from '../render/settings';
import type { StyleOptions } from '../render/svg';
import type { EngineMessage, EngineRequest, MapResult } from './worker';
// Inlined so the page also works as a single file opened straight from disk.
import EngineWorker from './worker?worker&inline';

type RenderRequest = { filters: Filters; layout: LayoutOptions; style: StyleOptions; map: MapRequest | null };

export interface EngineHandlers {
  onProgress(text: string): void;
  onLoaded(info: { withGps: number; firstStart: number | null; lastStart: number | null }): void;
  /** `more` is true when a newer request is already on its way. */
  onRendered(result: { svg: string; shown: number; withGps: number; map: MapResult | null }, more: boolean): void;
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
  // The export being read; the worker asks for it a range at a time.
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
      case 'read':
        void file!
          .slice(msg.offset, msg.offset + msg.length)
          .arrayBuffer()
          .then((buffer) => worker.postMessage({ kind: 'chunk', id: msg.id, buffer } satisfies EngineRequest, [buffer]));
        break;
      case 'progress': {
        const { stage, done, total } = msg.progress;
        handlers.onProgress(
          stage === 'workouts'
            ? `Reading workouts… ${Math.round((done / Math.max(1, total)) * 100)}%`
            : `Reading routes… ${done} of ${total}`,
        );
        break;
      }
      case 'loaded':
        handlers.onLoaded(msg);
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
      send({ kind: 'load-file', size: chosen.size });
    },
    loadSample: () => send({ kind: 'load-sample' }),
    render(req: RenderRequest) {
      if (busy) pending = req;
      else start(req);
    },
  };
}
