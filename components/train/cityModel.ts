/**
 * The city's street grid, districts, traffic runs and people as data. Buildings live in buildings/, trees in
 * trees/, sites in sites.ts. Pure (no DOM, no React); the scene components turn these into meshes.
 */
import { stations } from "@/data";

import { PEOPLE_VARIANTS } from "./constants";
import { inLandmark, inPark } from "./sites";
import { inWater } from "./terrain";
import { cutNear, frameAt, groundAt, LEN, makeFrame, stationS, trackDist } from "./track";

/* ------------------------------------------------------------------ random */
/** Seeded so the same city is built on every visit (and in every screenshot). */
export class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/* ------------------------------------------------------------------ streets */
// One 512 px ground tile = 44 units: an arterial (4 lanes) and a local street (2 lanes) with sidewalks; blocks between are 22 units.
export const STREET_STEP = 22;
export const STREET_X0 = 12;
export const STREET_Z0 = 18;
export const streetX = (i: number): number => STREET_X0 + STREET_STEP * i;
export const streetZ = (j: number): number => STREET_Z0 + STREET_STEP * j;
export const arterialX = (i: number): boolean => (((streetX(i) + 1000) % 44) + 44) % 44 === 0;
export const arterialZ = (j: number): boolean => (((1360 - streetZ(j)) % 44) + 44) % 44 === 0;
export const BI0 = -14;
export const BI1 = 41;
export const BJ0 = -4;
export const BJ1 = 37;

/* ------------------------------------------------------------------ sites */
// Parks, landmarks and the camera blockers live in sites.ts (they register terrain pads); water comes from the DEM.
export { BLOCKERS, inLandmark, inPark, LANDMARKS, PARKS, pushOut, type Blocker, type LandmarkKey, type Park, type PlacedLandmark } from "./sites";
export { inWater } from "./terrain";

/* ------------------------------------------------------------------ districts */
export type District =
  | "forest"
  | "park"
  | "gastown"
  | "downtown"
  | "westend"
  | "flats"
  | "mountpleasant"
  | "commercial"
  | "joyce"
  | "cut"
  | "residential";

export function district(x: number, z: number): District {
  if (x > -470 && x < -150 && z > -420 && z < -40) return "forest"; // Stanley Park
  if (inPark(x, z)) return "park";
  if (x > 8 && x < 100 && z > 12 && z < 100 && !(z > 62 && x < 32)) return "gastown";
  if (Math.hypot(x + 20, z - 40) < 100) return "downtown";
  if (x < -120 && z < 130) return "westend";
  if (cutNear(x, z) > 0.3) return "cut";
  if (x > 95 && x < 240 && z > 95 && z < 215) return "flats";
  if (x > 15 && x < 200 && z > 185 && z < 300) return "mountpleasant";
  if (Math.hypot(x - 344, z - 298) < 70) return "commercial";
  if (Math.hypot(x - 643, z - 585) < 60) return "joyce";
  return "residential";
}

/* ------------------------------------------------------------------ traffic */
/**
 * A car on a street's circuit: out along one lane, a U-turn at the end of the street, back along the other and round
 * again. `u` is its place on the circuit; every car on a street shares one speed, so they stay evenly spaced.
 */
export type CarRun = { axis: "x" | "z"; line: number; half: number; a: number; b: number; u: number; speed: number };

/** Where a car is on its circuit: world x, z and the yaw that turns the body (built nose along +x) to its heading. */
export function carPose(c: CarRun, out: { x: number; z: number; yaw: number }): void {
  const L = c.b - c.a;
  const R = c.half;
  const turn = Math.PI * R;
  const P = 2 * L + 2 * turn;
  const u = ((c.u % P) + P) % P;
  // the outward lane keeps to the right: south of an east–west line, west of a north–south one
  const latF = c.axis === "x" ? c.half : -c.half;
  let along: number;
  let lat: number;
  let da: number;
  let dl: number;
  if (u < L) {
    along = c.a + u;
    lat = latF;
    da = 1;
    dl = 0;
  } else if (u < L + turn) {
    const t = (u - L) / R;
    along = c.b + R * Math.sin(t);
    lat = latF * Math.cos(t);
    da = R * Math.cos(t);
    dl = -latF * Math.sin(t);
  } else if (u < 2 * L + turn) {
    along = c.b - (u - L - turn);
    lat = -latF;
    da = -1;
    dl = 0;
  } else {
    const t = (u - 2 * L - turn) / R;
    along = c.a - R * Math.sin(t);
    lat = -latF * Math.cos(t);
    da = -R * Math.cos(t);
    dl = latF * Math.sin(t);
  }
  const dx = c.axis === "x" ? da : dl;
  const dz = c.axis === "x" ? dl : da;
  out.x = c.axis === "x" ? along : c.line + lat;
  out.z = c.axis === "x" ? c.line + lat : along;
  out.yaw = Math.atan2(-dz, dx);
}

/** Every street the ground shows is cut into runs (dry land, clear of parks and monuments); cars circle each run. */
export function buildCars(rng: Rng, CAR_N: number, streets: (x: number, z: number) => boolean): CarRun[] {
  type Line = { axis: "x" | "z"; line: number; half: number; lo: number; hi: number };
  const lines: Line[] = [];
  // the north–south local streets are back lanes (see the ground tile): traffic keeps to the arterials there
  for (let i = BI0; i <= BI1; i++) if (arterialX(i)) lines.push({ axis: "z", line: streetX(i), half: 1.3, lo: -60, hi: 810 });
  for (let j = BJ0; j <= BJ1; j++) lines.push({ axis: "x", line: streetZ(j), half: arterialZ(j) ? 1.3 : 0.8, lo: -310, hi: 890 });
  const blocked = (x: number, z: number) => inWater(x, z) || inLandmark(x, z, 1) || inPark(x, z) || !streets(x, z);
  type Run = { axis: "x" | "z"; line: number; half: number; a: number; b: number };
  const runs: Run[] = [];
  for (const L of lines) {
    let start: number | null = null;
    for (let p = L.lo; p <= L.hi; p += 2) {
      const x = L.axis === "x" ? p : L.line;
      const z = L.axis === "x" ? L.line : p;
      const ok = !blocked(x, z);
      if (ok && start === null) start = p;
      if ((!ok || p + 2 > L.hi) && start !== null) {
        if (p - start >= 60) runs.push({ axis: L.axis, line: L.line, half: L.half, a: start + 4, b: p - 4 });
        start = null;
      }
    }
  }
  const circuit = (r: Run) => 2 * (r.b - r.a) + 2 * Math.PI * r.half;
  const total = runs.reduce((t, r) => t + circuit(r), 0);
  const cars: CarRun[] = [];
  for (const r of runs) {
    const P = circuit(r);
    const n = Math.min(Math.max(1, Math.round((P / total) * CAR_N)), Math.floor(P / 9));
    const hv = Math.sin(r.line * 12.9898 + r.a * 78.233) * 43758.5453;
    const speed = 6 + (hv - Math.floor(hv)) * 7;
    const u0 = rng.next() * P;
    for (let k = 0; k < n && cars.length < CAR_N; k++) cars.push({ axis: r.axis, line: r.line, half: r.half, a: r.a, b: r.b, u: u0 + (P * k) / n, speed });
  }
  return cars;
}

/* ------------------------------------------------------------------ people */
export type Person = {
  x: number;
  y: number;
  z: number;
  axis: "x" | "z";
  dir: 1 | -1;
  move: number;
  /** The stretch of street a walker paces, along its axis: never past a park, a set or the end of the street. */
  lo: number;
  hi: number;
  /** Billboard variant and instance index within it. */
  v: number;
  k: number;
};

/** Fourteen per station on both platforms, the rest walking the sidewalks within 70 units of the line. */
export function buildPeople(rng: Rng, PEOPLE_N: number, streets: (x: number, z: number) => boolean): { people: Person[]; counts: number[] } {
  const people: Person[] = [];
  const counts = new Array<number>(PEOPLE_VARIANTS).fill(0);
  const add = (h: Omit<Person, "v" | "k">) => {
    const v = people.length % PEOPLE_VARIANTS;
    people.push({ ...h, v, k: counts[v]++ });
  };
  const f = makeFrame();
  stations.forEach((_, i) => {
    frameAt(stationS[i], f);
    for (let k = 0; k < 14 && people.length < PEOPLE_N; k++) {
      const side = k % 2 ? 1 : -1;
      const along = -11 + rng.next() * 22;
      const lat = side * (7.4 + rng.next() * 2.8);
      const p = f.p.clone().addScaledVector(f.t, along).addScaledVector(f.r, -lat);
      add({ x: p.x, y: p.y + 1.4, z: p.z, move: 0, dir: 1, axis: "x", lo: 0, hi: 0 });
    }
  });
  // a few on the BC Parkway, the greenway under the guideway, where the deck is high enough to walk beneath
  for (let k = 0; k < 60 && people.length < PEOPLE_N; k++) {
    frameAt(rng.next() * LEN, f);
    if (inWater(f.p.x, f.p.z) || f.p.y - groundAt(f.p.x, f.p.z) < 5) continue;
    const p = f.p.clone().addScaledVector(f.r, (rng.next() - 0.5) * 2.4);
    add({ x: p.x, y: groundAt(p.x, p.z), z: p.z, move: 0, dir: 1, axis: "x", lo: 0, hi: 0 });
  }
  let tries = 0;
  while (people.length < PEOPLE_N && tries++ < PEOPLE_N * 30) {
    const axis: "x" | "z" = rng.next() < 0.5 ? "x" : "z";
    const i = Math.floor(BI0 + rng.next() * (BI1 - BI0));
    const j = Math.floor(BJ0 + rng.next() * (BJ1 - BJ0));
    if (axis === "z" && !arterialX(i)) continue;
    const line = axis === "x" ? streetZ(j) : streetX(i);
    const walk = (axis === "x" ? arterialZ(j) : arterialX(i)) ? 3.0 : 2.0;
    const side = rng.next() < 0.5 ? walk : -walk;
    const pos = axis === "x" ? -310 + rng.next() * 1200 : -60 + rng.next() * 870;
    const x = axis === "x" ? pos : line + side;
    const z = axis === "x" ? line + side : pos;
    const d = trackDist(x, z);
    if (d < 9 || d > 70 || inWater(x, z) || inLandmark(x, z, 2) || inPark(x, z) || !streets(x, z)) continue;
    const open = (a: number) => {
      const ax = axis === "x" ? a : x;
      const az = axis === "x" ? z : a;
      return !inWater(ax, az) && !inLandmark(ax, az, 1) && !inPark(ax, az) && streets(ax, az);
    };
    let lo = pos;
    let hi = pos;
    while (lo > pos - 30 && open(lo - 2)) lo -= 2;
    while (hi < pos + 30 && open(hi + 2)) hi += 2;
    add({ x, y: groundAt(x, z), z, axis, dir: rng.next() < 0.5 ? 1 : -1, move: hi - lo > 6 ? 0.8 + rng.next() * 0.6 : 0, lo, hi });
  }
  return { people, counts };
}
