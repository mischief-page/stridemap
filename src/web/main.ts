import type { ColorMode } from '../core/pipeline';
import type { ActivityType } from '../core/types';
import type { DateFormat, LegendBackdrop, LegendFont, LegendPosition } from '../render/legend';
import { inkFor, type ScaleStyle, type Units } from '../render/scale';
import { canvasSize, type Aspect, type Orientation } from '../render/canvas';
import { PRESETS, type Preset } from '../render/presets';
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
      textBand: input('textBand').checked,
      pencil:
        $<HTMLSelectElement>('lineStyle').value === 'pencil'
          ? { roughness: Number(input('roughness').value), grain: Number(input('grain').value) }
          : null,
      blend: $<HTMLSelectElement>('blend').value as Blend,
      scale: $<HTMLSelectElement>('scale').value as ScaleStyle,
      units: $<HTMLSelectElement>('units').value as Units,
      scaleColor: scaleColor.chosen ? input('scaleColor').value : null,
      legend: {
        show: input('legendShow').checked,
        title: input('legendTitle').value,
        name: input('legendName').value,
        showDates: input('legendDates').checked,
        showStats: input('legendStats').checked,
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
  $('pencilFields').hidden = $<HTMLSelectElement>('lineStyle').value !== 'pencil';
  $('roughnessOut').textContent = input('roughness').value;
  $('grainOut').textContent = `${Math.round(Number(input('grain').value) * 100)}%`;
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
    status.textContent = `${msg.shown} of ${msg.withGps} outdoor workouts with GPS shown.`;
    $<HTMLButtonElement>('downloadSvg').disabled = false;
    $<HTMLButtonElement>('downloadPng').disabled = false;
    void showPreview(msg.svg).then((shown) => {
      if (shown && !dirty && !busy) preview.classList.remove('updating');
    });
    if (dirty) render();
  } else {
    busy = false;
    status.textContent = `Couldn't read that file: ${msg.message}`;
  }
};
/**
 * Shows the SVG as an image rather than live SVG in the page. The browser then
 * draws the thousands of paths (and the pencil grain filter) once, instead of
 * again on every scroll or repaint. The new image is fully decoded before it
 * replaces the old one, so there's no flicker; a result that arrives after a
 * newer one is dropped.
 */
let previewSeq = 0;
let previewUrl = '';
async function showPreview(svg: string): Promise<boolean> {
  const mine = ++previewSeq;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.alt = 'Preview of your route artwork';
  img.src = url;
  try {
    await img.decode();
  } catch {
    // Decoding can fail if the image is replaced mid-way; the newer one wins.
  }
  if (mine !== previewSeq) {
    URL.revokeObjectURL(url);
    return false;
  }
  preview.replaceChildren(img);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = url;
  return true;
}

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

// Warm paper, light-to-dark graphite, and ink blending so overlaps darken like pencil.
$('paperPreset').addEventListener('click', () => {
  input('background').value = '#f3efe6';
  input('colorA').value = '#a39d92';
  input('colorB').value = '#1f1d1a';
  $<HTMLSelectElement>('blend').value = 'multiply';
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

// ── Style presets ───────────────────────────────────────────────────────────

const presetCards = $('presetCards');
let activePreset: string | null = null;

/** A tiny radiating web in the preset's colors, standing in for a thumbnail. */
function presetThumb(p: Preset): string {
  const spokes = [
    [30, 6], [52, 14], [56, 36], [50, 62], [34, 74], [12, 64], [6, 40], [10, 16],
    [42, 4], [58, 50], [22, 76], [4, 26],
  ];
  const line = (x: number, y: number, color: string, width: number, opacity: number) =>
    `<path d="M30 40L${x} ${y}" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
  const outer = spokes.map(([x, y]) => line(x!, y!, p.style.colorA, 1, 0.9)).join('');
  const inner = spokes.slice(0, 8).map(([x, y]) => line(30 + (x! - 30) * 0.45, 40 + (y! - 40) * 0.45, p.style.colorB, 2, 1)).join('');
  const text = p.legend.position.startsWith('top') ? 8 : 70;
  const tx = p.legend.position.endsWith('left') ? 8 : p.legend.position.endsWith('right') ? 32 : 20;
  const ink = inkFor(p.style.background);
  return `<svg viewBox="0 0 60 80" aria-hidden="true"><rect width="60" height="80" fill="${p.style.background}"/>
<g fill="none" stroke-linecap="round"${p.style.pencil ? ' stroke-dasharray="3 1"' : ''}>${outer}${inner}</g>
<rect x="${tx}" y="${text}" width="20" height="3" fill="${ink}" opacity="0.8"/></svg>`;
}

function markPreset(id: string | null) {
  activePreset = id;
  for (const card of presetCards.children) card.setAttribute('aria-checked', String(card.getAttribute('data-id') === id));
  const p = PRESETS.find((x) => x.id === id);
  $('presetNote').textContent = p ? p.description : 'Custom style. Pick a style to start over.';
}

/**
 * Sets every look control to the preset's values. Filters, title and name
 * text, and units are the person's own and are left alone, except that an
 * empty title gets a default so the poster reads as finished.
 */
function applyPreset(p: Preset) {
  const set = (id: string, value: string) => (input(id).value = value);
  const radio = (group: string, value: string) =>
    (document.querySelector<HTMLInputElement>(`#${group} input[value="${value}"]`)!.checked = true);

  radio('mode', p.colorMode);
  radio('orientation', p.orientation);
  $<HTMLSelectElement>('aspect').value = p.aspect;
  set('squash', String(p.squash));
  set('background', p.style.background);
  set('colorA', p.style.colorA);
  set('colorB', p.style.colorB);
  $<HTMLSelectElement>('blend').value = p.style.blend;
  set('stroke', String(p.style.strokeWidth));
  set('opacity', String(p.style.opacity));
  set('smooth', String(p.style.smoothing));
  $<HTMLSelectElement>('lineStyle').value = p.style.pencil ? 'pencil' : 'clean';
  if (p.style.pencil) {
    set('roughness', String(p.style.pencil.roughness));
    set('grain', String(p.style.pencil.grain));
  }
  $<HTMLSelectElement>('scale').value = p.style.scale;
  scaleColor.chosen = false;

  input('legendShow').checked = true;
  if (!input('legendTitle').value.trim()) set('legendTitle', 'Every Step');
  input('legendDates').checked = p.legend.showDates;
  input('legendStats').checked = p.legend.showStats;
  $<HTMLSelectElement>('legendDateFormat').value = p.legend.dateFormat;
  $<HTMLSelectElement>('legendPosition').value = p.legend.position;
  $<HTMLSelectElement>('legendFont').value = p.legend.font;
  $<HTMLSelectElement>('legendBackdrop').value = p.legend.backdrop;
  set('legendSize', String(p.legend.size));
  input('legendCaps').checked = p.legend.uppercaseTitle;
  input('textBand').checked = p.style.textBand;
  legendColor.chosen = false;

  markPreset(p.id);
  render();
}

for (const p of PRESETS) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'preset-card';
  card.dataset.id = p.id;
  card.setAttribute('role', 'radio');
  card.title = p.description;
  card.innerHTML = `${presetThumb(p)}<span>${p.name}</span>`;
  card.addEventListener('click', () => applyPreset(p));
  presetCards.append(card);
}

// Any manual change to a look control turns the style into a custom one.
// (Setting values from code doesn't fire input events, so presets don't trip this.)
$('controls').addEventListener('input', (e) => {
  const target = e.target as HTMLElement;
  if (activePreset && !target.closest('#presetCards') && !target.closest('#types') && !['from', 'to', 'legendTitle', 'legendName', 'units', 'file'].includes(target.id)) {
    markPreset(null);
  }
});

// The page opens on a finished poster style.
applyPreset(PRESETS.find((p) => p.id === 'afterglow')!);

updateOutputs();
// ?sample opens straight into the demo data, which makes the page easy to link to.
if (new URLSearchParams(location.search).has('sample')) loadSample();
