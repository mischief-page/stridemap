/**
 * Renders a print-ready PNG at a print size, from the sample data or an
 * export, to check how a print will look. It takes the same settings options
 * as the CLI (scripts/options.ts), starting from the Afterglow style; the
 * "made with" mark is left off prints. (Orders go through the print shop,
 * which makes its own print files.)
 *
 *   npm run print-file -- --preset ember --size 18x24 --out out/print/ember.png
 */
import { openAsBlob } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_TITLE } from '../src/app/presets';
import { PosterEngine } from '../src/app/poster';
import { toRenderRequest } from '../src/app/settings';
import { prepareWorkouts } from '../src/core/pipeline';
import { readExport } from '../src/parse/import';
import { renderPrintPng } from '../src/print/render';
import { syntheticWorkouts } from '../src/sample/synthetic';
import { FLAG_OPTIONS, OptionError, run, settingsFrom } from './options';

await run(async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      ...FLAG_OPTIONS,
      preset: { type: 'string', default: 'afterglow' },
      size: { type: 'string', default: '18x24' },
      dpi: { type: 'string', default: '300' },
      out: { type: 'string' },
    },
  });
  const { state, preset } = settingsFrom(values);
  state.title ||= DEFAULT_TITLE;
  state.mark = false;
  const [w, h] = values.size.split('x').map(Number);
  if (!(w! > 0 && h! > 0)) throw new OptionError('--size takes inches like 18x24');
  const size = { width: Math.round(Math.min(w!, h!) * Number(values.dpi)), height: Math.round(Math.max(w!, h!) * Number(values.dpi)) };

  const workouts = positionals[0] ? await readExport(await openAsBlob(positionals[0])) : syntheticWorkouts();
  const request = toRenderRequest(state);
  // The canvas takes the product's shape; its size in pixels is set by the print render.
  request.style = { ...request.style, height: Math.round((request.style.width * size.height) / size.width) };
  const { svg } = await new PosterEngine(prepareWorkouts(workouts)).render(request);

  const t = performance.now();
  const png = renderPrintPng(svg, size.width, size.height);
  const out = values.out ?? `out/print/${preset?.id ?? 'custom'}-${values.size}.png`;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, png);
  console.log(`${out}: ${size.width}×${size.height} px, ${(png.length / 1e6).toFixed(1)} MB, rendered in ${Math.round(performance.now() - t)} ms`);
});
