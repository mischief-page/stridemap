import { describe, expect, it } from 'vitest';
import { cleanTrack } from '../src/core/clean';
import { anchorTrack, compressRadially, fitBounds } from '../src/core/layout';
import { buildScene, prepareWorkouts, type Filters, type LayoutOptions } from '../src/core/pipeline';
import { METERS_PER_DEG_LAT, trackFromPoints, type TrackPoint } from '../src/core/track';
import { ACTIVITY_TYPES, type LocalTrack, type Workout } from '../src/core/types';
import { HeatGrid, paceSeries } from '../src/core/values';
import { DEFAULT_STYLE, renderSvg } from '../src/render/svg';
import { syntheticWorkouts } from '../src/sample/synthetic';

/** A straight line from (lat, lon) heading `bearing` degrees at `speed` m/s for `seconds`. */
function line(lat: number, lon: number, bearing: number, seconds: number, speed = 3): TrackPoint[] {
  const mPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const rad = (bearing * Math.PI) / 180;
  return Array.from({ length: seconds + 1 }, (_, s) => ({
    t: s * 1000,
    lat: lat + (Math.cos(rad) * speed * s) / METERS_PER_DEG_LAT,
    lon: lon + (Math.sin(rad) * speed * s) / mPerDegLon,
    speed,
    hAcc: 5,
  }));
}

describe('anchorTrack', () => {
  it('puts the start at the origin with north up and east right, in meters', () => {
    const north = anchorTrack(trackFromPoints(line(60, 10, 0, 100)));
    expect(north.x[100]).toBeCloseTo(0, 3);
    expect(north.y[100]).toBeCloseTo(300, 1);
    // Same distance east at a different latitude gives the same length.
    const east = anchorTrack(trackFromPoints(line(-5, 120, 90, 100)));
    expect(east.x[100]).toBeCloseTo(300, 0);
    expect(east.y[100]).toBeCloseTo(0, 3);
  });
});

describe('cleanTrack', () => {
  it('drops inaccurate warm-up fixes at the start', () => {
    const points = line(40, -100, 0, 20);
    points[0]!.hAcc = 40;
    points[1]!.hAcc = 20;
    const cleaned = cleanTrack(trackFromPoints(points));
    expect(cleaned.t[0]).toBe(2000);
  });

  it('drops GPS jumps', () => {
    const points = line(40, -100, 0, 20);
    points[10]!.lat += 0.01; // ~1 km jump in one second
    expect(cleanTrack(trackFromPoints(points)).t.length).toBe(20);
  });
});

describe('paceSeries', () => {
  it('converts speed to seconds per kilometer', () => {
    const pace = paceSeries(trackFromPoints(line(40, -100, 0, 60, 4)));
    expect(pace[30]).toBeCloseTo(250);
  });
});

describe('HeatGrid', () => {
  it('counts the same street as hot even when workouts start in different places', () => {
    const heat = new HeatGrid();
    const street = line(40, -100, 90, 300);
    heat.add(trackFromPoints(street));
    // Two more workouts that start halfway along the street.
    heat.add(trackFromPoints(street.slice(150)));
    heat.add(trackFromPoints(street.slice(150)));
    // One on a different street.
    heat.add(trackFromPoints(line(40.01, -100, 90, 100)));
    const mid = street[200]!;
    const early = street[50]!;
    expect(heat.countAt(mid.lat, mid.lon)).toBe(3);
    expect(heat.countAt(early.lat, early.lon)).toBe(1);
  });

  it('counts each workout once per cell, however long it lingers', () => {
    const heat = new HeatGrid();
    const standing = line(40, -100, 0, 300, 0.01);
    heat.add(trackFromPoints(standing));
    expect(heat.countAt(40, -100)).toBe(1);
  });
});

describe('fitBounds', () => {
  const track = (maxX: number): LocalTrack => ({
    x: Float32Array.of(0, maxX),
    y: Float32Array.of(0, 10),
    value: Float32Array.of(0, 0),
    bbox: { minX: 0, maxX, minY: 0, maxY: 10 },
  });
  const tracks = [...Array.from({ length: 99 }, () => track(100)), track(10_000)];

  it('fits everything at 100', () => {
    expect(fitBounds(tracks, 100).maxX).toBe(10_000);
  });

  it('lets outliers run off the edge below 100', () => {
    expect(fitBounds(tracks, 95).maxX).toBe(100);
  });
});

describe('compressRadially', () => {
  it('keeps direction, shrinks distance and updates the extent', () => {
    const [t] = compressRadially(
      [{ x: Float32Array.of(300), y: Float32Array.of(400), value: Float32Array.of(0), bbox: { minX: 0, maxX: 300, minY: 0, maxY: 400 } }],
      0.5,
    );
    expect(Math.hypot(t!.x[0]!, t!.y[0]!)).toBeCloseTo(Math.sqrt(500), 4);
    expect(t!.y[0]! / t!.x[0]!).toBeCloseTo(4 / 3);
    expect(t!.bbox.maxY).toBeCloseTo(t!.y[0]!);
  });
});

describe('prepareWorkouts', () => {
  it('keeps outdoor workouts with GPS, with their shape, extent and distance', () => {
    const track = trackFromPoints(line(40, -100, 90, 100));
    const base = { type: 'running' as const, start: 0, end: 0, distanceM: null };
    const prepared = prepareWorkouts([
      { ...base, id: 'out', indoor: false, track },
      { ...base, id: 'in', indoor: true, track },
      { ...base, id: 'none', indoor: false, track: null },
    ]);
    expect(prepared.map((w) => w.id)).toEqual(['out']);
    expect(prepared[0]!.distanceM).toBeCloseTo(300, -1);
    expect(prepared[0]!.local.bbox.maxX).toBeCloseTo(300, 0);
  });

  it('gives workouts that share an id (same type, same start second) their own ids', () => {
    const [w] = syntheticWorkouts(1);
    const copy = { ...w!, track: { ...w!.track!, lat: w!.track!.lat.map((v) => v + 0.001) } };
    const prepared = prepareWorkouts([w!, copy]);
    expect(prepared.map((p) => p.id)).toEqual([w!.id, `${w!.id}#2`]);
    // Each keeps its own "how often" values, one per point.
    const scene = buildScene(prepared, { types: [...ACTIVITY_TYPES], from: null, to: null }, { colorMode: 'frequency', fitPercentile: 100, radialExponent: 1 });
    for (const t of scene.tracks) {
      expect(t.value.length).toBe(t.x.length);
      expect(Array.from(t.value).every(Number.isFinite)).toBe(true);
    }
  });
});

describe('buildScene + renderSvg', () => {
  const workouts: Workout[] = syntheticWorkouts(40);
  const filters: Filters = { types: [...ACTIVITY_TYPES], from: null, to: null };
  const layout: LayoutOptions = { colorMode: 'pace', fitPercentile: 95, radialExponent: 1 };

  it('renders every selected workout in both color modes', () => {
    for (const colorMode of ['pace', 'frequency'] as const) {
      const scene = buildScene(prepareWorkouts(workouts), filters, { ...layout, colorMode });
      expect(scene.workoutCount).toBe(40);
      const svg = renderSvg(scene, DEFAULT_STYLE);
      expect(svg).toMatch(/^<svg/);
      expect(svg).toContain('<path');
    }
  });

  it('applies type and date filters', () => {
    const runs = buildScene(prepareWorkouts(workouts), { ...filters, types: ['running'] }, layout);
    expect(runs.workoutCount).toBe(workouts.filter((w) => w.type === 'running').length);
    const none = buildScene(prepareWorkouts(workouts), { ...filters, from: Date.UTC(2030, 0, 1) }, layout);
    expect(none.workoutCount).toBe(0);
    expect(renderSvg(none, DEFAULT_STYLE)).toMatch(/^<svg/);
  });

  it('keeps real coordinates out of the output', () => {
    const svg = renderSvg(buildScene(prepareWorkouts(workouts), filters, layout), DEFAULT_STYLE);
    expect(svg).not.toMatch(/-100\.0|40\.0\d{3}/);
  });
});
