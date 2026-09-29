import { round1 } from './format';
import { inkFor } from './scale';

/** The product name as it appears on images. One place to change it. */
export const BRAND = 'stridemap';

/**
 * The small "made with" mark on downloaded images: how people who see a shared
 * image find the site. It sits in the bottom margin, on the side the scale
 * bar isn't, in small low-contrast type.
 */
export function renderMark(
  frame: { width: number; height: number; padding: number; background: string },
  side: 'left' | 'right',
): string {
  const fontSize = Math.round(Math.min(frame.width, frame.height) / 90);
  const x = side === 'left' ? frame.padding : frame.width - frame.padding;
  const y = frame.height - frame.padding / 2;
  return `<text class="mark" x="${round1(x)}" y="${round1(y)}" text-anchor="${side === 'left' ? 'start' : 'end'}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="${fontSize}" fill="${inkFor(frame.background)}" fill-opacity="0.45" letter-spacing="0.5">made with ${BRAND}</text>`;
}
