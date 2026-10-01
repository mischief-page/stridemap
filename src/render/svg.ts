import { blend } from './color';
import type { Scene } from '../core/pipeline';
import type { MapFeatures } from '../core/types';
import { renderMark } from './brand';
import { round1 as r } from './format';
import { escapeXml, renderLegend } from './legend';
import { artFrame, legendFacts } from './frame';
import { renderScale, scaleUsesRings } from './scale';
import { pencilFilter, pencilPath } from './pencil';
import { catmullRomControls, smoothPolyline } from './smooth';
import { simplify } from './simplify';
import { MAP_ATTRIBUTION, renderMap } from './map';
import { renderDistance } from './distance';
import { LEGEND_FONTS, type StyleOptions } from './style';


const GRAIN_FILTER_ID = 'stridemap-pencil-grain';
const FADE_ID = 'stridemap-band-fade';
/** How much of the art's height the fade into the text band takes. */
const FADE_SHARE = 0.05;

/** A mask that fades the art out toward the text band's side. */
function bandFade(width: number, top: number, height: number, side: 'top' | 'bottom'): { defs: string } {
  const f = FADE_SHARE;
  const stops = side === 'bottom'
    ? `<stop offset="0" stop-color="#fff"/><stop offset="${1 - f}" stop-color="#fff"/><stop offset="1" stop-color="#000"/>`
    : `<stop offset="0" stop-color="#000"/><stop offset="${f}" stop-color="#fff"/><stop offset="1" stop-color="#fff"/>`;
  return {
    defs: `<defs><linearGradient id="${FADE_ID}-g" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${r(top)}" y2="${r(top + height)}">${stops}</linearGradient><mask id="${FADE_ID}" maskUnits="userSpaceOnUse" x="0" y="${r(top)}" width="${width}" height="${r(height)}"><rect x="0" y="${r(top)}" width="${width}" height="${r(height)}" fill="url(#${FADE_ID}-g)"/></mask></defs>`,
  };
}

/**
 * Number of color steps. Segments are grouped by step into one <path> each,
 * which keeps the SVG small even with thousands of routes.
 */
const BINS = 32;

/** Route detail finer than this many pixels is simplified away. */
const SIMPLIFY_PX = 1;
/** Curves through the kept points follow a smoothed route closely, so fewer points are needed. */
const SIMPLIFY_CURVED_PX = 2;

export function renderSvg(scene: Scene, style: StyleOptions, mapFeatures?: MapFeatures | null, cache: RouteShapeCache = {}): string {
  const { width: W, height: H, padding: P } = style;
  const frame = { width: W, height: H, padding: P, background: style.background, colors: [style.colorA, style.colorB] as [string, string] };
  const facts = legendFacts(scene, style);
  const { artTop, artH, scale, ox, oy } = artFrame(scene, style);
  const map = style.map && mapFeatures ? { style: style.map, features: mapFeatures } : null;

  const body = drawRoutes(scene, style, scale, ox, oy, cache);
  // With a text band, routes fade out just before it instead of stopping at a hard edge.
  const fade = artH < H ? bandFade(W, artTop, artH, artTop > 0 ? 'top' : 'bottom') : null;
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
      fontFamily: style.legend.show ? LEGEND_FONTS[style.legend.font] : undefined,
      ringLabelAngle: scaleUsesRings(style.scale, scene.radialExponent) ? quietestDirection(scene, scale, Math.min(W, H) / 75) : 0,
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
${fade ? fade.defs : ''}
${style.distance ? renderDistance(scene.timeline, style.distance, { top: artTop, width: W, height: artH, colorA: style.colorA, colorB: style.colorB, background: style.background, padding: P, units: style.units, locale: style.legend.locale }) : ''}
${map ? renderMap(map.features, map.style, { scale, ox, oy, top: artTop, width: W, height: artH, background: style.background }) : ''}
<g fill="none" stroke-width="${style.strokeWidth}" stroke-opacity="${style.opacity}" stroke-linecap="round" stroke-linejoin="round" style="isolation:isolate"${grain ? ` filter="url(#${GRAIN_FILTER_ID})"` : ''}${fade ? ` mask="url(#${FADE_ID})"` : ''}>
${body}
</g>
${rings ? scaleSvg : ''}
</svg>
${rings ? '' : scaleSvg}
${renderLegend(frame, style.legend, facts)}
${renderMark(frame, markSide, style.mark, map ? MAP_ATTRIBUTION : null)}
</svg>
</svg>`;
}

/**
 * Of sixteen compass directions from the anchor, the one with the fewest
 * routes along it, for placing ring labels where they won't be drawn over.
 * A sample of route points is counted per direction when it lies within a
 * label's height of that direction's line.
 */
function quietestDirection(scene: Scene, scale: number, labelPx: number): number {
  const N = 16;
  const dirs = Array.from({ length: N }, (_, k) => [Math.sin((k * 2 * Math.PI) / N), Math.cos((k * 2 * Math.PI) / N)] as const);
  const counts = new Float64Array(N);
  for (const t of scene.tracks) {
    for (let i = 0; i < t.x.length; i += 4) {
      const x = t.x[i]! * scale;
      const y = t.y[i]! * scale; // north is +y here
      for (let k = 0; k < N; k++) {
        const [dx, dy] = dirs[k]!;
        const along = x * dx + y * dy;
        if (along > labelPx && Math.abs(x * dy - y * dx) < labelPx) counts[k]! += 1;
      }
    }
  }
  // Ties go to directions above the anchor, where labels read most naturally.
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => Math.abs(Math.sin((a * Math.PI) / N)) - Math.abs(Math.sin((b * Math.PI) / N)));
  let best = order[0]!;
  for (const k of order) if (counts[k]! < counts[best]! * 0.9) best = k;
  return (best * 2 * Math.PI) / N;
}

/**
 * The route shapes last drawn, one path per color step, kept by the caller
 * (the poster engine) between renders. They depend only on the scene, canvas
 * and line-shape settings, so color, opacity, blend and overlay changes reuse
 * them. That matters most for the pencil style, where generating the
 * hand-drawn strokes is the slow part.
 */
export interface RouteShapeCache {
  last?: { scene: Scene; key: string; paths: string[] };
}

function routeShapes(scene: Scene, style: StyleOptions, scale: number, ox: number, oy: number, cache: RouteShapeCache): string[] {
  // Where the routes sit (scale and anchor) is part of the key: the text band
  // moves them whenever the legend's height changes.
  const key = JSON.stringify([scale, ox, oy, style.smoothing, style.pencil?.roughness]);
  if (cache.last?.scene === scene && cache.last.key === key) return cache.last.paths;

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
  cache.last = { scene, key, paths };
  return paths;
}

function drawRoutes(scene: Scene, style: StyleOptions, scale: number, ox: number, oy: number, cache: RouteShapeCache): string {
  const paths = routeShapes(scene, style, scale, ox, oy, cache);
  const color = blend(style.colorA, style.colorB);
  const blendStyle = style.blend === 'normal' ? '' : ` style="mix-blend-mode:${style.blend}"`;
  // Hotter bins are drawn last so they sit on top.
  return paths
    .map((d, i) => (d ? `<path stroke="${color(i / (BINS - 1))}"${blendStyle} d="${d}"/>` : ''))
    .join('\n');
}
