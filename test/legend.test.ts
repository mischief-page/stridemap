import { describe, expect, it } from 'vitest';
import { buildScene } from '../src/core/pipeline';
import { ACTIVITY_TYPES } from '../src/core/types';
import { DEFAULT_LEGEND, formatDateRange, renderLegend, type LegendOptions } from '../src/render/legend';
import { DEFAULT_STYLE, renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

const frame = { width: 1200, height: 1200, padding: 60, background: '#0b0f19' };
const range: [number, number] = [Date.UTC(2024, 0, 3, 12), Date.UTC(2025, 7, 5, 12)];
const legend = (o: Partial<LegendOptions>): LegendOptions => ({ ...DEFAULT_LEGEND, show: true, locale: 'en-US', ...o });

describe('formatDateRange', () => {
  it('formats by month, day or year', () => {
    expect(formatDateRange(range, 'month', 'en-US')).toBe('Jan 2024 – Aug 2025');
    expect(formatDateRange(range, 'day', 'en-US')).toBe('Jan 3, 2024 – Aug 5, 2025');
    expect(formatDateRange(range, 'year', 'en-US')).toBe('2024 – 2025');
  });

  it('shows a single date when both ends match', () => {
    expect(formatDateRange([range[1], range[1]], 'year', 'en-US')).toBe('2025');
  });
});

describe('renderLegend', () => {
  it('draws title, name and dates in order', () => {
    const svg = renderLegend(frame, legend({ title: 'Two years', name: 'Alex' }), range);
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(texts).toEqual(['Two years', 'Alex', 'Jan 2024 – Aug 2025']);
  });

  it('leaves out empty lines, and draws nothing when hidden or empty', () => {
    expect(renderLegend(frame, legend({ name: 'Alex', showDates: false }), range).match(/<text/g)).toHaveLength(1);
    expect(renderLegend(frame, legend({ title: 'x', show: false }), range)).toBe('');
    expect(renderLegend(frame, legend({ showDates: false }), range)).toBe('');
  });

  it('escapes user text', () => {
    const svg = renderLegend(frame, legend({ title: '<script>alert("x")</script> & co' }), range);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
  });

  it('places and aligns the text by position', () => {
    const at = (position: LegendOptions['position']) => renderLegend(frame, legend({ title: 'T', position }), range);
    expect(at('top-left')).toMatch(/text-anchor="start"[\s\S]*<text x="60" y="(\d+)/);
    expect(at('top-right')).toMatch(/text-anchor="end"[\s\S]*<text x="1140"/);
    expect(at('bottom-center')).toMatch(/text-anchor="middle"[\s\S]*<text x="600"/);
    const topY = Number(at('top-left').match(/<text x="60" y="([\d.]+)/)![1]);
    const bottomY = Number(at('bottom-left').match(/<text x="60" y="([\d.]+)/)![1]);
    expect(topY).toBeLessThan(200);
    expect(bottomY).toBeGreaterThan(1000);
  });

  it('applies formatting options', () => {
    const svg = renderLegend(
      frame,
      legend({ title: 'Runs', font: 'serif', uppercaseTitle: true, color: '#ff0000', backdrop: 'panel', size: 2 }),
      range,
    );
    expect(svg).toContain('font-family="ui-serif');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('>RUNS<');
    expect(svg).toContain('letter-spacing');
    expect(svg).toContain('<rect');
    expect(svg).toMatch(/font-size="85.7"/); // 1200 / 28 × 2
  });
});

describe('legend in the full image', () => {
  const workouts = syntheticWorkouts(30);
  const scene = buildScene(workouts, { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 });

  it('shows the dates of the workouts actually drawn', () => {
    const starts = workouts.map((w) => w.start);
    expect(scene.dateRange).toEqual([Math.min(...starts), Math.max(...starts)]);
  });

  it('moves the scale bar to the right when the legend takes the bottom-left corner', () => {
    const left = renderSvg(scene, { ...DEFAULT_STYLE, legend: legend({ title: 'T', position: 'top-left' }) });
    const right = renderSvg(scene, { ...DEFAULT_STYLE, legend: legend({ title: 'T', position: 'bottom-left' }) });
    expect(left).toMatch(/class="scale">\s*<path d="M60 /);
    expect(right).not.toMatch(/class="scale">\s*<path d="M60 /);
  });

  it('uses the title as the SVG title', () => {
    expect(renderSvg(scene, { ...DEFAULT_STYLE, legend: legend({ title: 'My year' }) })).toContain('<title>My year</title>');
  });
});
