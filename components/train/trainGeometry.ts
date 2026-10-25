/**
 * The 2100 car body as three geometries sharing one superellipse cross-section: the body (roof and lower sides), the
 * panoramic glass band between them (and, on a style that has one, the canopy glazing over its nose), and the glowing
 * strips (the light line, and any others a style adds). The end cars taper into a nose. The style sets the section, the
 * nose, the glass and the finish: the pearl car here, the Expo's and the Millennium's in liveries.ts. Each section is
 * swept along z with more rings near the ends, where the nose curves.
 */
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, type Matrix4, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { BEAM } from "./constants";

/**
 * The cross-section: half-width a, half-height b, centre height cy above the rail head, squareness np (> 2 squares it
 * off); its sides lean in above the waist by `tumble`, and `flutes` (n of them, depth a fraction of the radius) run along
 * its lower flanks between two heights.
 */
export type Section = { a: number; b: number; cy: number; np: number; tumble?: number; flutes?: { n: number; depth: number; lo: number; hi: number } };
export const NOSE = 3.8;

/** The point at angle th round a section, about its middle. */
function point(S: Section, th: number): [number, number] {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const f = Math.sign(s) * Math.pow(Math.abs(s), 2 / S.np);
  let x = S.a * Math.sign(c) * Math.pow(Math.abs(c), 2 / S.np);
  let y = S.b * f;
  if (S.tumble && f > 0) x *= 1 - S.tumble * Math.pow(f, 1.3);
  const fl = S.flutes;
  if (fl && f > fl.lo && f < fl.hi) {
    const k = 1 - fl.depth * 0.5 * (1 - Math.cos(((fl.hi - f) / (fl.hi - fl.lo)) * fl.n * 2 * Math.PI));
    x *= k;
    y *= k;
  }
  return [x, y];
}
/** The angle round a section (on its right side) at height f: -1 under the car, 0 its middle, 1 on its roof. */
const angleAt = (S: Section, f: number) => Math.asin(Math.sign(f) * Math.pow(Math.min(1, Math.abs(f)), S.np / 2));
/** The height (as angleAt) at angle th round a section. */
const heightAt = (S: Section, th: number) => {
  const s = Math.sin(th);
  return Math.sign(s) * Math.pow(Math.abs(s), 2 / S.np);
};

/** A section as n points round (x, y), centred on its middle; the gangway bellows follow it. */
export function sectionRing(n: number, scale: number, S: Section): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = point(S, (i / n) * Math.PI * 2);
    out.push([x * scale, y * scale]);
  }
  return out;
}

/** Where along a car a point lies: its z, and how far into the front or back nose (0 outside it, 1 at the tip). */
export type At = { z: number; front: number; back: number };
/** A car as a style's strips see it: its length, its nose's, and which ends wear one. */
export type CarSpec = { len: number; nose: number; front: boolean; back: boolean };
/** A strip along both sides, between heights lo and hi (as the section's: -1 under, 1 on the roof), from z0 to z1. */
export type Strip = { z0: number; z1: number; lo: (a: At) => number; hi: (a: At) => number; hex?: number };
/** The section's scale across and up, and how far its middle drops, at u along the nose (0 where it starts, 1 at its tip). */
export type NoseShape = { sx: number; sy: number; dy: number };
type Height = number | ((a: At) => number);
export type CarStyle = {
  section: Section;
  nose: number;
  profile: (u: number) => NoseShape;
  /** The side glass, between these heights. */
  glass: { lo: Height; hi: Height };
  /** Glazing over the nose's roof, from u0 to u1 along it (a windscreen running up over the cab). */
  canopy?: [number, number];
  /** The body's colour at height f (as a Strip's) and At on the car; without one the body carries no colours. */
  tint?: (f: number, a: At, car: CarSpec) => number;
  /** The glowing strips: the light line and any others. */
  glow: (car: CarSpec) => Strip[];
  /** Strips painted over the body in their own colours (only on a tinted body). */
  decals?: (car: CarSpec) => Strip[];
  /** The longest step between rings along the car (finer for a style whose strips curve along it). */
  step?: number;
};

const PEARL_SECTION: Section = { a: 1.5, b: 1.62, cy: 2.25, np: 3.4 };
/** The light line under the glass, as the pearl car wears it. */
const LINE_LO = heightAt(PEARL_SECTION, angleAt(PEARL_SECTION, 0.1) - 0.05);
const LINE_HI = heightAt(PEARL_SECTION, angleAt(PEARL_SECTION, 0.1) + 0.012);

/** The pearl car (the Canada Line's and the West Coast Express's): a long glass nose, one light line under the glass. */
export const PEARL: CarStyle = {
  section: PEARL_SECTION,
  nose: NOSE,
  profile: (u) => ({ sx: 1 - 0.78 * Math.pow(u, 2.3), sy: 1 - 0.5 * Math.pow(u, 1.7), dy: -0.62 * Math.pow(u, 1.4) }),
  glass: { lo: 0.1, hi: 0.86 },
  glow: ({ len }) => [{ z0: -len / 2, z1: len / 2, lo: () => LINE_LO, hi: () => LINE_HI }],
  step: 0.65,
};

/** The section's middle height and its half-width and half-height at u along a style's nose. */
export function noseSection(style: CarStyle, u: number): { cy: number; hx: number; hy: number } {
  const s = style.profile(u);
  return { cy: style.section.cy + s.dy, hx: style.section.a * s.sx, hy: style.section.b * s.sy };
}

/**
 * Half the distance between a car's bogies, which ride on the guide beam while the rigid body spans between them: at this
 * spacing a car on a curve of radius R hangs as far inside it at its middle as outside it at its ends (each len² / 16R),
 * the least it can overhang either way.
 */
export const bogieSpacing = (len: number) => len / (2 * Math.SQRT2);

/**
 * A bogie's fairing, wrapped round the guide beam it rides (constants.ts BEAM): a cheek down either side of the beam,
 * past its running face, and a cap over it reaching up into the car's skirt. In the world (x across, y up from the
 * track's frame, z along it) as the beam is, not at the cars' SLIM.
 */
export function bogieGeometry(): BufferGeometry {
  const len = 2.6;
  const inner = BEAM.half + 0.05;
  const outer = BEAM.half + 0.2;
  const lo = BEAM.top - 0.38;
  const hi = BEAM.top + 0.09;
  const cheek = (side: number) => new BoxGeometry(outer - inner, hi - lo, len).translate((side * (inner + outer)) / 2, (lo + hi) / 2, 0);
  const parts = [cheek(-1), cheek(1), new BoxGeometry(2 * outer, hi - BEAM.top - 0.01, len).translate(0, (hi + BEAM.top + 0.01) / 2, 0)];
  const out = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return out;
}

const ORIGIN = new Vector3();
const UPWARD = new Vector3(0, 1, 0);
/** A bogie's matrix (into `out`): standing at `p` on its beam, its length along `ahead` (either way: it is symmetric). */
export function bogieMatrix(out: Matrix4, p: Vector3, ahead: Vector3): Matrix4 {
  return out.lookAt(ahead, ORIGIN, UPWARD).setPosition(p);
}

export type CarGeometry = { body: BufferGeometry; glass: BufferGeometry; line: BufferGeometry };

/** The body's texture coordinates run in world units: round the section (about its perimeter) and along the car. */
const SKIN_U = 1.9;
const tmpColor = new Color();

export function carGeometry(len: number, noseFront: boolean, noseBack: boolean, rings = 30, style: CarStyle = PEARL): CarGeometry {
  const { nose, section: S } = style;
  const CY = S.cy;
  // the canopies' runs along the car, each nose's
  const canopies: [number, number][] = [];
  if (style.canopy) {
    const [u0, u1] = style.canopy;
    if (noseBack) canopies.push([-len / 2 + nose - u1 * nose, -len / 2 + nose - u0 * nose]);
    if (noseFront) canopies.push([len / 2 - nose + u0 * nose, len / 2 - nose + u1 * nose]);
  }
  const open: [number, number][] = [];
  let from = -len / 2;
  for (const [a, b] of canopies) {
    open.push([from, a]);
    from = b;
  }
  open.push([from, len / 2]);
  // the rings: denser toward the ends, one at each canopy's ends, none further apart than the style's step
  const base: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const u = k / rings;
    base.push(-len / 2 + len * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)));
  }
  const step = style.step ?? 0.35;
  const fineOf = (list: number[]) => {
    const out: number[] = [];
    [...new Set(list)]
      .sort((p, q) => p - q)
      .forEach((z, i, all) => {
        if (i > 0) {
          const n = Math.ceil((z - all[i - 1]) / step - 1e-6);
          for (let k = 1; k < n; k++) out.push(all[i - 1] + ((z - all[i - 1]) * k) / n);
        }
        out.push(z);
      });
    return out;
  };
  const zs = fineOf([...base, ...canopies.flat()]);
  // the rings from z0 to z1, its ends included
  const ringsIn = (z0: number, z1: number) => fineOf([z0, ...zs.filter((z) => z > z0 + 1e-6 && z < z1 - 1e-6), z1]);
  const at = (z: number): At => ({
    z,
    front: noseFront && z > len / 2 - nose ? (z - (len / 2 - nose)) / nose : 0,
    back: noseBack && z < -len / 2 + nose ? (-len / 2 + nose - z) / nose : 0,
  });
  const flat: NoseShape = { sx: 1, sy: 1, dy: 0 };
  const shape = (a: At) => {
    const u = Math.max(a.front, a.back);
    return u > 0 ? style.profile(u) : flat;
  };
  const linear = (hex: number): [number, number, number] => {
    tmpColor.setHex(hex);
    return [tmpColor.r, tmpColor.g, tmpColor.b];
  };
  type Edge = number | ((a: At) => number);
  const edge = (e: Edge, a: At) => (typeof e === "number" ? e : e(a));
  type BandOpts = { scale?: number; uv?: "glass" | "skin" | "screen"; zl?: number[]; color?: (f: number, a: At) => number };
  const band = (t0: Edge, t1: Edge, nt: number, { scale = 1, uv: uvKind, zl = zs, color }: BandOpts = {}): BufferGeometry => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    zl.forEach((z) => {
      const a = at(z);
      const s = shape(a);
      const th0 = edge(t0, a);
      const th1 = edge(t1, a);
      for (let i = 0; i <= nt; i++) {
        const th = th0 + ((th1 - th0) * i) / nt;
        const [x, y] = point(S, th);
        pos.push(x * s.sx * scale, CY + y * s.sy * scale + s.dy, z);
        // glass: the interior strip repeats 2.2 times along a car; a canopy: the strip's dark top edge (tinted glass
        // with the sky in it); the body: world units; elsewhere a plain wrap
        if (uvKind === "glass") uv.push((z / len + 0.5) * 2.2, i / nt);
        else if (uvKind === "screen") uv.push(0.5, 0.96);
        else if (uvKind === "skin") uv.push(th * SKIN_U, z);
        else uv.push(i / nt, z / len);
        if (color) col.push(...linear(color(heightAt(S, th), a)));
      }
    });
    for (let j = 0; j < zl.length - 1; j++) {
      for (let i = 0; i < nt; i++) {
        const a = j * (nt + 1) + i;
        const b = a + 1;
        const c = a + nt + 1;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    if (color) g.setAttribute("color", new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // a strip on both sides (the left the right's mirror), from its own run of rings
  const strips = (list: Strip[], opts: BandOpts, nt: number): BufferGeometry[] =>
    list.flatMap((st) => {
      const zl = ringsIn(Math.max(-len / 2, st.z0), Math.min(len / 2, st.z1));
      const lo = (a: At) => angleAt(S, st.lo(a));
      const hi = (a: At) => angleAt(S, st.hi(a));
      const o = { ...opts, zl, color: st.hex !== undefined ? () => st.hex as number : opts.color };
      return [band(lo, hi, nt, o), band((a) => Math.PI - hi(a), (a) => Math.PI - lo(a), nt, o)];
    });
  // a flat fan closing each end (the nose tip, or the gangway end behind the bellows), facing outward
  const cap = (z: number, out: 1 | -1, color?: (f: number, a: At) => number): BufferGeometry => {
    const a = at(z);
    const s = shape(a);
    const n = 32;
    const pos: number[] = [0, CY + s.dy, z];
    const col: number[] = color ? linear(color(0, a)) : [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI * 2;
      const [x, y] = point(S, th);
      pos.push(x * s.sx, CY + y * s.sy + s.dy, z);
      if (color) col.push(...linear(color(heightAt(S, th), a)));
      if (i < n) idx.push(...(out > 0 ? [0, i + 1, i + 2] : [0, i + 2, i + 1]));
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(new Array(((pos.length / 3) | 0) * 2).fill(0), 2));
    if (color) g.setAttribute("color", new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const merge = (gs: BufferGeometry[]) => {
    const out = mergeGeometries(gs, false);
    for (const g of gs) g.dispose();
    return out;
  };
  // the glass band runs between these angles on each side
  const g1 = (a: At) => angleAt(S, edge(style.glass.lo, a));
  const g2 = (a: At) => angleAt(S, edge(style.glass.hi, a));
  const car: CarSpec = { len, nose, front: noseFront, back: noseBack };
  const paint = style.tint;
  const tint = paint ? (f: number, a: At) => paint(f, a, car) : undefined;
  const skin: BandOpts = { uv: "skin", color: tint };
  // the lower body takes more steps round where flutes run along it
  const under = S.flutes ? 22 + S.flutes.n * 10 : 22;
  return {
    body: merge([
      band((a) => Math.PI - g1(a), (a) => 2 * Math.PI + g1(a), under, skin),
      ...open.map(([z0, z1]) => band(g2, (a) => Math.PI - g2(a), 10, { ...skin, zl: ringsIn(z0, z1) })),
      cap(len / 2, 1, tint),
      cap(-len / 2, -1, tint),
      ...(tint && style.decals ? strips(style.decals(car), { scale: 1.006, uv: "skin" }, 3) : []),
    ]),
    glass: merge([
      band(g1, g2, 8, { scale: 1.004, uv: "glass" }),
      band((a) => Math.PI - g2(a), (a) => Math.PI - g1(a), 8, { scale: 1.004, uv: "glass" }),
      ...canopies.map(([z0, z1]) => band(g2, (a) => Math.PI - g2(a), 10, { scale: 1.004, uv: "screen", zl: ringsIn(z0, z1) })),
    ]),
    line: merge(strips(style.glow(car), { scale: 1.012 }, 1)),
  };
}
