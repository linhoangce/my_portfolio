/**
 * The two busiest squares on the line, laid out in their sets' frames (along the track from the set's origin, lateral
 * toward its side; SET_SHIFT applies).
 *
 * The set builder makes them, the tree layer plants their trees, the crowd fills them and keeps off their pavilions.
 *
 * Commercial–Broadway: the block between Broadway, Commercial Drive and Clark Drive is one square.
 * - The Ocean Science Centre is raised on columns at platform height in its northern half, square to Broadway, with
 *   cafés and restaurants in glass pavilions under it.
 * - East 12th Avenue runs through the square as a market street of stalls under festoon lights; Woodland Drive is a
 *   lane across it.
 * - The southern half holds restaurants on their decks, food trucks, a splash fountain and trees.
 *
 * Waterfront: the Harbour Market. It fills the ground the line loops round, from the harbour's edge past the cedar's
 * canopy to Granville:
 * - pavilions on the water;
 * - food trucks along the guideway;
 * - café tables under the canopy;
 * - restaurants, a splash fountain and a stage south of it.
 *
 * Pure layout, no three.js.
 */
import { fromStation, SET_SHIFT } from "./zones";
import type { SpeciesId } from "../trees/species";

/** A pavilion: its glass box's centre, width across its front, depth, and which way its front faces (da, dl). */
export type Pav = { a: number; l: number; w: number; d: number; face: [number, number]; name: string; umbrella: number; well?: boolean; front?: number; roof?: "dark" | "green" | "timber"; h?: number };
/** A market stall or food truck: where it stands and which way it serves (da, dl). */
export type Spot = { a: number; l: number; face: [number, number]; hex: number };
export type Square = {
  i: number;
  pavilions: Pav[];
  stalls: Spot[];
  trucks: Spot[];
  trees: { a: number; l: number; sp: SpeciesId; s: number }[];
  /** Splash fountains: centre and radius. */
  pools: [number, number, number][];
  /** Tables under umbrellas out in the open: where, and the umbrella's colour. */
  seats: [number, number, number][];
  /** A small stage for buskers and bands, facing (da, dl). */
  stage?: Spot;
  /** Where people stand about and stroll: (a0, a1, l0, l1) boxes and how many in each. */
  crowds: { box: [number, number, number, number]; n: number }[];
};

/** The Ocean Science Centre's hall over the square (Commercial–Broadway's frame). */
export const OCEAN_HALL = { a0: -17, a1: 0, l0: 29.5, l1: 57.5 };

/**
 * East 12th Avenue across the square, as the street data has it, from Commercial Drive to Clark Drive (the set's
 * frame), and Woodland Drive's lane from 12th south.
 */
export const MARKET_STREET: [number, number][] = [
  [10.1, 21.5],
  [7.9, 38.4],
  [4.9, 64.5],
];
export const MARKET_HALF = 3.44;
export const WOODLAND_LANE: [number, number][] = [
  [7.9, 38.4],
  [18.4, 39.6],
  [30, 41],
];

/** The streets round Commercial–Broadway's square, as the street data has them (the set's frame). */
const COMMERCIAL: [number, number][] = [
  [-23.5, 17.6],
  [10.1, 21.5],
  [41.2, 25.1],
];
const BROADWAY: [number, number][] = [
  [-23.5, 17.6],
  [-25.4, 34.3],
  [-27.3, 49.7],
  [-27, 65.8],
];
const CLARK: [number, number][] = [
  [-27, 65.8],
  [1.2, 68.3],
  [10.8, 69.3],
  [21.5, 70.1],
  [26.4, 67.7],
];
const KNIGHT: [number, number][] = [
  [26.4, 67.7],
  [28.4, 66.5],
  [31.2, 63.3],
  [35, 60.7],
  [42.6, 59.5],
];
/** A polyline's other coordinate where its coordinate `by` (0 for a, 1 for l) is x, held at its ends beyond them. */
function lerpAt(line: [number, number][], x: number, by: 0 | 1): number {
  const o = 1 - by;
  for (let k = 1; k < line.length; k++) {
    const p = line[k - 1];
    const q = line[k];
    if (x >= Math.min(p[by], q[by]) && x <= Math.max(p[by], q[by])) return p[o] + ((q[o] - p[o]) * (x - p[by])) / (q[by] - p[by] || 1);
  }
  return Math.abs(x - line[0][by]) < Math.abs(x - line[line.length - 1][by]) ? line[0][o] : line[line.length - 1][o];
}
/** In Commercial–Broadway's square: within its streets' sidewalks, short of the park to its south. */
export function inCbSquare(a: number, l: number, pad = 0): boolean {
  const kerb = 3.44 + 0.9 + pad;
  if (a > 29.5 - pad) return false;
  if (l < lerpAt(COMMERCIAL, a, 0) + kerb || l > lerpAt(CLARK, a, 0) - kerb) return false;
  if (a < lerpAt(BROADWAY, l, 1) + kerb) return false;
  return !(a > 26.4 && l > lerpAt(KNIGHT, a, 0) - kerb);
}

/** The point and unit direction (da, dl) at distance s along a polyline of (a, l). */
export function along(line: [number, number][], s: number): { a: number; l: number; ua: number; ul: number } {
  let rest = s;
  for (let k = 1; k < line.length; k++) {
    const [a0, l0] = line[k - 1];
    const [a1, l1] = line[k];
    const L = Math.hypot(a1 - a0, l1 - l0);
    if (rest <= L || k === line.length - 1) {
      const t = rest / L;
      return { a: a0 + (a1 - a0) * t, l: l0 + (l1 - l0) * t, ua: (a1 - a0) / L, ul: (l1 - l0) / L };
    }
    rest -= L;
  }
  return { a: line[0][0], l: line[0][1], ua: 1, ul: 0 };
}
export const lineLength = (line: [number, number][]): number => line.slice(1).reduce((s, [a, l], k) => s + Math.hypot(a - line[k][0], l - line[k][1]), 0);

/** Stalls down both sides of the market street, clear of the pavilions' decks. */
function marketStalls(skip: (a: number, l: number) => boolean): Spot[] {
  const out: Spot[] = [];
  const hexes = [0xe4572e, 0xf3a712, 0x29a19c, 0x6c5ce7, 0xe84393, 0x00b894, 0x2d6cb0];
  const L = lineLength(MARKET_STREET);
  let k = 0;
  for (let s = 6; s < L - 4; s += 3.6) {
    const p = along(MARKET_STREET, s);
    for (const side of [-1, 1]) {
      // the side's normal (da, dl) turned from the street's direction: stalls face the middle of the street
      const na = -p.ul * side;
      const nl = p.ua * side;
      const a = p.a + na * (MARKET_HALF - 0.9);
      const l = p.l + nl * (MARKET_HALF - 0.9);
      if (skip(a, l)) continue;
      out.push({ a, l, face: [-na, -nl], hex: hexes[k++ % hexes.length] });
    }
  }
  return out;
}

const inDeck = (p: Pav, a: number, l: number, pad: number): boolean => {
  // the deck: the box, 0.8 behind it and `front` before it, 0.8 to each side
  const [fa, fl] = p.face;
  const da = a - p.a;
  const dl = l - p.l;
  const along = da * fa + dl * fl;
  const across = -da * fl + dl * fa;
  const front = p.front ?? 3.4;
  return Math.abs(across) < p.w / 2 + 0.8 + pad && along > -p.d / 2 - 0.8 - pad && along < p.d / 2 + front + pad;
};

const CB_PAVILIONS: Pav[] = [
  // under the hall: toward the station, toward the market street, toward Broadway
  { a: -8.5, l: 34.25, w: 9, d: 5.5, face: [0, -1], name: "Punjabi Dhaba", umbrella: 0xe8663a },
  { a: -3.75, l: 50, w: 9, d: 5.5, face: [1, 0], name: "Pho Saigon", umbrella: 0xf2b632, roof: "timber" },
  { a: -13, l: 49, w: 8, d: 5, face: [-1, 0], name: "Ethiopian Coffee", umbrella: 0x2a9d8f, front: 3.2 },
  // the south side of the square, facing the market street
  { a: 19.5, l: 32.5, w: 8, d: 5.5, face: [-1, 0], name: "Bistro on the Drive", umbrella: 0xd2452f, well: true, roof: "green", h: 3.6 },
  { a: 17.5, l: 50, w: 10, d: 6, face: [-1, 0], name: "Ramen Bar", umbrella: 0xf1e9da, well: true },
  { a: 25, l: 51, w: 5, d: 4, face: [0, -1], name: "Gelato", umbrella: 0xe84393, front: 2.8, roof: "timber", h: 2.9 },
];

export const SQUARES: Square[] = [
  {
    i: 5,
    pavilions: CB_PAVILIONS,
    stalls: marketStalls((a, l) => l < 26.5 || l > 60 || CB_PAVILIONS.some((p) => inDeck(p, a, l, 1.4)) || (a < OCEAN_HALL.a1 + 0.6 && l > OCEAN_HALL.l0 - 1)),
    trucks: [
      { a: -13, l: 60.4, face: [0, -1], hex: 0xf2b632 },
      { a: -6, l: 60.4, face: [0, -1], hex: 0x2a9d8f },
      { a: 27.5, l: 40.5, face: [0, -1], hex: 0xd2452f },
    ],
    trees: [
      ...[14, 20, 26].map((a) => ({ a, l: 43.2, sp: "smaple" as SpeciesId, s: 0.7 })),
      { a: 25.5, l: 27.9, sp: "cherry", s: 0.62 },
      ...[30, 37, 44, 52].map((l) => ({ a: 29.5, l, sp: (l % 2 ? "hornbeam" : "magnolia") as SpeciesId, s: 0.62 })),
      { a: -19.6, l: 31, sp: "cherry", s: 0.6 },
      { a: -19.8, l: 41, sp: "cherry", s: 0.6 },
      { a: -20.2, l: 57, sp: "cherry", s: 0.6 },
    ],
    pools: [[26, 33, 2.4]],
    seats: [],
    crowds: [
      { box: [-17, 0, 30, 57], n: 14 },
      { box: [1, 12, 26, 60], n: 18 },
      { box: [12, 29, 27, 58], n: 16 },
      { box: [-21, -17.5, 26, 58], n: 6 },
    ],
  },
  {
    i: 1,
    pavilions: [
      // on the harbour's edge, facing the water
      { a: -12, l: 44.75, w: 8, d: 5.5, face: [0, 1], name: "Bannock & Salmon", umbrella: 0xe8663a, well: true, h: 3.6 },
      // south of the cedar, toward its canopy
      { a: 17, l: 21, w: 10, d: 6, face: [-1, 0], name: "Cedar & Salt", umbrella: 0xd2452f, well: true, roof: "green" },
      { a: 26, l: 19, w: 8, d: 5, face: [1, 0], name: "Noodle House", umbrella: 0xf2b632, roof: "timber" },
      { a: 24, l: 32, w: 5, d: 4, face: [0, -1], name: "Persian Bakery", umbrella: 0xf1e9da, front: 2.8, roof: "green", h: 2.9 },
      // on the strip toward Waterfront, its deck out over the water
      { a: 5.5, l: 49.5, w: 5, d: 5, face: [-1, 0], name: "Oyster Bar", umbrella: 0x2a9d8f, front: 2.8 },
    ],
    stalls: [
      // between the harbour pavilion and the guideway, and along the strip toward Waterfront
      ...[-16, -12.6, -9.2].map((a, k) => ({ a, l: 37.5 + k * 1.2, face: [0, 1] as [number, number], hex: [0xe4572e, 0x29a19c, 0x6c5ce7][k] })),
      ...[9, 12.4, 15.8, 19.2].map((a, k) => ({ a, l: 53.6 + (a - 9) * 0.3, face: [0, -1] as [number, number], hex: [0xf3a712, 0xe84393, 0x00b894, 0x2d6cb0][k] })),
    ],
    trucks: [
      { a: -6, l: 10.6, face: [0, 1], hex: 0xf2b632 },
      { a: 0.5, l: 10.6, face: [0, 1], hex: 0x2a9d8f },
      { a: 7, l: 10.6, face: [0, 1], hex: 0xe8663a },
    ],
    trees: [
      ...[12, 18, 24, 30].map((a) => ({ a, l: 9.6, sp: "smaple" as SpeciesId, s: 0.62 })),
      { a: -18.5, l: 47, sp: "cherry", s: 0.58 },
      { a: 17.5, l: 35, sp: "magnolia", s: 0.58 },
      { a: 31.5, l: 36, sp: "hornbeam", s: 0.6 },
    ],
    pools: [[13, 30, 2.2]],
    seats: [
      [-6, 43.6, 0xe8663a],
      [-3, 44.4, 0xf2b632],
      [-0.4, 45, 0xd2452f],
    ],
    stage: { a: 31, l: 27, face: [-1, 0], hex: 0x264653 },
    crowds: [
      { box: [-17, -5, 35, 51], n: 14 },
      { box: [5, 21, 50, 57], n: 8 },
      { box: [-9, 9, 13, 36], n: 16 },
      { box: [11, 33, 10, 38], n: 18 },
    ],
  },
];

/** World position of a point in square s's frame. */
export const squareXZ = (s: Square, a: number, l: number): [number, number] => fromStation(s.i, a + SET_SHIFT[s.i], l);

/** Inside a pavilion's deck, or a stall or truck (world point, with a pad): the crowd keeps out. */
export function onSquareFixture(s: Square, a: number, l: number, pad = 0.4): boolean {
  if (s.pavilions.some((p) => inDeck(p, a, l, pad))) return true;
  if (s.pools.some(([pa, pl, r]) => Math.hypot(a - pa, l - pl) < r + pad)) return true;
  if (s.seats.some(([pa, pl]) => Math.hypot(a - pa, l - pl) < 1.3 + pad)) return true;
  if (s.stage && Math.abs(a - s.stage.a) < 3 + pad && Math.abs(l - s.stage.l) < 3.5 + pad) return true;
  return [...s.stalls, ...s.trucks].some((q) => Math.abs(a - q.a) < 2 + pad && Math.abs(l - q.l) < 2 + pad);
}

/** The squares' trees, in the world, for the tree layer (feet on the ground: the caller sets y). */
export function squareTrees(): { x: number; z: number; sp: SpeciesId; s: number }[] {
  return SQUARES.flatMap((s) =>
    s.trees.map((t) => {
      const [x, z] = squareXZ(s, t.a, t.l);
      return { x, z, sp: t.sp, s: t.s };
    }),
  );
}
