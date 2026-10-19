"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, TubeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { CROSS_LEN, LANE } from "./constants";
import { CROSSOVERS, frameAt, type Frame, groundAt, LEN, makeFrame, SAMPLES, samples, smoothstep01, stationS, UP } from "./track";
import { useWorld } from "./world";

/** Extrude a closed 2D profile (lateral, vertical; counter-clockwise) along a run of track frames. */
function ribbon(profile: [number, number][], list: Frame[], closed = true): BufferGeometry {
  const n = list.length;
  const m = profile.length;
  const pos = new Float32Array(n * m * 3);
  const idx: number[] = [];
  const v = new Vector3();
  list.forEach((f, i) => {
    profile.forEach(([lat, vert], j) => {
      v.copy(f.p).addScaledVector(f.r, lat).addScaledVector(UP, vert);
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

const mirror = (profile: [number, number][]): [number, number][] => profile.map(([l, v]) => [-l, v] as [number, number]).reverse();

/** Where the platforms sit the parapets, planters and ferns give way to the station's own edge. */
const atStation = (s: number) => stationS.some((ss) => Math.abs(s - ss) < 14.5);

/**
 * The 2100 guideway: a slim white U-girder with a rounded soffit, planted troughs along both outer edges with sword
 * ferns hanging over the fascia, a violet LED line under each trough, the central walkway, reaction plates, rails and
 * scissors crossovers, carried on tapered Y piers scaled to the ground. Nine draw calls.
 */
export function Guideway() {
  const world = useWorld();
  const { mats, lowEnd } = world;

  const built = useMemo(() => {
    // every frame, or every other on low-end devices (the curve is smooth enough at twice the spacing)
    const step = lowEnd ? 2 : 1;
    const all = samples.filter((_, i) => i % step === 0 || i === samples.length - 1);
    const sOf = (i: number) => (i * step * LEN) / SAMPLES;
    const runs: Frame[][] = [];
    let run: Frame[] = [];
    all.forEach((f, i) => {
      if (atStation(sOf(i))) {
        if (run.length > 1) runs.push(run);
        run = [];
      } else run.push(f);
    });
    if (run.length > 1) runs.push(run);
    const alongRuns = (profile: [number, number][]) => mergeAll(runs.map((r) => ribbon(profile, r)));

    const soffit: [number, number][] = [
      [-3, -1.9],
      [3, -1.9],
      [5.1, -1.4],
      [6.1, -0.55],
      [6.3, 0.9],
      [6.3, 0.95],
      [-6.3, 0.95],
      [-6.3, 0.9],
      [-6.1, -0.55],
      [-5.1, -1.4],
    ];
    const parapet: [number, number][] = [
      [6.02, 0.95],
      [6.3, 0.95],
      [6.3, 1.75],
      [6.02, 1.75],
    ];
    const deck = mergeAll([ribbon(soffit, all), alongRuns(parapet), alongRuns(mirror(parapet))]);
    const trough: [number, number][] = [
      [6.3, 0.7],
      [7.4, 0.7],
      [7.4, 1.55],
      [6.3, 1.55],
    ];
    const planters = mergeAll([alongRuns(trough), alongRuns(mirror(trough))]);
    const ledStrip: [number, number][] = [
      [6.13, -0.62],
      [6.21, -0.62],
      [6.21, -0.48],
      [6.13, -0.48],
    ];
    const leds = mergeAll([ribbon(ledStrip, all), ribbon(mirror(ledStrip), all)]);
    const walk = ribbon(
      [
        [-0.9, 0.95],
        [0.9, 0.95],
        [0.9, 1.05],
        [-0.9, 1.05],
      ],
      all,
    );
    const plates = mergeAll(
      [-LANE, LANE].map((lane) =>
        ribbon(
          [
            [lane - 0.3, 0.96],
            [lane + 0.3, 0.96],
            [lane + 0.3, 1.02],
            [lane - 0.3, 1.02],
          ],
          all,
        ),
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

    const m4 = new Matrix4();
    const q = new Quaternion();
    const basis = new Matrix4();
    const z = new Vector3();
    const p = new Vector3();
    const sc = new Vector3();
    // sword ferns spilling over both troughs, facing out
    const fernStep = lowEnd ? 2.4 : 1.3;
    const fernMax = Math.floor(LEN / fernStep) * 2;
    const ferns = new InstancedMesh(new PlaneGeometry(1.5, 1.9), mats.fern, fernMax);
    const turn = new Quaternion().setFromAxisAngle(UP, Math.PI / 2);
    let k = 0;
    for (let s = 0; s < LEN && k < fernMax; s += fernStep) {
      if (atStation(s)) continue;
      frameAt(s, f);
      for (const side of [-1, 1]) {
        z.copy(f.r).cross(UP);
        basis.makeBasis(f.r.clone().multiplyScalar(side), UP, z.clone().multiplyScalar(side));
        q.setFromRotationMatrix(basis).multiply(turn);
        const r = 0.8 + (Math.sin(s * 12.9898 + side * 78.233) * 43758.5453 - Math.floor(Math.sin(s * 12.9898 + side * 78.233) * 43758.5453)) * 0.6;
        p.copy(f.p).addScaledVector(f.r, side * 7.42).addScaledVector(UP, 0.75);
        m4.compose(p, q, sc.set(r, r, r));
        ferns.setMatrixAt(k++, m4);
      }
    }
    ferns.count = k;
    // tapered Y piers every 24 units: a column to just below the soffit, two arms out to its curve
    const count = Math.floor(LEN / 24);
    const col = new InstancedMesh(new CylinderGeometry(0.85, 1.25, 1, lowEnd ? 10 : 14).translate(0, 0.5, 0), mats.girder, count);
    const arm = new InstancedMesh(new BoxGeometry(0.9, 4.4, 1.5), mats.girder, count * 2);
    const tilt = new Quaternion();
    for (let i = 0; i < count; i++) {
      frameAt(i * 24 + 12, f);
      z.copy(f.r).cross(UP);
      basis.makeBasis(f.r, UP, z);
      q.setFromRotationMatrix(basis);
      const gy = groundAt(f.p.x, f.p.z);
      const topY = f.p.y - 1.9 - 3.4;
      const h = topY - gy;
      const show = f.p.y - 1.9 - gy > 1 ? 1 : 0;
      // where the deck rides too low for the fork (the cut), a plain column under the soffit, or nothing
      const fork = h > 0.6 ? 1 : 0;
      const colTop = fork ? topY : f.p.y - 1.9;
      m4.compose(p.set(f.p.x, gy - 0.3, f.p.z), q, sc.set(show, Math.max(0.01, colTop - gy + 0.3), show));
      col.setMatrixAt(i, m4);
      for (const side of [-1, 1]) {
        // rotating about r × UP by a positive angle leans the top toward −r, so the right arm takes a negative one
        tilt.setFromAxisAngle(z.clone().normalize(), -side * 0.62);
        p.set(f.p.x, topY + 1.7, f.p.z).addScaledVector(f.r, side * 1.3);
        m4.compose(p, tilt.clone().multiply(q), sc.setScalar(show * fork));
        arm.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m4);
      }
    }
    for (const o of [col, arm]) {
      o.castShadow = !lowEnd;
      o.receiveShadow = true;
    }
    return { deck, planters, leds, walk, plates, rails, ferns, col, arm };
  }, [mats, lowEnd]);

  useEffect(
    () => () => {
      for (const g of [built.deck, built.planters, built.leds, built.walk, built.plates, built.rails]) g.dispose();
      for (const o of [built.ferns, built.col, built.arm]) {
        o.geometry.dispose();
        o.dispose();
      }
    },
    [built],
  );

  return (
    <>
      <mesh geometry={built.deck} material={mats.girder} castShadow={!lowEnd} receiveShadow />
      <mesh geometry={built.planters} material={mats.planter} receiveShadow />
      <mesh geometry={built.leds} material={mats.guideLed} />
      <mesh geometry={built.walk} material={mats.walk} receiveShadow />
      <mesh geometry={built.plates} material={mats.plate} receiveShadow />
      <mesh geometry={built.rails} material={mats.rail} receiveShadow />
      <primitive object={built.ferns} />
      <primitive object={built.col} />
      <primitive object={built.arm} />
    </>
  );
}
