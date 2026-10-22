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
