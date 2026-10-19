/**
 * Building parts on top of the mesh builders: footprints, prisms (optionally twisted, tapered and sliced), roof caps,
 * gables, hips, boxes and three.js solids. Every part routes to the solid or glass builder of the current chunk by
 * façade family, so a whole chunk stays two draw calls. Walls take their UVs from the family's bay and floor size,
 * measured from the street (yRef), so floors line up across tiers.
 */
import { BoxGeometry, type BufferGeometry, Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from "three";

import { FAMILY, type FamilyId } from "./facadeArray";
import type { GeoBuilder, Tint, V3 } from "./meshBuilder";

export type Sink = { solid: GeoBuilder; glass: GeoBuilder; crownA: GeoBuilder; crownB: GeoBuilder; dome: GeoBuilder; neon: GeoBuilder };
export type Special = "crownA" | "crownB" | "dome" | "neon";
const special = (f: string): f is Special => f === "crownA" || f === "crownB" || f === "dome" || f === "neon";
export type Poly = [number, number][];

const builderFor = (s: Sink, fam: FamilyId) => (FAMILY[fam].glass ? s.glass : s.solid);
export const WHITE: Tint = [1, 1, 1];

export const fp = {
  rect: (w: number, d: number): Poly => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]],
  chamfer: (w: number, d: number, c: number): Poly => [[-w / 2 + c, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2 + c]],
  rounded: (w: number, d: number, r: number, seg = 4): Poly => {
    const out: Poly = [];
    const cs: [number, number, number][] = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 1], [-w / 2 + r, -d / 2 + r, 2], [w / 2 - r, -d / 2 + r, 3]];
    for (const [cx, cz, q] of cs) for (let k = 0; k <= seg; k++) {
      const a = ((q + k / seg) * Math.PI) / 2;
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    return out;
  },
  ellipse: (w: number, d: number, seg = 20): Poly => Array.from({ length: seg }, (_, k) => [Math.cos((k / seg) * Math.PI * 2) * (w / 2), Math.sin((k / seg) * Math.PI * 2) * (d / 2)] as [number, number]),
  hex: (r: number): Poly => Array.from({ length: 6 }, (_, k) => [Math.cos((k / 6) * Math.PI * 2 + 0.52) * r, Math.sin((k / 6) * Math.PI * 2 + 0.52) * r] as [number, number]),
  tri: (w: number, d: number): Poly => [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]],
  L: (w: number, d: number, f: number): Poly => [[-w / 2, -d / 2], [-w / 2 + w * f, -d / 2], [-w / 2 + w * f, d / 2 - d * f], [w / 2, d / 2 - d * f], [w / 2, d / 2], [-w / 2, d / 2]],
};

/** Clockwise in (x, z) so the wall quads face outward (see `walls`). */
function clockwise(poly: Poly): Poly {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    a += x1 * z2 - x2 * z1;
  }
  return a > 0 ? [...poly].reverse() : poly;
}

export type WallOpts = { tint?: Tint; segs?: number; s0?: number; s1?: number; r0?: number; r1?: number; yRef?: number; uOff?: number; vOff?: number; curve?: (t: number) => number };

/**
 * A prism from y0 to y1 around (cx, cz), in `segs` slices: each slice scales (s0 → s1, optionally along `curve`) and
 * rotates (r0 → r1) the footprint. Returns the top ring for a cap.
 */
export function walls(sink: Sink, fam: FamilyId, poly0: Poly, cx: number, cz: number, y0: number, y1: number, o: WallOpts = {}): V3[] {
  const poly = clockwise(poly0);
  const B = builderFor(sink, fam);
  const F = FAMILY[fam];
  const tint = o.tint ?? WHITE;
  const segs = o.segs ?? 1;
  const s0 = o.s0 ?? 1;
  const s1 = o.s1 ?? 1;
  const r0 = o.r0 ?? 0;
  const r1 = o.r1 ?? r0;
  const yRef = o.yRef ?? y0;
  const uOff = o.uOff ?? 0;
  const vOff = o.vOff ?? 0;
  const per = [0];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    per.push(per[i] + Math.hypot(bx - ax, bz - az));
  }
  const ring = (k: number): V3[] => {
    const t = k / segs;
    const s = s0 + (s1 - s0) * (o.curve ? o.curve(t) : t);
    const r = r0 + (r1 - r0) * t;
    const y = y0 + (y1 - y0) * t;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    return poly.map(([x, z]) => [cx + (x * cs - z * sn) * s, y, cz + (x * sn + z * cs) * s]);
  };
  let prev = ring(0);
  for (let k = 1; k <= segs; k++) {
    const cur = ring(k);
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const ua = per[i] / (2 * F.bay) + uOff;
      const ub = per[i + 1] / (2 * F.bay) + uOff;
      const va = (prev[i][1] - yRef) / (2 * F.floor) + vOff;
      const vb = (cur[i][1] - yRef) / (2 * F.floor) + vOff;
      B.quad(prev[i], prev[j], cur[j], cur[i], [ua, va], [ub, va], [ub, vb], [ua, vb], F.layer, tint);
    }
    prev = cur;
  }
  return prev;
}

/** A flat roof over a ring, in a roof family, uvs in world units / 6. */
export function cap(sink: Sink, fam: FamilyId, ring: V3[], tint: Tint = WHITE): void {
  const B = builderFor(sink, fam);
  const L = FAMILY[fam].layer;
  const tris = ShapeUtils.triangulateShape(ring.map(([x, , z]) => new Vector2(x, z)), []);
  for (const [a, b, c] of tris) {
    const A = ring[a];
    let Bp = ring[b];
    let Cp = ring[c];
    if ((Bp[2] - A[2]) * (Cp[0] - A[0]) - (Bp[0] - A[0]) * (Cp[2] - A[2]) < 0) [Bp, Cp] = [Cp, Bp];
    B.tri(A, Bp, Cp, [A[0] / 6, A[2] / 6], [Bp[0] / 6, Bp[2] / 6], [Cp[0] / 6, Cp[2] / 6], L, tint, [0, 1, 0]);
  }
}

/** A triangle wound so its face normal points away from `centre`. */
function triOut(B: GeoBuilder, a: V3, b: V3, c: V3, ua: [number, number], ub: [number, number], uc: [number, number], layer: number, tint: Tint, centre: V3): void {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const g = [(a[0] + b[0] + c[0]) / 3 - centre[0], (a[1] + b[1] + c[1]) / 3 - centre[1], (a[2] + b[2] + c[2]) / 3 - centre[2]];
  if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] < 0) B.tri(a, c, b, ua, uc, ub, layer, tint);
  else B.tri(a, b, c, ua, ub, uc, layer, tint);
}

/** A gabled roof (ridge along local z) with its two gable-end triangles in the wall family. */
export function gable(sink: Sink, wallFam: FamilyId, roofFam: FamilyId, cx: number, cz: number, w: number, d: number, yRef: number, eave: number, pitch: number, tint: Tint, roofTint: Tint, ry = 0, over = 0.35): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const P = (x: number, y: number, z: number): V3 => [cx + x * cs - z * sn, y, cz + x * sn + z * cs];
  const hw = w / 2 + over;
  const hd = d / 2 + over;
  const top = eave + pitch;
  const centre: V3 = [cx, eave - 1, cz];
  const R = builderFor(sink, roofFam);
  const RL = FAMILY[roofFam].layer;
  const W = builderFor(sink, wallFam);
  const WF = FAMILY[wallFam];
  const slope = Math.hypot(hw, pitch) / 3;
  for (const sx of [-1, 1]) {
    const a = P(sx * hw, eave - 0.2, -hd);
    const b = P(sx * hw, eave - 0.2, hd);
    const c = P(0, top, hd);
    const e = P(0, top, -hd);
    triOut(R, a, b, c, [0, 0], [d / 3, 0], [d / 3, slope], RL, roofTint, centre);
    triOut(R, a, c, e, [0, 0], [d / 3, slope], [0, slope], RL, roofTint, centre);
  }
  for (const sz of [-1, 1]) {
    triOut(W, P(-w / 2, eave, (sz * d) / 2), P(w / 2, eave, (sz * d) / 2), P(0, top, (sz * d) / 2), [0, (eave - yRef) / (2 * WF.floor)], [w / (2 * WF.bay), (eave - yRef) / (2 * WF.floor)], [w / (4 * WF.bay), (top - yRef) / (2 * WF.floor)], WF.layer, tint, [cx, eave, cz]);
  }
}

/** A hipped roof (pyramid when square). */
export function hip(sink: Sink, roofFam: FamilyId, cx: number, cz: number, w: number, d: number, y: number, h: number, tint: Tint = WHITE, ry = 0, over = 0.4): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const P = (x: number, yy: number, z: number): V3 => [cx + x * cs - z * sn, yy, cz + x * sn + z * cs];
  const hw = w / 2 + over;
  const hd = d / 2 + over;
  const rl = Math.max(0, (d - w) / 2);
  const B = builderFor(sink, roofFam);
  const L = FAMILY[roofFam].layer;
  const A = P(-hw, y, -hd);
  const Bq = P(hw, y, -hd);
  const Cq = P(hw, y, hd);
  const D = P(-hw, y, hd);
  const T1 = P(0, y + h, -rl);
  const T2 = P(0, y + h, rl);
  const centre: V3 = [cx, y - 1, cz];
  triOut(B, A, T1, Bq, [0, 0], [w / 6, h / 3], [w / 3, 0], L, tint, centre);
  triOut(B, Cq, T2, D, [0, 0], [w / 6, h / 3], [w / 3, 0], L, tint, centre);
  triOut(B, Bq, T1, T2, [0, 0], [0, h / 3], [d / 3, h / 3], L, tint, centre);
  triOut(B, Bq, T2, Cq, [0, 0], [d / 3, h / 3], [d / 3, 0], L, tint, centre);
  triOut(B, D, T2, T1, [0, 0], [0, h / 3], [d / 3, h / 3], L, tint, centre);
  triOut(B, D, T1, A, [0, 0], [d / 3, h / 3], [d / 3, 0], L, tint, centre);
}

const m4 = new Matrix4();
const q = new Quaternion();
const sc = new Vector3();
const p = new Vector3();
const UPV = new Vector3(0, 1, 0);

/** A box from y up by h, in a façade family (uvs scaled to the box) or a crown or dome builder. */
export function box(sink: Sink, fam: FamilyId | Special, x: number, y: number, z: number, w: number, h: number, d: number, tint: Tint = WHITE, ry = 0): void {
  q.setFromAxisAngle(UPV, ry);
  m4.compose(p.set(x, y + h / 2, z), q, sc.set(w, h, d));
  const g = new BoxGeometry(1, 1, 1);
  if (special(fam)) sink[fam].addGeo(g, m4, 0, tint);
  else builderFor(sink, fam).addGeo(g, m4, FAMILY[fam].layer, tint, Math.max(w, h) / 6);
}

/** Any three.js solid (sphere segment, cylinder, torus) placed with a transform. */
export function solid(sink: Sink, fam: FamilyId | Special, geo: BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint: Tint = WHITE, ry = 0): void {
  q.setFromAxisAngle(UPV, ry);
  m4.compose(p.set(x, y, z), q, sc.set(sx, sy, sz));
  if (special(fam)) sink[fam].addGeo(geo, m4, 0, tint);
  else builderFor(sink, fam).addGeo(geo, m4, FAMILY[fam].layer, tint);
}
