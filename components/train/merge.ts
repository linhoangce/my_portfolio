import { type BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { unlit } from "./shapes";

export type Part = { geo: BufferGeometry; position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] };

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const sc = new Vector3();

/** Bake each part's transform into its geometry and merge them into one (same material), disposing the parts. */
export function merged(parts: Part[]): BufferGeometry {
  const geos = parts.map(({ geo, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }) => {
    q.setFromEuler(e.set(rotation[0], rotation[1], rotation[2]));
    m4.compose(p.set(...position), q, sc.set(...scale));
    geo.applyMatrix4(m4);
    return geo;
  });
  // an extruded body is non-indexed while spheres and boxes are indexed: merge needs one or the other
  const mixed = geos.some((g) => !g.index) && geos.some((g) => g.index);
  const same = mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
  unlit(same);
  const out = mergeGeometries(same, false);
  for (const g of geos) g.dispose();
  if (mixed) for (const g of same) if (!geos.includes(g)) g.dispose();
  return out;
}
