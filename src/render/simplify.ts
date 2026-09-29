/**
 * Ramer–Douglas–Peucker line simplification. Returns the indices of the points
 * to keep so that the line never moves more than `tolerance` pixels.
 */
export function simplify(x: Float64Array, y: Float64Array, tolerance: number): number[] {
  const n = x.length;
  if (n < 3) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = tol2;
    for (let i = a + 1; i < b; i++) {
      let px = x[i]! - x[a]!;
      let py = y[i]! - y[a]!;
      if (len2 > 0) {
        const f = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        px -= f * dx;
        py -= f * dy;
      }
      const d = px * px + py * py;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
