import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

import { stations } from "@/data";

import { CROSS_LEN, CUT, DECK, K } from "./constants";
import { addModifier, lerp, rectPad } from "./terrain";
import { TRACK_RAW } from "./trackData";
import { solveProfile } from "./trackProfile";

export { groundAt, inWater, slopeAt } from "./terrain";

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

export const STATION_XZ: [number, number][] = stations.map((st) => [st.km[0] * K, st.km[1] * K]);
const nearestPoint = ([sx, sz]: [number, number]) => TRACK.reduce((b, [x, z], i) => ((x - sx) ** 2 + (z - sz) ** 2 < (TRACK[b][0] - sx) ** 2 + (TRACK[b][1] - sz) ** 2 ? i : b), 0);
const stationIdx = STATION_XZ.map(nearestPoint);

// deck heights over the real terrain, with the Grandview Cut between Main Street and Commercial–Broadway
const iMain = stationIdx[stations.findIndex((s) => s.id === "mainstreet")];
const iComm = stationIdx[stations.findIndex((s) => s.id === "commercial")];
const sAt = (i: number) => { let s = 0; for (let k = 1; k <= i; k++) s += Math.hypot(TRACK[k][0] - TRACK[k - 1][0], TRACK[k][1] - TRACK[k - 1][1]); return s; };
export const profile = solveProfile(TRACK, stationIdx, sAt(iMain) + CUT.afterMain, sAt(iComm) + CUT.afterCommercial);

export const controlPoints: Vector3[] = TRACK.map(([x, z], i) => new Vector3(x, profile.y[i], z));
export const curve = new CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
curve.arcLengthDivisions = 6000;
export const LEN = curve.getLength();
export const S_MAX = LEN - 6;

export type Frame = { p: Vector3; t: Vector3; r: Vector3 };
export const makeFrame = (): Frame => ({ p: new Vector3(), t: new Vector3(), r: new Vector3() });

/** Position, unit tangent and right vector at arc length s, optionally offset laterally. The right vector stays horizontal. */
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

/** Deck height at arc length s. */
export const deckY = (s: number): number => samples[Math.round(MathUtils.clamp(s / LEN, 0, 1) * SAMPLES)].p.y;

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

// ---------------------------------------------------------------- ground the track asks for
// station pads: the ground under each station sits DECK below its level deck (or just under the girder in the cut)
{
  const f = makeFrame();
  for (const ss of stationS) {
    frameAt(ss, f);
    const tx = f.t.x / Math.hypot(f.t.x, f.t.z);
    const tz = f.t.z / Math.hypot(f.t.x, f.t.z);
    const inCut = profileCutAt(ss) > 0.5;
    addModifier(rectPad(f.p.x, f.p.z, tx, tz, 34, inCut ? 13 : 22, inCut ? 6 : 26, f.p.y - (inCut ? 2.4 : DECK)));
  }
}
// the Grandview Cut: a floor just under the girder within 14 units, wooded banks rising to floor + CUT.bank by 40, back to the DEM by 55
{
  const cutPts = samples
    .map((f, i) => ({ x: f.p.x, z: f.p.z, floor: f.p.y - 2.4, w: profileCutAt((i / SAMPLES) * LEN) }))
    .filter((p, i) => i % 3 === 0 && p.w > 0.01);
  if (cutPts.length) {
    const xs = cutPts.map((p) => p.x);
    const zs = cutPts.map((p) => p.z);
    const box = [Math.min(...xs) - 60, Math.max(...xs) + 60, Math.min(...zs) - 60, Math.max(...zs) + 60];
    addModifier((x, z, h) => {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) return h;
      let bd = 1e9;
      let bp = cutPts[0];
      for (const p of cutPts) {
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) {
          bd = d;
          bp = p;
        }
      }
      const lat = Math.sqrt(bd);
      if (lat > 55) return h;
      const t = Math.min(1, Math.max(0, (lat - 14) / 26));
      const target = bp.floor + CUT.bank * t * t * (3 - 2 * t);
      const fade = Math.min(1, Math.max(0, (lat - 40) / 15));
      return lerp(h, target, bp.w * (1 - fade * fade * (3 - 2 * fade)));
    });
  }
}
function profileCutAt(s: number): number {
  const ps = profile.s;
  const k = ps.findIndex((v) => v >= s);
  if (k <= 0) return profile.cut[Math.max(0, k)];
  const u = (s - ps[k - 1]) / (ps[k] - ps[k - 1]);
  return profile.cut[k - 1] + (profile.cut[k] - profile.cut[k - 1]) * u;
}
