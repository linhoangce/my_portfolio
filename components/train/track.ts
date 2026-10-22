import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

import { stations } from "@/data";

import { BALLAST, CROSS_LEN, DECK, K, LANE } from "./constants";
import { addRailBed, addRailTrenches, bedPoints, profileAt } from "./rail";
import { EXPO_STRUCT } from "./railData";
import { addModifier, demAt, inBasin, rectPad } from "./terrain";
import { TRACK_RAW } from "./trackData";
import { solveProfile } from "./trackProfile";

export { cutNear } from "./rail";
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

// deck heights over the real terrain, from OSM's structure along the line: elevated from Waterfront across the
// Grandview Cut and Commercial–Broadway, down at grade, in a cutting and a short covered trench between Nanaimo and
// Joyce, elevated again to the end (the 16 lead-in points ride the viaduct)
const STRUCT = new Array<string>(TRACK_RAW.length).fill("V");
for (const [a, b, c] of EXPO_STRUCT) for (let i = a; i <= b; i++) STRUCT[i] = c;
export const profile = solveProfile(TRACK, stationIdx, "V".repeat(TRACK.length - TRACK_RAW.length) + STRUCT.join(""));

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
/** The loop at Waterfront's end: its circle's centre and radius (a second track runs inside it, Guideway.tsx). */
export const NEAR_LOOP = { c: [82, -34] as [number, number], r: 16 };
export const LOOPS: Record<LoopEnd, Loop> = {
  near: buildLoop("near", NEAR_LOOP.r, 0.6, NEAR_LOOP.c),
  far: buildLoop("far", 17, 0.7),
};

/* ------------------------------------------------------------------ the line beyond the loop */

/** The stations of the line past the turnback loop, at the real ones' places. */
export const EXT_STATIONS: { name: string; x: number; z: number }[] = [
  { name: "Royal Oak", x: 989, z: 810 },
  { name: "Edmonds", x: 1223, z: 903 },
  { name: "22nd Street", x: 1304, z: 1054 },
  { name: "New Westminster", x: 1595, z: 1036 },
];
export type Extension = { curve: CatmullRomCurve3; L: number; samples: Frame[]; stationT: number[] };
/**
 * The junction where the line beyond the loop leaves: from s0 to s1 (just short of the line's end) its deck runs
 * alongside the line's, EXT_GAP to the left, the two one wide deck; switches there carry the outbound track across onto
 * it and its inbound track back (Guideway leaves the facing parapets out, Extension.tsx lays the switches).
 */
export const EXT_JOIN = { s0: LEN - 46, s1: LEN - 6 };
export const EXT_GAP = 12.6;

/**
 * The Expo runs on past the turnback loop, as the real line does, to Royal Oak, Edmonds, 22nd Street and New Westminster. Its deck leaves
 * beside the line's own (left of travel, the two decks side by side like a junction's) before the loop, swings round
 * the loop's north side and runs on through the real stations. The ride's trains turn on the loop; a train of its own
 * runs this stretch. Its deck stands DECK over the ground (smoothed), from the line's height where it leaves; `heightAt`
 * gives the ground (the far terrain beyond the city's, once loaded).
 */
export function buildExtension(heightAt: (x: number, z: number) => number): Extension {
  const f = makeFrame();
  // left of the line's travel, `back` before its end (or `-back` past it, straight on)
  const beside = (back: number, lat: number): P2 => {
    frameAt(Math.min(LEN, LEN - back), f);
    const on = Math.max(0, -back);
    return [f.p.x + f.t.x * on - f.r.x * lat, f.p.z + f.t.z * on - f.r.z * lat];
  };
  const J = EXT_JOIN.s1 - EXT_JOIN.s0;
  const xz: P2[] = [beside(LEN - EXT_JOIN.s0, EXT_GAP), beside(LEN - EXT_JOIN.s0 - J / 2, EXT_GAP), beside(LEN - EXT_JOIN.s1, EXT_GAP), beside(-10, 16), beside(-20, 23), beside(-30, 30), beside(-45, 37), [952, 748], [970, 775], ...EXT_STATIONS.slice(0, 1).map((s): P2 => [s.x, s.z]), [1040, 833], [1100, 855], [1160, 878], [EXT_STATIONS[1].x, EXT_STATIONS[1].z], [1262, 950], [1290, 1000], [EXT_STATIONS[2].x, EXT_STATIONS[2].z], [1335, 1100], [1400, 1092], [1470, 1068], [1540, 1046], [EXT_STATIONS[3].x, EXT_STATIONS[3].z], [1640, 1030]];
  const flat = new CatmullRomCurve3(
    xz.map(([x, z]) => new Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const L0 = flat.getLength();
  const n = Math.ceil(L0 / 2);
  const pts = flat.getSpacedPoints(n);
  // the ground along it, smoothed over 30 units either way; the first 50 units ease up from the line's own deck
  const g = pts.map((p) => heightAt(p.x, p.z));
  const W = 15;
  // level with the line's deck alongside it through the junction, then easing over 50 units to its own
  const lineY = (t: number) => samples[Math.round((Math.min(LEN, EXT_JOIN.s0 + t) / LEN) * SAMPLES)].p.y;
  const ys = pts.map((_, i) => {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n, i + W); j++) {
      s += g[j];
      k++;
    }
    const lift = Math.max(s / k, g[i] + 1) + DECK;
    const t = (i * L0) / n;
    const u = MathUtils.clamp((t - J) / 50, 0, 1);
    return lineY(t) + (lift - lineY(t)) * u * u * (3 - 2 * u);
  });
  const curve = new CatmullRomCurve3(
    pts.map((p, i) => new Vector3(p.x, ys[i], p.z)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 3000;
  const L = curve.getLength();
  const list: Frame[] = [];
  const m = Math.ceil(L / 1.5);
  for (let i = 0; i <= m; i++) {
    const fr = makeFrame();
    curve.getPointAt(i / m, fr.p);
    curve.getTangentAt(i / m, fr.t).normalize();
    fr.r.crossVectors(fr.t, UP).normalize();
    list.push(fr);
  }
  const stationT = EXT_STATIONS.map((st) => {
    let best = 0;
    list.forEach((fr, i) => {
      if ((fr.p.x - st.x) ** 2 + (fr.p.z - st.z) ** 2 < (list[best].p.x - st.x) ** 2 + (list[best].p.z - st.z) ** 2) best = i;
    });
    return (best / m) * L;
  });
  return { curve, L, samples: list, stationT };
}
/**
 * The extension's course for the clearance rules, over the map's own heights (the ground is not final while the
 * modules load; Extension.tsx builds it again on the drawn ground and the far terrain).
 */
export const EXTENSION = buildExtension(demAt);

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

/** Every track sample, the loops and the line beyond them included, for the clearance rules (buildings, trees, cameras). */
export const PATH_SAMPLES: Frame[] = [...samples, ...LOOPS.near.samples, ...LOOPS.far.samples, ...EXTENSION.samples];
const coarse = [...samples.filter((_, i) => i % 4 === 0), ...LOOPS.near.samples.filter((_, i) => i % 3 === 0), ...LOOPS.far.samples.filter((_, i) => i % 3 === 0), ...EXTENSION.samples.filter((_, i) => i % 3 === 0)];

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
  // past the last station it starts at the platform's end, leaving the stretch before the loop to the junction
  ...stationS.map((ss, i) => (i === stationS.length - 1 ? ss + 16 : stationS[i + 1] - 13 - (ss + 30 + CROSS_LEN) >= 8 ? ss + 30 : -1)),
].filter((c0) => c0 >= 0 && c0 + CROSS_LEN <= LEN);

export const smoothstep01 = (u: number): number => {
  const c = MathUtils.clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};

// ---------------------------------------------------------------- ground the track asks for
// station pads: the ground under each station sits DECK below its level deck, or a ballast's depth under the rails
// where the line has come down, wide enough for the platforms
export const lowAt = (s: number): number => profileAt({ profile, len: LEN }, "low", s);
{
  const f = makeFrame();
  for (const ss of stationS) {
    frameAt(ss, f);
    const tx = f.t.x / Math.hypot(f.t.x, f.t.z);
    const tz = f.t.z / Math.hypot(f.t.x, f.t.z);
    const low = lowAt(ss) > 0.5;
    const pad = rectPad(f.p.x, f.p.z, tx, tz, 34, low ? 16 : 22, low ? 8 : 26, f.p.y - (low ? BALLAST : DECK));
    addModifier((x, z, h) => (inBasin(x, z) ? h : pad(x, z, h)));
  }
}
// where the Expo comes down, its bed and its cutting; then the Millennium Line's and the Broadway Extension's
addRailBed(bedPoints({ curve, len: LEN, profile }));
addRailTrenches();
