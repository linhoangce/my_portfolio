/**
 * The 2100 city builder. Heroes first (their footprints reserved), then every lot inside the blocks between the
 * painted streets: a neighbourhood era mix, an archetype re-rolled when a neighbour already has it, heights capped
 * relative to the deck near the guideway (no footprint within 17 units, low podiums within 30, full height by 72),
 * buildings standing on the lowest ground under them. Heritage lots in house districts become instanced houses facing
 * their street. Floating hex districts sit on False Creek. Geometry merges into 256-unit chunks, a solid and a glass
 * mesh each, so frustum and shadow culling work. Pure apart from three.js geometry.
 */
import { CylinderGeometry, type BufferGeometry, SphereGeometry } from "three";

import { arterialX, arterialZ, BI0, BI1, BJ1, type Rng, streetX, streetZ } from "../cityModel";
import { SEA } from "../constants";
import { inSetZone } from "../sets/zones";
import { inLandmark, inPark, streamDist } from "../sites";
import { groundAt, inWater, RASTER, sdfAt } from "../terrain";
import { samples, trackNearest } from "../track";
import type { SpeciesId } from "../trees/species";
import { BUILD, type Ctx, PAL } from "./archetypes";
import { ARCH_BY_ERA, type ArchId, hood, type Hood, TOWERISH, ZONES } from "./eras";
import { HEROES } from "./heroes";
import { type HouseInst, type HouseKind } from "./houses";
import { GeoBuilder } from "./meshBuilder";
import { cap, fp, type Sink, solid, tpl, walls } from "./parts";

export type Lot = { x: number; z: number; w: number; d: number; h: number; top: number };
export type TerraceTree = { x: number; y: number; z: number; s: number; sp: SpeciesId };
export type CityGeometry = {
  chunks: { key: string; solid: BufferGeometry; glass: BufferGeometry }[];
  crownA: BufferGeometry;
  crownB: BufferGeometry;
  dome: BufferGeometry;
  neon: BufferGeometry;
  houses: HouseInst[];
  lots: Lot[];
  terrace: TerraceTree[];
  ms: number;
  /** Milliseconds per phase, for the budget checks. */
  phases: Record<string, number>;
};

/** Nothing above a podium within this distance of the guideway. */
export const CORRIDOR = 30;
/** No building footprint within this distance of the guideway. */
export const CLEAR = 17;
const J_MIN = -20; // blocks north of the inlet: North Vancouver and Lonsdale

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance to the guideway and the deck height there, on the terrain raster (bilinear), computed once. */
function corridorRaster() {
  const g = RASTER;
  const d = new Float32Array(g.nx * g.nz).fill(Infinity);
  const y = new Float32Array(g.nx * g.nz);
  // near the line (where the clearance and height rules bite): each coarse track sample paints the cells within 100
  const R = 100;
  const rc = Math.ceil(R / g.step);
  for (let s = 0; s < samples.length; s += 4) {
    const p = samples[s].p;
    const ci = Math.round((p.x - g.x0) / g.step);
    const cj = Math.round((p.z - g.z0) / g.step);
    for (let j = Math.max(0, cj - rc); j <= Math.min(g.nz - 1, cj + rc); j++) {
      for (let i = Math.max(0, ci - rc); i <= Math.min(g.nx - 1, ci + rc); i++) {
        const k = j * g.nx + i;
        const dd = Math.hypot(g.x0 + i * g.step - p.x, g.z0 + j * g.step - p.z);
        if (dd < d[k]) {
          d[k] = dd;
          y[k] = p.y;
        }
      }
    }
  }
  // beyond (only house detail and thinning care): the full search on a grid four times coarser, interpolated
  const S = 4;
  const cx = Math.ceil((g.nx - 1) / S) + 1;
  const cz = Math.ceil((g.nz - 1) / S) + 1;
  const far = new Float32Array(cx * cz);
  for (let j = 0; j < cz; j++) {
    for (let i = 0; i < cx; i++) {
      const x = g.x0 + i * S * g.step;
      const z = g.z0 + j * S * g.step;
      const f = trackNearest(x, z);
      far[j * cx + i] = Math.hypot(f.p.x - x, f.p.z - z);
    }
  }
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      if (d[k] !== Infinity) continue;
      const fi = Math.min(cx - 1.001, i / S);
      const fj = Math.min(cz - 1.001, j / S);
      const i0 = Math.floor(fi);
      const j0 = Math.floor(fj);
      const u = fi - i0;
      const v = fj - j0;
      const q = j0 * cx + i0;
      d[k] = Math.max(R, (far[q] * (1 - u) + far[q + 1] * u) * (1 - v) + (far[q + cx] * (1 - u) + far[q + cx + 1] * u) * v);
    }
  }
  const at = (arr: Float32Array, x: number, z: number) => {
    const fx = Math.min(g.nx - 1.001, Math.max(0, (x - g.x0) / g.step));
    const fz = Math.min(g.nz - 1.001, Math.max(0, (z - g.z0) / g.step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * g.nx + i;
    return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + g.nx] * (1 - u) + arr[k + g.nx + 1] * u) * v;
  };
  return { dist: (x: number, z: number) => at(d, x, z), deck: (x: number, z: number) => at(y, x, z) };
}

export function buildCity(rng: Rng, lowEnd: boolean): CityGeometry {
  const now = () => (typeof performance !== "undefined" ? performance.now() : 0);
  const t0 = now();
  const phases: Record<string, number> = {};
  let tp = t0;
  const mark = (k: string) => {
    const t = now();
    phases[k] = Math.round(t - tp);
    tp = t;
  };
  const cor = corridorRaster();
  mark("corridor");
  const chunks = new Map<string, Sink>();
  const shared = { crownA: new GeoBuilder(), crownB: new GeoBuilder(), dome: new GeoBuilder(), neon: new GeoBuilder() };
  const sinkAt = (x: number, z: number): Sink => {
    const key = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    let s = chunks.get(key);
    if (!s) {
      s = { solid: new GeoBuilder(), glass: new GeoBuilder(), ...shared };
      chunks.set(key, s);
    }
    return s;
  };
  const lots: Lot[] = [];
  const houses: HouseInst[] = [];
  const terrace: TerraceTree[] = [];
  const addTerrace = (x: number, y: number, z: number, s: number, sp: SpeciesId) => terrace.push({ x, y, z, s, sp });
  const ground = (x: number, z: number, w: number, d: number) => {
    const gs = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z]].map(([px, pz]) => groundAt(px, pz));
    return { yb: Math.min(...gs) - 0.6, yt: Math.max(...gs) };
  };

  // heroes, with their footprints reserved
  for (const h of HEROES) {
    const { yb, yt } = ground(h.x, h.z, h.r * 1.4, h.r * 1.4);
    h.build(sinkAt(h.x, h.z), h.x, h.z, yb, yt, rng, addTerrace);
    lots.push({ x: h.x, z: h.z, w: h.r * 2, d: h.r * 2, h: h.h, top: yt + h.h + 3 });
  }
  const inHero = (x: number, z: number) => HEROES.some((h) => (x - h.x) ** 2 + (z - h.z) ** 2 < (h.r + 2.5) ** 2);
  mark("heroes");

  // the lots, block by block
  const last = new Map<string, string>();
  let buildMs = 0;
  const archMs: Record<string, number> = {};
  const pickArch = (zone: NonNullable<(typeof ZONES)[Hood]>, name: Hood, big: boolean, cell: string, left: string, up: string): { era: 0 | 1 | 2; arch: ArchId } => {
    let era: 0 | 1 | 2 = 0;
    let arch: ArchId = "heritageBrick";
    for (let tries = 0; tries < 4; tries++) {
      const r = rng.next();
      era = r < zone.era[0] ? 0 : r < zone.era[0] + zone.era[1] ? 1 : 2;
      if (zone.houses && era === 0) arch = "house";
      else if (name === "chinatown" && era === 0) arch = rng.next() < 0.8 ? "chinatownBlock" : "heritageBrick";
      else if (name === "gastown" && era === 0) arch = rng.next() < 0.55 ? "heritageBrick" : "warehouse";
      else {
        const list = ARCH_BY_ERA[era].filter((a) => big || !TOWERISH.has(a));
        arch = list[Math.floor(rng.next() * list.length)] ?? "townhouses";
      }
      const key = `${arch}${era}`;
      if (arch === "house" || (last.get(left) !== key && last.get(up) !== key)) {
        last.set(cell, key);
        break;
      }
    }
    return { era, arch };
  };

  for (let i = BI0; i < BI1; i++) {
    for (let j = J_MIN; j < BJ1; j++) {
      const ax = streetX(i) + (arterialX(i) ? 4.1 : 3);
      const bx = streetX(i + 1) - (arterialX(i + 1) ? 4.1 : 3);
      const az = streetZ(j) + (arterialZ(j) ? 4.1 : 3);
      const bz = streetZ(j + 1) - (arterialZ(j + 1) ? 4.1 : 3);
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      if (cx < RASTER.x0 + 10 || cz < RASTER.z0 + 10) continue;
      const name = hood(cx, cz);
      const zone = ZONES[name];
      if (!zone) continue;
      const big = zone.split === 1;
      const cols = big ? (rng.next() < 0.5 ? 1 : 2) : 2;
      const rows = big ? (rng.next() < 0.5 ? 1 : 2) : zone.split === 3 ? 3 : 2;
      const lw = (bx - ax) / cols;
      const ld = (bz - az) / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = ax + lw * (c + 0.5);
          const z = az + ld * (r + 0.5);
          const w = lw - 1.2;
          const d = ld - 1.2;
          if (lowEnd && !big && rng.next() < 0.3) continue;
          const pts = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z], [x, z - d / 2], [x, z + d / 2], [x - w / 2, z], [x + w / 2, z]];
          if (pts.some(([px, pz]) => inWater(px, pz) || inPark(px, pz) || inLandmark(px, pz, 2) || inHero(px, pz) || cor.dist(px, pz) < CLEAR || streamDist(px, pz) < 9 || inSetZone(px, pz, 2))) continue;
          if (rng.next() > zone.build) continue;
          const { yb, yt } = ground(x, z, w, d);
          if (yt - yb > 0.42 * Math.max(w, d) + 0.6) continue;
          const dist = Math.min(...pts.map(([px, pz]) => cor.dist(px, pz)));
          const cell = `${i * 3 + c},${j * 3 + r}`;
          const { era, arch } = pickArch(zone, name, big && w > 13 && d > 13, cell, `${i * 3 + c - 1},${j * 3 + r}`, `${i * 3 + c},${j * 3 + r - 1}`);
          if (arch === "house") {
            // detailed templates near the line, the plain one beyond; the far suburbs are thinned
            const far = dist > (lowEnd ? 90 : 150);
            const roll = rng.next();
            const kind: HouseKind = far ? "simple" : roll < 0.45 ? "victorian" : roll < 0.75 ? "craftsman" : "special";
            if (dist > 320 && rng.next() < (lowEnd ? 0.6 : 0.35)) continue;
            // face the nearer street: north/south edge for the end rows, east/west otherwise
            const ry = r === 0 ? 0 : r === rows - 1 ? Math.PI : c === 0 ? -Math.PI / 2 : Math.PI / 2;
            const wall = PAL.wood[Math.floor(rng.next() * PAL.wood.length)];
            const roof = [0x4a4f58, 0x5a4a42, 0x3e4651, 0x6b5a4a, 0x7a3b32, 0x445a4a][Math.floor(rng.next() * 6)];
            const toT = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
            const sx = Math.min(1.1, Math.max(0.7, (ry === 0 || ry === Math.PI ? w : d) / 7));
            const sz = Math.min(1.1, Math.max(0.7, (ry === 0 || ry === Math.PI ? d : w) / 9));
            houses.push({ kind, x, y: yt, z, ry, sx, sz, wall: toT(wall), roof: toT(roof) });
            lots.push({ x, z, w, d, h: 6, top: yt + 7 });
            continue;
          }
          let H = zone.h[era][0] + Math.pow(rng.next(), 1.4) * (zone.h[era][1] - zone.h[era][0]);
          // near the guideway: tops stay a few units above the deck, opening up to full height by 72
          const deckTop = cor.deck(x, z) + 4 - yt;
          const allow = dist < CORRIDOR ? Math.max(3, Math.min(5.5, deckTop)) : Math.max(5.5, deckTop) + 400 * sstep(CORRIDOR, 72, dist);
          let chosen = arch;
          if (H > allow) {
            H = allow;
            if (H < 9) chosen = era === 2 ? "stacked" : name === "chinatown" ? "chinatownBlock" : "heritageBrick";
          }
          if (H < 3) continue;
          const ctx: Ctx = { rng, sink: sinkAt(x, z), x, z, w, d, yb, yt, H, hood: name, terrace: addTerrace };
          const tb = now();
          BUILD[chosen as Exclude<ArchId, "house">](ctx);
          const dtb = now() - tb;
          archMs[chosen] = (archMs[chosen] ?? 0) + dtb;
          buildMs += dtb;
          lots.push({ x, z, w, d, h: H + (yt - yb), top: yt + H + 3 });
        }
      }
    }
  }

  mark("lots");
  phases.lotGeometry = Math.round(buildMs);
  for (const [k, v] of Object.entries(archMs)) if (v > 20) phases[`arch:${k}`] = Math.round(v);
  // floating hex districts on False Creek: pods clear of the shore and the guideway, joined by footbridges
  const pods: [number, number, number][] = [];
  for (let k = 0; k < 400 && pods.length < 4; k++) {
    const x = -240 + rng.next() * 320;
    const z = 140 + rng.next() * 80;
    const r = 8 + rng.next() * 4;
    if (sdfAt(x, z) > -(r + 3) || cor.dist(x, z) < CLEAR + r || pods.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r + 6)) continue;
    pods.push([x, z, r]);
  }
  for (const [px, pz, pr] of pods) {
    const s = sinkAt(px, pz);
    const ring = walls(s, "concrete", fp.hex(pr), px, pz, SEA - 0.8, SEA + 0.9, { tint: [0.84, 0.82, 0.78] });
    cap(s, "garden", ring);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + rng.next();
      const bx = px + Math.cos(a) * pr * 0.45;
      const bz = pz + Math.sin(a) * pr * 0.45;
      const bw = 3 + rng.next() * 2;
      const h = 2.5 + rng.next() * 4.5;
      const rr = walls(s, k % 2 ? "timber" : "glass", fp.rounded(bw, bw, 1, 2), bx, bz, SEA + 0.9, SEA + 0.9 + h);
      cap(s, "garden", rr);
      addTerrace(bx, SEA + 0.9 + h, bz, 0.55, "cherry");
    }
    solid(s, "dome", tpl("podDome", () => new SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2)), px, SEA + 0.9, pz, pr * 0.3, pr * 0.25, pr * 0.3);
    lots.push({ x: px, z: pz, w: pr * 2, d: pr * 2, h: 8, top: SEA + 9 });
  }
  for (let k = 0; k < pods.length - 1; k++) {
    const [ax2, az2] = pods[k];
    const [bx2, bz2] = pods[k + 1];
    const L = Math.hypot(bx2 - ax2, bz2 - az2);
    if (L > 60) continue;
    solid(sinkAt(ax2, az2), "concrete", tpl("bridgeBeam", () => new CylinderGeometry(0.5, 0.5, 1, 6).rotateZ(Math.PI / 2)), (ax2 + bx2) / 2, SEA + 0.85, (az2 + bz2) / 2, L, 0.6, 2.6, [0.95, 0.95, 0.95], -Math.atan2(bz2 - az2, bx2 - ax2));
  }

  mark("pods");
  const out: CityGeometry = {
    chunks: [...chunks.entries()].map(([key, s]) => ({ key, solid: s.solid.build(), glass: s.glass.build() })),
    crownA: shared.crownA.build(),
    crownB: shared.crownB.build(),
    dome: shared.dome.build(),
    neon: shared.neon.build(),
    houses,
    lots,
    terrace,
    ms: 0,
    phases,
  };
  mark("buffers");
  out.ms = now() - t0;
  return out;
}
