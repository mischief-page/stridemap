import type { ColorMode } from '../core/pipeline';
import type { ActivityType } from '../core/types';
import type { DateFormat, LegendBackdrop, LegendFont, LegendPosition } from '../render/legend';
import { inkFor, type ScaleStyle, type Units } from '../render/scale';
import { canvasSize, type Aspect, type Orientation } from '../render/canvas';
import { DEFAULT_STYLE, type Blend } from '../render/svg';
import type { EngineMessage, EngineRequest } from './worker';
// Inlined so the page also works as a single file opened straight from disk.
import EngineWorker from './worker?worker&inline';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const preview = $('preview');
const status = $('status');
let hasData = false;
let currentSvg = '';
let currentSize = { width: DEFAULT_STYLE.width, height: DEFAULT_STYLE.height };

// Style defaults come from the renderer so the page and CLI agree.
input('colorA').value = DEFAULT_STYLE.colorA;
input('colorB').value = DEFAULT_STYLE.colorB;
input('background').value = DEFAULT_STYLE.background;
input('stroke').value = String(DEFAULT_STYLE.strokeWidth);
input('opacity').value = String(DEFAULT_STYLE.opacity);
$<HTMLSelectElement>('blend').value = DEFAULT_STYLE.blend;
$<HTMLSelectElement>('scale').value = DEFAULT_STYLE.scale;
// Miles where people run in miles; kilometers everywhere else.
$<HTMLSelectElement>('units').value = /^en-(US|LR)|^my/.test(navigator.language) ? 'mi' : 'km';

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
      ...canvasSize(
        $<HTMLSelectElement>('aspect').value as Aspect,
        document.querySelector<HTMLInputElement>('#orientation input:checked')!.value as Orientation,
      ),
      colorA: input('colorA').value,
      colorB: input('colorB').value,
      background: input('background').value,
      strokeWidth: Number(input('stroke').value),
      opacity: Number(input('opacity').value),
      smoothing: Number(input('smooth').value),
      blend: $<HTMLSelectElement>('blend').value as Blend,
      scale: $<HTMLSelectElement>('scale').value as ScaleStyle,
      units: $<HTMLSelectElement>('units').value as Units,
      scaleColor: scaleColor.chosen ? input('scaleColor').value : null,
      legend: {
        show: input('legendShow').checked,
        title: input('legendTitle').value,
        name: input('legendName').value,
        showDates: input('legendDates').checked,
        dateFormat: $<HTMLSelectElement>('legendDateFormat').value as DateFormat,
        position: $<HTMLSelectElement>('legendPosition').value as LegendPosition,
        font: $<HTMLSelectElement>('legendFont').value as LegendFont,
        size: Number(input('legendSize').value),
        uppercaseTitle: input('legendCaps').checked,
        color: legendColor.chosen ? input('legendColor').value : null,
        backdrop: $<HTMLSelectElement>('legendBackdrop').value as LegendBackdrop,
      },
    },
  };
}

/**
 * A color picker that follows the background (white or black) until someone
 * picks a color, with an Auto button to go back.
 */
function autoColor(pickerId: string, autoButtonId: string) {
  const state = {
    chosen: false,
    sync() {
      if (!state.chosen) input(pickerId).value = inkFor(input('background').value);
      $(autoButtonId).hidden = !state.chosen;
    },
  };
  input(pickerId).addEventListener('input', () => {
    state.chosen = true;
  });
  $(autoButtonId).addEventListener('click', () => {
    state.chosen = false;
    render();
  });
  return state;
}
const scaleColor = autoColor('scaleColor', 'scaleColorAuto');
const legendColor = autoColor('legendColor', 'legendColorAuto');

function updateOutputs() {
  scaleColor.sync();
  legendColor.sync();
  $<HTMLFieldSetElement>('legendFields').disabled = !input('legendShow').checked;
  $('legendSizeOut').textContent = `${Math.round(Number(input('legendSize').value) * 100)}%`;
  $('fitOut').textContent = `${input('fit').value}%`;
  $('squashOut').textContent = input('squash').value;
  $('strokeOut').textContent = input('stroke').value;
  $('opacityOut').textContent = input('opacity').value;
  $('smoothOut').textContent = input('smooth').value === '0' ? 'Off' : `${input('smooth').value} px`;
}

// All heavy work happens in the engine worker. While it's drawing, only the
// newest settings are kept, so dragging a slider never queues up stale frames.
const engine = new EngineWorker();
const send = (req: EngineRequest) => engine.postMessage(req);
let seq = 0;
let busy = false;
let dirty = false;

function render() {
  updateOutputs();
  if (!hasData) return;
  if (busy) {
    dirty = true;
    return;
  }
  busy = true;
  dirty = false;
  const { filters, layout, style } = readSettings();
  send({ kind: 'render', seq: ++seq, filters, layout, style });
  currentSize = { width: style.width, height: style.height };
  // The preview takes the image's shape, whatever the window's.
  preview.style.setProperty('--ratio', String(style.width / style.height));
  preview.style.background = style.background;
  preview.classList.add('updating');
}

engine.onmessage = (event: MessageEvent<EngineMessage>) => {
  const msg = event.data;
  if (msg.kind === 'progress') {
    const pct = Math.round((msg.progress.done / Math.max(1, msg.progress.total)) * 100);
    status.textContent =
      msg.progress.stage === 'workouts' ? `Reading workouts… ${pct}%` : `Reading routes… ${msg.progress.done} of ${msg.progress.total}`;
  } else if (msg.kind === 'loaded') {
    if (!msg.withGps) {
      status.textContent = 'No outdoor walks or runs with GPS routes were found in this export.';
      return;
    }
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    input('from').min = input('to').min = iso(msg.firstStart!);
    input('from').max = input('to').max = iso(msg.lastStart!);
    hasData = true;
    busy = false;
    render();
  } else if (msg.kind === 'rendered') {
    busy = false;
    currentSvg = msg.svg;
    preview.innerHTML = msg.svg;
    status.textContent = `${msg.shown} of ${msg.withGps} outdoor workouts with GPS shown.`;
    $<HTMLButtonElement>('downloadSvg').disabled = false;
    $<HTMLButtonElement>('downloadPng').disabled = false;
    if (dirty) render();
    else preview.classList.remove('updating');
  } else {
    busy = false;
    status.textContent = `Couldn't read that file: ${msg.message}`;
  }
};
engine.onerror = (event) => {
  busy = false;
  status.textContent = `Something went wrong: ${event.message || 'the engine stopped unexpectedly'}`;
};

function readExport(file: File) {
  status.textContent = 'Reading export…';
  hasData = false;
  send({ kind: 'load-file', file });
}

function loadSample() {
  status.textContent = 'Loading sample data…';
  send({ kind: 'load-sample' });
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

$('presets').addEventListener('click', (e) => {
  const range = (e.target as HTMLElement).dataset.range;
  if (!range) return;
  // Local calendar dates, as the date inputs expect.
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const year = now.getFullYear();
  const [from, to] = {
    all: ['', ''],
    '12m': [ymd(new Date(year - 1, now.getMonth(), now.getDate() + 1)), ymd(now)],
    this: [`${year}-01-01`, ymd(now)],
    last: [`${year - 1}-01-01`, `${year - 1}-12-31`],
  }[range as 'all' | '12m' | 'this' | 'last'];
  input('from').value = from!;
  input('to').value = to!;
  render();
});

$('sample').addEventListener('click', loadSample);
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
  const { width, height } = currentSize;
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
if (new URLSearchParams(location.search).has('sample')) loadSample();
