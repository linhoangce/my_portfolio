/**
 * The ground under downtown's open places (commonsLayout.ts): every bare 2-unit cell round the line, ground with no lot, no
 * drawn street, no water, landmark, set, park, harbourfront, bus stop or rail bed on it. Inside a paved place it takes
 * that place's paving, anywhere else lawn; under the guideway too where its deck is well overhead. The lawns are
 * planted, clear of the features, the paths, the streets and the deck. Built once per budget from the city's lots.
 */
import { BufferGeometry, Float32BufferAttribute } from "three";

import type { CityGeometry } from "./buildings/city";
import { nearBusStop } from "./buses";
import { commonsPathDist, FEATURE_TREES, onFeature, type Paving, PLACES, placeAt } from "./commonsLayout";
import { inConvention, inHarbourfront, inHarbourGreen } from "./harbourfront";
import { railNear } from "./rail";
import { roads } from "./roadNetwork";
import { SET_RECT, toStation } from "./sets/zones";
import { inPark, LANDMARKS } from "./sites";
import { groundAt, sdfAt } from "./terrain";
import { trackDist, trackNearest } from "./track";
import { POOLS, type SpeciesId } from "./trees/species";
import { WCE_HALF, wceDist } from "./wce";

export const COMMONS_BOX = { x0: -136, x1: 106, z0: -66, z1: 126 };
export const CELL = 2;
/** Each cell: 0 untouched, 1 lawn, or 2 + a paving style's index. */
export const PAVINGS: Paving[] = ["brick", "granite", "boards", "stone"];

export type CommonsGround = {
  nx: number;
  nz: number;
  cells: Uint8Array;
  trees: { x: number; z: number; sp: SpeciesId; s: number }[];
  /** Whether (x, z) lies on covered ground (lawn or paving). */
  covered: (x: number, z: number) => boolean;
};

const cache = new Map<boolean, CommonsGround>();

/** The bare ground's lawn cells as one mesh draped on the drawn ground (by its own surface sampler). */
export function commonsLawn(g: CommonsGround, surface: (x: number, z: number) => number): BufferGeometry {
  const { nx, nz, cells } = g;
  const { x0, z0 } = COMMONS_BOX;
  const idx: number[] = [];
  const pos: number[] = [];
  const vert = new Map<number, number>();
  const v = (i: number, j: number) => {
    const k = j * (nx + 1) + i;
    let n = vert.get(k);
    if (n === undefined) {
      n = pos.length / 3;
      vert.set(k, n);
      const x = x0 + i * CELL;
      const z = z0 + j * CELL;
      pos.push(x, surface(x, z) + 0.06, z);
    }
    return n;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (cells[j * nx + i] !== 1) continue;
      const a = v(i, j);
      const b = v(i + 1, j);
      const d = v(i, j + 1);
      const e = v(i + 1, j + 1);
      idx.push(a, d, b, b, d, e);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A small hash for the planting's dice, stable per cell. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function commonsGround(city: CityGeometry, lowEnd: boolean): CommonsGround {
  const hit = cache.get(lowEnd);
  if (hit) return hit;
  const { x0, x1, z0, z1 } = COMMONS_BOX;
  // what the city built, on a 1-unit grid: a cell is taken if its centre is in a lot's or a house's footprint
  const W = x1 - x0;
  const H = z1 - z0;
  const taken = new Uint8Array(W * H);
  const mark = (x: number, z: number, w: number, d: number, ry: number, pad: number) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const r = Math.hypot(w, d) / 2 + pad + 1;
    for (let i = Math.max(0, Math.floor(x - r - x0)); i <= Math.min(W - 1, Math.floor(x + r - x0)); i++) {
      for (let j = Math.max(0, Math.floor(z - r - z0)); j <= Math.min(H - 1, Math.floor(z + r - z0)); j++) {
        const dx = x0 + i + 0.5 - x;
        const dz = z0 + j + 0.5 - z;
        if (Math.abs(dx * c - dz * s) < w / 2 + pad && Math.abs(dx * s + dz * c) < d / 2 + pad) taken[j * W + i] = 1;
      }
    }
  };
  for (const l of city.lots) if (l.x > x0 - 20 && l.x < x1 + 20 && l.z > z0 - 20 && l.z < z1 + 20) mark(l.x, l.z, l.fw ?? l.w, l.fd ?? l.d, l.ry ?? 0, 0.3);
  for (const h of city.houses) if (h.x > x0 - 20 && h.x < x1 + 20 && h.z > z0 - 20 && h.z < z1 + 20) mark(h.x, h.z, 6 * h.sx, 8 * h.sz, h.ry, 0.3);
  const takenAt = (x: number, z: number) => {
    const i = Math.floor(x - x0);
    const j = Math.floor(z - z0);
    return i >= 0 && j >= 0 && i < W && j < H && taken[j * W + i] === 1;
  };
  // the drawn streets' segments, by 8-unit cell, for the distance to the nearest one's edge
  const segs = new Map<number, number[][]>();
  for (const e of roads().edges) {
    for (let k = 0; k + 3 < e.pts.length; k += 2) {
      if (!e.shown[k / 2]) continue;
      const s = [e.pts[k], e.pts[k + 1], e.pts[k + 2], e.pts[k + 3], e.half];
      for (let i = Math.floor((Math.min(s[0], s[2]) - 6) / 8); i <= Math.floor((Math.max(s[0], s[2]) + 6) / 8); i++) {
        for (let j = Math.floor((Math.min(s[1], s[3]) - 6) / 8); j <= Math.floor((Math.max(s[1], s[3]) + 6) / 8); j++) {
          const key = i * 4096 + j;
          const c = segs.get(key);
          if (c) c.push(s);
          else segs.set(key, [s]);
        }
      }
    }
  }
  const streetEdge = (x: number, z: number) => {
    let best = 99;
    for (const [ax, az, bx, bz, h] of segs.get(Math.floor(x / 8) * 4096 + Math.floor(z / 8)) ?? []) {
      const ex = bx - ax;
      const ez = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
      best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t) - h);
    }
    return best;
  };
  // the sets keep their own ground, but for the Stadium terrace's, raised over Chinatown's market
  const inSet = (x: number, z: number) =>
    SET_RECT.some((r, i) => {
      if (!r || i === 3) return false;
      const [a, l] = toStation(i, x, z);
      return a > r[0] && a < r[1] && l > r[2] && l < r[3];
    });
  const big = LANDMARKS.filter((l) => !["convention", "cauldron", "orca", "steamClock"].includes(l.key));
  const bare = (x: number, z: number) => {
    if (sdfAt(x, z) < 0.5 || takenAt(x, z)) return false;
    if (streetEdge(x, z) < 0.2) return false;
    if (inPark(x, z) || inHarbourfront(x, z, 0) || inHarbourGreen(x, z) || inConvention(x, z, 0.5)) return false;
    if (big.some((l) => (x - l.px) ** 2 + (z - l.pz) ** 2 < (l.r * 0.85) ** 2)) return false;
    if (wceDist(x, z) < WCE_HALF + 0.3 || railNear(x, z, 1) || nearBusStop(x, z, 0) || inSet(x, z)) return false;
    // under the guideway only where its deck is well overhead
    if (trackDist(x, z) < 7 && trackNearest(x, z).p.y - groundAt(x, z) < 3) return false;
    return true;
  };
  const nx = Math.round((x1 - x0) / CELL);
  const nz = Math.round((z1 - z0) / CELL);
  const cells = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * CELL;
      const z = z0 + (j + 0.5) * CELL;
      if (!bare(x, z)) continue;
      const place = placeAt(x, z);
      cells[j * nx + i] = place && place.ground !== "lawn" ? 2 + PAVINGS.indexOf(place.ground) : 1;
    }
  }
  const covered = (x: number, z: number) => {
    const i = Math.floor((x - x0) / CELL);
    const j = Math.floor((z - z0) / CELL);
    return i >= 0 && j >= 0 && i < nx && j < nz && cells[j * nx + i] > 0;
  };
  // the lawns' trees: one chance in each 6-unit block, thicker in the places' lawns
  const trees: CommonsGround["trees"] = FEATURE_TREES.map((t) => ({ ...t }));
  // the plazas' broadleaf mix (a cedar now and then), rather than the parks' conifer woods
  const pool = POOLS.plaza;
  const total = pool.reduce((a, [, w]) => a + w, 0);
  const pick = (u: number): SpeciesId => {
    let acc = u * total;
    for (const [id, w] of pool) if ((acc -= w) < 0) return id;
    return pool[0][0];
  };
  for (let bz = z0; bz < z1; bz += 6) {
    for (let bx = x0; bx < x1; bx += 6) {
      const x = bx + 1 + hash(bx, bz) * 4;
      const z = bz + 1 + hash(bz, bx) * 4;
      const i = Math.floor((x - x0) / CELL);
      const j = Math.floor((z - z0) / CELL);
      if (cells[j * nx + i] !== 1) continue;
      const place = placeAt(x, z);
      const chance = place?.trees ? place.trees * 0.5 : lowEnd ? 0.2 : 0.3;
      if (hash(bx + 0.5, bz - 0.5) > chance) continue;
      if (trackDist(x, z) < 9 || streetEdge(x, z) < 1.8 || onFeature(x, z, 2) || commonsPathDist(x, z) < 1.6 || nearBusStop(x, z, 2)) continue;
      // clear of the buildings round it
      if ([-2, 0, 2].some((u) => [-2, 0, 2].some((v) => takenAt(x + u, z + v) || !covered(x + u, z + v)))) continue;
      trees.push({ x, z, sp: pick(hash(x, z)), s: 0.8 + hash(z, x) * 0.35 });
    }
  }
  // and a row along each lawn path, every seven on alternate sides, where the ground and the clearances allow
  for (const place of PLACES) {
    for (const path of place.paths) {
      let run = 3.5;
      for (let k = 1; k < path.pts.length; k++) {
        const [ax, az] = path.pts[k - 1];
        const [bx, bz] = path.pts[k];
        const L = Math.hypot(bx - ax, bz - az);
        for (; run < L; run += 7) {
          const side = Math.round(run / 7) % 2 ? 1 : -1;
          const off = path.w / 2 + 2.6;
          const x = ax + ((bx - ax) * run) / L - ((bz - az) / L) * off * side;
          const z = az + ((bz - az) * run) / L + ((bx - ax) / L) * off * side;
          if (!covered(x, z) || trackDist(x, z) < 9 || onFeature(x, z, 1.5) || streetEdge(x, z) < 1.8 || trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 9)) continue;
          trees.push({ x, z, sp: pick(hash(z, x)), s: 0.85 + hash(x, z) * 0.25 });
        }
        run -= L;
      }
    }
  }
  const out = { nx, nz, cells, trees, covered };
  cache.set(lowEnd, out);
  return out;
}
