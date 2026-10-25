/**
 * The rail system drawn at SLIM across the track (constants.ts), its stations included: where a point across a station
 * (in its first numbers, the station's frame, + either side of the track) is drawn now. Pure.
 */
import { BufferAttribute, BufferGeometry } from "three";

import { SLIM } from "./constants";
import { type Frame, makeFrame } from "./track";

/** A station's deck edge and its platforms' outer edge across the track, in its first numbers. */
const DECK_EDGE = 6.3;
const PLATFORM_OUT = 11.5;

/**
 * Inside the deck's edge at SLIM, as the guideway is; the platform beyond widened to keep its outer edge, so the ways up,
 * the sets' bridges and the halls round it meet it where they did; nothing further out moved.
 */
export function acrossStation(x: number): number {
  const a = Math.abs(x);
  if (a <= DECK_EDGE) return x * SLIM;
  if (a >= PLATFORM_OUT) return x;
  return Math.sign(x) * (DECK_EDGE * SLIM + ((a - DECK_EDGE) * (PLATFORM_OUT - DECK_EDGE * SLIM)) / (PLATFORM_OUT - DECK_EDGE));
}

/** A geometry built in a station's frame, its x across the track, remapped as acrossStation (in place). */
export function slimStation(geo: BufferGeometry): BufferGeometry {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, acrossStation(pos.getX(i)));
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A station's frame bent along its track: a point `x` across (+ left of travel) and `z` along from its middle is that far
 * along the track (by its arc length) and that far across it there, so its platforms keep their distance from the rails
 * round a curve; `heading` is the track's turn there (as a rotation about y taking +z along it). Sampled from `at` (the
 * line's frame at arc length s) every half unit, `reach` either way of the middle, straight on beyond.
 */
export type Bend = { point: (x: number, z: number) => [number, number]; heading: (z: number) => number };
export function bendAlong(at: (s: number, out: Frame) => void, s0: number, reach = 48): Bend {
  const STEP = 0.5;
  const n = Math.round((2 * reach) / STEP);
  // each sample: x, z, and the horizontal unit tangent
  const tab = new Float64Array((n + 1) * 4);
  const f = makeFrame();
  for (let k = 0; k <= n; k++) {
    at(s0 - reach + k * STEP, f);
    const L = Math.hypot(f.t.x, f.t.z) || 1;
    tab.set([f.p.x, f.p.z, f.t.x / L, f.t.z / L], k * 4);
  }
  const sample = (z: number): [number, number, number, number] => {
    const u = (z + reach) / STEP;
    const k = Math.min(n - 1, Math.max(0, Math.floor(u)));
    const w = Math.min(1, Math.max(0, u - k));
    const a = k * 4;
    const b = a + 4;
    let tx = tab[a + 2] + (tab[b + 2] - tab[a + 2]) * w;
    let tz = tab[a + 3] + (tab[b + 3] - tab[a + 3]) * w;
    const L = Math.hypot(tx, tz) || 1;
    tx /= L;
    tz /= L;
    // beyond the samples, straight on along the last tangent
    const over = u < 0 ? u * STEP : u > n ? (u - n) * STEP : 0;
    return [tab[a] + (tab[b] - tab[a]) * w + tx * over, tab[a + 1] + (tab[b + 1] - tab[a + 1]) * w + tz * over, tx, tz];
  };
  return {
    point: (x, z) => {
      const [px, pz, tx, tz] = sample(z);
      // left of travel is -(t x up) = (t.z, -t.x)
      return [px + tz * x, pz - tx * x];
    },
    heading: (z) => {
      const [, , tx, tz] = sample(z);
      return Math.atan2(tx, tz);
    },
  };
}

/**
 * A geometry's triangles split (as a new, non-indexed geometry) until none spans more than `step` along z, every
 * attribute carried along: a platform's slab or a row of glass is one long box, which bent only at its ends would run
 * straight across the curve between them.
 */
function splitAlong(geo: BufferGeometry, step: number): BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const names = Object.keys(src.attributes);
  const attrs = names.map((n) => src.attributes[n]);
  const out: number[][] = names.map(() => []);
  const pz = names.indexOf("position");
  // a vertex: each attribute's components, in order
  const vert = (i: number) => attrs.map((a) => Array.from({ length: a.itemSize }, (_, c) => a.array[i * a.itemSize + c] as number));
  const mid = (a: number[][], b: number[][]) => a.map((v, k) => v.map((x, c) => (x + b[k][c]) / 2));
  const tri = (a: number[][], b: number[][], c: number[][]) => {
    const ab = Math.abs(a[pz][2] - b[pz][2]);
    const bc = Math.abs(b[pz][2] - c[pz][2]);
    const ca = Math.abs(c[pz][2] - a[pz][2]);
    const most = Math.max(ab, bc, ca);
    if (most <= step) {
      for (const v of [a, b, c]) v.forEach((x, k) => out[k].push(...x));
    } else if (most === ab) {
      const m = mid(a, b);
      tri(a, m, c);
      tri(m, b, c);
    } else if (most === bc) {
      const m = mid(b, c);
      tri(a, b, m);
      tri(a, m, c);
    } else {
      const m = mid(c, a);
      tri(a, b, m);
      tri(m, b, c);
    }
  };
  for (let i = 0; i + 2 < src.attributes.position.count; i += 3) tri(vert(i), vert(i + 1), vert(i + 2));
  const g = new BufferGeometry();
  names.forEach((n, k) => g.setAttribute(n, new BufferAttribute(new Float32Array(out[k]), attrs[k].itemSize, attrs[k].normalized)));
  if (g.attributes.normal) normalise(g.attributes.normal as BufferAttribute);
  return g;
}

/** Unit normals again after splitting (the midpoint of two unit normals is shorter). */
function normalise(nor: BufferAttribute): void {
  for (let i = 0; i < nor.count; i++) {
    const L = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) || 1;
    nor.setXYZ(i, nor.getX(i) / L, nor.getY(i) / L, nor.getZ(i) / L);
  }
}

/**
 * A geometry built in a station's frame (x left, y up from `y0`, z ahead), bent onto its track (as a new geometry, split
 * finely enough along the track to follow it), normals turned with it.
 */
export function bendGeometry(source: BufferGeometry, bend: Bend, y0: number): BufferGeometry {
  const geo = splitAlong(source, 1);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const [wx, wz] = bend.point(pos.getX(i), z);
    if (nor) {
      const h = bend.heading(z);
      const c = Math.cos(h);
      const sn = Math.sin(h);
      const nx = nor.getX(i);
      const nz = nor.getZ(i);
      nor.setXYZ(i, nx * c + nz * sn, nor.getY(i), -nx * sn + nz * c);
    }
    pos.setXYZ(i, wx, y0 + pos.getY(i), wz);
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
