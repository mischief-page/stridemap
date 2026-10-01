/**
 * The automatic text and scale color: dark ink on light backgrounds, light
 * ink on dark ones. Written out (WCAG relative luminance of a hex color) so
 * the page doesn't need a color library for it.
 */
export function inkFor(background: string): string {
  return luminance(background) > 0.4 ? '#000000' : '#ffffff';
}

/** WCAG relative luminance of "#rgb" or "#rrggbb", 0 (black) to 1 (white). Other strings count as black. */
export function luminance(hex: string): number {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return 0;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
