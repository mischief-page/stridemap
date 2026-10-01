import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { METERS_PER_DEG_LAT, metersPerDegLon } from '../core/track';
import type { Bounds, MapFeatures } from '../core/types';
import type { GeoPoint } from './anchor';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);
const MINOR = new Set(['tertiary', 'minor', 'service', 'residential', 'unclassified', 'living_street', 'busway']);
const PATHS = new Set(['path', 'track', 'pedestrian', 'footway', 'cycleway', 'steps']);
/** Most tiles fetched for one picture; a larger area uses a coarser zoom. */
const MAX_TILES = 144;

export type { MapFeatures };

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

/**
 * One decoded tile, in the tile's own units (0 to 1 across the tile, as
 * fractions of the tile at its zoom), so it can be placed around any anchor.
 */
interface DecodedTile {
  z: number;
  x: number;
  y: number;
  features: MapFeatures;
}

/** Decodes one tile, keeping coordinates as fractions of the tile. */
function decode(data: ArrayBuffer, x: number, y: number, z: number): DecodedTile {
  const tile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const into = emptyFeatures();
  const toUnits = (ring: { x: number; y: number }[], extent: number): Float32Array => {
    const out = new Float32Array(ring.length * 2);
    ring.forEach((p, i) => {
      out[i * 2] = p.x / extent;
      out[i * 2 + 1] = p.y / extent;
    });
    return out;
  };
  const each = (name: string, fn: (props: Record<string, unknown>, geometry: Float32Array[], type: number) => void) => {
    const layer = tile.layers[name];
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      fn(f.properties, f.loadGeometry().map((ring) => toUnits(ring, layer.extent)), f.type);
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
  return { z, x, y, features: into };
}

/** A decoded tile's features in meters around the anchor, added to `into`. */
function place(tile: DecodedTile, anchor: GeoPoint, into: MapFeatures): void {
  const mLon = metersPerDegLon(anchor.lat);
  const { x: tx, y: ty, z } = tile;
  const toMeters = (units: Float32Array): Float32Array => {
    const out = new Float32Array(units.length);
    for (let i = 0; i < units.length; i += 2) {
      out[i] = (xToLon(tx + units[i]!, z) - anchor.lon) * mLon;
      out[i + 1] = (yToLat(ty + units[i + 1]!, z) - anchor.lat) * METERS_PER_DEG_LAT;
    }
    return out;
  };
  const f = tile.features;
  into.water.push(...f.water.map((rings) => rings.map(toMeters)));
  into.parks.push(...f.parks.map((rings) => rings.map(toMeters)));
  into.rivers.push(...f.rivers.map(toMeters));
  into.majorRoads.push(...f.majorRoads.map(toMeters));
  into.minorRoads.push(...f.minorRoads.map(toMeters));
  into.paths.push(...f.paths.map(toMeters));
}

/** Decodes one tile's features into meters around the anchor. */
export function decodeTile(data: ArrayBuffer, tx: number, ty: number, z: number, anchor: GeoPoint, into: MapFeatures): void {
  place(decode(data, tx, ty, z), anchor, into);
}

/** Decoded tiles kept for reuse; enough for a couple of map views. */
const MAX_CACHED_TILES = 300;

/**
 * Loads the map around a point. Decoded tiles are cached by tile (whatever the
 * anchor), up to MAX_CACHED_TILES, and the last result is kept, so redrawing
 * (new colors, a new legend) neither fetches nor reprojects.
 *
 * Failures aren't remembered: a failed TileJSON request is retried next time,
 * and a tile that fails to load (rate limit, server error) makes this load
 * fail rather than leaving a blank square in the cache. Tiles the server has
 * no data for (404, 204) are empty, which is correct.
 */
export class MapLoader {
  private template: Promise<string> | null = null;
  private tiles = new Map<string, Promise<DecodedTile>>();
  private last: { key: string; features: MapFeatures } | null = null;

  // Wrapped: browsers reject fetch called with anything but the global as `this`.
  constructor(private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init)) {}

  private tileTemplate(): Promise<string> {
    // The tile URL carries a weekly data version, published in the TileJSON.
    this.template ??= this.fetchFn(TILEJSON)
      .then((r) => {
        if (!r.ok) throw new Error(`map service unavailable (${r.status})`);
        return r.json() as Promise<{ tiles: string[] }>;
      })
      .then((j) => j.tiles[0]!);
    this.template.catch(() => (this.template = null));
    return this.template;
  }

  private tile(template: string, z: number, x: number, y: number): Promise<DecodedTile> {
    const key = `${z}/${x}/${y}`;
    let tile = this.tiles.get(key);
    if (tile) {
      // Most recently used goes to the end, so the oldest are dropped first.
      this.tiles.delete(key);
    } else {
      tile = this.fetchFn(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))).then(async (r) => {
        if (r.status === 404 || r.status === 204) return { z, x, y, features: emptyFeatures() };
        if (!r.ok) throw new Error(`map tile unavailable (${r.status})`);
        return decode(await r.arrayBuffer(), x, y, z);
      });
      tile.catch(() => this.tiles.delete(key));
    }
    this.tiles.set(key, tile);
    while (this.tiles.size > MAX_CACHED_TILES) this.tiles.delete(this.tiles.keys().next().value!);
    return tile;
  }

  async load(anchor: GeoPoint, area: Bounds): Promise<MapFeatures> {
    const { z, tiles } = tilesFor(anchor, area);
    const key = JSON.stringify([anchor.lat, anchor.lon, z, tiles]);
    if (this.last?.key === key) return this.last.features;
    const template = await this.tileTemplate();
    const decoded = await Promise.all(tiles.map(({ x, y }) => this.tile(template, z, x, y)));
    const features = emptyFeatures();
    for (const tile of decoded) place(tile, anchor, features);
    this.last = { key, features };
    return features;
  }
}
