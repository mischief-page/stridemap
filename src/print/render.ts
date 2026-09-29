import { Resvg } from '@resvg/resvg-js';

/**
 * Turns the page's SVG into a print file: a PNG at exactly the pixel size the
 * print provider asks for (for an 18×24 in poster, 5400×7200 at 300 DPI).
 * resvg renders the same SVG the browser shows, including the glow blend
 * modes and the pencil grain filter.
 */
export function renderPrintPng(svg: string, width: number, height: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    // System fonts for now; bundled open-licence fonts come before selling prints,
    // so the print matches the screen on any machine.
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
    background: undefined,
  });
  const png = resvg.render();
  if (png.width !== width || png.height !== height) {
    throw new Error(`Print file is ${png.width}×${png.height}, expected ${width}×${height}: the image shape doesn't match the product.`);
  }
  return png.asPng();
}
