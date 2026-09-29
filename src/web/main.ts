import { PRESETS, type Preset } from '../render/presets';
import { LOOK_KEYS, toRenderRequest, type EditorState } from '../render/settings';
import { readState, refresh, watchControls, writeState } from './controls';
import { createEngine } from './engine';
import { presetCards } from './presets-ui';
import { downloadPng, downloadSvg, showPreview } from './preview';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const preview = $('preview');
const status = $('status');

let hasData = false;
let current = { svg: '', width: 0, height: 0 };

const engine = createEngine({
  onProgress: (text) => (status.textContent = text),
  onLoaded({ withGps, firstStart, lastStart }) {
    if (!withGps) {
      status.textContent = 'No outdoor walks or runs with GPS routes were found in this export.';
      return;
    }
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    for (const id of ['from', 'to']) {
      $<HTMLInputElement>(id).min = iso(firstStart!);
      $<HTMLInputElement>(id).max = iso(lastStart!);
    }
    hasData = true;
    render();
  },
  onRendered({ svg, shown, withGps }, more) {
    current.svg = svg;
    status.textContent = `${shown} of ${withGps} outdoor workouts with GPS shown.`;
    $<HTMLButtonElement>('downloadSvg').disabled = false;
    $<HTMLButtonElement>('downloadPng').disabled = false;
    void showPreview(preview, svg).then((shown) => {
      if (shown && !more) preview.classList.remove('updating');
    });
  },
  onError(message, during) {
    preview.classList.remove('updating');
    status.textContent = during === 'load' ? `Couldn't read that file: ${message}` : `Couldn't draw the picture: ${message}`;
  },
});

function render() {
  if (!hasData) return;
  const { filters, layout, style } = toRenderRequest(readState());
  engine.render({ filters, layout, style });
  current = { ...current, width: style.width, height: style.height };
  // The preview takes the image's shape, whatever the window's.
  preview.style.setProperty('--ratio', String(style.width / style.height));
  preview.style.background = style.background;
  preview.classList.add('updating');
}

// ── Data ──────────────────────────────────────────────────────────────────────

function readExport(file: File) {
  status.textContent = 'Reading export…';
  hasData = false;
  engine.loadFile(file);
}

function loadSample() {
  status.textContent = 'Loading sample data…';
  engine.loadSample();
}

const drop = $('drop');
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
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
$('sample').addEventListener('click', loadSample);

// Quick date ranges, in local calendar dates as the date inputs expect.
$('dateRanges').addEventListener('click', (e) => {
  const range = (e.target as HTMLElement).dataset.range as 'all' | '12m' | 'this' | 'last' | undefined;
  if (!range) return;
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const year = now.getFullYear();
  const [from, to] = {
    all: ['', ''],
    '12m': [ymd(new Date(year - 1, now.getMonth(), now.getDate() + 1)), ymd(now)],
    this: [`${year}-01-01`, ymd(now)],
    last: [`${year - 1}-01-01`, `${year - 1}-12-31`],
  }[range];
  writeState({ from, to });
  render();
});

// ── Styles ────────────────────────────────────────────────────────────────────

const markPreset = presetCards($('presetCards'), applyPreset);
const lookKeys = new Set<keyof EditorState>(LOOK_KEYS);

function setActivePreset(p: Preset | null) {
  markPreset(p?.id ?? null);
  $('presetNote').textContent = p ? p.description : 'Custom style. Pick a style to start over.';
}

/**
 * A preset sets the whole look, never the person's own choices (filters,
 * title and name, units); an empty title gets a default so the poster reads
 * as finished.
 */
function applyPreset(p: Preset) {
  writeState({ ...p.look, title: readState().title.trim() || 'Every Step' });
  setActivePreset(p);
  render();
}

watchControls($('controls'), (key) => {
  // Changing any part of the look makes the style custom.
  if (lookKeys.has(key)) setActivePreset(null);
  render();
});

// ── Downloads ─────────────────────────────────────────────────────────────────

$('downloadSvg').addEventListener('click', () => downloadSvg(current.svg));
$('downloadPng').addEventListener('click', () => void downloadPng(current.svg, current));

// ── Start ─────────────────────────────────────────────────────────────────────

// Miles where people run in miles; kilometers everywhere else.
writeState({ units: /^en-(US|LR)|^my/.test(navigator.language) ? 'mi' : 'km' });
// The page opens on a finished poster style.
applyPreset(PRESETS.find((p) => p.id === 'afterglow')!);
refresh();
// ?sample opens straight into the demo data, which makes the page easy to link to.
if (new URLSearchParams(location.search).has('sample')) loadSample();
