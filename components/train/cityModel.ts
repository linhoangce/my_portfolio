/**
 * The city's street grid, districts, traffic runs and people as data. Buildings live in buildings/, trees in
 * trees/, sites in sites.ts. Pure (no DOM, no React); the scene components turn these into meshes.
 */
import { FEATURES, inPoly, onFeature, PLACES } from "./commonsLayout";
import { onSquareFixture, SQUARES, squareXZ } from "./sets/squares";
import { wellnessPeople } from "./sets/wellness";
import { fromStation } from "./sets/zones";
import { busNetwork } from "./buses";
import { inFairmont } from "./fairmont";
import { FORECOURT_DECK, inHarbourGreen, onGreenCafe, onQuay, PLAZA_SOUTH, PLAZA_X, promenadeStretches, standY } from "./harbourfront";
import { stations } from "@/data";

import { CELL_WHEELCHAIR, PEOPLE_CELLS, WALK_CELLS } from "./constants";
import { roads, WALK } from "./roadNetwork";
import { inLandmark, inPark } from "./sites";
import { inWater, polySdf } from "./terrain";
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
export const BI1 = 44;
export const BJ0 = -4;
export const BJ1 = 38;

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

/* ------------------------------------------------------------------ people */
export type Person = {
  x: number;
  y: number;
  z: number;
  /** A walker paces a straight stretch of sidewalk: from (ox, oz) along (ux, uz), between lo and hi, now at pos. */
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  pos: number;
  dir: 1 | -1;
  move: number;
  lo: number;
  hi: number;
  /** Billboard variant and instance index within it. */
  v: number;
  k: number;
};

/** Fourteen per station on both platforms, a few on the BC Parkway, the rest walking the sidewalks within 70 units of the line. */
export function buildPeople(rng: Rng, PEOPLE_N: number, commonsCovered: (x: number, z: number) => boolean = () => false, access: { x: number; y: number; z: number }[] = []): { people: Person[]; counts: number[] } {
  const people: Person[] = [];
  const counts = new Array<number>(PEOPLE_CELLS).fill(0);
  // the atlas's cells in turn (or the one asked for); a wheelchair user does not pace the sidewalk's stride
  let turn = 0;
  const add = (h: Omit<Person, "v" | "k" | "ox" | "oz" | "ux" | "uz" | "pos" | "lo" | "hi" | "dir" | "move"> & Partial<Person>) => {
    const v = h.v ?? WALK_CELLS[turn++ % WALK_CELLS.length];
    const p: Person = { ox: h.x, oz: h.z, ux: 1, uz: 0, pos: 0, lo: 0, hi: 0, dir: 1, move: 0, ...h, v, k: people.length };
    if (v === CELL_WHEELCHAIR) p.move = Math.min(p.move, 0.5);
    counts[v]++;
    people.push(p);
  };
  const f = makeFrame();
  stations.forEach((_, i) => {
    frameAt(stationS[i], f);
    for (let k = 0; k < 14 && people.length < PEOPLE_N; k++) {
      const side = k % 2 ? 1 : -1;
      const along = -11 + rng.next() * 22;
      const lat = side * (7.4 + rng.next() * 2.8);
      const p = f.p.clone().addScaledVector(f.t, along).addScaledVector(f.r, -lat);
      add({ x: p.x, y: p.y + 1.4, z: p.z });
    }
  });
  // a few on the BC Parkway, the greenway under the guideway, where the deck is high enough to walk beneath
  for (let k = 0; k < 60 && people.length < PEOPLE_N; k++) {
    frameAt(rng.next() * LEN, f);
    if (inWater(f.p.x, f.p.z) || f.p.y - groundAt(f.p.x, f.p.z) < 5) continue;
    const p = f.p.clone().addScaledVector(f.r, (rng.next() - 0.5) * 2.4);
    add({ x: p.x, y: standY(p.x, p.z), z: p.z });
  }
  // the crowd on the plaza at Waterfront, the line's busiest place: some standing about, most crossing it
  for (let k = 0; k < 40 && people.length < PEOPLE_N; k++) {
    const a = -22 + rng.next() * 44;
    const l = 15 + rng.next() * 19;
    // not in the Canada Line's hall
    if (a > -22 && a < -4 && l > 16 && l < 28) continue;
    const [x, z] = fromStation(0, a, l);
    const [x2, z2] = fromStation(0, a + 1, l);
    const ux = x2 - x;
    const uz = z2 - z;
    const walk = k % 3 !== 0;
    add({ x, y: standY(x, z) + 0.15, z, ox: x, oz: z, ux, uz, pos: 0, lo: -6, hi: 6, dir: rng.next() < 0.5 ? 1 : -1, move: walk ? 0.7 + rng.next() * 0.5 : 0 });
  }
  // about the squares, the Harbour Market at Waterfront and Commercial–Broadway's: off their pavilions, stalls and
  // fountains, and clear of the guideway; some standing, most strolling a few paces back and forth
  for (const sq of SQUARES) {
    for (const { box, n } of sq.crowds) {
      const [a0, a1, l0, l1] = box;
      let placed = 0;
      for (let k = 0; k < n * 5 && placed < n && people.length < PEOPLE_N; k++) {
        const a = a0 + rng.next() * (a1 - a0);
        const l = l0 + rng.next() * (l1 - l0);
        const [x, z] = squareXZ(sq, a, l);
        if (onSquareFixture(sq, a, l) || inWater(x, z) || trackDist(x, z) < 6.5 || inLandmark(x, z, 1) || inFairmont(x, z, 0.6)) continue;
        // a stroll along a or l, only if its whole length keeps clear too
        const alongA = rng.next() < 0.5;
        const [x2, z2] = squareXZ(sq, a + (alongA ? 1 : 0), l + (alongA ? 0 : 1));
        const clear = [-3, -1.5, 1.5, 3].every((s) => {
          const sa = a + (alongA ? s : 0);
          const sl = l + (alongA ? 0 : s);
          const [sx, sz] = squareXZ(sq, sa, sl);
          return !onSquareFixture(sq, sa, sl) && !inWater(sx, sz) && trackDist(sx, sz) >= 6.5 && !inFairmont(sx, sz, 0.6);
        });
        const move = clear && rng.next() < 0.65 ? 0.6 + rng.next() * 0.5 : 0;
        add({ x, y: standY(x, z) + 0.15, z, ox: x, oz: z, ux: x2 - x, uz: z2 - z, pos: 0, lo: -3, hi: 3, dir: rng.next() < 0.5 ? 1 : -1, move });
        placed++;
      }
    }
  }
  // about downtown's open places (commonsLayout.ts): on their lawns and paving, off what stands there and the guideway's
  // columns; some standing, most strolling, and a few gathered in front of the stage
  for (const place of PLACES) {
    const xs = place.poly.map(([x]) => x);
    const zs = place.poly.map(([, z]) => z);
    let placed = 0;
    for (let k = 0; k < place.crowd * 8 && placed < place.crowd && people.length < PEOPLE_N; k++) {
      const x = Math.min(...xs) + rng.next() * (Math.max(...xs) - Math.min(...xs));
      const z = Math.min(...zs) + rng.next() * (Math.max(...zs) - Math.min(...zs));
      if (!inPoly(place.poly, x, z) || !commonsCovered(x, z) || onFeature(x, z, 0.4) || trackDist(x, z) < 3.5) continue;
      const ang = rng.next() * Math.PI * 2;
      const ux = Math.cos(ang);
      const uz = Math.sin(ang);
      const clear = [-2.5, 2.5].every((s) => commonsCovered(x + ux * s, z + uz * s) && !onFeature(x + ux * s, z + uz * s, 0.4));
      const move = clear && rng.next() < 0.6 ? 0.55 + rng.next() * 0.5 : 0;
      add({ x, y: standY(x, z) + 0.12, z, ox: x, oz: z, ux, uz, pos: 0, lo: -2.5, hi: 2.5, dir: rng.next() < 0.5 ? 1 : -1, move });
      placed++;
    }
  }
  // Patterson's wellness park: players on the courts, people at the gym, the yoga class; and people at the stations'
  // fare gates
  for (const p of [...wellnessPeople(), ...access]) if (people.length < PEOPLE_N) add(p);
  for (const f of FEATURES) {
    if (f.kind !== "stage") continue;
    for (let k = 0; k < 9 && people.length < PEOPLE_N; k++) {
      // in front of it (its +z), in a loose crowd
      const lx = (rng.next() - 0.5) * 7;
      const lz = 4 + rng.next() * 4;
      const c = Math.cos(f.ry ?? 0);
      const s = Math.sin(f.ry ?? 0);
      const x = f.x + lx * c + lz * s;
      const z = f.z - lx * s + lz * c;
      if (commonsCovered(x, z)) add({ x, y: standY(x, z) + 0.12, z });
    }
  }
  // waiting at the bus stops, under the shelters and the exchanges' canopies
  for (const st of busNetwork().stops) {
    const n = st.exchange ? 4 : rng.next() < 0.6 ? 2 : 1;
    for (let k = 0; k < n && people.length < PEOPLE_N; k++) {
      // along the shelter (local x), in front of it toward the kerb
      const along = (rng.next() - 0.5) * (st.exchange ? 7 : 2);
      const out = 0.7 + rng.next() * 0.5;
      const x = st.x + Math.cos(st.ry) * along + Math.sin(st.ry) * out;
      const z = st.z - Math.sin(st.ry) * along + Math.cos(st.ry) * out;
      add({ x, y: standY(x, z) + 0.1, z });
    }
  }
  // strolling the seawall promenade by Canada Place, and about Jack Poole Plaza
  for (const st of promenadeStretches()) {
    for (let k = 0; k < 2 && people.length < PEOPLE_N; k++) {
      const off = (rng.next() - 0.5) * 1.6;
      const ox = st.ox - st.uz * off;
      const oz = st.oz + st.ux * off;
      const pos = rng.next() * st.L;
      const x = ox + st.ux * pos;
      const z = oz + st.uz * pos;
      add({ x, y: standY(x, z) + 0.1, z, ox, oz, ux: st.ux, uz: st.uz, pos, lo: 0, hi: st.L, dir: rng.next() < 0.5 ? 1 : -1, move: 0.6 + rng.next() * 0.5 });
    }
  }
  // about the forecourt's deck at the foot of the Canada Place pier
  const fx = FORECOURT_DECK.map(([x]) => x);
  const fz = FORECOURT_DECK.map(([, z]) => z);
  for (let k = 0, n = 0; k < 60 && n < 10 && people.length < PEOPLE_N; k++) {
    const x = Math.min(...fx) + 1 + rng.next() * (Math.max(...fx) - Math.min(...fx) - 2);
    const z = Math.min(...fz) + 1 + rng.next() * (Math.max(...fz) - Math.min(...fz) - 2);
    if (!onQuay(x, z, -0.8) || polySdf(FORECOURT_DECK, x, z) > -0.8 || onFeature(x, z, 0.5)) continue;
    add({ x, y: standY(x, z) + 0.15, z, ox: x, oz: z, ux: 1, uz: 0, pos: 0, lo: -2.5, hi: 2.5, dir: rng.next() < 0.5 ? 1 : -1, move: rng.next() < 0.5 ? 0.7 : 0 });
    n++;
  }
  // on Harbour Green's lawns, off its cafés
  for (let k = 0, n = 0; k < 80 && n < 12 && people.length < PEOPLE_N; k++) {
    const x = -160 + rng.next() * 44;
    const z = -86 + rng.next() * 36;
    if (!inHarbourGreen(x, z, -0.8) || onGreenCafe(x, z, 0.3)) continue;
    add({ x, y: standY(x, z) + 0.1, z });
    n++;
  }
  for (let k = 0; k < 8 && people.length < PEOPLE_N; k++) {
    const x = PLAZA_X[0] + 2 + rng.next() * (PLAZA_X[1] - PLAZA_X[0] - 4);
    const z = PLAZA_SOUTH - 2 - rng.next() * 6;
    add({ x, y: standY(x, z) + 0.13, z });
  }
  // the rest on the sidewalks of the drawn streets near the line, each pacing a straight stretch of one
  const { edges } = roads();
  const near = edges.filter((e) => {
    const n = e.pts.length / 2;
    const d = trackDist(e.pts[(n >> 1) * 2], e.pts[(n >> 1) * 2 + 1]);
    return d > 9 && d < 70 && e.cls > 0;
  });
  let tries = 0;
  while (people.length < PEOPLE_N && near.length && tries++ < PEOPLE_N * 20) {
    const e = near[Math.floor(rng.next() * near.length)];
    const i = Math.floor(rng.next() * (e.pts.length / 2 - 1));
    if (!e.shown[i]) continue;
    const ax = e.pts[i * 2];
    const az = e.pts[i * 2 + 1];
    const L = e.cum[i + 1] - e.cum[i];
    if (L < 6) continue;
    const ux = (e.pts[i * 2 + 2] - ax) / L;
    const uz = (e.pts[i * 2 + 3] - az) / L;
    // on the sidewalk, either side: left of a → b is (uz, -ux)
    const side = rng.next() < 0.5 ? 1 : -1;
    const off = side * (e.half - WALK[e.cls] / 2);
    const ox = ax + uz * off;
    const oz = az - ux * off;
    const pos = 1 + rng.next() * (L - 2);
    const x = ox + ux * pos;
    const z = oz + uz * pos;
    if (inWater(x, z) || inLandmark(x, z, 2) || inPark(x, z) || trackDist(x, z) < 9) continue;
    add({ x, y: standY(x, z), z, ox, oz, ux, uz, pos, lo: 1, hi: L - 1, dir: rng.next() < 0.5 ? 1 : -1, move: L > 8 ? 0.8 + rng.next() * 0.6 : 0 });
  }
  return { people, counts };
}
