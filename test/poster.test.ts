import { describe, expect, it, vi } from 'vitest';
import { PosterEngine } from '../src/app/poster';
import { DEFAULT_STATE, toRenderRequest, type EditorState } from '../src/app/settings';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { MapLoader } from '../src/map/tiles';
import { syntheticWorkouts } from '../src/sample/synthetic';
import { makeTile } from './mvt';

const prepared = prepareWorkouts(syntheticWorkouts(60));
const TILE = makeTile({ transportation: [{ type: 2, props: { class: 'primary' }, points: [[0, 2048], [4096, 2048]] }] });

function setup(fetchImpl?: (url: string) => Promise<Response>) {
  const build = vi.fn(buildScene);
  const fetchFn = vi.fn(fetchImpl ?? (async (url: string) => (url.endsWith('/planet') ? new Response(JSON.stringify({ tiles: ['https://t.example/{z}/{x}/{y}'] })) : new Response(TILE))));
  const engine = new PosterEngine(prepared, new MapLoader(fetchFn as unknown as typeof fetch), build);
  const draw = (s: Partial<EditorState>) => engine.render(toRenderRequest({ ...DEFAULT_STATE, ...s }));
  return { engine, build, fetchFn, draw };
}

describe('PosterEngine', () => {
  it('redraws a color change without rebuilding the scene or the route shapes', async () => {
    const { engine, build, draw } = setup();
    await draw({});
    const shapes = (engine as unknown as { shapes: { last: { paths: string[] } } }).shapes.last.paths;
    await draw({ colorB: '#ff0000', title: 'New', legendShow: true });
    expect(build).toHaveBeenCalledTimes(1);
    expect((engine as unknown as { shapes: { last: { paths: string[] } } }).shapes.last.paths).toBe(shapes);
  });

  it('with the street map on, a color change rebuilds nothing and fetches nothing', async () => {
    const { build, fetchFn, draw } = setup();
    const first = await draw({ underlay: 'map' });
    expect(first.map?.ok).toBe(true);
    const builds = build.mock.calls.length;
    const fetches = fetchFn.mock.calls.length;
    await draw({ underlay: 'map', colorB: '#ff0000' });
    await draw({ underlay: 'map', colorA: '#00ff00' });
    expect(build).toHaveBeenCalledTimes(builds);
    expect(fetchFn).toHaveBeenCalledTimes(fetches);
  });

  it('draws the routes without a map, and says why, when the map can’t load', async () => {
    const { draw } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    const poster = await draw({ underlay: 'map' });
    expect(poster.map).toEqual({ ok: false, reason: 'offline', message: 'Failed to fetch' });
    expect(poster.svg).not.toContain('class="map"');
    expect(poster.scene.workoutCount).toBe(prepared.length);
  });

  it('works out the home point once', async () => {
    const { engine, draw } = setup();
    await draw({ underlay: 'map' });
    const home = engine.homePoint();
    await draw({ underlay: 'map', mapOthers: 'omit' });
    expect(engine.homePoint()).toBe(home);
  });
});
