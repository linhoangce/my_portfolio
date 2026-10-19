import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

import { stations } from "@/data";

import { CROSS_LEN, CUT, DECK, K, LANE } from "./constants";
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

// deck heights over the real terrain, with the Grandview Cut from Clark Drive to past 29th Avenue
const iMain = stationIdx[stations.findIndex((s) => s.id === "mainstreet")];
const i29 = stationIdx[stations.findIndex((s) => s.id === "29th")];
const sAt = (i: number) => { let s = 0; for (let k = 1; k <= i; k++) s += Math.hypot(TRACK[k][0] - TRACK[k - 1][0], TRACK[k][1] - TRACK[k - 1][1]); return s; };
export const profile = solveProfile(TRACK, stationIdx, sAt(iMain) + CUT.afterMain, sAt(i29) + CUT.after29th);

export const controlPoints: Vector3[] = TRACK.map(([x, z], i) => new Vector3(x, profile.y[i], z));
export const curve = new CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
curve.arcLengthDivisions = 6000;
export const LEN = curve.getLength();

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
/* ------------------------------------------------------------------ turning loops */

export type LoopEnd = "near" | "far";
/** A balloon loop at one end of the line, level at the end's deck height: out on one track, back on the other. */
export type Loop = { end: LoopEnd; curve: CatmullRomCurve3; L: number; samples: Frame[] };

type P2 = [number, number];
const right2 = ([x, z]: P2): P2 => [-z, x];

/**
 * The train leaves the end on the right-hand track (lateral +LANE of the outward heading), runs a neck out to a circle
 * of radius R, goes round it turning left, and comes back down a second neck onto the other track. The circle's centre
 * is straight ahead unless given; `alpha` sets how far round the circle the necks join it (the "light bulb" shape).
 */
function buildLoop(end: LoopEnd, R: number, alpha: number, centre?: P2, neck = 26): Loop {
  const e = frameAt(end === "far" ? LEN : 0, makeFrame());
  const sgn = end === "far" ? 1 : -1;
  const hl = Math.hypot(e.t.x, e.t.z);
  const o: P2 = [(e.t.x / hl) * sgn, (e.t.z / hl) * sgn];
  const ro = right2(o);
  const E: P2 = [e.p.x, e.p.z];
  const C: P2 = centre ?? [E[0] + o[0] * (neck + R * Math.sin(alpha)), E[1] + o[1] * (neck + R * Math.sin(alpha))];
  const gl = Math.hypot(C[0] - E[0], C[1] - E[1]);
  const g: P2 = [(C[0] - E[0]) / gl, (C[1] - E[1]) / gl];
  const rg = right2(g);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  // radial directions of the two joins: the right and left sides of the circle (seen from the end), turned back by alpha
  const nIn: P2 = [rg[0] * ca - g[0] * sa, rg[1] * ca - g[1] * sa];
  const nOut: P2 = [-rg[0] * ca - g[0] * sa, -rg[1] * ca - g[1] * sa];
  const Pin: P2 = [C[0] + R * nIn[0], C[1] + R * nIn[1]];
  const Pout: P2 = [C[0] + R * nOut[0], C[1] + R * nOut[1]];
  // travelling round with the centre on the left, the heading at radial direction n is (n.z, -n.x)
  const head = (n: P2): P2 => [n[1], -n[0]];
  const Ein: P2 = [E[0] + ro[0] * LANE, E[1] + ro[1] * LANE];
  const Eout: P2 = [E[0] - ro[0] * LANE, E[1] - ro[1] * LANE];
  const pts: P2[] = [];
  const bezier = (a: P2, ha: P2, b: P2, hb: P2) => {
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = chord * 0.42;
    const c1: P2 = [a[0] + ha[0] * k, a[1] + ha[1] * k];
    const c2: P2 = [b[0] - hb[0] * k, b[1] - hb[1] * k];
    const n = Math.max(8, Math.ceil(chord));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const v = 1 - u;
      pts.push([
        v * v * v * a[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b[0],
        v * v * v * a[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b[1],
      ]);
    }
  };
  bezier(Ein, o, Pin, head(nIn));
  const a0 = Math.atan2(nIn[1], nIn[0]);
  let sweep = a0 - Math.atan2(nOut[1], nOut[0]);
  while (sweep <= 0) sweep += Math.PI * 2;
  const na = Math.ceil((sweep * R) / 1.2);
  for (let i = 0; i < na; i++) {
    const a = a0 - (sweep * i) / na;
    pts.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]);
  }
  bezier(Pout, head(nOut), Eout, [-o[0], -o[1]]);
  pts.push(Eout);
  const curve = new CatmullRomCurve3(
    pts.map(([x, z]) => new Vector3(x, e.p.y, z)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 3000;
  const L = curve.getLength();
  const list: Frame[] = [];
  const n = Math.ceil(L / 1.5);
  for (let i = 0; i <= n; i++) {
    const f = makeFrame();
    curve.getPointAt(i / n, f.p);
    curve.getTangentAt(i / n, f.t).normalize();
    f.r.crossVectors(f.t, UP).normalize();
    list.push(f);
  }
  return { end, curve, L, samples: list };
}

/** West of Waterfront the loop swings north over Burrard Inlet; east of Patterson it runs straight on over Central Park. */
export const LOOPS: Record<LoopEnd, Loop> = {
  near: buildLoop("near", 16, 0.6, [82, -34]),
  far: buildLoop("far", 17, 0.7),
};

const lp = new Vector3();
/** A loop's frame at distance t along it (extrapolated straight beyond either end); `sgn` orients t along +s. */
function loopFrameAt(loop: Loop, t: number, sgn: number, out: Frame): Frame {
  const u = MathUtils.clamp(t / loop.L, 0, 1);
  loop.curve.getPointAt(u, out.p);
  loop.curve.getTangentAt(u, out.t).normalize();
  if (t < 0) out.p.addScaledVector(out.t, t);
  else if (t > loop.L) out.p.addScaledVector(lp.copy(out.t), t - loop.L);
  out.t.multiplyScalar(sgn);
  out.r.crossVectors(out.t, UP).normalize();
  return out;
}

/**
 * The frame of a train at arc position sc travelling in direction dir: on the line between 0 and LEN, round a loop
 * beyond either end. Past an end, the distance x beyond it maps to the loop from its entry while heading out
 * (outbound past the far end, inbound past the near end) and from its exit while coming back, so a train that has
 * turned round is continuous when the drive model flips its direction. The tangent points along +s either way.
 */
export function trainFrameAt(sc: number, dir: number, lane: number, out: Frame): Frame {
  if (sc > LEN) {
    const x = sc - LEN;
    return loopFrameAt(LOOPS.far, dir > 0 ? x : LOOPS.far.L - x, dir > 0 ? 1 : -1, out);
  }
  if (sc < 0) {
    const x = -sc;
    return loopFrameAt(LOOPS.near, dir < 0 ? x : LOOPS.near.L - x, dir > 0 ? 1 : -1, out);
  }
  return frameAt(sc, out, lane);
}

/** Every track sample, the loops included, for the clearance rules (buildings, trees, cameras). */
export const PATH_SAMPLES: Frame[] = [...samples, ...LOOPS.near.samples, ...LOOPS.far.samples];
const coarse = [...samples.filter((_, i) => i % 4 === 0), ...LOOPS.near.samples.filter((_, i) => i % 3 === 0), ...LOOPS.far.samples.filter((_, i) => i % 3 === 0)];

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
// the Grandview Cut: dug, never built up: a floor just under the girder within 14 units, banks rising to floor + CUT.bank
// by 40, back to the DEM by 55
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
      // only ever digs: where the deck runs above the ground the guideway simply stands on its piers
      const target = Math.min(h, bp.floor + CUT.bank * t * t * (3 - 2 * t));
      const fade = Math.min(1, Math.max(0, (lat - 40) / 15));
      return lerp(h, target, bp.w * (1 - fade * fade * (3 - 2 * fade)));
    });
  }
}
/**
 * How much of the Grandview Cut a ground point belongs to (0 outside, 1 on the trench floor and the banks out to 30
 * units, fading by 45), from a 6-unit raster painted along the cut: the buildings and the trees use it.
 */
const CUT_CELL = 6;
const cutCells = new Map<number, number>();
{
  for (let i = 0; i <= SAMPLES; i += 2) {
    const s = (i / SAMPLES) * LEN;
    const w = profileCutAt(s);
    if (w < 0.02) continue;
    const p = samples[i].p;
    const ci = Math.round(p.x / CUT_CELL);
    const cj = Math.round(p.z / CUT_CELL);
    for (let di = -8; di <= 8; di++) {
      for (let dj = -8; dj <= 8; dj++) {
        const d = Math.hypot((ci + di) * CUT_CELL - p.x, (cj + dj) * CUT_CELL - p.z);
        const v = w * (1 - smoothstep01((d - 30) / 15));
        const k = (ci + di) * 100000 + (cj + dj);
        if (v > (cutCells.get(k) ?? 0)) cutCells.set(k, v);
      }
    }
  }
}
export const cutNear = (x: number, z: number): number => cutCells.get(Math.round(x / CUT_CELL) * 100000 + Math.round(z / CUT_CELL)) ?? 0;

function profileCutAt(s: number): number {
  const ps = profile.s;
  const k = ps.findIndex((v) => v >= s);
  if (k <= 0) return profile.cut[Math.max(0, k)];
  const u = (s - ps[k - 1]) / (ps[k] - ps[k - 1]);
  return profile.cut[k - 1] + (profile.cut[k] - profile.cut[k - 1]) * u;
}
