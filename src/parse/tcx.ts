import type { Track } from '../core/types';

/**
 * Parses a TCX file (Garmin's older XML format, found in some Strava
 * downloads): one <Trackpoint> per fix with <Time> and <Position>. Like the
 * GPX reader, it scans for points directly rather than running a general XML
 * parser. Points without a time or position (pauses) are dropped.
 */
export function parseTcx(xml: string): Track {
  const t: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  let from = 0;
  for (;;) {
    const start = xml.indexOf('<Trackpoint', from);
    if (start < 0) break;
    const end = xml.indexOf('</Trackpoint>', start);
    if (end < 0) break;
    from = end + 1;
    const body = xml.slice(start, end);
    const pT = Date.parse(text(body, 'Time') ?? '');
    const pLat = Number(text(body, 'LatitudeDegrees') ?? NaN);
    const pLon = Number(text(body, 'LongitudeDegrees') ?? NaN);
    if (!Number.isFinite(pT) || !Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
    t.push(pT);
    lat.push(pLat);
    lon.push(pLon);
  }
  return {
    t: Float64Array.from(t),
    lat: Float64Array.from(lat),
    lon: Float64Array.from(lon),
    speed: new Float32Array(t.length).fill(NaN),
    hAcc: new Float32Array(t.length).fill(NaN),
  };
}

/** Text of the first `<name>…</name>` (any namespace prefix is not expected on these). */
function text(body: string, name: string): string | null {
  const open = `<${name}>`;
  const at = body.indexOf(open);
  if (at < 0) return null;
  const valueStart = at + open.length;
  return body.slice(valueStart, body.indexOf('<', valueStart)).trim();
}
