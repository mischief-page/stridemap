import { formatHex, interpolate } from 'culori';
import type { Scene } from '../core/pipeline';
import { renderMark } from './brand';
import { canvasSize } from './canvas';
import { round1 as r } from './format';
import { DEFAULT_LEGEND, escapeXml, legendHeight, renderLegend, type LegendFacts, type LegendOptions } from './legend';
import { renderScale, scaleUsesRings, type ScaleStyle, type Units } from './scale';
import { pencilFilter, pencilPath, type PencilOptions } from './pencil';
import { catmullRomControls, smoothPolyline } from './smooth';

export type Blend = 'normal' | 'screen' | 'multiply';

export interface StyleOptions {
  width: number;
  height: number;
  /** Empty margin around the fitted routes, in pixels. */
  padding: number;
  /** Cool end of the scale: slow pace, or streets visited once. */
  colorA: string;
  /** Hot end of the scale: fast pace, or the most-visited streets. */
  colorB: string;
  background: string;
  strokeWidth: number;
  opacity: number;
  /**
   * Blur radius in image pixels. 0 draws the GPS track as recorded; higher
   * values round corners into curves and turn routes into flowing strokes.
   */
  smoothing: number;
  /** Hand-drawn pencil look; null draws clean lines. */
  pencil: PencilOptions | null;
  /** 'screen' makes overlaps glow on dark backgrounds; 'multiply' darkens on light ones. */
  blend: Blend;
  /** Distance scale so viewers can judge how long the routes are. */
  scale: ScaleStyle;
  units: Units;
  /** Color of the scale bar or rings and their labels; null picks white or black to suit the background. */
  scaleColor: string | null;
  legend: LegendOptions;
  /** The small "made with" mark in the bottom margin. */
  mark: boolean;
  /**
   * Give the legend its own band at the top or bottom of the poster, so the
   * routes never run underneath the text.
   */
  textBand: boolean;
}

export const DEFAULT_STYLE: StyleOptions = {
  ...canvasSize('3:2', 'landscape'),
  padding: 60,
  colorA: '#1d4ed8',
  colorB: '#fbbf24',
  background: '#0b0f19',
  strokeWidth: 1.2,
  opacity: 0.7,
  smoothing: 0,
  pencil: null,
  blend: 'screen',
  scale: 'bar',
  units: 'km',
  scaleColor: null,
  legend: DEFAULT_LEGEND,
  textBand: false,
  mark: true,
};

const GRAIN_FILTER_ID = 'stridemap-pencil-grain';

/**
 * Number of color steps. Segments are grouped by step into one <path> each,
 * which keeps the SVG small even with thousands of routes.
 */
const BINS = 32;

/** Route detail finer than this many pixels is simplified away. */
const SIMPLIFY_PX = 1;
/** Curves through the kept points follow a smoothed route closely, so fewer points are needed. */
const SIMPLIFY_CURVED_PX = 2;

export function renderSvg(scene: Scene, style: StyleOptions): string {
  const { width: W, height: H, padding: P } = style;
  const { bounds: b } = scene;
  const frame = { width: W, height: H, padding: P, background: style.background };
  const facts: LegendFacts = {
    dateRange: scene.dateRange,
    count: scene.workoutCount,
    distanceM: scene.totalDistanceM,
    activityTypes: scene.activityTypes,
    units: style.units,
  };

  // The art fills the canvas, or everything but the legend's band.
  const textH = style.textBand ? legendHeight(frame, style.legend, facts) : 0;
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

  const body = drawRoutes(scene, style, scale, ox, oy);
  // Keep the scale bar out of the legend's way, and the mark out of the bar's.
  const barSide = style.legend.show && style.legend.position === 'bottom-left' ? 'right' : 'left';
  const barShown = style.scale !== 'off' && !scaleUsesRings(style.scale, scene.radialExponent);
  const markSide = barShown && barSide === 'right' ? 'left' : 'right';
  const grain = style.pencil !== null && style.pencil.grain > 0;
  const scaleSvg = renderScale(
    {
      width: W,
      height: H,
      padding: P,
      pxPerMeter: scale,
      anchorX: ox,
      anchorY: oy,
      radialExponent: scene.radialExponent,
      // Keep the bar out of the legend's way.
      barSide,
    },
    style.scale,
    style.units,
    style.background,
    style.scaleColor,
  );
  // Rings belong to the art and are clipped with it; a bar sits in the margin.
  const rings = scaleUsesRings(style.scale, scene.radialExponent);

  // The outer viewport can be wider than the image when it's embedded in a box
  // of another shape, so the inner <svg> clips everything to the canvas. The
  // art has its own <svg> too, clipping routes that run off its edge (or into
  // the text band) while keeping canvas coordinates.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<title>${escapeXml(style.legend.show && style.legend.title.trim() ? style.legend.title.trim() : `stridemap: ${scene.workoutCount} walks and runs`)}</title>
<svg width="${W}" height="${H}">
<rect width="100%" height="100%" fill="${style.background}"/>
${grain ? `<defs>${pencilFilter(GRAIN_FILTER_ID, W, H, style.pencil!.grain)}</defs>` : ''}
<svg class="art" y="${r(artTop)}" width="${W}" height="${r(artH)}" viewBox="0 ${r(artTop)} ${W} ${r(artH)}">
<g fill="none" stroke-width="${style.strokeWidth}" stroke-opacity="${style.opacity}" stroke-linecap="round" stroke-linejoin="round" style="isolation:isolate"${grain ? ` filter="url(#${GRAIN_FILTER_ID})"` : ''}>
${body}
</g>
${rings ? scaleSvg : ''}
</svg>
${rings ? '' : scaleSvg}
${renderLegend(frame, style.legend, facts)}
${style.mark ? renderMark(frame, markSide) : ''}
</svg>
</svg>`;
}

/**
 * The route shapes last drawn, one path per color step. They depend only on
 * the scene, canvas and line-shape settings, so color, opacity, blend and
 * overlay changes reuse them. That matters most for the pencil style, where
 * generating the hand-drawn strokes is the slow part.
 */
let shapesCache: { scene: Scene; key: string; paths: string[] } | null = null;

function routeShapes(scene: Scene, style: StyleOptions, scale: number, ox: number, oy: number): string[] {
  // Where the routes sit (scale and anchor) is part of the key: the text band
  // moves them whenever the legend's height changes.
  const key = JSON.stringify([scale, ox, oy, style.smoothing, style.pencil?.roughness]);
  if (shapesCache?.scene === scene && shapesCache.key === key) return shapesCache.paths;

  const { domain } = scene;
  const binOf = (v: number) => {
    // A point with no value (e.g. a workout whose pace can't be worked out
    // because the watch recorded no movement) gets the cool end of the scale.
    if (!Number.isFinite(v)) return 0;
    const t = (v - domain[0]) / (domain[1] - domain[0]);
    return Math.round(Math.min(1, Math.max(0, t)) * (BINS - 1));
  };

  const segments: string[][] = Array.from({ length: BINS }, () => []);

  const curved = style.smoothing > 0;
  for (const t of scene.tracks) {
    const n = t.x.length;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = ox + t.x[i]! * scale;
      py[i] = oy - t.y[i]! * scale; // screen y points down
    }
    const { x: sx, y: sy, value } = smoothPolyline({ x: px, y: py, value: t.value }, style.smoothing);
    const keep = simplify(sx, sy, curved ? SIMPLIFY_CURVED_PX : SIMPLIFY_PX);
    let currentBin = -1;
    for (let k = 1; k < keep.length; k++) {
      const a = keep[k - 1]!;
      const b = keep[k]!;
      // Color the simplified segment by the average value of the points it replaces.
      let sum = 0;
      for (let i = a + 1; i <= b; i++) sum += value[i]!;
      const bin = binOf(sum / (b - a));
      // Smoothed routes are drawn as curves through the kept points, so they
      // stay smooth when zoomed in; the curve's tangents come from the whole
      // route, so color changes don't put kinks in it.
      let seg = `L${r(sx[b]!)} ${r(sy[b]!)}`;
      if (curved) {
        const [c1x, c1y, c2x, c2y] = catmullRomControls(sx, sy, keep, k);
        seg = `C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(sx[b]!)} ${r(sy[b]!)}`;
      }
      if (bin === currentBin) {
        segments[bin]!.push(seg);
      } else {
        segments[bin]!.push(`M${r(sx[a]!)} ${r(sy[a]!)}${seg}`);
        currentBin = bin;
      }
    }
  }

  const paths = segments.map((d, i) => {
    if (!d.length) return '';
    // Each color step gets its own fixed seed, so the wobble is stable between redraws.
    return style.pencil ? pencilPath(d.join(''), style.pencil.roughness, i + 1) : d.join('');
  });
  shapesCache = { scene, key, paths };
  return paths;
}

function drawRoutes(scene: Scene, style: StyleOptions, scale: number, ox: number, oy: number): string {
  const paths = routeShapes(scene, style, scale, ox, oy);
  const color = interpolate([style.colorA, style.colorB], 'oklch');
  const blendStyle = style.blend === 'normal' ? '' : ` style="mix-blend-mode:${style.blend}"`;
  // Hotter bins are drawn last so they sit on top.
  return paths
    .map((d, i) => (d ? `<path stroke="${formatHex(color(i / (BINS - 1)))}"${blendStyle} d="${d}"/>` : ''))
    .join('\n');
}

/**
 * Ramer–Douglas–Peucker line simplification. Returns the indices of the points
 * to keep so that the line never moves more than `tolerance` pixels.
 */
function simplify(x: Float64Array, y: Float64Array, tolerance: number): number[] {
  const n = x.length;
  if (n < 3) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = tol2;
    for (let i = a + 1; i < b; i++) {
      let px = x[i]! - x[a]!;
      let py = y[i]! - y[a]!;
      if (len2 > 0) {
        const f = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        px -= f * dx;
        py -= f * dy;
      }
      const d = px * px + py * py;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
