"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, TubeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { CROSS_LEN, LANE } from "./constants";
import { CROSSOVERS, frameAt, type Frame, groundAt, LEN, LOOPS, makeFrame, SAMPLES, samples, smoothstep01, stationS, UP } from "./track";
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
 * scissors crossovers, carried on tapered Y piers scaled to the ground; a turning loop with a turnback stop at each end.
 * Thirteen draw calls.
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
    const deckMain = [ribbon(soffit, all), alongRuns(parapet), alongRuns(mirror(parapet))];
    const trough: [number, number][] = [
      [6.3, 0.7],
      [7.4, 0.7],
      [7.4, 1.55],
      [6.3, 1.55],
    ];
    const plantersMain = [alongRuns(trough), alongRuns(mirror(trough))];
    const ledStrip: [number, number][] = [
      [6.13, -0.62],
      [6.21, -0.62],
      [6.21, -0.48],
      [6.13, -0.48],
    ];
    const ledsMain = [ribbon(ledStrip, all), ribbon(mirror(ledStrip), all)];
    const walk = ribbon(
      [
        [-0.9, 0.95],
        [0.9, 0.95],
        [0.9, 1.05],
        [-0.9, 1.05],
      ],
      all,
    );
    const platesMain = [-LANE, LANE].map((lane) =>
      ribbon(
        [
          [lane - 0.3, 0.96],
          [lane + 0.3, 0.96],
          [lane + 0.3, 1.02],
          [lane - 0.3, 1.02],
        ],
        all,
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

    // the turning loops: a single-track girder with parapets (the inner one starts where the two branches part), a
    // planted outer edge, rails and a reaction plate, round columns, and a turnback stop on the far side of each loop
    const loopDeck: BufferGeometry[] = [];
    const loopPlanters: BufferGeometry[] = [];
    const loopLeds: BufferGeometry[] = [];
    const loopPlates: BufferGeometry[] = [];
    const canopyParts: BufferGeometry[] = [];
    const paneParts: BufferGeometry[] = [];
    const platParts: BufferGeometry[] = [];
    const lampParts: BufferGeometry[] = [];
    for (const loop of [LOOPS.near, LOOPS.far]) {
      const fr = loop.samples;
      const n = fr.length;
      const tOf = (i: number) => (i / (n - 1)) * loop.L;
      const between = (a: number, b: number) => fr.filter((_, i) => tOf(i) >= a && tOf(i) <= b);
      const stop0 = loop.L / 2 - 14;
      const stop1 = loop.L / 2 + 14;
      loopDeck.push(
        ribbon(
          [
            [-1.6, -1.6],
            [1.6, -1.6],
            [2.9, -1.0],
            [3.5, -0.3],
            [3.6, 0.9],
            [3.6, 0.95],
            [-3.6, 0.95],
            [-3.6, 0.9],
            [-3.5, -0.3],
            [-2.9, -1.0],
          ],
          fr,
        ),
        ribbon(
          [
            [3.32, 0.95],
            [3.6, 0.95],
            [3.6, 1.75],
            [3.32, 1.75],
          ],
          fr,
        ),
        ribbon(
          mirror([
            [3.32, 0.95],
            [3.6, 0.95],
            [3.6, 1.75],
            [3.32, 1.75],
          ]),
          between(24, loop.L - 24),
        ),
      );
      const trough: [number, number][] = [
        [3.6, 0.7],
        [4.7, 0.7],
        [4.7, 1.55],
        [3.6, 1.55],
      ];
      loopPlanters.push(ribbon(trough, between(0, stop0)), ribbon(trough, between(stop1, loop.L)));
      loopLeds.push(
        ribbon(
          [
            [3.28, -0.62],
            [3.36, -0.62],
            [3.36, -0.48],
            [3.28, -0.48],
          ],
          fr,
        ),
      );
      loopPlates.push(
        ribbon(
          [
            [-0.3, 0.96],
            [0.3, 0.96],
            [0.3, 1.02],
            [-0.3, 1.02],
          ],
          fr,
        ),
      );
      for (const side of [-1, 1]) {
        const pts = fr.map((f) => f.p.clone().addScaledVector(f.r, side * 0.72).addScaledVector(UP, 0.98));
        tubes.push(new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), Math.ceil(loop.L / (lowEnd ? 3 : 1.5)), 0.07, 4, false));
      }
      // round columns every 16 units, down to the ground or the seabed
      for (let t = 8; t < loop.L - 4; t += 16) {
        const f = fr[Math.round((t / loop.L) * (n - 1))];
        const gy = groundAt(f.p.x, f.p.z);
        const h = f.p.y - 1.6 - gy;
        if (h < 0.5) continue;
        const c = new CylinderGeometry(0.7, 1.05, h + 0.3, lowEnd ? 8 : 12);
        c.deleteAttribute("uv");
        c.translate(f.p.x, gy - 0.3 + (h + 0.3) / 2, f.p.z);
        loopDeck.push(c);
      }
      // the turnback stop: a platform on the outer side under white ribs and a glass spine
      const run = between(stop0, stop1);
      platParts.push(
        ribbon(
          [
            [3.6, 0.45],
            [8.4, 0.45],
            [8.4, 1.4],
            [3.6, 1.4],
          ],
          run,
        ),
      );
      paneParts.push(
        ribbon(
          [
            [-1.4, 7.05],
            [7.4, 7.05],
            [7.4, 7.12],
            [-1.4, 7.12],
          ],
          run,
        ),
      );
      lampParts.push(
        ribbon(
          [
            [5.9, 6.8],
            [6.1, 6.8],
            [6.1, 6.88],
            [5.9, 6.88],
          ],
          run,
        ),
      );
      for (let k = 0; k < run.length; k += lowEnd ? 4 : 2) {
        const f = run[k];
        const at = (lat: number, up: number) => f.p.clone().addScaledVector(f.r, lat).addScaledVector(UP, up);
        const pts: Vector3[] = [];
        for (let j = 0; j <= 12; j++) {
          const u = j / 12;
          // an arch from the inner parapet over the track to the platform's outer edge
          const lat = -3.4 + u * 11.6;
          pts.push(at(lat, 1.4 + 5.7 * Math.sin(u * Math.PI) ** 0.7));
        }
        const rib = new TubeGeometry(new CatmullRomCurve3(pts), 16, 0.12, 5, false);
        rib.deleteAttribute("uv");
        canopyParts.push(rib);
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
    const deck = mergeAll([...deckMain, ...loopDeck]);
    const planters = mergeAll([...plantersMain, ...loopPlanters]);
    const leds = mergeAll([...ledsMain, ...loopLeds]);
    const plates = mergeAll([...platesMain, ...loopPlates]);
    const canopy = mergeAll(canopyParts);
    const panes = mergeAll(paneParts);
    const plats = mergeAll(platParts);
    const lamps = mergeAll(lampParts);
    return { deck, planters, leds, walk, plates, rails, ferns, col, arm, canopy, panes, plats, lamps };
  }, [mats, lowEnd]);

  useEffect(
    () => () => {
      for (const g of [built.deck, built.planters, built.leds, built.walk, built.plates, built.rails, built.canopy, built.panes, built.plats, built.lamps]) g.dispose();
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
      <mesh geometry={built.canopy} material={mats.canopy} castShadow={!lowEnd} />
      <mesh geometry={built.panes} material={mats.pane} />
      <mesh geometry={built.plats} material={mats.plat} receiveShadow />
      <mesh geometry={built.lamps} material={mats.lamp} />
      <primitive object={built.ferns} />
      <primitive object={built.col} />
      <primitive object={built.arm} />
    </>
  );
}
