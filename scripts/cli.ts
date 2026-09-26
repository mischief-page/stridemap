/**
 * Renders a stridemap SVG from the command line.
 *
 *   npm run cli -- --sample --out out/sample.svg
 *   npm run cli -- ~/Downloads/export.zip --mode frequency --out out/me.svg
 *
 * Real exports are read locally and never leave your machine.
 */
import { openAsBlob } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildScene, type ColorMode } from '../src/core/pipeline';
import { ACTIVITY_TYPES, type ActivityType } from '../src/core/types';
import { readHealthExport } from '../src/parse/health-export';
import type { ScaleStyle, Units } from '../src/render/scale';
import { DEFAULT_STYLE, renderSvg, type Blend } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sample: { type: 'boolean', default: false },
    out: { type: 'string', default: 'out/stridemap.svg' },
    mode: { type: 'string', default: 'pace' },
    types: { type: 'string', default: ACTIVITY_TYPES.join(',') },
    from: { type: 'string' },
    to: { type: 'string' },
    fit: { type: 'string', default: '95' },
    squash: { type: 'string', default: '1' },
    'color-a': { type: 'string', default: DEFAULT_STYLE.colorA },
    'color-b': { type: 'string', default: DEFAULT_STYLE.colorB },
    background: { type: 'string', default: DEFAULT_STYLE.background },
    blend: { type: 'string', default: DEFAULT_STYLE.blend },
    scale: { type: 'string', default: DEFAULT_STYLE.scale },
    units: { type: 'string', default: DEFAULT_STYLE.units },
  },
});

const zipPath = positionals[0];
if (!values.sample && !zipPath) {
  console.error('Usage: npm run cli -- <export.zip> [options]   or   npm run cli -- --sample');
  process.exit(1);
}

const workouts = values.sample
  ? syntheticWorkouts()
  : await readHealthExport(await openAsBlob(zipPath!), (p) => {
      process.stderr.write(`\r${p.stage}: ${Math.round((p.done / p.total) * 100)}%   `);
    });
process.stderr.write('\n');

const scene = buildScene(
  workouts,
  {
    types: values.types.split(',') as ActivityType[],
    from: values.from ? Date.parse(values.from) : null,
    to: values.to ? Date.parse(values.to) : null,
  },
  {
    colorMode: values.mode as ColorMode,
    fitPercentile: Number(values.fit),
    radialExponent: Number(values.squash),
  },
);

const svg = renderSvg(scene, {
  ...DEFAULT_STYLE,
  colorA: values['color-a'],
  colorB: values['color-b'],
  background: values.background,
  blend: values.blend as Blend,
  scale: values.scale as ScaleStyle,
  units: values.units as Units,
});

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, svg);
const withRoute = workouts.filter((w) => w.track).length;
console.log(
  `${workouts.length} workouts found, ${withRoute} with GPS, ${scene.workoutCount} drawn -> ${values.out} (${(svg.length / 1024).toFixed(0)} KB)`,
);
