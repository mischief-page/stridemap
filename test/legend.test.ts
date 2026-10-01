import { describe, expect, it } from 'vitest';
import { DEFAULT_LEGEND, type LegendOptions, DEFAULT_STYLE } from '../src/render/style';
import { buildScene, prepareWorkouts } from '../src/core/pipeline';
import { ACTIVITY_TYPES } from '../src/core/types';
import { formatDateRange, formatStats, legendHeight, renderLegend, type LegendFacts } from '../src/render/legend';
import { renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

const frame = { width: 1200, height: 1200, padding: 60, background: '#0b0f19' };
const range: [number, number] = [Date.UTC(2024, 0, 3, 12), Date.UTC(2025, 7, 5, 12)];
const facts: LegendFacts = { dateRange: range, count: 412, distanceM: 2318 * 1609.344, activityTypes: ['running'], units: 'mi' };
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
    const svg = renderLegend(frame, legend({ title: 'Two years', name: 'Alex' }), facts);
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(texts).toEqual(['Two years', 'Alex', 'Jan 2024 – Aug 2025']);
  });

  it('leaves out empty lines, and draws nothing when hidden or empty', () => {
    expect(renderLegend(frame, legend({ name: 'Alex', showDates: false }), facts).match(/<text/g)).toHaveLength(1);
    expect(renderLegend(frame, legend({ title: 'x', show: false }), facts)).toBe('');
    expect(renderLegend(frame, legend({ showDates: false }), facts)).toBe('');
  });

  it('escapes user text', () => {
    const svg = renderLegend(frame, legend({ title: '<script>alert("x")</script> & co' }), facts);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
  });

  it('places and aligns the text by position', () => {
    const at = (position: LegendOptions['position']) => renderLegend(frame, legend({ title: 'T', position }), facts);
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
      facts,
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
  const scene = buildScene(prepareWorkouts(workouts), { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 });

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

describe('stats line', () => {
  it('counts workouts and distance in the chosen units', () => {
    expect(formatStats(facts, 'en-US')).toBe('412 runs · 2,318 mi');
    expect(formatStats({ ...facts, units: 'km' }, 'en-US')).toBe('412 runs · 3,730 km');
    expect(formatStats({ ...facts, count: 1 }, 'en-US')).toBe('1 run · 2,318 mi');
  });

  it('names mixed activity types', () => {
    expect(formatStats({ ...facts, activityTypes: ['walking', 'running'] }, 'en-US')).toMatch(/^412 walks & runs/);
    expect(formatStats({ ...facts, activityTypes: ['walking', 'running', 'hiking'] }, 'en-US')).toMatch(/^412 activities/);
  });

  it('shares the last line with the dates', () => {
    const svg = renderLegend(frame, legend({ title: 'T', showStats: true }), facts);
    expect(svg).toContain('>412 runs · 2,318 mi · Jan 2024 – Aug 2025<');
  });
});

describe('legendHeight', () => {
  it('grows with each line and is 0 when hidden', () => {
    const one = legendHeight(frame, legend({ title: 'T', showDates: false }), facts);
    const three = legendHeight(frame, legend({ title: 'T', name: 'N' }), facts);
    expect(one).toBeGreaterThan(0);
    expect(three).toBeGreaterThan(one);
    expect(legendHeight(frame, legend({ show: false, title: 'T' }), facts)).toBe(0);
  });
});

describe('text band', () => {
  const workouts = syntheticWorkouts(30);
  const scene = buildScene(prepareWorkouts(workouts), { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 });
  const artBox = (svg: string) => svg.match(/<svg class="art" y="([\d.]+)" width="\d+" height="([\d.]+)"/)!.slice(1).map(Number);

  it('keeps the routes out of the legend band, at the bottom or the top', () => {
    const full = artBox(renderSvg(scene, { ...DEFAULT_STYLE, legend: legend({ title: 'T' }) }));
    expect(full).toEqual([0, DEFAULT_STYLE.height]);
    const bottom = artBox(renderSvg(scene, { ...DEFAULT_STYLE, textBand: true, legend: legend({ title: 'T', position: 'bottom-center' }) }));
    expect(bottom[0]).toBe(0);
    expect(bottom[1]!).toBeLessThan(DEFAULT_STYLE.height);
    const top = artBox(renderSvg(scene, { ...DEFAULT_STYLE, textBand: true, legend: legend({ title: 'T', position: 'top-left' }) }));
    expect(top[0]!).toBeGreaterThan(0);
    expect(top[0]! + top[1]!).toBeCloseTo(DEFAULT_STYLE.height, 0);
  });

  it('takes no space when there is no legend', () => {
    const svg = renderSvg(scene, { ...DEFAULT_STYLE, textBand: true });
    expect(artBox(svg)).toEqual([0, DEFAULT_STYLE.height]);
  });
});
