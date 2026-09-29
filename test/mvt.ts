import { PbfWriter } from 'pbf';

// ── A tiny Mapbox Vector Tile, written by hand ────────────────────────────────

export type Geom = { type: 2 | 3; props: Record<string, string>; points: [number, number][] };

const zigzag = (n: number) => (n << 1) ^ (n >> 31);

/** Encodes one line or one ring as MVT commands (MoveTo, LineTo, ClosePath for polygons). */
function commands(g: Geom): number[] {
  const out: number[] = [];
  let cx = 0, cy = 0;
  g.points.forEach(([x, y], i) => {
    if (i === 0) out.push((1 << 3) | 1);
    else if (i === 1) out.push(((g.points.length - 1) << 3) | 2);
    out.push(zigzag(x - cx), zigzag(y - cy));
    cx = x; cy = y;
  });
  if (g.type === 3) out.push((1 << 3) | 7);
  return out;
}

export function makeTile(layers: Record<string, Geom[]>): ArrayBuffer {
  const pbf = new PbfWriter();
  for (const [name, features] of Object.entries(layers)) {
    pbf.writeMessage(3, (_: unknown, p: PbfWriter) => {
      p.writeVarintField(15, 2);
      p.writeStringField(1, name);
      const keys: string[] = [];
      const values: string[] = [];
      for (const f of features) {
        p.writeMessage(2, (__: unknown, fp: PbfWriter) => {
          const tags: number[] = [];
          for (const [k, v] of Object.entries(f.props)) {
            if (!keys.includes(k)) keys.push(k);
            if (!values.includes(v)) values.push(v);
            tags.push(keys.indexOf(k), values.indexOf(v));
          }
          fp.writePackedVarint(2, tags);
          fp.writeVarintField(3, f.type);
          fp.writePackedVarint(4, commands(f));
        }, null);
      }
      for (const k of keys) p.writeStringField(3, k);
      for (const v of values) p.writeMessage(4, (__: unknown, vp: PbfWriter) => vp.writeStringField(1, v), null);
      p.writeVarintField(5, 4096);
    }, null);
  }
  const bytes = pbf.finish();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

