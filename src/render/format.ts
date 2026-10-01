/** Rounds to one decimal place: a tenth of a pixel is finer than any screen or print shows. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Rounds to two decimals, for opacities. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
