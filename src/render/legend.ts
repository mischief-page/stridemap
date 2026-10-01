import { blend } from './color';
import type { ActivityType } from '../core/types';
import { inkFor } from './ink';
import { LEGEND_FONTS, METERS_PER, type DateFormat, type LegendOptions, type Units } from './style';
import { round1 as r } from './format';

export function formatDateRange(range: [number, number], format: DateFormat, locale?: string): string {
  const opts: Intl.DateTimeFormatOptions =
    format === 'year'
      ? { year: 'numeric' }
      : format === 'month'
        ? { year: 'numeric', month: 'short' }
        : { year: 'numeric', month: 'short', day: 'numeric' };
  const fmt = new Intl.DateTimeFormat(locale, opts);
  const [a, b] = range.map((t) => fmt.format(new Date(t))) as [string, string];
  return a === b ? a : `${a} – ${b}`;
}

interface Frame {
  width: number;
  height: number;
  padding: number;
  background: string;
  /** The routes' two colors, for the color key. */
  colors?: [string, string];
}

/** What the drawing shows, for the dates and totals lines. */
export interface LegendFacts {
  dateRange: [number, number] | null;
  count: number;
  distanceM: number;
  activityTypes: ActivityType[];
  units: Units;
}

const NOUNS: Record<ActivityType, [string, string]> = {
  running: ['run', 'runs'],
  walking: ['walk', 'walks'],
  hiking: ['hike', 'hikes'],
};

/** "412 runs · 2,318 mi"; mixed types read "walks & runs" or "activities". */
export function formatStats(facts: LegendFacts, locale?: string): string {
  const types = facts.activityTypes;
  const [one, many] =
    types.length === 1
      ? NOUNS[types[0]!]
      : types.length === 2 && !types.includes('hiking')
        ? ['walk or run', 'walks & runs']
        : ['activity', 'activities'];
  const n = new Intl.NumberFormat(locale);
  const distance = facts.distanceM / METERS_PER[facts.units];
  return `${n.format(facts.count)} ${facts.count === 1 ? one : many} · ${n.format(Math.round(distance))} ${facts.units}`;
}

interface Line {
  text: string;
  size: number;
  opacity: number;
  weight: number;
  caps: boolean;
  /** Drawn as the color key rather than text. */
  key?: [string, string];
}

const KEY_GRADIENT_ID = 'stridemap-key';

function legendLines(frame: Frame, legend: LegendOptions, facts: LegendFacts): { lines: Line[]; base: number } {
  const base = (Math.min(frame.width, frame.height) / 28) * legend.size;
  const lines: Line[] = [];
  if (!legend.show) return { lines, base };
  if (legend.title.trim()) {
    lines.push({ text: legend.title.trim(), size: base, opacity: 1, weight: 600, caps: legend.uppercaseTitle });
  }
  if (legend.name.trim()) {
    lines.push({ text: legend.name.trim(), size: base * 0.6, opacity: 0.9, weight: 400, caps: false });
  }
  // Totals and dates share the last, smallest line.
  const details = [
    legend.showStats && facts.count ? formatStats(facts, legend.locale) : '',
    legend.showDates && facts.dateRange ? formatDateRange(facts.dateRange, legend.dateFormat, legend.locale) : '',
  ].filter(Boolean);
  if (details.length) {
    lines.push({ text: details.join(' · '), size: base * 0.55, opacity: 0.75, weight: 400, caps: false });
  }
  // The line is counted whether or not colors are given, so the text band's height matches what's drawn.
  if (legend.colorKey) {
    const words: [string, string] = legend.colorMode === 'pace' ? ['slower', 'faster'] : ['rarely', 'often'];
    lines.push({ text: `${words[0]}${' '.repeat(KEY_BAR_CHARS)}${words[1]}`, size: base * 0.45, opacity: 0.75, weight: 400, caps: false, key: words });
  }
  return { lines, base };
}

/** Line boxes: each line takes 1.25× its font size, with a little extra under the title. */
function lineGaps(lines: Line[]): number[] {
  return lines.map((l, i) => l.size * 1.25 + (i === 0 && lines.length > 1 ? l.size * 0.15 : 0));
}

/** Height of the legend's text block in pixels (0 when there's nothing to show). */
export function legendHeight(frame: Frame, legend: LegendOptions, facts: LegendFacts): number {
  return lineGaps(legendLines(frame, legend, facts).lines).reduce((a, b) => a + b, 0);
}

/**
 * Draws the legend. The SVG has to stand on its own (no fonts to measure
 * with), so panel widths are estimated from character counts.
 */
export function renderLegend(frame: Frame, legend: LegendOptions, facts: LegendFacts): string {
  const { lines, base } = legendLines(frame, legend, facts);
  if (!lines.length) return '';

  const ink = legend.color ?? inkFor(frame.background);
  const [vertical, horizontal] = legend.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  const anchor = horizontal === 'left' ? 'start' : horizontal === 'right' ? 'end' : 'middle';
  const x = horizontal === 'left' ? frame.padding : horizontal === 'right' ? frame.width - frame.padding : frame.width / 2;

  const gaps = lineGaps(lines);
  const blockHeight = gaps.reduce((a, b) => a + b, 0);
  const top = vertical === 'top' ? frame.padding : frame.height - frame.padding - blockHeight;

  const charWidth = legend.font === 'mono' ? 0.6 : legend.font === 'serif' ? 0.5 : 0.54;
  const widthOf = (l: Line) => l.text.length * l.size * charWidth * (l.caps ? 1.3 : 1);
  const blockWidth = Math.max(...lines.map(widthOf));

  let y = top;
  const texts = lines.map((l, i) => {
    const baseline = y + l.size; // cap height sits roughly one font size below the line top
    y += gaps[i]!;
    const halo =
      legend.backdrop === 'halo'
        ? ` stroke="${frame.background}" stroke-width="${r(l.size / 5)}" stroke-opacity="0.9" stroke-linejoin="round" paint-order="stroke"`
        : '';
    if (l.key) {
      // "rarely ▬▬▬ often": words either side of a gradient bar, placed as one block.
      const bar = l.size * KEY_BAR_CHARS * charWidth;
      const gap = l.size * 0.5;
      const [wa, wb] = l.key.map((w) => w.length * l.size * charWidth);
      const total = wa! + gap + bar + gap + wb!;
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - total : x - total / 2;
      const word = (wx: number, w: string) =>
        `<text x="${r(wx)}" y="${r(baseline)}" font-size="${r(l.size)}" fill-opacity="${l.opacity}" text-anchor="start"${halo}>${w}</text>`;
      return `${word(x0, l.key[0])}<rect x="${r(x0 + wa! + gap)}" y="${r(baseline - l.size * 0.62)}" width="${r(bar)}" height="${r(l.size * 0.5)}" rx="${r(l.size * 0.25)}" fill="url(#${KEY_GRADIENT_ID})"/>${word(x0 + wa! + gap + bar + gap, l.key[1])}`;
    }
    const caps = l.caps ? ` letter-spacing="${r(l.size * 0.12)}"` : '';
    return `<text x="${r(x)}" y="${r(baseline)}" font-size="${r(l.size)}" font-weight="${l.weight}" fill-opacity="${l.opacity}"${caps}${halo}>${escapeXml(l.caps ? l.text.toUpperCase() : l.text)}</text>`;
  });

  let panel = '';
  if (legend.backdrop === 'panel') {
    const pad = base * 0.5;
    const left = anchor === 'start' ? x : anchor === 'end' ? x - blockWidth : x - blockWidth / 2;
    panel = `<rect x="${r(left - pad)}" y="${r(top - pad)}" width="${r(blockWidth + 2 * pad)}" height="${r(blockHeight + 2 * pad)}" rx="${r(pad / 2)}" fill="${frame.background}" fill-opacity="0.8"/>`;
  }

  const keyGradient = lines.some((l) => l.key) ? keyGradientDef(frame.colors ?? [ink, ink]) : '';
  return `<g class="legend" font-family="${LEGEND_FONTS[legend.font]}" fill="${ink}" text-anchor="${anchor}">
${keyGradient}${panel}${texts.join('\n')}
</g>`;
}

/** How wide the key's bar is, in characters of its text. */
const KEY_BAR_CHARS = 8;

/** The key's gradient, blended the same way as the routes (in OKLCH). */
function keyGradientDef([a, b]: [string, string]): string {
  const color = blend(a, b);
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `<stop offset="${t}" stop-color="${color(t)}"/>`).join('');
  return `<defs><linearGradient id="${KEY_GRADIENT_ID}">${stops}</linearGradient></defs>`;
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

