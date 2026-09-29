import { describe, expect, it } from 'vitest';
import { renderPrintPng } from '../src/print/render';

const svg = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#123"/><path d="M0 0L${w} ${h}" stroke="#fff"/></svg>`;

describe('renderPrintPng', () => {
  it('renders at exactly the requested pixel size', () => {
    const png = renderPrintPng(svg(120, 160), 540, 720);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(540);
    expect(png.readUInt32BE(20)).toBe(720);
  });

  it('refuses an image whose shape does not match the product', () => {
    expect(() => renderPrintPng(svg(120, 120), 540, 720)).toThrow(/doesn't match/);
  });
});
