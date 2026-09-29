import { describe, expect, it } from 'vitest';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { ACTIVITY_TYPES } from '../src/core/types';
import { canvasSize } from '../src/render/canvas';
import { DEFAULT_LEGEND } from '../src/render/legend';
import { findPreset, PRESETS } from '../src/render/presets';
import { DEFAULT_STYLE, renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

describe('presets', () => {
  const workouts = syntheticWorkouts(30);

  it('has five distinct, findable looks', () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(5);
    expect(new Set(PRESETS.map((p) => p.style.background)).size).toBe(5);
    for (const p of PRESETS) expect(findPreset(p.id)).toBe(p);
  });

  it('renders each one as a portrait poster with its legend in a band', () => {
    for (const p of PRESETS) {
      const scene = buildScene(prepareWorkouts(workouts), { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: p.colorMode, fitPercentile: 95, radialExponent: p.squash });
      const svg = renderSvg(scene, {
        ...DEFAULT_STYLE,
        ...p.style,
        ...canvasSize(p.aspect, p.orientation),
        legend: { ...DEFAULT_LEGEND, ...p.legend, show: true, title: 'Every Step' },
      });
      expect(svg).toContain('viewBox="0 0 1200 1600"');
      expect(svg).toContain(`fill="${p.style.background}"`);
      expect(svg).toMatch(/<svg class="art" y="[\d.]+" width="1200" height="(1[0-4]\d\d|\d{3})(\.\d)?"/);
      expect(svg).toContain('Every Step');
    }
  });
});
