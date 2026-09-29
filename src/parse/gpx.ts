import type { Track } from '../core/types';

/**
 * Parses a GPX route file as written by Apple Health: one <trkpt lat lon> per
 * fix, with <time> and, in <extensions>, <speed> (m/s) and <hAcc> (meters).
 *
 * Route files make up most of an export, so this scans for points directly
 * instead of running a general XML parser, which was over half the load time.
 * It only relies on what GPX guarantees: the lat/lon attributes (in any
 * order) and simple child elements. Missing values become NaN; points without
 * a valid time or position are dropped.
 */
export function parseGpx(xml: string): Track {
  const t: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const speed: number[] = [];
  const hAcc: number[] = [];

  let from = 0;
  for (;;) {
    const start = xml.indexOf('<trkpt', from);
    if (start < 0) break;
    const openEnd = xml.indexOf('>', start);
    if (openEnd < 0) break;
    const selfClosing = xml.charCodeAt(openEnd - 1) === 47; // "/>"
    const end = selfClosing ? openEnd : xml.indexOf('</trkpt>', openEnd);
    if (end < 0) break;
    from = end + 1;

    // Searching within this point only keeps a missing element from scanning the rest of the file.
    const open = xml.slice(start, openEnd);
    const body = selfClosing ? '' : xml.slice(openEnd, end);
    const pLat = attribute(open, 'lat');
    const pLon = attribute(open, 'lon');
    const pT = Date.parse(element(body, 'time') ?? '');
    if (!Number.isFinite(pLat) || !Number.isFinite(pLon) || !Number.isFinite(pT)) continue;
    t.push(pT);
    lat.push(pLat);
    lon.push(pLon);
    speed.push(Number(element(body, 'speed') ?? NaN));
    hAcc.push(Number(element(body, 'hAcc') ?? NaN));
  }

  // Fixes are almost always in time order already; sort only when they aren't.
  let order: number[] | null = null;
  for (let i = 1; i < t.length; i++) {
    if (t[i]! < t[i - 1]!) {
      order = t.map((_, k) => k).sort((a, b) => t[a]! - t[b]!);
      break;
    }
  }
  const pick = (values: number[]) => (order ? order.map((k) => values[k]!) : values);
  return {
    t: Float64Array.from(pick(t)),
    lat: Float64Array.from(pick(lat)),
    lon: Float64Array.from(pick(lon)),
    speed: Float32Array.from(pick(speed)),
    hAcc: Float32Array.from(pick(hAcc)),
  };
}

/** Numeric value of `name="…"` (or single quotes) in an opening tag. */
function attribute(tag: string, name: string): number {
  let at = tag.indexOf(`${name}=`);
  // Skip matches inside a longer name (e.g. "xlat=").
  while (at > 0 && tag.charCodeAt(at - 1) > 32) at = tag.indexOf(`${name}=`, at + 1);
  if (at < 0) return NaN;
  const quote = tag[at + name.length + 1];
  const valueStart = at + name.length + 2;
  return Number(tag.slice(valueStart, tag.indexOf(quote!, valueStart)));
}

/** Text of the first `<name>…</name>` in a point's body, or null. */
function element(body: string, name: string): string | null {
  const open = `<${name}>`;
  const at = body.indexOf(open);
  if (at < 0) return null;
  const valueStart = at + open.length;
  return body.slice(valueStart, body.indexOf('<', valueStart));
}
