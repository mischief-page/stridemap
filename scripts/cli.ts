/**
 * Renders a stridemap SVG from the command line.
 *
 *   npm run cli -- --sample --out out/sample.svg
 *   npm run cli -- --sample --preset gallery --title "Two Years on Foot" --out out/gallery.svg
 *   npm run cli -- ~/Downloads/export.zip --mode frequency --out out/me.svg
 *
 * A --preset sets the starting look; any other look option overrides it.
 * Real exports are read locally and never leave your machine.
 */
import { openAsBlob } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildScene, type ColorMode } from '../src/core/pipeline';
import { ACTIVITY_TYPES, type ActivityType } from '../src/core/types';
import { readHealthExport } from '../src/parse/health-export';
import { canvasSize, type Aspect, type Orientation } from '../src/render/canvas';
import {
  DEFAULT_LEGEND,
  type DateFormat,
  type LegendBackdrop,
  type LegendFont,
  type LegendPosition,
} from '../src/render/legend';
import { findPreset, PRESETS } from '../src/render/presets';
import type { ScaleStyle, Units } from '../src/render/scale';
import { DEFAULT_STYLE, renderSvg, type Blend } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

// Look options have no defaults here: an unset option falls back to the
// preset's value, then to the renderer's default.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sample: { type: 'boolean', default: false },
    out: { type: 'string', default: 'out/stridemap.svg' },
    preset: { type: 'string' },
    types: { type: 'string', default: ACTIVITY_TYPES.join(',') },
    from: { type: 'string' },
    to: { type: 'string' },
    fit: { type: 'string', default: '95' },
    mode: { type: 'string' },
    squash: { type: 'string' },
    'color-a': { type: 'string' },
    'color-b': { type: 'string' },
    background: { type: 'string' },
    blend: { type: 'string' },
    scale: { type: 'string' },
    units: { type: 'string', default: DEFAULT_STYLE.units },
    'scale-color': { type: 'string' },
    aspect: { type: 'string' },
    portrait: { type: 'boolean' },
    smooth: { type: 'string' },
    pencil: { type: 'string' },
    grain: { type: 'string', default: '0.5' },
    title: { type: 'string', default: '' },
    name: { type: 'string', default: '' },
    dates: { type: 'boolean' },
    stats: { type: 'boolean' },
    'text-band': { type: 'boolean' },
    'date-format': { type: 'string' },
    'legend-position': { type: 'string' },
    'legend-font': { type: 'string' },
    'legend-size': { type: 'string' },
    'legend-caps': { type: 'boolean' },
    'legend-color': { type: 'string' },
    'legend-backdrop': { type: 'string' },
  },
});

const zipPath = positionals[0];
if (!values.sample && !zipPath) {
  console.error('Usage: npm run cli -- <export.zip> [options]   or   npm run cli -- --sample');
  process.exit(1);
}

const preset = values.preset ? findPreset(values.preset) : undefined;
if (values.preset && !preset) {
  console.error(`Unknown preset "${values.preset}". Choose one of: ${PRESETS.map((p) => p.id).join(', ')}`);
  process.exit(1);
}
const look = preset?.style;
const legendLook = preset?.legend;
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

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
    colorMode: (values.mode ?? preset?.colorMode ?? 'pace') as ColorMode,
    fitPercentile: Number(values.fit),
    radialExponent: num(values.squash) ?? preset?.squash ?? 1,
  },
);

const orientation: Orientation =
  values.portrait !== undefined ? (values.portrait ? 'portrait' : 'landscape') : (preset?.orientation ?? 'landscape');
const showDates = values.dates ?? legendLook?.showDates ?? false;
const showStats = values.stats ?? legendLook?.showStats ?? false;

const svg = renderSvg(scene, {
  ...DEFAULT_STYLE,
  ...canvasSize((values.aspect ?? preset?.aspect ?? '3:2') as Aspect, orientation),
  smoothing: num(values.smooth) ?? look?.smoothing ?? DEFAULT_STYLE.smoothing,
  pencil: values.pencil
    ? { roughness: Number(values.pencil), grain: Number(values.grain) }
    : (look?.pencil ?? null),
  colorA: values['color-a'] ?? look?.colorA ?? DEFAULT_STYLE.colorA,
  colorB: values['color-b'] ?? look?.colorB ?? DEFAULT_STYLE.colorB,
  background: values.background ?? look?.background ?? DEFAULT_STYLE.background,
  blend: (values.blend ?? look?.blend ?? DEFAULT_STYLE.blend) as Blend,
  strokeWidth: look?.strokeWidth ?? DEFAULT_STYLE.strokeWidth,
  opacity: look?.opacity ?? DEFAULT_STYLE.opacity,
  scale: (values.scale ?? look?.scale ?? DEFAULT_STYLE.scale) as ScaleStyle,
  units: values.units as Units,
  scaleColor: values['scale-color'] ?? null,
  textBand: values['text-band'] ?? look?.textBand ?? false,
  legend: {
    // The legend appears as soon as there's something to put in it.
    show: Boolean(values.title || values.name || showDates || showStats),
    title: values.title,
    name: values.name,
    showDates,
    showStats,
    dateFormat: (values['date-format'] ?? legendLook?.dateFormat ?? DEFAULT_LEGEND.dateFormat) as DateFormat,
    position: (values['legend-position'] ?? legendLook?.position ?? DEFAULT_LEGEND.position) as LegendPosition,
    font: (values['legend-font'] ?? legendLook?.font ?? DEFAULT_LEGEND.font) as LegendFont,
    size: num(values['legend-size']) ?? legendLook?.size ?? DEFAULT_LEGEND.size,
    uppercaseTitle: values['legend-caps'] ?? legendLook?.uppercaseTitle ?? false,
    color: values['legend-color'] ?? null,
    backdrop: (values['legend-backdrop'] ?? legendLook?.backdrop ?? DEFAULT_LEGEND.backdrop) as LegendBackdrop,
  },
});

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, svg);
const withRoute = workouts.filter((w) => w.track).length;
console.log(
  `${workouts.length} workouts found, ${withRoute} with GPS, ${scene.workoutCount} drawn -> ${values.out} (${(svg.length / 1024).toFixed(0)} KB)`,
);
