import { describe, expect, it } from 'vitest';
import { ExportXmlParser, parseHealthDate } from '../src/parse/export-xml';
import { parseGpx } from '../src/parse/gpx';
import { readExport } from '../src/parse/import';
import { buildExportZip, EXPORT_XML, ROUTE_GPX } from './fixtures';

describe('parseHealthDate', () => {
  it('reads the Health export format with its UTC offset', () => {
    expect(parseHealthDate('2026-08-01 07:00:00 -0700')).toBe(Date.UTC(2026, 7, 1, 14));
  });
});

describe('ExportXmlParser', () => {
  it('keeps walks and runs, in both the old and new XML layouts', () => {
    const parser = new ExportXmlParser();
    // Feed it in small chunks, as the streaming zip reader does.
    for (let i = 0; i < EXPORT_XML.length; i += 37) parser.write(EXPORT_XML.slice(i, i + 37));
    const [run, walk, indoor, ...rest] = parser.close();

    expect(rest).toHaveLength(0); // cycling is skipped
    expect(run).toMatchObject({
      type: 'running',
      distanceM: 5200,
      indoor: false,
      routePath: '/workout-routes/route_2026-08-01_7.00am.gpx',
    });
    expect(walk!.type).toBe('walking');
    expect(walk!.distanceM).toBeCloseTo(1770.3, 1);
    expect(walk!.routePath).toBeNull();
    expect(indoor!.indoor).toBe(true);
  });
});

describe('parseGpx', () => {
  it('reads time, position, speed and accuracy', () => {
    const track = parseGpx(ROUTE_GPX);
    expect(track.t.length).toBe(3);
    expect(track.t[0]).toBe(Date.UTC(2026, 7, 1, 14));
    expect(track.lat[2]).toBeCloseTo(40.000054);
    expect(track.speed[2]).toBeCloseTo(3.1);
    expect(track.hAcc[2]).toBeCloseTo(4.5);
  });
});

describe('readExport', () => {
  it('reads workouts and their routes from the zip', async () => {
    const workouts = await readExport(await buildExportZip());
    expect(workouts.map((w) => w.type)).toEqual(['running', 'walking', 'running']);
    expect(workouts[0]!.track?.t.length).toBe(3);
    expect(workouts[1]!.track).toBeNull();
  });
});

describe('parseGpx edge cases', () => {
  const pt = (attrs: string, body: string) => `<trkpt ${attrs}>${body}</trkpt>`;
  const gpx = (...points: string[]) => `<?xml version="1.0"?><gpx><trk><trkseg>\n${points.join('\n')}\n</trkseg></trk></gpx>`;

  it('reads lon before lat, single quotes, and newlines between attributes', () => {
    const track = parseGpx(gpx(`<trkpt lon='-100.5'\n  lat='40.25'><time>2026-08-01T14:00:00Z</time></trkpt>`));
    expect(track.lat[0]).toBe(40.25);
    expect(track.lon[0]).toBe(-100.5);
  });

  it('leaves missing speed and accuracy as NaN', () => {
    const track = parseGpx(gpx(pt('lat="40" lon="-100"', '<time>2026-08-01T14:00:00Z</time>')));
    expect(track.speed[0]).toBeNaN();
    expect(track.hAcc[0]).toBeNaN();
  });

  it('drops points without a valid time or position, including self-closing ones', () => {
    const track = parseGpx(
      gpx(
        pt('lat="40" lon="-100"', '<time>2026-08-01T14:00:00Z</time>'),
        '<trkpt lat="40" lon="-100"/>',
        pt('lat="nope" lon="-100"', '<time>2026-08-01T14:00:01Z</time>'),
        pt('lat="40" lon="-100"', '<ele>3</ele>'),
      ),
    );
    expect(track.t.length).toBe(1);
  });

  it('puts out-of-order fixes back in time order', () => {
    const track = parseGpx(
      gpx(
        pt('lat="2" lon="0"', '<time>2026-08-01T14:00:02Z</time><extensions><speed>2</speed></extensions>'),
        pt('lat="1" lon="0"', '<time>2026-08-01T14:00:01Z</time><extensions><speed>1</speed></extensions>'),
      ),
    );
    expect([...track.lat]).toEqual([1, 2]);
    expect([...track.speed]).toEqual([1, 2]);
  });
});
