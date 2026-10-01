import { describe, expect, it } from 'vitest';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { renderDistance } from '../src/render/distance';
import { DEFAULT_STATE, toRenderRequest } from '../src/app/settings';
import { renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

const DAY = 86_400_000;
const frame = { top: 0, width: 1000, height: 800, colorA: '#000000', colorB: '#ffffff', background: '#808080', padding: 60, units: 'km' as const };
const edgeOf = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="none"/g)][0]![1]!;
const ys = (d: string) => [...d.matchAll(/[MLQ][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));

describe('renderDistance', () => {
  const timeline = Array.from({ length: 365 }, (_, i) => ({ t: Date.UTC(2024, 0, 1) + i * DAY, m: 5000 }));

  it('draws the running total rising to half the height, across the full width', () => {
    const svg = renderDistance(timeline, { shape: 'total', strength: 0.25, markers: false }, frame);
    const edge = edgeOf(svg);
    expect(edge.startsWith('M0 800')).toBe(true);
    const y = ys(edge);
    // Never falls, and peaks at half the art's height.
    for (let i = 1; i < y.length; i++) expect(y[i]!).toBeLessThanOrEqual(y[i - 1]! + 1e-9);
    expect(Math.min(...y)).toBeCloseTo(400, 0);
    expect(svg).toContain('L1000 800L0 800Z');
  });

  it('shows a break as a valley in distance per month', () => {
    const withBreak = timeline.filter((p) => p.t < Date.UTC(2024, 5, 1) || p.t >= Date.UTC(2024, 7, 1));
    const y = ys(edgeOf(renderDistance(withBreak, { shape: 'monthly', strength: 0.25, markers: false }, frame)));
    // Somewhere in the middle it touches the bottom.
    expect(Math.max(...y)).toBeCloseTo(800, 0);
    expect(Math.min(...y)).toBeLessThan(500);
  });

  it('marks round milestones where the running total passes them, only when asked', () => {
    // 365 × 5 km = 1,825 km. A fifth of that is 365 km, and the nearest round step is 500 km.
    const svg = renderDistance(timeline, { shape: 'total', strength: 0.25, markers: true }, frame);
    const labels = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(labels).toEqual(['500 km', '1,000 km', '1,500 km']);
    // The lines are gaps in the fill: background color, clipped to the area.
    expect(svg).toMatch(/stroke="#808080"[^>]*clip-path="url\(#stridemap-distance-area\)"/);
    // 500 km is reached about 100 days in, so its label ends just before x ≈ 274.
    const x = Number(svg.match(/<text x="([\d.]+)"[^>]*>500 km/)![1]);
    expect(x).toBeGreaterThan(260);
    expect(x).toBeLessThan(274);
    expect(renderDistance(timeline, { shape: 'total', strength: 0.25, markers: false }, frame)).not.toContain('<text');
  });

  it('labels per-month levels', () => {
    const svg = renderDistance(timeline, { shape: 'monthly', strength: 0.25, markers: true }, { ...frame, units: 'mi' });
    expect(svg).toMatch(/>\d+ mi\/mo</);
  });

  it('labels short spans per week, since they are bucketed by week', () => {
    const short = timeline.slice(0, 78);
    const svg = renderDistance(short, { shape: 'monthly', strength: 0.25, markers: true }, frame);
    expect(svg).toMatch(/>\d+ km\/wk</);
    expect(svg).not.toContain('/mo<');
  });

  it('draws nothing for a single workout', () => {
    expect(renderDistance(timeline.slice(0, 1), { shape: 'total', strength: 0.25, markers: false }, frame)).toBe('');
  });

  it('keeps the fill fainter than the edge, following strength', () => {
    const svg = renderDistance(timeline, { shape: 'total', strength: 0.4, markers: false }, frame);
    expect(svg).toContain('fill-opacity="0.18"');
    expect(svg).toContain('stroke-opacity="0.64"');
  });
});

describe('distance background in the picture', () => {
  const prepared = prepareWorkouts(syntheticWorkouts());

  it('is drawn under the routes only when chosen, and never with the map', () => {
    const draw = (underlay: 'none' | 'distance' | 'map') => {
      const { filters, layout, style } = toRenderRequest({ ...DEFAULT_STATE, underlay });
      return renderSvg(buildScene(prepared, filters, layout), style);
    };
    expect(draw('none')).not.toContain('class="distance"');
    expect(draw('map')).not.toContain('class="distance"');
    const svg = draw('distance');
    expect(svg).toContain('class="distance"');
    expect(svg.indexOf('class="distance"')).toBeLessThan(svg.indexOf('style="isolation'));
  });

  it('follows the filters', () => {
    const { filters, layout } = toRenderRequest({ ...DEFAULT_STATE, from: '2025-01-01' });
    const scene = buildScene(prepared, filters, layout);
    expect(scene.timeline.length).toBe(scene.workoutCount);
    expect(scene.timeline[0]!.t).toBeGreaterThanOrEqual(new Date(2025, 0, 1).getTime());
  });
});
