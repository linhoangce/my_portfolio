/**
 * Pure height field for the Tide Lab coast. Everything that needs to know
 * where the ground is (terrain mesh, prop placement, teleports) calls
 * `terrainHeight(x, z)`. Deterministic, no three.js imports.
 */
import { world } from "@/data";

const ICE_TOP = world.iceTop;
const SEABED = world.seabed;
const WATER = world.waterLevel;

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Value noise in [0, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Main ice shelf (west) and the dock spit (south-east). Both run past the bounds. */
export const SHELF: Rect = { minX: -72, maxX: 4, minZ: -30, maxZ: 56 };
export const SPIT: Rect = { minX: 28, maxX: 72, minZ: 18, maxZ: 56 };

function sdRect(x: number, z: number, r: Rect): number {
  const dx = Math.max(r.minX - x, x - r.maxX);
  const dz = Math.max(r.minZ - z, z - r.maxZ);
  const ox = Math.max(dx, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0);
}

/** Signed distance to land: negative on the ice, positive in the water. Edges wobble. */
export function landDistance(x: number, z: number): number {
  const d = Math.min(sdRect(x, z, SHELF), sdRect(x, z, SPIT));
  const wobble = (fbm(x * 0.07 + 7.3, z * 0.07 + 3.1) - 0.5) * 6;
  return d + wobble;
}

/** Shore band in land-distance units: 0 at `start` (ice top) to 1 at `end` (seabed). */
export const SHORE_BAND = { start: -1.5, end: 8.5 };

export function waterFraction(x: number, z: number): number {
  return smoothstep(SHORE_BAND.start, SHORE_BAND.end, landDistance(x, z));
}

function mound(x: number, z: number, cx: number, cz: number, r: number, h: number): number {
  const d2 = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
  return h * Math.exp(-d2 * 2.2);
}

export const MOUNDS = {
  lookout: { x: -8, z: -18, r: 7, h: 2.4 },
  schoolRock: { x: -45, z: -23, r: 4, h: 0.8 },
};

export function terrainHeight(x: number, z: number): number {
  const t = waterFraction(x, z);
  let h = lerp(ICE_TOP, SEABED, t);
  // Faceted ice detail.
  h += (1 - t) * (noise2(x * 0.35 + 2, z * 0.35 + 9) - 0.5) * 0.22;
  // Deeper open water toward the north.
  h -= t * smoothstep(-26, -46, z) * 3;
  // Seabed ripples.
  h += t * (noise2(x * 0.15, z * 0.15) - 0.5) * 0.6;
  // Hills.
  const lk = MOUNDS.lookout;
  h += (1 - t) * mound(x, z, lk.x, lk.z, lk.r, lk.h);
  const sr = MOUNDS.schoolRock;
  h += (1 - t) * mound(x, z, sr.x, sr.z, sr.r, sr.h);
  return h;
}

/** True where the ground is ice above the water line. */
export function isDryIce(x: number, z: number): boolean {
  return terrainHeight(x, z) > WATER + 0.1;
}

/** True where the water is deep enough to swim. */
export function isDeepWater(x: number, z: number): boolean {
  return terrainHeight(x, z) < WATER - 1.2;
}
