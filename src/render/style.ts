/**
 * Every drawing option, with its defaults, and nothing else: no drawing code
 * and no libraries. The page imports these to build its settings, so keeping
 * them here keeps the drawing libraries (Rough.js, culori) out of the page's
 * own script; only the engine worker needs those.
 */
import { canvasSize } from './canvas';

// Each choice's allowed values as a list, with its type derived from the
// list, so the command line can check values against the same source.
export const UNITS = ['km', 'mi'] as const;
export type Units = (typeof UNITS)[number];

/**
 * 'bar' is a classic scale bar; 'rings' draws distance circles around the
 * anchor. When long routes are squashed, distance from the anchor is no longer
 * linear, so a bar would be wrong and rings are drawn instead.
 */
export const SCALE_STYLES = ['bar', 'rings', 'off'] as const;
export type ScaleStyle = (typeof SCALE_STYLES)[number];

export const METERS_PER: Record<Units, number> = { km: 1000, mi: 1609.344 };

export const LEGEND_POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const;
export type LegendPosition = (typeof LEGEND_POSITIONS)[number];

/** System font stacks only, so the page keeps working offline and from file://. */
export const LEGEND_FONTS = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  serif: "ui-serif, 'New York', Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  rounded: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
} as const;

export type LegendFont = keyof typeof LEGEND_FONTS;

/** 'month' → "Jan 2024 – Aug 2025"; 'day' → "Jan 3, 2024 – Aug 5, 2025"; 'year' → "2024 – 2025". */
export const DATE_FORMATS = ['month', 'day', 'year'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/**
 * 'halo' outlines the text in the background color; 'panel' puts it on a
 * translucent box. Both keep it readable over busy routes.
 */
export const LEGEND_BACKDROPS = ['none', 'halo', 'panel'] as const;
export type LegendBackdrop = (typeof LEGEND_BACKDROPS)[number];

export interface LegendOptions {
  show: boolean;
  title: string;
  name: string;
  showDates: boolean;
  dateFormat: DateFormat;
  /** A line of totals, e.g. "412 runs · 2,318 mi". */
  showStats: boolean;
  /** A small gradient key: "rarely ▬ often", or "slower ▬ faster" for pace. */
  colorKey: boolean;
  /** What the colors show, for the key's words. */
  colorMode: 'pace' | 'frequency';
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
  colorKey: false,
  colorMode: 'pace',
  position: 'top-left',
  font: 'sans',
  size: 1,
  uppercaseTitle: false,
  color: null,
  backdrop: 'halo',
};

/**
 * 'total': the running total over the span shown, always rising, "how far
 * I've come". 'monthly': distance per month (per week for short spans), a
 * range of peaks for big training blocks and valleys for breaks.
 */
export const DISTANCE_SHAPES = ['total', 'monthly'] as const;
export type DistanceShape = (typeof DISTANCE_SHAPES)[number];

export interface DistanceStyle {
  shape: DistanceShape;
  /** Overall strength, 0–1; the fill is fainter than its top edge. */
  strength: number;
  /**
   * Milestones: level lines cut through the fill as thin gaps, each with a
   * tiny label ("500 mi" where the running total passes it; "50 mi/mo", or
   * "/wk" for short spans, for distance per period).
   */
  markers: boolean;
}

export interface PencilOptions {
  /** How far lines wander from the true route; ~0.5 is careful, ~3 is loose. */
  roughness: number;
  /** 0–1: how grainy and broken the strokes look. */
  grain: number;
}

export interface MapStyle {
  /** Overall strength of the map, 0–1. */
  opacity: number;
  /** null picks white or black to suit the background. */
  color: string | null;
}

export const DEFAULT_MAP_STYLE: MapStyle = { opacity: 0.25, color: null };

export const BLENDS = ['normal', 'screen', 'multiply'] as const;
export type Blend = (typeof BLENDS)[number];

export interface StyleOptions {
  width: number;
  height: number;
  /** Empty margin around the fitted routes, in pixels. */
  padding: number;
  /** Cool end of the scale: slow pace, or streets visited once. */
  colorA: string;
  /** Hot end of the scale: fast pace, or the most-visited streets. */
  colorB: string;
  background: string;
  strokeWidth: number;
  opacity: number;
  /**
   * Blur radius in image pixels. 0 draws the GPS track as recorded; higher
   * values round corners into curves and turn routes into flowing strokes.
   */
  smoothing: number;
  /** Hand-drawn pencil look; null draws clean lines. */
  pencil: PencilOptions | null;
  /** 'screen' makes overlaps glow on dark backgrounds; 'multiply' darkens on light ones. */
  blend: Blend;
  /** Distance scale so viewers can judge how long the routes are. */
  scale: ScaleStyle;
  units: Units;
  /** Color of the scale bar or rings and their labels; null picks white or black to suit the background. */
  scaleColor: string | null;
  legend: LegendOptions;
  /** The small "made with" mark in the bottom margin. */
  mark: boolean;
  /**
   * Give the legend its own band at the top or bottom of the poster, so the
   * routes never run underneath the text.
   */
  textBand: boolean;
  /** A translucent street map under the routes; drawn only when features are given to renderSvg. */
  map: MapStyle | null;
  /** A quiet chart of distance over time under the routes. */
  distance: DistanceStyle | null;
}

export const DEFAULT_STYLE: StyleOptions = {
  ...canvasSize('3:2', 'landscape'),
  padding: 60,
  colorA: '#1d4ed8',
  colorB: '#fbbf24',
  background: '#0b0f19',
  strokeWidth: 1.2,
  opacity: 0.7,
  smoothing: 0,
  pencil: null,
  blend: 'screen',
  scale: 'bar',
  units: 'km',
  scaleColor: null,
  legend: DEFAULT_LEGEND,
  textBand: false,
  mark: true,
  map: null,
  distance: null,
};
