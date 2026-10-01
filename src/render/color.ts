import { formatHex, interpolate, modeLrgb, modeOklab, modeOklch, modeRgb, useMode } from 'culori/fn';

// Only the color spaces we blend through are loaded (culori's tree-shakeable
// build), rather than all of them.
useMode(modeRgb);
useMode(modeLrgb);
useMode(modeOklab);
useMode(modeOklch);

/**
 * Blends color A into color B in OKLCH, so the middle of the scale stays
 * vivid rather than going grey. Returns a function from 0–1 to a hex color.
 */
export function blend(a: string, b: string): (t: number) => string {
  const mix = interpolate([a, b], 'oklch');
  return (t) => formatHex(mix(t)) ?? a;
}
