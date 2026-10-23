/**
 * The hyperwave: sky lanes for hover cars over five of the bus corridors (Broadway, Main, Terminal, Kingsway and
 * downtown's loop).
 * - Each lane is its route's loop, smoothed and kept right of travel, so the two ways run 2.4 apart.
 * - It floats 13 over the street and climbs to clear the SkyTrain guideways (7 over the deck) where it crosses or runs
 *   beside them.
 * - Glowing guide lines mark it, and violet hoops every 40 units span both ways.
 * The cars glide each lane at the lane's pace, evenly spaced, bobbing, banking into its curves and pitching on its
 * climbs.
 */
import { BufferGeometry, Float32BufferAttribute } from "three";

import type { Lot } from "./buildings/city";
import { busNetwork } from "./buses";
import { getCityData } from "./cityData";
import { MILL_LINE } from "./rail";
import { roads } from "./roadNetwork";
import { groundAt } from "./terrain";
import { STATION_XZ, trackNearest } from "./track";

/** The corridors (bus routes by the start of their names) and each one's pace. */
const CORRIDORS: [string, number][] = [
  ["99 ", 17],
  ["3 ", 14],
  ["22 ", 16],
  ["19 ", 18],
  ["R4 ", 13],
];
const STEP = 4;
const LIFT = 13;
const OVER_DECK = 7;
/** Over a station's deck: its roof stands up to 10 over it. */
const OVER_STATION = 15;
const HALF = 1.2;
/** Height between lanes that cross. */
const CLEAR = 4;

export type Lane = {
  /** Samples every STEP along the loop: x, y, z. */
  p: Float32Array;
  n: number;
  len: number;
  pace: number;
};
export type HoverCar = { lane: number; s: number; phase: number; x: number; y: number; z: number; yaw: number; pitch: number; roll: number };

/** The Millennium's deck heights, sampled (the Expo's come from trackNearest). */
function decks(): [number, number, number][] {
  const out: [number, number, number][] = [];
  const m = MILL_LINE.curve.getSpacedPoints(Math.ceil(MILL_LINE.len / 6));
  for (const p of m) out.push([p.x, p.y, p.z]);
  return out;
}

/** Every station's deck, Expo and Millennium: their roofs stand well over it. */
function stationDecks(): [number, number, number][] {
  const out: [number, number, number][] = STATION_XZ.map(([x, z]) => [x, trackNearest(x, z).p.y, z]);
  for (const s of MILL_LINE.stationS) {
    const p = MILL_LINE.curve.getPointAt(Math.min(1, s / MILL_LINE.len));
    out.push([p.x, p.y, p.z]);
  }
  return out;
}

function chaikin(pts: [number, number][], passes: number): [number, number][] {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const q: [number, number][] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

/** A closed polyline resampled every `step`. */
function resample(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t < L) {
      out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]);
      t += step;
    }
    carry = t - L;
  }
  return out;
}

/** A lane's loop right of travel, and the height it wants at each sample before it is smoothed. */
function lanePath(path: [number, 1 | -1][], mill: [number, number, number][], tops: [number, number, number][]): { xz: [number, number][]; want: number[] } {
  const { edges } = roads();
  const raw: [number, number][] = [];
  for (const [k, dir] of path) {
    const e = edges[k].pts;
    const n = e.length / 2;
    for (let j = 0; j < n; j++) {
      const i = dir > 0 ? j : n - 1 - j;
      const pt: [number, number] = [e[i * 2], e[i * 2 + 1]];
      const last = raw[raw.length - 1];
      if (!last || Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 0.5) raw.push(pt);
    }
  }
  const smooth = resample(chaikin(resample(raw, 3), 3), STEP);
  const n = smooth.length;
  // right of travel, so the two ways of an out-and-back route part
  const xz = smooth.map((p, i) => {
    const a = smooth[(i - 1 + n) % n];
    const b = smooth[(i + 1) % n];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const L = Math.hypot(tx, tz) || 1;
    return [p[0] - (tz / L) * HALF, p[1] + (tx / L) * HALF] as [number, number];
  });
  // the height: over the street, or over a deck it comes near (eased in over 30 units), then smoothed into a glide
  const want = xz.map(([x, z]) => {
    let y = Math.max(groundAt(x, z), 0) + LIFT;
    const f = trackNearest(x, z);
    const dE = Math.hypot(f.p.x - x, f.p.z - z);
    if (dE < 46) y = Math.max(y, f.p.y + OVER_DECK - Math.max(0, dE - 16) * 0.2);
    for (const [mx, my, mz] of mill) {
      const d = Math.hypot(mx - x, mz - z);
      if (d < 46) y = Math.max(y, my + OVER_DECK - Math.max(0, d - 16) * 0.2);
    }
    for (const [sx, sy, sz] of tops) {
      const d = Math.hypot(sx - x, sz - z);
      if (d < 70) y = Math.max(y, sy + OVER_STATION - Math.max(0, d - 30) * 0.3);
    }
    return y;
  });
  return { xz, want };
}

/** Smooth a lane's heights into a glide (never below what it wants) and pack it. */
function packLane(xz: [number, number][], want: number[], pace: number, lots: Lot[]): Lane {
  const n = xz.length;
  const ys = want.slice();
  for (let pass = 0; pass < 6; pass++) {
    const prev = ys.slice();
    for (let i = 0; i < n; i++) ys[i] = Math.max(want[i], (prev[(i - 2 + n) % n] + prev[(i - 1 + n) % n] + prev[i] + prev[(i + 1) % n] + prev[(i + 2) % n]) / 5);
  }
  // where it passes too near a building taller than it (a corner the smoothing cut, a tower over the street), it
  // steps aside: each push spread over the samples either side, until none is left
  for (let round = 0; round < 4; round++) {
    const push = xz.map(([x, z], i) => clearOf(lots, x, z, ys[i]));
    if (push.every(([dx, dz]) => dx === 0 && dz === 0)) break;
    const W = [1, 2, 3, 4, 3, 2, 1];
    xz = xz.map(([x, z], i) => {
      let dx = 0;
      let dz = 0;
      W.forEach((w, k) => {
        const [px, pz] = push[(i + k - 3 + n) % n];
        dx += (px * w) / 4;
        dz += (pz * w) / 4;
      });
      return [x + dx, z + dz];
    });
  }
  const p = new Float32Array(n * 3);
  xz.forEach(([x, z], i) => p.set([x, ys[i], z], i * 3));
  return { p, n, len: n * STEP, pace };
}

/** How far to move (x, z) at height y out of the nearest lot that stands taller than y and within PAD of it. */
const PAD = 1.8;
function clearOf(lots: Lot[], x: number, z: number, y: number): [number, number] {
  for (const L of lots) {
    if (L.top - 3 < y - 1.5 || Math.abs(L.x - x) > 30 || Math.abs(L.z - z) > 30) continue;
    const a = L.ry ?? 0;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = x - L.x;
    const dz = z - L.z;
    // into the lot's own axes (city.ts turns a lot's local (lx, lz) to (lx c + lz s, -lx s + lz c))
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const hw = (L.fw ?? L.w) / 2 + PAD;
    const hd = (L.fd ?? L.d) / 2 + PAD;
    if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) continue;
    // out through the nearer side
    const ox = hw - Math.abs(lx);
    const oz = hd - Math.abs(lz);
    const [mx, mz] = ox < oz ? [Math.sign(lx || 1) * (ox + 0.2), 0] : [0, Math.sign(lz || 1) * (oz + 0.2)];
    return [mx * c + mz * s, -mx * s + mz * c];
  }
  return [0, 0];
}

let built: { lanes: Lane[]; cars: HoverCar[] } | null = null;
let builtFor: boolean | null = null;

/** The lanes and their cars (lite: 24, full: 60), shared by lane length. */
export function skyway(lowEnd: boolean): { lanes: Lane[]; cars: HoverCar[] } {
  if (built && builtFor === lowEnd) return built;
  const { routes } = busNetwork();
  const mill = decks();
  const tops = stationDecks();
  const { lots } = getCityData(lowEnd);
  const lanes: Lane[] = [];
  // where a lane meets itself further round its loop, or a lane laid before it, it climbs over: a stacked crossing
  const laid: [number, number, number][] = [];
  for (const [prefix, pace] of CORRIDORS) {
    const r = routes.find((q) => q.name.startsWith(prefix));
    if (!r || r.path.length < 2) continue;
    const { xz, want } = lanePath(r.path, mill, tops);
    const mine = laid.length;
    xz.forEach(([x, z], i) => {
      for (let k = 0; k < laid.length; k++) {
        if (k >= mine + i - 5) break;
        const [ox, oy, oz] = laid[k];
        if (Math.abs(ox - x) < 3 && Math.abs(oz - z) < 3 && Math.abs(want[i] - oy) < CLEAR) want[i] = oy + CLEAR;
      }
      laid.push([x, want[i], z]);
    });
    lanes.push(packLane(xz, want, pace, lots));
  }
  const N = lowEnd ? 24 : 60;
  const total = lanes.reduce((s, l) => s + l.len, 0);
  const cars: HoverCar[] = [];
  lanes.forEach((l, li) => {
    const count = Math.max(2, Math.round((N * l.len) / Math.max(1, total)));
    for (let j = 0; j < count; j++) {
      // evenly spaced with a little jitter; one pace per lane, so the gaps hold
      const s = ((j + 0.5 + Math.sin(j * 7.3 + li) * 0.2) / count) * l.len;
      cars.push({ lane: li, s, phase: j * 1.7 + li, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 });
    }
  });
  built = { lanes, cars };
  builtFor = lowEnd;
  return built;
}

/** A lane's sample k (wrapping): x, y, z. */
const at = (l: Lane, k: number): [number, number, number] => {
  const i = ((k % l.n) + l.n) % l.n;
  return [l.p[i * 3], l.p[i * 3 + 1], l.p[i * 3 + 2]];
};

/** Move the cars on by dt and pose them at time t. */
export function flyHover(sky: { lanes: Lane[]; cars: HoverCar[] }, dt: number, t: number): void {
  for (const c of sky.cars) {
    const l = sky.lanes[c.lane];
    c.s = (c.s + l.pace * dt) % l.len;
    const u = c.s / STEP;
    const k = Math.floor(u);
    const f = u - k;
    const a = at(l, k);
    const b = at(l, k + 1);
    c.x = a[0] + (b[0] - a[0]) * f;
    c.y = a[1] + (b[1] - a[1]) * f + Math.sin(t * 1.3 + c.phase) * 0.15;
    c.z = a[2] + (b[2] - a[2]) * f;
    // heading and its turn rate over a few samples either side: the bank into the curve
    const p0 = at(l, k - 2);
    const p1 = at(l, k + 3);
    const h0 = Math.atan2(-(a[2] - p0[2]), a[0] - p0[0]);
    const h1 = Math.atan2(-(p1[2] - b[2]), p1[0] - b[0]);
    let dh = h1 - h0;
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    c.yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    c.pitch = Math.atan2(b[1] - a[1], STEP) * 0.8;
    c.roll = Math.max(-0.45, Math.min(0.45, -dh * 1.6));
  }
}

/**
 * The lanes drawn, one geometry in vertex colours with alpha for an unlit, see-through material:
 * - each way's guide line (a thin three-sided tube) under its cars;
 * - a soft band of light either side of it, fading to its edges, that reads from below and afar;
 * - a violet hoop every 28 units round both ways.
 */
export function laneGeometry(lanes: Lane[]): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const CYAN = [0.37, 0.95, 1.0, 1];
  const VIOLET = [0.66, 0.45, 0.98, 1];
  const BAND = [0.37, 0.95, 1.0, 0.32];
  const EDGE = [0.37, 0.95, 1.0, 0];
  const tri = (a: number[], b: number[], c: number[], rgba: number[], rgbaB = rgba, rgbaC = rgba) => {
    pos.push(...a, ...b, ...c);
    col.push(...rgba, ...rgbaB, ...rgbaC);
  };
  const tube = (A: number[][], B: number[][], rgb: number[]) => {
    for (let j = 0; j < A.length; j++) {
      const a0 = A[j];
      const a1 = A[(j + 1) % A.length];
      const b0 = B[j];
      const b1 = B[(j + 1) % B.length];
      tri(a0, b0, b1, rgb);
      tri(a0, b1, a1, rgb);
    }
  };
  /** A triangle of three points round the line at (x, y, z) across its heading (rx, rz). */
  const ring = (x: number, y: number, z: number, rx: number, rz: number, r: number) => [0, 1, 2].map((q) => {
    const a = (q / 3) * Math.PI * 2 + Math.PI / 2;
    return [x + rx * Math.cos(a) * r, y + Math.sin(a) * r, z + rz * Math.cos(a) * r];
  });
  const hoops: [number, number][] = [];
  for (const l of lanes) {
    for (let i = 0; i < l.n; i++) {
      const a = at(l, i);
      const b = at(l, i + 1);
      const c = at(l, i + 2);
      const rA = right(at(l, i - 1), b);
      const rB = right(a, c);
      tube(ring(a[0], a[1] - 0.55, a[2], rA[0], rA[1], 0.11), ring(b[0], b[1] - 0.55, b[2], rB[0], rB[1], 0.11), CYAN);
      // the band: from the line out to each side, its light fading
      for (const sd of [1, -1]) {
        const cA = [a[0], a[1] - 0.62, a[2]];
        const cB = [b[0], b[1] - 0.62, b[2]];
        const eA = [a[0] + rA[0] * 1.15 * sd, a[1] - 0.62, a[2] + rA[1] * 1.15 * sd];
        const eB = [b[0] + rB[0] * 1.15 * sd, b[1] - 0.62, b[2] + rB[1] * 1.15 * sd];
        tri(cA, eA, eB, BAND, EDGE, EDGE);
        tri(cA, eB, cB, BAND, EDGE, BAND);
      }
      // a hoop round both ways, where none stands within 12
      if (i % 7 === 0) {
        const cx = a[0] - rA[0] * HALF;
        const cz = a[2] - rA[1] * HALF;
        if (hoops.some(([hx, hz]) => Math.hypot(hx - cx, hz - cz) < 12)) continue;
        hoops.push([cx, cz]);
        const S = 12;
        const pts: number[][] = [];
        for (let q = 0; q <= S; q++) {
          const ang = (q / S) * Math.PI;
          pts.push([cx + rA[0] * Math.cos(ang) * 3.0, a[1] - 0.6 + Math.sin(ang) * 2.0, cz + rA[1] * Math.cos(ang) * 3.0]);
        }
        const tx = -rA[1];
        const tz = rA[0];
        for (let q = 0; q < S; q++) {
          const p0 = pts[q];
          const p1 = pts[q + 1];
          const r0 = [0, 1, 2].map((m) => {
            const ang = (m / 3) * Math.PI * 2;
            return [p0[0] + tx * Math.cos(ang) * 0.09, p0[1] + Math.sin(ang) * 0.09, p0[2] + tz * Math.cos(ang) * 0.09];
          });
          const r1 = [0, 1, 2].map((m) => {
            const ang = (m / 3) * Math.PI * 2;
            return [p1[0] + tx * Math.cos(ang) * 0.09, p1[1] + Math.sin(ang) * 0.09, p1[2] + tz * Math.cos(ang) * 0.09];
          });
          tube(r0, r1, VIOLET);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 4));
  g.computeBoundingSphere();
  return g;
}

/** The unit vector right of travel from a to b (x, z). */
function right(a: number[], b: number[]): [number, number] {
  const tx = b[0] - a[0];
  const tz = b[2] - a[2];
  const L = Math.hypot(tx, tz) || 1;
  return [-tz / L, tx / L];
}
