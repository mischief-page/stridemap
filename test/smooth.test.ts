import { describe, expect, it } from 'vitest';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { ACTIVITY_TYPES } from '../src/core/types';
import { smoothPolyline, type Polyline } from '../src/render/smooth';
import { renderSvg } from '../src/render/svg';
import { DEFAULT_STYLE } from '../src/render/style';
import { syntheticWorkouts } from '../src/sample/synthetic';

/** An L-shaped route: 200 px right, then 200 px down, one point per pixel. */
function corner(): Polyline {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 200; i++) pts.push([i, 0]);
  for (let i = 1; i <= 200; i++) pts.push([200, i]);
  return {
    x: Float64Array.from(pts, (p) => p[0]),
    y: Float64Array.from(pts, (p) => p[1]),
    value: Float64Array.from(pts, (_, i) => (i < 201 ? 1 : 2)),
  };
}

describe('smoothPolyline', () => {
  it('leaves the line alone at 0', () => {
    const line = corner();
    expect(smoothPolyline(line, 0)).toBe(line);
  });

  it('keeps both ends exactly in place, so routes still start on the anchor', () => {
    const s = smoothPolyline(corner(), 20);
    expect(s.x[0]).toBe(0);
    expect(s.y[0]).toBe(0);
    expect(s.x[s.x.length - 1]).toBeCloseTo(200);
    expect(s.y[s.y.length - 1]).toBeCloseTo(200);
  });

  it('rounds the corner more as the setting goes up', () => {
    // Distance from the sharp corner at (200, 0) to the nearest point of the smoothed line.
    const gap = (sigma: number) => {
      const s = smoothPolyline(corner(), sigma);
      return Math.min(...Array.from(s.x, (x, i) => Math.hypot(x - 200, s.y[i]!)));
    };
    expect(gap(5)).toBeGreaterThan(1);
    expect(gap(20)).toBeGreaterThan(gap(5) * 2);
  });

  it('keeps straight stretches straight', () => {
    const s = smoothPolyline(corner(), 10);
    for (let i = 0; i < s.x.length; i++) {
      if (s.x[i]! < 150) expect(Math.abs(s.y[i]!)).toBeLessThan(1e-9);
    }
  });

  it('carries color values along', () => {
    const s = smoothPolyline(corner(), 10);
    expect(s.value[0]).toBe(1);
    expect(s.value[s.value.length - 1]).toBe(2);
  });
});

describe('smoothing in the image', () => {
  const scene = buildScene(prepareWorkouts(syntheticWorkouts(40)), { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 });

  it('draws curves when smoothing is on, straight lines when off', () => {
    const rigid = renderSvg(scene, DEFAULT_STYLE);
    const smooth = renderSvg(scene, { ...DEFAULT_STYLE, smoothing: 15 });
    expect(rigid).not.toMatch(/d="[^"]*C/);
    expect(smooth).toMatch(/d="M[^"]*C/);
  });

  it('keeps the file size in check', () => {
    const rigid = renderSvg(scene, DEFAULT_STYLE).length;
    const smooth = renderSvg(scene, { ...DEFAULT_STYLE, smoothing: 15 }).length;
    // Curves take more characters per point than straight segments; this only
    // guards against smoothing blowing the file up.
    expect(smooth).toBeLessThan(rigid * 1.6);
  });
});
