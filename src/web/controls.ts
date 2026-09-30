import { inkFor } from '../render/scale';
import type { EditorState } from '../render/settings';

/**
 * The page's controls, one per setting. Each control's element id is the
 * setting's name, so this table is the only place that knows how a setting
 * is shown: reading, writing and labelling all go through it.
 */
type Kind =
  | 'value' // text, date, color and select inputs
  | 'number' // range sliders
  | 'checkbox'
  | 'radio' // a fieldset of radio buttons
  | 'checkboxes' // a fieldset of checkboxes, as a list of values
  | 'autoColor'; // a color picker that follows the background until someone picks a color

const CONTROLS: { [K in keyof EditorState]: Kind } = {
  types: 'checkboxes',
  from: 'value',
  to: 'value',
  title: 'value',
  name: 'value',
  units: 'value',
  mark: 'checkbox',
  underlay: 'radio',
  underlayStrength: 'number',
  distanceShape: 'value',
  mapPlace: 'radio',
  mapAt: 'value',
  mapOthers: 'radio',
  colorMode: 'radio',
  fit: 'number',
  squash: 'number',
  aspect: 'value',
  orientation: 'radio',
  background: 'value',
  colorA: 'value',
  colorB: 'value',
  blend: 'value',
  strokeWidth: 'number',
  opacity: 'number',
  smoothing: 'number',
  lineStyle: 'value',
  roughness: 'number',
  grain: 'number',
  scale: 'value',
  scaleColor: 'autoColor',
  legendShow: 'checkbox',
  showDates: 'checkbox',
  showStats: 'checkbox',
  dateFormat: 'value',
  textBand: 'checkbox',
  legendPosition: 'value',
  legendFont: 'value',
  legendBackdrop: 'value',
  legendSize: 'number',
  legendCaps: 'checkbox',
  legendColor: 'autoColor',
};

const KEYS = Object.keys(CONTROLS) as (keyof EditorState)[];

/** Value labels shown beside sliders. */
const LABELS: Partial<{ [K in keyof EditorState]: (v: EditorState[K]) => string }> = {
  fit: (v) => `${v}%`,
  squash: (v) => String(v),
  strokeWidth: (v) => String(v),
  opacity: (v) => String(v),
  smoothing: (v) => (v === 0 ? 'Off' : `${v} px`),
  roughness: (v) => String(v),
  grain: (v) => `${Math.round(v * 100)}%`,
  legendSize: (v) => `${Math.round(v * 100)}%`,
  underlayStrength: (v) => `${Math.round(v * 100)}%`,
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const field = (id: string) => byId<HTMLInputElement>(id);

// Auto colors: true once someone has picked a color themselves.
const chosen: Partial<Record<keyof EditorState, boolean>> = {};

export function readState(): EditorState {
  const s: Record<string, unknown> = {};
  for (const key of KEYS) {
    switch (CONTROLS[key]) {
      case 'value':
        s[key] = field(key).value;
        break;
      case 'number':
        s[key] = Number(field(key).value);
        break;
      case 'checkbox':
        s[key] = field(key).checked;
        break;
      case 'radio':
        s[key] = document.querySelector<HTMLInputElement>(`#${key} input:checked`)!.value;
        break;
      case 'checkboxes':
        s[key] = [...document.querySelectorAll<HTMLInputElement>(`#${key} input:checked`)].map((el) => el.value);
        break;
      case 'autoColor':
        s[key] = chosen[key] ? field(key).value : null;
        break;
    }
  }
  return s as unknown as EditorState;
}

/** Sets controls from settings. (This doesn't fire input events.) */
export function writeState(partial: Partial<EditorState>): void {
  for (const [key, value] of Object.entries(partial) as [keyof EditorState, unknown][]) {
    switch (CONTROLS[key]) {
      case 'value':
      case 'number':
        field(key).value = String(value);
        break;
      case 'checkbox':
        field(key).checked = Boolean(value);
        break;
      case 'radio':
        document.querySelector<HTMLInputElement>(`#${key} input[value="${value}"]`)!.checked = true;
        break;
      case 'checkboxes':
        for (const el of document.querySelectorAll<HTMLInputElement>(`#${key} input`)) {
          el.checked = (value as string[]).includes(el.value);
        }
        break;
      case 'autoColor':
        chosen[key] = value !== null;
        if (value !== null) field(key).value = String(value);
        break;
    }
  }
  refresh();
}

/** Updates slider labels, what's shown or disabled, and automatic colors. */
export function refresh(): void {
  const s = readState();
  for (const [key, label] of Object.entries(LABELS) as [keyof EditorState, (v: unknown) => string][]) {
    byId(`${key}Out`).textContent = label(s[key]);
  }
  byId('pencilFields').hidden = s.lineStyle !== 'pencil';
  byId<HTMLFieldSetElement>('legendFields').disabled = !s.legendShow;
  byId('mapFields').hidden = s.underlay !== 'map';
  byId('distanceFields').hidden = s.underlay !== 'distance';
  byId('underlayStrengthField').hidden = s.underlay === 'none';
  byId('mapCustom').hidden = s.mapPlace !== 'custom';
  // Squashing would pull routes off the streets they ran on.
  field('squash').disabled = s.underlay === 'map';
  for (const key of KEYS) {
    if (CONTROLS[key] !== 'autoColor') continue;
    if (!chosen[key]) field(key).value = inkFor(s.background);
    byId(`${key}Auto`).hidden = !chosen[key];
  }
}

/** The setting a control element belongs to, if any. */
function settingOf(target: HTMLElement): keyof EditorState | null {
  const holder = target.closest<HTMLElement>('[id]');
  const id = target.id in CONTROLS ? target.id : (holder?.id ?? '');
  return id in CONTROLS ? (id as keyof EditorState) : null;
}

/** Calls onChange with the setting's name whenever someone changes a control. */
export function watchControls(root: HTMLElement, onChange: (key: keyof EditorState) => void): void {
  root.addEventListener('input', (e) => {
    const key = settingOf(e.target as HTMLElement);
    if (!key) return;
    if (CONTROLS[key] === 'autoColor') chosen[key] = true;
    refresh();
    onChange(key);
  });
  for (const key of KEYS) {
    if (CONTROLS[key] !== 'autoColor') continue;
    byId(`${key}Auto`).addEventListener('click', () => {
      chosen[key] = false;
      refresh();
      onChange(key);
    });
  }
}
