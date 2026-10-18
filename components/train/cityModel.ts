/**
 * The city as data: water, streets, districts, lots, houses, trees, traffic runs, people, mountains.
 * Pure (no DOM, no React); the scene components turn these into meshes.
 */
import { BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, Color, MathUtils, PlaneGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { stations } from "@/data";

import { PEOPLE_VARIANTS } from "./constants";
import { frameAt, groundAt, makeFrame, nearStation, samples, stationS, trackDist } from "./track";

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

/* ------------------------------------------------------------------ water */
// Burrard Inlet wraps the downtown peninsula; Stanley Park is the land between x −470 and −150; English Bay and
// the strait lie west of x −470. False Creek west of Science World; Trout Lake east of the line.
export const INLET: [number, number][] = [
  [-470, -420],
  [-150, -420],
  [-150, -40],
  [60, -40],
  [200, -70],
  [1000, -130],
  [1000, -1100],
  [-1600, -1100],
  [-1600, 420],
  [-700, 420],
  [-470, 220],
];
export const CREEK: [number, number][] = [
  [-220, 152],
  [-60, 150],
  [20, 150],
  [55, 154],
  [73, 160],
  [62, 174],
  [30, 182],
  [-60, 190],
  [-220, 198],
];
export const LAKE = { x: 400, z: 374, rx: 20, rz: 13 };

export function inPoly(poly: [number, number][], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export const inWater = (x: number, z: number): boolean =>
  inPoly(INLET, x, z) || inPoly(CREEK, x, z) || ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 1;
export const terrainAt = (x: number, z: number): number => (inWater(x, z) ? groundAt(x, z) - 3 : groundAt(x, z));

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
const setX = (i: number) => (arterialX(i) ? 4.1 : 3.0);
const setZ = (j: number) => (arterialZ(j) ? 4.1 : 3.0);

/* ------------------------------------------------------------------ parks and landmarks */
export type Park = { x: number; z: number; r: number; name: string };
export const PARKS: Park[] = [
  { x: 400, z: 374, r: 44, name: "John Hendry Park" },
  { x: 318, z: 356, r: 16, name: "Clark Park" },
  { x: 517, z: 520, r: 20, name: "Slocan Park" },
  { x: 648, z: 613, r: 14, name: "Gaston Park" },
  { x: 333, z: 155, r: 13, name: "Grandview Park" },
  { x: 860, z: 790, r: 95, name: "Central Park" },
];
export const inPark = (x: number, z: number): boolean => PARKS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r);

export type LandmarkKey = "harbourCentre" | "canadaPlace" | "convention" | "bcPlace" | "rogers" | "scienceWorld";
export type LandmarkDef = { key: LandmarkKey; x: number; z: number; r: number; h: number; margin: number; lotR: number };
/** Mapped positions (km × 110); lotR is the footprint radius lots keep clear of. */
export const LANDMARK_DEFS: LandmarkDef[] = [
  { key: "harbourCentre", x: 2.6, z: 18.4, r: 11, h: 56, margin: 6, lotR: 12 },
  { key: "canadaPlace", x: -36, z: -40, r: 16, h: 26, margin: 6, lotR: 16 },
  { key: "convention", x: -30, z: -34, r: 36, h: 11, margin: 6, lotR: 36 },
  { key: "bcPlace", x: -6, z: 122, r: 38, h: 26, margin: 6, lotR: 38 },
  { key: "rogers", x: 52, z: 134, r: 19, h: 12, margin: 7, lotR: 19 },
  { key: "scienceWorld", x: 68.3, z: 155.7, r: 12, h: 24, margin: 8, lotR: 13 },
];

/** Nudge a landmark out of the guideway corridor so the train never clips it (measured against every curve sample). */
function pushOut(x: number, z: number, r: number, margin: number): [number, number] {
  let best = samples[0];
  let bd = 1e9;
  for (const f of samples) {
    const d = (f.p.x - x) ** 2 + (f.p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  const dx = x - best.p.x;
  const dz = z - best.p.z;
  const d = Math.sqrt(bd);
  if (d < r + margin + 0.5) {
    const k = (r + margin + 0.5) / Math.max(d, 0.01);
    return [best.p.x + dx * k, best.p.z + dz * k];
  }
  return [x, z];
}
export type PlacedLandmark = LandmarkDef & { px: number; pz: number };
export const LANDMARKS: PlacedLandmark[] = LANDMARK_DEFS.map((l) => {
  const [px, pz] = pushOut(l.x, l.z, l.r, l.margin);
  return { ...l, px, pz };
});
export type Blocker = { x: number; z: number; r: number; h: number };
/** The camera steers around these. */
export const BLOCKERS: Blocker[] = LANDMARKS.map((l) => ({ x: l.px, z: l.pz, r: l.r, h: l.h }));
export const inLandmark = (x: number, z: number, pad: number): boolean =>
  LANDMARKS.some((l) => Math.hypot(x - l.px, z - l.pz) < l.lotR + pad);

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
  if (x > 95 && x < 240 && z > 95 && z < 215) return "flats";
  if (x > 15 && x < 200 && z > 185 && z < 300) return "mountpleasant";
  if (Math.hypot(x - 344, z - 298) < 70) return "commercial";
  if (Math.hypot(x - 643, z - 585) < 60) return "joyce";
  if (x > 160 && x < 345 && z > 160 && z < 300) return "cut";
  return "residential";
}

type Zone = { h: [number, number]; foot: [number, number]; build: number; tree: number; rot: number; ever: number; house?: number };
export const ZONE: Record<District, Zone> = {
  downtown: { h: [14, 70], foot: [10, 22], build: 0.9, tree: 0.06, rot: Math.PI / 4, ever: 0.2 },
  westend: { h: [10, 38], foot: [10, 18], build: 0.6, tree: 0.2, rot: Math.PI / 4, ever: 0.3 },
  gastown: { h: [3, 8], foot: [7, 13], build: 0.95, tree: 0.06, rot: Math.PI / 4, ever: 0.1 },
  flats: { h: [2, 6], foot: [16, 30], build: 0.55, tree: 0.06, rot: 0, ever: 0.3 },
  mountpleasant: { h: [3, 12], foot: [10, 18], build: 0.6, tree: 0.2, rot: 0, ever: 0.2 },
  commercial: { h: [3, 8], foot: [8, 14], build: 0.7, tree: 0.4, rot: 0, ever: 0.2 },
  joyce: { h: [3, 9], foot: [10, 16], build: 0.3, tree: 0.35, rot: 0, ever: 0.3, house: 0.5 },
  residential: { h: [3, 5], foot: [10, 14], build: 0.05, tree: 0.55, rot: 0, ever: 0.25, house: 0.7 },
  cut: { h: [0, 0], foot: [0, 0], build: 0, tree: 1.1, rot: 0, ever: 0.55, house: 0.25 },
  park: { h: [0, 0], foot: [0, 0], build: 0, tree: 0.8, rot: 0, ever: 0.45 },
  forest: { h: [0, 0], foot: [0, 0], build: 0, tree: 1.4, rot: 0, ever: 0.75 },
};

export const PAL = {
  commercial: [0xc85a4a, 0x3f7f5f, 0xd9b44a, 0x4f6fa5, 0xe0d6c2, 0xb86f52],
  house: [0xe8e1d1, 0xcfd8d0, 0xb9c4d4, 0xd8c9b6, 0xeeeae0, 0xd4c3c9, 0xc8d1c0, 0xe5d3b3],
  roof: [0x4a4f58, 0x5a4a42, 0x3e4651, 0x6b5a4a],
};

export type BuildingType = "tower" | "office" | "slab" | "heritage" | "low";
/** Which building forms each district gets: glass point tower on a podium, dark office slab, white balcony slab, heritage brick, low storefront. */
export const TYPE_W: Partial<Record<District, [BuildingType, number][]>> = {
  downtown: [
    ["tower", 5],
    ["office", 3],
    ["heritage", 1],
    ["slab", 1],
  ],
  westend: [
    ["tower", 6],
    ["slab", 4],
  ],
  gastown: [
    ["heritage", 9],
    ["low", 1],
  ],
  flats: [
    ["low", 8],
    ["slab", 2],
  ],
  mountpleasant: [
    ["slab", 4],
    ["heritage", 3],
    ["low", 3],
  ],
  commercial: [
    ["low", 7],
    ["heritage", 2],
    ["slab", 1],
  ],
  joyce: [
    ["tower", 5],
    ["slab", 3],
    ["low", 2],
  ],
  residential: [
    ["low", 6],
    ["slab", 4],
  ],
};
function pickType(rng: Rng, name: District, hgt: number): BuildingType {
  const ws = TYPE_W[name] ?? TYPE_W.residential!;
  let tot = 0;
  for (const [, w] of ws) tot += w;
  let r = rng.next() * tot;
  for (const [t, w] of ws) {
    r -= w;
    if (r <= 0) {
      if ((t === "tower" || t === "office") && hgt < 12) return "slab";
      if (t === "heritage" && hgt > 9) return "slab";
      return t;
    }
  }
  return "low";
}

const sm = (a: number, b: number, x: number) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Nothing above a podium within this distance of the guideway. */
export const CORRIDOR = 30;
/** No building footprint within this distance of the guideway. */
export const CLEAR = 17;

/* ------------------------------------------------------------------ buildings */
export type Facade = "glass" | "balcony" | "brick" | "concrete";
export const FACADES: Facade[] = ["glass", "balcony", "brick", "concrete"];

const hsl = (h: number, s: number, l: number) => new Color().setHSL(h, s, l);
const tint = {
  glass: (r: Rng) => hsl(0.55 + r.next() * 0.06, 0.25 + r.next() * 0.2, 0.78 + r.next() * 0.17),
  dark: (r: Rng) => hsl(0.6, 0.15, 0.32 + r.next() * 0.15),
  balcony: (r: Rng) => hsl(0.1, 0.05, 0.9 + r.next() * 0.1),
  brick: (r: Rng) => hsl(0.02 + r.next() * 0.05, 0.3, 0.72 + r.next() * 0.22),
  concrete: (r: Rng) => hsl(0.08 + r.next() * 0.04, 0.12, 0.8 + r.next() * 0.17),
};

/** A box with the window texture tiled by size (one tile = 3.2 units), vertex-coloured, roof darkened. */
function buildingGeo(x: number, z: number, w: number, hgt: number, d: number, col: Color, rot: number, yOff = 0): BufferGeometry {
  const g = new BoxGeometry(w, hgt, d);
  const uv = g.attributes.uv as BufferAttribute;
  for (let i = 0; i < 24; i++) {
    const face = Math.floor(i / 4);
    if (face === 2 || face === 3) uv.setXY(i, 0.002, 0.002);
    else {
      const L = face < 2 ? d : w;
      uv.setXY(i, (uv.getX(i) * L) / 3.2, (uv.getY(i) * hgt) / 3.2);
    }
  }
  const colors = new Float32Array(24 * 3);
  for (let i = 0; i < 24; i++) {
    const k = Math.floor(i / 4) === 2 ? 0.72 : 1;
    colors.set([col.r * k, col.g * k, col.b * k], i * 3);
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  g.rotateY(rot);
  g.translate(x, groundAt(x, z) + yOff + hgt / 2, z);
  return g;
}

export type House = { x: number; z: number; w: number; d: number; h: number; rot: number; body: number; roof: number };
export type Tree = { x: number; z: number; ever: boolean; s: number; cidx: number };
export type Lot = { x: number; z: number; w: number; d: number; h: number };
export type CityData = {
  geos: Record<Facade, BufferGeometry | null>;
  houses: House[];
  trees: Tree[];
  /** Building footprints, kept for the geometry checks. */
  lots: Lot[];
};

/** Lots inside blocks between the painted streets, merged per facade family; houses and trees as instance lists. */
export function buildCity(rng: Rng, lowEnd: boolean): CityData {
  const geosBy: Record<Facade, BufferGeometry[]> = { glass: [], balcony: [], brick: [], concrete: [] };
  const houses: House[] = [];
  const trees: Tree[] = [];
  const lots: Lot[] = [];

  const push = (kind: Facade, col: Color, x: number, z: number, bw: number, bh: number, bd: number, rot: number, yOff = 0) =>
    geosBy[kind].push(buildingGeo(x, z, bw, bh, bd, col, rot, yOff));
  const addBuilding = (type: BuildingType, x: number, z: number, w: number, d: number, hgt: number, rot: number, name: District) => {
    if (type === "tower") {
      const ph = 3.5 + rng.next() * 2;
      const brickPod = rng.next() < 0.5;
      push(brickPod ? "brick" : "concrete", brickPod ? tint.brick(rng) : tint.concrete(rng), x, z, w, ph, d, rot);
      const tw = w * (0.5 + rng.next() * 0.2);
      const td = d * (0.5 + rng.next() * 0.2);
      const glassy = rng.next() < 0.6;
      push(glassy ? "glass" : "balcony", glassy ? tint.glass(rng) : tint.balcony(rng), x, z, tw, hgt - ph, td, rot, ph);
      push("concrete", new Color(0x8a8f99), x, z, tw * 0.4, 2.2, td * 0.4, rot, hgt);
    } else if (type === "office") {
      push("glass", tint.dark(rng), x, z, w, hgt, d, rot);
      push("concrete", new Color(0x6b7079), x, z, w * 0.5, 2.5, d * 0.5, rot, hgt);
    } else if (type === "slab") {
      push("balcony", tint.balcony(rng), x, z, w, hgt, d, rot);
    } else if (type === "heritage") {
      push("brick", tint.brick(rng), x, z, w, hgt, d, rot);
      push("concrete", new Color(0xd9cfbd), x, z, w * 1.08, 0.5, d * 1.08, rot, hgt - 0.2);
    } else {
      push("concrete", name === "commercial" ? new Color(rng.pick(PAL.commercial)) : tint.concrete(rng), x, z, w, hgt, d, rot);
    }
  };

  // Vancouver is a grid: every lot sits inside a block between two painted streets, set back behind the sidewalk
  const lotOK = (x: number, z: number, w: number, d: number): boolean => {
    for (const [px, pz] of [
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x - w / 2, z + d / 2],
      [x + w / 2, z + d / 2],
      [x, z],
    ]) {
      if (inWater(px, pz) || inLandmark(px, pz, 2) || inPark(px, pz) || trackDist(px, pz) < CLEAR) return false;
    }
    return true;
  };
  for (let i = BI0; i < BI1; i++) {
    for (let j = BJ0; j < BJ1; j++) {
      const ax = streetX(i) + setX(i);
      const bx = streetX(i + 1) - setX(i + 1);
      const az = streetZ(j) + setZ(j);
      const bz = streetZ(j + 1) - setZ(j + 1);
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      const W = bx - ax;
      const D = bz - az;
      const name = district(cx, cz);
      const zone = ZONE[name];
      if (zone.build === 0 && !zone.house) continue;
      const dist = trackDist(cx, cz);
      const taper = sm(CORRIDOR, CORRIDOR + 42, dist);
      const big = name === "downtown" || name === "westend" || name === "joyce" || name === "flats";
      const cols = big ? (rng.next() < 0.5 ? 1 : 2) : 2;
      const rows = big ? (rng.next() < 0.5 ? 1 : 2) : zone.house ? 3 : 2;
      const lw = W / cols;
      const ld = D / rows;
      const gap = 1.4;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = ax + lw * (c + 0.5);
          const z = az + ld * (r + 0.5);
          const w = lw - gap;
          const d = ld - gap;
          if (!lotOK(x, z, w, d)) continue;
          // the corridor rule applies to the nearest corner, so no part of a tall building leans into the view
          const ldist = Math.min(
            trackDist(x, z),
            trackDist(x - w / 2, z - d / 2),
            trackDist(x + w / 2, z - d / 2),
            trackDist(x - w / 2, z + d / 2),
            trackDist(x + w / 2, z + d / 2),
          );
          if (zone.build > 0 && rng.next() < zone.build) {
            const hmax = MathUtils.lerp(zone.h[0] + 2, zone.h[1], taper);
            let hgt = zone.h[0] + Math.pow(rng.next(), 1.5) * Math.max(0, hmax - zone.h[0]);
            let type = pickType(rng, name, hgt);
            if ((name === "commercial" || name === "joyce") && nearStation(x, z, 34) && ldist > CORRIDOR + 4 && rng.next() < 0.6) {
              hgt = 18 + rng.next() * 16;
              type = "tower";
            }
            if (ldist < CORRIDOR) {
              // low podiums only next to the guideway, so the view stays open
              hgt = Math.min(hgt, 5.5);
              type = type === "heritage" ? "heritage" : "low";
            }
            if (hgt < 3) continue;
            lots.push({ x, z, w, d, h: hgt });
            addBuilding(type, x, z, w, d, hgt, 0, name);
          } else if (zone.house && rng.next() < zone.house + 0.2) {
            houses.push({
              x,
              z,
              w: Math.min(w, 5.6),
              d: Math.min(d, 6.2),
              h: 2.6 + rng.next() * 1.2,
              rot: 0,
              body: rng.pick(PAL.house),
              roof: rng.pick(PAL.roof),
            });
          }
        }
      }
    }
  }

  // trees: boulevard trees along the sidewalks of every block, then the parks, the Grandview Cut and Stanley Park
  const cap = lowEnd ? 9000 : 16000;
  const treeOK = (x: number, z: number) => !inWater(x, z) && !inLandmark(x, z, 1) && trackDist(x, z) >= 12;
  const addTree = (x: number, z: number, ever: boolean, s: number) =>
    trees.push({ x, z, ever, s, cidx: 1 + Math.floor(rng.next() * 1000) });
  for (let i = BI0; i <= BI1 && trees.length < cap; i++) {
    for (let j = BJ0; j <= BJ1 && trees.length < cap; j++) {
      const name = district(streetX(i) + 11, streetZ(j) + 11);
      const zone = ZONE[name];
      if (zone.build === 0 && !zone.house) continue;
      const p = Math.min(0.9, zone.tree * 0.55 + (name === "downtown" ? 0.15 : 0)) * (lowEnd ? 0.6 : 1);
      const ox = setX(i) - 0.9;
      const oz = setZ(j) - 0.9; // on the sidewalk's inner edge
      for (let t = 2.5; t < STREET_STEP - 2; t += 5.5) {
        for (const side of [-1, 1]) {
          const x1 = streetX(i) + side * ox;
          const z1 = streetZ(j) + t;
          if (rng.next() < p && treeOK(x1, z1) && !inPark(x1, z1)) addTree(x1, z1, rng.next() < zone.ever * 0.5, 0.7 + rng.next() * 0.5);
          const x2 = streetX(i) + t;
          const z2 = streetZ(j) + side * oz;
          if (rng.next() < p && treeOK(x2, z2) && !inPark(x2, z2)) addTree(x2, z2, rng.next() < zone.ever * 0.5, 0.7 + rng.next() * 0.5);
        }
      }
    }
  }
  const X0 = -500;
  const X1 = 900;
  const Z0 = -430;
  const Z1 = 820;
  const TSTEP = 6;
  for (let gx = X0; gx < X1 && trees.length < cap; gx += TSTEP) {
    for (let gz = Z0; gz < Z1 && trees.length < cap; gz += TSTEP) {
      const x = gx + rng.next() * TSTEP;
      const z = gz + rng.next() * TSTEP;
      if (!treeOK(x, z)) continue;
      const name = district(x, z);
      const zone = ZONE[name];
      const p = name === "forest" ? 0.9 : name === "park" ? 0.55 : name === "cut" ? 0.6 : 0;
      if (rng.next() > p) continue;
      addTree(x, z, rng.next() < zone.ever, 0.8 + rng.next() * 0.9);
    }
  }

  const geos = { glass: null, balcony: null, brick: null, concrete: null } as Record<Facade, BufferGeometry | null>;
  for (const k of FACADES) {
    if (geosBy[k].length) {
      geos[k] = mergeGeometries(geosBy[k], false);
      for (const g of geosBy[k]) g.dispose();
    }
  }
  return { geos, houses, trees, lots };
}

/* ------------------------------------------------------------------ traffic */
export type CarRun = { axis: "x" | "z"; line: number; a: number; b: number; pos: number; dir: 1 | -1; speed: number; off: number };

/** Every street is cut into runs of dry land; cars loop inside a run, one speed per run and direction, evenly spaced, so they never meet. */
export function buildCars(rng: Rng, CAR_N: number): CarRun[] {
  type Line = { axis: "x" | "z"; line: number; half: number; lo: number; hi: number };
  const lines: Line[] = [];
  for (let i = BI0; i <= BI1; i++) lines.push({ axis: "z", line: streetX(i), half: arterialX(i) ? 1.3 : 0.8, lo: -60, hi: 810 });
  for (let j = BJ0; j <= BJ1; j++) lines.push({ axis: "x", line: streetZ(j), half: arterialZ(j) ? 1.3 : 0.8, lo: -310, hi: 890 });
  const blocked = (x: number, z: number) => inWater(x, z) || inLandmark(x, z, 1) || inPark(x, z);
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
  const totalLen = runs.reduce((t, r) => t + (r.b - r.a), 0);
  const cars: CarRun[] = [];
  for (const r of runs) {
    for (const dir of [1, -1] as const) {
      const n = Math.max(1, Math.round((((r.b - r.a) / totalLen) * CAR_N) / 2));
      const spacing = (r.b - r.a) / n;
      if (spacing < 9) continue;
      const hv = Math.sin(r.line * 12.9898 + dir * 78.233) * 43758.5453;
      const speed = 6 + (hv - Math.floor(hv)) * 7;
      for (let k = 0; k < n && cars.length < CAR_N; k++) {
        cars.push({
          axis: r.axis,
          line: r.line,
          a: r.a,
          b: r.b,
          pos: r.a + spacing * (k + 0.5 * rng.next()),
          dir,
          speed,
          off: r.half * dir * (r.axis === "x" ? 1 : -1),
        });
      }
    }
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
  origin: number;
  /** Billboard variant and instance index within it. */
  v: number;
  k: number;
};

/** Fourteen per station on both platforms, the rest walking the sidewalks within 70 units of the line. */
export function buildPeople(rng: Rng, PEOPLE_N: number): { people: Person[]; counts: number[] } {
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
      add({ x: p.x, y: p.y + 1.4, z: p.z, move: 0, dir: 1, axis: "x", origin: 0 });
    }
  });
  let tries = 0;
  while (people.length < PEOPLE_N && tries++ < PEOPLE_N * 30) {
    const axis: "x" | "z" = rng.next() < 0.5 ? "x" : "z";
    const i = Math.floor(BI0 + rng.next() * (BI1 - BI0));
    const j = Math.floor(BJ0 + rng.next() * (BJ1 - BJ0));
    const line = axis === "x" ? streetZ(j) : streetX(i);
    const walk = (axis === "x" ? arterialZ(j) : arterialX(i)) ? 3.0 : 2.0;
    const side = rng.next() < 0.5 ? walk : -walk;
    const pos = axis === "x" ? -310 + rng.next() * 1200 : -60 + rng.next() * 870;
    const x = axis === "x" ? pos : line + side;
    const z = axis === "x" ? line + side : pos;
    const d = trackDist(x, z);
    if (d < 9 || d > 70 || inWater(x, z) || inLandmark(x, z, 2) || inPark(x, z)) continue;
    add({ x, y: groundAt(x, z), z, axis, dir: rng.next() < 0.5 ? 1 : -1, move: 0.8 + rng.next() * 0.6, origin: pos });
  }
  return { people, counts };
}

/* ------------------------------------------------------------------ terrain and mountains */
/** One plane with the street-grid texture, dipped 3 units inside the water polygons. */
export function buildGroundGeometry(): PlaneGeometry {
  const g = new PlaneGeometry(2860, 2420, 230, 195);
  g.rotateX(-Math.PI / 2);
  g.translate(430, 0, 150);
  const pa = g.attributes.position as BufferAttribute;
  for (let i = 0; i < pa.count; i++) pa.setY(i, terrainAt(pa.getX(i), pa.getZ(i)) - 0.05);
  g.computeVertexNormals();
  return g;
}

export type MountainData = { geometry: PlaneGeometry; summer: BufferAttribute; winter: BufferAttribute };
/** North Shore ridge 560–1310 units north, peaks to 300, with a summer and a winter snow-line colouring. */
export function buildMountains(): MountainData {
  const g = new PlaneGeometry(5200, 760, 220, 38);
  g.rotateX(-Math.PI / 2);
  g.translate(430, 0, -930);
  const pa = g.attributes.position as BufferAttribute;
  const col = new Float32Array(pa.count * 3);
  const colW = new Float32Array(pa.count * 3);
  const c = new Color();
  const hash = (x: number, z: number) => {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const cc = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    return a + (b - a) * sx + (cc - a) * sz + (a - b - cc + d) * sx * sz;
  };
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const z = pa.getZ(i);
    const edge = Math.min(1, Math.max(0, (-z - 560) / 150));
    const h = (vn(x * 0.004, z * 0.004) * 0.6 + vn(x * 0.012 + 5, z * 0.012) * 0.3 + vn(x * 0.03, z * 0.03 + 9) * 0.1) * 300 * edge;
    pa.setY(i, h - 2);
    const paint = (arr: Float32Array, line: number) => {
      const snow = Math.min(1, Math.max(0, (h - line) / 50));
      c.setRGB(0.36 + 0.6 * snow, 0.42 + 0.54 * snow, 0.5 + 0.47 * snow);
      arr.set([c.r, c.g, c.b], i * 3);
    };
    paint(col, 125);
    paint(colW, 55);
  }
  const summer = new BufferAttribute(col, 3);
  const winter = new BufferAttribute(colW, 3);
  g.setAttribute("color", summer);
  g.computeVertexNormals();
  return { geometry: g, summer, winter };
}

/** Burnaby Mountain: a 300-radius dome, height 110. */
export function buildHill(): CircleGeometry {
  const hill = new CircleGeometry(300, 56);
  hill.rotateX(-Math.PI / 2);
  const pa = hill.attributes.position as BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const d = Math.hypot(pa.getX(i), pa.getZ(i)) / 300;
    pa.setY(i, 110 * Math.pow(Math.max(0, 1 - d), 1.6));
  }
  hill.computeVertexNormals();
  return hill;
}
