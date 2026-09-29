import rough from 'roughjs';
import type { OpSet } from 'roughjs/bin/core';
import { round1 } from './format';

/**
 * The "drawn" look. Rough.js redraws each route as if by hand: every segment
 * gets a slight wobble and bow, and is traced twice, a little apart, like a
 * pencil going back over a line. A noise filter (pencilFilter) then adds
 * graphite grain, which is what makes it read as pencil rather than marker.
 */

export interface PencilOptions {
  /** How far lines wander from the true route; ~0.5 is careful, ~3 is loose. */
  roughness: number;
  /** 0–1: how grainy and broken the strokes look. */
  grain: number;
}

const generator = rough.generator();

/**
 * Hand-drawn version of an SVG path. The same seed always gives the same
 * wobble, so the preview, the download and the print all match.
 */
export function pencilPath(d: string, roughness: number, seed: number): string {
  const drawable = generator.path(d, {
    roughness,
    // Bowing makes long straight segments sag slightly, as a hand would.
    bowing: 1,
    seed,
    // Keep route corners where they are; only the strokes between them wobble.
    preserveVertices: true,
  });
  return drawable.sets.map(compactPath).join('');
}

/**
 * Rough.js starts every segment with its own absolute "move", and writes full
 * coordinates, which makes files about 6× larger than needed. This drops
 * moves to where the pen already is and writes each curve as small relative
 * offsets.
 */
function compactPath(set: OpSet): string {
  const out: string[] = [];
  let x = NaN;
  let y = NaN;
  for (const { op, data } of set.ops) {
    if (op === 'move') {
      const [mx, my] = [round1(data[0]!), round1(data[1]!)];
      if (mx !== x || my !== y) out.push(`M${mx} ${my}`);
      x = mx;
      y = my;
    } else if (op === 'bcurveTo') {
      // Offsets come from rounded absolute points, so rounding never drifts.
      const p = data.map(round1);
      out.push(`c${fmt(p[0]! - x, p[1]! - y)} ${fmt(p[2]! - x, p[3]! - y)} ${fmt(p[4]! - x, p[5]! - y)}`);
      x = p[4]!;
      y = p[5]!;
    } else {
      const [lx, ly] = [round1(data[0]!), round1(data[1]!)];
      out.push(`l${fmt(lx - x, ly - y)}`);
      x = lx;
      y = ly;
    }
  }
  return out.join('');
}

function fmt(dx: number, dy: number): string {
  const s = (n: number) => String(round1(n));
  const b = s(dy);
  // SVG lets a minus sign separate numbers, saving a space.
  return `${s(dx)}${b.startsWith('-') ? '' : ' '}${b}`;
}

/**
 * Graphite grain: fractal noise knocks holes of varying strength in the
 * strokes, like pencil catching the tooth of the paper. Noise is sized in
 * image units, so the grain looks the same on screen and in a 300 DPI print.
 */
export function pencilFilter(id: string, width: number, height: number, grain: number): string {
  // Alpha = slope × noise + intercept. More grain → steeper, lower: more gaps.
  const slope = -(0.6 + 2.4 * grain);
  const intercept = 1.15 + 1.1 * grain;
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="11" result="noise"/>
<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${slope} 0 0 0 ${intercept}" result="grain"/>
<feComposite in="SourceGraphic" in2="grain" operator="in"/>
</filter>`;
}
