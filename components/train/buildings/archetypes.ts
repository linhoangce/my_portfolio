/**
 * The building archetypes of Vancouver, 2100. Heritage, kept: Gastown brick (arched or warehouse), the Chinatown
 * recessed-balcony block, the flatiron corner, the Edwardian office block, the Art Deco tower and the stone civic
 * building. Current: the Vancouverism point tower on a townhouse podium, the West End slab, the dark office, Olympic
 * Village colour panels, townhouse rows, a heritage base under a glass tower. 2100: the terraced mass-timber tower,
 * the pixel twist (after Vancouver House), the helix, the vertical forest, twin towers with a sky bridge, the biodome
 * tower, the lofted wave, and rarely the needle, stacked blocks and the ziggurat. Every one varies footprint, tiers,
 * tint and uv offset.
 */
import { Color, CylinderGeometry, SphereGeometry, TorusGeometry } from "three";

import type { Rng } from "../cityModel";
import type { SpeciesId } from "../trees/species";
import type { ArchId, Hood } from "./eras";
import type { Tint } from "./meshBuilder";
import { box, cap, fp, gable, hip, type Sink, solid, tpl, walls, WHITE } from "./parts";

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
  glass: [0xffffff, 0xd8f0ff, 0xe0fff4, 0xd6e4ff, 0xf3fbff, 0xfff1dc],
  wood: [0x5f8f8b, 0xc9a447, 0x8f3b3b, 0x7f9a6a, 0xe7dcc4, 0x4f6c8f, 0xc4775a, 0x9a8bb5, 0xd9c08a],
  stone: [0xf3ede0, 0xe9dcc4, 0xd8c8a8, 0xf1e6d2, 0xcfc3b0],
  terracotta: [0xe6c9a2, 0xd9b48e, 0xcfa27e, 0xe8d6bc],
};
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng.next() * list.length)];
const crown = (rng: Rng) => (rng.next() < 0.5 ? "crownA" : "crownB") as "crownA" | "crownB";

export const BUILD: Record<Exclude<ArchId, "house">, (o: Ctx) => void> = {
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
    if (rng.next() < 0.3) box(sink, "roof", x + (rng.next() - 0.5) * w * 0.4, top, z + (rng.next() - 0.5) * d * 0.4, 1.6, 1.4, 1.6, T(0xc9bfae));
  },
  warehouse(o) {
    const { rng, sink, x, z, w, d, yb, yt } = o;
    const floors = Math.min(6, Math.max(3, Math.round(o.H / 2.3)));
    const top = yt + floors * 2.3;
    const ring = walls(sink, "warehouse", fp.rect(w, d), x, z, yb, top, { tint: tint(rng, PAL.brick[Math.floor(rng.next() * PAL.brick.length)], 0.12), yRef: yt, uOff: Math.floor(rng.next() * 4) * 0.5 });
    walls(sink, "concrete", fp.rect(w * 1.04, d * 1.04), x, z, top, top + 0.7, { tint: T(0xd9cbb3) });
    cap(sink, "roof", ring.map(([a, , b]) => [a, top + 0.65, b]));
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
    const brickPod = rng.next() < 0.5;
    walls(sink, brickPod ? "brick" : "concrete", fp.rect(w, d), x, z, yb, yt + ph, { tint: tint(rng, brickPod ? PAL.brick[Math.floor(rng.next() * PAL.brick.length)] : PAL.concrete[Math.floor(rng.next() * 4)]), yRef: yt });
    cap(sink, "garden", fp.rect(w, d).map(([a, b]) => [x + a, yt + ph, z + b]));
    const tw = w * (0.5 + rng.next() * 0.16);
    const td = d * (0.5 + rng.next() * 0.16);
    const ox = (rng.next() - 0.5) * (w - tw) * 0.6;
    const oz = (rng.next() - 0.5) * (d - td) * 0.6;
    const roll = rng.next();
    const kind = roll < 0.62 ? "vancouver" : roll < 0.8 ? "glass" : "balcony";
    const shape = rng.next();
    const poly = shape < 0.4 ? fp.rounded(tw, td, Math.min(tw, td) * 0.2) : shape < 0.55 ? fp.chamfer(tw, td, Math.min(tw, td) * 0.3) : shape < 0.65 ? fp.ellipse(tw, td, 18) : fp.rect(tw, td);
    const t = tint(rng, PAL.glass[Math.floor(rng.next() * PAL.glass.length)], 0.04);
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
    const t = tint(rng, 0xffffff, 0.05);
    const sp: SpeciesId[] = ["smaple", "cherry", "dogwood", "alder"];
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
      for (let q = 0; q < 3; q++) {
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
    for (let q = 0; q < 3; q++) o.terrace(cx + (rng.next() - 0.5) * bw * 0.5, yt + H, cz + (rng.next() - 0.5) * bd * 0.5, 0.5 + rng.next() * 0.25, pick(rng, ["cedar", "smaple", "cherry"] as SpeciesId[]));
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
    const kind = rng.next() < 0.5 ? "glass" : "diagrid";
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
    const ring = walls(sink, "diagrid", fp.hex(r), x, z, yb, yt + H, { segs: 10, s1: 0.38 + rng.next() * 0.14, curve: (t) => Math.pow(t, 1.6), yRef: yt });
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
      if (rng.next() < 0.5) o.terrace(x + ox + bw * 0.3, y + h, z + oz, 0.5 + rng.next() * 0.25, "smaple");
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
    const kind = rng.next() < 0.5 ? "glass" : "diagrid";
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
    const r = Math.min(w, d) * 0.38;
    solid(sink, "dome", tpl("biodome12x5", () => new SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2)), x, yt + h, z, r, r * 0.8, r);
    for (let k = 0; k < 4; k++) o.terrace(x + (rng.next() - 0.5) * r, yt + h, z + (rng.next() - 0.5) * r, 0.6 + rng.next() * 0.3, (["cherry", "smaple", "cedar"] as SpeciesId[])[Math.floor(rng.next() * 3)]);
    // drone pad with a ring of light on the podium corner
    solid(sink, "crownA", tpl("padRing", () => new TorusGeometry(1, 0.08, 6, 24).rotateX(Math.PI / 2)), x + w * 0.3, yt + h + 0.05, z + d * 0.3, 1.6, 1, 1.6);
  },
  wave(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const s = Math.min(w, d) * 0.85;
    const ring = walls(sink, "diagrid", fp.ellipse(s, s * 0.8, 24), x, z, yb, yt + H, { segs: 18, r1: 0.4 + rng.next() * 0.3, s1: 0.8, curve: (t) => 0.5 - 0.5 * Math.cos(t * Math.PI * 1.5), yRef: yt });
    cap(sink, "garden", ring);
    box(sink, "crownA", x, yt + H - 0.4, z, s * 0.6, 0.4, s * 0.5);
  },
};
