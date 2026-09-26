/// <reference lib="webworker" />
import type { Workout } from '../core/types';
import { readHealthExport, type Progress } from '../parse/health-export';

export type WorkerMessage =
  | { kind: 'progress'; progress: Progress }
  | { kind: 'done'; workouts: Workout[] }
  | { kind: 'error'; message: string };

// Parsing happens here, off the page's main thread, and entirely on this device.
self.onmessage = async (event: MessageEvent<File>) => {
  const post = (msg: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(msg, transfer);
  try {
    const workouts = await readHealthExport(event.data, (progress) => post({ kind: 'progress', progress }));
    const buffers = workouts.flatMap((w) =>
      w.track ? [w.track.t.buffer, w.track.lat.buffer, w.track.lon.buffer, w.track.speed.buffer, w.track.hAcc.buffer] : [],
    );
    post({ kind: 'done', workouts }, buffers as ArrayBuffer[]);
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
