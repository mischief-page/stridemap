/**
 * The settings options shared by the command-line scripts (cli.ts and
 * print-file.ts), mapped onto the shared settings record and checked against
 * the same allowed values and ranges the page offers.
 */
import { COLOR_MODES, OTHER_STARTS } from '../src/core/pipeline';
import { ACTIVITY_TYPES } from '../src/core/types';
import { findPreset, PRESETS, type Preset } from '../src/app/presets';
import { DEFAULT_STATE, type EditorState } from '../src/app/settings';
import { ASPECTS } from '../src/render/canvas';
import {
  BLENDS,
  DATE_FORMATS,
  DISTANCE_SHAPES,
  LEGEND_BACKDROPS,
  LEGEND_FONTS,
  LEGEND_POSITIONS,
  SCALE_STYLES,
  UNITS,
} from '../src/render/style';

/** A bad option value; the scripts print its message and stop. */
export class OptionError extends Error {}

type Flag = { type: 'string' | 'boolean'; apply: (value: unknown, s: Partial<EditorState>) => void };

const oneOf = <K extends keyof EditorState>(key: K, allowed: readonly string[], name: string): Flag => ({
  type: 'string',
  apply: (v, s) => {
    if (!allowed.includes(String(v))) throw new OptionError(`--${name} must be one of: ${allowed.join(', ')}`);
    s[key] = v as never;
  },
});
const num = <K extends keyof EditorState>(key: K, min: number, max: number, name: string): Flag => ({
  type: 'string',
  apply: (v, s) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new OptionError(`--${name} must be a number from ${min} to ${max}`);
    s[key] = n as never;
  },
});
const color = <K extends keyof EditorState>(key: K, name: string): Flag => ({
  type: 'string',
  apply: (v, s) => {
    if (!/^#[0-9a-f]{6}$/i.test(String(v))) throw new OptionError(`--${name} must be a color like #1d4ed8`);
    s[key] = v as never;
  },
});
const str = <K extends keyof EditorState>(key: K): Flag => ({ type: 'string', apply: (v, s) => void (s[key] = v as never) });
const bool = <K extends keyof EditorState>(key: K): Flag => ({ type: 'boolean', apply: (v, s) => void (s[key] = v as never) });
const date = <K extends keyof EditorState>(key: K, name: string): Flag => ({
  type: 'string',
  apply: (v, s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new OptionError(`--${name} must be a date like 2025-01-31`);
    s[key] = v as never;
  },
});

/** Every setting option. */
export const FLAGS: Record<string, Flag> = {
  types: {
    type: 'string',
    apply: (v, s) => {
      const types = String(v).split(',');
      const bad = types.filter((t) => !(ACTIVITY_TYPES as string[]).includes(t));
      if (bad.length) throw new OptionError(`--types takes ${ACTIVITY_TYPES.join(', ')} (not ${bad.join(', ')})`);
      s.types = types as EditorState['types'];
    },
  },
  from: date('from', 'from'),
  to: date('to', 'to'),
  title: str('title'),
  name: str('name'),
  units: oneOf('units', UNITS, 'units'),
  'no-mark': { type: 'boolean', apply: (v, s) => void (s.mark = !v) },
  mode: oneOf('colorMode', COLOR_MODES, 'mode'),
  fit: num('fit', 50, 100, 'fit'),
  squash: num('squash', 0.3, 1, 'squash'),
  aspect: oneOf('aspect', Object.keys(ASPECTS), 'aspect'),
  portrait: { type: 'boolean', apply: (v, s) => void (s.orientation = v ? 'portrait' : 'landscape') },
  background: color('background', 'background'),
  'color-a': color('colorA', 'color-a'),
  'color-b': color('colorB', 'color-b'),
  blend: oneOf('blend', BLENDS, 'blend'),
  'line-width': num('strokeWidth', 0.3, 4, 'line-width'),
  opacity: num('opacity', 0.1, 1, 'opacity'),
  smooth: num('smoothing', 0, 40, 'smooth'),
  pencil: {
    type: 'string',
    apply: (v, s) => {
      num('roughness', 0.3, 3, 'pencil').apply(v, s);
      s.lineStyle = 'pencil';
    },
  },
  grain: num('grain', 0, 1, 'grain'),
  scale: oneOf('scale', SCALE_STYLES, 'scale'),
  'scale-color': color('scaleColor', 'scale-color'),
  dates: bool('showDates'),
  stats: bool('showStats'),
  'color-key': bool('legendKey'),
  'text-band': bool('textBand'),
  'date-format': oneOf('dateFormat', DATE_FORMATS, 'date-format'),
  'legend-position': oneOf('legendPosition', LEGEND_POSITIONS, 'legend-position'),
  'legend-font': oneOf('legendFont', Object.keys(LEGEND_FONTS), 'legend-font'),
  'legend-size': num('legendSize', 0.5, 2, 'legend-size'),
  'legend-caps': bool('legendCaps'),
  'legend-color': color('legendColor', 'legend-color'),
  'legend-backdrop': oneOf('legendBackdrop', LEGEND_BACKDROPS, 'legend-backdrop'),
  map: { type: 'boolean', apply: (v, s) => void (v && (s.underlay = 'map')) },
  'map-at': { type: 'string', apply: (v, s) => void Object.assign(s, { underlay: 'map', mapPlace: 'custom', mapAt: v }) },
  'map-others': oneOf('mapOthers', OTHER_STARTS, 'map-others'),
  distance: {
    type: 'string',
    apply: (v, s) => {
      oneOf('distanceShape', DISTANCE_SHAPES, 'distance').apply(v, s);
      s.underlay = 'distance';
    },
  },
  'distance-markers': bool('distanceMarkers'),
  'background-strength': num('underlayStrength', 0.05, 0.8, 'background-strength'),
};

/** parseArgs option definitions for FLAGS, plus --preset. */
export const FLAG_OPTIONS = {
  preset: { type: 'string' },
  ...Object.fromEntries(Object.entries(FLAGS).map(([name, f]) => [name, { type: f.type }])),
} as const;

/**
 * Settings from parsed options: the defaults, then the --preset's look, then
 * any other options given. Throws OptionError for bad values.
 */
export function settingsFrom(values: Record<string, unknown>): { state: EditorState; preset: Preset | undefined; given: Partial<EditorState> } {
  const preset = values.preset ? findPreset(String(values.preset)) : undefined;
  if (values.preset && !preset) {
    throw new OptionError(`Unknown preset "${values.preset}". Choose one of: ${PRESETS.map((p) => p.id).join(', ')}`);
  }
  const given: Partial<EditorState> = {};
  for (const [name, flag] of Object.entries(FLAGS)) {
    const value = values[name];
    if (value !== undefined) flag.apply(value, given);
  }
  const state: EditorState = { ...DEFAULT_STATE, ...preset?.look, ...given };
  // Without a preset, the legend appears as soon as there's something to put in it.
  if (!preset) state.legendShow = Boolean(state.title || state.name || given.showDates || given.showStats);
  return { state, preset, given };
}

/** Runs a script's main, printing bad options as a one-line message rather than a stack trace. */
export async function run(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    if (!(err instanceof OptionError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}
