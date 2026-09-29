/**
 * Renders a stridemap SVG from the command line.
 *
 *   npm run cli -- --sample --out out/sample.svg
 *   npm run cli -- --sample --preset gallery --title "Two Years on Foot" --out out/gallery.svg
 *   npm run cli -- ~/Downloads/export.zip --mode frequency --out out/me.svg
 *
 * Settings start from the defaults, then the --preset's look, then any other
 * options given. Real exports are read locally and never leave your machine.
 */
import { openAsBlob } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import type { ActivityType } from '../src/core/types';
import { readHealthExport } from '../src/parse/health-export';
import { findPreset, PRESETS } from '../src/render/presets';
import { DEFAULT_STATE, toRenderRequest, type EditorState } from '../src/render/settings';
import { renderSvg, visibleMeters } from '../src/render/svg';
import { detectHome, NEAR_RADIUS_M } from '../src/map/anchor';
import { geocode } from '../src/map/geocode';
import { MapLoader } from '../src/map/tiles';
import { mapScene } from '../src/map/scene';
import { syntheticWorkouts } from '../src/sample/synthetic';

type Flag = { type: 'string' | 'boolean'; apply: (value: unknown, s: Partial<EditorState>) => void };
const str = <K extends keyof EditorState>(key: K): Flag => ({ type: 'string', apply: (v, s) => void (s[key] = v as never) });
const num = <K extends keyof EditorState>(key: K): Flag => ({ type: 'string', apply: (v, s) => void (s[key] = Number(v) as never) });
const bool = <K extends keyof EditorState>(key: K): Flag => ({ type: 'boolean', apply: (v, s) => void (s[key] = v as never) });

/** Every setting option, mapped onto the shared settings record. */
const FLAGS: Record<string, Flag> = {
  types: { type: 'string', apply: (v, s) => void (s.types = String(v).split(',') as ActivityType[]) },
  from: str('from'),
  to: str('to'),
  title: str('title'),
  name: str('name'),
  units: str('units'),
  'no-mark': { type: 'boolean', apply: (v, s) => void (s.mark = !v) },
  mode: str('colorMode'),
  fit: num('fit'),
  squash: num('squash'),
  aspect: str('aspect'),
  portrait: { type: 'boolean', apply: (v, s) => void (s.orientation = v ? 'portrait' : 'landscape') },
  background: str('background'),
  'color-a': str('colorA'),
  'color-b': str('colorB'),
  blend: str('blend'),
  'line-width': num('strokeWidth'),
  opacity: num('opacity'),
  smooth: num('smoothing'),
  pencil: { type: 'string', apply: (v, s) => void Object.assign(s, { lineStyle: 'pencil', roughness: Number(v) }) },
  grain: num('grain'),
  scale: str('scale'),
  'scale-color': str('scaleColor'),
  dates: bool('showDates'),
  stats: bool('showStats'),
  'text-band': bool('textBand'),
  'date-format': str('dateFormat'),
  'legend-position': str('legendPosition'),
  'legend-font': str('legendFont'),
  'legend-size': num('legendSize'),
  'legend-caps': bool('legendCaps'),
  'legend-color': str('legendColor'),
  'legend-backdrop': str('legendBackdrop'),
  map: bool('mapShow'),
  'map-at': { type: 'string', apply: (v, s) => void Object.assign(s, { mapShow: true, mapPlace: 'custom', mapAt: v }) },
  'map-opacity': num('mapOpacity'),
  'map-others': str('mapOthers'),
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sample: { type: 'boolean', default: false },
    out: { type: 'string', default: 'out/stridemap.svg' },
    preset: { type: 'string' },
    'map-address': { type: 'string' },
    ...Object.fromEntries(Object.entries(FLAGS).map(([name, f]) => [name, { type: f.type }])),
  },
});

const zipPath = positionals[0];
if (!values.sample && !zipPath) {
  console.error('Usage: npm run cli -- <export.zip> [options]   or   npm run cli -- --sample');
  process.exit(1);
}
const preset = values.preset ? findPreset(values.preset as string) : undefined;
if (values.preset && !preset) {
  console.error(`Unknown preset "${values.preset}". Choose one of: ${PRESETS.map((p) => p.id).join(', ')}`);
  process.exit(1);
}

const given: Partial<EditorState> = {};
for (const [name, flag] of Object.entries(FLAGS)) {
  const value = (values as Record<string, unknown>)[name];
  if (value !== undefined) flag.apply(value, given);
}
const state: EditorState = { ...DEFAULT_STATE, ...preset?.look, ...given };
// Without a preset, the legend appears as soon as there's something to put in it.
if (!preset) state.legendShow = Boolean(state.title || state.name || given.showDates || given.showStats);

const workouts = values.sample
  ? syntheticWorkouts()
  : await readHealthExport(await openAsBlob(zipPath!), (p) => {
      process.stderr.write(`\r${p.stage}: ${Math.round((p.done / p.total) * 100)}%   `);
    });
process.stderr.write('\n');

// Address lookup (the one step that sends anything off this machine) only when asked for.
if (values['map-address']) {
  const hit = await geocode(values['map-address'] as string, fetch, { 'User-Agent': 'stridemap-cli (github.com/mischief-page/stridemap)' });
  if (!hit) {
    console.error(`No match for "${values['map-address']}".`);
    process.exit(1);
  }
  console.log(`Map at ${hit.label}`);
  Object.assign(state, { mapShow: true, mapPlace: 'custom', mapAt: `${hit.lat}, ${hit.lon}` });
}

const prepared = prepareWorkouts(workouts);
const { filters, layout, style, map } = toRenderRequest(state);
let scene = buildScene(prepared, filters, layout);
let svg: string;
if (map) {
  const at = map.at === 'detected' ? detectHome(prepared.map((w) => ({ lat: w.lat[0]!, lon: w.lon[0]! }))) : map.at;
  if (!at) {
    console.error('--map-at needs "lat, lon", e.g. --map-at "41.8781, -87.6298"');
    process.exit(1);
  }
  scene = mapScene((f, l) => buildScene(prepared, f, l), filters, layout, style, at, map.others);
  if (!scene.geoAnchor!.near) {
    console.error(`No routes start within ${NEAR_RADIUS_M} m of ${at.lat}, ${at.lon}.`);
    process.exit(1);
  }
  const features = await new MapLoader().load(at, visibleMeters(scene, style));
  svg = renderSvg(scene, style, features);
  const g = scene.geoAnchor!;
  console.log(`Map at ${at.lat.toFixed(5)}, ${at.lon.toFixed(5)}: ${g.near} routes start there; ${g.elsewhereDrawn} of ${g.elsewhere} starting elsewhere drawn.`);
} else {
  svg = renderSvg(scene, style);
}

const out = values.out as string;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(
  `${workouts.length} workouts found, ${prepared.length} outdoor with GPS, ${scene.workoutCount} drawn -> ${out} (${(svg.length / 1024).toFixed(0)} KB)`,
);
