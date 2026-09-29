import type { Filters, LayoutOptions, OtherStarts, Scene } from '../core/pipeline';
import { visibleMeters, type StyleOptions } from '../render/svg';
import { NEAR_RADIUS_M, type GeoPoint } from './anchor';

/**
 * The scene for drawing over a map around a point. When routes starting
 * elsewhere are drawn where they really went, the scene is built twice: once
 * to find what the picture shows, then keeping only routes that cross it.
 */
export function mapScene(
  /** buildScene over the workouts, or a caching wrapper around it. */
  build: (filters: Filters, layout: LayoutOptions) => Scene,
  filters: Filters,
  layout: LayoutOptions,
  style: StyleOptions,
  at: GeoPoint,
  others: OtherStarts,
): Scene {
  const geoAnchor = { lat: at.lat, lon: at.lon, radiusM: NEAR_RADIUS_M, others };
  const scene = build(filters, { ...layout, geoAnchor });
  if (others !== 'true') return scene;
  return build(filters, { ...layout, geoAnchor: { ...geoAnchor, view: visibleMeters(scene, style) } });
}
