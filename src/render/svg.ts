import { formatHex, interpolate } from 'culori';
import type { Scene } from '../core/pipeline';
import { canvasSize } from './canvas';
import { DEFAULT_LEGEND, escapeXml, renderLegend, type LegendOptions } from './legend';
import { renderScale, type ScaleStyle, type Units } from './scale';

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
  /** 'screen' makes overlaps glow on dark backgrounds; 'multiply' darkens on light ones. */
  blend: Blend;
  /** Distance scale so viewers can judge how long the routes are. */
  scale: ScaleStyle;
  units: Units;
  /** Color of the scale bar or rings and their labels; null picks white or black to suit the background. */
  scaleColor: string | null;
  legend: LegendOptions;
}

export const DEFAULT_STYLE: StyleOptions = {
  ...canvasSize('3:2', 'landscape'),
  padding: 60,
  colorA: '#1d4ed8',
  colorB: '#fbbf24',
  background: '#0b0f19',
  strokeWidth: 1.2,
  opacity: 0.7,
  blend: 'screen',
  scale: 'bar',
  units: 'km',
  scaleColor: null,
  legend: DEFAULT_LEGEND,
};

/**
 * Number of color steps. Segments are grouped by step into one <path> each,
 * which keeps the SVG small even with thousands of routes.
 */
const BINS = 32;

/** Route detail finer than this many pixels is simplified away. */
const SIMPLIFY_PX = 1;

export function renderSvg(scene: Scene, style: StyleOptions): string {
  const { width: W, height: H, padding: P } = style;
  const { bounds: b, domain } = scene;

  // Uniform scale so north stays up and shapes aren't stretched, then center the box.
  const bw = Math.max(b.maxX - b.minX, 1);
  const bh = Math.max(b.maxY - b.minY, 1);
  const scale = Math.min((W - 2 * P) / bw, (H - 2 * P) / bh);
  const ox = W / 2 - ((b.minX + b.maxX) / 2) * scale;
  const oy = H / 2 + ((b.minY + b.maxY) / 2) * scale; // screen y points down

  const color = interpolate([style.colorA, style.colorB], 'oklch');
  const palette = Array.from({ length: BINS }, (_, i) => formatHex(color(i / (BINS - 1))));
  const binOf = (v: number) => {
    const t = (v - domain[0]) / (domain[1] - domain[0]);
    return Math.round(Math.min(1, Math.max(0, t)) * (BINS - 1));
  };

  const paths: string[][] = Array.from({ length: BINS }, () => []);
  const r = (n: number) => Math.round(n * 10) / 10;

  for (const t of scene.tracks) {
    const sx = Float64Array.from(t.x, (x) => ox + x * scale);
    const sy = Float64Array.from(t.y, (y) => oy - y * scale);
    const keep = simplify(sx, sy, SIMPLIFY_PX);
    let currentBin = -1;
    for (let k = 1; k < keep.length; k++) {
      const a = keep[k - 1]!;
      const b = keep[k]!;
      // Color the simplified segment by the average value of the points it replaces.
      let sum = 0;
      for (let i = a + 1; i <= b; i++) sum += t.value[i]!;
      const bin = binOf(sum / (b - a));
      if (bin === currentBin) {
        paths[bin]!.push(`L${r(sx[b]!)} ${r(sy[b]!)}`);
      } else {
        paths[bin]!.push(`M${r(sx[a]!)} ${r(sy[a]!)}L${r(sx[b]!)} ${r(sy[b]!)}`);
        currentBin = bin;
      }
    }
  }

  const blendStyle = style.blend === 'normal' ? '' : ` style="mix-blend-mode:${style.blend}"`;
  // Hotter bins are drawn last so they sit on top.
  const body = paths
    .map((d, i) => (d.length ? `<path stroke="${palette[i]}"${blendStyle} d="${d.join('')}"/>` : ''))
    .join('\n');

  // The inner <svg> clips everything to the canvas. The outer one's viewport can
  // be wider than the image when it's embedded in a box of another shape, and
  // routes that run off the edge would otherwise show in the extra space.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<title>${escapeXml(style.legend.show && style.legend.title.trim() ? style.legend.title.trim() : `stridemap: ${scene.workoutCount} walks and runs`)}</title>
<svg width="${W}" height="${H}">
<rect width="100%" height="100%" fill="${style.background}"/>
<g fill="none" stroke-width="${style.strokeWidth}" stroke-opacity="${style.opacity}" stroke-linecap="round" stroke-linejoin="round" style="isolation:isolate">
${body}
</g>
${renderScale(
  {
    width: W,
    height: H,
    padding: P,
    pxPerMeter: scale,
    anchorX: ox,
    anchorY: oy,
    radialExponent: scene.radialExponent,
    // Keep the bar out of the legend's way.
    barSide: style.legend.show && style.legend.position === 'bottom-left' ? 'right' : 'left',
  },
  style.scale,
  style.units,
  style.background,
  style.scaleColor,
)}
${renderLegend({ width: W, height: H, padding: P, background: style.background }, style.legend, scene.dateRange)}
</svg>
</svg>`;
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
