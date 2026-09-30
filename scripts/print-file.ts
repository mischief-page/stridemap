/**
 * Renders a print-ready PNG for a Prodigi product, from the sample data or an
 * export, using a style preset. The "made with" mark is left off prints.
 *
 *   npm run print-file -- --preset ember --sku GLOBAL-FAP-18X24 --out out/print/ember.png
 */
import { openAsBlob } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { readHealthExport } from '../src/parse/health-export';
import { renderPrintPng } from '../src/print/render';
import { DEFAULT_TITLE, findPreset } from '../src/render/presets';
import { DEFAULT_STATE, toRenderRequest } from '../src/render/settings';
import { renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';
import { printSize } from '../src/print/prodigi';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    preset: { type: 'string', default: 'afterglow' },
    sku: { type: 'string', default: 'GLOBAL-FAP-18X24' },
    title: { type: 'string', default: DEFAULT_TITLE },
    out: { type: 'string' },
  },
});

const preset = findPreset(values.preset!);
if (!preset) throw new Error(`Unknown preset ${values.preset}`);
const size = await printSize(values.sku!);

const workouts = positionals[0] ? await readHealthExport(await openAsBlob(positionals[0])) : syntheticWorkouts();
const { filters, layout, style } = toRenderRequest({ ...DEFAULT_STATE, ...preset.look, title: values.title!, mark: false });
// The canvas must have the product's shape; its size in pixels is set by the print render.
const svg = renderSvg(buildScene(prepareWorkouts(workouts), filters, layout), {
  ...style,
  width: style.width,
  height: Math.round((style.width * size.height) / size.width),
});
const t = performance.now();
const png = renderPrintPng(svg, size.width, size.height);
const out = values.out ?? `out/print/${preset.id}-${values.sku}.png`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, png);
console.log(`${out}: ${size.width}×${size.height} px, ${(png.length / 1e6).toFixed(1)} MB, rendered in ${Math.round(performance.now() - t)} ms`);
