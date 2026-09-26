import { wcagLuminance } from 'culori';

export type Units = 'km' | 'mi';

/**
 * 'bar' is a classic scale bar; 'rings' draws distance circles around the
 * anchor. When long routes are squashed, distance from the anchor is no longer
 * linear, so a bar would be wrong and rings are drawn instead.
 */
export type ScaleStyle = 'bar' | 'rings' | 'off';

const METERS_PER: Record<Units, number> = { km: 1000, mi: 1609.344 };

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

/** The automatic scale color: light ink on dark backgrounds, dark ink on light ones. */
export function inkFor(background: string): string {
  return wcagLuminance(background) > 0.4 ? '#000000' : '#ffffff';
}

export function renderScale(
  frame: ScaleFrame,
  style: ScaleStyle,
  units: Units,
  background: string,
  color: string | null,
): string {
  if (style === 'off') return '';
  const useRings = style === 'rings' || frame.radialExponent !== 1;
  const ink = color ?? inkFor(background);
  const fontSize = Math.round(Math.min(frame.width, frame.height) / 75);
  // A halo in the background color keeps labels readable over dense routes.
  const text =
    `font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="${fontSize}" ` +
    `fill="${ink}" stroke="${background}" stroke-width="${fontSize / 3}" stroke-opacity="0.9" stroke-linejoin="round" paint-order="stroke"`;
  // Automatic rings stay faint so they don't compete with the routes; a chosen
  // color is meant to be seen, so it's drawn stronger.
  const ringOpacity = color ? 0.6 : 0.35;
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
  const minGapPx = fontSize * 3;
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
  const labels = chosen
    .map(
      ({ amount, px }) =>
        `<text x="${r(f.anchorX + 4)}" y="${r(f.anchorY - px - 4)}" ${text}>${formatDistance(amount, units)}</text>`,
    )
    .join('');
  return `<g class="scale">
<g stroke="${ink}" stroke-opacity="${opacity}" stroke-width="1" stroke-dasharray="3 5" fill="none">${circles}</g>
<g>${labels}</g>
</g>`;
}

const r = (n: number) => Math.round(n * 10) / 10;
