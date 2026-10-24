/**
 * The ground: the baked DEM (metres) and water signed-distance field, scaled by TERRAIN_V, then the modifiers the
 * track and the sites register (station and landmark pads, the Grandview Cut, park flattening, stream swales), frozen
 * into one raster on the first `groundAt` call. `groundAt` interpolates the raster on the same triangles the ground
 * mesh draws, so nothing placed with it floats or sinks. Pure (no three.js, no DOM).
 */
import { SEA, TERRAIN_V } from "./constants";
import { DEM_CITY, DEM_CITY_DATA, SDF_CITY, SDF_CITY_DATA } from "./terrainData";

type GridDef = { x0: number; z0: number; step: number; nx: number; nz: number };

const decode = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const DEM = new Uint16Array(decode(DEM_CITY_DATA).buffer);
const SDF = new Int8Array(decode(SDF_CITY_DATA).buffer);
/** The field as baked, Deadman's Island and all (see `carveIslet` and `asBaked`). */
const SDF_BAKED = SDF.slice();
/** The field `sdfAt` reads: the carved one, or the baked one while the city and its trees are laid out. */
let field = SDF;

/**
 * Deadman's Island, beside the Canada Place pier only because the pier stands west of its real site: the box round
 * it. Inside the box the island is carved to water (its cells in the baked field set to the sea, the distances round
 * it worked out afresh), so the harbour, the ground, the roads' and parks' tests and the boats all see open water.
 */
export const ISLET_BOX = { x0: -115, x1: -60, z0: -135, z1: -60 };
/** On what was the island (or its shore), as baked. */
export const inIslet = (x: number, z: number): boolean =>
  x > ISLET_BOX.x0 && x < ISLET_BOX.x1 && z > ISLET_BOX.z0 && z < ISLET_BOX.z1 && bilinear(SDF_CITY, (k) => SDF_BAKED[k] / SDF_CITY.scale, x, z) > -2;

/** Carve the island: the land in the box not joined to land outside it becomes water, and the water's depth is redrawn. */
function carveIslet(): number {
  const g = SDF_CITY;
  const i0 = Math.max(1, Math.floor((ISLET_BOX.x0 - g.x0) / g.step));
  const i1 = Math.min(g.nx - 2, Math.ceil((ISLET_BOX.x1 - g.x0) / g.step));
  const j0 = Math.max(1, Math.floor((ISLET_BOX.z0 - g.z0) / g.step));
  const j1 = Math.min(g.nz - 2, Math.ceil((ISLET_BOX.z1 - g.z0) / g.step));
  const inBox = (i: number, j: number) => i >= i0 && i <= i1 && j >= j0 && j <= j1;
  const land = (i: number, j: number) => SDF[j * g.nx + i] > 0;
  // the mainland's land in the box: what joins (side by side) the land outside it
  const joined = new Uint8Array(g.nx * g.nz);
  const queue: [number, number][] = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (!land(i, j)) continue;
      if ([[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].some(([a, b]) => !inBox(a, b) && land(a, b))) {
        joined[j * g.nx + i] = 1;
        queue.push([i, j]);
      }
    }
  }
  while (queue.length) {
    const [i, j] = queue.pop() as [number, number];
    for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
      if (inBox(a, b) && land(a, b) && !joined[b * g.nx + a]) {
        joined[b * g.nx + a] = 1;
        queue.push([a, b]);
      }
    }
  }
  let carved = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (land(i, j) && !joined[j * g.nx + i]) {
        SDF[j * g.nx + i] = -1;
        carved++;
      }
    }
  }
  // the water's distance to the land left, where it is more than a cell and a half from it (the shores elsewhere keep
  // their baked values), down to the field's floor
  const R = 3;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * g.nx + i;
      if (SDF[k] > 0) continue;
      let best = Infinity;
      for (let b = Math.max(0, j - R); b <= Math.min(g.nz - 1, j + R); b++) for (let a = Math.max(0, i - R); a <= Math.min(g.nx - 1, i + R); a++) if (SDF[b * g.nx + a] > 0) best = Math.min(best, Math.hypot(a - i, b - j) * g.step);
      if (best > g.step * 1.5) SDF[k] = Math.max(-128, -Math.round((best - g.step / 2) * g.scale));
    }
  }
  return carved;
}
/** How many of the field's points the island took. */
export const ISLET_CARVED = carveIslet();

const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function bilinear(g: GridDef, get: (k: number) => number, x: number, z: number): number {
  const fx = Math.min(g.nx - 1.0001, Math.max(0, (x - g.x0) / g.step));
  const fz = Math.min(g.nz - 1.0001, Math.max(0, (z - g.z0) / g.step));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * g.nx + i;
  return (get(k) * (1 - u) + get(k + 1) * u) * (1 - v) + (get(k + g.nx) * (1 - u) + get(k + g.nx + 1) * u) * v;
}

/** Elevation in metres from the baked city grid (edge-clamped outside it). */
export const demMetres = (x: number, z: number): number => bilinear(DEM_CITY, (k) => DEM[k] / DEM_CITY.scale - DEM_CITY.bias, x, z);
/**
 * False Creek, redrawn (world units):
 * - the east basin: open water from the seawall under BC Place across to Science World on its point at the head of
 *   the basin, as it is today and will stay. The north shore follows BC Place's seawall (Rogers Arena stands back from
 *   it, to the east), the inlet where the daylighted China Creek runs in lies between Rogers and Creekside Park, and
 *   Science World's promenade deck stands out over the water on piles round its west and south sides. The bake left
 *   most of the basin as land, and the stadiums stand larger than life (they are sized against the train), so inside
 *   the box the shore is this polygon alone and the basin lies a little south of the real one;
 * - the creek: as wide as the real one (the bake had narrowed it to a canal), from the basin past Yaletown and the
 *   Fairview shore, round Granville Island and out through its mouth into English Bay. Outside the box it only adds
 *   water to the bake.
 */
const REDRAWN = { x0: -60, x1: 100, z0: 118, z1: 258, blend: 12 };
/** Science World's place on its point: the shore runs under its deck, 15.5 units out from the sphere. */
export const SW_POINT = { x: 72, z: 214, shore: 15.5 };
/** Corner-cut (Chaikin) so the drawn shore curves like a seawall rather than meeting at angles. */
function rounded(poly: [number, number][], keep: (p: [number, number]) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (keep(a)) out.push(a);
    else out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    if (!keep(b)) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}
const swArc: [number, number][] = Array.from({ length: 11 }, (_, k): [number, number] => {
  const a = ((262 - 19.2 * k) * Math.PI) / 180;
  return [SW_POINT.x + Math.cos(a) * SW_POINT.shore, SW_POINT.z + Math.sin(a) * SW_POINT.shore];
});
const onSwArc = (p: [number, number]) => swArc.includes(p);
const EXTRA_WATER: [number, number][][] = [
  rounded(
    [
      [-78, 176],
      [-60, 178],
      // BC Place's seawall, 55 units out from the stadium, just past its plaza
      [-41.5, 177.6],
      [-30.1, 182.6],
      [-17.8, 184.9],
      [-5.4, 184.3],
      [6.6, 181],
      [17.5, 175.1],
      [26.9, 166.8],
      // under Rogers Arena, the creek's mouth beside Creekside Park, and down past the entrance hall to Science World
      [36, 162],
      [48, 160.5],
      [62, 161],
      [66, 166],
      [66, 176],
      [64, 186],
      ...swArc,
      // round its south side under the deck, then the south shore under the Olympic Village
      [80.5, 233.5],
      [79, 240],
      [70, 246],
      [50, 250],
      [20, 252],
      [-10, 249],
      [-40, 241],
      [-70, 231],
      [-84, 226],
    ],
    onSwArc,
  ),
  rounded(
    [
      // the north shore: Yaletown, David Lam and George Wainborn Parks, Beach Avenue
      [-40, 190],
      [-62, 181],
      [-80, 174],
      [-100, 166],
      [-120, 158],
      [-140, 150],
      [-158, 141],
      [-175, 129],
      [-190, 117],
      [-203, 105],
      [-212, 93],
      // out into English Bay and back in past Kits Point
      [-228, 80],
      [-250, 92],
      [-256, 118],
      [-246, 132],
      [-232, 150],
      [-216, 162],
      // Granville Island's north shore, then the Fairview shore back to the basin
      [-204, 168],
      [-185, 168],
      [-166, 170],
      [-156, 176],
      [-148, 190],
      [-132, 203],
      [-112, 213],
      [-92, 221],
      [-72, 227],
      [-50, 233],
      [-40, 234],
    ],
    () => false,
  ),
];
/** The drawn shores (water inside), for the seawall and the walk along it. */
export const SHORES = EXTRA_WATER;
/**
 * Where the shore is cut sharp: the ground raster's 6-unit cells would ramp a seawall's drop out into the water, so
 * over False Creek the ground is cut at the shore (Ground's mask), a wall closes the edge and the far terrain below is
 * sunk out of sight.
 */
export const SHORE_BOX = { x0: -272, x1: REDRAWN.x1, z0: 70, z1: 262 };
const EXTRA_BOX = EXTRA_WATER.map((p) => [Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[1]))]);

/** Signed distance to a polygon's edge, negative inside (squared distances in the loop: this runs per ground sample). */
export function polySdf(poly: [number, number][], x: number, z: number): number {
  let d2 = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    const dx = x - ax - ex * t;
    const dz = z - az - ez * t;
    d2 = Math.min(d2, dx * dx + dz * dz);
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
  }
  const d = Math.sqrt(d2);
  return inside ? -d : d;
}

/** Signed distance to the shore in world units, positive on land, negative on water. */
export const sdfAt = (x: number, z: number): number => {
  const s = bilinear(SDF_CITY, (k) => field[k] / SDF_CITY.scale, x, z);
  let drawn = Infinity;
  for (let k = 0; k < EXTRA_WATER.length; k++) {
    const b = EXTRA_BOX[k];
    if (x > b[0] - 40 && x < b[1] + 40 && z > b[2] - 40 && z < b[3] + 40) drawn = Math.min(drawn, polySdf(EXTRA_WATER[k], x, z));
  }
  const R = REDRAWN;
  if (x > R.x0 - R.blend && x < R.x1 && z > R.z0 && z < R.z1) {
    // inside the box the drawn shore alone (land beyond it), blending into the baked field across the west edge
    const own = Math.min(drawn, 40);
    return x >= R.x0 ? own : lerp(Math.min(s, own), own, (x - (R.x0 - R.blend)) / R.blend);
  }
  return Math.min(s, drawn);
};
/** In the sea, or in Trout Lake as drawn (its water reaches a little past the map's outline). */
export const inWater = (x: number, z: number): boolean => sdfAt(x, z) < 0 || lakeR(x, z) < 1.05;
/**
 * Water in the redrawn east basin. Pads stop at it (a seawall), where elsewhere the station pads keep the shore
 * they were built on round Waterfront, Burrard and Granville.
 */
export const inBasin = (x: number, z: number): boolean => x > REDRAWN.x0 && x < REDRAWN.x1 && z > REDRAWN.z0 && z < REDRAWN.z1 && sdfAt(x, z) < 0;

/** Trout Lake sits above sea level, so it is a lake bowl (a pad) rather than sea floor. */
export const LAKE = { x: 400, z: 374, rx: 20, rz: 13 };
const lakeR = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
export const lakeLevel = (): number => demMetres(LAKE.x, LAKE.z) * TERRAIN_V;

/** Coast-clamped DEM height in world units, before any modifier: continuous at the shore, land at least 0.3 above the sea plane. */
export function demAt(x: number, z: number): number {
  const sd = sdfAt(x, z);
  if (sd < 0 && lakeR(x, z) > 1.6) return Math.max(-3, SEA + 0.4 * sd);
  const land = Math.max(demMetres(x, z) * TERRAIN_V, 0.3);
  return lakeR(x, z) <= 1.6 ? land : SEA + (land - SEA) * sstep(0, 8, sd);
}

export type Modifier = (x: number, z: number, h: number) => number;
const modifiers: Modifier[] = [];

/** A flat disc of height y with radius r, blended over `blend` units. */
export const discPad = (x: number, z: number, r: number, blend: number, y: number): Modifier => (px, pz, h) => {
  const d = Math.hypot(px - x, pz - z);
  return d >= r + blend ? h : lerp(h, y, 1 - sstep(r, r + blend, d));
};
/** A flat oriented rectangle (half sizes along tx/tz and across), blended over `blend` units. */
export const rectPad = (x: number, z: number, tx: number, tz: number, halfAlong: number, halfAcross: number, blend: number, y: number): Modifier => (px, pz, h) => {
  const dx = px - x;
  const dz = pz - z;
  const a = Math.abs(dx * tx + dz * tz) - halfAlong;
  const c = Math.abs(-dx * tz + dz * tx) - halfAcross;
  const d = Math.hypot(Math.max(a, 0), Math.max(c, 0));
  return d >= blend ? h : lerp(h, y, 1 - sstep(0, blend, d));
};

let frozen: Float32Array | null = null;
/** The raster as baked (the island standing) round the island's box, read while `asBaked` runs. */
let bakedRaster: Float32Array | null = null;
let baked = false;
/** The raster the ground mesh draws: 6-unit cells over the city box. */
export const RASTER: GridDef = { x0: -520, z0: -450, step: 6, nx: 254, nz: 219 };

/** Register a modifier; all of them must be in before the first groundAt call. */
export function addModifier(m: Modifier): void {
  if (frozen) throw new Error("terrain: modifier registered after the ground was frozen");
  modifiers.push(m);
}

const finalAt = (x: number, z: number): number => {
  let h = demAt(x, z);
  for (const m of modifiers) h = m(x, z, h);
  return h;
};

function freeze(): Float32Array {
  const g = RASTER;
  const hf = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) hf[j * g.nx + i] = finalAt(g.x0 + i * g.step, g.z0 + j * g.step);
  frozen = hf;
  return hf;
}
export const terrainRaster = (): { grid: GridDef; hf: Float32Array } => ({ grid: RASTER, hf: frozen ?? freeze() });
/** The raster the ground reads: the drawn one, or the baked one while `asBaked` runs. */
const raster = (): Float32Array => (baked && bakedRaster ? bakedRaster : (frozen ?? freeze()));

/**
 * Run f on the ground and the shore as baked, Deadman's Island standing: the city lays its lots and plants its trees
 * this way, so every number it draws is drawn as before and the island's own lots and trees (taken out after) do not
 * move the rest. Only the island's box differs.
 */
export function asBaked<T>(f: () => T): T {
  const hf = frozen ?? freeze();
  if (!bakedRaster) {
    const out = hf.slice();
    const g = RASTER;
    field = SDF_BAKED;
    for (let j = Math.max(0, Math.floor((ISLET_BOX.z0 - g.z0) / g.step) - 1); j <= Math.min(g.nz - 1, Math.ceil((ISLET_BOX.z1 - g.z0) / g.step) + 1); j++) {
      for (let i = Math.max(0, Math.floor((ISLET_BOX.x0 - g.x0) / g.step) - 1); i <= Math.min(g.nx - 1, Math.ceil((ISLET_BOX.x1 - g.x0) / g.step) + 1); i++) out[j * g.nx + i] = finalAt(g.x0 + i * g.step, g.z0 + j * g.step);
    }
    field = SDF;
    bakedRaster = out;
  }
  const was = baked;
  baked = true;
  field = SDF_BAKED;
  try {
    return f();
  } finally {
    baked = was;
    field = was ? SDF_BAKED : SDF;
  }
}

/**
 * Final ground height. Inside the raster it interpolates on the mesh's own triangles: each cell (a, b / c, d) is split
 * along b–c into (a, c, b) and (b, c, d), exactly as Ground.tsx indexes it.
 */
export function groundAt(x: number, z: number): number {
  const hf = raster();
  const g = RASTER;
  const fx = (x - g.x0) / g.step;
  const fz = (z - g.z0) / g.step;
  if (fx < 0 || fz < 0 || fx >= g.nx - 1 || fz >= g.nz - 1) return finalAt(x, z);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * g.nx + i;
  const a = hf[k];
  const b = hf[k + 1];
  const c = hf[k + g.nx];
  const d = hf[k + g.nx + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/**
 * Height of the ground mesh as drawn: the low-end mesh keeps every `stride`-th raster point with the same diagonal,
 * so ribbons laid on it (streams, paths) must follow it rather than the full raster.
 */
export function surfaceAt(x: number, z: number, stride: number): number {
  if (stride === 1) return groundAt(x, z);
  const hf = raster();
  const g = RASTER;
  const nx = Math.floor((g.nx - 1) / stride) + 1;
  const nz = Math.floor((g.nz - 1) / stride) + 1;
  const fx = (x - g.x0) / (g.step * stride);
  const fz = (z - g.z0) / (g.step * stride);
  if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return groundAt(x, z);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const at = (ii: number, jj: number) => hf[jj * stride * g.nx + ii * stride];
  const a = at(i, j);
  const b = at(i + 1, j);
  const c = at(i, j + 1);
  const d = at(i + 1, j + 1);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** Rise over run of the ground at (x, z), from the raster. */
export function slopeAt(x: number, z: number): number {
  const e = RASTER.step;
  return Math.hypot(groundAt(x + e, z) - groundAt(x - e, z), groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
}
