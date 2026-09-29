import { PRESETS, type Preset } from '../render/presets';
import { LOOK_KEYS, toRenderRequest, type EditorState } from '../render/settings';
import { readState, refresh, watchControls, writeState } from './controls';
import { createEngine } from './engine';
import type { MapResult } from './worker';
import { GEOCODE_ATTRIBUTION, geocode } from '../map/geocode';
import type { Product } from '../print/catalog';
import { productCards } from './order-ui';
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
  onRendered({ svg, shown, withGps, map }, more) {
    current.svg = svg;
    status.textContent = `${shown} of ${withGps} outdoor workouts with GPS shown.`;
    $('mapStatus').textContent = mapStatus(map);
    // The underlying error, for anyone curious why the map didn't load.
    $('mapStatus').title = map && !map.ok ? (map.message ?? '') : '';
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
  const { filters, layout, style, map } = toRenderRequest(readState());
  engine.render({ filters, layout, style, map });
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
  const where = map.detected ? 'where most routes start' : `${map.at.lat.toFixed(4)}, ${map.at.lon.toFixed(4)}`;
  const status = [`Map centred on ${where}. ${map.near} routes start here.`];
  if (map.elsewhere) {
    status.push(
      {
        omit: `${map.elsewhere} starting elsewhere are left out.`,
        true: `${map.elsewhereDrawn} of ${map.elsewhere} starting elsewhere cross the picture and are drawn.`,
        anchored: `${map.elsewhere} starting elsewhere are drawn from this point.`,
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
  markPreset(p?.id ?? null);
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
  writeState({ ...p.look, title: readState().title.trim() || 'Every Step' });
  setActivePreset(p);
  render();
}

// ── Ordering ──────────────────────────────────────────────────────────────────

// Hidden until checkout works; ?orders shows it for testing.
$('orderSection').hidden = !new URLSearchParams(location.search).has('orders');
let chosenProduct: Product | null = null;
const markProduct = productCards($('products'), chooseProduct);

/** Choosing a print sets the picture to the product's shape. */
function chooseProduct(p: Product | null) {
  chosenProduct = p;
  markProduct(p?.id ?? null);
  $('productNote').textContent = p
    ? `${p.name}: $${p.priceUsd}, US shipping included. The picture is set to this print's shape.`
    : 'Choosing a print sets the picture to its shape. Prints leave off the “made with” mark.';
  if (p) {
    writeState({ aspect: p.aspect });
    render();
  }
}

watchControls($('controls'), (key) => {
  // Changing any part of the look makes the style custom.
  if (lookKeys.has(key)) setActivePreset(null);
  // A different print shape no longer fits the chosen print.
  if (key === 'aspect' && chosenProduct && readState().aspect !== chosenProduct.aspect) chooseProduct(null);
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
