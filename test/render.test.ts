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
