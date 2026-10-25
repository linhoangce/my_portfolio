/**
 * Developments placed by hand, each with a culture of the city's in it, built after the city's lots and its murals
 * (city.ts) on ground none of them took (each footprint checked clear of every lot, street, bridge, park and the
 * water):
 * - senákw on its own ground (sites.ts), the Sḵwx̱wú7mesh (Squamish) Nation's towers either side of the Burrard Bridge's
 *   ramp at its south end, as the Nation's renderings show them: big rounded towers whose sides swell and draw in as
 *   they rise, in cream balcony bands over gold ribbons (the façade family `wave`), each crowned with a garden of trees;
 *   the tallest beside the ramp, stepping down to the water east of it, and west of it a row of lower ones like river
 *   stones stacked, green between each; a round glass pavilion with a planted roof among the east ones; welcome
 *   figures either side of the ramp, a spindle whorl on the plaza. (Towers after its first renderings stand behind
 *   Science World, senakw.ts.)
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

/** Cedar, as the boards and plaits are tinted. */
const CEDAR: Tint = [0.84, 0.58, 0.38];
const CEDAR_DARK: Tint = [0.7, 0.46, 0.3];

/**
 * A senákw tower: a rounded plan on a glass lobby, its sides swelling and drawing in as it rises, `waves` times over by
 * `swell` of its width (as stacked river stones, `stones`: pinched in between each, a ledge of planting at each pinch;
 * else in one long sway), turning a little, in the `wave` family; its crown a garden of trees.
 */
function senakwTower(k: DevCtx, w: number, d: number, h: number, swell: number, waves: number, stones = false): number {
  const { sink, x, z, yb, yt } = k;
  const plan = fp.rounded(w, d, Math.min(w, d) * 0.42, 4);
  walls(sink, "dark", scaled(plan, 0.94), x, z, yb, yt + 3, { yRef: yt });
  const crown = h - 1.4;
  const curve = stones ? (t: number) => Math.sin(Math.PI * ((t * waves) % 1)) : (t: number) => Math.sin(t * waves * Math.PI * 2);
  const ring = walls(sink, "wave", plan, x, z, yt + 3, yt + crown, { yRef: yt, segs: Math.ceil((crown - 3) / 2.2), s1: 1 + swell, curve, r1: 0.14 });
  // a low glass rail round the garden, trees in it
  const rail = walls(sink, "glass", ring.map(([a, , b]) => [a - x, b - z] as [number, number]), x, z, yt + crown, yt + h, { tint: [0.85, 0.93, 0.9], yRef: yt });
  cap(sink, "garden", at(rail, yt + crown + 0.3));
  const top = 1 + swell * curve(1);
  for (let q = 0; q < 6; q++) {
    const a = (q / 6) * Math.PI * 2 + 0.3;
    k.terrace(x + Math.cos(a) * w * 0.3 * top, yt + crown + 0.3, z + Math.sin(a) * d * 0.3 * top, 0.75 + (q % 3) * 0.12, (["cedar", "arbutus", "hemlock"] as const)[q % 3]);
  }
  k.terrace(x, yt + crown + 0.3, z, 0.95, "cedar");
  // the stones' ledges: planting spilling over each pinch
  if (stones) {
    for (let i = 1; i < waves; i++) {
      const y = yt + 3 + ((crown - 3) * i) / waves;
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI * 2 + i * 0.9;
        k.terrace(x + Math.cos(a) * w * 0.47, y, z + Math.sin(a) * d * 0.47, 0.42, q % 2 ? "arbutus" : "cedar");
      }
    }
  }
  return h;
}

/** senákw's pavilion: a round glass hall, a white slab over it, a garden on its roof. */
function senakwPavilion(k: DevCtx, w: number, h: number): number {
  const { sink, x, z, yb, yt } = k;
  walls(sink, "dark", fp.ellipse(w * 0.98, w * 0.98, 24), x, z, yb, yt + 0.3, { yRef: yt });
  walls(sink, "glass", fp.ellipse(w * 0.9, w * 0.9, 24), x, z, yt + 0.3, yt + h, { tint: [0.82, 0.9, 0.95], yRef: yt });
  const slab = walls(sink, "concrete", fp.ellipse(w, w, 24), x, z, yt + h, yt + h + 0.45, { tint: [0.96, 0.95, 0.92] });
  cap(sink, "garden", at(slab, yt + h + 0.4));
  for (let q = 0; q < 4; q++) k.terrace(x + Math.cos(q * 1.7) * w * 0.25, yt + h + 0.4, z + Math.sin(q * 1.7) * w * 0.25, 0.5, q % 2 ? "arbutus" : "cedar");
  return h + 0.45;
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

export const DEVELOPMENTS: DevBuilding[] = [
  // senákw, turned square to the bridge's ramp: east of it the tallest beside the ramp and the others stepping down
  // to the water, the pavilion among them; west of it the river stones, lower toward the ramp's foot
  { name: "senákw I", x: -247.31, z: 164.04, ry: -0.713, w: 11, d: 9.5, build: (k) => senakwTower(k, 11, 9.5, 92, 0.08, 1.6) },
  { name: "senákw II", x: -249.64, z: 175.9, ry: -0.713, w: 9.5, d: 9, build: (k) => senakwTower(k, 9.5, 9, 82, 0.09, 2.1) },
  { name: "senákw III", x: -236.43, z: 157.58, ry: -0.713, w: 9, d: 9, build: (k) => senakwTower(k, 9, 9, 74, 0.09, 1.8) },
  { name: "senákw IV", x: -225.82, z: 162.13, ry: -0.713, w: 8.5, d: 8.5, build: (k) => senakwTower(k, 8.5, 8.5, 66, 0.1, 2.4) },
  { name: "senákw V", x: -229.67, z: 172.69, ry: -0.713, w: 9, d: 8.5, build: (k) => senakwTower(k, 9, 8.5, 56, 0.09, 1.5) },
  { name: "senákw VI", x: -235.91, z: 184.48, ry: -0.713, w: 9, d: 8.5, build: (k) => senakwTower(k, 9, 8.5, 62, 0.1, 2) },
  { name: "senákw pavilion", x: -239.06, z: 175.14, ry: -0.713, w: 5.5, d: 5.5, build: (k) => senakwPavilion(k, 5.5, 4.2) },
  { name: "senákw VII", x: -256.68, z: 127.49, ry: -0.713, w: 8, d: 8, build: (k) => senakwTower(k, 8, 8, 58, 0.16, 5, true) },
  { name: "senákw VIII", x: -266.19, z: 143.06, ry: -0.713, w: 8, d: 8, build: (k) => senakwTower(k, 8, 8, 52, 0.16, 4, true) },
  { name: "senákw IX", x: -274.2, z: 150.02, ry: -0.713, w: 8, d: 8, build: (k) => senakwTower(k, 8, 8, 46, 0.16, 4, true) },
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
  // senákw's welcome figures either side of the ramp, facing its foot, and the spindle whorl on the plaza east of it
  { kind: "welcome", x: -261.76, z: 170.04, ry: -1.77, quarter: 0 },
  { kind: "welcome", x: -275.37, z: 158.26, ry: 0.34, quarter: 1 },
  { kind: "whorl", x: -234.08, z: 165.56, ry: 2.6 },
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
