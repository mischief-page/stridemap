import { SaxesParser } from 'saxes';
import { trackFromPoints, type TrackPoint } from '../core/track';
import type { Track } from '../core/types';

/**
 * Parses a GPX route file as written by Apple Health. Each <trkpt> carries
 * <time> and, in <extensions>, <speed> (m/s) and <hAcc> (meters).
 */
export function parseGpx(xml: string): Track {
  const parser = new SaxesParser();
  const points: TrackPoint[] = [];
  let point: TrackPoint | null = null;
  let text = '';

  parser.on('opentag', (node) => {
    text = '';
    if (node.name === 'trkpt') {
      const attrs = node.attributes as Record<string, string>;
      point = { t: NaN, lat: Number(attrs.lat), lon: Number(attrs.lon) };
    }
  });
  parser.on('text', (t) => {
    text += t;
  });
  parser.on('closetag', (node) => {
    if (!point) return;
    switch (localName(node.name)) {
      case 'time':
        point.t = Date.parse(text.trim());
        break;
      case 'speed':
        point.speed = Number(text);
        break;
      case 'hAcc':
        point.hAcc = Number(text);
        break;
      case 'trkpt':
        if (Number.isFinite(point.t) && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
          points.push(point);
        }
        point = null;
        break;
    }
  });

  parser.write(xml).close();
  points.sort((a, b) => a.t - b.t);
  return trackFromPoints(points);
}

function localName(name: string): string {
  const i = name.indexOf(':');
  return i === -1 ? name : name.slice(i + 1);
}
