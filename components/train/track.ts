import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

import { stations } from "@/data";

import { CROSS_LEN, DECK, K } from "./constants";
import { TRACK_RAW } from "./trackData";

/** The city rises gently to the south-east like the real one. */
export const groundAt = (x: number, z: number): number => Math.max(0, 0.014 * z + 0.004 * x);

export const UP = new Vector3(0, 1, 0);

// Smooth the surveyed points (OSM nodes jitter by a metre or two, which the cars would otherwise rock over):
// three in-place passes of a 1-2-3-2-1 kernel, then a 64-unit straight lead-in before Waterfront.
const TRACK: [number, number][] = TRACK_RAW.map(([x, z]) => [x, z]);
for (let pass = 0; pass < 3; pass++) {
  for (let i = 2; i < TRACK.length - 2; i++) {
    TRACK[i] = [0, 1].map(
      (k) => (TRACK[i - 2][k] + 2 * TRACK[i - 1][k] + 3 * TRACK[i][k] + 2 * TRACK[i + 1][k] + TRACK[i + 2][k]) / 9,
    ) as [number, number];
  }
}
{
  const [a, b] = [TRACK[0], TRACK[1]];
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  const L = Math.hypot(dx, dz);
  for (let i = 1; i <= 16; i++) TRACK.unshift([a[0] + (dx / L) * 4 * i, a[1] + (dz / L) * 4 * i]);
}

export const controlPoints: Vector3[] = TRACK.map(([x, z]) => new Vector3(x, groundAt(x, z) + DECK, z));
export const curve = new CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
curve.arcLengthDivisions = 6000;
export const LEN = curve.getLength();
export const S_MAX = LEN - 6;

export type Frame = { p: Vector3; t: Vector3; r: Vector3 };
export const makeFrame = (): Frame => ({ p: new Vector3(), t: new Vector3(), r: new Vector3() });

/** Position, unit tangent and right vector at arc length s, optionally offset laterally. */
export function frameAt(s: number, out: Frame, lat = 0): Frame {
  const u = MathUtils.clamp(s / LEN, 0, 1);
  curve.getPointAt(u, out.p);
  curve.getTangentAt(u, out.t).normalize();
  out.r.crossVectors(out.t, UP).normalize();
  if (lat) out.p.addScaledVector(out.r, lat);
  return out;
}

export const SAMPLES = 1600;
export const samples: Frame[] = [];
for (let i = 0; i <= SAMPLES; i++) {
  const f = makeFrame();
  frameAt((i / SAMPLES) * LEN, f);
  samples.push(f);
}
const coarse = samples.filter((_, i) => i % 4 === 0);

/** Horizontal distance from (x, z) to the nearest coarse track sample. */
export function trackDist(x: number, z: number): number {
  let best = 1e9;
  for (const f of coarse) {
    const dx = f.p.x - x;
    const dz = f.p.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function trackNearest(x: number, z: number): Frame {
  let best = 1e9;
  let bf = coarse[0];
  for (const f of coarse) {
    const dx = f.p.x - x;
    const dz = f.p.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bf = f;
    }
  }
  return bf;
}

/** Arc position of every station: the nearest curve sample to its mapped point. */
export const stationS: number[] = stations.map((st) => {
  const x = st.km[0] * K;
  const z = st.km[1] * K;
  let bi = 0;
  let bd = 1e9;
  samples.forEach((f, i) => {
    const d = (f.p.x - x) ** 2 + (f.p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return (bi / SAMPLES) * LEN;
});

export const STATION_XZ: [number, number][] = stations.map((st) => [st.km[0] * K, st.km[1] * K]);
export const nearStation = (x: number, z: number, r: number): boolean =>
  STATION_XZ.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < r);

/** Index of the station nearest to arc position s. */
export function nearestStation(s: number): number {
  let b = 0;
  for (let i = 1; i < stationS.length; i++) if (Math.abs(stationS[i] - s) < Math.abs(stationS[b] - s)) b = i;
  return b;
}

/**
 * Scissors crossovers: one in the lead-in before Waterfront and one 30 units beyond a station wherever the
 * diagonal clears the next platform by 8 units (the downtown stations sit too close together), plus the terminus.
 */
export const CROSSOVERS: number[] = [
  stationS[0] - 58,
  ...stationS.map((ss, i) =>
    i === stationS.length - 1 || stationS[i + 1] - 13 - (ss + 30 + CROSS_LEN) >= 8 ? ss + 30 : -1,
  ),
].filter((c0) => c0 >= 0 && c0 + CROSS_LEN <= LEN);

export const smoothstep01 = (u: number): number => {
  const c = MathUtils.clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};
