/**
 * Developments placed by hand, each with a culture of the city's in it, built after the city's lots and its murals
 * (city.ts) on ground none of them took (each footprint checked clear of every lot, street, bridge, park and the
 * water):
 * - senákw on its own ground, the Sḵwx̱wú7mesh (Squamish) Nation's towers at the south end of the Burrard Bridge:
 *   slender towers in pale glass hung with copper strands woven over and under (the façade family `weave`), set back
 *   to planted crowns, two of them on a podium of cedar boards banded in formline and the rest in the gaps between
 *   the blocks either side of the bridge's foot, one stepping down in planted terraces, and a cedar hall west of the
 *   bridge; welcome figures at its way in, a spindle whorl by its eastern tower. (Towers in its manner also stand
 *   behind Science World, senakw.ts.)
 * - at the north end of the bridge, across False Creek from it, a tower plaited like a cedar-bark basket (`basket`),
 *   its crown flaring like a basket's rim, a carved post at its door;
 * - at the south end of the Granville Bridge, Coast Salish longhouse towers: a big house of cedar planks facing the
 *   water, its front painted and two carved house posts at its door, and behind it two towers, one plaited, one in
 *   cedar boards banded in formline;
 * - at the edge of Chinatown, a lantern pavilion kept low (as Chinatown keeps itself, and as the guideway's deck nearby
 *   requires): red columns under two tiers of green-tiled eaves, a gold finial, a moon gate across the street.
 * Pure apart from three.js geometry.
 */
import { ConeGeometry, CylinderGeometry } from "three";

import { Rng } from "../cityModel";
import type { Kind } from "../commonsLayout";
import { ART } from "../cultureArt";
import type { SpeciesId } from "../trees/species";
import { groundAt, surfaceAt } from "../terrain";
import type { FamilyId } from "./facadeArray";
import type { Tint, V3 } from "./meshBuilder";
import { box, cap, fp, gable, hip, type Poly, type Sink, solid, tpl, walls } from "./parts";

/** What a building is given to build with: its sink, its centre, foot and floor, and its trees and painted panels (all in its own frame, before it turns). */
export type DevCtx = {
  sink: Sink;
  x: number;
  z: number;
  yb: number;
  yt: number;
  rng: Rng;
  terrace: (x: number, y: number, z: number, s: number, sp: SpeciesId) => void;
  /** A painted panel (an atlas cell) on a face: its centre, the face's outward normal (nx, nz), its height and width. */
  art: (x: number, y: number, z: number, nx: number, nz: number, h: number, w: number, cell: number) => void;
};
/**
 * One building: its centre, its turn (as a lot's: local +x along its street), its footprint, what it stands on (another
 * of these by name: its floor is that one's roof), and how it is built (square to the axes about its centre); `build`
 * returns its roof's height over its floor.
 */
export type DevBuilding = { name: string; x: number; z: number; ry: number; w: number; d: number; on?: string; build: (k: DevCtx) => number };

const T = (hex: number): Tint => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const scaled = (p: Poly, k: number): Poly => p.map(([a, b]) => [a * k, b * k]);
/** A ring's points lifted to y. */
const at = (ring: V3[], y: number): V3[] => ring.map(([a, , b]) => [a, y, b]);

/** senákw's glass, each tower a shade of its own: pale blue, grey, a little green. */
const SENAKW_GLASS: Tint[] = [
  [0.86, 0.93, 0.99],
  [0.8, 0.88, 0.95],
  [0.88, 0.95, 0.93],
  [0.92, 0.94, 0.97],
];
/** Cedar, as the boards and plaits are tinted. */
const CEDAR: Tint = [0.84, 0.58, 0.38];
const CEDAR_DARK: Tint = [0.7, 0.46, 0.3];

/**
 * A senákw tower: a dark glass lobby, the woven shaft (tapering a little), then two floors set back to a planted
 * terrace round a glass lantern with a garden on top, trees on both.
 */
function senakwTower(k: DevCtx, w: number, d: number, h: number, tint: Tint, taper = 0.94): number {
  const { sink, x, z, yb, yt } = k;
  const plan = fp.rounded(w, d, Math.min(w, d) * 0.2, 3);
  walls(sink, "dark", scaled(plan, 0.97), x, z, yb, yt + 2.2, { yRef: yt });
  const crown = h - 3.8;
  const ring = walls(sink, "weave", plan, x, z, yt + 2.2, yt + crown, { tint, yRef: yt, segs: 3, s1: taper });
  cap(sink, "garden", at(ring, yt + crown));
  const lantern = walls(sink, "glass", scaled(plan, 0.7 * taper), x, z, yt + crown, yt + h, { tint: [0.82, 0.92, 0.88], yRef: yt });
  cap(sink, "garden", at(lantern, yt + h));
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * Math.PI * 2 + 0.6;
    k.terrace(x + Math.cos(a) * w * 0.4 * taper, yt + crown, z + Math.sin(a) * d * 0.4 * taper, 0.55, q % 2 ? "cedar" : "smaple");
  }
  k.terrace(x, yt + h, z, 0.6, "cedar");
  return h;
}

/** senákw's terraced building: woven tiers stepping back on one side, each step a planted terrace. */
function senakwTerraces(k: DevCtx, w: number, d: number, tiers: number, tierH: number, tint: Tint): number {
  const { sink, x, z, yb, yt } = k;
  walls(sink, "dark", fp.rect(w * 0.97, d * 0.97), x, z, yb, yt + 2.2, { yRef: yt });
  let y = yt + 2.2;
  for (let t = 0; t < tiers; t++) {
    const dd = d * (1 - (t / tiers) * 0.62);
    const cz = z - (d - dd) / 2;
    const ring = walls(sink, "weave", fp.rect(w, dd), x, cz, y, y + tierH, { tint, yRef: yt });
    y += tierH;
    cap(sink, "garden", at(ring, y));
    k.terrace(x - w * 0.3, y, cz + dd / 2 - 0.7, 0.5, t % 2 ? "cedar" : "smaple");
    k.terrace(x + w * 0.3, y, cz + dd / 2 - 0.7, 0.45, t % 2 ? "smaple" : "cherry");
  }
  return y - yt;
}

/** A podium of cedar boards banded in formline (the `salish` family), a planted roof with trees along its edges. */
function cedarPodium(k: DevCtx, w: number, d: number, h: number, trees: number): number {
  const { sink, x, z, yb, yt } = k;
  walls(sink, "dark", fp.rect(w * 1.005, d * 1.005), x, z, yb, yt + 0.4, { yRef: yt });
  const ring = walls(sink, "salish", fp.rect(w, d), x, z, yt + 0.4, yt + h, { tint: CEDAR, yRef: yt });
  walls(sink, "concrete", fp.rect(w + 0.2, d + 0.2), x, z, yt + h, yt + h + 0.35, { tint: [0.93, 0.92, 0.88] });
  cap(sink, "garden", at(ring, yt + h + 0.3));
  for (let q = 0; q < trees; q++) {
    const u = (q + 0.5) / trees - 0.5;
    k.terrace(x + u * (w - 1.4), yt + h + 0.35, z + (q % 2 ? 1 : -1) * (d / 2 - 0.8), 0.5 + (q % 3) * 0.08, (["cedar", "smaple", "cherry"] as const)[q % 3]);
  }
  return h + 0.35;
}

/**
 * A cedar hall after a Coast Salish big house: plank walls banded in formline, a broad low gable, its front (local -z)
 * painted over the door, two carved house posts flanking it.
 */
function cedarHall(k: DevCtx, w: number, d: number, floors: number, front: number): number {
  const { sink, x, z, yb, yt } = k;
  const top = yt + 0.3 + floors * 1.9;
  walls(sink, "dark", fp.rect(w * 1.01, d * 1.01), x, z, yb, yt + 0.3, { yRef: yt });
  walls(sink, "salish", fp.rect(w, d), x, z, yt + 0.3, top, { tint: CEDAR, yRef: yt });
  const pitch = Math.min(3.2, w * 0.2);
  gable(sink, "salish", "shingle", x, z, w, d, yt, top, pitch, CEDAR, T(0x6e4a2c), 0, 0.9);
  const postH = Math.min(top - yt, 4.4);
  for (const s of [-1, 1]) {
    const px = s * Math.min(2.6, w * 0.2);
    box(sink, "timber", x + px, yt, z - d / 2 - 0.35, 0.6, postH, 0.55, T(0x8b4a2b));
    k.art(x + px, yt + postH / 2 + 0.05, z - d / 2 - 0.64, 0, -1, postH - 0.1, 0.6, s < 0 ? ART.welcome : ART.welcome2);
  }
  // the painted front over the door, under the gable
  k.art(x, (yt + 2.4 + top) / 2, z - d / 2 - 0.03, 0, -1, top - yt - 2.6, w * 0.8, front);
  return top + pitch - yt;
}

/** The basket tower: a dark lobby, the plaited shaft, a crown flaring like a basket's rim, planted, a cedar ring round it. */
function basketTower(k: DevCtx, w: number, h: number): number {
  const { sink, x, z, yb, yt } = k;
  const plan = fp.octagon(w, w, w * 0.24);
  walls(sink, "dark", scaled(plan, 0.97), x, z, yb, yt + 2.6, { yRef: yt });
  const rim = h - 7;
  walls(sink, "basket", plan, x, z, yt + 2.6, yt + rim, { tint: CEDAR, yRef: yt, segs: 3, s1: 0.9 });
  const ring = walls(sink, "basket", scaled(plan, 0.9), x, z, yt + rim, yt + h, { tint: CEDAR_DARK, yRef: yt, segs: 3, s1: 1.24, curve: (t) => t * t });
  walls(sink, "timber", scaled(plan, 0.9 * 1.27), x, z, yt + h, yt + h + 0.5, { tint: CEDAR_DARK });
  cap(sink, "garden", at(ring, yt + h + 0.45));
  for (let q = 0; q < 5; q++) {
    const a = (q / 5) * Math.PI * 2;
    k.terrace(x + Math.cos(a) * w * 0.38, yt + h + 0.45, z + Math.sin(a) * w * 0.38, 0.6, q % 2 ? "cedar" : "smaple");
  }
  return h + 0.5;
}

/** A tower in one family: a dark lobby, its shaft, two floors set back under a planted roof. */
function cedarTower(k: DevCtx, fam: FamilyId, w: number, d: number, h: number, tint: Tint): number {
  const { sink, x, z, yb, yt } = k;
  const plan = fp.chamfer(w, d, Math.min(w, d) * 0.28);
  walls(sink, "dark", scaled(plan, 0.97), x, z, yb, yt + 2.2, { yRef: yt });
  const ring = walls(sink, fam, plan, x, z, yt + 2.2, yt + h - 3.8, { tint, yRef: yt });
  cap(sink, "garden", at(ring, yt + h - 3.8));
  const top = walls(sink, "glass", scaled(plan, 0.74), x, z, yt + h - 3.8, yt + h, { tint: [0.84, 0.9, 0.86], yRef: yt });
  cap(sink, "garden", at(top, yt + h));
  k.terrace(x + w * 0.36, yt + h - 3.8, z + d * 0.36, 0.55, "cedar");
  k.terrace(x - w * 0.36, yt + h - 3.8, z - d * 0.36, 0.5, "smaple");
  return h;
}

/** Chinatown's pavilion: red columns on a stone base, a floor over them, two tiers of green-tiled eaves, a gold finial (7.5 high). */
function lanternPavilion(k: DevCtx, w: number, d: number): number {
  const { sink, x, z, yb, yt } = k;
  const red = T(0xb8322a);
  const green = T(0x4f8f6a);
  const gold = T(0xe8c060);
  walls(sink, "stone", fp.rect(w, d), x, z, yb, yt + 0.5, { tint: T(0xd8cfc0), yRef: yt });
  walls(sink, "dark", fp.rect(w - 0.8, d - 0.8), x, z, yt + 0.5, yt + 2.4, { yRef: yt });
  // the columns of the arcade round it
  for (const side of [-1, 1]) {
    for (let q = 0; q <= 3; q++) {
      const u = -w / 2 + 0.3 + ((w - 0.6) * q) / 3;
      box(sink, "concrete", x + u, yt + 0.5, z + side * (d / 2 - 0.3), 0.3, 1.9, 0.3, red);
      box(sink, "concrete", x + side * (w / 2 - 0.3), yt + 0.5, z + u * (d / w), 0.3, 1.9, 0.3, red);
    }
  }
  walls(sink, "stucco", fp.rect(w - 0.3, d - 0.3), x, z, yt + 2.4, yt + 4.0, { tint: T(0xf3e6c8), yRef: yt });
  hip(sink, "tile", x, z, w + 0.1, d + 0.1, yt + 4.0, 0.8, green, 0, 0.8);
  walls(sink, "stucco", fp.rect(w * 0.56, d * 0.56), x, z, yt + 4.4, yt + 5.6, { tint: red, yRef: yt });
  hip(sink, "tile", x, z, w * 0.56, d * 0.56, yt + 5.6, 1.0, green, 0, 0.6);
  solid(sink, "copper", tpl("drum8", () => new CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)), x, yt + 6.5, z, 0.3, 0.18, 0.3, gold);
  solid(sink, "copper", tpl("finial6", () => new ConeGeometry(1, 1, 6).translate(0, 0.5, 0)), x, yt + 6.65, z, 0.18, 0.85, 0.18, gold);
  return 7.5;
}

/** senákw's podium: along the line through its pair of towers. */
const SENAKW_EAST = { x: -224.9, z: 177.15, ry: 0.492 };
/** Where a point in a frame (x, z, ry) is: local x along it, local z across. */
const inFrame = (f: { x: number; z: number; ry: number }, lx: number, lz: number): [number, number] => {
  const c = Math.cos(f.ry);
  const s = Math.sin(f.ry);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
};

export const DEVELOPMENTS: DevBuilding[] = [
  // senákw: the tallest by the bridge's foot, in the gap between the blocks there, and one across the street east
  { name: "senákw I", x: -257.75, z: 172.25, ry: 0.3, w: 5.2, d: 5.2, build: (k) => senakwTower(k, 5.2, 5.2, 80, SENAKW_GLASS[0]) },
  { name: "senákw II", x: -231.75, z: 156.75, ry: -0.27, w: 4.8, d: 4.8, build: (k) => senakwTower(k, 4.8, 4.8, 64, SENAKW_GLASS[1], 0.97) },
  // the east podium on the shore, its towers over the water
  { name: "senákw east podium", ...SENAKW_EAST, w: 8, d: 17.5, build: (k) => cedarPodium(k, 8, 17.5, 3.4, 6) },
  { name: "senákw III", ...SENAKW_EAST, x: inFrame(SENAKW_EAST, 0, -5.4)[0], z: inFrame(SENAKW_EAST, 0, -5.4)[1], w: 6.8, d: 6.6, on: "senákw east podium", build: (k) => senakwTower(k, 6.8, 6.6, 90, SENAKW_GLASS[2], 0.92) },
  { name: "senákw IV", ...SENAKW_EAST, x: inFrame(SENAKW_EAST, 0, 5.6)[0], z: inFrame(SENAKW_EAST, 0, 5.6)[1], w: 6, d: 6, on: "senákw east podium", build: (k) => senakwTower(k, 6, 6, 70, SENAKW_GLASS[3]) },
  // south of the bridge's foot, stepping down toward First Avenue; west of the bridge, toward Vanier Park, a tower and the hall
  { name: "senákw V", x: -247.3, z: 184.2, ry: -0.557, w: 5.6, d: 5.6, build: (k) => senakwTerraces(k, 5.6, 5.6, 7, 4.6, SENAKW_GLASS[1]) },
  { name: "senákw VI", x: -267.3, z: 155.3, ry: -0.557, w: 5.4, d: 5.4, build: (k) => senakwTower(k, 5.4, 5.4, 52, SENAKW_GLASS[2], 0.96) },
  { name: "senákw hall", x: -289.75, z: 148.25, ry: 0, w: 5, d: 5, build: (k) => cedarHall(k, 5, 5, 2, ART.bighouse) },
  // across the bridge, at its north end
  { name: "Basket Tower", x: -184.8, z: 84.3, ry: 0.7, w: 7.5, d: 7.5, build: (k) => basketTower(k, 7.5, 96) },
  // the longhouse towers at the Granville Bridge's south end: the big house on the shore, the towers on the rise behind
  { name: "Longhouse", x: -168.3, z: 228.6, ry: 0, w: 13, d: 6.4, build: (k) => cedarHall(k, 13, 6.4, 2, ART.bighouse) },
  { name: "Longhouse podium", x: -168.3, z: 235.2, ry: 0, w: 13, d: 6.2, build: (k) => cedarPodium(k, 13, 6.2, 3, 4) },
  { name: "Longhouse Tower I", x: -172.3, z: 235.2, ry: 0, w: 5, d: 5.2, on: "Longhouse podium", build: (k) => cedarTower(k, "basket", 5, 5.2, 70, CEDAR) },
  { name: "Longhouse Tower II", x: -164.3, z: 235.2, ry: 0, w: 5, d: 5.2, on: "Longhouse podium", build: (k) => cedarTower(k, "salish", 5, 5.2, 46, CEDAR) },
  // Chinatown's pavilion
  { name: "Lantern Pavilion", x: 70.3, z: 51.8, ry: 0, w: 4.2, d: 4.2, build: (k) => lanternPavilion(k, 4.2, 4.2) },
];

/** A piece of public art at a development (cultureKit.ts builds it, Culture.tsx draws and lights it), on the ground. */
export type DevPiece = { kind: Kind; x: number; z: number; ry: number; quarter?: number; w?: number };
export const DEV_PIECES: DevPiece[] = [
  // senákw's welcome figures facing the bridge's foot, either side of its tallest tower, and the spindle whorl by its
  // eastern one
  { kind: "welcome", x: -266, z: 173.25, ry: 3.14, quarter: 0 },
  { kind: "welcome", x: -254.5, z: 165.5, ry: -1.36, quarter: 1 },
  { kind: "whorl", x: -236.5, z: 157, ry: 2.6 },
  { kind: "post", x: -186, z: 91.5, ry: 0.7 },
  { kind: "moongate", x: 80, z: 42.5, ry: Math.PI, w: 5 },
];

/**
 * A footprint's foot and floor, as the city seats its lots (city.ts floorAt and footAt): on low-end devices the coarser
 * ground as drawn counts too.
 */
export function devLevels(b: DevBuilding, lowEnd: boolean): { yb: number; yt: number } {
  const c = Math.cos(b.ry);
  const s = Math.sin(b.ry);
  let yb = Infinity;
  let yt = -Infinity;
  for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      const lx = u * b.w;
      const lz = v * b.d;
      const x = b.x + lx * c + lz * s;
      const z = b.z - lx * s + lz * c;
      const g = groundAt(x, z);
      const sf = lowEnd ? surfaceAt(x, z, 2) : g;
      yb = Math.min(yb, g, sf);
      yt = Math.max(yt, g, sf);
    }
  }
  return { yb: yb - 0.6, yt };
}
