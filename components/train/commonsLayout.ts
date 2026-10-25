/**
 * Downtown's open places, on the ground the city left bare round the line. Where the guideway's clearance, the sets
 * and the landmarks hide the streets, no lots front them and the blocks stood empty; the guideway runs ten units up
 * through all of it, so the ground under it is open too. commonsGround.ts covers every bare cell with lawn (or paving
 * in a paved place) and plants the lawns; these are the places and what stands in them:
 * - Coal Harbour Commons, a lawn between the Convention Centre and the Marine Building: laughing bronze figures, a wave
 *   arch, a café, a playground;
 * - the Rail Heritage Walk along the West Coast Express's tracks by the water, a restored steam locomotive under its
 *   canopy;
 * - Seymour Green by Granville: a giant chess board, ping-pong, a food truck;
 * - car-free Gastown: brick paving under five-globe lamps, a café, market stalls under the guideway, Maple Tree
 *   Square's fountain, Victory Square's cenotaph;
 * - Chinatown's night market under the Stadium terrace, lanterns strung over its aisle and a dragon dancing down it;
 * - Dunsmuir Commons toward BC Place: a stage, a playground, a ring sculpture, food trucks.
 *
 * Pure layout, in world coordinates (the market's from the Stadium set's frame).
 */
import { ART, PLAQUE } from "./cultureArt";
import { RECONCILIATION_AT } from "./monumentData";
import { fromStation, SET_SHIFT, STATION_FRAMES } from "./sets/zones";
import { groundAt } from "./terrain";
import type { SpeciesId } from "./trees/species";

type XZ = [number, number];
export type CommonsPath = { pts: XZ[]; w: number };
/** Paving styles: brick, granite with red bands, timber boardwalk, plain stone. */
export type Paving = "brick" | "granite" | "boards" | "stone";
export type Place = {
  name: string;
  /** Loose outline: the ground cover decides what is bare; inside it, bare ground takes this place's paving or lawn. */
  poly: XZ[];
  ground: Paving | "lawn";
  paths: CommonsPath[];
  /** People about the place. */
  crowd: number;
  /** Lawn trees per 100 square units of open lawn (the default elsewhere is lower). */
  trees?: number;
};

export const PLACES: Place[] = [
  {
    name: "Chinatown Night Market",
    ground: "granite",
    poly: [
      [15, 63],
      [30, 46],
      [44, 54],
      [60, 58],
      [60, 82],
      [50, 86],
      [44, 88],
    ],
    paths: [],
    crowd: 30,
  },
  {
    name: "Gastown",
    ground: "brick",
    poly: [
      [9, 15],
      [17, 14],
      [24, 20],
      [36, 26],
      [46, 31],
      [60, 38],
      [60, 58],
      [44, 54],
      [30, 46],
      [26, 40],
      [24, 36],
      [13, 35],
      [9, 30],
    ],
    paths: [],
    crowd: 30,
  },
  {
    name: "Coal Harbour Commons",
    ground: "lawn",
    poly: [
      [-120, -46],
      [-104, -40],
      [-70, -35],
      [-61, -31],
      [-61, -26],
      [-71, -19],
      [-73, -8],
      [-83, -8],
      [-83, -27],
      [-102, -27],
      [-116, -39],
    ],
    paths: [
      // the promenade along the Convention Centre's city side, south of its entrance canopy, to Jack Poole Plaza
      {
        pts: [
          [-118, -43],
          [-108, -41],
          [-100, -39.8],
          [-90, -37.9],
          [-80, -37.4],
          [-69.5, -35.3],
        ],
        w: 3,
      },
      // to the Marine Building's door
      {
        pts: [
          [-93.5, -38.2],
          [-93.5, -27.8],
        ],
        w: 2.2,
      },
      // down the Marine Building's east side to Thurlow and Melville
      {
        pts: [
          [-81, -37.2],
          [-82.4, -28],
          [-82.4, -14],
          [-80.5, -9.5],
        ],
        w: 2.2,
      },
    ],
    crowd: 26,
    trees: 1.2,
  },
  {
    name: "Rail Heritage Walk",
    ground: "boards",
    poly: [
      [31, -5],
      [39, -6.5],
      [48, -6.5],
      [55, -2.5],
      [62, 1],
      [62, 9],
      [54, 8],
      [45, 4.5],
      [37, 1.5],
      [31, -1],
    ],
    paths: [],
    crowd: 14,
  },
  {
    name: "Seymour Green",
    ground: "lawn",
    poly: [
      [-26, 25],
      [-20, 17],
      [-12, 8],
      [-5, 6],
      [-3, 11],
      [-7, 13],
      [-8, 18],
      [-8, 29],
      [4, 30],
      [10, 31],
      [5, 37.5],
      [-3, 37.5],
      [-8, 38],
      [-14, 39],
      [-21, 32],
    ],
    paths: [
      {
        pts: [
          [-23, 22.6],
          [-10, 20],
          [-6.5, 29.5],
          [6, 31.5],
        ],
        w: 2,
      },
    ],
    crowd: 16,
    trees: 1.2,
  },
  {
    name: "Dunsmuir Commons",
    ground: "lawn",
    poly: [
      [-29, 50],
      [-21, 55],
      [-13, 59],
      [-3, 70],
      [10, 80],
      [22, 93],
      [34, 104],
      [28, 108],
      [18, 106],
      [4, 94],
      [-6, 90],
      [-16, 80],
      [-18, 70],
      [-24, 62],
      [-29, 56],
    ],
    paths: [
      {
        pts: [
          [-14, 73],
          [-11, 81],
          [-9, 88],
          [8, 91.5],
          [18, 102],
          [26, 106],
        ],
        w: 2.4,
      },
    ],
    crowd: 24,
    trees: 1.2,
  },
];

/** Inside a polygon (even-odd). */
export function inPoly(poly: XZ[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
  }
  return inside;
}
/** The place at (x, z), if any (the first whose outline holds it). */
export const placeAt = (x: number, z: number): Place | undefined => (x < -125 || x > 65 || z < -50 || z > 112 ? undefined : PLACES.find((p) => inPoly(p.poly, x, z)));

export type Kind =
  | "laughing"
  | "arch"
  | "playground"
  | "locomotive"
  | "globeLamp"
  | "parkLamp"
  | "dragon"
  | "chess"
  | "pingpong"
  | "stage"
  | "ring"
  | "picnic"
  | "pavilion"
  | "stall"
  | "truck"
  | "fountain"
  | "tree"
  | "cenotaph"
  | "seat"
  | "bench"
  | "bikes"
  | "board"
  | "lanterns"
  // the culture sites' pieces (cultureKit.ts, drawn by Culture.tsx)
  | "welcome"
  | "plaque"
  | "flag"
  | "whorl"
  | "bighouse"
  | "moongate"
  | "taiko"
  | "banner"
  | "mural"
  | "monument"
  | "landing"
  | "post"
  | "fire";
/**
 * One thing standing in a place: where, its turn (as rotation.y: its local +z faces (sin ry, cos ry)), a colour, a
 * pavilion's name and size, a lantern string's ends (hung under the Stadium terrace).
 */
export type Feature = {
  kind: Kind;
  x: number;
  z: number;
  ry?: number;
  hex?: number;
  name?: string;
  w?: number;
  d?: number;
  front?: number;
  roof?: "dark" | "green" | "timber";
  r?: number;
  ends?: [XZ, XZ];
  /** A culture piece's site (one mesh each, Culture.tsx), its atlas cell (cultureArt.ts) and a plaque's quarter of its cell. */
  site?: string;
  cell?: number;
  quarter?: number;
};
/** rotation.y that turns a piece's front (local +z) toward (fx, fz). */
const face = (fx: number, fz: number) => Math.atan2(fx, fz);

let soffit: number | null = null;
/** The Stadium terrace's underside, where the market's lanterns hang (the set's own height rule, sets/build.ts). */
export function terraceSoffit(): number {
  if (soffit === null) {
    const fr = STATION_FRAMES[3];
    let g = -Infinity;
    for (let a = -16; a <= 16; a += 4) for (let l = 14; l <= 30; l += 4) g = Math.max(g, groundAt(...fromStation(3, a, l)) - fr.y);
    soffit = fr.y + Math.max(1.4, g + 0.35) - 0.6;
  }
  return soffit;
}
/** A point of the Stadium set's frame (along, lateral toward the set), and the turns for fronts toward +lateral, +along. */
const st3 = (a: number, l: number): XZ => fromStation(3, a, l);
const turnTo = (a0: number, l0: number, a1: number, l1: number) => {
  const [x0, z0] = st3(a0, l0);
  const [x1, z1] = st3(a1, l1);
  return face(x1 - x0, z1 - z0);
};
const ST3_LAT = turnTo(0, 0, 0, 1);
const ST3_ALONG = turnTo(0, 0, 1, 0);
function xz([x, z]: XZ): { x: number; z: number } {
  return { x, z };
}

/**
 * A point of a station's set frame (as the set lays it out: along from its origin, which SET_SHIFT may move along the
 * platform, and lateral toward its side), and the turn that faces a piece there toward (da, dl) in that frame.
 */
const inSet = (i: number, a: number, l: number, da: number, dl: number): { x: number; z: number; ry: number } => {
  const [x, z] = fromStation(i, a + SET_SHIFT[i], l);
  const [x1, z1] = fromStation(i, a + SET_SHIFT[i] + da, l + dl);
  return { x, z, ry: face(x1 - x, z1 - z) };
};

/**
 * The culture sites, each drawn as one mesh (Culture.tsx):
 * - Waterfront's plaza: two Coast Salish–inspired welcome figures facing the harbour either side of the land
 *   acknowledgement, between the kiosks and the café, and the Progress Pride and trans flags at its east edge;
 * - the Harbour Market at Burrard: a spindle whorl the height of two people;
 * - Thornton Park, across from Main Street–Science World: a Coast Salish big house, its house posts at the door;
 * - Chinatown: a moon gate in the Sun Yat-sen garden's park;
 * - Hogan's Alley: a plaque at Main and Union;
 * - Powell Street (Japantown): a taiko stage, festival banners and a plaque in Oppenheimer Park;
 * - the Commercial–Broadway square: a mural of raised hands under a rainbow, the Progress Pride and trans flags.
 */
const CULTURE: Feature[] = [
  { kind: "welcome", ...inSet(0, 5, 20.2, 0, 1), quarter: 0, site: "waterfront" },
  { kind: "welcome", ...inSet(0, 17, 20.2, 0, 1), quarter: 1, site: "waterfront" },
  { kind: "plaque", ...inSet(0, 11, 20.2, 0, 1), cell: ART.acknowledge, w: 1.6, site: "waterfront" },
  { kind: "flag", ...inSet(0, 22.5, 18.5, 0, 1), cell: ART.pride, site: "waterfront" },
  { kind: "flag", ...inSet(0, 22.5, 22.5, 0, 1), cell: ART.trans, site: "waterfront" },
  { kind: "whorl", ...inSet(1, 26, 39.5, -1, 0.4), site: "harbour" },
  { kind: "plaque", ...inSet(1, 30.5, 41.6, -1, 0.4), cell: ART.plaques, quarter: PLAQUE.whorl, w: 0.9, site: "harbour" },
  { kind: "bighouse", x: 97.5, z: 147.3, ry: 0, w: 11, d: 6.5, site: "thornton" },
  { kind: "plaque", x: 104.6, z: 151.6, ry: 0, cell: ART.plaques, quarter: PLAQUE.bighouse, w: 0.9, site: "thornton" },
  { kind: "moongate", x: 69.8, z: 77.6, ry: 0, w: 4.4, site: "chinatown" },
  { kind: "plaque", x: 93.6, z: 99.2, ry: 0, cell: ART.plaques, quarter: PLAQUE.hogan, w: 0.9, site: "hogan" },
  { kind: "taiko", x: 142.5, z: 45, ry: Math.PI / 2, site: "powell" },
  { kind: "banner", x: 138.4, z: 43.9, ry: Math.PI / 2, cell: ART.japantown, site: "powell" },
  { kind: "banner", x: 138.4, z: 46.3, ry: Math.PI / 2, cell: ART.japantown, site: "powell" },
  { kind: "plaque", x: 144.8, z: 43.2, ry: Math.PI / 2, cell: ART.plaques, quarter: PLAQUE.powell, w: 0.9, site: "powell" },
  { kind: "mural", ...inSet(5, -19.2, 36, 1, 0), cell: ART.hands, w: 5.4, site: "commercial" },
  { kind: "flag", ...inSet(5, -19.4, 46, 1, 0), cell: ART.pride, site: "commercial" },
  { kind: "flag", ...inSet(5, -19.4, 50, 1, 0), cell: ART.trans, site: "commercial" },
  // the canoe landing off the Canada Place forecourt's deck (harbourfront.ts): the reconciliation monument at its head
  // on the rim behind the deck, its plaque to the water, a fire circle on the deck, two carved posts at the top of its
  // steps, the steps (Culture.tsx) running down from the deck's edge to a float where two journey canoes are drawn up
  { kind: "monument", x: RECONCILIATION_AT[0], z: RECONCILIATION_AT[1], ry: Math.PI, w: 5.6, d: 5.6, site: "forecourt" },
  { kind: "fire", x: -16.5, z: -39, ry: 0, site: "forecourt" },
  { kind: "post", x: -23.4, z: -45.6, ry: Math.PI, site: "forecourt" },
  { kind: "post", x: -9.6, z: -45.6, ry: Math.PI, site: "forecourt" },
  { kind: "landing", x: -16.5, z: -51.5, ry: Math.PI, w: 13, d: 9, site: "forecourt" },
];

const MARKET_HEX = [0xe4572e, 0xd2452f, 0xf3a712, 0x29a19c, 0xc8281e, 0xe84393];
const market: Feature[] = [];
// two rows of stalls facing each other across an aisle under the terrace, clear of its legs (±13, and 0 at its far side)
[-9.6, -6, -2.4, 2.4, 6, 9.6].forEach((a, k) => {
  market.push({ kind: "stall", ...xz(st3(a, 18.2)), ry: ST3_LAT, hex: MARKET_HEX[k % MARKET_HEX.length] });
  market.push({ kind: "stall", ...xz(st3(a, 25.8)), ry: ST3_LAT + Math.PI, hex: MARKET_HEX[(k + 3) % MARKET_HEX.length] });
});
// lanterns under the slab, over the stalls and zigzagging over the aisle
const lantern = (a0: number, l0: number, a1: number, l1: number): Feature => {
  const [x0, z0] = st3(a0, l0);
  const [x1, z1] = st3(a1, l1);
  return { kind: "lanterns", x: (x0 + x1) / 2, z: (z0 + z1) / 2, ends: [[x0, z0], [x1, z1]] };
};
market.push(lantern(-13, 18, 13, 18), lantern(-13, 26, 13, 26));
for (let a = -12; a < 12; a += 6) market.push(lantern(a, 19, a + 6, 25));
// the dragon dancing down the aisle
market.push({ kind: "dragon", ...xz(st3(-1, 22)), ry: ST3_ALONG });

export const FEATURES: Feature[] = [
  // ------------------------------------------------ Coal Harbour Commons
  { kind: "laughing", x: -109, z: -35.5, ry: -Math.PI / 4, r: 7 },
  { kind: "arch", x: -104, z: -40.5, ry: face(0.989, 0.148), r: 6 },
  { kind: "pavilion", x: -86.5, z: -31, w: 8, d: 5, ry: Math.PI, name: "Filipino Panaderya", hex: 0xe8663a, roof: "green" },
  { kind: "playground", x: -76.5, z: -20 },
  { kind: "truck", x: -65, z: -29.3, ry: Math.PI, hex: 0xf2b632 },
  { kind: "picnic", x: -99, z: -33.5, ry: 0.3, hex: 0xd2452f },
  { kind: "picnic", x: -96, z: -30, ry: -0.4, hex: 0x2d6cb0 },
  { kind: "picnic", x: -78.5, z: -31.5, ry: 0.8, hex: 0xf2b632 },
  { kind: "picnic", x: -73.5, z: -29.5, ry: 0.1, hex: 0x2a9d8f },
  // ------------------------------------------------ Rail Heritage Walk
  { kind: "locomotive", x: 47.5, z: 2, ry: face(0.94, 0.34) },
  { kind: "board", x: 36, z: -2.4, ry: face(0.34, -0.94), name: "CPR 374 · first train to the Pacific, 1887" },
  { kind: "bench", x: 36.5, z: -3.2, ry: face(0, -1) },
  { kind: "bench", x: 58.5, z: 5.2, ry: face(-0.2, -1) },
  { kind: "tree", x: 59.5, z: 7, r: 0.6 },
  { kind: "bikes", x: 13, z: -3.5, ry: -0.69, r: 5 },
  { kind: "bench", x: 12.5, z: -4.5, ry: face(0.66, -0.75) },
  // ------------------------------------------------ Seymour Green
  { kind: "chess", x: -17, z: 28 },
  { kind: "pingpong", x: -6, z: 33.2, ry: 0.6 },
  { kind: "pingpong", x: 0, z: 33.6, ry: 0.6 },
  { kind: "truck", x: -10, z: 16, ry: 0, hex: 0x2a9d8f },
  { kind: "picnic", x: -14, z: 20.5, ry: 0.5, hex: 0xd2452f },
  // ------------------------------------------------ Gastown
  ...[
    [11.5, 18.5],
    [21, 23.4],
    [22.5, 26.5],
    [30, 31.5],
    [36, 33.5],
    [28, 39],
    [28, 45.5],
    [46, 44.5],
    [58, 48.5],
    [46.5, 47.3],
  ].map(([x, z]): Feature => ({ kind: "globeLamp", x, z })),
  { kind: "pavilion", x: 33, z: 34.6, w: 6, d: 4, front: 2.6, ry: face(0, -1), name: "Gastown Roasters", hex: 0xd2452f, roof: "timber" },
  { kind: "stall", x: 13.5, z: 20.6, ry: face(0.28, -0.96), hex: 0xe4572e },
  { kind: "fountain", x: 54, z: 46, r: 2.2 },
  { kind: "tree", x: 48, z: 47, r: 0.9 },
  { kind: "bench", x: 51, z: 48.8, ry: face(0.6, -0.8) },
  { kind: "bench", x: 57.5, z: 44.5, ry: face(-0.8, 0.4) },
  { kind: "cenotaph", x: 17, z: 49 },
  { kind: "truck", x: 9, z: 57, ry: Math.PI / 2, hex: 0xd2452f },
  { kind: "seat", x: 14.5, z: 56.5, hex: 0xf2b632 },
  { kind: "seat", x: 18, z: 58.5, hex: 0x2a9d8f },
  // ------------------------------------------------ Chinatown
  ...market,
  { kind: "stall", x: 50, z: 61.5, ry: face(0, 1), hex: 0xc8281e },
  { kind: "stall", x: 53.5, z: 61.5, ry: face(0, 1), hex: 0xe0b020 },
  { kind: "stall", x: 57, z: 61.5, ry: face(0, 1), hex: 0xc8281e },
  { kind: "truck", x: 57.2, z: 79.5, ry: 0, hex: 0xc8281e },
  // ------------------------------------------------ Dunsmuir Commons
  { kind: "stage", x: -8, z: 71, ry: face(-0.74, 0.67) },
  { kind: "playground", x: -3, z: 83 },
  { kind: "ring", x: 19, z: 100 },
  { kind: "truck", x: -9, z: 80, ry: face(0.67, 0.74), hex: 0xe8663a },
  { kind: "truck", x: 2, z: 88.5, ry: face(0.67, 0.74), hex: 0x2d6cb0 },
  { kind: "picnic", x: -12.5, z: 66.5, ry: 0.4, hex: 0xd2452f },
  { kind: "picnic", x: 13, z: 93.2, ry: -0.3, hex: 0xf2b632 },
  { kind: "picnic", x: 5, z: 82.8, ry: 0.7, hex: 0x2a9d8f },
  // ------------------------------------------------ the culture sites
  ...CULTURE,
];

/** A feature's footprint: circles ["c", x, z, r] and quads ["p", corners], for the checks and the crowd. */
export type Shape = ["c", number, number, number] | ["p", XZ[]];
export function footprint(f: Feature): Shape[] {
  const rect = (hw: number, hd: number, oz = 0): Shape => {
    const ry = f.ry ?? 0;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    // local x → (c, -s), local z → (s, c)
    const pt = (lx: number, lz: number): XZ => [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
    return ["p", [pt(-hw, oz - hd), pt(hw, oz - hd), pt(hw, oz + hd), pt(-hw, oz + hd)]];
  };
  switch (f.kind) {
    case "laughing":
      return [rect((f.r ?? 8) * 0.45 + 0.8, 2.3)];
    case "arch":
      return [rect((f.r ?? 8) / 2 + 0.5, 1.3)];
    case "playground":
      return [rect(4.7, 4.2)];
    case "locomotive":
      return [rect(2.7, 9.6)];
    case "dragon":
      return [rect(1.8, 7)];
    case "chess":
      return [rect(4.7, 4.7)];
    case "pingpong":
      return [rect(0.9, 1.5)];
    case "stage":
      return [rect(3.8, 2.5)];
    case "picnic":
      return [rect(1, 0.8)];
    case "pavilion": {
      const w = f.w ?? 6;
      const d = f.d ?? 4;
      const fr = f.front ?? 3.4;
      return [rect(w / 2 + 0.8, (d + 0.8 + fr) / 2, (fr - 0.8) / 2)];
    }
    case "stall":
      return [rect(1.2, 0.9)];
    case "truck":
      return [rect(1.1, 2.7)];
    case "bench":
      return [rect(1, 0.4)];
    case "bikes":
      return [rect((f.r ?? 8) * 0.55 + 0.2, 0.8)];
    case "board":
      return [rect(1.3, 0.3)];
    case "lanterns":
      return [];
    case "fountain":
      return [["c", f.x, f.z, (f.r ?? 2) + 0.3]];
    case "ring":
      return [["c", f.x, f.z, 2.4]];
    case "cenotaph":
      return [["c", f.x, f.z, 1.6]];
    case "seat":
      return [["c", f.x, f.z, 1.3]];
    case "tree":
      return [["c", f.x, f.z, 1.0]];
    case "globeLamp":
      return [["c", f.x, f.z, 0.7]];
    case "welcome":
      return [rect(2.0, 1.4)];
    case "plaque":
      return [rect((f.w ?? 1.4) / 2 + 0.3, 0.4)];
    case "flag":
      return [["c", f.x, f.z, 0.4]];
    case "whorl":
      return [rect(2.1, 0.75)];
    case "bighouse":
      return [rect((f.w ?? 11) / 2 + 0.4, (f.d ?? 6.5) / 2 + 1.0, 0.6)];
    case "moongate":
      return [rect((f.w ?? 4.4) / 2 + 0.4, 0.5)];
    case "taiko":
      return [rect(2.3, 1.5)];
    case "banner":
      return [["c", f.x, f.z, 0.9]];
    case "mural":
      return [rect((f.w ?? 6) / 2 + 0.2, 0.3)];
    case "monument":
      return [rect(3.4, 3.4)];
    case "landing":
      return [rect((f.w ?? 15) / 2 + 0.6, (f.d ?? 19) / 2)];
    case "post":
      return [["c", f.x, f.z, 0.9]];
    case "fire":
      return [["c", f.x, f.z, 2.9]];
    default:
      return [["c", f.x, f.z, 0.5]];
  }
}

const SHAPES = FEATURES.map((f) => footprint(f));
/** Every feature's extent with room to spare (x0, x1, z0, z1), for onFeature's quick test. */
const BOUNDS = FEATURES.reduce((b, f) => [Math.min(b[0], f.x - 14), Math.max(b[1], f.x + 14), Math.min(b[2], f.z - 14), Math.max(b[3], f.z + 14)], [Infinity, -Infinity, Infinity, -Infinity]);
/** On (or within pad of) any feature's footprint. */
export function onFeature(x: number, z: number, pad = 0): boolean {
  if (x < BOUNDS[0] || x > BOUNDS[1] || z < BOUNDS[2] || z > BOUNDS[3]) return false;
  for (const shapes of SHAPES) {
    for (const s of shapes) {
      if (s[0] === "c") {
        if ((x - s[1]) ** 2 + (z - s[2]) ** 2 < (s[3] + pad) ** 2) return true;
      } else {
        // a convex quad: inside every edge's inward half-plane, grown by pad
        const q = s[1];
        let inside = true;
        for (let i = 0; i < 4 && inside; i++) {
          const [ax, az] = q[i];
          const [bx, bz] = q[(i + 1) % 4];
          const ex = bx - ax;
          const ez = bz - az;
          const L = Math.hypot(ex, ez) || 1;
          // the quads wind one way; the inward side has the centre on it
          const cx = (q[0][0] + q[2][0]) / 2;
          const cz = (q[0][1] + q[2][1]) / 2;
          const sideC = ex * (cz - az) - ez * (cx - ax);
          const side = ex * (z - az) - ez * (x - ax);
          if (Math.sign(side) !== Math.sign(sideC) && Math.abs(side) / L > pad) inside = false;
        }
        if (inside) return true;
      }
    }
  }
  return false;
}

/** Distance to the nearest place path's centre (99 if none near). */
export function commonsPathDist(x: number, z: number): number {
  let best = 99;
  for (const p of PLACES) {
    for (const path of p.paths) {
      for (let i = 1; i < path.pts.length; i++) {
        const [ax, az] = path.pts[i - 1];
        const [bx, bz] = path.pts[i];
        const ex = bx - ax;
        const ez = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
        best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t) - path.w / 2);
      }
    }
  }
  return best;
}

/** The planter trees features call for (the tree layer plants them; Commons.tsx draws their planters). */
export const FEATURE_TREES: { x: number; z: number; sp: SpeciesId; s: number }[] = FEATURES.filter((f) => f.kind === "tree").map((f, k) => ({
  x: f.x,
  z: f.z,
  sp: (["smaple", "cherry", "hornbeam"] as SpeciesId[])[k % 3],
  s: f.r ?? 0.7,
}));
