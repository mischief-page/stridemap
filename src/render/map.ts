import type { MapFeatures } from '../map/tiles';
import { round1 as r } from './format';
import { inkFor } from './scale';
import { simplify } from './simplify';

export interface MapStyle {
  /** Overall strength of the map, 0–1. */
  opacity: number;
  /** null picks white or black to suit the background. */
  color: string | null;
}

export const DEFAULT_MAP_STYLE: MapStyle = { opacity: 0.25, color: null };

/** Map detail finer than this many pixels is simplified away. */
const SIMPLIFY_PX = 0.75;

interface MapFrame {
  scale: number;
  ox: number;
  oy: number;
  /** The art's visible area on the canvas. */
  top: number;
  width: number;
  height: number;
  background: string;
}

/**
 * A quiet, one-color street map in the same meter frame as the routes: water
 * and parks as tints, roads as lines weighted by importance. Drawn under the
 * routes; features wholly outside the art are left out.
 */
export function renderMap(features: MapFeatures, style: MapStyle, f: MapFrame): string {
  const ink = style.color ?? inkFor(f.background);
  const unit = Math.min(f.width, f.height) / 1200; // line weights relative to the short side
  const line = (pts: Float32Array, closed: boolean): string => {
    const n = pts.length / 2;
    if (n < 2) return '';
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      x[i] = f.ox + pts[i * 2]! * f.scale;
      y[i] = f.oy - pts[i * 2 + 1]! * f.scale;
      minX = Math.min(minX, x[i]!); maxX = Math.max(maxX, x[i]!);
      minY = Math.min(minY, y[i]!); maxY = Math.max(maxY, y[i]!);
    }
    if (maxX < 0 || minX > f.width || maxY < f.top || minY > f.top + f.height) return '';
    if (maxX - minX < SIMPLIFY_PX && maxY - minY < SIMPLIFY_PX) return '';
    const keep = simplify(x, y, SIMPLIFY_PX);
    return keep.map((i, k) => `${k ? 'L' : 'M'}${r(x[i]!)} ${r(y[i]!)}`).join('') + (closed ? 'Z' : '');
  };
  const polygons = (list: Float32Array[][]) => list.map((rings) => rings.map((ring) => line(ring, true)).join('')).join('');
  const lines = (list: Float32Array[]) => list.map((l) => line(l, false)).join('');

  // Neighbouring tiles overlap a little at their edges, so polygons use the
  // default nonzero fill: overlaps fill once, and holes (wound the other way
  // in vector tiles) still stay open.
  const layers: [string, string][] = [
    [polygons(features.parks), `fill="${ink}" fill-opacity="0.12"`],
    [polygons(features.water), `fill="${ink}" fill-opacity="0.3"`],
    [lines(features.rivers), `fill="none" stroke="${ink}" stroke-opacity="0.3" stroke-width="${r(1.5 * unit)}"`],
    [lines(features.paths), `fill="none" stroke="${ink}" stroke-opacity="0.35" stroke-width="${r(0.5 * unit)}" stroke-dasharray="${r(2 * unit)} ${r(2 * unit)}"`],
    [lines(features.minorRoads), `fill="none" stroke="${ink}" stroke-opacity="0.6" stroke-width="${r(0.8 * unit)}"`],
    [lines(features.majorRoads), `fill="none" stroke="${ink}" stroke-width="${r(1.8 * unit)}"`],
  ];
  const body = layers.filter(([d]) => d).map(([d, attrs]) => `<path ${attrs} d="${d}"/>`).join('\n');
  return body ? `<g class="map" opacity="${style.opacity}" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</g>` : '';
}
