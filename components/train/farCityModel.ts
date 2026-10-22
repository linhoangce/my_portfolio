/**
 * The city past the line's end, on the far terrain: Burnaby's neighbourhoods running on east and south from the last
 * station (low blocks, house rows, the odd tower), Metrotown's towers rising beyond Central Park ahead of the train
 * round the mall, arterial roads that light at night, and street trees. Built at a lower detail than the city along
 * the line (it is seen from afar), once the far terrain has loaded, and thinning out toward the edge of its reach.
 * Pure apart from three.js geometry.
 */
import { BufferAttribute, type BufferGeometry, BufferGeometry as BG } from "three";

import { BUILD, type Ctx, PAL } from "./buildings/archetypes";
import type { ArchId } from "./buildings/eras";
import { GeoBuilder, type Tint } from "./buildings/meshBuilder";
import { box, cap, fp, hip, type Sink, walls } from "./buildings/parts";
import { arterialX, arterialZ, Rng, streetX, streetZ } from "./cityModel";
import { SEA } from "./constants";
import { PARKS } from "./sites";
import { groundAt, RASTER } from "./terrain";
import { EXTENSION } from "./track";
import { POOLS, SPECIES_INDEX, type SpeciesId } from "./trees/species";

/** The city along the line (its street grid) ends here; the far city begins just beyond. */
const EDGE = { x: 980, z: 856 };
/** The city's own ground reaches a little past its grid: there the far city stands on it, not on the far mesh. */
const GROUND = { x: RASTER.x0 + (RASTER.nx - 1) * RASTER.step - 2, z: RASTER.z0 + (RASTER.nz - 1) * RASTER.step - 2 };
const CENTRE = { x: 860, z: 760 };
/** How far the far city reaches from the end of the line. */
export const farReach = (lowEnd: boolean): number => (lowEnd ? 620 : 900);
/** Metrotown, beyond Central Park from the last station, ahead of the train. */
export const METROTOWN = { x: 1000, z: 890, r: 66 };
const GONDOLA: [number, number, number, number] = [900, 240, 1530, 85];
const centralPark = PARKS.find((p) => p.name === "Central Park");

/** The 8-unit cells within 16 of the line beyond the loop (track.ts EXTENSION), which nothing builds on. */
const onExtension = (() => {
  const cells = new Set<number>();
  for (const f of EXTENSION.samples) {
    for (let i = Math.floor((f.p.x - 16) / 8); i <= Math.floor((f.p.x + 16) / 8); i++) {
      for (let j = Math.floor((f.p.z - 16) / 8); j <= Math.floor((f.p.z + 16) / 8); j++) {
        if (Math.hypot(i * 8 + 4 - f.p.x, j * 8 + 4 - f.p.z) < 16) cells.add(i * 100000 + j);
      }
    }
  }
  return (x: number, z: number) => cells.has(Math.floor(x / 8) * 100000 + Math.floor(z / 8));
})();

export type FarZone = "metrotown" | "fabric";
/** The far city's zone at (x, z), or null where it does not build (the city along the line, the line beyond the loop, the park, past its reach). */
export function farZone(x: number, z: number, reach: number): FarZone | null {
  if (x < EDGE.x && z < EDGE.z) return null;
  if (onExtension(x, z)) return null;
  const dc = Math.hypot(x - CENTRE.x, z - CENTRE.z);
  if (dc > reach) return null;
  if (centralPark && Math.hypot(x - centralPark.x, z - centralPark.z) < centralPark.r + 8) return null;
  return Math.hypot(x - METROTOWN.x, z - METROTOWN.z) < METROTOWN.r ? "metrotown" : "fabric";
}
/** How built up the far city is at (x, z): full near the line, thinning to nothing at its reach. */
export function farDensity(x: number, z: number, reach: number): number {
  const t = Math.min(1, Math.max(0, (Math.hypot(x - CENTRE.x, z - CENTRE.z) - reach * 0.45) / (reach * 0.55)));
  return 1 - t * t * (3 - 2 * t);
}

export type FarTree = { x: number; y: number; z: number; sp: number; s: number };
export type FarCityData = {
  chunks: { key: string; solid: BufferGeometry; glass: BufferGeometry }[];
  crownA: BufferGeometry;
  crownB: BufferGeometry;
  dome: BufferGeometry;
  neon: BufferGeometry;
  roads: BufferGeometry;
  trees: FarTree[];
};

const tintOf = (hex: number, rng: Rng, v = 0.06): Tint => {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const k = 1 + (rng.next() - 0.5) * v;
  return [r * k, g * k, b * k];
};
const pickW = <T>(rng: Rng, list: [T, number][]): T => {
  let r = rng.next() * list.reduce((t, [, w]) => t + w, 0);
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
};

/** A row of houses along a lot's longer side, two rows back to back where it is deep enough: walls and a hipped roof. */
function houseRow(o: Ctx): void {
  const { rng, sink, x, z, w, d, yb, yt } = o;
  const along = w >= d;
  const L = along ? w : d;
  const D = along ? d : w;
  const n = Math.max(1, Math.round(L / 7.5));
  const rows = D > 15 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    for (let r = 0; r < rows; r++) {
      const u = -L / 2 + (L / n) * (k + 0.5);
      const v = rows === 1 ? 0 : (r ? 1 : -1) * D * 0.24;
      const hx = along ? x + u : x + v;
      const hz = along ? z + v : z + u;
      const hw = along ? L / n - 1.6 : Math.min(7, D / rows - 2);
      const hd = along ? Math.min(7, D / rows - 2) : L / n - 1.6;
      const eave = yt + 3 + rng.next() * 1.2;
      const t = tintOf(PAL.wood[Math.floor(rng.next() * PAL.wood.length)], rng);
      walls(sink, "wood", fp.rect(hw, hd), hx, hz, yb, eave, { tint: t, yRef: yt });
      hip(sink, "shingle", hx, hz, hw, hd, eave, 1.2 + rng.next() * 0.6, tintOf([0x4a4f58, 0x5a4a42, 0x3e4651, 0x6b5a4a][Math.floor(rng.next() * 4)], rng));
    }
  }
}

/** Metropolis at Metrotown: the mall's long low mass under a garden roof, glass at its entrances. */
function mall(o: Ctx): void {
  const { sink, x, z, w, d, yb, yt } = o;
  const ring = walls(sink, "dark", fp.chamfer(w, d, Math.min(w, d) * 0.2), x, z, yb, yt + 7.5, { yRef: yt });
  cap(sink, "garden", ring);
  walls(sink, "concrete", fp.chamfer(w * 1.02, d * 1.02, Math.min(w, d) * 0.2), x, z, yt + 7.5, yt + 8.3, { tint: [0.95, 0.94, 0.92] });
  box(sink, "glass", x, yt + 7.5, z, w * 0.3, 3.2, d * 0.3);
}

const FABRIC: [ArchId | "houseRow", number][] = [
  ["houseRow", 3],
  ["midrise", 2],
  ["townhouses", 1.1],
  ["colourPanels", 0.6],
  ["slab60s", 0.5],
  ["courtyard", 0.4],
  ["metalLoft", 0.3],
  ["pointTower", 0.35],
];
const TOWERS: [ArchId, number][] = [
  ["pointTower", 2],
  ["officeMullion", 1],
  ["curvedBands", 1],
  ["twins", 0.5],
  ["helix", 0.5],
  ["pixelTwist", 0.5],
  ["brutalist", 0.3],
];

export function buildFarCity(farHeight: (x: number, z: number) => number, lowEnd: boolean): FarCityData {
  const heightAt = (x: number, z: number) => (x < GROUND.x && z < GROUND.z ? groundAt(x, z) : farHeight(x, z));
  const rng = new Rng(86);
  const reach = farReach(lowEnd);
  const shared = { crownA: new GeoBuilder(), crownB: new GeoBuilder(), dome: new GeoBuilder(), neon: new GeoBuilder() };
  const chunks = new Map<string, Sink>();
  // big chunks: the far city is seen whole or not at all, and each chunk is two draw calls
  const sinkAt = (x: number, z: number): Sink => {
    const key = `${Math.floor(x / 512)},${Math.floor(z / 512)}`;
    let s = chunks.get(key);
    if (!s) {
      s = { solid: new GeoBuilder(), glass: new GeoBuilder(), ...shared };
      chunks.set(key, s);
    }
    return s;
  };
  const dry = (x: number, z: number) => heightAt(x, z) > SEA + 0.4;
  // hillsides build too (Burnaby climbs from the park to Kingsway); only real slopes stay open
  const steep = (x: number, z: number) => Math.abs(heightAt(x + 8, z) - heightAt(x - 8, z)) > 7.5 || Math.abs(heightAt(x, z + 8) - heightAt(x, z - 8)) > 7.5;
  const nearGondola = (x: number, z: number) => {
    const [ax, az, bx, bz] = GONDOLA;
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    return Math.hypot(x - ax - ex * t, z - az - ez * t) < 22;
  };
  const buildable = (x: number, z: number) => farZone(x, z, reach) !== null && dry(x, z) && !steep(x, z) && !nearGondola(x, z);
  const trees: FarTree[] = [];
  const pool = POOLS.streetResidential;
  const addTree = (x: number, z: number, s: number, sp?: SpeciesId) => {
    if (!buildable(x, z)) return;
    trees.push({ x, y: heightAt(x, z) - 0.2, z, sp: SPECIES_INDEX[sp ?? pickW(rng, pool)], s });
  };
  const terrace = () => {};
  // the block nearest Metrotown's centre is the mall
  let mallBlock = "";
  let mallD = Infinity;
  const blocks: { i: number; j: number; ax: number; bx: number; az: number; bz: number }[] = [];
  for (let i = -40; i < 90; i++) {
    if (!arterialX(i)) continue;
    for (let j = -10; j < 80; j++) {
      if (!arterialZ(j)) continue;
      const ax = streetX(i) + 4.1;
      const bx = streetX(i + 2) - 4.1;
      const az = streetZ(j) + 4.1;
      const bz = streetZ(j + 2) - 4.1;
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      // a block counts if any of its lots can build (each lot, tree and road checks itself)
      if (![[ax + 8, az + 8], [bx - 8, az + 8], [ax + 8, bz - 8], [bx - 8, bz - 8]].some(([x, z]) => buildable(x, z))) continue;
      blocks.push({ i, j, ax, bx, az, bz });
      const dm = Math.hypot(cx - METROTOWN.x, cz - METROTOWN.z);
      if (dm < mallD) {
        mallD = dm;
        mallBlock = `${i},${j}`;
      }
    }
  }
  for (const { i, j, ax, bx, az, bz } of blocks) {
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const metro = Math.hypot(cx - METROTOWN.x, cz - METROTOWN.z) < METROTOWN.r;
    const dens = farDensity(cx, cz, reach);
    if (metro && `${i},${j}` === mallBlock) {
      const gs = [heightAt(ax, az), heightAt(bx, az), heightAt(ax, bz), heightAt(bx, bz), heightAt(cx, cz)];
      mall({ rng, sink: sinkAt(cx, cz), x: cx, z: cz, w: bx - ax - 2, d: bz - az - 2, yb: Math.min(...gs) - 1, yt: Math.max(...gs), H: 8, hood: "metrotown", terrace });
      continue;
    }
    // street trees round the block, fewer toward the edge
    for (let t = 2; t < bx - ax; t += 8) {
      for (const zz of [az - 1.2, bz + 1.2]) if (rng.next() < 0.5 * dens) addTree(ax + t, zz, 0.7 + rng.next() * 0.6);
    }
    for (let t = 2; t < bz - az; t += 8) {
      for (const xx of [ax - 1.2, bx + 1.2]) if (rng.next() < 0.5 * dens) addTree(xx, az + t, 0.7 + rng.next() * 0.6);
    }
    const n = metro ? (rng.next() < 0.5 ? 1 : 2) : 2;
    const lw = (bx - ax) / n;
    const ld = (bz - az) / n;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const x = ax + lw * (a + 0.5);
        const z = az + ld * (b + 0.5);
        const w = lw - 1.4;
        const d = ld - 1.4;
        if (!metro && rng.next() > 0.85 * dens) {
          // a yard, a schoolfield or a pocket park: trees instead
          for (let k = 0; k < 3; k++) if (rng.next() < 0.6) addTree(x + (rng.next() - 0.5) * w * 0.7, z + (rng.next() - 0.5) * d * 0.7, 0.8 + rng.next() * 0.7, rng.next() < 0.3 ? "cedar" : undefined);
          continue;
        }
        const corners = [heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z - d / 2), heightAt(x - w / 2, z + d / 2), heightAt(x + w / 2, z + d / 2), heightAt(x, z)];
        const yb = Math.min(...corners) - 1;
        const yt = Math.max(...corners);
        if (yt - yb > 10 || !buildable(x, z)) continue;
        const sink = sinkAt(x, z);
        const arch = metro ? pickW(rng, TOWERS) : pickW(rng, FABRIC);
        const towerish = metro || arch === "pointTower";
        // Metrotown rises to its centre; elsewhere low, the odd tower
        const dm = Math.hypot(x - METROTOWN.x, z - METROTOWN.z) / METROTOWN.r;
        const H = metro ? 50 + (1 - dm) * 55 + rng.next() * 18 : towerish ? 26 + rng.next() * 24 : 6 + rng.next() ** 1.5 * 14;
        const o: Ctx = { rng, sink, x, z, w, d, yb, yt, H, hood: metro ? "metrotown" : "residential", terrace };
        if (arch === "houseRow") houseRow(o);
        else BUILD[arch as Exclude<ArchId, "house">](o);
      }
    }
  }
  // the arterials, laid on the far terrain wherever they run through the far city, a little proud of it
  const pos: number[] = [];
  const idx: number[] = [];
  const HALF = 3.2;
  const strip = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const nx = -(z1 - z0) / L;
    const nz = (x1 - x0) / L;
    const base = pos.length / 3;
    for (const [x, z] of [
      [x0, z0],
      [x1, z1],
    ]) {
      const y = heightAt(x, z) + 0.7;
      pos.push(x + nx * HALF, y, z + nz * HALF, x - nx * HALF, y, z - nz * HALF);
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  const STEP = 11;
  for (let i = -40; i < 90; i++) {
    if (!arterialX(i)) continue;
    const x = streetX(i);
    for (let z = -100; z < 1800; z += STEP) if (buildable(x, z) && buildable(x, z + STEP)) strip(x, z, x, z + STEP);
  }
  for (let j = -10; j < 80; j++) {
    if (!arterialZ(j)) continue;
    const z = streetZ(j);
    for (let x = -400; x < 1900; x += STEP) if (buildable(x, z) && buildable(x + STEP, z)) strip(x, z, x + STEP, z);
  }
  const roads = new BG();
  roads.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  roads.setIndex(idx);
  roads.computeVertexNormals();
  return {
    chunks: [...chunks.entries()].map(([key, s]) => ({ key, solid: s.solid.build(), glass: s.glass.build() })),
    crownA: shared.crownA.build(),
    crownB: shared.crownB.build(),
    dome: shared.dome.build(),
    neon: shared.neon.build(),
    roads,
    trees,
  };
}
