import { describe, expect, it } from 'vitest';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { ACTIVITY_TYPES } from '../src/core/types';
import { DEFAULT_LEGEND } from '../src/render/legend';
import { DEFAULT_STYLE, renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

describe('route shape cache', () => {
  const layout = { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 } as const;
  const filters = { types: [...ACTIVITY_TYPES], from: null, to: null };
  const prepared = prepareWorkouts(syntheticWorkouts(30));
  const firstPoint = (svg: string) => svg.match(/ d="(M[\d.]+ [\d.]+)/)![1];
  const style = (title: string) => ({
    ...DEFAULT_STYLE,
    textBand: true,
    legend: { ...DEFAULT_LEGEND, show: true, title, name: title ? 'With a name' : '' },
  });

  it('redraws routes when a taller legend moves them', () => {
    const scene = buildScene(prepared, filters, layout);
    renderSvg(scene, style(''));
    const afterChange = renderSvg(scene, style('A much taller legend'));
    // A fresh scene object bypasses the cache: the result must match.
    const fresh = renderSvg(buildScene(prepared, filters, layout), style('A much taller legend'));
    expect(firstPoint(afterChange)).toBe(firstPoint(fresh));
  });

  it('reuses routes when only colors change', () => {
    const scene = buildScene(prepared, filters, layout);
    const a = renderSvg(scene, style('T'));
    const b = renderSvg(scene, { ...style('T'), colorB: '#ff0000' });
    expect(firstPoint(a)).toBe(firstPoint(b));
    expect(b).toContain('#ff0000');
  });
});

describe('made-with mark', () => {
  const prepared = prepareWorkouts(syntheticWorkouts(20));
  const scene = buildScene(prepared, { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 });
  const mark = (svg: string) => svg.match(/<text class="mark" x="([\d.]+)"[^>]*text-anchor="(\w+)"[^>]*>([^<]*)</);

  it('is on by default and can be turned off', () => {
    expect(mark(renderSvg(scene, DEFAULT_STYLE))?.[3]).toBe('made with stridemap');
    expect(renderSvg(scene, { ...DEFAULT_STYLE, mark: false })).not.toContain('class="mark"');
  });

  it('sits on the side the scale bar is not', () => {
    // Bar on the left by default: mark on the right.
    expect(mark(renderSvg(scene, DEFAULT_STYLE))?.[2]).toBe('end');
    // Legend bottom-left moves the bar right: mark goes left.
    const legendLeft = { ...DEFAULT_STYLE, legend: { ...DEFAULT_LEGEND, show: true, title: 'T', position: 'bottom-left' as const } };
    expect(mark(renderSvg(scene, legendLeft))?.[2]).toBe('start');
  });
});
