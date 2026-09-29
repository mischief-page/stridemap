import type { ActivityType } from '../core/types';
import { inkFor, type Units } from './scale';
import { round1 as r } from './format';

export type LegendPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const LEGEND_POSITIONS: LegendPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

/** System font stacks only, so the page keeps working offline and from file://. */
export const LEGEND_FONTS = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  serif: "ui-serif, 'New York', Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  rounded: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
} as const;

export type LegendFont = keyof typeof LEGEND_FONTS;

/** 'month' → "Jan 2024 – Aug 2025"; 'day' → "Jan 3, 2024 – Aug 5, 2025"; 'year' → "2024 – 2025". */
export type DateFormat = 'month' | 'day' | 'year';

/**
 * 'halo' outlines the text in the background color; 'panel' puts it on a
 * translucent box. Both keep it readable over busy routes.
 */
export type LegendBackdrop = 'none' | 'halo' | 'panel';

export interface LegendOptions {
  show: boolean;
  title: string;
  name: string;
  showDates: boolean;
  dateFormat: DateFormat;
  /** A line of totals, e.g. "412 runs · 2,318 mi". */
  showStats: boolean;
  position: LegendPosition;
  font: LegendFont;
  /** Multiplier on the default text size. */
  size: number;
  /** Title in spaced capitals. */
  uppercaseTitle: boolean;
  /** null picks white or black to suit the background. */
  color: string | null;
  backdrop: LegendBackdrop;
  /** BCP 47 locale for dates; undefined uses the viewer's. */
  locale?: string;
}

export const DEFAULT_LEGEND: LegendOptions = {
  show: false,
  title: '',
  name: '',
  showDates: true,
  dateFormat: 'month',
  showStats: false,
  position: 'top-left',
  font: 'sans',
  size: 1,
  uppercaseTitle: false,
  color: null,
  backdrop: 'halo',
};

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
  const distance = facts.distanceM / (facts.units === 'mi' ? 1609.344 : 1000);
  return `${n.format(facts.count)} ${facts.count === 1 ? one : many} · ${n.format(Math.round(distance))} ${facts.units}`;
}

interface Line {
  text: string;
  size: number;
  opacity: number;
  weight: number;
  caps: boolean;
}

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
    lines.push({ text: details.join(' · '), size: base * 0.5, opacity: 0.7, weight: 400, caps: false });
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
    const caps = l.caps ? ` letter-spacing="${r(l.size * 0.12)}"` : '';
    const halo =
      legend.backdrop === 'halo'
        ? ` stroke="${frame.background}" stroke-width="${r(l.size / 5)}" stroke-opacity="0.9" stroke-linejoin="round" paint-order="stroke"`
        : '';
    return `<text x="${r(x)}" y="${r(baseline)}" font-size="${r(l.size)}" font-weight="${l.weight}" fill-opacity="${l.opacity}"${caps}${halo}>${escapeXml(l.caps ? l.text.toUpperCase() : l.text)}</text>`;
  });

  let panel = '';
  if (legend.backdrop === 'panel') {
    const pad = base * 0.5;
    const left = anchor === 'start' ? x : anchor === 'end' ? x - blockWidth : x - blockWidth / 2;
    panel = `<rect x="${r(left - pad)}" y="${r(top - pad)}" width="${r(blockWidth + 2 * pad)}" height="${r(blockHeight + 2 * pad)}" rx="${r(pad / 2)}" fill="${frame.background}" fill-opacity="0.8"/>`;
  }

  return `<g class="legend" font-family="${LEGEND_FONTS[legend.font]}" fill="${ink}" text-anchor="${anchor}">
${panel}${texts.join('\n')}
</g>`;
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

