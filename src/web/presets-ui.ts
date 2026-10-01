import { PRESETS, type Preset } from '../app/presets';
import { inkFor } from '../render/ink';

/** A tiny radiating web in the preset's colors, standing in for a thumbnail. */
function thumbnail({ look }: Preset): string {
  const spokes = [
    [30, 6], [52, 14], [56, 36], [50, 62], [34, 74], [12, 64], [6, 40], [10, 16],
    [42, 4], [58, 50], [22, 76], [4, 26],
  ] as const;
  const line = (x: number, y: number, color: string, width: number, opacity: number) =>
    `<path d="M30 40L${x} ${y}" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
  const outer = spokes.map(([x, y]) => line(x, y, look.colorA, 1, 0.9)).join('');
  const inner = spokes.slice(0, 8).map(([x, y]) => line(30 + (x - 30) * 0.45, 40 + (y - 40) * 0.45, look.colorB, 2, 1)).join('');
  const textY = look.legendPosition.startsWith('top') ? 8 : 70;
  const textX = look.legendPosition.endsWith('left') ? 8 : look.legendPosition.endsWith('right') ? 32 : 20;
  return `<svg viewBox="0 0 60 80" aria-hidden="true"><rect width="60" height="80" fill="${look.background}"/>
<g fill="none" stroke-linecap="round"${look.lineStyle === 'pencil' ? ' stroke-dasharray="3 1"' : ''}>${outer}${inner}</g>
<rect x="${textX}" y="${textY}" width="20" height="3" fill="${inkFor(look.background)}" opacity="0.8"/></svg>`;
}

/**
 * Builds a card per preset; returns a function that marks the active one (null
 * for custom). The cards behave as one radio group: one Tab stop, arrow keys
 * move between them and pick.
 */
export function presetCards(container: HTMLElement, onPick: (p: Preset) => void): (id: string | null) => void {
  const cards = PRESETS.map((p) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'preset-card';
    card.dataset.id = p.id;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-label', `${p.name}: ${p.description}`);
    card.title = p.description;
    card.innerHTML = `${thumbnail(p)}<span>${p.name}</span>`;
    card.addEventListener('click', () => onPick(p));
    container.append(card);
    return card;
  });
  container.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const at = cards.indexOf(document.activeElement as HTMLButtonElement);
    const next = (Math.max(0, at) + step + cards.length) % cards.length;
    cards[next]!.focus();
    onPick(PRESETS[next]!);
  });
  return (id) => {
    const active = Math.max(0, cards.findIndex((c) => c.dataset.id === id));
    cards.forEach((card, i) => {
      card.setAttribute('aria-checked', String(card.dataset.id === id));
      // With no preset chosen (custom), the first card takes the Tab stop.
      card.tabIndex = i === active ? 0 : -1;
    });
  };
}
