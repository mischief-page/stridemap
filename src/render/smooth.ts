export interface Polyline {
  x: Float64Array;
  y: Float64Array;
  /** Color value per point. */
  value: Float64Array;
}

/**
 * Gaussian smoothing along the line's length, in screen pixels. `sigma` is the
 * blur radius: sharp corners become arcs about that size and GPS wobble
 * disappears.
 *
 * The line is first resampled at an even spacing so the blur is the same
 * however densely the GPS recorded, and so the kernel stays short enough to
 * redraw live. Near each end the window shrinks symmetrically, which keeps the
 * first point exactly on the anchor and stops the ends being pulled inward.
 */
export function smoothPolyline(line: Polyline, sigma: number): Polyline {
  const n = line.x.length;
  if (sigma <= 0 || n < 3) return line;

  const step = Math.max(0.5, sigma / 4);
  const even = resample(line, step);
  const m = even.x.length;
  const radius = Math.ceil((3 * sigma) / step);
  const weights = Float64Array.from({ length: radius + 1 }, (_, k) => Math.exp(-((k * step) ** 2) / (2 * sigma * sigma)));

  const x = new Float64Array(m);
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const k = Math.min(radius, i, m - 1 - i);
    let sx = even.x[i]! * weights[0]!;
    let sy = even.y[i]! * weights[0]!;
    let sw = weights[0]!;
    for (let j = 1; j <= k; j++) {
      const w = weights[j]!;
      sx += (even.x[i - j]! + even.x[i + j]!) * w;
      sy += (even.y[i - j]! + even.y[i + j]!) * w;
      sw += 2 * w;
    }
    x[i] = sx / sw;
    y[i] = sy / sw;
  }
  return { x, y, value: even.value };
}

/** Points every `step` pixels along the line; each takes the value of the segment it falls on. */
function resample(line: Polyline, step: number): Polyline {
  const xs: number[] = [line.x[0]!];
  const ys: number[] = [line.y[0]!];
  const vs: number[] = [line.value[0]!];
  let carried = 0; // distance travelled since the last emitted point
  for (let i = 1; i < line.x.length; i++) {
    const ax = line.x[i - 1]!, ay = line.y[i - 1]!;
    const dx = line.x[i]! - ax, dy = line.y[i]! - ay;
    const len = Math.hypot(dx, dy);
    let at = step - carried;
    while (at <= len) {
      xs.push(ax + (dx * at) / len);
      ys.push(ay + (dy * at) / len);
      vs.push(line.value[i]!);
      at += step;
    }
    carried = len - (at - step);
  }
  const last = line.x.length - 1;
  if (carried > 0) {
    xs.push(line.x[last]!);
    ys.push(line.y[last]!);
    vs.push(line.value[last]!);
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), value: Float64Array.from(vs) };
}

/**
 * The cubic Bézier control points for the segment from point `i` to `j` of a
 * Catmull–Rom curve through `keep`, so the drawn curve passes through every
 * kept point and stays smooth across color changes.
 */
export function catmullRomControls(
  x: Float64Array,
  y: Float64Array,
  keep: number[],
  k: number,
): [number, number, number, number] {
  const p0 = keep[Math.max(0, k - 2)]!;
  const p1 = keep[k - 1]!;
  const p2 = keep[k]!;
  const p3 = keep[Math.min(keep.length - 1, k + 1)]!;
  return [
    x[p1]! + (x[p2]! - x[p0]!) / 6,
    y[p1]! + (y[p2]! - y[p0]!) / 6,
    x[p2]! - (x[p3]! - x[p1]!) / 6,
    y[p2]! - (y[p3]! - y[p1]!) / 6,
  ];
}
