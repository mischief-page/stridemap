import { describe, expect, it } from 'vitest';
import { ASPECTS } from '../src/render/canvas';
import { CATALOG, findProduct, profitUsd } from '../src/print/catalog';

describe('catalog', () => {
  it('has unique products that are findable', () => {
    expect(new Set(CATALOG.map((p) => p.id)).size).toBe(CATALOG.length);
    for (const p of CATALOG) expect(findProduct(p.id)).toBe(p);
  });

  it("gives every product an editor print shape that matches Prodigi's print area", () => {
    for (const p of CATALOG) {
      const ratio = p.printPx.height / p.printPx.width;
      expect(Math.abs(ratio - ASPECTS[p.aspect]) / ASPECTS[p.aspect]).toBeLessThan(0.01);
    }
  });

  it('makes money on everything', () => {
    for (const p of CATALOG) expect(profitUsd(p)).toBeGreaterThan(10);
  });
});
