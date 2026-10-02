import { DEFAULT_TITLE, PRESETS, type Preset } from '../app/presets';
import { LOOK_KEYS, toRenderRequest, type EditorState } from '../app/settings';
import { readState, refresh, watchControls, writeState } from './controls';
import { createEngine } from './engine';
import { NO_ROUTES } from './messages';
import type { MapResult } from './worker';
import { GEOCODE_ATTRIBUTION, geocode } from '../map/geocode';
import { orderPanel, orderReturnBanner } from './order-ui';
import type { ShopProduct } from './shop';
import { ASPECTS, type Aspect } from '../render/canvas';
import { presetCards } from './presets-ui';
import { downloadPng, downloadSvg, showPreview } from './preview';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const preview = $('preview');
const status = $('status');
const errorBox = $('error');

/** What's loaded: the sample (shown as an example) or someone's own export. */
let source: { kind: 'sample' } | { kind: 'file'; name: string } | null = null;
/** A file being read; the previous data stays on screen until it succeeds. */
let reading: string | null = null;
let current = { svg: '', width: 0, height: 0, title: '' };
let activePresetId: string | null = null;

const engine = createEngine({
  onProgress(text, fraction) {
    $('loadingText').textContent = text;
    $<HTMLProgressElement>('loadingBar').value = fraction;
  },
  onLoaded({ withGps, duplicates, firstStart, lastStart }) {
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    for (const id of ['from', 'to']) {
      $<HTMLInputElement>(id).min = iso(firstStart!);
      $<HTMLInputElement>(id).max = iso(lastStart!);
    }
    const month = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const dupes = duplicates ? ` (${duplicates} recorded twice, counted once)` : '';
    $('dataRange').textContent = `Your data: ${withGps} workouts with GPS${dupes}, ${month(firstStart!)} – ${month(lastStart!)}.`;
    source = reading ? { kind: 'file', name: reading } : { kind: 'sample' };
    reading = null;
    $('loading').hidden = true;
    $('exampleBadge').hidden = source.kind !== 'sample';
    render();
  },
  onRendered({ svg, width, height, shown, withGps, map }, more) {
    // The size comes with the image, so a PNG always matches the picture it's made from.
    current = { ...current, svg, width, height };
    updatePngSizes();
    const from = source?.kind === 'file' ? source.name : 'Sample data';
    status.textContent = `${from}: ${shown} of ${withGps} workouts shown.`;
    $('mapStatus').textContent = mapStatus(map);
    // The underlying error, for anyone curious why the map didn't load.
    $('mapStatus').title = map && !map.ok ? (map.message ?? '') : '';
    $<HTMLButtonElement>('downloadSvg').disabled = false;
    $<HTMLButtonElement>('downloadPng').disabled = false;
    const title = readState().title.trim() || DEFAULT_TITLE;
    void showPreview($('previewImage'), svg, `Poster preview: ${title}, ${shown} workouts`).then((shown) => {
      if (shown && !more) preview.classList.remove('updating');
    });
    if (!more) orders?.refresh();
  },
  onError(message, during) {
    preview.classList.remove('updating');
    if (during === 'load') {
      // The data shown before (if any) is still loaded and still works.
      reading = null;
      $('loading').hidden = true;
      $('exampleBadge').hidden = source?.kind !== 'sample';
      showError(friendlyLoadError(message));
    } else {
      showError(`Couldn't draw the picture: ${message}`);
    }
  },
});

function showError(message: string | null) {
  errorBox.textContent = message ?? '';
  errorBox.hidden = !message;
}

/** Load errors as next steps, rather than the zip library's wording. */
function friendlyLoadError(message: string): string {
  if (message === NO_ROUTES) {
    return 'No outdoor walks, runs or hikes with GPS routes were found in that file. Indoor workouts and ones recorded without location are left out.';
  }
  if (/format is not recognized|central directory|zip/i.test(message)) {
    return "That file couldn't be opened as a zip. If it's your export, it may not have finished downloading; try getting it again.";
  }
  return `Couldn't read that file: ${message}`;
}

function render() {
  if (!source) return;
  const state = readState();
  const { filters, layout, style, map } = toRenderRequest(state);
  engine.render({ filters, layout, style, map });
  current.title = state.title;
  // The preview takes the image's shape, whatever the window's.
  preview.style.setProperty('--ratio', String(style.width / style.height));
  preview.style.background = style.background;
  preview.classList.add('updating');
  markDateRange();
}

// ── Data ──────────────────────────────────────────────────────────────────────

function readExport(file: File) {
  showError(null);
  if (!/\.zip$/i.test(file.name) && !/zip/.test(file.type)) {
    showError(`“${file.name}” isn't a zip. Choose export.zip from Apple Health, or the zip Strava emailed you.`);
    return;
  }
  reading = file.name;
  $('loadingText').textContent = 'Reading your export…';
  $<HTMLProgressElement>('loadingBar').value = 0;
  $('loading').hidden = false;
  $('exampleBadge').hidden = true;
  engine.loadFile(file);
}

function loadSample() {
  showError(null);
  reading = null;
  engine.loadSample();
}

const drop = $('drop');
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) readExport(file);
  // Choosing the same file again (say, after fixing it) should still load it.
  input.value = '';
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
$('useMine').addEventListener('click', () => $<HTMLInputElement>('file').click());

// Quick date ranges, in local calendar dates as the date inputs expect.
type DateRange = 'all' | '12m' | 'this' | 'last';

function rangeDates(range: DateRange): [string, string] {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const year = now.getFullYear();
  return ({
    all: ['', ''],
    '12m': [ymd(new Date(year - 1, now.getMonth(), now.getDate() + 1)), ymd(now)],
    this: [`${year}-01-01`, ymd(now)],
    last: [`${year - 1}-01-01`, `${year - 1}-12-31`],
  } as const)[range] as [string, string];
}

$('dateRanges').addEventListener('click', (e) => {
  const range = (e.target as HTMLElement).dataset.range as DateRange | undefined;
  if (!range) return;
  const [from, to] = rangeDates(range);
  writeState({ from, to });
  render();
});

/** The quick-range buttons show which one matches the dates set, if any. */
function markDateRange() {
  const { from, to } = readState();
  for (const button of $('dateRanges').querySelectorAll<HTMLButtonElement>('button')) {
    const [f, t] = rangeDates(button.dataset.range as DateRange);
    button.setAttribute('aria-pressed', String(f === from && t === to));
  }
}

// ── Map ───────────────────────────────────────────────────────────────────────

function mapStatus(map: MapResult | null): string {
  if (!map) return '';
  if (!map.ok) {
    return {
      'no-point': 'Enter coordinates (like 41.8781, -87.6298) or find an address to place the map.',
      'no-routes': 'No routes shown start within 300 m of this point, so the map is off.',
      offline: "Couldn't load the map (are you offline?). Routes are drawn without it.",
    }[map.reason];
  }
  const where = map.detected ? '' : ` (${map.at.lat.toFixed(4)}, ${map.at.lon.toFixed(4)})`;
  const status = [`${map.near} routes start at the center${where}.`];
  if (map.elsewhere) {
    status.push(
      {
        omit: `${map.elsewhere} from elsewhere left out.`,
        true: `${map.elsewhereDrawn} of ${map.elsewhere} from elsewhere drawn.`,
        anchored: `${map.elsewhere} from elsewhere drawn from the center.`,
      }[map.others],
    );
  }
  return status.join(' ');
}

// Address search only on request: it's the one thing that sends text off the device.
async function findAddress() {
  const address = $<HTMLInputElement>('mapAddress').value.trim();
  if (!address) return;
  const note = $('mapFindNote');
  const button = $<HTMLButtonElement>('mapFind');
  button.disabled = true;
  note.textContent = 'Searching…';
  try {
    const hit = await geocode(address);
    if (hit) {
      writeState({ mapAt: `${hit.lat.toFixed(6)}, ${hit.lon.toFixed(6)}` });
      note.textContent = `Found: ${hit.label}. ${GEOCODE_ATTRIBUTION}.`;
      render();
    } else {
      note.textContent = 'No match. Try adding the city, or paste coordinates.';
    }
  } catch (err) {
    note.textContent = `Couldn't search: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    button.disabled = false;
  }
}
$('mapFind').addEventListener('click', () => void findAddress());
$('mapAddress').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void findAddress();
});

// ── Styles ────────────────────────────────────────────────────────────────────

const markPreset = presetCards($('presetCards'), applyPreset);
const lookKeys = new Set<keyof EditorState>(LOOK_KEYS);

function setActivePreset(p: Preset | null) {
  activePresetId = p?.id ?? null;
  markPreset(activePresetId);
  // Shown beside the Style heading, so the active style is visible while collapsed.
  $('styleHint').textContent = p ? p.name : 'Custom';
  $('presetNote').textContent = p ? p.description : 'Custom style. Pick a style to start over.';
}

/**
 * A preset sets the whole look, never the person's own choices (filters,
 * title and name, units); an empty title gets a default so the poster reads
 * as finished.
 */
function applyPreset(p: Preset) {
  writeState({ ...p.look, title: readState().title.trim() || DEFAULT_TITLE });
  setActivePreset(p);
  render();
}

// ── Ordering ──────────────────────────────────────────────────────────────────

/** The poster's print version for a product: its shape, no mark, and no text on small products. */
async function artworkFor(p: ShopProduct): Promise<string> {
  const s = readState();
  const aspect = (Object.entries(ASPECTS) as [Aspect, number][]).find(([, ratio]) => Math.abs(ratio - p.shape) < 0.01)![0];
  const portraitOnly = p.orientations === 'portrait' || aspect === '1:1';
  const state: EditorState = {
    ...s,
    aspect,
    orientation: portraitOnly ? 'portrait' : s.orientation,
    mark: false,
    ...(p.design === 'routes-only' ? { legendShow: false, scale: 'off' as const } : {}),
  };
  return (await engine.renderOnce(toRenderRequest(state))).svg;
}

// Hidden until checkout works end to end; ?orders shows it for testing.
const ordering = new URLSearchParams(location.search).has('orders');
$('orderSection').hidden = !ordering;
const orders = ordering ? orderPanel({ artworkFor }) : null;
orderReturnBanner();

watchControls($('controls'), (key) => {
  // Changing any part of the look makes the style custom.
  if (lookKeys.has(key)) setActivePreset(null);
  // Typing a title or name means it should be on the poster.
  if ((key === 'title' || key === 'name') && !readState().legendShow) writeState({ legendShow: true });
  render();
});

// ── Downloads ─────────────────────────────────────────────────────────────────

/**
 * PNG sizes. Sharing: twice the image's size. Printing: as large as browsers
 * reliably draw (Safari caps a canvas at about 16.7 million pixels).
 */
const MAX_CANVAS_PIXELS = 16_777_216;

function pngScale(kind: string): number {
  if (kind === 'share') return 2;
  return Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / (current.width * current.height)) * 100) / 100;
}

function updatePngSizes() {
  const select = $<HTMLSelectElement>('pngSize');
  for (const option of select.options) {
    const k = pngScale(option.value);
    const [w, h] = [Math.round(current.width * k), Math.round(current.height * k)];
    const inches = (px: number) => Math.round((px / 300) * 10) / 10;
    option.textContent =
      option.value === 'share'
        ? `For sharing (${w} × ${h} px)`
        : `For printing (${w} × ${h} px, sharp up to ${inches(w)} × ${inches(h)} in)`;
  }
}

/** "my-workouts-ember", from the title and the style. */
function fileName(): string {
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [slug(current.title || DEFAULT_TITLE) || 'stridemap', activePresetId ?? 'custom'].join('-');
}

$('downloadSvg').addEventListener('click', () => downloadSvg(current.svg, `${fileName()}.svg`));
$('downloadPng').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('downloadPng');
  const kind = $<HTMLSelectElement>('pngSize').value;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    await downloadPng(current.svg, current, pngScale(kind), `${fileName()}${kind === 'print' ? '-print' : ''}.png`);
  } catch (err) {
    showError(`Couldn't make the PNG: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Download PNG';
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

// Miles where people run in miles; kilometers everywhere else.
writeState({ units: /^en-(US|LR)|^my/.test(navigator.language) ? 'mi' : 'km' });
// The page opens on a finished poster style.
applyPreset(PRESETS.find((p) => p.id === 'ember')!);
refresh();
// The page opens on an example poster from the sample data, so there's
// something to see (and play with) before anyone finds their export.
loadSample();
