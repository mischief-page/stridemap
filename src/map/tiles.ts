import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { METERS_PER_DEG_LAT, metersPerDegLon } from '../core/track';
import type { Bounds } from '../core/types';
import type { GeoPoint } from './anchor';

/**
 * Street-map features around a point, in the same meters-east/north frame as
 * the routes, from OpenFreeMap's vector tiles (OpenStreetMap data, free for
 * commercial use with attribution). Lines and polygons are flat arrays of
 * x, y pairs.
 */
export interface MapFeatures {
  water: Float32Array[][];
  parks: Float32Array[][];
  rivers: Float32Array[];
  majorRoads: Float32Array[];
  minorRoads: Float32Array[];
  paths: Float32Array[];
}

export const MAP_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);
const MINOR = new Set(['tertiary', 'minor', 'service', 'residential', 'unclassified', 'living_street', 'busway']);
const PATHS = new Set(['path', 'track', 'pedestrian', 'footway', 'cycleway', 'steps']);
/** Most tiles fetched for one picture; a larger area uses a coarser zoom. */
const MAX_TILES = 144;

export const emptyFeatures = (): MapFeatures => ({ water: [], parks: [], rivers: [], majorRoads: [], minorRoads: [], paths: [] });

// ── Tile math (Web Mercator, as map tiles use) ────────────────────────────────

const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const xToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const yToLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/** The tiles covering an area given in meters around a point, at the finest zoom that stays under MAX_TILES. */
export function tilesFor(anchor: GeoPoint, area: Bounds): { z: number; tiles: { x: number; y: number }[] } {
  const mLon = metersPerDegLon(anchor.lat);
  const west = anchor.lon + area.minX / mLon;
  const east = anchor.lon + area.maxX / mLon;
  const south = anchor.lat + area.minY / METERS_PER_DEG_LAT;
  const north = anchor.lat + area.maxY / METERS_PER_DEG_LAT;
  for (let z = 14; z >= 8; z--) {
    const x0 = Math.floor(lonToX(west, z));
    const x1 = Math.floor(lonToX(east, z));
    const y0 = Math.floor(latToY(north, z));
    const y1 = Math.floor(latToY(south, z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES || z === 8) {
      const tiles = [];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ x, y });
      return { z, tiles };
    }
  }
  throw new Error('unreachable');
}

/** Decodes one tile's features into meters around the anchor. */
export function decodeTile(data: ArrayBuffer, tx: number, ty: number, z: number, anchor: GeoPoint, into: MapFeatures): void {
  const tile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const mLon = metersPerDegLon(anchor.lat);
  const toLocal = (ring: { x: number; y: number }[], extent: number): Float32Array => {
    const out = new Float32Array(ring.length * 2);
    ring.forEach((p, i) => {
      out[i * 2] = (xToLon(tx + p.x / extent, z) - anchor.lon) * mLon;
      out[i * 2 + 1] = (yToLat(ty + p.y / extent, z) - anchor.lat) * METERS_PER_DEG_LAT;
    });
    return out;
  };
  const each = (name: string, fn: (props: Record<string, unknown>, geometry: Float32Array[], type: number) => void) => {
    const layer = tile.layers[name];
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      fn(f.properties, f.loadGeometry().map((ring) => toLocal(ring, layer.extent)), f.type);
    }
  };
  each('water', (_, rings, type) => type === 3 && into.water.push(rings));
  each('park', (_, rings, type) => type === 3 && into.parks.push(rings));
  each('landcover', (props, rings, type) => type === 3 && props.class === 'wood' && into.parks.push(rings));
  each('waterway', (_, lines, type) => type === 2 && into.rivers.push(...lines));
  each('transportation', (props, lines, type) => {
    if (type !== 2) return;
    const cls = String(props.class);
    if (MAJOR.has(cls)) into.majorRoads.push(...lines);
    else if (MINOR.has(cls)) into.minorRoads.push(...lines);
    else if (PATHS.has(cls)) into.paths.push(...lines);
  });
}

/**
 * Loads the map around a point. Decoded tiles are cached by tile and anchor,
 * so redrawing (new colors, a new legend) doesn't fetch again.
 */
export class MapLoader {
  private template: Promise<string> | null = null;
  private cache = new Map<string, Promise<MapFeatures>>();

  // Wrapped: browsers reject fetch called with anything but the global as `this`.
  constructor(private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init)) {}

  private tileTemplate(): Promise<string> {
    // The tile URL carries a weekly data version, published in the TileJSON.
    this.template ??= this.fetchFn(TILEJSON)
      .then((r) => r.json() as Promise<{ tiles: string[] }>)
      .then((j) => j.tiles[0]!);
    return this.template;
  }

  async load(anchor: GeoPoint, area: Bounds): Promise<MapFeatures> {
    const { z, tiles } = tilesFor(anchor, area);
    const template = await this.tileTemplate();
    const parts = await Promise.all(
      tiles.map(({ x, y }) => {
        const key = `${anchor.lat},${anchor.lon}/${z}/${x}/${y}`;
        let part = this.cache.get(key);
        if (!part) {
          part = this.fetchFn(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
            .then(async (r) => {
              const features = emptyFeatures();
              if (r.ok) decodeTile(await r.arrayBuffer(), x, y, z, anchor, features);
              return features;
            });
          part.catch(() => this.cache.delete(key));
          this.cache.set(key, part);
        }
        return part;
      }),
    );
    const all = emptyFeatures();
    for (const p of parts) for (const k of Object.keys(all) as (keyof MapFeatures)[]) (all[k] as unknown[]).push(...(p[k] as unknown[]));
    return all;
  }
}
