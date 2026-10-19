"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, InstancedMesh, Matrix4, Quaternion, TubeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { CROSS_LEN, LANE } from "./constants";
import { CROSSOVERS, frameAt, groundAt, LEN, makeFrame, SAMPLES, samples, smoothstep01, UP } from "./track";
import { useWorld } from "./world";

/** Extrude a closed 2D profile (lateral, vertical) along the track. */
function ribbon(profile: [number, number][], closed = true): BufferGeometry {
  const n = samples.length;
  const m = profile.length;
  const pos = new Float32Array(n * m * 3);
  const idx: number[] = [];
  samples.forEach((f, i) => {
    profile.forEach(([lat, vert], j) => {
      const v = f.p.clone().addScaledVector(f.r, lat).addScaledVector(UP, vert);
      pos.set([v.x, v.y, v.z], (i * m + j) * 3);
    });
    if (i < n - 1) {
      for (let j = 0; j < (closed ? m : m - 1); j++) {
        const a = i * m + j;
        const b = i * m + ((j + 1) % m);
        const c = (i + 1) * m + j;
        const d = (i + 1) * m + ((j + 1) % m);
        idx.push(a, c, b, b, c, d);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const mergeAll = (geos: BufferGeometry[]): BufferGeometry => {
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
};

/**
 * Double-track guideway like the real line: box girder with parapets, a central emergency walkway, two reaction
 * plates, two rail pairs, scissors crossovers and T piers every 24 units scaled to the ground. Six draw calls.
 */
export function Guideway() {
  const world = useWorld();
  const { mats, lowEnd } = world;

  const built = useMemo(() => {
    const deck = ribbon([
      [-6.2, -1.1],
      [6.2, -1.1],
      [6.2, 0.9],
      [6.2, 1.9],
      [5.85, 1.9],
      [5.85, 0.9],
      [-5.85, 0.9],
      [-5.85, 1.9],
      [-6.2, 1.9],
      [-6.2, 0.9],
    ]);
    const walk = ribbon([
      [-0.9, 0.9],
      [0.9, 0.9],
      [0.9, 1.04],
      [-0.9, 1.04],
    ]);
    const plates = mergeAll(
      [-LANE, LANE].map((lane) =>
        ribbon([
          [lane - 0.3, 0.96],
          [lane + 0.3, 0.96],
          [lane + 0.3, 1.02],
          [lane - 0.3, 1.02],
        ]),
      ),
    );
    // two rail pairs plus every crossover diagonal, all one rust-brown mesh
    const tubes: BufferGeometry[] = [];
    for (const lane of [-LANE, LANE]) {
      for (const side of [-1, 1]) {
        const pts = samples.map((f) => f.p.clone().addScaledVector(f.r, lane + side * 0.72).addScaledVector(UP, 0.98));
        tubes.push(new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), lowEnd ? SAMPLES / 4 : SAMPLES / 2, 0.07, 4, false));
      }
    }
    const f = makeFrame();
    for (const c0 of CROSSOVERS) {
      for (const [from, to] of [
        [LANE, -LANE],
        [-LANE, LANE],
      ]) {
        for (const side of [-1, 1]) {
          const pts: Vector3[] = [];
          for (let k = 0; k <= 30; k++) {
            const u = k / 30;
            frameAt(c0 + u * CROSS_LEN, f);
            pts.push(f.p.clone().addScaledVector(f.r, from + (to - from) * smoothstep01(u) + side * 0.72).addScaledVector(UP, 0.985));
          }
          tubes.push(new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), 60, 0.07, 5, false));
        }
      }
    }
    const rails = mergeAll(tubes);
    // piers: column + cap every 24 units, scaled per instance to reach the ground
    const count = Math.floor(LEN / 24);
    const col = new InstancedMesh(new BoxGeometry(1, 1, 1), mats.concrete, count);
    const cap = new InstancedMesh(new BoxGeometry(12.8, 1.0, 2.6), mats.concrete, count);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const basis = new Matrix4();
    const sc = new Vector3();
    const p = new Vector3();
    const zAxis = new Vector3();
    for (let i = 0; i < count; i++) {
      frameAt(i * 24 + 12, f);
      zAxis.copy(f.r).cross(UP);
      basis.makeBasis(f.r, UP, zAxis);
      q.setFromRotationMatrix(basis);
      const gy = groundAt(f.p.x, f.p.z);
      const h = f.p.y - 1.1 - gy;
      const tall = h > 1 ? 1 : 0;
      p.set(f.p.x, gy - 0.3 + (h + 0.3) / 2, f.p.z);
      sc.set(3.0 * tall, Math.max(0.01, h + 0.3), 2.6 * tall);
      m4.compose(p, q, sc);
      col.setMatrixAt(i, m4);
      p.set(f.p.x, f.p.y - 1.5, f.p.z);
      sc.set(tall, tall, tall);
      m4.compose(p, q, sc);
      cap.setMatrixAt(i, m4);
    }
    col.castShadow = cap.castShadow = !lowEnd;
    col.receiveShadow = cap.receiveShadow = true;
    return { deck, walk, plates, rails, col, cap };
  }, [mats, lowEnd]);

  useEffect(
    () => () => {
      built.deck.dispose();
      built.walk.dispose();
      built.plates.dispose();
      built.rails.dispose();
      built.col.geometry.dispose();
      built.cap.geometry.dispose();
      built.col.dispose();
      built.cap.dispose();
    },
    [built],
  );

  return (
    <>
      <mesh geometry={built.deck} material={mats.concrete} receiveShadow />
      <mesh geometry={built.walk} material={mats.walk} receiveShadow />
      <mesh geometry={built.plates} material={mats.plate} receiveShadow />
      <mesh geometry={built.rails} material={mats.rail} receiveShadow />
      <primitive object={built.col} />
      <primitive object={built.cap} />
    </>
  );
}
