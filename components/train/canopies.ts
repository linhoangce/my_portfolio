/**
 * The Expo stations' roofs, each stop its own (Commercial–Broadway's interchange has its great roof, Hub.tsx), each
 * pairing a way of making or saving energy with planting:
 * - Waterfront: harbour sails after Canada Place's, twisting membranes printed with thin-film cells on masts, rain chains
 *   from their low corners into tubs of sea grass;
 * - Burrard: a grove, timber trees branching into a canopy of hexagonal leaves, most of them solar, some planted, some
 *   glass;
 * - Granville: a sawtooth over both tracks, clear glass on the steep faces for daylight, see-through solar glass on the
 *   shallow ones, planted gutters in the valleys draining by rain chains into planters along the platforms;
 * - Stadium–Chinatown: two tiers of upswept eaves on red columns, roofed in solar tiles under a green ridge (the
 *   Millennium Gate's green), lanterns hung beneath, a glass ridge over the tracks;
 * - Main Street–Science World: funnels, inverted umbrellas whose solar tops drain the rain down glass stems into rain
 *   gardens at their feet;
 * - Nanaimo: an agrivoltaic pergola, solar strips between troughs of berries, vines up its posts;
 * - 29th Avenue: a wave rolling along each platform, meadow on its crests, skylights in its troughs, solar on its flanks;
 * - Joyce–Collingwood: kinetic louvres, see-through solar fins over both tracks that turn to follow the sun (Stations.tsx
 *   turns them), hanging gardens along the beams;
 * - Patterson: butterfly roofs on timber forks, a meadow wing and a solar wing over each platform, the valley's gutter
 *   pouring into a rain garden.
 * Over the tracks only glass, see-through solar glass, slats or cables, so the train shows from the chase view; columns
 * stand on the platforms' outer strip or where `clear` says nothing comes up through the floor. In the station's frame:
 * x left of travel (platforms at |x| 6.3 to 11.5, their top at y 1.4), y up from the deck, z ahead. Pure geometry.
 */
import { BoxGeometry, BufferGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, LatheGeometry, Quaternion, TorusGeometry, TubeGeometry, Vector2, Vector3 } from "three";

import { merged, type Part } from "./merge";
import { paint } from "./shapes";

export type CanopyKind = "sails" | "grove" | "sawtooth" | "eaves" | "funnels" | "hub" | "agri" | "wave" | "louvres" | "butterfly";
/** Each stop's roof, in line order. */
export const CANOPY: CanopyKind[] = ["sails", "grove", "sawtooth", "eaves", "funnels", "hub", "agri", "wave", "louvres", "butterfly"];

export type CanopyCtx = {
  /** The platforms' length. */
  PL: number;
  lowEnd: boolean;
  /** Whether something `half` wide standing on a platform at (x, z) keeps clear of the ways up and a set's bridge. */
  clear: (x: number, z: number, half: number) => boolean;
};

/** A roof's parts by material, for the station's meshes. `painted` is vertex-coloured (timber, planting, paint). */
export type CanopyParts = {
  pane: Part[];
  steel: Part[];
  painted: Part[];
  solar: Part[];
  pvGlass: Part[];
  membrane: Part[];
  lamps: Part[];
  lanterns: Part[];
  /** The kinetic louvres' fins: each one's centre, turning about the axis across the track (`FIN`). */
  fins: Vector3[];
};

/** A louvre fin: across both tracks, `w` wide. */
export const FIN = { len: 22.6, w: 0.85, t: 0.05 };

const TIMBER = 0xb98a5a;
const DARK_TIMBER = 0x8a6440;
const GREEN = 0x5b8a45;
const LEAF = [0x5b8a45, 0x4c7d3a, 0x6a9a48];
/** The Millennium Gate's green tiles. */
const MOSS = 0x2f7d5a;
const STEEL = 0x8e95a3;
const RED = 0xb3261e;
const GOLD = 0xd4a641;
const STONE = 0xcfc8bb;
const WATER = 0x4f86b8;
const REED = [0x7d9a4a, 0x9db35c, 0x6f8f4a];
const FLOWERS = [0xf2c94c, 0xf28cb1, 0xffffff, 0xb79cf2];
const BERRY = 0xc2304a;

const UP = new Vector3(0, 1, 0);
const at = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Scale a geometry's UVs, so a tiling texture repeats by size (one unit of uv to a module). */
function tile(g: BufferGeometry, su: number, sv: number): BufferGeometry {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** A painted part. */
const pp = (geo: BufferGeometry, hex: number, position?: [number, number, number], rotation?: [number, number, number], scale?: [number, number, number]): Part => ({ geo: paint(geo, hex), position, rotation, scale });
/** A part, painted. */
const tint = (p: Part, hex: number): Part => ({ ...p, geo: paint(p.geo, hex) });

/** A round strut from a to b, `r0` at a and `r1` at b. */
function strut(a: Vector3, b: Vector3, r0: number, r1 = r0, seg = 6): Part {
  const d = b.clone().sub(a);
  const geo = new CylinderGeometry(r1, r0, d.length(), seg);
  geo.applyQuaternion(new Quaternion().setFromUnitVectors(UP, d.normalize()));
  return { geo, position: at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2) };
}

/** A box from a to b along its length, `w` wide (kept level) and `t` thick. */
function beam(a: Vector3, b: Vector3, w: number, t: number): Part {
  const d = b.clone().sub(a);
  const geo = new BoxGeometry(w, t, d.length());
  geo.rotateX(-Math.atan2(d.y, Math.hypot(d.x, d.z)));
  geo.rotateY(Math.atan2(d.x, d.z));
  return { geo, position: at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2) };
}

/**
 * A sheet over (u, v) in [0, 1]², `nu` × `nv` cells, UVs from `uvAt`. It faces up when u runs toward +x and v toward
 * +z; `flip` turns it the other way.
 */
function sheet(fn: (u: number, v: number) => Vector3, nu: number, nv: number, uvAt: (u: number, v: number) => [number, number], flip = false): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const p = fn(i / nu, j / nv);
      pos.push(p.x, p.y, p.z);
      uv.push(...uvAt(i / nu, j / nv));
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      if (flip) idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
      else idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The nearest z to `z` (within `reach`, on the platform) where something `half` wide at x stands clear; null if none. */
function spot(c: CanopyCtx, x: number, z: number, half: number, reach = 5): number | null {
  for (let d = 0; d <= reach; d += 0.5) {
    for (const zz of d ? [z + d, z - d] : [z]) if (Math.abs(zz) <= c.PL / 2 - 0.8 && c.clear(x, zz, half)) return zz;
  }
  return null;
}

/** A rain chain: links from `top` down to y0. */
function rainChain(o: CanopyParts, x: number, z: number, y0: number, top: number): void {
  for (let y = y0 + 0.15; y < top; y += 0.32) o.painted.push(pp(new BoxGeometry(0.11, 0.2, 0.11), STEEL, at(x, y, z), [0, (y * 3) % Math.PI, 0]));
}

/** A tuft of reeds or grass: `n` thin blades round (x, z), standing on y. */
function reeds(o: CanopyParts, x: number, y: number, z: number, r: number, n: number, seed: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    const h = 0.7 + hash(k, seed) * 0.5;
    const rr = r * (0.3 + 0.7 * hash(seed, k));
    o.painted.push(pp(new ConeGeometry(0.07, h, 4), REED[k % 3], at(x + Math.cos(a) * rr, y + h / 2, z + Math.sin(a) * rr), [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15]));
  }
}

/** A round planter of `r` on the platform at (x, z), planted (a rain garden when `wet`). */
function roundPlanter(o: CanopyParts, x: number, z: number, r: number, seed: number, wet = false): void {
  o.painted.push(pp(new CylinderGeometry(r, r * 1.05, 0.5, 14), STONE, at(x, 1.65, z)));
  o.painted.push(pp(new CylinderGeometry(r - 0.07, r - 0.07, 0.08, 14), GREEN, at(x, 1.92, z)));
  if (wet) o.painted.push(pp(new CylinderGeometry(r * 0.45, r * 0.45, 0.04, 12), WATER, at(x + r * 0.25, 1.97, z - r * 0.2)));
  reeds(o, x, 1.95, z, r * 0.8, 7, seed);
}

/* ------------------------------------------------------------------ 0 Waterfront: harbour sails */

function sails(c: CanopyCtx, o: CanopyParts): void {
  const E = c.PL / 2 - 0.6;
  const XO = 10.4;
  const XI = 6.62;
  const TOP = 9.6;
  for (const s of [1, -1]) {
    // a mast mid-platform holds the two sails' high outer corners; their low outer corners are tied down at the ends
    const mz = spot(c, s * XO, 0, 0.3) ?? 0;
    o.steel.push(strut(V(s * XO, 1.4, mz), V(s * XO, TOP + 0.7, mz), 0.17, 0.1, 8));
    o.lamps.push({ geo: new BoxGeometry(0.3, 0.12, 0.3), position: at(s * (XO - 0.45), 1.5, mz) });
    for (const end of [-E, E]) {
      const dir = Math.sign(end);
      const z0 = mz + dir * 0.15;
      // the twist: outer high at the mast and low at the end, inner low at the mast and high at the end
      const oM = V(s * XO, TOP - 0.2, z0);
      const oE = V(s * XO, 6.4, end);
      const iM = V(s * XI, 5.9, z0);
      const iE = V(s * XI, 8.0, end);
      const L = Math.abs(end - z0);
      const fn = (u: number, v: number) => {
        const p = iM.clone().lerp(iE, v).lerp(oM.clone().lerp(oE, v), u);
        // the membrane's tension: a little belly between its edges
        p.y -= 0.35 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        return p;
      };
      o.membrane.push({ geo: sheet(fn, c.lowEnd ? 5 : 8, c.lowEnd ? 8 : 14, (u, v) => [(u * (XO - XI)) / 1.5, (v * L) / 1.5], s * dir < 0) });
      // the inner corners on posts from the doors' top rail, stayed back to the mast
      o.steel.push(strut(V(s * XI, 4.1, z0), iM, 0.06));
      o.steel.push(strut(V(s * XI, 4.1, end), iE, 0.06));
      o.steel.push(strut(V(s * XO, TOP + 0.5, mz), iE, 0.03));
      o.steel.push(strut(V(s * XO, TOP + 0.5, mz), iM, 0.03));
      // the low corner drains down a rain chain into a tub of sea grass, lit from its rim
      rainChain(o, s * XO, end, 2.0, 6.4);
      o.painted.push(pp(new CylinderGeometry(0.55, 0.45, 0.6, 12), TIMBER, at(s * XO, 1.7, end)));
      reeds(o, s * XO, 2.0, end, 0.4, 6, end + s);
      o.lamps.push({ geo: new BoxGeometry(0.22, 0.08, 0.22), position: at(s * (XO - 0.5), 2.02, end) });
    }
  }
}

/* ------------------------------------------------------------------ 1 Burrard: the grove */

function grove(c: CanopyCtx, o: CanopyParts): void {
  const R = 1.3;
  const RD = 1.2;
  const step = R * Math.sqrt(3);
  for (const s of [1, -1]) {
    for (const z0 of [-10.3, 0, 10.3]) {
      const z = spot(c, s * 10.6, z0, 0.8);
      if (z === null) continue;
      // a timber tree in its planter, branching under the leaves
      const fork = V(s * 10.4, 4.7, z);
      o.painted.push(tint(strut(V(s * 10.6, 1.4, z), fork, 0.32, 0.24, 8), TIMBER));
      o.painted.push(pp(new CylinderGeometry(0.75, 0.8, 0.45, 12), STONE, at(s * 10.6, 1.62, z)));
      o.painted.push(pp(new CylinderGeometry(0.68, 0.68, 0.08, 12), GREEN, at(s * 10.6, 1.88, z)));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        const tip = fork.clone().add(V(Math.cos(a) * 2.7, 1.75 + 0.2 * (k % 2), Math.sin(a) * 2.7));
        tip.x = s * Math.min(12.2, Math.max(6.6, s * tip.x));
        o.painted.push(tint(strut(fork, tip, 0.16, 0.08), TIMBER));
      }
    }
    // the leaves: a hexagonal canopy over the platform, rising and falling a little; glass toward the tracks
    for (let row = 0; ; row++) {
      const z = -c.PL / 2 - 0.4 + row * 1.5 * R;
      if (z > c.PL / 2 + 0.4) break;
      for (let col = 0; col < 4; col++) {
        const a = 6.4 + col * step + (row % 2) * (step / 2);
        if (a > 12.4) continue;
        const x = s * a;
        const y = 6.55 + 0.22 * Math.sin(z * 0.7 + a) + 0.12 * ((a - 6.4) / 6);
        const rot: [number, number, number] = [0.05 * Math.sin(row + s), 0, 0.05 * Math.cos(col + row)];
        const h = hash(row * 7 + col, s);
        if (a - RD < 6.3 || h < 0.15) o.pane.push({ geo: new CylinderGeometry(RD, RD, 0.05, 6), position: at(x, y, z), rotation: rot });
        else if (h < 0.38) {
          o.painted.push(pp(new CylinderGeometry(RD, RD * 0.9, 0.3, 6), DARK_TIMBER, at(x, y, z), rot));
          o.painted.push(pp(new IcosahedronGeometry(0.5, 0), LEAF[(row + col) % 3], at(x + 0.3, y + 0.25, z - 0.2), rot, [1.3, 0.5, 1.1]));
          o.painted.push(pp(new IcosahedronGeometry(0.42, 0), LEAF[(row + col + 1) % 3], at(x - 0.35, y + 0.22, z + 0.3), rot, [1.2, 0.5, 1.2]));
        } else o.solar.push({ geo: tile(new CylinderGeometry(RD, RD, 0.08, 6), 2, 1), position: at(x, y, z), rotation: rot });
      }
    }
    o.lamps.push({ geo: new BoxGeometry(0.12, 0.08, c.PL - 3), position: at(s * 8.6, 6.1, 0) });
  }
}

/* ------------------------------------------------------------------ 2 Granville: the sawtooth */

function sawtooth(c: CanopyCtx, o: CanopyParts): void {
  const W = 12.2;
  const LO = 7.0;
  const HI = 9.2;
  const P = 3.2;
  const n = Math.round((c.PL + 1) / P);
  const z0 = (-n * P) / 2;
  const nu = c.lowEnd ? 2 : 4;
  for (let k = 0; k <= n; k++) {
    const za = z0 + k * P;
    // the valley: a planted gutter on a steel truss, a lamp under it over each platform
    o.painted.push(pp(new BoxGeometry(2 * W, 0.3, 0.6), STEEL, at(0, LO - 0.05, za)));
    o.painted.push(pp(new BoxGeometry(2 * W - 0.2, 0.18, 0.45), LEAF[k % 3], at(0, LO + 0.16, za)));
    o.steel.push({ geo: new BoxGeometry(2 * W, 0.22, 0.18), position: at(0, LO - 0.38, za) });
    for (const s of [1, -1]) o.lamps.push({ geo: new BoxGeometry(3.2, 0.08, 0.14), position: at(s * 8.9, LO - 0.55, za) });
    if (k === n) break;
    const zr = za + P - 0.5;
    const zb = za + P;
    const slope = Math.hypot(zr - za, HI - LO);
    // the shallow face, rising to the ridge: see-through solar glass
    o.pvGlass.push({ geo: sheet((u, v) => V(-W + 2 * W * u, LO + (HI - LO) * v, za + (zr - za) * v), nu, 1, (u, v) => [(u * 2 * W) / 1.2, (v * slope) / 1.2]) });
    // the steep face, down to the next valley: clear glass to let the daylight in
    o.pane.push({ geo: sheet((u, v) => V(-W + 2 * W * u, HI + (LO - HI) * v, zr + (zb - zr) * v), nu, 1, (u, v) => [u, v]) });
    o.steel.push({ geo: new BoxGeometry(2 * W, 0.12, 0.12), position: at(0, HI, zr) });
  }
  for (const s of [1, -1]) {
    // timber columns under an edge beam, and planters along the platform's edge fed by rain chains from the gutters
    o.painted.push(pp(new BoxGeometry(0.4, 0.5, n * P), TIMBER, at(s * 10.5, LO - 0.55, 0)));
    for (let k = 0; k <= n; k += 2) {
      const z = spot(c, s * 10.5, z0 + k * P, 0.25, 2);
      if (z !== null) o.painted.push(pp(new BoxGeometry(0.35, LO - 0.8 - 1.4, 0.35), TIMBER, at(s * 10.5, (1.4 + LO - 0.8) / 2, z)));
    }
    for (let z = -13; z <= 13.01; z += 1) {
      if (!c.clear(s * 11.2, z, 0.5)) continue;
      o.painted.push(pp(new BoxGeometry(0.55, 0.55, 1.0), STONE, at(s * 11.2, 1.68, z)));
      o.painted.push(pp(new BoxGeometry(0.45, 0.22, 0.95), LEAF[Math.abs(Math.round(z)) % 3], at(s * 11.2, 2.04, z), undefined, [1, 1 + hash(z, s) * 0.8, 1]));
    }
    for (let k = 1; k < n; k += 2) {
      const z = z0 + k * P;
      if (Math.abs(z) < 13 && c.clear(s * 11.2, z, 0.5)) rainChain(o, s * 11.2, z, 2.1, LO - 0.2);
    }
  }
}

/* ------------------------------------------------------------------ 3 Stadium–Chinatown: the eaves */

function eaves(c: CanopyCtx, o: CanopyParts): void {
  const AC = 8.95;
  /**
   * A tier's height `d` (0 at its ridge, 1 at its eaves) across and `w` (0 mid, 1 at its ends) along: concave slopes
   * sweeping up at the eaves, the corners lifting.
   */
  const tierY = (top: number, h: number, lift: number) => (d: number, w: number) => top - h * (1 - (1 - d) ** 2) + lift * d ** 5 + 0.6 * w ** 6 * d;
  const lower = tierY(7.4, 1.6, 0.5);
  const upper = tierY(9.0, 1.0, 0.35);
  const nu = c.lowEnd ? 10 : 16;
  const nv = c.lowEnd ? 10 : 18;
  for (const s of [1, -1]) {
    const tiers: [number, number, (d: number, w: number) => number][] = [
      [3.05, 16, lower],
      [1.8, 14, upper],
    ];
    for (const [half, len, y] of tiers) {
      // u runs across from x = AC - half to AC + half (on this side), v along
      const pt = (u: number, v: number, dy: number) => {
        const a = AC - half + 2 * half * u;
        return V(s * a, y(Math.abs(a - AC) / half, Math.abs(v * 2 - 1)) + dy, -len + 2 * len * v);
      };
      const uv = (u: number, v: number): [number, number] => [u * 2 * half, v * len];
      o.solar.push({ geo: sheet((u, v) => pt(u, v, 0), nu, nv, uv, s < 0) });
      o.painted.push({ geo: paint(sheet((u, v) => pt(u, v, -0.12), nu, nv, uv, s > 0), DARK_TIMBER) });
    }
    // the green ridge, and the clerestory between the tiers
    o.painted.push(pp(new BoxGeometry(0.5, 0.35, 28.6), MOSS, at(s * AC, 9.15, 0)));
    for (const e of [-1, 1]) o.painted.push(pp(new ConeGeometry(0.28, 0.7, 6), MOSS, at(s * AC, 9.35, e * 14.3), [e * -0.5, 0, 0]));
    for (const da of [-1.2, 1.2]) {
      const yl = lower(1.2 / 3.05, 0);
      const yu = upper(1.2 / 1.8, 0);
      o.pane.push({ geo: new BoxGeometry(0.05, yu - yl, 27), position: at(s * (AC + da), (yl + yu) / 2, 0) });
      for (let z = -13; z <= 13.01; z += 3.25) o.steel.push({ geo: new BoxGeometry(0.08, yu - yl, 0.08), position: at(s * (AC + da), (yl + yu) / 2, z) });
    }
    // red columns on the platform's edge, each with a beam in to a post on the doors' rail
    for (const z0 of [-10.5, 0, 10.5]) {
      const z = spot(c, s * 11.0, z0, 0.3);
      if (z === null) continue;
      o.painted.push(pp(new CylinderGeometry(0.2, 0.24, 4.5, 10), RED, at(s * 11.0, 3.65, z)));
      o.painted.push(pp(new BoxGeometry(0.6, 0.25, 0.6), GOLD, at(s * 11.0, 5.95, z)));
      o.painted.push(tint(beam(V(s * 11.3, 5.75, z), V(s * 6.62, 5.75, z), 0.22, 0.3), RED));
      o.steel.push(strut(V(s * 6.62, 4.1, z), V(s * 6.62, 5.6, z), 0.06));
    }
    // red lanterns on cords under the ridge, gold caps
    for (let z = -13.5; z <= 13.51; z += 3) {
      o.lanterns.push({ geo: new CylinderGeometry(0.3, 0.3, 0.55, 10), position: at(s * AC, 4.95, z) });
      o.lanterns.push({ geo: new IcosahedronGeometry(0.33, 1), position: at(s * AC, 4.95, z), scale: [1, 0.7, 1] });
      for (const dy of [-0.32, 0.32]) o.painted.push(pp(new CylinderGeometry(0.2, 0.2, 0.08, 10), GOLD, at(s * AC, 4.95 + dy, z)));
      o.steel.push(strut(V(s * AC, 5.3, z), V(s * AC, 7.3, z), 0.015, 0.015, 4));
    }
  }
  // the glass ridge over the tracks between the two roofs, on steel cross beams
  o.pane.push({ geo: new BoxGeometry(11.8, 0.06, 31), position: at(0, 6.55, 0) });
  for (let z = -15; z <= 15.01; z += 6) o.steel.push({ geo: new BoxGeometry(12.2, 0.16, 0.16), position: at(0, 6.44, z) });
}

/* ------------------------------------------------------------------ 4 Main Street–Science World: the funnels */

function funnels(c: CanopyCtx, o: CanopyParts): void {
  const R = 3.75;
  const NECK = 4.6;
  const N = c.lowEnd ? 9 : 14;
  const seg = c.lowEnd ? 16 : 24;
  for (const s of [1, -1]) {
    [-11.6, -3.9, 3.9, 11.6].forEach((z0, k) => {
      const z = spot(c, s * 10.0, z0, 1.1, 1.5);
      if (z === null) return;
      const x = s * 10.0;
      const top = k % 2 ? 7.6 : 6.6;
      const prof = (t: number, dy = 0) => new Vector2(0.28 + (R - 0.28) * t, NECK + (top - NECK) * t ** 0.55 + dy);
      const cut = Math.round(N * 0.22);
      // the solar top, rim first so it faces up into the funnel; a glass throat; a white underside
      const topPts: Vector2[] = [];
      for (let i = N; i >= cut; i--) topPts.push(prof(i / N));
      o.solar.push({ geo: tile(new LatheGeometry(topPts, seg), 12, 3), position: at(x, 0, z) });
      const throat: Vector2[] = [];
      for (let i = cut; i >= 0; i--) throat.push(prof(i / N));
      o.pane.push({ geo: new LatheGeometry(throat, seg), position: at(x, 0, z) });
      const under: Vector2[] = [];
      for (let i = 0; i <= N; i++) under.push(prof(i / N, -0.1));
      o.steel.push({ geo: new LatheGeometry(under, seg), position: at(x, 0, z) });
      o.steel.push({ geo: new TorusGeometry(R, 0.07, 6, seg * 2), position: at(x, top, z), rotation: [Math.PI / 2, 0, 0] });
      // the stem: glass round the rain running down, on three steel rods, into the rain garden at its foot
      o.pane.push({ geo: new CylinderGeometry(0.28, 0.28, NECK - 1.9, 12), position: at(x, (NECK + 1.9) / 2, z) });
      o.painted.push(pp(new CylinderGeometry(0.14, 0.14, NECK - 2.0, 8), WATER, at(x, (NECK + 1.9) / 2, z)));
      for (let r = 0; r < 3; r++) {
        const a = (r / 3) * Math.PI * 2;
        o.steel.push(strut(V(x + Math.cos(a) * 0.38, 1.9, z + Math.sin(a) * 0.38), V(x + Math.cos(a) * 0.38, NECK + 0.2, z + Math.sin(a) * 0.38), 0.05));
      }
      roundPlanter(o, x, z, 1.05, k + s, true);
      // lights under the rim
      for (let r = 0; r < 6; r++) {
        const a = (r / 6) * Math.PI * 2;
        const t = 0.68;
        const p = prof(t, -0.22);
        o.lamps.push({ geo: new BoxGeometry(0.5, 0.06, 0.14), position: at(x + Math.cos(a) * p.x, p.y, z + Math.sin(a) * p.x), rotation: [0, -a + Math.PI / 2, 0] });
      }
    });
  }
}

/* ------------------------------------------------------------------ 6 Nanaimo: the agrivoltaic pergola */

function agri(c: CanopyCtx, o: CanopyParts): void {
  const Y = 6.25;
  const L = c.PL + 0.6;
  for (const s of [1, -1]) {
    for (const z0 of [-11.6, -3.9, 3.9, 11.6]) {
      const z = spot(c, s * 11.0, z0, 0.35, 2);
      if (z === null) continue;
      // a post with a vine climbing it, a beam across, a brace
      o.painted.push(pp(new BoxGeometry(0.32, Y - 1.4, 0.32), TIMBER, at(s * 11.0, (1.4 + Y) / 2, z)));
      o.painted.push(pp(new CylinderGeometry(0.3, 0.38, 3.6, 7), GREEN, at(s * 11.0, 3.2, z)));
      o.painted.push(pp(new IcosahedronGeometry(0.55, 0), LEAF[1], at(s * 11.0, 5.2, z), undefined, [1, 1.4, 1]));
      o.painted.push(tint(beam(V(s * 12.1, Y, z), V(s * 5.9, Y, z), 0.22, 0.32), TIMBER));
      o.painted.push(tint(beam(V(s * 11.0, 4.8, z), V(s * 9.0, Y - 0.1, z), 0.14, 0.14), TIMBER));
    }
    for (const a of [6.2, 8.4, 10.6, 11.9]) o.painted.push(pp(new BoxGeometry(0.18, 0.22, L + 0.4), TIMBER, at(s * a, Y + 0.27, 0)));
    // solar strips tilted to the sun between troughs of strawberries
    for (const a of [6.75, 9.15, 11.55]) o.solar.push({ geo: tile(new BoxGeometry(1.2, 0.08, L), 1.2, L / 2), position: at(s * a, Y + 0.6, 0), rotation: [0, 0, s * 0.22] });
    for (const a of [7.95, 10.35]) {
      o.painted.push(pp(new BoxGeometry(0.75, 0.45, L), DARK_TIMBER, at(s * a, Y + 0.6, 0)));
      o.painted.push(pp(new BoxGeometry(0.66, 0.2, L - 0.2), GREEN, at(s * a, Y + 0.9, 0)));
      const step = c.lowEnd ? 1.8 : 0.9;
      for (let z = -L / 2 + 0.5; z < L / 2 - 0.4; z += step) {
        o.painted.push(pp(new IcosahedronGeometry(0.22, 0), LEAF[Math.round(z * 3) % 3 === 0 ? 0 : 2], at(s * a + 0.12, Y + 1.05, z + 0.3), undefined, [1.2, 0.7, 1.2]));
        o.painted.push(pp(new BoxGeometry(0.12, 0.12, 0.12), BERRY, at(s * (a + (hash(z, a) - 0.5) * 0.4), Y + 1.06, z)));
      }
    }
    o.lamps.push({ geo: new BoxGeometry(0.12, 0.08, c.PL - 3), position: at(s * 9.0, Y - 0.25, 0) });
  }
  // over the tracks only a cable trellis
  for (let z = -14; z <= 14.01; z += 3.5) o.steel.push({ geo: new BoxGeometry(11.8, 0.04, 0.04), position: at(0, Y + 0.3, z) });
}

/* ------------------------------------------------------------------ 7 29th Avenue: the wave */

function wave(c: CanopyCtx, o: CanopyParts): void {
  const A0 = 5.9;
  const A1 = 12.2;
  const Z = c.PL / 2 + 0.6;
  const dz = c.lowEnd ? 0.75 : 0.5;
  const phase = (z: number) => Math.sin((2 * Math.PI * (z + 4)) / 16);
  const y = (a: number, z: number) => 7.05 + 1.3 * phase(z) + (0.35 * (a - A0)) / (A1 - A0);
  for (const s of [1, -1]) {
    const n = Math.ceil((2 * Z) / dz);
    for (let k = 0; k < n; k++) {
      const za = -Z + k * dz;
      const mid = za + dz / 2;
      const ph = phase(mid);
      const fn = (dy: number) => (u: number, v: number) => {
        const a = A0 + (A1 - A0) * u;
        const z = za + dz * v;
        return V(s * a, y(a, z) + dy, z);
      };
      const uv = (u: number, v: number): [number, number] => [u * (A1 - A0), (v * dz) / 2];
      const top = sheet(fn(0), 4, 1, uv, s < 0);
      // a timber edge along both sides, so the ribbon reads as one
      for (const a of [A0, A1]) o.painted.push(tint(beam(V(s * a, y(a, za) - 0.08, za), V(s * a, y(a, za + dz) - 0.08, za + dz), 0.14, 0.3), DARK_TIMBER));
      if (ph < -0.75) {
        // a skylight in the trough
        o.pane.push({ geo: top });
        continue;
      }
      if (ph > 0.3) {
        // meadow on the crest, flowers in it
        o.painted.push({ geo: paint(top, k % 2 ? GREEN : LEAF[2]) });
        for (let f = 0; f < (c.lowEnd ? 1 : 3); f++) {
          const a = A0 + 0.5 + hash(k, f) * (A1 - A0 - 1);
          o.painted.push(pp(new BoxGeometry(0.16, 0.12, 0.16), FLOWERS[(k + f) % 4], at(s * a, y(a, mid) + 0.08, mid)));
        }
      } else o.solar.push({ geo: top });
      o.painted.push({ geo: paint(sheet(fn(-0.1), 4, 1, uv, s > 0), TIMBER) });
    }
    // timber columns and a rib under the ribbon from each to its inner edge; lamps following the wave
    for (const z0 of [-12, -4, 4, 12]) {
      const z = spot(c, s * 11.0, z0, 0.3, 2.5);
      if (z === null) continue;
      const yt = y(11.0, z) - 0.15;
      o.painted.push(pp(new BoxGeometry(0.34, yt - 1.4, 0.34), TIMBER, at(s * 11.0, (1.4 + yt) / 2, z)));
      o.painted.push(tint(beam(V(s * 12.1, y(12.1, z) - 0.2, z), V(s * 6.1, y(6.1, z) - 0.2, z), 0.2, 0.24), TIMBER));
    }
    for (let z = -14; z <= 14.01; z += 2) o.lamps.push({ geo: new BoxGeometry(0.12, 0.08, 1.4), position: at(s * 8.6, y(8.6, z) - 0.35, z) });
  }
}

/* ------------------------------------------------------------------ 8 Joyce–Collingwood: the kinetic louvres */

function louvres(c: CanopyCtx, o: CanopyParts): void {
  const Y = 7.5;
  for (const s of [1, -1]) {
    for (const z0 of [-11.6, -3.9, 3.9, 11.6]) {
      const z = spot(c, s * 11.0, z0, 0.35, 2.5);
      if (z !== null) o.painted.push(pp(new BoxGeometry(0.38, Y - 0.5 - 1.4, 0.38), TIMBER, at(s * 11.0, (1.4 + Y - 0.5) / 2, z)));
    }
    o.painted.push(pp(new BoxGeometry(0.35, 0.5, c.PL + 2), TIMBER, at(s * 11.2, Y - 0.25, 0)));
    // a hanging garden along the outer beam: a trough and its ferns trailing over
    o.painted.push(pp(new BoxGeometry(0.6, 0.5, c.PL + 1.6), DARK_TIMBER, at(s * 11.75, Y - 0.15, 0)));
    o.painted.push(pp(new BoxGeometry(0.5, 0.2, c.PL + 1.4), GREEN, at(s * 11.75, Y + 0.15, 0)));
    for (let z = -c.PL / 2; z <= c.PL / 2 + 0.01; z += c.lowEnd ? 2.4 : 1.2) {
      const h = 0.9 + hash(z, s) * 0.8;
      o.painted.push(pp(new BoxGeometry(0.45, h, 1.0), LEAF[Math.abs(Math.round(z * 2)) % 3], at(s * 12.1, Y - 0.35 - h / 2, z)));
    }
    o.lamps.push({ geo: new BoxGeometry(0.12, 0.08, c.PL - 2), position: at(s * 8.6, Y - 0.6, 0) });
  }
  // cross beams over the tracks, the fins resting on the long beams
  for (const z of [-12, -4, 4, 12]) o.painted.push(pp(new BoxGeometry(22.4, 0.3, 0.25), TIMBER, at(0, Y - 0.2, z)));
  for (let z = -(c.PL / 2 + 0.3); z <= c.PL / 2 + 0.31; z += 1.6) o.fins.push(V(0, Y + 0.5, z));
}

/* ------------------------------------------------------------------ 9 Patterson: the butterfly */

function butterfly(c: CanopyCtx, o: CanopyParts): void {
  const AC = 8.9;
  const VY = 6.1;
  const L = c.PL + 1;
  for (const s of [1, -1]) {
    // the solar wing rising toward the tracks, the meadow wing rising outward, a timber soffit under each
    const wing = (a0: number, a1: number, y1: number) => {
      const len = Math.hypot(a1 - a0, y1 - VY);
      const rz = Math.atan((y1 - VY) / (s * (a1 - a0)));
      return { len, mid: at((s * (a0 + a1)) / 2, (VY + y1) / 2, 0), rot: [0, 0, rz] as [number, number, number] };
    };
    const inner = wing(AC - 0.2, 5.9, 7.0);
    const outer = wing(AC + 0.2, 12.2, 7.5);
    o.solar.push({ geo: tile(new BoxGeometry(inner.len, 0.1, L), inner.len, L / 2), position: inner.mid, rotation: inner.rot });
    o.painted.push(pp(new BoxGeometry(outer.len, 0.25, L), GREEN, outer.mid, outer.rot));
    for (const w of [inner, outer]) o.painted.push(pp(new BoxGeometry(w.len, 0.05, L), TIMBER, [w.mid[0], w.mid[1] - 0.12, 0], w.rot));
    // wildflowers in the meadow
    for (let k = 0; k < (c.lowEnd ? 24 : 60); k++) {
      const t = 0.08 + hash(k, s) * 0.84;
      const z = -L / 2 + 0.5 + hash(s, k) * (L - 1);
      const a = AC + 0.2 + (12.2 - AC - 0.2) * t;
      o.painted.push(pp(new BoxGeometry(0.16, 0.12, 0.16), FLOWERS[k % 4], at(s * a, VY + (7.5 - VY) * t + 0.18, z)));
    }
    // the valley gutter, lit from under, pouring at one end into a rain garden
    o.painted.push(pp(new BoxGeometry(0.45, 0.3, L + 0.4), STEEL, at(s * AC, VY - 0.05, 0)));
    o.lamps.push({ geo: new BoxGeometry(0.12, 0.08, c.PL - 3), position: at(s * AC, VY - 0.35, 0) });
    const gz = [1, -1].map((e) => e * (c.PL / 2 - 1.6)).find((z) => c.clear(s * AC, z, 1.0));
    if (gz !== undefined) {
      roundPlanter(o, s * AC, gz, 1.0, s * 3, true);
      o.painted.push(pp(new BoxGeometry(0.2, 0.25, 0.5), STEEL, at(s * AC, VY - 0.3, gz)));
      o.pane.push({ geo: new BoxGeometry(0.16, VY - 0.45 - 2.0, 0.1), position: at(s * AC, (VY - 0.45 + 2.0) / 2, gz) });
    }
    // timber forks down the platform's middle, where nothing comes up through the floor
    for (const z0 of [-9, 0, 9]) {
      const z = spot(c, s * AC, z0, 0.3, 4);
      if (z === null || (gz !== undefined && Math.abs(z - gz) < 1.6)) continue;
      const fork = V(s * AC, 4.6, z);
      for (const p of [strut(V(s * AC, 1.4, z), fork, 0.22, 0.18, 8), strut(fork, V(s * 7.2, 6.45, z), 0.15, 0.1), strut(fork, V(s * 10.6, 6.65, z), 0.15, 0.1)]) o.painted.push(tint(p, TIMBER));
    }
  }
}

const BUILD: Record<Exclude<CanopyKind, "hub">, (c: CanopyCtx, o: CanopyParts) => void> = { sails, grove, sawtooth, eaves, funnels, agri, wave, louvres, butterfly };

/** A stop's roof (none for the interchange, which builds its own). */
export function canopyParts(kind: CanopyKind, c: CanopyCtx): CanopyParts {
  const o: CanopyParts = { pane: [], steel: [], painted: [], solar: [], pvGlass: [], membrane: [], lamps: [], lanterns: [], fins: [] };
  if (kind !== "hub") BUILD[kind](c, o);
  return o;
}

/**
 * A helical vertical-axis wind turbine, 3.4 tall: three blades twisting a third of a turn round the axis between two
 * hubs, on a short mast. Built round the origin so it spins about y.
 */
export function turbineBlades(): BufferGeometry {
  const parts: Part[] = [];
  for (let b = 0; b < 3; b++) {
    const pts: Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const a = (b / 3) * Math.PI * 2 + u * (Math.PI * 2) / 3;
      pts.push(new Vector3(Math.cos(a) * 0.75, 0.2 + u * 3, Math.sin(a) * 0.75));
    }
    parts.push({ geo: new TubeGeometry(new CatmullRomCurve3(pts), 16, 0.07, 4, false) });
    for (const y of [0.2, 3.2]) {
      const a = (b / 3) * Math.PI * 2 + (y > 1 ? (Math.PI * 2) / 3 : 0);
      parts.push({ geo: new BoxGeometry(0.75, 0.06, 0.08), position: at(Math.cos(a) * 0.37, y, Math.sin(a) * 0.37), rotation: [0, -a, 0] });
    }
  }
  return merged(parts);
}
