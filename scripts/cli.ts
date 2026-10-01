/**
 * Renders a stridemap SVG from the command line.
 *
 *   npm run cli -- --sample --out out/sample.svg
 *   npm run cli -- --sample --preset gallery --title "Two Years on Foot" --out out/gallery.svg
 *   npm run cli -- ~/Downloads/export.zip --mode frequency --out out/me.svg
 *
 * Settings start from the defaults, then the --preset's look, then any other
 * options given (see scripts/options.ts). Exports are read locally and never
 * leave your machine.
 */
import { openAsBlob } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { PosterEngine } from '../src/app/poster';
import { toRenderRequest } from '../src/app/settings';
import { prepareWorkouts } from '../src/core/pipeline';
import { NEAR_RADIUS_M } from '../src/map/anchor';
import { geocode } from '../src/map/geocode';
import { readExport } from '../src/parse/import';
import { syntheticWorkouts } from '../src/sample/synthetic';
import { FLAG_OPTIONS, OptionError, run, settingsFrom } from './options';

await run(async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      sample: { type: 'boolean', default: false },
      out: { type: 'string', default: 'out/stridemap.svg' },
      'map-address': { type: 'string' },
      ...FLAG_OPTIONS,
    },
  });

  const zipPath = positionals[0];
  if (!values.sample && !zipPath) throw new OptionError('Usage: npm run cli -- <export.zip> [options]   or   npm run cli -- --sample');
  const { state } = settingsFrom(values);

  const workouts = values.sample
    ? syntheticWorkouts()
    : await readExport(await openAsBlob(zipPath!), (p) => {
        process.stderr.write(`\r${p.stage}: ${Math.round((p.done / p.total) * 100)}%   `);
      });
  process.stderr.write('\n');

  // Address lookup (the one step that sends anything off this machine) only when asked for.
  if (values['map-address']) {
    const hit = await geocode(values['map-address'], fetch, { 'User-Agent': 'stridemap-cli (github.com/mischief-page/stridemap)' });
    if (!hit) throw new OptionError(`No match for "${values['map-address']}".`);
    console.log(`Map at ${hit.label}`);
    Object.assign(state, { underlay: 'map', mapPlace: 'custom', mapAt: `${hit.lat}, ${hit.lon}` });
  }

  const engine = new PosterEngine(prepareWorkouts(workouts));
  const request = toRenderRequest(state);
  if (request.map?.at === null) throw new OptionError('--map-at needs "lat, lon", e.g. --map-at "41.8781, -87.6298"');
  const { svg, scene, map } = await engine.render(request);
  if (map?.ok === false) {
    const why = { 'no-point': 'there was no point to center it on', 'no-routes': `no routes start within ${NEAR_RADIUS_M} m of its center`, offline: `the map couldn't be loaded (${map.message})` };
    throw new OptionError(`No map: ${why[map.reason]}.`);
  }
  if (map?.ok) {
    console.log(`Map at ${map.at.lat.toFixed(5)}, ${map.at.lon.toFixed(5)}: ${map.near} routes start there; ${map.elsewhereDrawn} of ${map.elsewhere} starting elsewhere drawn.`);
  }

  const out = values.out;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, svg);
  console.log(`${workouts.length} workouts found, ${engine.workouts.length} outdoor with GPS, ${scene.workoutCount} drawn -> ${out} (${(svg.length / 1024).toFixed(0)} KB)`);
});
