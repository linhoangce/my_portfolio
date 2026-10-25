/**
 * The air network's ground rules and how its flights are made (airways.ts flies the air taxis, droneways.ts the
 * delivery drones):
 * - what stands in the way: the city's lots, the landmarks (the Waterfront hub's towers one by one), the Skyport's
 *   towers, the Lions Gate's towers, the cruise ship at Canada Place and the Inlet Walk with its stage: the highest
 *   roof near a point, and what stands under it;
 * - the Expo: nothing flies along it, and within 25 of it everything flies 25 over its deck;
 * - a flight: a smoothed line over the ground, raised over what stands near it and smoothed again into a glide,
 *   climbing off its ends and coming down onto them, sampled every few units; its timetable, from a speed set by its
 *   steepness and its turns and eased at its ends, so where it is is a function of the time alone; its heading, pitch
 *   and bank at each sample;
 * - its track: where it is each second round its cycle, for the timetables to be kept apart.
 * Pure.
 */
import { HEROES, skyportAt } from "./buildings/heroes";
import { getCityData } from "./cityData";
import { INLET_AIR } from "./inletWalk";
import { narrowsLine } from "./lionsGate";
import { LANDMARKS } from "./sites";
import { groundAt } from "./terrain";
import { trackNearest } from "./track";
import { HUB_AT, HUB_BLOCKS, HUB_CANOPY, HUB_DECK, HUB_DECK_BOX, HUB_GALLERY } from "./waterfrontHub";

/** Something to fly clear of: a footprint (a box turned by c, s = cos, sin of its turn, or round) and its top. */
export type Obstacle = { x: number; z: number; c: number; s: number; hw: number; hd: number; top: number; round?: boolean };

const CELL = 32;
const key = (i: number, j: number) => i * 100003 + j;

/** Whether (x, z) is within `pad` of an obstacle's footprint (city.ts turns a lot's local (lx, lz) to (lx c + lz s, −lx s + lz c)). */
export function inside(o: Obstacle, x: number, z: number, pad: number): boolean {
  const dx = x - o.x;
  const dz = z - o.z;
  if (o.round) return dx * dx + dz * dz < (o.hw + pad) ** 2;
  return Math.abs(dx * o.c - dz * o.s) < o.hw + pad && Math.abs(dx * o.s + dz * o.c) < o.hd + pad;
}

/** The obstacles, bucketed by 32-unit cell (each in every cell within `reach` of it), and the Expo's rule. */
export class Airspace {
  private cells = new Map<number, Obstacle[]>();
  private expo = new Map<number, number>();
  constructor(
    readonly list: Obstacle[],
    readonly reach: number,
  ) {
    for (const o of list) {
      const r = Math.hypot(o.hw, o.hd) + reach;
      for (let i = Math.floor((o.x - r) / CELL); i <= Math.floor((o.x + r) / CELL); i++) {
        for (let j = Math.floor((o.z - r) / CELL); j <= Math.floor((o.z + r) / CELL); j++) {
          const k = key(i, j);
          const c = this.cells.get(k);
          if (c) c.push(o);
          else this.cells.set(k, [o]);
        }
      }
    }
  }

  /** The highest top within `pad` (at most the reach) of (x, z); −Infinity where nothing stands. */
  roof(x: number, z: number, pad: number): number {
    let top = -Infinity;
    for (const o of this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) if (o.top > top && inside(o, x, z, pad)) top = o.top;
    return top;
  }

  /** What stands under (x, z). */
  under(x: number, z: number): Obstacle[] {
    return (this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []).filter((o) => inside(o, x, z, 0));
  }

  /** The least height over (x, z) the Expo asks: 25 over its deck within 25 of it, nothing beyond (by 2-unit cell, generously). */
  expoFloor(x: number, z: number): number {
    const i = Math.round(x / 2);
    const j = Math.round(z / 2);
    const k = key(i, j);
    let v = this.expo.get(k);
    if (v === undefined) {
      const f = trackNearest(i * 2, j * 2);
      v = Math.hypot(f.p.x - i * 2, f.p.z - j * 2) < 25 + 1.5 ? f.p.y + 25.5 : -Infinity;
      this.expo.set(k, v);
    }
    return v;
  }
}

/** A turned lot or an axis box as an obstacle. */
export const boxObstacle = (x0: number, x1: number, z0: number, z1: number, top: number): Obstacle => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, c: 1, s: 0, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, top });

/**
 * The landmarks (all but those `skip` names, which the caller gives in detail), the cruise ship, the Lions Gate's
 * towers and deck, and the Inlet Walk and its stage (low enough that no flight need rise for them).
 */
export function fixedObstacles(skip: Set<string>): Obstacle[] {
  const out: Obstacle[] = [];
  for (const l of LANDMARKS) {
    if (skip.has(l.key)) continue;
    out.push({ x: l.px, z: l.pz, c: 1, s: 0, hw: l.r, hd: l.r, top: l.padY + l.h, round: true });
  }
  // the cruise ship alongside the Canada Place pier
  out.push(boxObstacle(-66, -6, -129, -30, 24));
  // the Lions Gate: its towers and the deck between its anchorages
  const nw = narrowsLine();
  for (const z of [nw.zS - 9, nw.zN + 9]) out.push(boxObstacle(nw.x - 6, nw.x + 6, z - 2, z + 2, 45));
  out.push(boxObstacle(nw.x - 5, nw.x + 5, nw.zN - 30, nw.zS + 30, 26));
  // the Inlet Walk across the harbour and its stage in the cove at its north end (inletWalk.ts)
  for (const b of INLET_AIR) out.push(boxObstacle(...b));
  return out;
}

const spaces = new Map<boolean, Airspace>();

/**
 * The airspace over the city as built for a budget: every lot (the Broadway & Commercial block's given tower by tower,
 * with the Skyport, buildings/heroes.ts skyportAt), every landmark (the Waterfront hub's towers, canopy, gallery and
 * deck one by one), the cruise ship and the Lions Gate.
 */
export function airspaceFor(lowEnd: boolean): Airspace {
  let a = spaces.get(lowEnd);
  if (a) return a;
  const list: Obstacle[] = [];
  const bc = HEROES.find((h) => h.name === "Broadway & Commercial");
  for (const L of getCityData(lowEnd).lots) {
    if (bc && !L.arch && Math.abs(L.x - bc.x) < 0.01 && Math.abs(L.z - bc.z) < 0.01) continue;
    const ry = L.ry ?? 0;
    list.push({ x: L.x, z: L.z, c: Math.cos(ry), s: Math.sin(ry), hw: (L.fw ?? L.w) / 2, hd: (L.fd ?? L.d) / 2, top: L.top });
  }
  for (const b of skyportAt(lowEnd).blocks) list.push(boxObstacle(b.x0, b.x1, b.z0, b.z1, b.top));
  list.push(...fixedObstacles(new Set(["waterfrontHub"])));
  const tallest = HUB_BLOCKS.reduce((p, b) => (b.h > p.h ? b : p));
  for (const b of HUB_BLOCKS) list.push(boxObstacle(HUB_AT.x + b.x0 - 0.3, HUB_AT.x + b.x1 + 0.3, HUB_AT.z + b.z0 - 0.3, HUB_AT.z + b.z1 + 0.3, HUB_DECK + b.h + (b === tallest ? 10 : 0.6)));
  const C = HUB_CANOPY;
  const G = HUB_GALLERY;
  const D = HUB_DECK_BOX;
  list.push(boxObstacle(HUB_AT.x + C.x0, HUB_AT.x + C.x1, HUB_AT.z + C.z0, HUB_AT.z + C.z1, HUB_DECK + C.h + 1.4));
  list.push(boxObstacle(HUB_AT.x + G.x - G.half - 4, HUB_AT.x + G.x + G.half + 4, HUB_AT.z + G.z1, HUB_AT.z + G.z0, HUB_DECK + 9.6));
  list.push(boxObstacle(HUB_AT.x + D.x0, HUB_AT.x + D.x1, HUB_AT.z + D.z0, HUB_AT.z + D.z1, HUB_DECK));
  a = new Airspace(list, 12);
  spaces.set(lowEnd, a);
  return a;
}

/* ------------------------------------------------------------------ flights */

/**
 * One end of a flight: a spot it lifts off or sets down on (rising `lift` straight up before it leaves; `full`, it
 * leaves and arrives straight up and down from its cruising height), or a point in the air (`air`) where it comes in
 * or goes out of the map at its cruising height.
 */
export type End = { x: number; y: number; z: number; lift: number; full?: boolean; air?: boolean };

/**
 * How a kind of flier flies: its level (and, where what stands below raises it, how far over that raised height it
 * keeps: so stacked levels stay stacked), the clearance it keeps, its climb gradient off a spot, its speeds and limits.
 */
export type Make = {
  level: number;
  above?: number;
  clear: number;
  grade: number;
  cruise: number;
  vert: number;
  acc: number;
  turn: number;
  bank: number;
  step: number;
};

/** A flight, sampled: positions, the time each is reached, the heading, pitch, bank and ground speed there; `up` ends its first climb, `down` begins its last descent. */
export type Flight = {
  n: number;
  p: Float32Array;
  t: Float32Array;
  yaw: Float32Array;
  pitch: Float32Array;
  roll: Float32Array;
  vh: Float32Array;
  /** 1 on the straight climb or descent over a spot at either end. */
  spot: Uint8Array;
  dur: number;
  up: number;
  down: number;
};

/** Chaikin's corner cutting on an open line (its ends kept), then resampled every `step`. */
export function smoothLine(pts: [number, number][], passes: number, step: number): [number, number][] {
  let p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.05);
  for (let k = 0; k < passes && p.length > 2; k++) {
    const q: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      if (i > 0) q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < p.length - 2) q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  const out: [number, number][] = [p[0]];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    const L = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t < L) {
      out.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]);
      t += step;
    }
    carry = L - (t - step);
  }
  const last = p[p.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.4) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

/** A line offset `side` to the right of travel (x east, z south: right of heading east is south), or by side(x, z) at each point. */
export function offsetLine(pts: [number, number][], side: number | ((x: number, z: number) => number)): [number, number][] {
  const n = pts.length;
  return pts.map(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const s = typeof side === "number" ? side : side(x, z);
    return [x - ((b[1] - a[1]) / L) * s, z + ((b[0] - a[0]) / L) * s];
  });
}

const wrap = (a: number) => {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
};

/**
 * A flight from one end over the line through `via` to the other: the line smoothed; its height at each sample the
 * make's level or the clearance over the highest roof within the make's clearance (and the ground, and the Expo's
 * rule), smoothed into a glide never below that; cut down to a climb of the make's gradient off each spot and the
 * corners rounded; then the straight climb off the first spot and descent onto the last. Timed and posed.
 */
export function fly(from: End, via: [number, number][], to: End, m: Make, air: Airspace): Flight {
  const line = smoothLine([[from.x, from.z], ...via, [to.x, to.z]], 3, m.step);
  const n = line.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  const S = s[n - 1];
  const req = line.map(([x, z]) => Math.max(air.roof(x, z, m.clear) + m.clear, groundAt(x, z) + m.clear, air.expoFloor(x, z)));
  const want = req.map((r) => Math.max(m.level, r + (m.above ?? 0)));
  let y = want.slice();
  // a glide: five-sample averages, never below what each sample wants
  for (let pass = 0; pass < 8; pass++) {
    const prev = y.slice();
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) sum += prev[Math.min(n - 1, Math.max(0, i + k))];
      y[i] = Math.max(want[i], sum / 5);
    }
  }
  // the climb off a spot and the descent onto one, never below what stands near
  const startY = from.air ? y[0] : from.full ? y[0] : Math.max(from.y + from.lift, req[0]);
  const endY = to.air ? y[n - 1] : to.full ? y[n - 1] : Math.max(to.y + to.lift, req[n - 1]);
  y = y.map((v, i) => {
    let e = v;
    if (!from.air && !from.full) e = Math.min(e, startY + m.grade * s[i]);
    if (!to.air && !to.full) e = Math.min(e, endY + m.grade * (S - s[i]));
    return Math.max(req[i], e);
  });
  // round the corners where the climbs meet the glide
  for (let pass = 0; pass < 6; pass++) {
    const prev = y.slice();
    for (let i = 1; i < n - 1; i++) y[i] = Math.max(req[i], (prev[i - 1] + prev[i] + prev[i + 1]) / 3);
  }
  // the straight climb and descent over the spots, a unit at a time
  const pts: number[][] = [];
  const spot: number[] = [];
  if (!from.air) {
    const k = Math.max(1, Math.ceil(y[0] - from.y));
    for (let i = 0; i < k; i++) {
      pts.push([from.x, from.y + ((y[0] - from.y) * i) / k, from.z]);
      spot.push(1);
    }
  }
  line.forEach(([x, z], i) => {
    pts.push([x, y[i], z]);
    spot.push(0);
  });
  if (!to.air) {
    const k = Math.max(1, Math.ceil(y[n - 1] - to.y));
    for (let i = 1; i <= k; i++) {
      pts.push([to.x, y[n - 1] + ((to.y - y[n - 1]) * i) / k, to.z]);
      spot.push(1);
    }
  }
  return timed(pts, spot, m, !!from.air, !!to.air);
}

/** A flight's timetable and pose from its samples (see fly). */
function timed(pts: number[][], spot: number[], m: Make, airStart: boolean, airEnd: boolean): Flight {
  const N = pts.length;
  const ds = new Float64Array(N);
  const cap = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) {
    const [ax, ay, az] = pts[i];
    const [bx, by, bz] = pts[i + 1];
    const h = Math.hypot(bx - ax, bz - az);
    ds[i] = Math.hypot(h, by - ay) || 1e-6;
    const sin2 = ((by - ay) / ds[i]) ** 2;
    cap[i] = m.cruise * (1 - sin2) + m.vert * sin2;
  }
  // heading of each step (where it moves over the ground), carried over the straight climbs and descents
  const head = new Float64Array(N);
  const valid: boolean[] = [];
  for (let i = 0; i < N - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dz = pts[i + 1][2] - pts[i][2];
    valid.push(Math.hypot(dx, dz) > 0.08 * ds[i]);
    head[i] = Math.atan2(-dz, dx);
  }
  let first = valid.indexOf(true);
  if (first < 0) first = 0;
  for (let i = 0; i < N; i++) {
    if (i < N - 1 && valid[i]) continue;
    head[i] = i < first ? head[first] : head[Math.max(0, i - 1)];
  }
  // speed at each sample: by steepness, slowed for turns, accelerating and braking within the make's limits
  const v = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let c = Math.min(cap[Math.max(0, i - 1)], cap[Math.min(N - 2, i)]);
    if (i > 0 && i < N - 1 && valid[i - 1] && valid[i]) {
      const turn = Math.abs(wrap(head[i] - head[i - 1]));
      if (turn > 1e-4) c = Math.min(c, Math.sqrt((m.turn * (ds[i - 1] + ds[i])) / 2 / turn));
    }
    v[i] = c;
  }
  if (!airStart) v[0] = 0;
  if (!airEnd) v[N - 1] = 0;
  for (let i = 1; i < N; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * m.acc * ds[i - 1]));
  for (let i = N - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * m.acc * ds[i]));
  const t = new Float32Array(N);
  for (let i = 1; i < N; i++) t[i] = t[i - 1] + ds[i - 1] / Math.max(0.05, (v[i - 1] + v[i]) / 2);
  const f: Flight = {
    n: N,
    p: new Float32Array(N * 3),
    t,
    yaw: new Float32Array(N),
    pitch: new Float32Array(N),
    roll: new Float32Array(N),
    vh: new Float32Array(N),
    spot: Uint8Array.from(spot),
    dur: t[N - 1],
    up: 0,
    down: t[N - 1],
  };
  pts.forEach((q, i) => f.p.set(q, i * 3));
  for (let i = 0; i < N; i++) {
    f.yaw[i] = head[Math.min(i, N - 2)];
    const k = Math.min(i, N - 2);
    const dx = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][2] - pts[k][2]);
    const dy = pts[k + 1][1] - pts[k][1];
    const along = dx / ds[k];
    f.vh[i] = v[i] * along;
    // nose up on a climb, down on a descent, as wings carry it; level when it hovers straight up or down
    f.pitch[i] = Math.max(-0.22, Math.min(0.22, 0.45 * Math.atan2(dy, Math.max(dx, 1e-3)))) * Math.min(1, Math.max(0, (along - 0.3) / 0.5));
  }
  // banked into its turns: tan(bank) = speed × turn rate / g (g in units per second squared)
  const g = 9.81 / 9.1;
  for (let i = 1; i < N - 1; i++) {
    const dt = t[i + 1] - t[i - 1];
    if (dt <= 0) continue;
    const w = wrap(f.yaw[i + 1] - f.yaw[i - 1]) / dt;
    f.roll[i] = Math.max(-m.bank, Math.min(m.bank, -Math.atan((v[i] * w) / g)));
  }
  for (let pass = 0; pass < 3; pass++) {
    const prev = f.roll.slice();
    for (let i = 1; i < N - 1; i++) f.roll[i] = (prev[i - 1] + prev[i] + prev[i + 1]) / 3;
  }
  // when the first climb ends and the last descent begins
  let a = 0;
  while (a < N - 1 && spot[a + 1] === 1) a++;
  let b = N - 1;
  while (b > 0 && spot[b - 1] === 1) b--;
  f.up = spot[0] === 1 ? t[a + 1 < N ? a + 1 : a] : 0;
  f.down = spot[N - 1] === 1 ? t[b - 1 >= 0 ? b - 1 : b] : f.dur;
  return f;
}

/** A pose: where, which way (heading as vehicles.ts builds them, nose along +x), pitch, bank, ground speed. */
export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; vh: number };

/** Where a flight is at time τ from its start (held at its ends). */
export function poseAt(f: Flight, tau: number, out: Pose): Pose {
  const t = f.t;
  let lo = 0;
  let hi = f.n - 1;
  if (tau <= 0) hi = 0;
  else if (tau >= f.dur) lo = hi;
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= tau) lo = mid;
      else hi = mid;
    }
  }
  const u = hi > lo ? (tau - t[lo]) / (t[hi] - t[lo]) : 0;
  const a = lo * 3;
  const b = hi * 3;
  out.x = f.p[a] + (f.p[b] - f.p[a]) * u;
  out.y = f.p[a + 1] + (f.p[b + 1] - f.p[a + 1]) * u;
  out.z = f.p[a + 2] + (f.p[b + 2] - f.p[a + 2]) * u;
  out.yaw = f.yaw[lo] + wrap(f.yaw[hi] - f.yaw[lo]) * u;
  out.pitch = f.pitch[lo] + (f.pitch[hi] - f.pitch[lo]) * u;
  out.roll = f.roll[lo] + (f.roll[hi] - f.roll[lo]) * u;
  out.vh = f.vh[lo] + (f.vh[hi] - f.vh[lo]) * u;
  return out;
}

/** Turn from heading a toward b by u (the shorter way). */
export const turnTo = (a: number, b: number, u: number): number => a + wrap(b - a) * u;

/* ------------------------------------------------------------------ cycles and timetables */

/**
 * A flier's round, as its timetable sees it: a cycle of `c` whole seconds made of stays (on a spot, `hidden` off the
 * map) and flights. Every round in the network takes a whole divisor of one period, so the whole network repeats.
 */
export type Leg = { at: number; dur: number; flight?: Flight; spot?: { x: number; y: number; z: number; yaw: number }; hidden?: boolean; from?: number };
export type Round = { c: number; legs: Leg[] };

/** A round's legs laid end to end: stays and flights in turn, each stay facing the way the last flight arrived. */
export function round(c: number, parts: ({ stay: number; x?: number; y?: number; z?: number; hidden?: boolean } | Flight)[]): Round {
  const legs: Leg[] = [];
  let at = 0;
  parts.forEach((q, i) => {
    if ("p" in q) {
      legs.push({ at, dur: q.dur, flight: q });
      at += q.dur;
      return;
    }
    // a stay faces as the flight before it arrived (round the cycle) and turns on its next climb
    const before = parts[(i - 1 + parts.length) % parts.length];
    const yaw = "p" in before ? before.yaw[before.n - 1] : 0;
    legs.push({ at, dur: q.stay, hidden: q.hidden, spot: q.hidden ? undefined : { x: q.x ?? 0, y: q.y ?? 0, z: q.z ?? 0, yaw } });
    at += q.stay;
  });
  // each flight's first climb turns from the stay's heading before it
  legs.forEach((l, i) => {
    if (!l.flight) return;
    const prev = legs[(i - 1 + legs.length) % legs.length];
    if (prev.spot) l.from = prev.spot.yaw;
  });
  return { c, legs };
}

/** Where a round puts its flier at time τ into its cycle; false when it is off the map. */
export function roundPose(r: Round, tau: number, out: Pose): boolean {
  let leg = r.legs[r.legs.length - 1];
  for (const l of r.legs) {
    if (tau < l.at + l.dur) {
      leg = l;
      break;
    }
  }
  if (leg.hidden) return false;
  if (leg.spot) {
    out.x = leg.spot.x;
    out.y = leg.spot.y;
    out.z = leg.spot.z;
    out.yaw = leg.spot.yaw;
    out.pitch = 0;
    out.roll = 0;
    out.vh = 0;
    return true;
  }
  const f = leg.flight as Flight;
  const u = tau - leg.at;
  poseAt(f, u, out);
  // turning on the first climb, from the way it stood to the way it leaves
  if (leg.from !== undefined && u < f.up) {
    const k = Math.max(0, Math.min(1, u / Math.max(0.1, f.up)));
    out.yaw = turnTo(leg.from, out.yaw, k * k * (3 - 2 * k));
  }
  return true;
}

/** A round sampled each second: x, y, z (NaN off the map) and whether it is in a port's own airspace then (`near`). */
export type Track = { c: number; x: Float32Array; y: Float32Array; z: Float32Array; spot: Uint8Array };

export function track(r: Round, near: (x: number, y: number, z: number) => boolean): Track {
  const c = r.c;
  const tr: Track = { c, x: new Float32Array(c), y: new Float32Array(c), z: new Float32Array(c), spot: new Uint8Array(c) };
  const p: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vh: 0 };
  for (let u = 0; u < c; u++) {
    const shown = roundPose(r, u, p);
    tr.x[u] = shown ? p.x : NaN;
    tr.y[u] = shown ? p.y : NaN;
    tr.z[u] = shown ? p.z : NaN;
    tr.spot[u] = shown && near(p.x, p.y, p.z) ? 1 : 0;
  }
  return tr;
}

/** A round's holds on its spots: from the start of its descent onto each to the end of its climb off it (round time, perhaps past the cycle's end). */
export function holds(r: Round): { at: { x: number; z: number }; span: [number, number] }[] {
  const out: { at: { x: number; z: number }; span: [number, number] }[] = [];
  r.legs.forEach((l, i) => {
    if (!l.spot) return;
    const before = r.legs[(i - 1 + r.legs.length) % r.legs.length];
    const after = r.legs[(i + 1) % r.legs.length];
    const a = before.flight ? before.at + before.flight.down : l.at;
    let b = after.flight ? after.at + after.flight.up : l.at + l.dur;
    let a0 = a;
    if (i === 0) a0 = a - r.c;
    if (b < a0) b += r.c;
    out.push({ at: { x: l.spot.x, z: l.spot.z }, span: [a0, b] });
  });
  return out;
}

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Closest approach of two points moving straight from a0 to a1 and b0 to b1 over the same second. */
export function closest(a0x: number, a0y: number, a0z: number, a1x: number, a1y: number, a1z: number, b0x: number, b0y: number, b0z: number, b1x: number, b1y: number, b1z: number): number {
  const rx = a0x - b0x;
  const ry = a0y - b0y;
  const rz = a0z - b0z;
  const vx = a1x - b1x - rx;
  const vy = a1y - b1y - ry;
  const vz = a1z - b1z - rz;
  const vv = vx * vx + vy * vy + vz * vz;
  const u = vv > 1e-9 ? Math.max(0, Math.min(1, -(rx * vx + ry * vy + rz * vz) / vv)) : 0;
  return Math.hypot(rx + vx * u, ry + vy * u, rz + vz * u);
}

/** A track's bounds over each run of 16 seconds (and the second after, which its last step reaches), for quick rejection. */
export type Chunks = { x0: Float32Array; x1: Float32Array; y0: Float32Array; y1: Float32Array; z0: Float32Array; z1: Float32Array; n: number };
export const RUN = 16;
const chunkCache = new WeakMap<Track, Chunks>();
export function chunks(tr: Track): Chunks {
  const known = chunkCache.get(tr);
  if (known) return known;
  const n = Math.ceil(tr.c / RUN);
  const ch: Chunks = { x0: new Float32Array(n).fill(Infinity), x1: new Float32Array(n).fill(-Infinity), y0: new Float32Array(n).fill(Infinity), y1: new Float32Array(n).fill(-Infinity), z0: new Float32Array(n).fill(Infinity), z1: new Float32Array(n).fill(-Infinity), n };
  for (let k = 0; k < n; k++) {
    for (let u = k * RUN; u <= Math.min(tr.c, (k + 1) * RUN); u++) {
      const w = u % tr.c;
      if (Number.isNaN(tr.x[w])) continue;
      ch.x0[k] = Math.min(ch.x0[k], tr.x[w]);
      ch.x1[k] = Math.max(ch.x1[k], tr.x[w]);
      ch.y0[k] = Math.min(ch.y0[k], tr.y[w]);
      ch.y1[k] = Math.max(ch.y1[k], tr.y[w]);
      ch.z0[k] = Math.min(ch.z0[k], tr.z[w]);
      ch.z1[k] = Math.max(ch.z1[k], tr.z[w]);
    }
  }
  chunkCache.set(tr, ch);
  return ch;
}

/**
 * Which offsets between two rounds bring them too close: for A at offset oA and B at oB (each at (t + o) mod c of its
 * round at time t), a conflict wherever (oA − oB) mod g is marked, g = gcd(cA, cB). `sep(spotA, spotB)` is the least
 * distance, by whether each is over its spot. Null when nothing ever conflicts.
 */
export function conflicts(A: Track, B: Track, sep: (a: number, b: number) => number): { g: number; bad: Uint8Array } | null {
  const g = gcd(A.c, B.c);
  const ca = chunks(A);
  const cb = chunks(B);
  const far = Math.max(sep(0, 0), sep(1, 1), sep(0, 1), sep(1, 0));
  let bad: Uint8Array | null = null;
  for (let i = 0; i < ca.n; i++) {
    if (!(ca.x1[i] >= ca.x0[i])) continue;
    for (let j = 0; j < cb.n; j++) {
      if (ca.x0[i] - far > cb.x1[j] || cb.x0[j] - far > ca.x1[i] || ca.z0[i] - far > cb.z1[j] || cb.z0[j] - far > ca.z1[i] || ca.y0[i] - far > cb.y1[j] || cb.y0[j] - far > ca.y1[i]) continue;
      for (let u = i * RUN; u < Math.min(A.c, (i + 1) * RUN); u++) {
        const u1 = (u + 1) % A.c;
        if (Number.isNaN(A.x[u]) || Number.isNaN(A.x[u1])) continue;
        for (let w = j * RUN; w < Math.min(B.c, (j + 1) * RUN); w++) {
          const w1 = (w + 1) % B.c;
          if (Number.isNaN(B.x[w]) || Number.isNaN(B.x[w1])) continue;
          const d = closest(A.x[u], A.y[u], A.z[u], A.x[u1], A.y[u1], A.z[u1], B.x[w], B.y[w], B.z[w], B.x[w1], B.y[w1], B.z[w1]);
          if (d >= far) continue;
          if (d < sep(A.spot[u] | A.spot[u1], B.spot[w] | B.spot[w1])) {
            bad ??= new Uint8Array(g);
            bad[(((u - w) % g) + g) % g] = 1;
          }
        }
      }
    }
  }
  return bad ? { g, bad } : null;
}

/**
 * The network's timetable as it is drawn up: the rounds placed so far at their offsets, and for any two tracks the
 * offsets between them that would bring their fliers too close (worked out once per pair). `sep(a, b, spotA, spotB)`
 * is the least distance between fliers of kinds a and b, by whether each is over its spot.
 */
export class Timetable {
  readonly placed: { tr: Track; o: number; kind: number }[] = [];
  private ids = new Map<Track, number>();
  private memo = new Map<string, { g: number; bad: Uint8Array } | null>();
  constructor(private sep: (a: number, b: number, spotA: number, spotB: number) => number) {}

  private id(tr: Track): number {
    let i = this.ids.get(tr);
    if (i === undefined) this.ids.set(tr, (i = this.ids.size));
    return i;
  }

  /** Whether a round on track a at offset oa (a flier of kind ka) would come too close to one on b at ob (kind kb). */
  clash(a: Track, oa: number, ka: number, b: Track, ob: number, kb: number): boolean {
    const k = `${this.id(a)}|${this.id(b)}`;
    let cf = this.memo.get(k);
    if (cf === undefined) {
      cf = conflicts(a, b, (sa, sb) => this.sep(ka, kb, sa, sb));
      this.memo.set(k, cf);
    }
    return !!cf && cf.bad[(((oa - ob) % cf.g) + cf.g) % cf.g] === 1;
  }

  /** How many of the placed rounds a round on `tr` at offset o would come too close to. */
  count(tr: Track, o: number, kind: number): number {
    let n = 0;
    for (const p of this.placed) if (this.clash(tr, o, kind, p.tr, p.o, p.kind)) n++;
    return n;
  }

  place(tr: Track, o: number, kind: number): void {
    this.placed.push({ tr, o, kind });
  }
}

/** Marks offsets at which two holds (each a span of whole seconds round its own cycle) would overlap, `gap` seconds apart at least. */
export function holdClash(cA: number, a: [number, number], cB: number, b: [number, number], gap: number): { g: number; bad: Uint8Array } | null {
  const g = gcd(cA, cB);
  const bad = new Uint8Array(g);
  for (let u = Math.floor(a[0] - gap); u <= Math.ceil(a[1] + gap); u++) for (let w = Math.floor(b[0]); w <= Math.ceil(b[1]); w++) bad[(((u - w) % g) + g) % g] = 1;
  return { g, bad };
}
