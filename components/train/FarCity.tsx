"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";

import { buildFarCity } from "./farCityModel";
import { Rng } from "./cityModel";
import { UP } from "./track";
import { crossGeo } from "./Trees";
import { SPECIES } from "./trees/species";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/**
 * The city past the line's end (farCityModel.ts): its buildings in the city's façade materials, two meshes per 512-unit
 * chunk plus the shared crown, dome and neon meshes; its arterials, which light up with the windows; its street trees
 * as painted cards. Chunks beyond the fog's reach are not drawn.
 */
export function FarCity({ heightAt }: { heightAt: (x: number, z: number) => number }) {
  const world = useWorld();
  const { lowEnd, buildings: B, trees } = world;
  const data = useMemo(() => buildFarCity(heightAt, lowEnd), [heightAt, lowEnd]);

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
  }, [data, B]);

  const roads = useMemo(() => {
    const mat = new MeshStandardMaterial({ color: 0x4f5359, roughness: 0.95, emissive: 0xffb866, emissiveIntensity: 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return new Mesh(data.roads, mat);
  }, [data]);

  const treeMesh = useMemo(() => {
    const rng = new Rng(9);
    const n = data.trees.length;
    const m = new InstancedMesh(crossGeo(), trees.mat, Math.max(1, n));
    const attr = new Float32Array(Math.max(1, n) * 4);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    const p = new Vector3();
    data.trees.forEach((t, i) => {
      const [w, h] = SPECIES[t.sp].size;
      q.setFromAxisAngle(UP, rng.next() * Math.PI * 2);
      m4.compose(p.set(t.x, t.y, t.z), q, sc.set(w * t.s, h * t.s * (0.9 + rng.next() * 0.25), w * t.s));
      m.setMatrixAt(i, m4);
      attr.set([t.sp, rng.next(), rng.next(), 0], i * 4);
    });
    m.geometry.setAttribute("aTree", new InstancedBufferAttribute(attr, 4));
    m.count = n;
    m.receiveShadow = true;
    return m;
  }, [data, trees]);

  useEffect(() => skipInMirror(roads, treeMesh), [roads, treeMesh]);
  useEffect(
    () => () => {
      for (const m of meshes) m.geometry.dispose();
      roads.geometry.dispose();
      (roads.material as MeshStandardMaterial).dispose();
      treeMesh.geometry.dispose();
      treeMesh.dispose();
    },
    [meshes, roads, treeMesh],
  );

  // the arterials light with the windows; chunks the fog has swallowed are not drawn
  const cullT = useRef(0);
  useFrame((state, delta) => {
    (roads.material as MeshStandardMaterial).emissiveIntensity = 0.5 * B.solid.emissiveIntensity;
    cullT.current -= delta;
    if (cullT.current > 0) return;
    cullT.current = 0.25;
    const cam = state.camera.position;
    const reach = lowEnd ? 900 : 1700;
    for (const m of chunkMeshes.current) {
      const bs = m.geometry.boundingSphere;
      if (bs) m.visible = cam.distanceTo(bs.center) - bs.radius < reach;
    }
  });

  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <primitive object={roads} />
      <primitive object={treeMesh} />
    </>
  );
}
