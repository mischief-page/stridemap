import { inkFor } from './scale';

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

/**
 * Draws the legend. The SVG has to stand on its own (no fonts to measure
 * with), so panel widths are estimated from character counts.
 */
export function renderLegend(frame: Frame, legend: LegendOptions, dateRange: [number, number] | null): string {
  if (!legend.show) return '';
  const base = (Math.min(frame.width, frame.height) / 28) * legend.size;
  const lines: { text: string; size: number; opacity: number; weight: number; caps: boolean }[] = [];
  if (legend.title.trim()) {
    lines.push({ text: legend.title.trim(), size: base, opacity: 1, weight: 600, caps: legend.uppercaseTitle });
  }
  if (legend.name.trim()) {
    lines.push({ text: legend.name.trim(), size: base * 0.6, opacity: 0.9, weight: 400, caps: false });
  }
  if (legend.showDates && dateRange) {
    lines.push({
      text: formatDateRange(dateRange, legend.dateFormat, legend.locale),
      size: base * 0.5,
      opacity: 0.7,
      weight: 400,
      caps: false,
    });
  }
  if (!lines.length) return '';

  const ink = legend.color ?? inkFor(frame.background);
  const [vertical, horizontal] = legend.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  const anchor = horizontal === 'left' ? 'start' : horizontal === 'right' ? 'end' : 'middle';
  const x = horizontal === 'left' ? frame.padding : horizontal === 'right' ? frame.width - frame.padding : frame.width / 2;

  // Line boxes: each line takes 1.25× its font size, with a little extra under the title.
  const gaps = lines.map((l, i) => l.size * 1.25 + (i === 0 && lines.length > 1 ? l.size * 0.15 : 0));
  const blockHeight = gaps.reduce((a, b) => a + b, 0);
  const top = vertical === 'top' ? frame.padding : frame.height - frame.padding - blockHeight;

  const charWidth = legend.font === 'mono' ? 0.6 : legend.font === 'serif' ? 0.5 : 0.54;
  const widthOf = (l: (typeof lines)[number]) => l.text.length * l.size * charWidth * (l.caps ? 1.3 : 1);
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

const r = (n: number) => Math.round(n * 10) / 10;
