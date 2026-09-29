import type { ColorMode } from '../core/pipeline';
import type { Aspect, Orientation } from './canvas';
import type { LegendOptions } from './legend';
import type { ScaleStyle } from './scale';
import type { StyleOptions } from './svg';

/**
 * Finished looks someone can pick and be happy with. A preset sets the look
 * (colors, lines, type, print shape) but never the person's own choices:
 * filters, title and name text, and units stay as they are.
 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  colorMode: ColorMode;
  /** Radial exponent; 1 is true scale. */
  squash: number;
  aspect: Aspect;
  orientation: Orientation;
  style: Pick<
    StyleOptions,
    'background' | 'colorA' | 'colorB' | 'blend' | 'strokeWidth' | 'opacity' | 'smoothing' | 'pencil' | 'textBand'
  > & { scale: ScaleStyle };
  legend: Pick<
    LegendOptions,
    'position' | 'font' | 'uppercaseTitle' | 'backdrop' | 'size' | 'showDates' | 'showStats' | 'dateFormat'
  >;
}

// Every preset is an 18×24 portrait poster ("How often" coloring, text in its
// own band, totals and dates under the title): the format that competitors
// and our print catalog center on.
const poster = {
  colorMode: 'frequency',
  squash: 1,
  aspect: '4:3',
  orientation: 'portrait',
} as const;

const details = { showDates: true, showStats: true, dateFormat: 'month' } as const;

export const PRESETS: Preset[] = [
  {
    id: 'gallery',
    name: 'Gallery',
    description: 'Navy on white, spaced serif capitals. Quiet enough for any room.',
    ...poster,
    style: {
      background: '#fbfaf7',
      colorA: '#c3cad6',
      colorB: '#0f1f3d',
      blend: 'multiply',
      strokeWidth: 1,
      opacity: 0.55,
      smoothing: 6,
      pencil: null,
      textBand: true,
      scale: 'bar',
    },
    legend: { position: 'bottom-center', font: 'serif', uppercaseTitle: true, backdrop: 'none', size: 0.85, ...details },
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Charcoal with an orange glow where you run most.',
    ...poster,
    style: {
      background: '#16171a',
      colorA: '#6b2e0e',
      colorB: '#ff8a3d',
      blend: 'screen',
      strokeWidth: 1.2,
      opacity: 0.8,
      smoothing: 4,
      pencil: null,
      textBand: true,
      scale: 'bar',
    },
    legend: { position: 'bottom-center', font: 'sans', uppercaseTitle: true, backdrop: 'none', size: 0.85, ...details },
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    description: 'Midnight blue to gold: your routes as a heat map.',
    ...poster,
    style: {
      background: '#0b0f19',
      colorA: '#1d4ed8',
      colorB: '#fbbf24',
      blend: 'screen',
      strokeWidth: 1.2,
      opacity: 0.7,
      smoothing: 8,
      pencil: null,
      textBand: true,
      scale: 'bar',
    },
    legend: { position: 'top-left', font: 'sans', uppercaseTitle: false, backdrop: 'none', size: 0.9, ...details },
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    description: 'Warm rust on cream, softly rounded. Made for living rooms.',
    ...poster,
    style: {
      background: '#f4ece1',
      colorA: '#e6bfa3',
      colorB: '#a3401f',
      blend: 'multiply',
      strokeWidth: 1.1,
      opacity: 0.6,
      smoothing: 12,
      pencil: null,
      textBand: true,
      scale: 'bar',
    },
    legend: { position: 'bottom-left', font: 'serif', uppercaseTitle: false, backdrop: 'none', size: 0.9, ...details },
  },
  {
    id: 'sketch',
    name: 'Sketch',
    description: 'Graphite pencil on warm paper, like a page from a notebook.',
    ...poster,
    style: {
      background: '#f3efe6',
      colorA: '#a39d92',
      colorB: '#1f1d1a',
      blend: 'multiply',
      strokeWidth: 1.1,
      opacity: 0.7,
      smoothing: 0,
      pencil: { roughness: 1.2, grain: 0.5 },
      textBand: true,
      scale: 'bar',
    },
    legend: { position: 'bottom-right', font: 'mono', uppercaseTitle: false, backdrop: 'none', size: 0.8, ...details },
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
