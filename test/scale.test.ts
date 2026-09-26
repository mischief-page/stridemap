import { describe, expect, it } from 'vitest';
import { buildScene } from '../src/core/pipeline';
import { METERS_PER_DEG_LAT, trackFromPoints } from '../src/core/track';
import type { Workout } from '../src/core/types';
import { formatDistance, niceRound } from '../src/render/scale';
import { DEFAULT_STYLE, renderSvg } from '../src/render/svg';

describe('niceRound', () => {
  it('rounds to the nearest 1, 2 or 5 × 10ⁿ', () => {
    expect(niceRound(0.27)).toBeCloseTo(0.2);
    expect(niceRound(3.9)).toBe(5);
    expect(niceRound(7.5)).toBe(10);
    expect(niceRound(1.3)).toBe(1);
  });
});

describe('formatDistance', () => {
  it('uses meters under a kilometer, but not for miles', () => {
    expect(formatDistance(0.2, 'km')).toBe('200 m');
    expect(formatDistance(5, 'km')).toBe('5 km');
    expect(formatDistance(0.5, 'mi')).toBe('0.5 mi');
  });
});

describe('scale on the image', () => {
  // One workout running 1,098 m due north (366 s at 3 m/s).
  const points = Array.from({ length: 367 }, (_, s) => ({
    t: s * 1000,
    lat: 40 + (3 * s) / METERS_PER_DEG_LAT,
    lon: -100,
    speed: 3,
    hAcc: 5,
  }));
  const workouts: Workout[] = [
    { id: 'a', type: 'running', start: 0, end: 366_000, distanceM: 1098, indoor: false, track: trackFromPoints(points) },
  ];
  const filters = { types: ['running' as const], from: null, to: null };

  it('draws a bar whose length matches the label', () => {
    const scene = buildScene(workouts, filters, { colorMode: 'pace', fitPercentile: 100, radialExponent: 1 });
    const svg = renderSvg(scene, DEFAULT_STYLE);
    // 1,098 m fills 1,080 px, so a 200 m bar is 196.7 px, starting at the 60 px padding.
    const bar = svg.match(/<path d="M60 [\d.]+V[\d.]+H([\d.]+)V/);
    expect(Number(bar![1]) - 60).toBeCloseTo((200 * 1080) / 1098, 0);
    expect(svg).toContain('>200 m</text>');
  });

  it('switches to rings when long routes are squashed', () => {
    const scene = buildScene(workouts, filters, { colorMode: 'pace', fitPercentile: 100, radialExponent: 0.5 });
    const svg = renderSvg(scene, DEFAULT_STYLE);
    expect(svg).toContain('<circle');
    expect(svg).not.toMatch(/<path d="M60 /);
  });

  it('uses the chosen color, or white/black to suit the background', () => {
    const bar = buildScene(workouts, filters, { colorMode: 'pace', fitPercentile: 100, radialExponent: 1 });
    const rings = buildScene(workouts, filters, { colorMode: 'pace', fitPercentile: 100, radialExponent: 0.5 });
    for (const scene of [bar, rings]) {
      expect(renderSvg(scene, { ...DEFAULT_STYLE, scaleColor: '#ff00aa' })).toMatch(/class="scale"[\s\S]*#ff00aa/);
      expect(renderSvg(scene, DEFAULT_STYLE)).toMatch(/class="scale"[\s\S]*stroke="#ffffff"/);
      expect(renderSvg(scene, { ...DEFAULT_STYLE, background: '#f6f1e7' })).toMatch(/class="scale"[\s\S]*stroke="#000000"/);
    }
  });

  it('can be turned off', () => {
    const scene = buildScene(workouts, filters, { colorMode: 'pace', fitPercentile: 100, radialExponent: 1 });
    expect(renderSvg(scene, { ...DEFAULT_STYLE, scale: 'off' })).not.toContain('class="scale"');
  });
});
