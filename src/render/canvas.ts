/** Common print shapes, as long side ÷ short side. */
export const ASPECTS = {
  '1:1': 1,
  '5:4': 5 / 4, // 8×10, 16×20 in; 40×50 cm
  '4:3': 4 / 3, // 18×24 in; 30×40 cm
  '7:5': 7 / 5, // 5×7 in; 50×70 cm
  'iso': Math.SQRT2, // A4, A3, A2
  '3:2': 3 / 2, // 12×18, 24×36 in
  '16:9': 16 / 9, // screens
} as const;

export type Aspect = keyof typeof ASPECTS;
export type Orientation = 'landscape' | 'portrait';

/** Every image is 1200 px on its short side, so text and line sizes look the same across shapes. */
const SHORT_SIDE = 1200;

export function canvasSize(aspect: Aspect, orientation: Orientation): { width: number; height: number } {
  const long = Math.round(SHORT_SIDE * ASPECTS[aspect]);
  return orientation === 'landscape' ? { width: long, height: SHORT_SIDE } : { width: SHORT_SIDE, height: long };
}
