"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from "three";

import { getCityData } from "./cityData";
import { HOUSE_KINDS, houseTemplate } from "./buildings/houses";
import { UP } from "./track";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/**
 * The 2100 city: two merged meshes per 256-unit chunk (solid and glass façades from one texture array), the crown
 * lights, glass domes and neon as three shared meshes, and the houses as four instanced templates. Chunks beyond the
 * fog's reach are skipped.
 */
export function City() {
  const world = useWorld();
  const { lowEnd, buildings: B } = world;
  const data = useMemo(() => getCityData(lowEnd), [lowEnd]);

  const chunkMeshes = useRef<Mesh[]>([]);
  const meshes = useMemo(() => {
    const list: Mesh[] = [];
    const chunks: Mesh[] = [];
    for (const c of data.chunks) {
      for (const [geo, mat] of [
        [c.solid, B.solid],
        [c.glass, B.glass],
      ] as const) {
        if (!geo.attributes.position.count) continue;
        const m = new Mesh(geo, mat);
        m.castShadow = !lowEnd;
        m.receiveShadow = true;
        geo.computeBoundingSphere();
        list.push(m);
        chunks.push(m);
      }
    }
    chunkMeshes.current = chunks;
    for (const [geo, mat] of [
      [data.crownA, B.crownA],
      [data.crownB, B.crownB],
      [data.neon, B.neon],
      [data.dome, B.dome],
    ] as const) {
      if (!geo.attributes.position.count) continue;
      const m = new Mesh(geo, mat);
      if (mat === B.dome) m.renderOrder = 2;
      list.push(m);
    }
    return list;
  }, [data, B, lowEnd]);

  const houses = useMemo(
    () =>
      HOUSE_KINDS.map((kind) => {
        const list = data.houses.filter((h) => h.kind === kind);
        const geo = houseTemplate(kind);
        const n = Math.max(1, list.length);
        const wall = new Float32Array(n * 3);
        const roof = new Float32Array(n * 3);
        const m = new InstancedMesh(geo, B.house, n);
        const m4 = new Matrix4();
        const q = new Quaternion();
        const p = new Vector3();
        const s = new Vector3();
        list.forEach((h, i) => {
          q.setFromAxisAngle(UP, h.ry);
          m4.compose(p.set(h.x, h.y, h.z), q, s.set(h.sx, 1, h.sz));
          m.setMatrixAt(i, m4);
          wall.set(h.wall, i * 3);
          roof.set(h.roof, i * 3);
        });
        geo.setAttribute("aTint", new InstancedBufferAttribute(wall, 3));
        geo.setAttribute("aTint2", new InstancedBufferAttribute(roof, 3));
        m.count = list.length;
        m.castShadow = !lowEnd && kind !== "simple";
        m.receiveShadow = true;
        return m;
      }),
    [data, B, lowEnd],
  );

  // chunks the fog has swallowed are not drawn: a quarter-second check of each chunk's bounding sphere
  const cullT = useRef(0);
  useFrame((state, delta) => {
    cullT.current -= delta;
    if (cullT.current > 0) return;
    cullT.current = 0.25;
    const cam = state.camera.position;
    const reach = lowEnd ? 800 : 1600;
    for (const m of chunkMeshes.current) {
      const bs = m.geometry.boundingSphere;
      if (bs) m.visible = cam.distanceTo(bs.center) - bs.radius < reach;
    }
  });

  useEffect(
    () => {
      // the houses are low and many: the water mirrors the towers, not them
      const done = skipInMirror(...houses);
      return () => {
        done();
        for (const h of houses) {
          h.geometry.dispose();
          h.dispose();
        }
      };
    },
    [houses],
  );

  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      {houses.map((h) => (
        <primitive key={h.uuid} object={h} />
      ))}
    </>
  );
}
