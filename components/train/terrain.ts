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
 * The east basin of False Creek, redrawn: from Cambie Bridge to Science World on its point, with the inlet where the
 * daylighted China Creek runs in beside Creekside Park. The bake left most of it as land, and the stadiums stand
 * larger than life (they are sized against the train), so inside the box the shore is this polygon alone and the
 * basin lies a little south of the real one; across the box's west edge it blends into the baked creek. World units.
 */
const REDRAWN = { x0: -60, x1: 100, z0: 118, z1: 246, blend: 12 };
const EXTRA_WATER: [number, number][][] = [
  [
    [-78, 176],
    [-44, 182],
    [-22, 193],
    [-4, 202],
    [26, 203],
    [41, 197],
    [41, 166],
    [52, 166],
    [52, 182],
    [55, 210],
    [70, 217],
    [90, 216],
    [92, 224],
    [70, 232],
    [40, 232],
    [0, 230],
    [-30, 223],
    [-62, 213],
    [-82, 202],
  ],
];
const EXTRA_BOX = EXTRA_WATER.map((p) => [Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[1]))]);

/** Signed distance to a polygon's edge, negative inside. */
function polySdf(poly: [number, number][], x: number, z: number): number {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
  }
  return inside ? -d : d;
}

/** Signed distance to the shore in world units, positive on land, negative on water. */
export const sdfAt = (x: number, z: number): number => {
  const s = bilinear(SDF_CITY, (k) => SDF[k] / SDF_CITY.scale, x, z);
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
export const inWater = (x: number, z: number): boolean => sdfAt(x, z) < 0;
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

/**
 * Final ground height. Inside the raster it interpolates on the mesh's own triangles: each cell (a, b / c, d) is split
 * along b–c into (a, c, b) and (b, c, d), exactly as Ground.tsx indexes it.
 */
export function groundAt(x: number, z: number): number {
  const hf = frozen ?? freeze();
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
  const hf = frozen ?? freeze();
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
