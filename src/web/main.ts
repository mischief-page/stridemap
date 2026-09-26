import { buildScene, type ColorMode } from '../core/pipeline';
import type { ActivityType, Workout } from '../core/types';
import { DEFAULT_STYLE, renderSvg, type Blend } from '../render/svg';
import { syntheticWorkouts } from '../sample/synthetic';
import type { WorkerMessage } from './worker';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const preview = $('preview');
const status = $('status');
let workouts: Workout[] = [];
let currentSvg = '';

// Style defaults come from the renderer so the page and CLI agree.
input('colorA').value = DEFAULT_STYLE.colorA;
input('colorB').value = DEFAULT_STYLE.colorB;
input('background').value = DEFAULT_STYLE.background;
input('stroke').value = String(DEFAULT_STYLE.strokeWidth);
input('opacity').value = String(DEFAULT_STYLE.opacity);
$<HTMLSelectElement>('blend').value = DEFAULT_STYLE.blend;

function readSettings() {
  const types = [...document.querySelectorAll<HTMLInputElement>('#types input:checked')].map(
    (el) => el.value as ActivityType,
  );
  const mode = document.querySelector<HTMLInputElement>('#mode input:checked')!.value as ColorMode;
  const date = (id: string, endOfDay: boolean) => {
    const v = input(id).value;
    return v ? Date.parse(`${v}T${endOfDay ? '23:59:59' : '00:00:00'}`) : null;
  };
  return {
    filters: { types, from: date('from', false), to: date('to', true) },
    layout: {
      colorMode: mode,
      fitPercentile: Number(input('fit').value),
      radialExponent: Number(input('squash').value),
    },
    style: {
      ...DEFAULT_STYLE,
      colorA: input('colorA').value,
      colorB: input('colorB').value,
      background: input('background').value,
      strokeWidth: Number(input('stroke').value),
      opacity: Number(input('opacity').value),
      blend: $<HTMLSelectElement>('blend').value as Blend,
    },
  };
}

function updateOutputs() {
  $('fitOut').textContent = `${input('fit').value}%`;
  $('squashOut').textContent = input('squash').value;
  $('strokeOut').textContent = input('stroke').value;
  $('opacityOut').textContent = input('opacity').value;
}

let pending = 0;
function render() {
  updateOutputs();
  if (!workouts.length) return;
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const { filters, layout, style } = readSettings();
    const scene = buildScene(workouts, filters, layout);
    currentSvg = renderSvg(scene, style);
    preview.innerHTML = currentSvg;
    preview.style.background = style.background;
    const withGps = workouts.filter((w) => w.track && !w.indoor).length;
    status.textContent = `${scene.workoutCount} of ${withGps} outdoor workouts with GPS shown.`;
    $<HTMLButtonElement>('downloadSvg').disabled = false;
    $<HTMLButtonElement>('downloadPng').disabled = false;
  });
}

function load(list: Workout[]) {
  workouts = list;
  const starts = list.filter((w) => w.track).map((w) => w.start);
  if (starts.length) {
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    input('from').min = input('to').min = iso(Math.min(...starts));
    input('from').max = input('to').max = iso(Math.max(...starts));
  }
  render();
}

function readExport(file: File) {
  status.textContent = 'Reading export…';
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const msg = event.data;
    if (msg.kind === 'progress') {
      const pct = Math.round((msg.progress.done / Math.max(1, msg.progress.total)) * 100);
      status.textContent =
        msg.progress.stage === 'workouts' ? `Reading workouts… ${pct}%` : `Reading routes… ${msg.progress.done} of ${msg.progress.total}`;
    } else if (msg.kind === 'done') {
      worker.terminate();
      if (!msg.workouts.some((w) => w.track)) {
        status.textContent = 'No outdoor walks or runs with GPS routes were found in this export.';
        return;
      }
      load(msg.workouts);
    } else {
      worker.terminate();
      status.textContent = `Couldn't read that file: ${msg.message}`;
    }
  };
  worker.postMessage(file);
}

const drop = $('drop');
input('file').addEventListener('change', () => {
  const file = input('file').files?.[0];
  if (file) readExport(file);
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const file = e.dataTransfer?.files[0];
  if (file) readExport(file);
});

$('sample').addEventListener('click', () => load(syntheticWorkouts()));
$('controls').addEventListener('input', render);

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('downloadSvg').addEventListener('click', () => {
  download(new Blob([currentSvg], { type: 'image/svg+xml' }), 'stridemap.svg');
});

$('downloadPng').addEventListener('click', async () => {
  const { width, height } = DEFAULT_STYLE;
  const scale = 2;
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([currentSvg], { type: 'image/svg+xml' }));
  await img.decode();
  const canvas = Object.assign(document.createElement('canvas'), { width: width * scale, height: height * scale });
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  canvas.toBlob((blob) => blob && download(blob, 'stridemap.png'), 'image/png');
});

updateOutputs();
// ?sample opens straight into the demo data, which makes the page easy to link to.
if (new URLSearchParams(location.search).has('sample')) load(syntheticWorkouts());
