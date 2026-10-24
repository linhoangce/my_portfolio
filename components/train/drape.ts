/** Ribbons laid on the drawn ground (streams, boardwalks, paths). Client only (three.js geometry). */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, type Vector3 } from "three";

import { surfaceAt } from "./terrain";

/** A ribbon draped on the drawn ground along a polyline, `half` wide either side of a line offset by `side`. */
export function drape(pts: Vector3[], half: number, lift: number, stride: number, side = 0, n = 220): BufferGeometry {
  const path = new CatmullRomCurve3(pts, false, "centripetal");
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAt(i / n);
    const t = path.getTangentAt(i / n);
    const rx = -t.z;
    const rz = t.x;
    for (const s of [-1, 1]) {
      const x = p.x + rx * (side + s * half);
      const z = p.z + rz * (side + s * half);
      pos.push(x, surfaceAt(x, z, stride) + lift, z);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A disc of radius r draped on the drawn ground about (x, z), `lift` over it, in rings: its vertex colour `rgb` at the
 * centre fading to black at the rim (a pool of light, drawn additively). Wound to face up.
 */
export function drapeDisc(x: number, z: number, r: number, lift: number, stride: number, rgb: [number, number, number], rings = 4, seg = 20): BufferGeometry {
  const pos: number[] = [x, surfaceAt(x, z, stride) + lift, z];
  const col: number[] = [...rgb];
  const idx: number[] = [];
  for (let k = 1; k <= rings; k++) {
    const rr = (r * k) / rings;
    // brightest under the piece, falling off smoothly to nothing at the rim
    const f = (1 - k / rings) ** 1.6;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      pos.push(px, surfaceAt(px, pz, stride) + lift, pz);
      col.push(rgb[0] * f, rgb[1] * f, rgb[2] * f);
    }
  }
  const ring = (k: number, i: number) => (k === 0 ? 0 : 1 + (k - 1) * seg + (i % seg));
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < seg; i++) {
      // (centre, next, this) faces up: each triangle wound from the inner ring to the next point round the outer one
      if (k === 0) idx.push(0, ring(1, i + 1), ring(1, i));
      else idx.push(ring(k, i), ring(k + 1, i + 1), ring(k + 1, i), ring(k, i), ring(k, i + 1), ring(k + 1, i + 1));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
