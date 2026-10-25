/**
 * Towers after senákw, the Sḵwx̱wú7mesh (Squamish) Nation's towers at the south end of the Burrard Bridge, put here on
 * the rise behind Science World's planted slope:
 * - faceted glass prisms that widen and then narrow as they twist, two stacked prisms each (city.ts builds them);
 * - dark glass hung with orange and white balconies (the facade family `senakw`);
 * - big sculpted forms in orange and white across their facets, a stem splitting into two arms (Culture.tsx draws them,
 *   placed on the facets here);
 * - planted podiums between the streets, a round glass pavilion on one, planted roofs.
 * The city's lots on the two podiums are built into its scratch sink, so the rest of the city is as it was. senákw
 * itself stands on its own ground at the south end of the Burrard Bridge (developments.ts).
 */
import { groundAt, surfaceAt } from "../terrain";
import type { Poly } from "./parts";

export type Podium = { x0: number; x1: number; z0: number; z1: number; h: number };
/** A tower: where, its size, its turn, its podium, and its prisms (from, to as shares of its height; scale and turn at each). */
export type Tower = { x: number; z: number; r: number; h: number; rot: number; podium: number; prisms: [number, number, number, number, number, number][] };

/** The block behind the slope, and the one across the street to the south. */
export const PODIUMS: Podium[] = [
  { x0: 97, x1: 118, z0: 237, z1: 249.5, h: 3.4 },
  { x0: 100, x1: 121, z0: 257.5, z1: 267, h: 3.4 },
];
/** Three forms, as the three at senákw differ: one widening as it rises, one swelling at its middle, one tapering. */
export const TOWERS: Tower[] = [
  { x: 102.6, z: 243.2, r: 4.0, h: 58, rot: 0.2, podium: 0, prisms: [[0, 0.55, 0.84, 0.98, 0, 0.1], [0.55, 1, 0.98, 1.06, 0.1, 0.22]] },
  { x: 112.8, z: 242.8, r: 4.1, h: 72, rot: -0.35, podium: 0, prisms: [[0, 0.45, 0.8, 1.06, 0, 0.26], [0.45, 1, 1.06, 0.82, 0.26, 0.5]] },
  { x: 110.5, z: 262.2, r: 4.4, h: 86, rot: 0.6, podium: 1, prisms: [[0, 0.5, 1.04, 0.9, 0, 0.18], [0.5, 1, 0.9, 0.72, 0.18, 0.44]] },
];

/**
 * A tower's footprint: a hexagon drawn out to points at its two ends (local x), its long sides folding in, turned by its
 * rot: the prisms' scaling and turning fold its faces further.
 */
export function towerPoly(t: Tower): Poly {
  return ([[0, 1.18], [0.95, 0.82], [2.19, 0.82], [Math.PI, 1.18], [4.09, 0.82], [5.33, 0.82]] as const).map(([a0, k]) => {
    const a = a0 + t.rot;
    return [Math.cos(a) * t.r * k, Math.sin(a) * t.r * k] as [number, number];
  });
}

/** The round glass pavilion on the southern podium, a garden on its roof. */
export const PAVILION = { x: 103.6, z: 263.2, r: 2.5, h: 4.2, podium: 1 };

/** On (or within pad of) a podium. */
export const inSenakw = (x: number, z: number, pad = 0.6): boolean => PODIUMS.some((p) => x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad);

/**
 * A podium's foot and floor, as the city's buildings take theirs (city.ts floorAt and footAt): on low-end devices the
 * coarser ground as drawn counts too.
 */
export function podiumLevels(p: Podium, lowEnd: boolean): { yb: number; yt: number } {
  let yb = Infinity;
  let yt = -Infinity;
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    for (const v of [0, 0.5, 1]) {
      const x = p.x0 + (p.x1 - p.x0) * u;
      const z = p.z0 + (p.z1 - p.z0) * v;
      const g = groundAt(x, z);
      const s = lowEnd ? surfaceAt(x, z, 2) : g;
      yb = Math.min(yb, g, s);
      yt = Math.max(yt, g, s);
    }
  }
  return { yb: yb - 0.6, yt };
}

/** Where a tower's prisms begin: its podium's top. */
export const towerBase = (t: Tower, lowEnd: boolean): number => podiumLevels(PODIUMS[t.podium], lowEnd).yt + PODIUMS[t.podium].h;

/** A sculpted form: on which tower and face, how far up (share of its height), white or orange, pointing which way. */
export type Sculpture = { tower: number; face: number; at: number; white: boolean; flip: boolean };
export const SCULPTURES: Sculpture[] = [
  { tower: 0, face: 1, at: 0.22, white: false, flip: false },
  { tower: 0, face: 1, at: 0.36, white: true, flip: true },
  { tower: 0, face: 4, at: 0.3, white: false, flip: true },
  { tower: 0, face: 3, at: 0.6, white: true, flip: false },
  { tower: 1, face: 0, at: 0.18, white: true, flip: false },
  { tower: 1, face: 0, at: 0.3, white: false, flip: true },
  { tower: 1, face: 2, at: 0.42, white: false, flip: false },
  { tower: 1, face: 5, at: 0.55, white: true, flip: true },
  { tower: 2, face: 1, at: 0.2, white: false, flip: true },
  { tower: 2, face: 1, at: 0.31, white: true, flip: false },
  { tower: 2, face: 3, at: 0.26, white: false, flip: false },
  { tower: 2, face: 4, at: 0.48, white: true, flip: true },
  { tower: 2, face: 0, at: 0.62, white: false, flip: false },
];

/**
 * A tower's face at a height: its middle, its outward normal and width, as walls() (parts.ts) lays the prisms: each
 * slice the footprint scaled and turned about the tower's centre.
 */
export function towerFace(t: Tower, face: number, at: number, lowEnd: boolean): { x: number; y: number; z: number; nx: number; nz: number; w: number } {
  const base = towerBase(t, lowEnd);
  const [f0, f1, s0, s1, r0, r1] = t.prisms.find(([a, b]) => at >= a && at <= b) ?? t.prisms[0];
  const k = (at - f0) / (f1 - f0);
  const s = s0 + (s1 - s0) * k;
  const r = r0 + (r1 - r0) * k;
  const cs = Math.cos(r);
  const sn = Math.sin(r);
  const poly = towerPoly(t);
  const P = ([x, z]: [number, number]): [number, number] => [t.x + (x * cs - z * sn) * s, t.z + (x * sn + z * cs) * s];
  const [ax, az] = P(poly[face % 6]);
  const [bx, bz] = P(poly[(face + 1) % 6]);
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const L = Math.hypot(bx - ax, bz - az) || 1;
  let nx = (bz - az) / L;
  let nz = -(bx - ax) / L;
  if (nx * (mx - t.x) + nz * (mz - t.z) < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: mx, y: base + t.h * at, z: mz, nx, nz, w: L };
}
