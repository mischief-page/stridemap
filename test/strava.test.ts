import { Decoder, Stream } from '@garmin/fitsdk';
import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { fitFile, gpxFile, makeSampleStrava, tcxFile } from '../scripts/make-sample-strava';
import { prepareWorkouts } from '../src/core/pipeline';
import { parseCsv } from '../src/parse/csv';
import { parseFit } from '../src/parse/fit';
import { parseGpx } from '../src/parse/gpx';
import { readExport } from '../src/parse/import';
import { parseStravaDate } from '../src/parse/strava-export';
import { parseTcx } from '../src/parse/tcx';
import { syntheticWorkouts } from '../src/sample/synthetic';

const [sample] = syntheticWorkouts(1);
const track = sample!.track!;

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, line breaks in fields, CRLF and a byte-order mark', () => {
    const csv = '﻿a,b,c\r\n1,"x, y","say ""hi""\nthere"\r\n\r\n2,,last\n';
    expect(parseCsv(csv)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"\nthere'],
      ['2', '', 'last'],
    ]);
  });
});

describe('parseStravaDate', () => {
  it("reads Strava's dates as UTC", () => {
    expect(parseStravaDate('Aug 24, 2024, 10:47:26 AM')).toBe(Date.UTC(2024, 7, 24, 10, 47, 26));
    expect(parseStravaDate('Jan 3, 2025, 12:05:00 PM')).toBe(Date.UTC(2025, 0, 3, 12, 5, 0));
    expect(parseStravaDate('Jan 3, 2025, 12:05:00 AM')).toBe(Date.UTC(2025, 0, 3, 0, 5, 0));
    expect(parseStravaDate('3 janv. 2025, 12:05:00')).toBeNull();
  });
});

describe('parseFit', () => {
  it('matches Garmin’s own decoder on a file from Garmin’s encoder', () => {
    const bytes = fitFile(sample!);
    const ours = parseFit(bytes);
    const { messages } = new Decoder(Stream.fromByteArray(Array.from(bytes))).read();
    const records = messages.recordMesgs as { timestamp: Date; positionLat: number; positionLong: number }[];
    expect(ours.track.t.length).toBe(records.length);
    expect(ours.track.t.length).toBe(track.t.length);
    records.forEach((r, i) => {
      expect(ours.track.t[i]).toBe(r.timestamp.getTime());
      expect(ours.track.lat[i]).toBeCloseTo((r.positionLat * 180) / 2 ** 31, 9);
      expect(ours.track.lon[i]).toBeCloseTo((r.positionLong * 180) / 2 ** 31, 9);
    });
    // Within the ~1 cm precision of FIT's semicircles.
    expect(ours.track.lat[5]).toBeCloseTo(track.lat[5]!, 6);
    expect(ours.sport).toBe(sample!.type === 'running' ? 1 : sample!.type === 'walking' ? 11 : 17);
  });

  it('handles big-endian records, developer fields and compressed timestamps', () => {
    // A hand-built file: a big-endian record definition with a 2-byte developer
    // field (as a footpod adds), then a little-endian one without a timestamp,
    // used with compressed-timestamp headers.
    const out: number[] = [];
    const u32be = (v: number) => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
    const u32le = (v: number) => out.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
    const semis = (deg: number) => Math.round((deg * 2 ** 31) / 180) >>> 0;
    // Definition, local 0, developer flag: arch 1 (big endian), global 20, 3 fields, 1 dev field.
    out.push(0x40 | 0x20, 0, 1, 0, 20, 3, 253, 4, 0x86, 0, 4, 0x85, 1, 4, 0x85, 1, 7, 2, 0);
    const ts = 1_000_000_000; // FIT seconds
    out.push(0x00);
    u32be(ts);
    u32be(semis(41.9));
    u32be(semis(-87.65));
    out.push(0xab, 0xcd); // developer field
    // Definition, local 1: little endian, global 20, position only.
    out.push(0x41, 0, 0, 20, 0, 2, 0, 4, 0x85, 1, 4, 0x85);
    // Compressed timestamp headers for local 1, 3 s and then 30 s later (wrapping the 5-bit counter; a gap can be at most 31 s).
    for (const [offset, dLat] of [[(ts + 3) & 0x1f, 0.0001], [(ts + 33) & 0x1f, 0.0002]] as const) {
      out.push(0x80 | (1 << 5) | offset);
      u32le(semis(41.9 + dLat));
      u32le(semis(-87.65));
    }
    const data = Uint8Array.from(out);
    const file = new Uint8Array(12 + data.length + 2);
    file.set([12, 0x20, 0, 0], 0);
    new DataView(file.buffer).setUint32(4, data.length, true);
    file.set([46, 70, 73, 84], 8); // ".FIT"
    file.set(data, 12);

    const { track: t } = parseFit(file);
    const unix = (s: number) => (s + 631_065_600) * 1000;
    expect(Array.from(t.t)).toEqual([unix(ts), unix(ts + 3), unix(ts + 33)]);
    expect(t.lat[0]).toBeCloseTo(41.9, 6);
    expect(t.lat[2]).toBeCloseTo(41.9002, 6);
    expect(t.lon[1]).toBeCloseTo(-87.65, 6);
  });

  it('rejects files that aren’t FIT', () => {
    expect(() => parseFit(new TextEncoder().encode('<?xml version="1.0"?><gpx></gpx>'))).toThrow('not a FIT file');
  });
});

describe('Strava GPX and TCX', () => {
  it('reads Strava’s GPX (no speed or accuracy) and TCX (whitespace before the declaration)', () => {
    for (const parsed of [parseGpx(gpxFile(track)), parseTcx(tcxFile(track))]) {
      expect(parsed.t.length).toBe(track.t.length);
      expect(parsed.lat[10]).toBeCloseTo(track.lat[10]!, 9);
      expect(Math.abs(parsed.t[10]! - track.t[10]!)).toBeLessThan(1000);
      expect(Number.isNaN(parsed.hAcc[0])).toBe(true);
    }
  });
});

describe('readExport with a Strava download', () => {
  const path = 'out/test-strava-export.zip';
  beforeAll(() => makeSampleStrava(path, 12), 30_000);

  it('reads walks, runs and hikes from FIT, GPX and TCX, and skips everything else', async () => {
    const workouts = await readExport(new Blob([await readFile(path)]));
    const expected = syntheticWorkouts(12);
    expect(workouts).toHaveLength(12);
    expect(workouts.map((w) => w.type)).toEqual(expected.map((w) => w.type));
    workouts.forEach((w, i) => {
      expect(w.id).toMatch(/^strava-\d+$/);
      expect(w.indoor).toBe(false);
      expect(w.track!.t.length).toBe(expected[i]!.track!.t.length);
      expect(Math.abs(w.start - expected[i]!.start)).toBeLessThan(1000);
    });
    // They go through the same pipeline as Apple Health workouts.
    expect(prepareWorkouts(workouts)).toHaveLength(12);
  });

  it('reads the sport from FIT files when the export is in another language', async () => {
    const w = sample!;
    const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
    const csv = 'ID d’activité,Date de l’activité,Type d’activité,Nom du fichier\n1,"24 août 2024, 10:47:26",Course à pied,activities/1.fit.gz\n2,"24 août 2024, 11:47:26",Vélo,activities/2.gpx\n';
    await zip.add('activities.csv', new Uint8ArrayReader(new TextEncoder().encode(csv)));
    await zip.add('activities/1.fit.gz', new Uint8ArrayReader(new Uint8Array(gzipSync(fitFile(w)))));
    await zip.add('activities/2.gpx', new Uint8ArrayReader(new TextEncoder().encode(gpxFile(w.track!))));
    const workouts = await readExport(await zip.close());
    // The FIT file says what sport it is; the GPX file doesn't, so it's left out.
    expect(workouts.map((x) => x.type)).toEqual([w.type]);
  });

  it('explains when a zip is neither kind of export', async () => {
    const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
    await zip.add('notes.txt', new Uint8ArrayReader(new TextEncoder().encode('hi')));
    await expect(readExport(await zip.close())).rejects.toThrow('Apple Health export or a Strava download');
  });
});
