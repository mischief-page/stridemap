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
import { renderSvg } from '../src/render/svg';
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
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sample: { type: 'boolean', default: false },
    out: { type: 'string', default: 'out/stridemap.svg' },
    preset: { type: 'string' },
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

const prepared = prepareWorkouts(workouts);
const { filters, layout, style } = toRenderRequest(state);
const scene = buildScene(prepared, filters, layout);
const svg = renderSvg(scene, style);

const out = values.out as string;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(
  `${workouts.length} workouts found, ${prepared.length} outdoor with GPS, ${scene.workoutCount} drawn -> ${out} (${(svg.length / 1024).toFixed(0)} KB)`,
);
