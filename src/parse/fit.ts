import type { Track } from '../core/types';

/**
 * A minimal reader for FIT files, the binary format Garmin, Coros, Wahoo and
 * most watches record (and most of what's in a Strava download). It reads only
 * what drawing needs: time, position and speed from each "record" message,
 * and the sport from the "session" message. Everything else is skipped by
 * size, including developer fields.
 *
 * Format: https://developer.garmin.com/fit/protocol/
 */

export interface FitActivity {
  track: Track;
  /** FIT sport code from the session message (1 running, 11 walking, 17 hiking…), or null. */
  sport: number | null;
}

const RECORD = 20;
const SESSION = 18;
/** Seconds between the Unix epoch and FIT's (1989-12-31 00:00 UTC). */
const FIT_EPOCH_S = 631_065_600;
const SEMICIRCLE_DEG = 180 / 2 ** 31;

interface Definition {
  global: number;
  littleEndian: boolean;
  fields: { num: number; size: number }[];
  /** Total size of developer fields, skipped. */
  devSize: number;
  size: number;
}

export function parseFit(bytes: Uint8Array): FitActivity {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const t: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const speed: number[] = [];
  let sport: number | null = null;

  // A file can hold several FIT files one after another ("chained").
  let at = 0;
  while (at + 12 <= bytes.length) {
    const headerSize = bytes[at]!;
    const dataSize = view.getUint32(at + 4, true);
    if (String.fromCharCode(...bytes.subarray(at + 8, at + 12)) !== '.FIT') {
      if (at === 0) throw new Error('not a FIT file');
      break;
    }
    const end = Math.min(bytes.length, at + headerSize + dataSize);
    let pos = at + headerSize;
    const defs: (Definition | undefined)[] = [];
    let lastTimestamp = 0; // FIT seconds, for compressed timestamps

    while (pos < end) {
      const header = bytes[pos++]!;
      let local: number;
      let compressedTime: number | null = null;
      if (header & 0x80) {
        // Compressed timestamp header: a data message whose time is a 5-bit offset.
        local = (header >> 5) & 0x03;
        const offset = header & 0x1f;
        compressedTime = lastTimestamp + ((offset - (lastTimestamp & 0x1f)) & 0x1f);
        lastTimestamp = compressedTime;
      } else if (header & 0x40) {
        // Definition message.
        local = header & 0x0f;
        const littleEndian = bytes[pos + 1] === 0;
        const global = view.getUint16(pos + 2, littleEndian);
        const count = bytes[pos + 4]!;
        pos += 5;
        const fields: { num: number; size: number }[] = [];
        for (let i = 0; i < count; i++, pos += 3) fields.push({ num: bytes[pos]!, size: bytes[pos + 1]! });
        let devSize = 0;
        if (header & 0x20) {
          const devCount = bytes[pos++]!;
          for (let i = 0; i < devCount; i++, pos += 3) devSize += bytes[pos + 1]!;
        }
        const size = fields.reduce((s, f) => s + f.size, 0) + devSize;
        defs[local] = { global, littleEndian, fields, devSize, size };
        continue;
      } else {
        local = header & 0x0f;
      }

      const def = defs[local];
      if (!def) throw new Error('FIT data message without a definition');
      if (def.global === RECORD || def.global === SESSION || def.fields.some((f) => f.num === 253)) {
        let p = pos;
        let ts: number | null = compressedTime;
        let pLat = NaN;
        let pLon = NaN;
        let pSpeed = NaN;
        for (const f of def.fields) {
          if (f.num === 253 && f.size === 4) {
            const v = view.getUint32(p, def.littleEndian);
            if (v !== 0xffffffff) ts = lastTimestamp = v;
          } else if (def.global === RECORD) {
            if ((f.num === 0 || f.num === 1) && f.size === 4) {
              const v = view.getInt32(p, def.littleEndian);
              if (v !== 0x7fffffff) {
                if (f.num === 0) pLat = v * SEMICIRCLE_DEG;
                else pLon = v * SEMICIRCLE_DEG;
              }
            } else if (f.num === 73 && f.size === 4) {
              const v = view.getUint32(p, def.littleEndian);
              if (v !== 0xffffffff) pSpeed = v / 1000;
            } else if (f.num === 6 && f.size === 2 && Number.isNaN(pSpeed)) {
              const v = view.getUint16(p, def.littleEndian);
              if (v !== 0xffff) pSpeed = v / 1000;
            }
          } else if (def.global === SESSION && f.num === 5 && f.size === 1 && sport === null) {
            const v = bytes[p]!;
            if (v !== 0xff) sport = v;
          }
          p += f.size;
        }
        if (def.global === RECORD && ts !== null && Number.isFinite(pLat) && Number.isFinite(pLon)) {
          t.push((ts + FIT_EPOCH_S) * 1000);
          lat.push(pLat);
          lon.push(pLon);
          speed.push(pSpeed);
        }
      }
      pos += def.size;
    }
    // Skip the 2-byte file CRC.
    at = end + 2;
  }

  return {
    track: {
      t: Float64Array.from(t),
      lat: Float64Array.from(lat),
      lon: Float64Array.from(lon),
      speed: Float32Array.from(speed),
      hAcc: new Float32Array(t.length).fill(NaN),
    },
    sport,
  };
}
