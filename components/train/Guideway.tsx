"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4, Quaternion, TubeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { BEAM, CROSS_LEN, FLOOR, LANE, PLATFORM_LEN, SLIM } from "./constants";
import { inRailCut, railNear } from "./rail";
import { isRoad } from "./roadNetwork";
import { CROSSOVERS, EXT_JOIN, frameAt, type Frame, groundAt, LEN, LOOPS, makeFrame, NEAR_LOOP, SAMPLES, samples, smoothstep01, stationS, UP } from "./track";
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

/**
 * A ribbon whose profile is in the guideway's first numbers, laid out across the track at SLIM of them (constants.ts):
 * the rail system's own cross-sections (the line's, the loops' and the line beyond's).
 */
export function slimRibbon(shape: [number, number][] | ((i: number) => [number, number][]), list: Frame[], closed = true, vLen = 0): BufferGeometry {
  const slim = (p: [number, number][]) => p.map(([l, v]): [number, number] => [l * SLIM, v]);
  return ribbon(typeof shape === "function" ? (i) => slim(shape(i)) : slim(shape), list, closed, vLen);
}

/**
 * A track's guide beam along a run of frames, `lane` across it (in the world; one for the run, or one per frame): its
 * white body standing on `base` (the trough's floor; or per frame) and the dark running face along its top (constants.ts BEAM).
 */
export function beam(list: Frame[], lane: number | ((i: number) => number), base: number | ((i: number) => number) = FLOOR): { body: BufferGeometry; face: BufferGeometry } {
  const at = typeof lane === "function" ? lane : () => lane;
  const foot = typeof base === "function" ? base : () => base;
  const box =
    (lo: (i: number) => number, hi: number) =>
    (i: number): [number, number][] => {
      const l = at(i);
      const [a, b, y0] = [l - BEAM.half, l + BEAM.half, lo(i)];
      // each corner twice, so every face shades flat: a squared beam, not a pipe
      return [
        [a, y0],
        [b, y0],
        [b, y0],
        [b, hi],
        [b, hi],
        [a, hi],
        [a, hi],
        [a, y0],
      ];
    };
  return { body: ribbon(box(foot, BEAM.top - BEAM.face), list), face: ribbon(box(() => BEAM.top - BEAM.face, BEAM.top), list) };
}

/** Frames through a run of points: the tangent from each point's neighbours, the right vector level. */
export function framesThrough(pts: Vector3[]): Frame[] {
  return pts.map((p, i) => {
    const t = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    return { p, t, r: new Vector3().crossVectors(t, UP).normalize() };
  });
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

/**
 * The guideway's cross-sections (lateral, up from the track's frame) in its first numbers (slimRibbon draws them),
 * shared with the line beyond the loop (Extension.tsx). The girder is a trough: its walls' tops where the deck was, the
 * beams standing on its floor (each face doubled a hair from its corners, so it shades flat).
 */
export const SOFFIT: [number, number][] = [
  [-3, -1.9],
  [3, -1.9],
  [5.1, -1.4],
  [6.1, -0.55],
  [6.3, 0.9],
  [6.3, 0.95],
  [6.02, 0.95],
  [6.02, 0.94],
  [6.02, FLOOR + 0.01],
  [6.02, FLOOR],
  [-6.02, FLOOR],
  [-6.02, FLOOR + 0.01],
  [-6.02, 0.94],
  [-6.02, 0.95],
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
/**
 * A trough section with its wall on one side (+1 right of travel, -1 left) cut down to the floor: where two decks run
 * side by side as one at the junction with the line beyond the loop, its beams crossing from the one onto the other.
 */
export const openSide = (section: [number, number][], side: 1 | -1): [number, number][] => section.map(([l, v]) => [l, Math.sign(l) === side && v >= 0.9 ? FLOOR : v]);

/** The tracks' offset in the guideway's first numbers. */
const LANE0 = LANE / SLIM;
/** The guideway's sides where a loop's two tracks part, each the outer side of its own girder (SOFFIT's points, in order). */
const PARTED: [number, number][] = [
  [-(LANE0 + 1.6), -1.6],
  [LANE0 + 1.6, -1.6],
  [LANE0 + 2.9, -1.0],
  [LANE0 + 3.5, -0.3],
  [LANE0 + 3.6, 0.9],
  [LANE0 + 3.6, 0.95],
  [LANE0 + 3.32, 0.95],
  [LANE0 + 3.32, 0.94],
  [LANE0 + 3.32, FLOOR + 0.01],
  [LANE0 + 3.32, FLOOR],
  [-(LANE0 + 3.32), FLOOR],
  [-(LANE0 + 3.32), FLOOR + 0.01],
  [-(LANE0 + 3.32), 0.94],
  [-(LANE0 + 3.32), 0.95],
  [-(LANE0 + 3.6), 0.95],
  [-(LANE0 + 3.6), 0.9],
  [-(LANE0 + 3.5), -0.3],
  [-(LANE0 + 2.9), -1.0],
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
export const PIER_R: [number, number] = [1.1, 0.75];
/** Each fork arm's foot out from the column's axis, and its lean, so its head meets the soffit's flat underside. */
export const ARM_OUT = 1.3 * SLIM;
export const ARM_TILT = 0.5;
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
 * The 2100 guideway: a slim white trough girder with a rounded soffit, a planter box with a trimmed hedge along both
 * outer edges, a violet LED line under each, a guide beam down each track on the trough's dark floor (no rails: the
 * cars' bogies wrap round the beam), the central walkway between them and a crossover beam where trains change track,
 * carried on tapered Y piers scaled to the ground; a turning loop with a turnback stop at each end. Thirteen draw calls.
 */
export function Guideway() {
  const world = useWorld();
  const { mats, lowEnd } = world;

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
    const alongRuns = (profile: [number, number][]) => mergeAll((profile[0][0] < 0 ? runsLeft : runs).map((r) => slimRibbon(profile, r)));

    const open = openSide(SOFFIT, -1);
    const deckMain = [slimRibbon((i) => (atJoin(sOf(i)) ? open : SOFFIT), all), alongRuns(PARAPET), alongRuns(mirror(PARAPET))];
    const plantersMain = [alongRuns(TROUGH), alongRuns(mirror(TROUGH))];
    // the hedges on every other frame: they are soft enough
    const half = (r: Frame[]) => r.filter((_, i) => i % 2 === 0 || i === r.length - 1);
    const hedgesMain = [mergeAll(runs.map((r) => slimRibbon(HEDGE, half(r), false, 1.6))), mergeAll(runsLeft.map((r) => slimRibbon(mirror(HEDGE), half(r), false, 1.6)))];
    // the trough's dark floor (its top face only) and a guide beam down each track
    const bedMain = [slimRibbon([[6.02, FLOOR + 0.005], [-6.02, FLOOR + 0.005]], all, false)];
    const beams = [-LANE, LANE].map((lane) => beam(all, lane));
    for (const b of beams) deckMain.push(b.body);
    const facesMain = beams.map((b) => b.face);
    const ledsMain = [slimRibbon(LED_STRIP, all), slimRibbon(mirror(LED_STRIP), all.filter((_, i) => !atJoin(sOf(i))))];
    const walkway: [number, number][] = [
      [-0.9, FLOOR],
      [0.9, FLOOR],
      [0.9, FLOOR + 0.1],
      [-0.9, FLOOR + 0.1],
    ];
    const walkParts = [slimRibbon(walkway, all)];
    // each crossover: a beam easing off the left-hand track's onto the right-hand one's, its switches where it leaves
    // and joins them (a reversing train only ever takes it that way round or back along it, Drive.tsx)
    const f = makeFrame();
    for (const c0 of CROSSOVERS) {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 60; k++) {
        const u = k / 60;
        pts.push(frameAt(c0 + u * CROSS_LEN, f, -LANE + 2 * LANE * smoothstep01(u)).p.clone());
      }
      const b = beam(framesThrough(pts), 0);
      deckMain.push(b.body);
      facesMain.push(b.face);
    }

    // the turning loops: a single-track trough girder with parapets (the inner one starts where the two branches part),
    // a planted outer edge, its beam, round columns, and a turnback stop on the far side of each loop
    const loopDeck: BufferGeometry[] = [];
    const loopPlanters: BufferGeometry[] = [];
    const loopHedges: BufferGeometry[] = [];
    const loopBed: BufferGeometry[] = [];
    const loopLeds: BufferGeometry[] = [];
    const loopFaces: BufferGeometry[] = [];
    const canopyParts: BufferGeometry[] = [];
    const paneParts: BufferGeometry[] = [];
    const platParts: BufferGeometry[] = [];
    const lampParts: BufferGeometry[] = [];
    for (const loop of [LOOPS.near, LOOPS.far]) {
      const fr = loop.samples;
      const n = fr.length;
      const tOf = (i: number) => (i / (n - 1)) * loop.L;
      const between = (a: number, b: number) => fr.filter((_, i) => tOf(i) >= a && tOf(i) <= b);
      // the turnback stop at the loop's middle, a little shorter than a station's platform
      const stop0 = loop.L / 2 - (PLATFORM_LEN / 2 - 1.5);
      const stop1 = loop.L / 2 + (PLATFORM_LEN / 2 - 1.5);
      // at Waterfront the loop is double-tracked round its circle: a layover track inside the running one, where a
      // train can wait out of service, easing away from it and back over the circle's two halves (so it bends about
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
        const across = (f: Frame) => (f.p.x - 3.6 * SLIM * f.r.x - S.p.x) * S.r.x + (f.p.z - 3.6 * SLIM * f.r.z - S.p.z) * S.r.z;
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
      // the girder's trough has its inner wall only where the inner parapet stands: short of it the wall would stand in
      // the other branch's trough, and round Waterfront's circle the deck widens inward past it
      const innerSet = new Set(inner);
      const arcSet = new Set(arc);
      const wallUp = (k: number) => innerSet.has(own[k]) && !arcSet.has(own[k]);
      loopDeck.push(
        slimRibbon(
          (k): [number, number][] => [
            [-1.6, -1.6],
            [1.6, -1.6],
            [2.9, -1.0],
            [3.5, -0.3],
            [3.6, 0.9],
            [3.6, 0.95],
            [3.32, 0.95],
            [3.32, 0.94],
            [3.32, FLOOR + 0.01],
            [3.32, FLOOR],
            ...((wallUp(k)
              ? [
                  [-3.32, FLOOR],
                  [-3.32, FLOOR + 0.01],
                  [-3.32, 0.94],
                  [-3.32, 0.95],
                  [-3.6, 0.95],
                  [-3.6, 0.9],
                ]
              : [
                  [-3.32, FLOOR],
                  [-3.4, FLOOR],
                  [-3.5, FLOOR],
                  [-3.55, FLOOR],
                  [-3.6, FLOOR],
                  [-3.6, FLOOR - 0.05],
                ]) as [number, number][]),
            [-3.5, -0.3],
            [-2.9, -1.0],
          ],
          own,
        ),
        slimRibbon(
          [
            [3.32, 0.95],
            [3.6, 0.95],
            [3.6, 1.75],
            [3.32, 1.75],
          ],
          own,
        ),
        slimRibbon(
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
        // the widened deck, its trough's floor running on inward to its own wall under the inner parapet, and its bed
        loopDeck.push(
          slimRibbon(
            (k) => [
              [-edge[k], -1.0],
              [-3.4, -1.0],
              [-3.4, FLOOR],
              [-(edge[k] - 0.28), FLOOR],
              [-(edge[k] - 0.28), 0.94],
              [-edge[k], 0.94],
            ],
            arc,
          ),
        );
        loopBed.push(slimRibbon((k) => [[-3.3, FLOOR + 0.005], [-(edge[k] - 0.28), FLOOR + 0.005]], arc, false));
        // the layover track's beam: off the running line's where the circle begins, back onto it where it ends
        const lay = arc.map((f, k): Frame => ({ p: f.p.clone().addScaledVector(f.r, -layAt(k) * SLIM), t: f.t, r: f.r }));
        const b = beam(lay, 0);
        loopDeck.push(b.body);
        loopFaces.push(b.face);
      }
      if (A) {
        // the approach: the line's deck carried on round the curve from its end to where its tracks part, the
        // running tracks side by side down its middle, on round columns of its own
        const cum = [0];
        for (let k = 1; k < A.length; k++) cum.push(cum[k - 1] + A[k].p.distanceTo(A[k - 1].p));
        const La = cum[cum.length - 1];
        const EASE = 19;
        // the deck's edges (in the guideway's first numbers): the line's where it leaves the line's end, the girders' outer ones (LANE0 + 3.6) where its
        // tracks part; toward the parting its sides take the girders' shape too (PARTED), so the one runs on into the
        // other
        const parting = cum.map((c) => ease(1 - (La - c) / EASE));
        const V = parting.map((u) => 6.3 - (6.3 - LANE0 - 3.6) * u);
        // the line's own sections, their edges brought in to the deck's
        const out = (prof: [number, number][], k: number): [number, number][] => prof.map(([l, v]) => [l + Math.sign(l) * (V[k] - 6.3), v]);
        loopDeck.push(
          slimRibbon(
            (k) =>
              SOFFIT.map(([l, v], j): [number, number] => {
                const [gl, gv] = PARTED[j];
                const a = (l * V[k]) / 6.3;
                return [a + (gl - a) * parting[k], v + (gv - v) * parting[k]];
              }),
            A,
          ),
          slimRibbon((k) => out(PARAPET, k), A),
          slimRibbon((k) => out(mirror(PARAPET), k), A),
        );
        loopPlanters.push(
          slimRibbon((k) => out(TROUGH, k), A),
          slimRibbon((k) => out(mirror(TROUGH), k), A),
        );
        loopHedges.push(slimRibbon((k) => out(HEDGE, k), A, false, 1.6), slimRibbon((k) => out(mirror(HEDGE), k), A, false, 1.6));
        // the LED lines step in onto the girders' sides
        const led = (prof: [number, number][], k: number): [number, number][] => out(prof, k).map(([l, v]) => [l - Math.sign(l) * (6.13 - 0.1 - LANE0 - 3.28) * parting[k], v]);
        loopLeds.push(
          slimRibbon((k) => led(LED_STRIP, k), A),
          slimRibbon((k) => led(mirror(LED_STRIP), k), A),
        );
        loopBed.push(
          slimRibbon(
            (k) => [
              [V[k] - 0.28, FLOOR + 0.005],
              [-(V[k] - 0.28), FLOOR + 0.005],
            ],
            A,
            false,
          ),
        );
        walkParts.push(slimRibbon(walkway, A));
        // round columns every 14 units, none on a street or the other rail
        for (let c = 7; c < La - 3; c += 14) {
          const { x, z } = A[cum.findIndex((v) => v >= c)].p;
          if (isRoad(x, z, 1) || nearWce(x, z, -2) || railNear(x, z, 2)) continue;
          const gy = groundAt(x, z);
          const h = A[0].p.y - 1.9 - gy;
          if (h < 0.5) continue;
          const col = new CylinderGeometry(0.85, 1.2, h + 0.3, lowEnd ? 8 : 12);
          col.deleteAttribute("uv");
          col.translate(x, gy - 0.3 + (h + 0.3) / 2, z);
          loopDeck.push(col);
        }
      }
      const trough: [number, number][] = [
        [3.6, 0.7],
        [4.7, 0.7],
        [4.7, 1.55],
        [3.6, 1.55],
      ];
      const planted = A ? [[at(part), ...between(part + 0.01, stop0)], [...between(stop1, rejoin - 0.01), at(rejoin)]] : [between(0, stop0), between(stop1, loop.L)];
      loopPlanters.push(...planted.map((r) => slimRibbon(trough, r)));
      const loopHedge: [number, number][] = [
        [4.6, 1.5],
        [4.64, 1.85],
        [4.15, 2.12],
        [3.66, 1.85],
        [3.7, 1.5],
      ];
      loopHedges.push(...planted.map((r) => slimRibbon(loopHedge, r, false, 1.6)));
      loopBed.push(slimRibbon((k) => [[3.32, FLOOR + 0.005], [wallUp(k) ? -3.32 : -3.6, FLOOR + 0.005]], own, false));
      // the loop's beam, the approach's two tracks' included (out along the one, round, back along the other)
      const b = beam(fr, 0);
      loopDeck.push(b.body);
      loopFaces.push(b.face);
      loopLeds.push(
        slimRibbon(
          [
            [3.28, -0.62],
            [3.36, -0.62],
            [3.36, -0.48],
            [3.28, -0.48],
          ],
          own,
        ),
      );
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
        slimRibbon(
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
        slimRibbon(
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
        slimRibbon(
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
        const at = (lat: number, up: number) => f.p.clone().addScaledVector(f.r, lat * SLIM).addScaledVector(UP, up);
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

    const m4 = new Matrix4();
    const q = new Quaternion();
    const basis = new Matrix4();
    const z = new Vector3();
    const p = new Vector3();
    const sc = new Vector3();
    // tapered Y piers: a column to just below the soffit, two arms out to its curve
    const count = PIER_COUNT;
    const col = new InstancedMesh(new CylinderGeometry(PIER_R[1], PIER_R[0], 1, lowEnd ? 10 : 14).translate(0, 0.5, 0), mats.girder, count);
    const arm = new InstancedMesh(new BoxGeometry(0.7, 4.4, 1.5), mats.girder, count * 2);
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
        tilt.setFromAxisAngle(z.clone().normalize(), -side * ARM_TILT);
        p.set(f.p.x, topY + 1.7, f.p.z).addScaledVector(f.r, side * ARM_OUT);
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
    const leds = mergeAll([...ledsMain, ...loopLeds]);
    const faces = mergeAll([...facesMain, ...loopFaces]);
    const walk = mergeAll(walkParts);
    const canopy = mergeAll(canopyParts);
    const panes = mergeAll(paneParts);
    const plats = mergeAll(platParts);
    const lamps = mergeAll(lampParts);
    return { deck, planters, hedges, bed, leds, walk, faces, col, arm, canopy, panes, plats, lamps };
  }, [mats, lowEnd]);

  useEffect(
    () => () => {
      for (const g of [built.deck, built.planters, built.hedges, built.bed, built.leds, built.walk, built.faces, built.canopy, built.panes, built.plats, built.lamps]) g.dispose();
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
      <mesh geometry={built.leds} material={mats.guideLed} />
      <mesh geometry={built.walk} material={mats.walk} receiveShadow />
      <mesh geometry={built.faces} material={mats.plate} receiveShadow />
      <mesh geometry={built.canopy} material={mats.canopy} castShadow={!lowEnd} />
      <mesh geometry={built.panes} material={mats.pane} />
      <mesh geometry={built.plats} material={mats.plat} receiveShadow />
      <mesh geometry={built.lamps} material={mats.lamp} />
      <primitive object={built.col} />
      <primitive object={built.arm} />
    </>
  );
}
