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
/** Signed distance to the shore in world units, positive on land, negative on water. */
export const sdfAt = (x: number, z: number): number => bilinear(SDF_CITY, (k) => SDF[k] / SDF_CITY.scale, x, z);
export const inWater = (x: number, z: number): boolean => sdfAt(x, z) < 0;

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
