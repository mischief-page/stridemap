import { inkFor } from './ink';
import { LEGEND_FONTS, METERS_PER, type ScaleStyle, type Units } from './style';
import { round1 as r } from './format';

/** Frame the scale is drawn in: pixels per meter and the anchor's screen position. */
export interface ScaleFrame {
  width: number;
  height: number;
  padding: number;
  pxPerMeter: number;
  anchorX: number;
  anchorY: number;
  radialExponent: number;
  /** Which bottom corner the scale bar sits in. */
  barSide: 'left' | 'right';
  /** Label font, to match the poster's text; system sans by default. */
  fontFamily?: string;
  /**
   * Compass direction (radians clockwise from north) along which ring labels
   * sit; pick one where few routes go, so the labels stay readable.
   */
  ringLabelAngle?: number;
}

/** The 1, 2 or 5 × 10ⁿ closest to `value` (compared as ratios). */
export function niceRound(value: number): number {
  const pow = 10 ** Math.floor(Math.log10(value));
  const options = [1, 2, 5, 10].map((m) => m * pow);
  return options.reduce((best, o) =>
    Math.abs(Math.log(o / value)) < Math.abs(Math.log(best / value)) ? o : best,
  );
}

export function formatDistance(amount: number, units: Units): string {
  if (units === 'km' && amount < 1) return `${Math.round(amount * 1000)} m`;
  return `${+amount.toPrecision(3)} ${units}`;
}

/** Squashed routes need rings: a straight bar can't be accurate when distance isn't linear. */
export function scaleUsesRings(style: ScaleStyle, radialExponent: number): boolean {
  return style === 'rings' || (style !== 'off' && radialExponent !== 1);
}

export function renderScale(
  frame: ScaleFrame,
  style: ScaleStyle,
  units: Units,
  background: string,
  color: string | null,
): string {
  if (style === 'off') return '';
  const useRings = scaleUsesRings(style, frame.radialExponent);
  const ink = color ?? inkFor(background);
  const fontSize = Math.round(Math.min(frame.width, frame.height) / 75);
  // A halo in the background color keeps labels readable over dense routes.
  const text =
    `font-family="${frame.fontFamily ?? LEGEND_FONTS.sans}" font-size="${fontSize}" ` +
    `fill="${ink}" stroke="${background}" stroke-width="${fontSize / 3}" stroke-opacity="0.9" stroke-linejoin="round" paint-order="stroke"`;
  // Automatic rings stay faint so they don't compete with the routes; a chosen
  // color is meant to be seen, so it's drawn stronger.
  const ringOpacity = color ? 0.7 : 0.45;
  return useRings
    ? rings(frame, units, ink, text, fontSize, ringOpacity)
    : bar(frame, units, ink, text, fontSize);
}

function bar(f: ScaleFrame, units: Units, ink: string, text: string, fontSize: number): string {
  // Aim for a bar about a fifth of the drawing wide, rounded to a tidy distance.
  const targetPx = (f.width - 2 * f.padding) / 5;
  const amount = niceRound(targetPx / f.pxPerMeter / METERS_PER[units]);
  const px = amount * METERS_PER[units] * f.pxPerMeter;
  const x = f.barSide === 'left' ? f.padding : r(f.width - f.padding - px);
  const y = f.height - f.padding / 2;
  const tick = fontSize / 2;
  return `<g class="scale">
<path d="M${x} ${y - tick}V${y}H${r(x + px)}V${y - tick}" stroke="${ink}" stroke-opacity="0.8" stroke-width="1.5" fill="none"/>
<text x="${x}" y="${r(y - tick - 4)}" ${text}>${formatDistance(amount, units)}</text>
</g>`;
}

function rings(
  f: ScaleFrame,
  units: Units,
  ink: string,
  text: string,
  fontSize: number,
  opacity: number,
): string {
  const unitM = METERS_PER[units];
  const radiusPx = (meters: number) => meters ** f.radialExponent * f.pxPerMeter;
  const maxPx = Math.max(f.width, f.height) * 0.75;
  // Room for one label between rings, whichever way the labels run.
  const minGapPx = fontSize * 4.5;
  // Rings closer in than this would sit in the densest part of the web.
  const minRadiusPx = Math.min(f.width, f.height) * 0.08;

  const candidates: number[] = [];
  for (let p = -1; p <= 4; p++) for (const m of [1, 2, 5]) candidates.push(m * 10 ** p);

  const chosen: { amount: number; px: number }[] = [];
  for (const amount of candidates) {
    const px = radiusPx(amount * unitM);
    const last = chosen[chosen.length - 1];
    if (px < minRadiusPx || px > maxPx) continue;
    if (last && px - last.px < minGapPx) continue;
    chosen.push({ amount, px });
    if (chosen.length === 5) break;
  }

  const circles = chosen
    .map(({ px }) => `<circle cx="${r(f.anchorX)}" cy="${r(f.anchorY)}" r="${r(px)}"/>`)
    .join('');
  // Labels sit just outside each ring, along the quietest direction.
  const angle = f.ringLabelAngle ?? 0;
  const [dx, dy] = [Math.sin(angle), -Math.cos(angle)];
  const anchor = dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle';
  const labels = chosen
    .map(({ amount, px }) => {
      const at = px + fontSize * 0.6;
      // Text hangs below its baseline point when the labels run downward.
      const y = f.anchorY + dy * at + (dy > 0.3 ? fontSize * 0.8 : 0);
      return `<text x="${r(f.anchorX + dx * at)}" y="${r(y)}" text-anchor="${anchor}" ${text}>${formatDistance(amount, units)}</text>`;
    })
    .join('');
  const unit = Math.min(f.width, f.height) / 1200;
  return `<g class="scale">
<g stroke="${ink}" stroke-opacity="${opacity}" stroke-width="${r(Math.max(1, 1.3 * unit))}" stroke-dasharray="${r(4 * unit)} ${r(5 * unit)}" fill="none">${circles}</g>
<g>${labels}</g>
</g>`;
}

