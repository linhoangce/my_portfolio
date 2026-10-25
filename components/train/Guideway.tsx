"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Quaternion, TubeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { CAR, CROSS_LEN, GAP, LANE, PLATFORM_LEN } from "./constants";
import { merged } from "./merge";
import { inRailCut, railNear } from "./rail";
import { isRoad } from "./roadNetwork";
import { paint } from "./shapes";
import { CROSSOVERS, EXT_JOIN, frameAt, type Frame, groundAt, LEN, LOOPS, makeFrame, NEAR_LOOP, SAMPLES, samples, smoothstep01, stationS, UP } from "./track";
import { carGeometry } from "./trainGeometry";
import { useWorld } from "./world";
import { nearWce } from "./wce";

/**
 * Extrude a closed 2D profile (lateral, vertical; counter-clockwise) along a run of track frames; or a profile per
 * frame (as many points each), for a section that changes along the run. With `vLen`, UVs too: u round the profile
 * (0 to 1), v along the track, one unit per `vLen`.
 */
export function ribbon(shape: [number, number][] | ((i: number) => [number, number][]), list: Frame[], closed = true, vLen = 0): BufferGeometry {
  const n = list.length;
  const profileAt = typeof shape === "function" ? shape : () => shape;
  const profile = profileAt(0);
  const m = profile.length;
  const pos = new Float32Array(n * m * 3);
  const uv = vLen ? new Float32Array(n * m * 2) : null;
  const idx: number[] = [];
  const v = new Vector3();
  const round: number[] = [0];
  for (let j = 1; j < m; j++) round.push(round[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  let along = 0;
  list.forEach((f, i) => {
    if (i > 0) along += f.p.distanceTo(list[i - 1].p);
    profileAt(i).forEach(([lat, vert], j) => {
      v.copy(f.p).addScaledVector(f.r, lat).addScaledVector(UP, vert);
      pos.set([v.x, v.y, v.z], (i * m + j) * 3);
      if (uv) uv.set([round[j] / (round[m - 1] || 1), along / vLen], (i * m + j) * 2);
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
  if (uv) g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const mergeAll = (geos: BufferGeometry[]): BufferGeometry => {
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
};

export const mirror = (profile: [number, number][]): [number, number][] => profile.map(([l, v]) => [-l, v] as [number, number]).reverse();

/**
 * A track's ease off another, from 0 to 1 as u runs 0 to 1: two arcs of one radius, one each way, so it bends no
 * tighter than it must to stand that far out over that run.
 */
const ease = (u: number): number => {
  const v = Math.min(1, Math.max(0, u));
  return v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
};

/** The guideway's cross-sections (lateral, up from the rails' base), shared with the line beyond the loop (Extension.tsx). */
export const SOFFIT: [number, number][] = [
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
export const PARAPET: [number, number][] = [
  [6.02, 0.95],
  [6.3, 0.95],
  [6.3, 1.75],
  [6.02, 1.75],
];
export const TROUGH: [number, number][] = [
  [6.3, 0.7],
  [7.4, 0.7],
  [7.4, 1.55],
  [6.3, 1.55],
];
/** A clipped hedge on each planter box, rounded on top (only its visible faces). */
export const HEDGE: [number, number][] = [
  [7.3, 1.5],
  [7.34, 1.85],
  [6.85, 2.12],
  [6.36, 1.85],
  [6.4, 1.5],
];
/** The guideway's sides where a loop's two tracks part, each the outer side of its own girder (SOFFIT's points, in order). */
const PARTED: [number, number][] = [
  [-(LANE + 1.6), -1.6],
  [LANE + 1.6, -1.6],
  [LANE + 2.9, -1.0],
  [LANE + 3.5, -0.3],
  [LANE + 3.6, 0.9],
  [LANE + 3.6, 0.95],
  [-(LANE + 3.6), 0.95],
  [-(LANE + 3.6), 0.9],
  [-(LANE + 3.5), -0.3],
  [-(LANE + 2.9), -1.0],
];
export const LED_STRIP: [number, number][] = [
  [6.13, -0.62],
  [6.21, -0.62],
  [6.21, -0.48],
  [6.13, -0.48],
];

/** Where the platforms sit the parapets and planters give way to the station's own edge. */
const atStation = (s: number) => stationS.some((ss) => Math.abs(s - ss) < PLATFORM_LEN / 2 + 1);

/** The Y piers stand one every PIER_STEP along the line, the first half a step in. */
export const PIER_STEP = 24;
export const PIER_COUNT = Math.floor(LEN / PIER_STEP);
/** The column's radius at its foot and its head. */
export const PIER_R: [number, number] = [1.25, 0.85];
/**
 * Pier i: its frame (into f), the ground under it, the top of its column and the fork's arms (at topY), and whether it
 * stands at all: over the Grandview Cut the span carries on to the banks (no pier stands on the Millennium's floor),
 * and over a street to its far side.
 */
export function pierAt(i: number, f: Frame): { gy: number; topY: number; colTop: number; fork: boolean; show: boolean } {
  frameAt(i * PIER_STEP + PIER_STEP / 2, f);
  const gy = groundAt(f.p.x, f.p.z);
  const topY = f.p.y - 1.9 - 3.4;
  // where the deck rides too low for the fork (the cut), a plain column under the soffit, or nothing
  const fork = topY - gy > 0.6;
  const show = f.p.y - 1.9 - gy > 1 && !inRailCut(f.p.x, f.p.z, 1) && !isRoad(f.p.x, f.p.z, 1) && !nearWce(f.p.x, f.p.z, -2);
  return { gy, topY, colTop: fork ? topY : f.p.y - 1.9, fork, show };
}

/**
 * The 2100 guideway: a slim white U-girder with a rounded soffit, a planter box with a trimmed hedge along both outer
 * edges, a violet LED line under each, a dark track slab with sleepers under each pair of rails, the central walkway,
 * reaction plates, rails and scissors crossovers, carried on tapered Y piers scaled to the ground; a turning loop with
 * a turnback stop at each end. Fourteen draw calls.
 */
export function Guideway() {
  const world = useWorld();
  const { mats, lowEnd } = world;
  const parkedMat = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 }), []);
  useEffect(() => () => parkedMat.dispose(), [parkedMat]);

  const built = useMemo(() => {
    // every frame, or every other on low-end devices (the curve is smooth enough at twice the spacing)
    const step = lowEnd ? 2 : 1;
    const all = samples.filter((_, i) => i % step === 0 || i === samples.length - 1);
    const sOf = (i: number) => (i * step * LEN) / SAMPLES;
    // the runs between the platforms; on the left, between those and the junction too, where the line beyond the loop
    // runs alongside as one wide deck
    const runsOf = (skip: (s: number) => boolean) => {
      const out: Frame[][] = [];
      let run: Frame[] = [];
      all.forEach((f, i) => {
        if (skip(sOf(i))) {
          if (run.length > 1) out.push(run);
          run = [];
        } else run.push(f);
      });
      if (run.length > 1) out.push(run);
      return out;
    };
    const runs = runsOf(atStation);
    const atJoin = (s: number) => s > EXT_JOIN.s0 - 1;
    const runsLeft = runsOf((s) => atStation(s) || atJoin(s));
    const alongRuns = (profile: [number, number][]) => mergeAll((profile[0][0] < 0 ? runsLeft : runs).map((r) => ribbon(profile, r)));

    const deckMain = [ribbon(SOFFIT, all), alongRuns(PARAPET), alongRuns(mirror(PARAPET))];
    const plantersMain = [alongRuns(TROUGH), alongRuns(mirror(TROUGH))];
    // the hedges on every other frame: they are soft enough
    const half = (r: Frame[]) => r.filter((_, i) => i % 2 === 0 || i === r.length - 1);
    const hedgesMain = [mergeAll(runs.map((r) => ribbon(HEDGE, half(r), false, 1.6))), mergeAll(runsLeft.map((r) => ribbon(mirror(HEDGE), half(r), false, 1.6)))];
    // the track: a dark slab across the deck and sleepers under each pair of rails, top faces only
    const bedMain = [ribbon([[6.02, 0.955], [-6.02, 0.955]], all, false)];
    const sleepersMain = [-LANE, LANE].map((lane) => ribbon([[lane + 1.3, 0.96], [lane - 1.3, 0.96]], all, false, 0.65));
    const ledsMain = [ribbon(LED_STRIP, all), ribbon(mirror(LED_STRIP), all.filter((_, i) => !atJoin(sOf(i))))];
    const walkParts = [
      ribbon(
        [
          [-0.9, 0.95],
          [0.9, 0.95],
          [0.9, 1.05],
          [-0.9, 1.05],
        ],
        all,
      ),
    ];
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
    const loopHedges: BufferGeometry[] = [];
    const loopBed: BufferGeometry[] = [];
    const loopSleepers: BufferGeometry[] = [];
    const loopLeds: BufferGeometry[] = [];
    const loopPlates: BufferGeometry[] = [];
    const canopyParts: BufferGeometry[] = [];
    const paneParts: BufferGeometry[] = [];
    const platParts: BufferGeometry[] = [];
    const lampParts: BufferGeometry[] = [];
    const layover: { body: BufferGeometry[]; glass: BufferGeometry[]; line: BufferGeometry[] } = { body: [], glass: [], line: [] };
    const cars: { geo: ReturnType<typeof carGeometry> | null } = { geo: null };
    // a train of three standing out of service on a track (its frames), its middle car `at` along it (by length; by
    // default its middle), a nose at each end
    const park = (path: Frame[], at?: number) => {
      const geo = (cars.geo ??= carGeometry(CAR, true, false, lowEnd ? 14 : 22));
      const cum = [0];
      for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + path[k].p.distanceTo(path[k - 1].p));
      const mid = at ?? cum[cum.length - 1] / 2;
      const dummy = new Object3D();
      for (let k = -1; k <= 1; k++) {
        const j = cum.findIndex((c) => c >= mid + k * (CAR + GAP));
        const f = path[j < 0 ? path.length - 1 : j];
        dummy.position.copy(f.p).addScaledVector(UP, 0.98);
        dummy.lookAt(dummy.position.clone().add(f.t));
        if (k === 1) dummy.rotateY(Math.PI);
        dummy.updateMatrix();
        layover.body.push(geo.body.clone().applyMatrix4(dummy.matrix));
        layover.glass.push(geo.glass.clone().applyMatrix4(dummy.matrix));
        layover.line.push(geo.line.clone().applyMatrix4(dummy.matrix));
      }
    };
    for (const loop of [LOOPS.near, LOOPS.far]) {
      const fr = loop.samples;
      const n = fr.length;
      const tOf = (i: number) => (i / (n - 1)) * loop.L;
      const between = (a: number, b: number) => fr.filter((_, i) => tOf(i) >= a && tOf(i) <= b);
      const stop0 = loop.L / 2 - 14;
      const stop1 = loop.L / 2 + 14;
      // at Waterfront the loop is double-tracked round its circle: a layover track inside the running one, where a
      // train waits out of service, easing away from it and back over the circle's two halves (so it bends about
      // as tightly all the way round); its deck widens inward to carry it
      const [lcx, lcz] = NEAR_LOOP.c;
      const onArc = loop.end === "near" ? fr.map((f) => Math.abs(Math.hypot(f.p.x - lcx, f.p.z - lcz) - NEAR_LOOP.r) < 0.1) : [];
      const a0 = onArc.indexOf(true);
      const a1 = onArc.lastIndexOf(true);
      const arc = a0 >= 0 && a1 - a0 > 20 ? fr.slice(a0, a1 + 1) : [];
      const LAY = 5.6;
      const layAt = (k: number) => LAY * smoothstep01(Math.min(tOf(a0 + k) - tOf(a0), tOf(a1) - tOf(a0 + k)) / ((tOf(a1) - tOf(a0)) / 2));
      // the deck's inner edge on the circle
      const edge = arc.map((_, k) => 3.6 + (LAY + 0.1) * (layAt(k) / LAY));
      // where the loop's own single-track girders begin: at Waterfront where the approach's two tracks part (the
      // approach is a deck of its own, below), elsewhere at the line's end
      const [part, rejoin] = loop.split ?? [0, loop.L];
      const A = loop.approach;
      // the loop's frame at t along it
      const at = (t: number): Frame => {
        const f = makeFrame();
        loop.curve.getPointAt(t / loop.L, f.p);
        loop.curve.getTangentAt(t / loop.L, f.t).normalize();
        f.r.crossVectors(f.t, UP).normalize();
        return f;
      };
      // the girders, at Waterfront ending exactly where the approach's deck does
      const own = A ? [at(part), ...between(part + 0.01, rejoin - 0.01), at(rejoin)] : fr;
      // their inner parapets: at Waterfront from where the two girders' inner edges cross, meeting there in a point,
      // round the circle along its widened edge; elsewhere from where the necks have parted
      let inner: Frame[] = between(24, loop.L - 24);
      let innerEdge: (k: number) => number = () => 3.6;
      if (A) {
        const S = A[A.length - 1];
        const across = (f: Frame) => (f.p.x - 3.6 * f.r.x - S.p.x) * S.r.x + (f.p.z - 3.6 * f.r.z - S.p.z) * S.r.z;
        const i0 = fr.findIndex((f, i) => tOf(i) >= part && across(f) >= 0);
        const i1 = fr.findLastIndex((f, i) => tOf(i) <= rejoin && across(f) <= 0);
        // the nose's own point first and last, where the two edges meet
        const nose = (i: number, j: number): Frame => {
          const u = across(fr[j]) / (across(fr[j]) - across(fr[i]));
          return { p: fr[j].p.clone().lerp(fr[i].p, u), t: fr[j].t, r: fr[j].r };
        };
        inner = [nose(i0, i0 - 1), ...fr.slice(i0, i1 + 1), nose(i1, i1 + 1)];
        innerEdge = (k: number) => (arc.length && k - 1 + i0 >= a0 && k - 1 + i0 <= a1 ? edge[k - 1 + i0 - a0] : 3.6);
      }
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
          own,
        ),
        ribbon(
          [
            [3.32, 0.95],
            [3.6, 0.95],
            [3.6, 1.75],
            [3.32, 1.75],
          ],
          own,
        ),
        ribbon(
          (k) =>
            mirror([
              [innerEdge(k) - 0.28, 0.95],
              [innerEdge(k), 0.95],
              [innerEdge(k), 1.75],
              [innerEdge(k) - 0.28, 1.75],
            ]),
          inner,
        ),
      );
      if (arc.length) {
        // the widened deck and its bed (its parapet is the girder's inner one, above)
        loopDeck.push(
          ribbon(
            (k) => [
              [-edge[k], -1.0],
              [-3.4, -1.0],
              [-3.4, 0.94],
              [-edge[k], 0.94],
            ],
            arc,
          ),
        );
        loopBed.push(ribbon((k) => [[-3.3, 0.955], [-(edge[k] - 0.28), 0.955]], arc, false));
        // the layover track: off the running line where the circle begins, back onto it where it ends
        const lay = arc.map((f, k): Frame => ({ p: f.p.clone().addScaledVector(f.r, -layAt(k)), t: f.t, r: f.r }));
        loopSleepers.push(ribbon([[1.3, 0.96], [-1.3, 0.96]], lay, false, 0.65));
        for (const side of [-1, 1]) {
          const pts = lay.map((f) => f.p.clone().addScaledVector(f.r, side * 0.72).addScaledVector(UP, 0.98));
          tubes.push(new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), Math.ceil(pts.length * (lowEnd ? 0.7 : 1.4)), 0.07, 4, false));
        }
        // the train standing on it, at the middle of the circle
        park(lay);
      }
      if (A) {
        // the approach: the line's deck carried on round the curve from its end to where its tracks part, the
        // running tracks side by side down its middle; on the curve's inside a passing siding, off the inner running
        // track by a switch at the line's end and back on by one where the tracks part (three tracks abreast
        // between), a spare train standing on it; the deck widens on that side as it stands out (the curve's outside
        // keeps clear of the blocks there), on round columns of its own. The siding eases out over the whole curve,
        // so it bends about as tightly all the way round it, and back in on the straight.
        const cum = [0];
        for (let k = 1; k < A.length; k++) cum.push(cum[k - 1] + A[k].p.distanceTo(A[k - 1].p));
        const La = cum[cum.length - 1];
        const SIDING = 8.2;
        const EASE = 19;
        // the inside: the way the curve bends from its start
        const mid = A[Math.floor(A.length / 2)];
        const inside = Math.sign((mid.p.x - A[0].p.x) * A[0].r.x + (mid.p.z - A[0].p.z) * A[0].r.z) || -1;
        // where the curve ends: the first frame heading as the last does
        const bent = cum[A.findIndex((f) => f.t.dot(A[A.length - 1].t) > 0.99999)];
        const away = cum.map((c) => Math.min(smoothstep01(c / bent), ease((La - c) / EASE)));
        // the deck's edges: the line's where it leaves the line's end, the girders' outer ones (LANE + 3.6) where its
        // tracks part, the inside standing out with the siding; toward the parting its sides take the girders' shape
        // too (PARTED), so the one runs on into the other
        const parting = cum.map((c) => ease(1 - (La - c) / EASE));
        const V = parting.map((u) => 6.3 - (6.3 - LANE - 3.6) * u);
        const W = away.map((u, k) => V[k] + (SIDING - LANE) * u);
        const edgeOf = (l: number, k: number) => (Math.sign(l) === inside ? W[k] : V[k]);
        // the line's own sections, the inside pushed out to the widened edge
        const out = (prof: [number, number][], k: number): [number, number][] => prof.map(([l, v]) => [l + Math.sign(l) * (edgeOf(l, k) - 6.3), v]);
        loopDeck.push(
          ribbon(
            (k) =>
              SOFFIT.map(([l, v], j): [number, number] => {
                const [gl, gv] = PARTED[j];
                const a = (l * edgeOf(l, k)) / 6.3;
                return [a + (gl - a) * parting[k], v + (gv - v) * parting[k]];
              }),
            A,
          ),
          ribbon((k) => out(PARAPET, k), A),
          ribbon((k) => out(mirror(PARAPET), k), A),
        );
        loopPlanters.push(
          ribbon((k) => out(TROUGH, k), A),
          ribbon((k) => out(mirror(TROUGH), k), A),
        );
        loopHedges.push(ribbon((k) => out(HEDGE, k), A, false, 1.6), ribbon((k) => out(mirror(HEDGE), k), A, false, 1.6));
        // the LED lines step in onto the girders' sides
        const led = (prof: [number, number][], k: number): [number, number][] => out(prof, k).map(([l, v]) => [l - Math.sign(l) * (6.13 - 0.1 - LANE - 3.28) * parting[k], v]);
        loopLeds.push(
          ribbon((k) => led(LED_STRIP, k), A),
          ribbon((k) => led(mirror(LED_STRIP), k), A),
        );
        loopBed.push(
          ribbon(
            (k) => [
              [edgeOf(1, k) - 0.28, 0.955],
              [-(edgeOf(-1, k) - 0.28), 0.955],
            ],
            A,
            false,
          ),
        );
        walkParts.push(
          ribbon(
            [
              [-0.9, 0.95],
              [0.9, 0.95],
              [0.9, 1.05],
              [-0.9, 1.05],
            ],
            A,
          ),
        );
        {
          const path = A.flatMap((f, k): Frame[] => (away[k] > 0 ? [{ p: f.p.clone().addScaledVector(f.r, inside * (LANE + (SIDING - LANE) * away[k])), t: f.t, r: f.r }] : []));
          loopSleepers.push(ribbon([[1.3, 0.96], [-1.3, 0.96]], path, false, 0.65));
          loopPlates.push(
            ribbon(
              [
                [-0.3, 0.96],
                [0.3, 0.96],
                [0.3, 1.02],
                [-0.3, 1.02],
              ],
              path,
            ),
          );
          for (const rail of [-1, 1]) {
            const pts = path.map((f) => f.p.clone().addScaledVector(f.r, rail * 0.72).addScaledVector(UP, 0.98));
            tubes.push(new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), Math.ceil(pts.length * (lowEnd ? 0.7 : 1.4)), 0.07, 4, false));
          }
          // the spare train in the middle of where the siding stands clear of the running track (two thirds out)
          const clear = cum.filter((_, k) => away[k] >= 2 / 3);
          park(path, (clear[0] + clear[clear.length - 1]) / 2 - cum[away.findIndex((u) => u > 0)]);
        }
        // round columns every 14 units, a second under the siding where it stands out, none on a street or the other
        // rail
        for (let c = 7; c < La - 3; c += 14) {
          const k = cum.findIndex((v) => v >= c);
          const f = A[k];
          for (const lat of W[k] > 8 ? [0, inside * (W[k] - 3)] : [0]) {
            const x = f.p.x + f.r.x * lat;
            const z = f.p.z + f.r.z * lat;
            if (isRoad(x, z, 1) || nearWce(x, z, -2) || railNear(x, z, 2)) continue;
            const gy = groundAt(x, z);
            const h = f.p.y - 1.9 - gy;
            if (h < 0.5) continue;
            const col = new CylinderGeometry(0.85, 1.2, h + 0.3, lowEnd ? 8 : 12);
            col.deleteAttribute("uv");
            col.translate(x, gy - 0.3 + (h + 0.3) / 2, z);
            loopDeck.push(col);
          }
        }
      }
      const trough: [number, number][] = [
        [3.6, 0.7],
        [4.7, 0.7],
        [4.7, 1.55],
        [3.6, 1.55],
      ];
      const planted = A ? [[at(part), ...between(part + 0.01, stop0)], [...between(stop1, rejoin - 0.01), at(rejoin)]] : [between(0, stop0), between(stop1, loop.L)];
      loopPlanters.push(...planted.map((r) => ribbon(trough, r)));
      const loopHedge: [number, number][] = [
        [4.6, 1.5],
        [4.64, 1.85],
        [4.15, 2.12],
        [3.66, 1.85],
        [3.7, 1.5],
      ];
      loopHedges.push(...planted.map((r) => ribbon(loopHedge, r, false, 1.6)));
      loopBed.push(ribbon([[3.32, 0.955], [-3.32, 0.955]], own, false));
      loopSleepers.push(ribbon([[1.3, 0.96], [-1.3, 0.96]], fr, false, 0.65));
      loopLeds.push(
        ribbon(
          [
            [3.28, -0.62],
            [3.36, -0.62],
            [3.36, -0.48],
            [3.28, -0.48],
          ],
          own,
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
      for (let t = part + 8; t < rejoin - 4; t += 16) {
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
    if (cars.geo) for (const g of [cars.geo.body, cars.geo.glass, cars.geo.line]) g.dispose();
    const rails = mergeAll(tubes);

    const m4 = new Matrix4();
    const q = new Quaternion();
    const basis = new Matrix4();
    const z = new Vector3();
    const p = new Vector3();
    const sc = new Vector3();
    // tapered Y piers: a column to just below the soffit, two arms out to its curve
    const count = PIER_COUNT;
    const col = new InstancedMesh(new CylinderGeometry(PIER_R[1], PIER_R[0], 1, lowEnd ? 10 : 14).translate(0, 0.5, 0), mats.girder, count);
    const arm = new InstancedMesh(new BoxGeometry(0.9, 4.4, 1.5), mats.girder, count * 2);
    const tilt = new Quaternion();
    for (let i = 0; i < count; i++) {
      const pier = pierAt(i, f);
      z.copy(f.r).cross(UP);
      basis.makeBasis(f.r, UP, z);
      q.setFromRotationMatrix(basis);
      const { gy, topY, colTop } = pier;
      const show = pier.show ? 1 : 0;
      const fork = pier.fork ? 1 : 0;
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
    const hedges = mergeAll([...hedgesMain, ...loopHedges]);
    const bed = mergeAll([...bedMain, ...loopBed]);
    const sleepers = mergeAll([...sleepersMain, ...loopSleepers]);
    const leds = mergeAll([...ledsMain, ...loopLeds]);
    const plates = mergeAll([...platesMain, ...loopPlates]);
    const walk = mergeAll(walkParts);
    const canopy = mergeAll(canopyParts);
    const panes = mergeAll(paneParts);
    const plats = mergeAll(platParts);
    const lamps = mergeAll(lampParts);
    // the parked train painted into one mesh (white body, dark glass, the violet line)
    const parked = layover.body.length
      ? merged([
          ...layover.body.map((g) => ({ geo: paint(g, 0xf3f4f6) })),
          ...layover.glass.map((g) => ({ geo: paint(g, 0x2a3039) })),
          ...layover.line.map((g) => ({ geo: paint(g, 0xa78bfa) })),
        ])
      : null;
    return { deck, planters, hedges, bed, sleepers, leds, walk, plates, rails, col, arm, canopy, panes, plats, lamps, parked };
  }, [mats, lowEnd]);

  useEffect(
    () => () => {
      for (const g of [built.deck, built.planters, built.hedges, built.bed, built.sleepers, built.leds, built.walk, built.plates, built.rails, built.canopy, built.panes, built.plats, built.lamps]) g.dispose();
      built.parked?.dispose();
      for (const o of [built.col, built.arm]) {
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
      <mesh geometry={built.hedges} material={mats.hedge} castShadow={!lowEnd} receiveShadow />
      <mesh geometry={built.bed} material={mats.bed} receiveShadow />
      <mesh geometry={built.sleepers} material={mats.sleepers} receiveShadow />
      <mesh geometry={built.leds} material={mats.guideLed} />
      <mesh geometry={built.walk} material={mats.walk} receiveShadow />
      <mesh geometry={built.plates} material={mats.plate} receiveShadow />
      <mesh geometry={built.rails} material={mats.rail} receiveShadow />
      <mesh geometry={built.canopy} material={mats.canopy} castShadow={!lowEnd} />
      <mesh geometry={built.panes} material={mats.pane} />
      <mesh geometry={built.plats} material={mats.plat} receiveShadow />
      <mesh geometry={built.lamps} material={mats.lamp} />
      {built.parked ? <mesh geometry={built.parked} material={parkedMat} /> : null}
      <primitive object={built.col} />
      <primitive object={built.arm} />
    </>
  );
}
