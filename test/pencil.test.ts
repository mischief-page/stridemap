import { describe, expect, it } from 'vitest';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { ACTIVITY_TYPES } from '../src/core/types';
import { pencilPath } from '../src/render/pencil';
import { DEFAULT_STYLE, renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

const d = 'M10 10L200 10L200 150L40 150';

describe('pencilPath', () => {
  it('is the same every time for the same seed, and different for another', () => {
    expect(pencilPath(d, 1, 3)).toBe(pencilPath(d, 1, 3));
    expect(pencilPath(d, 1, 3)).not.toBe(pencilPath(d, 1, 4));
  });

  it('starts where the route starts and draws hand-drawn curves', () => {
    const out = pencilPath(d, 1, 1);
    expect(out.startsWith('M10 10')).toBe(true);
    expect(out).toMatch(/c-?\d/);
  });

  it('traces each segment twice, without redundant moves', () => {
    const out = pencilPath(d, 1, 1);
    // Three segments, each drawn twice → six curves.
    expect(out.match(/c/g)).toHaveLength(6);
    // A move only where the pen jumps (the start of each of the two traces).
    expect((out.match(/M/g) ?? []).length).toBeLessThanOrEqual(6);
  });

  it('stays close to the route', () => {
    // Walk the relative commands and check every end point is near the original corners.
    const out = pencilPath(d, 1, 7);
    let x = 0, y = 0;
    const ends: [number, number][] = [];
    for (const [, cmd, args] of out.matchAll(/([Mcl])([^Mcl]*)/g)) {
      const n = args!.match(/-?\d+(\.\d+)?/g)!.map(Number);
      if (cmd === 'M') [x, y] = [n[0]!, n[1]!];
      else [x, y] = [x + n[n.length - 2]!, y + n[n.length - 1]!];
      ends.push([x, y]);
    }
    const corners = [[10, 10], [200, 10], [200, 150], [40, 150]];
    for (const [ex, ey] of ends) {
      expect(Math.min(...corners.map(([cx, cy]) => Math.hypot(ex - cx!, ey - cy!)))).toBeLessThan(3);
    }
  });
});

describe('pencil style in the image', () => {
  const scene = buildScene(prepareWorkouts(syntheticWorkouts(30)), { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 });

  it('adds the grain filter only when grain is on', () => {
    const grainy = renderSvg(scene, { ...DEFAULT_STYLE, pencil: { roughness: 1, grain: 0.5 } });
    expect(grainy).toContain('<feTurbulence');
    expect(grainy).toMatch(/<g [^>]*filter="url\(#stridemap-pencil-grain\)"/);
    const smooth = renderSvg(scene, { ...DEFAULT_STYLE, pencil: { roughness: 1, grain: 0 } });
    expect(smooth).not.toContain('<filter');
    expect(renderSvg(scene, DEFAULT_STYLE)).not.toContain('<filter');
  });

  it('redraws the routes when switching between clean and pencil', () => {
    const clean = renderSvg(scene, DEFAULT_STYLE);
    const pencil = renderSvg(scene, { ...DEFAULT_STYLE, pencil: { roughness: 1, grain: 0.5 } });
    expect(pencil).not.toBe(clean);
    expect(renderSvg(scene, DEFAULT_STYLE)).toBe(clean);
  });
});
