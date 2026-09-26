import { METERS_PER_DEG_LAT, trackFromPoints, type TrackPoint } from '../core/track';
import type { ActivityType, Workout } from '../core/types';

/**
 * Generates made-up walks and runs on a fictional street grid, so the project
 * can be developed, tested and demoed without anyone's real location data.
 */
export function syntheticWorkouts(count = 300, seed = 7): Workout[] {
  const rand = mulberry32(seed);
  const bases = [
    { lat: 40.0, lon: -100.0, weight: 0.75, block: 110, angle: 0.12 }, // home
    { lat: 40.02, lon: -100.05, weight: 0.15, block: 90, angle: -0.3 }, // near work
    { lat: 34.0, lon: -80.0, weight: 0.1, block: 140, angle: 0.5 }, // trips away
  ];
  // Favourite routes replay the same turns every time; they become the hot streets.
  const favouriteSeeds = [1, 2, 3, 4].map((i) => seed * 100 + i);

  const workouts: Workout[] = [];
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < count; i++) {
    const r = rand();
    const base = r < bases[0]!.weight ? bases[0]! : r < bases[0]!.weight + bases[1]!.weight ? bases[1]! : bases[2]!;
    const type: ActivityType = rand() < 0.55 ? 'running' : rand() < 0.85 ? 'walking' : 'hiking';
    const onFavourite = base === bases[0] && rand() < 0.5;
    const routeRand = onFavourite
      ? mulberry32(favouriteSeeds[Math.floor(rand() * favouriteSeeds.length)]!)
      : rand;
    const start = t0 + Math.floor(rand() * 600) * 86_400_000 + (6 + Math.floor(rand() * 13)) * 3_600_000;

    const distanceM =
      type === 'running' ? 3000 + routeRand() * 12000 : type === 'walking' ? 1500 + routeRand() * 4000 : 4000 + routeRand() * 10000;
    const baseSpeed = type === 'running' ? 2.6 + rand() * 1.2 : type === 'walking' ? 1.2 + rand() * 0.4 : 1.0 + rand() * 0.5;

    const path = gridWalk(routeRand, distanceM, base.block, base.angle);
    const points = sample(path, baseSpeed, start, base.lat, base.lon, rand);
    const last = points[points.length - 1]!;
    workouts.push({
      id: `${type}-${start}`,
      type,
      start,
      end: last.t,
      distanceM,
      indoor: false,
      track: trackFromPoints(points),
    });
  }
  return workouts.sort((a, b) => a.start - b.start);
}

/**
 * A route along a street grid in meters from home: heads out with random turns
 * at intersections, then steers back home for the second half.
 */
function gridWalk(rand: () => number, distanceM: number, block: number, angle: number): [number, number][] {
  const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let d = Math.floor(rand() * 4);
  let gx = 0, gy = 0;
  const nodes: [number, number][] = [[0, 0]];
  const blocks = Math.max(4, Math.round(distanceM / block));
  for (let b = 0; b < blocks; b++) {
    const returning = b >= blocks / 2;
    if (returning) {
      const remaining = blocks - b;
      if (Math.abs(gx) + Math.abs(gy) >= remaining - 1) {
        // Head straight for home along the longer axis.
        d = Math.abs(gx) >= Math.abs(gy) ? (gx > 0 ? 2 : 0) : gy > 0 ? 3 : 1;
      } else if (rand() < 0.3) d = (d + (rand() < 0.5 ? 1 : 3)) % 4;
    } else if (rand() < 0.3) {
      d = (d + (rand() < 0.5 ? 1 : 3)) % 4;
    }
    if (gx === 0 && gy === 0 && returning) break;
    gx += dirs[d]![0];
    gy += dirs[d]![1];
    nodes.push([gx, gy]);
  }
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return nodes.map(([x, y]) => [(x * cos - y * sin) * block, (x * sin + y * cos) * block]);
}

/** Walks the path at a varying speed, recording a noisy GPS point every second. */
function sample(
  path: [number, number][],
  baseSpeed: number,
  start: number,
  lat0: number,
  lon0: number,
  rand: () => number,
): TrackPoint[] {
  const mPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const phase = rand() * Math.PI * 2;
  const points: TrackPoint[] = [];
  let t = 0;
  let seg = 0;
  let along = 0;
  // GPS error drifts slowly rather than jumping around on every fix.
  let ex = 0, ey = 0;
  while (seg < path.length - 1) {
    const [ax, ay] = path[seg]!;
    const [bx, by] = path[seg + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (along >= len) { along -= len; seg++; continue; }
    const f = along / len;
    // Warm-up: the first few fixes are inaccurate and wander.
    const warm = t < 6;
    ex = ex * 0.95 + gauss(rand) * 0.6;
    ey = ey * 0.95 + gauss(rand) * 0.6;
    const x = ax + (bx - ax) * f + ex + (warm ? gauss(rand) * 25 : 0);
    const y = ay + (by - ay) * f + ey + (warm ? gauss(rand) * 25 : 0);
    const speed = baseSpeed * (1 + 0.15 * Math.sin(t / 240 + phase) + 0.05 * gauss(rand));
    points.push({
      t: start + t * 1000,
      lat: lat0 + y / METERS_PER_DEG_LAT,
      lon: lon0 + x / mPerDegLon,
      speed,
      hAcc: warm ? 30 : 3 + rand() * 4,
    });
    along += speed;
    t++;
  }
  return points;
}

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return next;
}

