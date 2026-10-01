import { buildScene, type Filters, type LayoutOptions, type OtherStarts, type PreparedWorkout, type Scene, type SceneCaches } from '../core/pipeline';
import type { MapFeatures } from '../core/types';
import { detectHome, NEAR_RADIUS_M, type GeoPoint } from '../map/anchor';
import { MapLoader } from '../map/tiles';
import { visibleMeters } from '../render/frame';
import type { StyleOptions } from '../render/style';
import { renderSvg, type RouteShapeCache } from '../render/svg';
import type { MapRequest } from './settings';

/** Everything a poster is drawn from, as toRenderRequest makes it. */
export interface PosterRequest {
  filters: Filters;
  layout: LayoutOptions;
  style: StyleOptions;
  map: MapRequest | null;
}

/** How the map went: where it's centred, how many routes are on it, or why it isn't shown. */
export type MapResult =
  | { ok: true; at: GeoPoint; detected: boolean; others: OtherStarts; near: number; elsewhere: number; elsewhereDrawn: number }
  | { ok: false; reason: 'no-point' | 'no-routes' | 'offline'; message?: string };

export interface Poster {
  svg: string;
  scene: Scene;
  map: MapResult | null;
}

/** Scenes kept for reuse: a map picture uses two, plus the plain one it falls back to. */
const SCENE_CACHE_SIZE = 3;

/**
 * Draws posters from one person's workouts. It owns everything worth keeping
 * between drawings: the prepared workouts, the detected home point, recent
 * scenes, the visit-count grid, the drawn route shapes and the map tiles. So
 * changing a color or the legend redraws without rebuilding anything, with or
 * without a map. The page's worker, the command line and the print-file
 * script all draw through this.
 */
export class PosterEngine {
  private readonly scenes = new Map<string, Scene>();
  private readonly sceneCaches: SceneCaches = {};
  private readonly shapes: RouteShapeCache = {};
  private home: ReturnType<typeof detectHome> | undefined;

  constructor(
    readonly workouts: PreparedWorkout[],
    private readonly maps: MapLoader = new MapLoader(),
    /** For tests: count or replace scene building. */
    private readonly build: typeof buildScene = buildScene,
  ) {}

  /** The scene for these filters and layout, reused while they're unchanged. */
  scene(filters: Filters, layout: LayoutOptions): Scene {
    const key = JSON.stringify([filters, layout]);
    let scene = this.scenes.get(key);
    if (scene) {
      this.scenes.delete(key); // most recently used goes last
    } else {
      scene = this.build(this.workouts, filters, layout, this.sceneCaches);
    }
    this.scenes.set(key, scene);
    while (this.scenes.size > SCENE_CACHE_SIZE) this.scenes.delete(this.scenes.keys().next().value!);
    return scene;
  }

  /** The most common start, worked out once. */
  homePoint(): GeoPoint | null {
    this.home ??= detectHome(this.workouts.map((w) => w.origin));
    return this.home;
  }

  /**
   * Draws the poster, with the map behind it when asked for. With a map the
   * routes are placed in their true position around its point; if the map
   * can't be drawn, the routes are drawn as usual and the reason is reported.
   */
  async render({ filters, layout, style, map }: PosterRequest): Promise<Poster> {
    const plain = (result: MapResult | null): Poster => {
      const scene = this.scene(filters, layout);
      return { svg: renderSvg(scene, style, null, this.shapes), scene, map: result };
    };
    if (!map) return plain(null);
    const at = map.at === 'detected' ? this.homePoint() : map.at;
    if (!at) return plain({ ok: false, reason: 'no-point' });
    const scene = this.mapScene(filters, layout, style, at, map.others);
    if (!scene.geoAnchor!.near) return plain({ ok: false, reason: 'no-routes' });
    let features: MapFeatures;
    try {
      features = await this.maps.load(at, visibleMeters(scene, style));
    } catch (err) {
      return plain({ ok: false, reason: 'offline', message: err instanceof Error ? err.message : String(err) });
    }
    const { near, elsewhere, elsewhereDrawn } = scene.geoAnchor!;
    return {
      svg: renderSvg(scene, style, features, this.shapes),
      scene,
      map: { ok: true, at: { lat: at.lat, lon: at.lon }, detected: map.at === 'detected', others: map.others, near, elsewhere, elsewhereDrawn },
    };
  }

  /**
   * The scene for drawing over a map around a point. When routes starting
   * elsewhere are drawn where they really went, the scene is built twice: once
   * to find what the picture shows, then keeping only routes that cross it.
   */
  private mapScene(filters: Filters, layout: LayoutOptions, style: StyleOptions, at: GeoPoint, others: OtherStarts): Scene {
    const geoAnchor = { lat: at.lat, lon: at.lon, radiusM: NEAR_RADIUS_M, others };
    const scene = this.scene(filters, { ...layout, geoAnchor });
    if (others !== 'true') return scene;
    return this.scene(filters, { ...layout, geoAnchor: { ...geoAnchor, view: visibleMeters(scene, style) } });
  }
}
