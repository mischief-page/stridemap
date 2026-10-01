import type { Look } from './settings';

/**
 * Finished looks someone can pick and be happy with. A preset sets every look
 * setting, and never the person's own choices: filters, title and name text,
 * and units.
 */
/** The title a preset gives a poster that has none, so it reads as finished. */
export const DEFAULT_TITLE = 'My Workouts';

export interface Preset {
  id: string;
  name: string;
  description: string;
  look: Look;
}

// Every preset is an 18×24 portrait poster with "How often" coloring, text in
// its own band, and totals and dates under the title: the format that
// competitors and our print catalog center on.
const POSTER: Omit<Look, 'background' | 'colorA' | 'colorB' | 'blend' | 'strokeWidth' | 'opacity' | 'smoothing'> = {
  colorMode: 'frequency',
  fit: 95,
  squash: 1,
  aspect: '4:3',
  orientation: 'portrait',
  lineStyle: 'clean',
  roughness: 1,
  grain: 0.5,
  scale: 'bar',
  scaleColor: null,
  legendShow: true,
  showDates: true,
  showStats: true,
  legendKey: true,
  dateFormat: 'month',
  textBand: true,
  legendPosition: 'bottom-center',
  legendFont: 'sans',
  legendBackdrop: 'none',
  legendSize: 0.85,
  legendCaps: false,
  legendColor: null,
};

export const PRESETS: Preset[] = [
  {
    id: 'gallery',
    name: 'Gallery',
    description: 'Navy on white, spaced serif capitals. Quiet enough for any room.',
    look: {
      ...POSTER,
      background: '#fbfaf7',
      colorA: '#c3cad6',
      colorB: '#0f1f3d',
      blend: 'multiply',
      strokeWidth: 1,
      opacity: 0.55,
      smoothing: 6,
      legendFont: 'serif',
      legendCaps: true,
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Charcoal with an orange glow where you run most.',
    look: {
      ...POSTER,
      background: '#16171a',
      colorA: '#6b2e0e',
      colorB: '#ff8a3d',
      blend: 'screen',
      strokeWidth: 1.2,
      opacity: 0.8,
      smoothing: 4,
      legendCaps: true,
    },
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    description: 'Midnight blue to gold: your routes as a heat map.',
    look: {
      ...POSTER,
      background: '#0b0f19',
      colorA: '#1d4ed8',
      colorB: '#fbbf24',
      blend: 'screen',
      strokeWidth: 1.2,
      opacity: 0.7,
      smoothing: 8,
      legendPosition: 'top-left',
      legendSize: 0.9,
    },
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    description: 'Warm rust on cream, softly rounded. Made for living rooms.',
    look: {
      ...POSTER,
      background: '#f4ece1',
      colorA: '#e6bfa3',
      colorB: '#a3401f',
      blend: 'multiply',
      strokeWidth: 1.1,
      opacity: 0.6,
      smoothing: 12,
      legendPosition: 'bottom-left',
      legendFont: 'serif',
      legendSize: 0.9,
    },
  },
  {
    id: 'sketch',
    name: 'Sketch',
    description: 'Graphite pencil on warm paper, like a page from a notebook.',
    look: {
      ...POSTER,
      background: '#f3efe6',
      colorA: '#a39d92',
      colorB: '#1f1d1a',
      blend: 'multiply',
      strokeWidth: 1.1,
      opacity: 0.7,
      smoothing: 0,
      lineStyle: 'pencil',
      roughness: 1.2,
      grain: 0.5,
      legendPosition: 'bottom-right',
      legendFont: 'mono',
      legendSize: 0.8,
    },
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
