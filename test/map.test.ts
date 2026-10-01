import { describe, expect, it, vi } from 'vitest';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { metersPerDegLon } from '../src/core/track';
import { detectHome } from '../src/map/anchor';
import { PosterEngine } from '../src/app/poster';
import { geocode } from '../src/map/geocode';
import { decodeTile, emptyFeatures, MapLoader, tilesFor } from '../src/map/tiles';
import { MAP_ATTRIBUTION } from '../src/render/map';
import { DEFAULT_STATE, parseLatLon, toRenderRequest } from '../src/app/settings';
import { renderSvg } from '../src/render/svg';
import { visibleMeters } from '../src/render/frame';
import { syntheticWorkouts } from '../src/sample/synthetic';

import { makeTile } from './mvt';

const TILE = makeTile({
  transportation: [
    { type: 2, props: { class: 'primary' }, points: [[0, 2048], [4096, 2048]] },
    { type: 2, props: { class: 'residential' }, points: [[2048, 0], [2048, 4096]] },
    { type: 2, props: { class: 'path' }, points: [[0, 0], [4096, 4096]] },
    { type: 2, props: { class: 'rail' }, points: [[0, 4096], [4096, 0]] },
  ],
  water: [{ type: 3, props: {}, points: [[100, 100], [1000, 100], [1000, 1000], [100, 1000]] }],
});

/** A map loader whose every tile is TILE, so maps always load in tests. */
const fakeMaps = () =>
  new MapLoader((async (url: string) =>
    url.endsWith('/planet') ? new Response(JSON.stringify({ tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'] })) : new Response(TILE)) as unknown as typeof fetch);

// Tile 14/4202/6078 holds this point (near the middle of it).
const Z = 14, TX = 4202, TY = 6078;
const tileCenter = { lon: ((TX + 0.5) / 2 ** Z) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (TY + 0.5)) / 2 ** Z))) * 180) / Math.PI };

describe('tilesFor', () => {
  it('uses the finest zoom for a small area, and the tile under the point', () => {
    const { z, tiles } = tilesFor(tileCenter, { minX: -100, maxX: 100, minY: -100, maxY: 100 });
    expect(z).toBe(14);
    expect(tiles).toEqual([{ x: TX, y: TY }]);
  });

  it('drops to a coarser zoom for a large area, keeping the tile count bounded', () => {
    const { z, tiles } = tilesFor(tileCenter, { minX: -60_000, maxX: 60_000, minY: -60_000, maxY: 60_000 });
    expect(z).toBeLessThan(14);
    expect(tiles.length).toBeLessThanOrEqual(144);
  });
});

describe('decodeTile', () => {
  it('sorts roads by class and places features in meters around the anchor', () => {
    const f = emptyFeatures();
    decodeTile(TILE, TX, TY, Z, tileCenter, f);
    expect(f.majorRoads).toHaveLength(1);
    expect(f.minorRoads).toHaveLength(1);
    expect(f.paths).toHaveLength(1);
    expect(f.water).toHaveLength(1);
    // Railways aren't drawn.
    expect(f.majorRoads.length + f.minorRoads.length + f.paths.length).toBe(3);
    // The east–west road runs through the tile's middle: y ≈ 0 m, spanning a tile (~1.8 km at this latitude).
    const road = f.majorRoads[0]!;
    expect(Math.abs(road[1]!)).toBeLessThan(1);
    expect(road[2]! - road[0]!).toBeGreaterThan(1500);
    expect(road[2]! - road[0]!).toBeLessThan(2500);
    // The north–south street runs through x ≈ 0, north to south.
    const street = f.minorRoads[0]!;
    expect(Math.abs(street[0]!)).toBeLessThan(1);
    expect(street[1]!).toBeGreaterThan(street[3]!);
  });
});

describe('MapLoader', () => {
  it('fetches each tile once and reuses it on redraws', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/planet')
        ? new Response(JSON.stringify({ tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'] }))
        : new Response(TILE),
    );
    const loader = new MapLoader(fetchFn as unknown as typeof fetch);
    const area = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const a = await loader.load(tileCenter, area);
    await loader.load(tileCenter, area);
    expect(a.majorRoads).toHaveLength(1);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://tiles.openfreemap.org/planet',
      `https://tiles.example/${Z}/${TX}/${TY}.pbf`,
    ]);
  });
});

describe('MapLoader failures', () => {
  const TILEJSON_BODY = JSON.stringify({ tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'] });
  const area = { minX: -100, maxX: 100, minY: -100, maxY: 100 };

  it('tries the TileJSON again after a failure, rather than failing for good', async () => {
    let online = false;
    const fetchFn = vi.fn(async (url: string) => {
      if (!online) throw new TypeError('Failed to fetch');
      return url.endsWith('/planet') ? new Response(TILEJSON_BODY) : new Response(TILE);
    });
    const loader = new MapLoader(fetchFn as unknown as typeof fetch);
    await expect(loader.load(tileCenter, area)).rejects.toThrow('Failed to fetch');
    online = true;
    expect((await loader.load(tileCenter, area)).majorRoads).toHaveLength(1);
  });

  it('fails on a rate-limited tile and fetches it again next time; a missing tile is just empty', async () => {
    let status = 503;
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/planet') ? new Response(TILEJSON_BODY) : status === 200 ? new Response(TILE) : new Response(null, { status }),
    );
    const loader = new MapLoader(fetchFn as unknown as typeof fetch);
    await expect(loader.load(tileCenter, area)).rejects.toThrow('503');
    status = 200;
    expect((await loader.load(tileCenter, area)).majorRoads).toHaveLength(1);

    const empty = new MapLoader((async (url: string) =>
      url.endsWith('/planet') ? new Response(TILEJSON_BODY) : new Response(null, { status: 404 })) as unknown as typeof fetch);
    expect((await empty.load(tileCenter, area)).majorRoads).toHaveLength(0);
  });

  it('reuses decoded tiles for a new center, placing them around it', async () => {
    const fetchFn = vi.fn(async (url: string) => (url.endsWith('/planet') ? new Response(TILEJSON_BODY) : new Response(TILE)));
    const loader = new MapLoader(fetchFn as unknown as typeof fetch);
    const a = await loader.load(tileCenter, area);
    const moved = { lat: tileCenter.lat, lon: tileCenter.lon + 0.001 }; // about 83 m east, same tile
    const b = await loader.load(moved, area);
    expect(fetchFn).toHaveBeenCalledTimes(2); // TileJSON and the one tile, once each
    // The same road, about 83 m further west of the new center.
    expect(a.majorRoads[0]![0]! - b.majorRoads[0]![0]!).toBeCloseTo(0.001 * metersPerDegLon(tileCenter.lat), 0);
    // Asking again for the same view returns the same result without reprojecting.
    expect(await loader.load(moved, area)).toBe(b);
  });
});

describe('detectHome', () => {
  it('finds the busiest start, ignoring trips elsewhere', () => {
    const at = (lat: number, lon: number) => ({ lat, lon });
    const starts = [at(40, -100), at(40.0005, -100), at(40, -100.0005), at(34, -80), at(34, -80), at(51, 0)];
    const home = detectHome(starts)!;
    expect(home.lat).toBeCloseTo(40.0002, 3);
    expect(home.lon).toBeCloseTo(-100.0002, 3);
    expect(home.near).toBe(3);
    expect(home.total).toBe(6);
  });

  it('is null with no workouts', () => {
    expect(detectHome([])).toBeNull();
  });
});

describe('parseLatLon', () => {
  it('reads coordinates as map apps copy them', () => {
    expect(parseLatLon('41.8781, -87.6298')).toEqual({ lat: 41.8781, lon: -87.6298 });
    expect(parseLatLon(' 41.8781 -87.6298 ')).toEqual({ lat: 41.8781, lon: -87.6298 });
    expect(parseLatLon('41,-87')).toEqual({ lat: 41, lon: -87 });
  });

  it('rejects anything else', () => {
    expect(parseLatLon('')).toBeNull();
    expect(parseLatLon('Chicago')).toBeNull();
    expect(parseLatLon('95, 10')).toBeNull();
  });
});

describe('geocode', () => {
  it('returns the first match', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify([{ lat: '41.9', lon: '-87.6', display_name: 'Somewhere' }])));
    const hit = await geocode('1 Main St', fetchFn as unknown as typeof fetch);
    expect(hit).toEqual({ lat: 41.9, lon: -87.6, label: 'Somewhere' });
    expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toContain('q=1+Main+St');
  });
});

describe('map settings and drawing', () => {
  const prepared = prepareWorkouts(syntheticWorkouts());
  const home = detectHome(prepared.map((w) => ({ lat: w.lat[0]!, lon: w.lon[0]! })))!;

  it('asks for the map only when it is on', () => {
    expect(toRenderRequest(DEFAULT_STATE).map).toBeNull();
    expect(toRenderRequest(DEFAULT_STATE).style.map).toBeNull();
    expect(toRenderRequest({ ...DEFAULT_STATE, underlay: 'map' as const }).map).toEqual({ at: 'detected', others: 'true' });
    expect(toRenderRequest({ ...DEFAULT_STATE, underlay: 'map' as const, mapPlace: 'custom', mapAt: '1, 2' }).map).toEqual({ at: { lat: 1, lon: 2 }, others: 'true' });
    expect(toRenderRequest({ ...DEFAULT_STATE, underlay: 'map' as const, mapPlace: 'custom', mapAt: 'x' }).map).toEqual({ at: null, others: 'true' });
  });

  const geo = (others: 'omit' | 'true' | 'anchored') => ({ lat: home.lat, lon: home.lon, radiusM: 300, others });

  it('places routes around the point and turns squash off', () => {
    const { filters, layout } = toRenderRequest({ ...DEFAULT_STATE, squash: 0.5 });
    const scene = buildScene(prepared, filters, { ...layout, geoAnchor: geo('omit') });
    expect(scene.radialExponent).toBe(1);
    const g = scene.geoAnchor!;
    expect(g.elsewhere).toBeGreaterThan(0);
    expect(g.near + g.elsewhere).toBe(prepared.length);
    expect(scene.workoutCount).toBe(g.near);
    expect(g.elsewhereDrawn).toBe(0);
  });

  it('draws routes from elsewhere from the map point when asked', () => {
    const { filters, layout } = toRenderRequest(DEFAULT_STATE);
    const scene = buildScene(prepared, filters, { ...layout, geoAnchor: geo('anchored') });
    expect(scene.workoutCount).toBe(prepared.length);
    expect(scene.geoAnchor!.elsewhereDrawn).toBe(scene.geoAnchor!.elsewhere);
  });

  it('draws routes from elsewhere where they went, only if they cross the picture, fitting to the local ones', async () => {
    const { filters, layout, style } = toRenderRequest({ ...DEFAULT_STATE, underlay: 'map' });
    const engine = new PosterEngine(prepared, fakeMaps());
    const draw = async (others: 'omit' | 'true') => (await engine.render({ filters, layout, style, map: { at: home, others } })).scene;
    const omit = await draw('omit');
    const scene = await draw('true');
    expect(scene.geoAnchor).not.toBeNull();
    const g = scene.geoAnchor!;
    // The nearby "work" routes (~5 km away) cross the picture; trips to another state don't.
    expect(g.elsewhereDrawn).toBeGreaterThan(0);
    expect(g.elsewhereDrawn).toBeLessThan(g.elsewhere);
    expect(scene.workoutCount).toBe(g.near + g.elsewhereDrawn);
    // Same framing as with them left out.
    expect(scene.bounds).toEqual(omit.bounds);
    // Every route drawn touches the picture.
    const v = visibleMeters(scene, style);
    for (const t of scene.tracks) {
      expect(t.bbox.maxX >= v.minX && t.bbox.minX <= v.maxX && t.bbox.maxY >= v.minY && t.bbox.minY <= v.maxY).toBe(true);
    }
  });

  it('draws the map under the routes, with its credit even without the mark', () => {
    const { filters, layout, style } = toRenderRequest({ ...DEFAULT_STATE, underlay: 'map' as const, mark: false });
    const scene = buildScene(prepared, filters, { ...layout, geoAnchor: geo('omit') });
    const f = emptyFeatures();
    const v = visibleMeters(scene, style);
    f.majorRoads.push(new Float32Array([v.minX, 0, v.maxX, 0]));
    f.minorRoads.push(new Float32Array([1e7, 1e7, 1e7 + 10, 1e7])); // far off the canvas
    const svg = renderSvg(scene, style, f);
    expect(svg).toContain('class="map"');
    expect(svg.indexOf('class="map"')).toBeLessThan(svg.indexOf('stroke-linecap="round" stroke-linejoin="round" style="isolation'));
    expect(svg).toContain(MAP_ATTRIBUTION);
    expect(svg).not.toContain('made with');
    // Features off the canvas aren't written out.
    expect(svg.match(/<path [^>]*stroke-opacity="0.6"/)).toBeNull();
  });

  it('draws no map or credit without features', () => {
    const { filters, layout, style } = toRenderRequest({ ...DEFAULT_STATE, underlay: 'map' as const });
    const svg = renderSvg(buildScene(prepared, filters, layout), style);
    expect(svg).not.toContain('class="map"');
    expect(svg).not.toContain('OpenStreetMap');
  });
});
