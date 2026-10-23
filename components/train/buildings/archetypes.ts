/**
 * The building archetypes of Vancouver, 2100. Heritage, kept: Gastown brick (arched or warehouse), the Chinatown
 * recessed-balcony block, the flatiron corner, the Edwardian office block, the Art Deco tower and the stone civic
 * building. Current: the Vancouverism point tower on a townhouse podium, the West End slab, the dark office, Olympic
 * Village colour panels, townhouse rows, a heritage base under a glass tower. 2100: the terraced mass-timber tower,
 * the pixel twist (after Vancouver House), the helix, the vertical forest, twin towers with a sky bridge, the biodome
 * tower, the lofted wave, and rarely the needle, stacked blocks and the ziggurat. Between them the everyday city: the
 * six-storey mixed-use block of the arterials, the courtyard block, the office tower in fins, the concrete modernism
 * of the sixties kept, the banded tower after the Butterfly and the metal-clad loft with a sawtooth roof; and the
 * downtown tower, built from parts so that no two read alike. Every one
 * varies footprint, tiers, tint and uv offset; only some carry trees.
 */
import { BoxGeometry, type BufferGeometry, Color, CylinderGeometry, SphereGeometry, TorusGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { Rng } from "../cityModel";
import type { SpeciesId } from "../trees/species";
import type { ArchId, Hood } from "./eras";
import type { FamilyId } from "./facadeArray";
import type { Tint, V3 } from "./meshBuilder";
import { ART } from "../cultureArt";
import { box, cap, fp, gable, hip, type Sink, slopedTop, solid, strut, tpl, walls, WHITE } from "./parts";

export type Ctx = {
  rng: Rng;
  sink: Sink;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Lowest ground under the lot (walls start here) and highest (floors are measured from here). */
  yb: number;
  yt: number;
  H: number;
  hood: Hood;
  /** A small tree on a terrace or planted balcony. */
  terrace: (x: number, y: number, z: number, s: number, sp: SpeciesId) => void;
  /** For the civic building: always crown it with a dome (heroes), else a coin toss. */
  dome?: boolean;
  /**
   * A blank side wall a mural could take (the city's murals, city.ts): its face at local x = lx (facing out along lx's
   * sign), centred lz along z, len long, from y0 to y1.
   */
  wall?: (lx: number, lz: number, len: number, y0: number, y1: number, subject?: number, front?: boolean) => void;
};

const c = new Color();
const tint = (rng: Rng, hex: number, v = 0.08): Tint => {
  c.setHex(hex).offsetHSL((rng.next() - 0.5) * v * 0.3, (rng.next() - 0.5) * v, (rng.next() - 0.5) * v);
  return [c.r, c.g, c.b];
};
const T = (hex: number): Tint => {
  c.setHex(hex);
  return [c.r, c.g, c.b];
};
export const PAL = {
  chinatown: [0xa8d5c0, 0xf3e6c8, 0xf2b8a0, 0xf4e08f, 0xb9d3e8, 0xe8c9d6, 0xd9e4c4],
  colourPanel: [0xf1c84b, 0x8fc28a, 0x6fa3d6, 0xe98a5c, 0xc7d36a, 0xf2f0e8],
  brick: [0xc4664c, 0xa94e3c, 0x8f6448, 0xdcc59a, 0xeae2d0, 0x8fa394, 0x6d7a8f, 0xb8735a],
  concrete: [0xffffff, 0xeee6d8, 0xe2e6ea, 0xf3ede0],
  glass: [0xc4dcff, 0xb8e4ff, 0xc0f0e4, 0xb0c8ff, 0xeef4fa, 0xffeccc],
  wood: [0x5f8f8b, 0xc9a447, 0x8f3b3b, 0x7f9a6a, 0xe7dcc4, 0x4f6c8f, 0xc4775a, 0x9a8bb5, 0xd9c08a],
  stone: [0xf3ede0, 0xe9dcc4, 0xd8c8a8, 0xf1e6d2, 0xcfc3b0],
  terracotta: [0xe6c9a2, 0xd9b48e, 0xcfa27e, 0xe8d6bc],
  /** Rainscreen panels: terracotta, sand, warm grey, charcoal, white, a muted sage. */
  panel: [0xd98e6a, 0xc77a58, 0xe8d6bc, 0xbdb6ab, 0x5d6064, 0xf4f2ee, 0xa9b8a2, 0x8c97a6],
  /** Standing-seam metal: charcoal, black, weathering steel, forest green, silver, navy. */
  metal: [0x4a4d52, 0x2e3034, 0x9a5634, 0x4f6652, 0xb8bcc2, 0x34465c],
  /** Office fins: bronze, champagne, black, silver. */
  mullion: [0xb08a55, 0xd6c08a, 0x3a3a3c, 0xc9ced4],
};
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng.next() * list.length)];
const pickW = <T>(rng: Rng, list: readonly [T, number][]): T => {
  let r = rng.next() * list.reduce((s, [, wt]) => s + wt, 0);
  for (const [v, wt] of list) if ((r -= wt) < 0) return v;
  return list[0][0];
};
/** A landing pad's deck, a unit cylinder from y 0 to 1: its top shows the pad's mark, its sides plain deck. */
function padDeck(): BufferGeometry {
  const g = new CylinderGeometry(1, 1, 1, 28).translate(0, 0.5, 0);
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) if (n.getY(i) < 0.5) uv.setXY(i, 0.03, 0.03);
  return g;
}

/** A delivery quadcopter at rest, about two across (as vessels.ts flies them): a charcoal body and arms on the pad's plain deck, pale props on its white mark. */
function parkedDrone(): BufferGeometry {
  const plain = (g: BufferGeometry, u: number, v: number) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
    return g;
  };
  const parts: BufferGeometry[] = [plain(new BoxGeometry(0.7, 0.3, 0.95).translate(0, 0.32, 0), 0.03, 0.03), plain(new BoxGeometry(0.55, 0.12, 0.7).translate(0, 0.53, 0), 0.03, 0.03)];
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const ax = sx * 0.75;
    const az = sz * 0.75;
    parts.push(plain(new BoxGeometry(0.1, 0.08, 1.06).rotateY(Math.atan2(sx, sz)).translate(ax / 2, 0.38, az / 2), 0.03, 0.03));
    parts.push(plain(new CylinderGeometry(0.06, 0.06, 0.34, 5).translate(ax, 0.17, az), 0.03, 0.03));
    parts.push(plain(new CylinderGeometry(0.48, 0.48, 0.03, 12).translate(ax, 0.48, az), 0.4, 0.5));
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed())) ?? parts[0];
}

const crown = (rng: Rng) => (rng.next() < 0.5 ? "crownA" : "crownB") as "crownA" | "crownB";

/**
 * The downtown tower's skins, weighted: each picks its façade family and the tints it is seen in (green Vancouver
 * glass, blue, gold, bronze, emerald, rose or violet glass, black, silver, granite or precast, balconies, ribbon
 * windows, bronze fins, brick, ceramic panels).
 */
const DT_SKINS: [{ pick: (rng: Rng) => [FamilyId, number[]] }, number][] = [
  [{ pick: () => ["vancouver", [0xd8fff4, 0xe6fff8, 0xccf2ee, 0xf0fffa]] }, 2.2],
  [{ pick: () => ["glass", [0xa8c8ff, 0x98c0f0, 0xb8d4ff, 0x90b8e8]] }, 1.4],
  [{ pick: () => ["glass", [0xffd070, 0xf0b080, 0xa0f0c0, 0x98b4ff, 0xffc0b8, 0x90f0e0, 0xd0b8ff, 0x80c8a8]] }, 1.8],
  [{ pick: () => ["dark", [0x8aa0c0, 0x7a8ca8, 0x98a8c4]] }, 1.2],
  [{ pick: () => ["glass", [0xf2f4f6, 0xe4e8ec, 0xfaf6ee]] }, 0.6],
  [{ pick: (rng) => [rng.next() < 0.35 ? "stone" : "grid", [0xe9dcc4, 0xd8c8a8, 0xe8c8b8, 0xc9c4bc, 0xf1e6d2, 0xd4b8a8]] }, 1.0],
  [{ pick: () => ["balcony", [0xffffff, 0xf3ede0, 0xe2e6ea, 0xeee6d8, 0xe8e0d0]] }, 0.8],
  [{ pick: () => ["ribbon", PAL.concrete] }, 0.4],
  [{ pick: () => ["mullion", PAL.mullion] }, 0.6],
  [{ pick: () => ["brick", PAL.brick] }, 0.4],
  [{ pick: () => ["rainscreen", PAL.panel] }, 0.4],
];

export const BUILD: Record<Exclude<ArchId, "house">, (o: Ctx) => void> = {
  /**
   * After Coast Salish plank houses and the Indigenous-led building of today: cedar-clad walls with a formline band
   * under every window, a broad low gable over the street front with deep eaves, two carved house posts at the door,
   * a painted front under the gable and painted side walls (city.ts paints them, Coast Salish–inspired), two to six
   * floors.
   */
  salishHall(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const floors = Math.max(2, Math.min(6, Math.round(o.H / 1.9)));
    const top = yt + 0.3 + floors * 1.9;
    const t = tint(rng, [0xc98b55, 0xb8794a, 0xd09a68, 0xa96c43][Math.floor(rng.next() * 4)], 0.05);
    walls(sink, "dark", fp.rect(w * 1.01, d * 1.01), x, z, yb, yt + 0.3, { yRef: yt });
    walls(sink, "salish", fp.rect(w, d), x, z, yt + 0.3, top, { tint: t, yRef: yt });
    const pitch = Math.min(3.4, w * 0.24);
    gable(sink, "salish", "shingle", x, z, w, d, yt, top, pitch, t, T(0x6e4a2c), 0, 0.9);
    // the house posts either side of the door, carved figures standing two floors, their faces painted
    const postH = Math.min(top - yt, 4.4);
    for (const s of [-1, 1]) {
      const px = s * Math.min(2.4, w * 0.2);
      box(sink, "timber", x + px, yt, z - d / 2 - 0.35, 0.6, postH, 0.55, T(0x8b4a2b));
      o.wall?.(px, -d / 2 - 0.63, 0.6, yt + 0.05, yt + postH, s < 0 ? ART.welcome : ART.welcome2, true);
    }
    // the painted front over the door, the painted side walls
    o.wall?.(0, -d / 2, w * 0.82, yt + 2.2, top - 0.2, -1, true);
    for (const s of [-1, 1]) o.wall?.(s * w * 0.5, 0, d - 1, yt + 0.6, top - 0.2, -1);
  },
  heritageBrick(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const floors = Math.min(6, Math.max(2, Math.round(o.H / 2)));
    const top = yt + floors * 2.0;
    const poly = rng.next() < 0.25 ? fp.chamfer(w, d, Math.min(w, d) * 0.22) : fp.rect(w, d);
    const t = tint(rng, PAL.brick[Math.floor(rng.next() * PAL.brick.length)], 0.1);
    walls(sink, "dark", poly.map(([a, b]) => [a * 1.005, b * 1.005] as [number, number]), x, z, yb, yt + 2.0, { yRef: yt, vOff: 0.25 });
    const ring = walls(sink, "brick", poly, x, z, yt + 2.0, top, { tint: t, yRef: yt, uOff: Math.floor(rng.next() * 4) * 0.5 });
    walls(sink, "concrete", poly.map(([a, b]) => [a * 1.06, b * 1.06] as [number, number]), x, z, top, top + 0.55, { tint: T(0xe9dcc4) });
    cap(sink, "roof", ring.map(([a, , b]) => [a, top + 0.5, b]));
    // its side walls above the shop fronts, clear of a chamfer's cut corners
    for (const s of [-1, 1]) o.wall?.(s * w * 0.5, 0, d - 0.5 * Math.min(w, d) - 0.4, yt + 2.1, top - 0.1);
    if (rng.next() < 0.3) box(sink, "roof", x + (rng.next() - 0.5) * w * 0.4, top, z + (rng.next() - 0.5) * d * 0.4, 1.6, 1.4, 1.6, T(0xc9bfae));
  },
  warehouse(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const floors = Math.min(6, Math.max(3, Math.round(o.H / 2.3)));
    const top = yt + floors * 2.3;
    const ring = walls(sink, "warehouse", fp.rect(w, d), x, z, yb, top, { tint: tint(rng, PAL.brick[Math.floor(rng.next() * PAL.brick.length)], 0.12), yRef: yt, uOff: Math.floor(rng.next() * 4) * 0.5 });
    walls(sink, "concrete", fp.rect(w * 1.04, d * 1.04), x, z, top, top + 0.7, { tint: T(0xd9cbb3) });
    cap(sink, "roof", ring.map(([a, , b]) => [a, top + 0.65, b]));
    for (const s of [-1, 1]) o.wall?.(s * w * 0.5, 0, d - 0.6, yt + 0.4, top - 0.1);
    // a 2100 rooftop greenhouse in glass
    if (rng.next() < 0.4) solid(sink, "dome", tpl("roofBox4", () => new CylinderGeometry(1, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)), x, top + 0.6, z, w * 0.32, 2.2, d * 0.32);
  },
  chinatownBlock(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const along = w > d;
    const n = Math.min(4, Math.max(1, Math.round((along ? w : d) / 5.5)));
    for (let k = 0; k < n; k++) {
      const fw = (along ? w : d) / n;
      const off = -((along ? w : d) / 2) + fw * (k + 0.5);
      const cx = along ? x + off : x;
      const cz = along ? z : z + off;
      const ww = along ? fw - 0.15 : w;
      const dd = along ? d : fw - 0.15;
      const floors = 2 + Math.floor(rng.next() * 3);
      const top = yt + 1.9 * floors + 0.6;
      const t = tint(rng, PAL.chinatown[Math.floor(rng.next() * PAL.chinatown.length)], 0.06);
      walls(sink, "dark", fp.rect(ww * 1.01, dd * 1.01), cx, cz, yb, yt + 1.9, { yRef: yt, vOff: 0.3 });
      const ring = walls(sink, "stucco", fp.rect(ww, dd), cx, cz, yt + 1.9, top, { tint: t, yRef: yt, uOff: Math.floor(rng.next() * 2) * 0.5 });
      walls(sink, "concrete", fp.rect(ww * 1.04, dd * 1.04), cx, cz, top, top + 0.4, { tint: [t[0] * 0.92, t[1] * 0.92, t[2] * 0.92] });
      cap(sink, "roof", ring.map(([a, , b]) => [a, top + 0.4, b]));
      // the row's end walls, when it runs along the street
      if (along && k === 0) o.wall?.(-(w / 2 - 0.075), 0, d - 0.4, yt + 2.0, top - 0.05);
      if (along && k === n - 1) o.wall?.(w / 2 - 0.075, 0, d - 0.4, yt + 2.0, top - 0.05);
      if (rng.next() < 0.35) {
        box(sink, "roof", cx, top + 0.4, cz, ww * 0.45, 1.5, dd * 0.45, T(0xc0392b));
        hip(sink, "tile", cx, cz, ww * 0.5, dd * 0.5, top + 1.9, 1.2);
      }
      if (rng.next() < 0.55) box(sink, crown(rng), cx + (along ? 0 : ww / 2 + 0.1), yt + 2.4, cz + (along ? dd / 2 + 0.1 : 0), along ? 0.25 : 0.15, 2.4, along ? 0.15 : 0.25);
    }
  },
  flatiron(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const floors = 4 + Math.floor(rng.next() * 3);
    const top = yt + floors * 2.0;
    const t = tint(rng, PAL.brick[Math.floor(rng.next() * PAL.brick.length)], 0.1);
    const poly = fp.chamfer(w, d, Math.min(w, d) * 0.55);
    walls(sink, "dark", poly.map(([a, b]) => [a * 1.005, b * 1.005] as [number, number]), x, z, yb, yt + 2.0, { yRef: yt, vOff: 0.25 });
    const ring = walls(sink, "brick", poly, x, z, yt + 2.0, top, { tint: t, yRef: yt });
    walls(sink, "concrete", poly.map(([a, b]) => [a * 1.06, b * 1.06] as [number, number]), x, z, top, top + 0.6, { tint: T(0xe9dcc4) });
    cap(sink, "roof", ring.map(([a, , b]) => [a, top + 0.55, b]));
    // a copper cupola on the sharp corner
    solid(sink, "copper", tpl("drum12", () => new CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0)), x - w * 0.32, top + 0.55, z - d * 0.32, 1.4, 2.2, 1.4);
    solid(sink, "copper", tpl("cupola12x8", () => new SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), x - w * 0.32, top + 2.75, z - d * 0.32, 1.5, 1.6, 1.5);
  },
  pointTower(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const ph = 3.5 + rng.next() * 2.5;
    const pod = rng.next();
    const podFam = pod < 0.35 ? "brick" : pod < 0.6 ? "concrete" : pod < 0.85 ? "rainscreen" : "metal";
    const podPal = podFam === "brick" ? PAL.brick : podFam === "rainscreen" ? PAL.panel : podFam === "metal" ? PAL.metal : PAL.concrete;
    walls(sink, podFam, fp.rect(w, d), x, z, yb, yt + ph, { tint: tint(rng, pick(rng, podPal)), yRef: yt });
    cap(sink, "garden", fp.rect(w, d).map(([a, b]) => [x + a, yt + ph, z + b]));
    const tw = w * (0.5 + rng.next() * 0.16);
    const td = d * (0.5 + rng.next() * 0.16);
    const ox = (rng.next() - 0.5) * (w - tw) * 0.6;
    const oz = (rng.next() - 0.5) * (d - td) * 0.6;
    const roll = rng.next();
    const kind = roll < 0.46 ? "vancouver" : roll < 0.62 ? "glass" : roll < 0.74 ? "balcony" : roll < 0.82 ? "ribbon" : roll < 0.92 ? "mullion" : "grid";
    const shape = rng.next();
    const poly = shape < 0.4 ? fp.rounded(tw, td, Math.min(tw, td) * 0.2) : shape < 0.55 ? fp.chamfer(tw, td, Math.min(tw, td) * 0.3) : shape < 0.65 ? fp.ellipse(tw, td, 18) : fp.rect(tw, td);
    const t = kind === "mullion" ? tint(rng, pick(rng, PAL.mullion), 0.04) : kind === "ribbon" || kind === "grid" ? tint(rng, pick(rng, PAL.concrete), 0.03) : tint(rng, PAL.glass[Math.floor(rng.next() * PAL.glass.length)], 0.04);
    // the tower, then a setback penthouse of two floors in the same skin
    const pent = Math.min(3.4, H * 0.08);
    const ring = walls(sink, kind, poly, x + ox, z + oz, yt + ph, yt + H - pent, { tint: t, yRef: yt, uOff: rng.next() });
    cap(sink, "garden", ring);
    const top = walls(sink, kind, poly.map(([a, b]) => [a * 0.78, b * 0.78] as [number, number]), x + ox, z + oz, yt + H - pent, yt + H, { tint: t, yRef: yt });
    cap(sink, "roof", top);
    box(sink, "roof", x + ox, yt + H, z + oz, tw * 0.3, 1.4, td * 0.3, T(0xa9adb3));
    if (rng.next() < 0.3) box(sink, crown(rng), x + ox, yt + H - pent - 0.25, z + oz, tw * 1.02, 0.3, td * 1.02);
  },
  /**
   * An Edwardian office block (the Dominion Building, the Sun Tower, the Vancouver Block): a two-storey stone base,
   * a brick or stone shaft, a heavy cornice, and now and then a copper roof or a cupola.
   */
  edwardian(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const floors = Math.min(13, Math.max(4, Math.round(H / 2.1)));
    const top = yt + 4.2 + (floors - 2) * 2.1;
    const poly = rng.next() < 0.3 ? fp.chamfer(w, d, Math.min(w, d) * 0.22) : fp.rect(w, d);
    const brickShaft = rng.next() < 0.55;
    walls(sink, "stone", poly.map(([a, b]) => [a * 1.012, b * 1.012] as [number, number]), x, z, yb, yt + 4.2, { tint: tint(rng, pick(rng, PAL.stone), 0.05), yRef: yt });
    walls(sink, "concrete", poly.map(([a, b]) => [a * 1.03, b * 1.03] as [number, number]), x, z, yt + 4.2, yt + 4.6, { tint: T(0xe6dcc8) });
    const ring = walls(sink, brickShaft ? "brick" : "stone", poly, x, z, yt + 4.6, top, { tint: brickShaft ? tint(rng, pick(rng, PAL.brick), 0.08) : tint(rng, pick(rng, PAL.stone), 0.05), yRef: yt, uOff: Math.floor(rng.next() * 2) * 0.5 });
    walls(sink, "concrete", poly.map(([a, b]) => [a * 1.07, b * 1.07] as [number, number]), x, z, top, top + 0.9, { tint: T(0xe9dfca) });
    cap(sink, "roof", ring.map(([a, , b]) => [x + (a - x) * 1.07, top + 0.9, z + (b - z) * 1.07]));
    const roll = rng.next();
    if (roll < 0.3) hip(sink, "copper", x, z, w * 0.94, d * 0.94, top + 0.9, Math.min(w, d) * 0.32);
    else if (roll < 0.45) {
      solid(sink, "copper", tpl("drum12", () => new CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0)), x, top + 0.9, z, 1.6, 2.4, 1.6);
      solid(sink, "copper", tpl("cupola12x8", () => new SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), x, top + 3.3, z, 1.7, 2.2, 1.7);
    }
  },
  /** An Art Deco tower in the Marine Building's manner: terracotta piers rising unbroken, stepped setbacks, a copper crown. */
  decoTower(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const Ht = Math.min(H, 46);
    const t = tint(rng, pick(rng, PAL.terracotta), 0.05);
    let y0 = yb;
    for (const [s, f] of [
      [0.92, 0.56],
      [0.74, 0.8],
      [0.56, 0.93],
    ] as const) {
      const ring = walls(sink, "deco", fp.rect(w * s, d * s), x, z, y0, yt + Ht * f, { tint: t, yRef: yt });
      cap(sink, "roof", ring);
      y0 = yt + Ht * f;
    }
    const cw = Math.min(w, d) * 0.4;
    walls(sink, "copper", fp.rect(cw, cw), x, z, y0, yt + Ht, { tint: T(0xc4e2d4) });
    hip(sink, "copper", x, z, cw, cw, yt + Ht, cw * 0.7);
  },
  /**
   * A stone civic building (the Art Gallery's old courthouse, a bank, a library): three storeys of stone under a
   * cornice, a portico of columns with a pediment on the street front, and sometimes a copper dome.
   */
  civic(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const top = yt + 6.4 + rng.next() * 2;
    const bw = w * 0.9;
    const bd = d * 0.78;
    const t = tint(rng, 0xece4d2, 0.04);
    const ring = walls(sink, "stone", fp.rect(bw, bd), x, z, yb, top, { tint: t, yRef: yt });
    walls(sink, "concrete", fp.rect(bw * 1.04, bd * 1.05), x, z, top, top + 0.7, { tint: T(0xe8e0cc) });
    cap(sink, "roof", ring.map(([a, , b]) => [x + (a - x) * 1.04, top + 0.7, z + (b - z) * 1.05]));
    // the portico on the south or north front
    const side = rng.next() < 0.5 ? 1 : -1;
    const pz = z + side * (bd / 2 + 1.3);
    const pw = bw * 0.5;
    const n = 6;
    for (let k = 0; k < n; k++) {
      solid(sink, "concrete", tpl("column10", () => new CylinderGeometry(1, 1.08, 1, 10).translate(0, 0.5, 0)), x - pw / 2 + (pw * k) / (n - 1), yt, pz, 0.36, top - yt - 0.2, 0.36, T(0xf2ecdf));
    }
    box(sink, "concrete", x, top - 0.2, pz, pw + 1.2, 0.9, 3.0, T(0xeee6d4));
    gable(sink, "concrete", "roof", x, pz - side * 0.2, pw + 1.2, 3.4, top + 0.7, top + 0.7, 1.5, T(0xeee6d4), T(0xb9b2a4), 0, 0.1);
    // granite steps up to it
    box(sink, "concrete", x, yt, z + side * (bd / 2 + 2.9), pw + 2, 0.5, 1.4, T(0xc9c3b6));
    if (o.dome ?? rng.next() < 0.45) {
      solid(sink, "stone", tpl("drum16", () => new CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0)), x, top + 0.7, z, 3.2, 2.2, 3.2, t);
      solid(sink, "copper", tpl("dome16x8", () => new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), x, top + 2.9, z, 3.4, 3.2, 3.4);
    }
  },
  /**
   * A mass-timber tower in terraces, after the timber towers planned for Vancouver: a rounded plan stepping back on
   * alternate sides every few floors, warm fins over glass, a white balcony band at every floor and a slab edge
   * round every terrace, trees on the terraces and the roof.
   */
  timberTerraces(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    // a mid-rise form: about twenty storeys at most, however tall the lot allows
    const H = Math.min(o.H, 30 + rng.next() * 12);
    const tiers = Math.min(7, Math.max(2, Math.round(H / 5.4)));
    const th = H / tiers;
    const sx = rng.next() < 0.5 ? 1 : -1;
    const sz = rng.next() < 0.5 ? 1 : -1;
    // the timber as it weathers: fresh, honey, silver-grey, or charred dark
    const t = tint(rng, pick(rng, [0xffffff, 0xfff1dc, 0xd2cfc9, 0x9c8f86]), 0.05);
    const sp: SpeciesId[] = ["smaple", "cherry", "dogwood", "alder"];
    // a third of them plant their terraces; the rest keep them as open decks
    const planted = rng.next() < 0.35;
    let bw = w * 0.92;
    let bd = d * 0.92;
    let cx = x;
    let cz = z;
    let y = yb;
    for (let k = 0; k < tiers; k++) {
      const y1 = yt + th * (k + 1);
      const r = Math.min(bw, bd) * 0.26;
      const ring = walls(sink, "fins", fp.rounded(bw, bd, r, 2), cx, cz, y, y1, { tint: t, yRef: yt, uOff: rng.next() });
      cap(sink, "garden", ring);
      walls(sink, "concrete", fp.rounded(bw + 0.5, bd + 0.5, r + 0.25, 2), cx, cz, y1 - 0.3, y1 + 0.12, { tint: T(0xf6f5f0) });
      if (k === tiers - 1) break;
      // step back on one side, alternating between the two faces
      const nw = k % 2 === 0 ? bw * 0.78 : bw;
      const nd = k % 2 === 1 ? bd * 0.78 : bd;
      const ncx = cx - (sx * (bw - nw)) / 2;
      const ncz = cz - (sz * (bd - nd)) / 2;
      // trees along the uncovered strip of terrace
      for (let q = 0; q < (planted ? 3 : 0); q++) {
        const u = (q - 1) * 0.3;
        if (k % 2 === 0) o.terrace(cx + (sx * bw) / 2 - (sx * (bw - nw)) / 2, y1, cz + u * bd, 0.42 + rng.next() * 0.2, pick(rng, sp));
        else o.terrace(cx + u * bw, y1, cz + (sz * bd) / 2 - (sz * (bd - nd)) / 2, 0.42 + rng.next() * 0.2, pick(rng, sp));
      }
      y = y1;
      bw = nw;
      bd = nd;
      cx = ncx;
      cz = ncz;
    }
    if (planted) for (let q = 0; q < 3; q++) o.terrace(cx + (rng.next() - 0.5) * bw * 0.5, yt + H, cz + (rng.next() - 0.5) * bd * 0.5, 0.5 + rng.next() * 0.25, pick(rng, ["cedar", "smaple", "cherry"] as SpeciesId[]));
  },
  /**
   * The pixel twist, after Vancouver House: a glass podium, then a tower that starts narrow and widens as it rises,
   * turning a little, its skin of staggered white balcony frames.
   */
  pixelTwist(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const ph = 3.6;
    const pod = walls(sink, "dark", fp.chamfer(w, d, Math.min(w, d) * 0.35), x, z, yb, yt + ph, { yRef: yt });
    cap(sink, "garden", pod);
    const tw = w * 0.72;
    const td = d * 0.5;
    const turn = (rng.next() < 0.5 ? 1 : -1) * (0.2 + rng.next() * 0.2);
    const ring = walls(sink, "pixel", fp.rect(tw, td), x, z, yt + ph, yt + H, { segs: 12, s0: 0.5, s1: 1, r0: turn, r1: 0, curve: (u) => Math.pow(u, 0.75), yRef: yt, uOff: rng.next() });
    cap(sink, "garden", ring);
  },
  slab60s(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const sw = w > d ? w * 0.92 : w * 0.55;
    const sd = w > d ? d * 0.55 : d * 0.92;
    const ring = walls(sink, rng.next() < 0.5 ? "balcony" : "concrete", fp.rect(sw, sd), x, z, yb, yt + H, { tint: tint(rng, PAL.concrete[Math.floor(rng.next() * 4)], 0.05), yRef: yt, uOff: rng.next() });
    cap(sink, rng.next() < 0.6 ? "garden" : "roof", ring);
    box(sink, "concrete", x, yt + H, z, sw * 0.35, 1.8, sd * 0.6, T(0xd8d2c4));
  },
  office(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    let ring = walls(sink, "dark", fp.rect(w, d), x, z, yb, yt + H * 0.55, { tint: tint(rng, 0xffffff, 0.04), yRef: yt });
    cap(sink, "roof", ring);
    ring = walls(sink, "dark", fp.rect(w * 0.78, d * 0.78), x, z, yt + H * 0.55, yt + H * 0.85, { yRef: yt });
    cap(sink, "garden", ring);
    ring = walls(sink, "dark", fp.rect(w * 0.55, d * 0.55), x, z, yt + H * 0.85, yt + H, { yRef: yt });
    cap(sink, "roof", ring);
    box(sink, crown(rng), x, yt + H, z, w * 0.56, 0.4, d * 0.56);
  },
  colourPanels(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const h = Math.min(H, 10 + rng.next() * 10);
    const ring = walls(sink, "concrete", fp.L(w, d, 0.55), x, z, yb, yt + h, { tint: tint(rng, PAL.colourPanel[Math.floor(rng.next() * PAL.colourPanel.length)], 0.06), yRef: yt });
    cap(sink, "garden", ring);
    for (let k = 0; k < 4; k++) box(sink, "solar", x - w * 0.3 + k * w * 0.18, yt + h + 0.2, z + d * 0.3, w * 0.12, 0.25, d * 0.25);
  },
  townhouses(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const n = Math.min(5, Math.max(2, Math.round(w / 4)));
    const uw = w / n;
    for (let k = 0; k < n; k++) {
      const cx = x - w / 2 + uw * (k + 0.5);
      const eave = yt + 4.2;
      const t = tint(rng, PAL.wood[Math.floor(rng.next() * PAL.wood.length)], 0.08);
      walls(sink, "wood", fp.rect(uw - 0.1, Math.min(d, 9)), cx, z, yb, eave, { tint: t, yRef: yt });
      gable(sink, "wood", "shingle", cx, z, uw - 0.1, Math.min(d, 9), yt, eave, 2.2, t, WHITE);
    }
  },
  brickBaseTower(o) {
    // a heritage façade kept as the base of a new glass tower
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const base = yt + 8;
    walls(sink, "brick", fp.rect(w, d), x, z, yb, base, { tint: tint(rng, PAL.brick[Math.floor(rng.next() * PAL.brick.length)], 0.1), yRef: yt });
    walls(sink, "concrete", fp.rect(w * 1.05, d * 1.05), x, z, base, base + 0.5, { tint: T(0xe9dcc4) });
    const ring = walls(sink, "glass", fp.rounded(w * 0.72, d * 0.72, 1.5, 3), x, z, base + 0.5, yt + H, { tint: tint(rng, PAL.glass[Math.floor(rng.next() * PAL.glass.length)], 0.04), yRef: yt, s1: 0.9 });
    cap(sink, "garden", ring);
  },
  helix(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const s = Math.min(w, d) * 0.82;
    const kind = rng.next() < 0.3 ? "diagrid" : "glass";
    walls(sink, "dark", fp.rect(w, d), x, z, yb, yt + 3, { yRef: yt });
    cap(sink, "garden", fp.rect(w, d).map(([a, b]) => [x + a, yt + 3, z + b]));
    const ring = walls(sink, kind, fp.rounded(s, s, s * 0.22, 3), x, z, yt + 3, yt + H, { segs: 26, r1: (0.6 + rng.next() * 0.8) * (rng.next() < 0.5 ? 1 : -1), s1: 0.62 + rng.next() * 0.2, tint: tint(rng, PAL.glass[Math.floor(rng.next() * PAL.glass.length)], 0.04), yRef: yt });
    cap(sink, "roof", ring);
    box(sink, crown(rng), x, yt + H - 0.6, z, s * 0.55, 0.6, s * 0.55, WHITE, 0.5);
    solid(sink, "concrete", tpl("spire6", () => new CylinderGeometry(0.18, 0.3, 1, 6).translate(0, 0.5, 0)), x, yt + H, z, 1, 5 + rng.next() * 5, 1, T(0xb8c0c8));
  },
  needle(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const r = Math.min(w, d) * 0.46;
    // mostly green Vancouver glass, now and then the white diagrid
    const diag = rng.next() < 0.3;
    const ring = walls(sink, diag ? "diagrid" : "vancouver", fp.hex(r), x, z, yb, yt + H, { segs: 10, s1: 0.38 + rng.next() * 0.14, curve: (t) => Math.pow(t, 1.6), yRef: yt, tint: diag ? WHITE : tint(rng, 0xd8fff4, 0.03) });
    cap(sink, "roof", ring);
    box(sink, crown(rng), x, yt + H * 0.92, z, r * 0.62, 0.7, r * 0.62);
    solid(sink, "concrete", tpl("needle6", () => new CylinderGeometry(0.12, 0.35, 1, 6).translate(0, 0.5, 0)), x, yt + H, z, 1, H * 0.18, 1, T(0xb8c0c8));
  },
  stacked(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    // blocks of four to six floors, each shifted a little on the one below and turned a few degrees, round a
    // concrete core that carries them; terraces where a block overhangs the next
    const n = Math.min(5, Math.max(2, Math.round(H / 8)));
    walls(sink, "concrete", fp.rect(w * 0.26, d * 0.26), x, z, yb, yt + H, { tint: T(0xd8d2c4), yRef: yt });
    let y = yb;
    let ry = (rng.next() - 0.5) * 0.2;
    for (let k = 0; k < n; k++) {
      const bw = w * (0.66 + rng.next() * 0.18);
      const bd = d * (0.66 + rng.next() * 0.18);
      const ox = (rng.next() - 0.5) * (w - bw) * 0.55;
      const oz = (rng.next() - 0.5) * (d - bd) * 0.55;
      const h = (k === 0 ? yt - yb : 0) + H / n;
      const kind = k % 2 ? "timber" : rng.next() < 0.7 ? "vancouver" : "glass";
      const ring = walls(sink, kind, fp.rect(bw, bd), x + ox, z + oz, y, y + h, { r0: ry, tint: tint(rng, 0xffffff, 0.05), yRef: yt });
      cap(sink, "garden", ring);
      if (rng.next() < 0.25) o.terrace(x + ox + bw * 0.3, y + h, z + oz, 0.5 + rng.next() * 0.25, "smaple");
      y += h;
      ry += (rng.next() - 0.5) * 0.3;
    }
  },
  ziggurat(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const n = Math.min(8, Math.max(3, Math.round(H / 5.5)));
    let y = yb;
    for (let k = 0; k < n; k++) {
      const f = 1 - k * (0.55 / n);
      const bw = w * f;
      const bd = d * (k % 2 ? f : f * 0.94);
      const h = (k === 0 ? yt - yb : 0) + H / n;
      const cx = x + (1 - f) * w * 0.25;
      const ring = walls(sink, "timber", fp.rounded(bw, bd, 1.2, 2), cx, z, y, y + h, { tint: tint(rng, 0xffffff, 0.04), yRef: yt });
      cap(sink, "garden", ring);
      if (k < n - 1) for (let t = 0; t < 3; t++) o.terrace(cx + bw * 0.42, y + h, z + (t - 1) * bd * 0.3, 0.5 + rng.next() * 0.3, (["smaple", "cherry", "cedar"] as SpeciesId[])[Math.floor(rng.next() * 3)]);
      y += h;
    }
  },
  vforest(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const s = Math.min(w, d) * 0.85;
    const ring = walls(sink, "green", fp.ellipse(s, s * (0.75 + rng.next() * 0.25), 22), x, z, yb, yt + H, { yRef: yt, uOff: rng.next() });
    cap(sink, "garden", ring);
    for (let y = yt + 4; y < yt + H - 2; y += 4.2) {
      for (let a = 0; a < Math.PI * 2; a += 1.2) o.terrace(x + Math.cos(a + y) * s * 0.52, y, z + Math.sin(a + y) * s * 0.46, 0.4 + rng.next() * 0.25, (["smaple", "cherry", "alder", "cedar", "fir", "dogwood"] as SpeciesId[])[Math.floor(rng.next() * 6)]);
    }
  },
  twins(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const along = w > d;
    const s = (along ? d : w) * 0.62;
    const gap = (along ? w : d) * 0.5;
    const kind = rng.next() < 0.2 ? "diagrid" : rng.next() < 0.5 ? "vancouver" : "glass";
    const t = tint(rng, PAL.glass[Math.floor(rng.next() * PAL.glass.length)], 0.04);
    for (const sgn of [-1, 1]) {
      const cx = along ? x + sgn * gap * 0.5 : x;
      const cz = along ? z : z + sgn * gap * 0.5;
      const h = H * (sgn < 0 ? 1 : 0.86);
      const ring = walls(sink, kind, fp.rounded(s * 0.8, s, s * 0.3, 3), cx, cz, yb, yt + h, { tint: t, yRef: yt, s1: 0.9 });
      cap(sink, "roof", ring);
      box(sink, sgn < 0 ? "crownA" : "crownB", cx, yt + h - 0.5, cz, s * 0.6, 0.5, s * 0.75);
    }
    // the sky bridge, at least 22 above the street
    const by = yt + Math.max(22, H * 0.62);
    box(sink, "dark", x, by, z, along ? gap : s * 0.4, 2.2, along ? s * 0.4 : gap);
    box(sink, "garden", x, by + 2.2, z, along ? gap : s * 0.42, 0.2, along ? s * 0.42 : gap);
  },
  biodome(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const h = Math.min(H, 12 + rng.next() * 18);
    const ring = walls(sink, rng.next() < 0.3 ? "solar" : "glass", fp.rect(w * 0.9, d * 0.9), x, z, yb, yt + h, { yRef: yt });
    cap(sink, "garden", ring);
    // on a long roof, a drone pad at one end (chosen from the lot's position, so the city's random draws stay as they
    // were), the dome moved toward the other end as far as it needs to clear it
    const long = Math.max(w, d);
    const pad = long >= 11;
    const hash = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    const frac = (v: number) => v - Math.floor(v);
    const end = frac(hash) < 0.5 ? 1 : -1;
    const [ux, uz] = w >= d ? [end, 0] : [0, end];
    const P = Math.min(1.6, Math.min(w, d) * 0.45 - 0.3);
    const along = long * 0.45 - P - 0.25;
    const r = Math.min(w, d) * 0.38;
    const shift = pad ? Math.max(0, r + P + 0.3 - along) : 0;
    const dx = x - ux * shift;
    const dz = z - uz * shift;
    solid(sink, "dome", tpl("biodome12x5", () => new SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2)), dx, yt + h, dz, r, r * 0.8, r);
    for (let k = 0; k < 4; k++) o.terrace(dx + (rng.next() - 0.5) * r, yt + h, dz + (rng.next() - 0.5) * r, 0.6 + rng.next() * 0.3, (["cherry", "smaple", "cedar"] as SpeciesId[])[Math.floor(rng.next() * 3)]);
    if (!pad) return;
    // the pad: a raised round deck with its landing mark, a ring of light round its edge, and on most of them a
    // delivery drone parked, like the ones flying the lanes over the towers
    const px = x + ux * along;
    const pz = z + uz * along;
    const top = yt + h + 0.45;
    solid(sink, "pad", tpl("padDeck", padDeck), px, yt + h, pz, P, 0.45, P);
    solid(sink, "crownA", tpl("padRing", () => new TorusGeometry(1, 0.06, 6, 32).rotateX(Math.PI / 2)), px, top + 0.03, pz, P * 0.97, 1, P * 0.97);
    if (frac(hash * 13) < 0.7) solid(sink, "pad", tpl("padDrone", parkedDrone), px, top, pz, 1, 1, 1, WHITE, frac(hash * 31) * Math.PI * 2);
  },
  /**
   * The downtown tower, the city's commonest building and so the one with the most variety: a podium filling its lot
   * (shop fronts under brick, stone, panels or glass), then a shaft in one of eight footprints and ten skins (green
   * Vancouver glass, blue, black or silver glass, granite, concrete with balconies, ribbon windows, bronze fins,
   * brick, ceramic panels), massed straight, set back once or twice, tapered, turned or split at the top, and finished
   * with one of eight crowns (plant room, slanted glass, spire frame, stepped tiers, a copper or glass pyramid, a lit
   * ring, a glass lantern, a planted roof). Corner fins on some.
   */
  dtTower(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    // the podium: the whole lot, a shop-front floor and one to three more
    const ph = 2.6 + Math.floor(rng.next() * 3) * 1.9;
    const podFam = pickW(rng, [
      ["stone", 2],
      ["brick", 1.5],
      ["rainscreen", 1.5],
      ["glass", 1.2],
      ["concrete", 1],
      ["grid", 0.6],
    ] as [FamilyId, number][]);
    const podPal = podFam === "stone" ? PAL.stone : podFam === "brick" ? PAL.brick : podFam === "rainscreen" ? PAL.panel : PAL.concrete;
    walls(sink, "dark", fp.rect(w * 0.97, d * 0.97), x, z, yb, yt + 2.4, { yRef: yt });
    const pod = walls(sink, podFam, fp.rect(w, d), x, z, yt + 2.4, yt + ph, { tint: tint(rng, pick(rng, podPal), 0.05), yRef: yt });
    walls(sink, "concrete", fp.rect(w * 1.02, d * 1.02), x, z, yt + 2.2, yt + 2.5, { tint: T(0xf1f0ec) });
    cap(sink, rng.next() < 0.5 ? "garden" : "roof", pod);
    // the shaft's skin and its tint
    const [fam, pal] = pickW(rng, DT_SKINS).pick(rng);
    const t = tint(rng, pick(rng, pal), 0.04);
    // the footprint
    const tw = w * (0.7 + rng.next() * 0.22);
    const td = d * (0.7 + rng.next() * 0.22);
    const m = Math.min(tw, td);
    const shape = pickW(rng, [
      ["rect", 3],
      ["rounded", 1.5],
      ["chamfer", 1.2],
      ["octagon", 1],
      ["notch", 0.8],
      ["L", 0.6],
      ["ellipse", 0.5],
      ["cross", 0.4],
    ] as [string, number][]);
    const poly =
      shape === "rounded"
        ? fp.rounded(tw, td, m * 0.22)
        : shape === "chamfer"
          ? fp.chamfer(tw, td, m * 0.38)
          : shape === "octagon"
            ? fp.octagon(tw, td, m * 0.22)
            : shape === "notch"
              ? fp.notch(tw, td, m * 0.16)
              : shape === "L"
                ? fp.L(tw, td, 0.62)
                : shape === "ellipse"
                  ? fp.ellipse(tw, td, 20)
                  : shape === "cross"
                    ? fp.cross(tw, td, 0.58)
                    : fp.rect(tw, td);
    const ox = (rng.next() - 0.5) * (w - tw) * 0.5;
    const oz = (rng.next() - 0.5) * (d - td) * 0.5;
    const cx = x + ox;
    const cz = z + oz;
    const scale = (k: number, dx = 0) => poly.map(([a, b]) => [a * k + dx, b * k] as [number, number]);
    const y0 = yt + ph;
    const top = yt + H;
    // the massing
    const mass = pickW(rng, [
      ["straight", 3],
      ["setback", 2.2],
      ["cake", 0.9],
      ["taper", 0.9],
      ["turn", 0.6],
      ["split", 1.2],
    ] as [string, number][]);
    let ring: V3[];
    let topScale = 1;
    let crownX = cx;
    if (mass === "setback" || mass === "cake") {
      const steps = mass === "cake" ? [0.58, 0.8] : [0.62 + rng.next() * 0.2];
      let y = y0;
      let k = 1;
      ring = [];
      for (const f of [...steps, 1]) {
        const y1 = y0 + (top - y0) * f;
        ring = walls(sink, fam, scale(k), cx, cz, y, y1, { tint: t, yRef: yt, uOff: rng.next() });
        if (f < 1) cap(sink, "roof", ring);
        y = y1;
        topScale = k;
        k *= 0.76;
      }
    } else if (mass === "taper") {
      ring = walls(sink, fam, poly, cx, cz, y0, top, { tint: t, yRef: yt, s1: 0.8, segs: 1 });
      topScale = 0.8;
    } else if (mass === "turn") {
      ring = walls(sink, fam, poly, cx, cz, y0, top, { tint: t, yRef: yt, segs: 8, r1: (rng.next() < 0.5 ? 1 : -1) * (0.25 + rng.next() * 0.2) });
    } else if (mass === "split") {
      // the shaft, then its top divided: one half a few floors higher than the other
      const ys = y0 + (top - y0) * (0.84 + rng.next() * 0.06);
      walls(sink, fam, poly, cx, cz, y0, ys, { tint: t, yRef: yt });
      const half = (a: number, b: number) => fp.rect(tw * 0.48, td).map(([p0, p1]) => [p0 + a, p1 + b] as [number, number]);
      const lowTop = ys + (top - ys) * 0.45;
      const r0 = walls(sink, fam, half(-tw * 0.26, 0), cx, cz, ys, lowTop, { tint: t, yRef: yt });
      cap(sink, "roof", r0);
      ring = walls(sink, fam, half(tw * 0.26, 0), cx, cz, ys, top, { tint: t, yRef: yt });
      crownX = cx + tw * 0.26;
      topScale = 0.48;
    } else ring = walls(sink, fam, poly, cx, cz, y0, top, { tint: t, yRef: yt, uOff: rng.next() });
    // corner fins: slim white piers up the shaft's corners
    if (shape === "rect" && mass !== "split" && rng.next() < 0.3) {
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) box(sink, "concrete", cx + (sx * tw) / 2, y0, cz + (sz * td) / 2, 0.45, (top - y0) * (mass === "setback" || mass === "cake" ? 0.58 : 1), 0.45, T(0xf3f3f0));
    }
    // the crown
    const cw = tw * topScale;
    const cd = td * topScale;
    const crown = pickW(rng, [
      ["plant", 2.4],
      ["slant", 1.3],
      ["spire", 0.9],
      ["stepped", 1.2],
      ["pyramid", 0.6],
      ["ring", 0.8],
      ["lantern", 0.7],
      ["garden", 0.5],
    ] as [string, number][]);
    if (crown === "slant") {
      const a = rng.next() * Math.PI * 2;
      slopedTop(sink, fam === "vancouver" || fam === "glass" || fam === "dark" || fam === "mullion" ? fam : "glass", ring, Math.cos(a), Math.sin(a), Math.min(cw, cd) * (0.7 + rng.next() * 0.6), t, yt);
    } else {
      cap(sink, crown === "garden" ? "garden" : "roof", ring);
      if (crown === "plant") box(sink, "concrete", crownX, top, cz, cw * 0.42, 2 + rng.next() * 1.6, cd * 0.42, T(0xc9c9c6));
      else if (crown === "spire") {
        // a frame of three struts gathering to a mast, over a plant room
        box(sink, "dark", crownX, top, cz, cw * 0.5, 2.4, cd * 0.5);
        const ap: V3 = [crownX, top + Math.min(cw, cd) * 1.4, cz];
        for (let k = 0; k < 3; k++) {
          const ang = (k / 3) * Math.PI * 2 + rng.next();
          strut(sink, "concrete", [crownX + Math.cos(ang) * cw * 0.32, top + 2.4, cz + Math.sin(ang) * cd * 0.32], ap, 0.14, T(0xe8e8e6));
        }
        solid(sink, "concrete", tpl("needle6", () => new CylinderGeometry(0.12, 0.35, 1, 6).translate(0, 0.5, 0)), crownX, ap[1] - 0.5, cz, 1, 5 + rng.next() * 4, 1, T(0xd8dade));
      } else if (crown === "stepped") {
        let k = 0.78;
        let y = top;
        for (let s = 0; s < 3; s++) {
          const h = 1.6 + rng.next() * 1.2;
          const r2 = walls(sink, fam, fp.rect(cw * k, cd * k), crownX, cz, y, y + h, { tint: t, yRef: yt });
          cap(sink, "roof", r2);
          y += h;
          k *= 0.72;
        }
      } else if (crown === "pyramid") hip(sink, rng.next() < 0.6 ? "copper" : "glass", crownX, cz, cw * 0.96, cd * 0.96, top, Math.min(cw, cd) * 0.55, rng.next() < 0.6 ? WHITE : t, 0, 0.1);
      else if (crown === "ring") box(sink, rng.next() < 0.5 ? "crownA" : "crownB", crownX, top - 1.2, cz, cw * 1.02, 0.6, cd * 1.02);
      else if (crown === "lantern") {
        const r3 = walls(sink, "glass", fp.rect(cw * 0.6, cd * 0.6), crownX, cz, top, top + 3.2, { tint: T(0xfff1dc), yRef: yt });
        cap(sink, "roof", r3);
        box(sink, "crownB", crownX, top + 3.2, cz, cw * 0.62, 0.3, cd * 0.62);
      } else if (crown === "garden") {
        // only a few towers carry trees, and only on top
        for (let k = 0; k < 2; k++) o.terrace(crownX + (rng.next() - 0.5) * cw * 0.5, top, cz + (rng.next() - 0.5) * cd * 0.5, 0.5 + rng.next() * 0.2, pick(rng, ["smaple", "cherry", "cedar"] as SpeciesId[]));
      }
    }
  },
  /**
   * After the approved lattice tower: an oval shaft that swells a little at mid-height, wrapped in a white lattice
   * of curving diagonals over warm glass, its top flaring out into a lit crown ring round a roof garden.
   */
  latticeTower(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const s = Math.min(w, d) * 0.86;
    const sd = s * (0.78 + rng.next() * 0.18);
    const pod = walls(sink, "glass", fp.rect(w * 0.94, d * 0.94), x, z, yb, yt + 3.2, { yRef: yt, tint: T(0xfff1dc) });
    cap(sink, "garden", pod);
    const top = yt + H - 2.4;
    const ring = walls(sink, "exo", fp.ellipse(s, sd, 26), x, z, yt + 3.2, top, { segs: 10, s0: 0.9, s1: 1, curve: (u) => 0.55 + 0.45 * Math.sin(u * Math.PI * 0.85), yRef: yt, uOff: rng.next() });
    const flare = walls(sink, "concrete", fp.ellipse(s, sd, 26), x, z, top, yt + H, { s0: 1, s1: 1.16, tint: T(0xf6f5f2) });
    cap(sink, "garden", flare);
    void ring;
    box(sink, "crownB", x, yt + H - 0.3, z, s * 0.9, 0.25, sd * 0.9);
    for (let k = 0; k < 2; k++) o.terrace(x + (k - 0.5) * s * 0.4, yt + H, z, 0.5, "smaple");
  },
  /**
   * After the approved box towers (and Vancouver House's gold): a block of floor-high boxes, white frames or gilded
   * ones, each floor shifted half a bay, sometimes turning a little as it rises or stepping in at the top.
   */
  boxTower(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const gold = rng.next() < 0.35;
    const t = gold ? tint(rng, 0xffd27a, 0.04) : tint(rng, pick(rng, [0xffffff, 0xf4f1ea, 0xeef2f6]), 0.02);
    const tw = w * (0.74 + rng.next() * 0.14);
    const td = d * (0.74 + rng.next() * 0.14);
    walls(sink, "dark", fp.rect(w * 0.9, d * 0.9), x, z, yb, yt + 3, { yRef: yt });
    const turn = rng.next() < 0.4 ? (rng.next() < 0.5 ? 1 : -1) * (0.15 + rng.next() * 0.2) : 0;
    const ring = walls(sink, "pixel", fp.rounded(tw, td, Math.min(tw, td) * 0.12, 2), x, z, yt + 3, yt + H, { segs: turn ? 8 : 1, r1: turn, s1: rng.next() < 0.3 ? 0.86 : 1, tint: t, yRef: yt, uOff: rng.next() });
    cap(sink, "garden", ring);
  },
  /**
   * After the approved cantilevered tower: a slim glass shaft with blocks of two to four floors pushed out from it at
   * intervals, on alternating sides, framed in white.
   */
  cantilever(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const cw = w * 0.56;
    const cd = d * 0.56;
    const t = tint(rng, pick(rng, PAL.glass), 0.03);
    const core = walls(sink, "vancouver", fp.rect(cw, cd), x, z, yb, yt + H, { tint: t, yRef: yt, uOff: rng.next() });
    cap(sink, "roof", core);
    const n = 3 + Math.floor(rng.next() * 3);
    for (let k = 0; k < n; k++) {
      const y0 = yt + H * (0.22 + (0.68 * k) / n);
      const h = 3.6 + rng.next() * 3.2;
      const along = rng.next() < 0.5;
      const side = k % 2 ? 1 : -1;
      const bw = along ? cw * (0.9 + rng.next() * 0.5) : cw * 0.7;
      const bd = along ? cd * 0.7 : cd * (0.9 + rng.next() * 0.5);
      const bx = x + (along ? side * cw * 0.32 : side * (cw * 0.5 + bw * 0.25));
      const bz = z + (along ? side * (cd * 0.5 + bd * 0.25) : side * cd * 0.32);
      const r2 = walls(sink, rng.next() < 0.5 ? "pixel" : "glass", fp.rect(bw, bd), bx, bz, y0, y0 + h, { tint: T(0xf6f6f3), yRef: yt });
      cap(sink, "roof", r2);
    }
  },
  /**
   * After the approved terraced tower: a glass shaft behind white floor slabs that run out past it, every fourth one
   * pushed further out on alternate sides as a deep terrace, a few of them planted.
   */
  slabStack(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const tw = w * 0.7;
    const td = d * 0.7;
    const core = walls(sink, "glass", fp.rect(tw, td), x, z, yb, yt + H, { tint: tint(rng, pick(rng, [0xfff1dc, 0xffe6c8, 0xeef6ff]), 0.03), yRef: yt });
    cap(sink, "roof", core);
    const fl = 2.6;
    const n = Math.floor(H / fl);
    for (let k = 1; k <= n; k++) {
      const y = yt + k * fl;
      const deep = k % 4 === 0;
      const side = (k / 4) % 2 ? 1 : -1;
      const ex = deep ? 1.5 : 0.45;
      box(sink, "concrete", x + (deep ? side * 0.7 : 0), y - 0.28, z + (deep ? -side * 0.5 : 0), tw + ex * 2, 0.3, td + ex * 2, T(0xf5f5f2));
      if (deep && rng.next() < 0.3) o.terrace(x + side * (tw / 2 + 0.9), y, z, 0.42, "smaple");
    }
  },
  /** After the Butterfly: two oval towers grown together, wrapped in unbroken white balcony bands, one a little taller. */
  butterfly(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const along = w >= d;
    const L = (along ? w : d) * 0.5;
    const S = (along ? d : w) * 0.66;
    const pod = walls(sink, "glass", fp.rect(w * 0.92, d * 0.92), x, z, yb, yt + 3.4, { yRef: yt, tint: T(0xfff1dc) });
    cap(sink, "garden", pod);
    const t = tint(rng, pick(rng, [0xffffff, 0xf6f3ee]), 0.02);
    for (const sgn of [-1, 1]) {
      const cx = along ? x + sgn * L * 0.34 : x;
      const cz = along ? z : z + sgn * L * 0.34;
      const h = H * (sgn < 0 ? 1 : 0.93);
      const ring = walls(sink, "ribbon", fp.ellipse(along ? L : S, along ? S : L, 22), cx, cz, yt + 3.4, yt + h - 2, { tint: t, yRef: yt, uOff: rng.next() });
      const cr = walls(sink, "ribbon", fp.ellipse(along ? L : S, along ? S : L, 22), cx, cz, yt + h - 2, yt + h, { s0: 1, s1: 0.82, tint: t, yRef: yt });
      cap(sink, "roof", cr);
      void ring;
    }
  },
  /**
   * A dark glass tower on an oval plan (after the Shangri-La and its neighbours): deep blue-black glass reflecting the
   * sky, white rings at its thirds, its top cut on a slant.
   */
  darkEllipse(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const s = Math.min(w, d) * 0.84;
    const sd = s * (0.6 + rng.next() * 0.25);
    const pod = walls(sink, "stone", fp.rect(w, d), x, z, yb, yt + 4, { yRef: yt, tint: tint(rng, pick(rng, PAL.stone), 0.04) });
    cap(sink, "garden", pod);
    const t = tint(rng, pick(rng, [0x9db8e0, 0x8fa8c8, 0xa6c0d8]), 0.03);
    const poly = fp.ellipse(s, sd, 24);
    const ring = walls(sink, "dark", poly, x, z, yt + 4, yt + H, { tint: t, yRef: yt });
    for (const f of [0.36, 0.68]) walls(sink, "concrete", poly.map(([a, b]) => [a * 1.03, b * 1.03] as [number, number]), x, z, yt + H * f, yt + H * f + 0.45, { tint: T(0xf2f3f4) });
    const a = rng.next() * Math.PI * 2;
    slopedTop(sink, "dark", ring, Math.cos(a), Math.sin(a), s * 0.8, t, yt);
  },
  /**
   * The new Vancouver Art Gallery (2100): stacked galleries widening as they rise, wrapped in a lattice of copper and
   * timber, glass between the tiers, over a glass lobby and a long timber canopy along the street.
   */
  galleryStack(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const lobby = walls(sink, "glass", fp.rect(w * 0.5, d * 0.5), x, z, yb, yt + 4, { yRef: yt, tint: T(0xfff1dc) });
    void lobby;
    box(sink, "timber", x + w * 0.1, yt + 3.2, z + d * 0.48, w * 1.1, 0.4, 3.2, T(0xe8b07a));
    let y = yt + 4;
    const t = tint(rng, 0xf0b27a, 0.03);
    ([
      [0.62, 0.66, 6],
      [0.8, 0.74, 7],
      [0.68, 0.9, 5],
      [1.0, 0.82, 6],
    ] as const).forEach(([fw, fd, h], k) => {
      const ox = (k % 2 ? 1 : -1) * w * 0.04;
      const r = walls(sink, "fins", fp.rect(w * fw, d * fd), x + ox, z, y, y + h, { tint: t, yRef: yt, uOff: k * 0.3 });
      cap(sink, "roof", r);
      y += h;
      if (k < 3) {
        walls(sink, "glass", fp.rect(w * fw * 0.8, d * fd * 0.8), x + ox, z, y, y + 1.6, { yRef: yt, tint: T(0xfff1dc) });
        y += 1.6;
      }
    });
  },
  /**
   * The six-storey mixed-use block of Vancouver's arterials (Main, Cambie, Commercial): a glazed shop front under a
   * canopy, the floors above in one cladding (ceramic panels, brick, metal, ribbon windows, the precast grid, painted
   * stucco or siding), often the top floor set back behind a terrace, a rooftop room and plant.
   */
  midrise(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const fl = 1.8;
    // near the guideway a lot may only rise a few units: the shop front and one floor then
    const shopH = Math.min(2.6, o.H * 0.45);
    const shop = yt + shopH;
    const floors = Math.max(1, Math.min(6, Math.round((Math.min(o.H, 14) - shopH) / fl)));
    const top = shop + floors * fl;
    const shape = rng.next();
    const poly = shape < 0.22 ? fp.L(w, d, 0.62) : shape < 0.4 ? fp.chamfer(w, d, Math.min(w, d) * 0.25) : fp.rect(w, d);
    const fam = pick(rng, ["rainscreen", "rainscreen", "brick", "metal", "ribbon", "grid", "stucco", "wood"] as const);
    const pal = fam === "rainscreen" ? PAL.panel : fam === "metal" ? PAL.metal : fam === "brick" ? PAL.brick : fam === "wood" ? PAL.wood : fam === "stucco" ? PAL.chinatown : PAL.concrete;
    const t = tint(rng, pick(rng, pal), 0.06);
    const scaled = (k: number) => poly.map(([a, b]) => [a * k, b * k] as [number, number]);
    walls(sink, "dark", scaled(0.97), x, z, yb, shop, { yRef: yt });
    walls(sink, "concrete", scaled(1.05), x, z, shop - 0.25, shop + 0.05, { tint: T(0xf1f0ec) });
    const setback = floors > 3 && rng.next() < 0.55;
    const ring = walls(sink, fam, poly, x, z, shop, top - (setback ? fl : 0), { tint: t, yRef: yt, uOff: Math.floor(rng.next() * 4) * 0.5 });
    if (setback) {
      cap(sink, rng.next() < 0.5 ? "garden" : "roof", ring);
      const pent = walls(sink, rng.next() < 0.5 ? "glass" : fam, scaled(0.74), x + (rng.next() - 0.5) * w * 0.08, z, top - fl, top, { tint: t, yRef: yt });
      cap(sink, "roof", pent);
    } else cap(sink, rng.next() < 0.35 ? "garden" : "roof", ring);
    box(sink, "roof", x + (rng.next() - 0.5) * w * 0.3, top, z + (rng.next() - 0.5) * d * 0.3, w * 0.22, 1.2, d * 0.2, T(0xb4b6ba));
    // a plain block's side walls over its shop fronts
    if (shape >= 0.4) for (const s of [-1, 1]) o.wall?.(s * w * 0.5, 0, d - 0.6, shop + 0.1, top - (setback ? fl : 0) - 0.1);
  },
  /**
   * A perimeter block round a courtyard garden, after the Olympic Village and the newer blocks in Mount Pleasant: four
   * wings (or three, open to the south) stepping down toward the sun, a lawn and two trees in the court.
   */
  courtyard(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const fl = 1.8;
    const floors = Math.max(3, Math.min(8, Math.round(Math.min(o.H, 16) / fl)));
    const th = Math.min(w, d) * 0.3;
    const fam = pick(rng, ["rainscreen", "brick", "grid", "ribbon", "wood", "timber"] as const);
    const pal = fam === "rainscreen" ? PAL.panel : fam === "brick" ? PAL.brick : fam === "wood" ? PAL.wood : PAL.concrete;
    const t = tint(rng, pick(rng, pal), 0.05);
    const open = rng.next() < 0.4 ? 1 : -1;
    const wings: [number, number, number, number, number][] = [
      [x, z - d / 2 + th / 2, w, th, 0],
      [x, z + d / 2 - th / 2, w, th, 2],
      [x - w / 2 + th / 2, z, th, d - 2 * th, 1],
      [x + w / 2 - th / 2, z, th, d - 2 * th, 1],
    ];
    wings.forEach(([wx, wz, ww, wd, step], k) => {
      if (k === open) return;
      const top = yt + (floors - step) * fl;
      const ring = walls(sink, fam, fp.rect(ww, wd), wx, wz, yb, top, { tint: t, yRef: yt, uOff: rng.next() });
      cap(sink, k === 0 ? "roof" : "garden", ring);
    });
    box(sink, "garden", x, yt - 0.1, z, w - 2 * th - 0.4, 0.2, d - 2 * th - 0.4);
    o.terrace(x - (w - 2 * th) * 0.22, yt, z, 0.75, "smaple");
    o.terrace(x + (w - 2 * th) * 0.2, yt, z + (d - 2 * th) * 0.15, 0.7, "cherry");
  },
  /** An office tower in fins, bronze or champagne over dark glass, on a glass lobby, its top floors stepping in. */
  officeMullion(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const t = tint(rng, pick(rng, PAL.mullion), 0.04);
    const lobby = yt + 4.2;
    walls(sink, "glass", fp.rect(w * 0.88, d * 0.88), x, z, yb, lobby, { yRef: yt });
    box(sink, "concrete", x, lobby - 0.4, z, w * 0.95, 0.6, d * 0.95, T(0xd8d4cc));
    const tw = w * (0.74 + rng.next() * 0.16);
    const td = d * (0.74 + rng.next() * 0.16);
    const shape = rng.next();
    const poly = shape < 0.35 ? fp.chamfer(tw, td, Math.min(tw, td) * 0.24) : shape < 0.5 ? fp.L(tw, td, 0.78) : fp.rect(tw, td);
    const h1 = yt + H * (0.8 + rng.next() * 0.1);
    const ring = walls(sink, "mullion", poly, x, z, lobby, h1, { tint: t, yRef: yt, uOff: rng.next() });
    cap(sink, "roof", ring);
    const k = 0.72 + rng.next() * 0.12;
    const top = walls(sink, "mullion", poly.map(([a, b]) => [a * k, b * k] as [number, number]), x + tw * (1 - k) * 0.3, z, h1, yt + H, { tint: t, yRef: yt });
    cap(sink, rng.next() < 0.4 ? "garden" : "roof", top);
    if (rng.next() < 0.35) box(sink, crown(rng), x + tw * (1 - k) * 0.3, yt + H - 0.3, z, tw * k * 1.02, 0.3, td * k * 1.02);
  },
  /**
   * Concrete modernism of the sixties and seventies, kept: a deep precast grid lifted on columns over a recessed
   * glass ground floor, a heavy frame along the top, the plant room boxed in concrete.
   */
  brutalist(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const Ht = Math.min(H, 34);
    const t = tint(rng, pick(rng, PAL.concrete), 0.04);
    const along = w > d;
    const sw = along ? w * 0.94 : w * 0.72;
    const sd = along ? d * 0.72 : d * 0.94;
    walls(sink, "dark", fp.rect(sw * 0.78, sd * 0.78), x, z, yb, yt + 3.6, { yRef: yt });
    const n = Math.max(2, Math.round((along ? sw : sd) / 5));
    for (let k = 0; k < n; k++) {
      for (const side of [-1, 1]) {
        const u = -0.5 + (k + 0.5) / n;
        solid(sink, "concrete", tpl("column10", () => new CylinderGeometry(1, 1.08, 1, 10).translate(0, 0.5, 0)), x + (along ? u * sw : (side * sw) / 2.25), yb, z + (along ? (side * sd) / 2.25 : u * sd), 0.45, yt + 3.6 - yb, 0.45, t);
      }
    }
    const ring = walls(sink, "grid", fp.rect(sw, sd), x, z, yt + 3.6, yt + Ht, { tint: t, yRef: yt, uOff: rng.next() });
    walls(sink, "concrete", fp.rect(sw * 1.04, sd * 1.04), x, z, yt + Ht, yt + Ht + 1.1, { tint: t });
    cap(sink, "roof", ring.map(([a, , b]) => [x + (a - x) * 1.04, yt + Ht + 1.1, z + (b - z) * 1.04]));
    box(sink, "concrete", x, yt + Ht + 1.1, z, sw * 0.3, 2.4, sd * 0.5, t);
  },
  /**
   * A tower in white curving bands, after the Butterfly: an oval plan that swells at mid-height and turns a little as
   * it rises, its balconies running round it in unbroken white ribbons, on a glass podium.
   */
  curvedBands(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const s = Math.min(w, d) * 0.84;
    const pod = walls(sink, "glass", fp.rect(w * 0.9, d * 0.9), x, z, yb, yt + 4, { yRef: yt });
    cap(sink, "garden", pod);
    const ring = walls(sink, "ribbon", fp.ellipse(s, s * (0.62 + rng.next() * 0.22), 24), x, z, yt + 4, yt + H, {
      segs: 12,
      s0: 0.82,
      s1: 1,
      r1: (rng.next() - 0.5) * 0.5,
      curve: (u) => Math.sin(u * Math.PI) * 0.9 + u * 0.1,
      tint: tint(rng, pick(rng, [0xffffff, 0xf4efe6, 0xeef3f6]), 0.02),
      yRef: yt,
    });
    cap(sink, "garden", ring);
  },
  /**
   * A studio and loft building of the Flats and Mount Pleasant: three or four storeys in standing-seam metal with tall
   * windows, under a ridge-and-furrow roof of north lights.
   */
  metalLoft(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const top = yt + Math.max(1, Math.min(4, Math.round(Math.min(o.H, 9) / 2.1))) * 2.1;
    const t = tint(rng, pick(rng, PAL.metal), 0.05);
    const ring = walls(sink, "metal", fp.rect(w, d), x, z, yb, top, { tint: t, yRef: yt, uOff: Math.floor(rng.next() * 2) * 0.5 });
    cap(sink, "roof", ring);
    const along = w > d;
    const L = along ? w : d;
    const n = Math.max(2, Math.round(L / 4.6));
    const tw = L / n;
    for (let k = 0; k < n; k++) {
      const u = -L / 2 + tw * (k + 0.5);
      gable(sink, "metal", "roof", along ? x + u : x, along ? z : z + u, tw, along ? d : w, top, top, 1.5, t, T(0x8f969c), along ? 0 : Math.PI / 2, 0.05);
    }
  },
  wave(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const s = Math.min(w, d) * 0.85;
    const ring = walls(sink, "diagrid", fp.ellipse(s, s * 0.8, 24), x, z, yb, yt + H, { segs: 18, r1: 0.4 + rng.next() * 0.3, s1: 0.8, curve: (t) => 0.5 - 0.5 * Math.cos(t * Math.PI * 1.5), yRef: yt });
    cap(sink, "garden", ring);
    box(sink, "crownA", x, yt + H - 0.4, z, s * 0.6, 0.4, s * 0.5);
  },
};
