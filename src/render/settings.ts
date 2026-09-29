import type { ColorMode, Filters, LayoutOptions } from '../core/pipeline';
import { ACTIVITY_TYPES, type ActivityType } from '../core/types';
import { canvasSize, type Aspect, type Orientation } from './canvas';
import { DEFAULT_LEGEND, type DateFormat, type LegendBackdrop, type LegendFont, type LegendPosition } from './legend';
import type { ScaleStyle, Units } from './scale';
import { DEFAULT_STYLE, type Blend, type StyleOptions } from './svg';

/**
 * Every setting a person can change, as one flat record. The page's controls,
 * the style presets and the command line all read and write this shape, and
 * toRenderRequest turns it into what the pipeline and renderer take. Adding a
 * setting means adding it here, once.
 */
export interface EditorState {
  // What to draw: the person's own choices, which presets never change.
  types: ActivityType[];
  /** Local calendar dates as YYYY-MM-DD, or '' for no limit. */
  from: string;
  to: string;
  title: string;
  name: string;
  units: Units;

  // How it looks.
  colorMode: ColorMode;
  fit: number;
  squash: number;
  aspect: Aspect;
  orientation: Orientation;
  background: string;
  colorA: string;
  colorB: string;
  blend: Blend;
  strokeWidth: number;
  opacity: number;
  smoothing: number;
  lineStyle: 'clean' | 'pencil';
  roughness: number;
  grain: number;
  scale: ScaleStyle;
  /** null: white or black to suit the background. */
  scaleColor: string | null;
  legendShow: boolean;
  showDates: boolean;
  showStats: boolean;
  dateFormat: DateFormat;
  textBand: boolean;
  legendPosition: LegendPosition;
  legendFont: LegendFont;
  legendBackdrop: LegendBackdrop;
  legendSize: number;
  legendCaps: boolean;
  /** null: white or black to suit the background. */
  legendColor: string | null;
}

/** The settings that make up a look. A preset sets all of them; changing any makes the style custom. */
export const LOOK_KEYS = [
  'colorMode', 'fit', 'squash', 'aspect', 'orientation', 'background', 'colorA', 'colorB', 'blend',
  'strokeWidth', 'opacity', 'smoothing', 'lineStyle', 'roughness', 'grain', 'scale', 'scaleColor',
  'legendShow', 'showDates', 'showStats', 'dateFormat', 'textBand', 'legendPosition', 'legendFont',
  'legendBackdrop', 'legendSize', 'legendCaps', 'legendColor',
] as const satisfies readonly (keyof EditorState)[];

export type LookKey = (typeof LOOK_KEYS)[number];
export type Look = Pick<EditorState, LookKey>;

export const DEFAULT_STATE: EditorState = {
  types: [...ACTIVITY_TYPES],
  from: '',
  to: '',
  title: '',
  name: '',
  units: DEFAULT_STYLE.units,
  colorMode: 'pace',
  fit: 95,
  squash: 1,
  aspect: '3:2',
  orientation: 'landscape',
  background: DEFAULT_STYLE.background,
  colorA: DEFAULT_STYLE.colorA,
  colorB: DEFAULT_STYLE.colorB,
  blend: DEFAULT_STYLE.blend,
  strokeWidth: DEFAULT_STYLE.strokeWidth,
  opacity: DEFAULT_STYLE.opacity,
  smoothing: DEFAULT_STYLE.smoothing,
  lineStyle: 'clean',
  roughness: 1,
  grain: 0.5,
  scale: DEFAULT_STYLE.scale,
  scaleColor: null,
  legendShow: false,
  showDates: DEFAULT_LEGEND.showDates,
  showStats: DEFAULT_LEGEND.showStats,
  dateFormat: DEFAULT_LEGEND.dateFormat,
  textBand: false,
  legendPosition: DEFAULT_LEGEND.position,
  legendFont: DEFAULT_LEGEND.font,
  legendBackdrop: DEFAULT_LEGEND.backdrop,
  legendSize: DEFAULT_LEGEND.size,
  legendCaps: DEFAULT_LEGEND.uppercaseTitle,
  legendColor: null,
};

/** Start or end of a local calendar day as Unix ms; null for ''. */
function dayBoundary(date: string, endOfDay: boolean): number | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return endOfDay ? day.getTime() + 86_400_000 - 1 : day.getTime();
}

export function toRenderRequest(
  s: EditorState,
  locale?: string,
): { filters: Filters; layout: LayoutOptions; style: StyleOptions } {
  return {
    filters: { types: s.types, from: dayBoundary(s.from, false), to: dayBoundary(s.to, true) },
    layout: { colorMode: s.colorMode, fitPercentile: s.fit, radialExponent: s.squash },
    style: {
      ...canvasSize(s.aspect, s.orientation),
      padding: DEFAULT_STYLE.padding,
      background: s.background,
      colorA: s.colorA,
      colorB: s.colorB,
      blend: s.blend,
      strokeWidth: s.strokeWidth,
      opacity: s.opacity,
      smoothing: s.smoothing,
      pencil: s.lineStyle === 'pencil' ? { roughness: s.roughness, grain: s.grain } : null,
      scale: s.scale,
      units: s.units,
      scaleColor: s.scaleColor,
      textBand: s.textBand,
      legend: {
        show: s.legendShow,
        title: s.title,
        name: s.name,
        showDates: s.showDates,
        showStats: s.showStats,
        dateFormat: s.dateFormat,
        position: s.legendPosition,
        font: s.legendFont,
        backdrop: s.legendBackdrop,
        size: s.legendSize,
        uppercaseTitle: s.legendCaps,
        color: s.legendColor,
        locale,
      },
    },
  };
}
