import { describe, expect, it } from 'vitest';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { findPreset, PRESETS } from '../src/render/presets';
import { DEFAULT_STATE, LOOK_KEYS, toRenderRequest } from '../src/render/settings';
import { renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

describe('presets', () => {
  const prepared = prepareWorkouts(syntheticWorkouts(30));

  it('has five distinct, findable looks that set every look setting', () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(5);
    expect(new Set(PRESETS.map((p) => p.look.background)).size).toBe(5);
    for (const p of PRESETS) {
      expect(findPreset(p.id)).toBe(p);
      expect(Object.keys(p.look).sort()).toEqual([...LOOK_KEYS].sort());
    }
  });

  it('renders each one as a portrait poster with its legend in a band', () => {
    for (const p of PRESETS) {
      const { filters, layout, style } = toRenderRequest({ ...DEFAULT_STATE, ...p.look, title: 'My Workouts' });
      const svg = renderSvg(buildScene(prepared, filters, layout), style);
      expect(svg).toContain('viewBox="0 0 1200 1600"');
      expect(svg).toContain(`fill="${p.look.background}"`);
      expect(svg).toMatch(/<svg class="art" y="[\d.]+" width="1200" height="(1[0-4]\d\d|\d{3})(\.\d)?"/);
      expect(svg).toContain('My Workouts');
    }
  });
});

describe('toRenderRequest', () => {
  it('turns local calendar dates into whole-day bounds', () => {
    const { filters } = toRenderRequest({ ...DEFAULT_STATE, from: '2025-01-01', to: '2025-01-31' });
    expect(filters.from).toBe(new Date(2025, 0, 1).getTime());
    expect(filters.to).toBe(new Date(2025, 1, 1).getTime() - 1);
    expect(toRenderRequest(DEFAULT_STATE).filters.from).toBeNull();
  });

  it('switches the pencil style on and off with the line style', () => {
    expect(toRenderRequest(DEFAULT_STATE).style.pencil).toBeNull();
    expect(toRenderRequest({ ...DEFAULT_STATE, lineStyle: 'pencil', roughness: 2, grain: 0.3 }).style.pencil).toEqual({ roughness: 2, grain: 0.3 });
  });
});
