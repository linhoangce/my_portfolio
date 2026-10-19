"use client";

import { useEffect, useMemo } from "react";
import { BufferGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { Rng } from "./cityModel";
import { getTreeData } from "./cityData";
import { UP } from "./track";
import { SPECIES } from "./trees/species";
import { useWorld } from "./world";

/** Three planes crossed at 60°, base at the origin, normals bent outward and up so a crown shades like a volume. */
function crossGeo(): BufferGeometry {
  const parts = [0, 1, 2].map((k) => {
    const p = new PlaneGeometry(1, 1, 1, 2);
    p.translate(0, 0.5, 0);
    p.rotateY((k * Math.PI) / 3);
    return p;
  });
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i) * 0.9, 0.55 + pos.getY(i) * 0.6, pos.getZ(i) * 0.9).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** Every tree in one instanced mesh: species, seed and hue in an instance attribute, season and leaf fall in the shader. */
export function Trees() {
  const world = useWorld();
  const { lowEnd, trees } = world;
  const data = useMemo(() => getTreeData(lowEnd), [lowEnd]);

  const mesh = useMemo(() => {
    const rng = new Rng(4);
    const n = data.length;
    const m = new InstancedMesh(crossGeo(), trees.mat, Math.max(1, n));
    const attr = new Float32Array(Math.max(1, n) * 4);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    const p = new Vector3();
    data.forEach((t, i) => {
      const [w, h] = SPECIES[t.sp].size;
      q.setFromAxisAngle(UP, rng.next() * Math.PI * 2);
      m4.compose(p.set(t.x, t.y, t.z), q, sc.set(w * t.s, h * t.s * (0.9 + rng.next() * 0.25), w * t.s));
      m.setMatrixAt(i, m4);
      attr.set([t.sp, rng.next(), rng.next(), 0], i * 4);
    });
    m.geometry.setAttribute("aTree", new InstancedBufferAttribute(attr, 4));
    m.count = n;
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  }, [data, trees]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.dispose();
    },
    [mesh],
  );

  return <primitive object={mesh} />;
}
