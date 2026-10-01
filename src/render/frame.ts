import type { Scene } from '../core/pipeline';
import type { Bounds } from '../core/types';
import { legendHeight, type LegendFacts } from './legend';
import type { StyleOptions } from './style';

/** Where the art sits on the canvas and how meters map onto it. */
export interface ArtFrame {
  artTop: number;
  artH: number;
  /** Pixels per meter. */
  scale: number;
  /** Screen position of the anchor (0, 0). */
  ox: number;
  oy: number;
}

export function legendFacts(scene: Scene, style: StyleOptions): LegendFacts {
  return {
    dateRange: scene.dateRange,
    count: scene.workoutCount,
    distanceM: scene.totalDistanceM,
    activityTypes: scene.activityTypes,
    units: style.units,
  };
}

export function artFrame(scene: Scene, style: StyleOptions): ArtFrame {
  const { width: W, height: H, padding: P } = style;
  const { bounds: b } = scene;
  const frame = { width: W, height: H, padding: P, background: style.background };

  // The art fills the canvas, or everything but the legend's band.
  const textH = style.textBand ? legendHeight(frame, style.legend, legendFacts(scene, style)) : 0;
  const band = textH ? textH + P * 1.5 : 0;
  const bandAtTop = style.legend.position.startsWith('top');
  const artTop = bandAtTop ? band : 0;
  const artH = H - band;

  // Uniform scale so north stays up and shapes aren't stretched, then center the box.
  const bw = Math.max(b.maxX - b.minX, 1);
  const bh = Math.max(b.maxY - b.minY, 1);
  const scale = Math.min((W - 2 * P) / bw, (artH - 2 * P) / bh);
  const ox = W / 2 - ((b.minX + b.maxX) / 2) * scale;
  const oy = artTop + artH / 2 + ((b.minY + b.maxY) / 2) * scale; // screen y points down
  return { artTop, artH, scale, ox, oy };
}

/** The part of the world the art shows, in meters around the anchor: what a map behind it has to cover. */
export function visibleMeters(scene: Scene, style: StyleOptions): Bounds {
  const { artTop, artH, scale, ox, oy } = artFrame(scene, style);
  return {
    minX: -ox / scale,
    maxX: (style.width - ox) / scale,
    minY: (oy - artTop - artH) / scale,
    maxY: (oy - artTop) / scale,
  };
}

