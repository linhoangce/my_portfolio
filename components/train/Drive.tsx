"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

import { ACC, BRAKE, CAR, CROSS_LEN, DOCK_DIST, DOCK_V, DRAG, KMH_PER_UNIT, LANE, LOOP_V, METRES_PER_UNIT, ONCOMING_DWELL, ONCOMING_RESEAT, ONCOMING_SPEED, TRAIN_LEN, VMAX } from "./constants";
import { stepFilm } from "./scene/director";
import { type Readout, type Sim, useTrain } from "./store";
import { CROSSOVERS, frameAt, LEN, LOOPS, makeFrame, nearestStation, stationS } from "./track";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** From the lead car's centre to the back of the last car. */
const TAIL = TRAIN_LEN - CAR / 2;

/** Step v toward a wanted speed: shedding speed at the brake rate, gaining it at the (target) acceleration rate, in either direction. */
const approach = (v: number, want: number, dt: number) => {
  const dv = want - v;
  const shedding = v !== 0 && Math.sign(dv) !== Math.sign(v) && Math.abs(want) < Math.abs(v) + 1e-9;
  return v + (shedding ? clamp(dv, -BRAKE * dt, BRAKE * dt) : clamp(dv, -ACC * 1.3 * dt, ACC * 1.3 * dt));
};

/** Where the train is relative to the turning loops: heading round one, or back on the line with its tail still in one. */
export function loopState(sim: Sim): "out" | "tail" | null {
  const far = sim.s > LEN;
  const near = sim.s < 0;
  if ((far && sim.travelDir > 0) || (near && sim.travelDir < 0)) return "out";
  const tail = sim.s - sim.travelDir * TAIL;
  return tail > LEN || tail < 0 ? "tail" : null;
}

/**
 * Right-hand running: outbound on the right track, inbound on the left. A reversing train keeps its track
 * (wrong-way running, as the automated line does when single-tracking) until it reaches the next scissors
 * crossover, where it takes the diagonal across. Reversing mid-crossover rereads the same diagonal from the other end.
 *
 * Past either end the train runs a turning loop on its own at LOOP_V and comes back on the other track, heading for
 * the terminus it just passed; until its last car is back on the line it cannot stop or reverse.
 */
export function updateDrive(sim: Sim, dt: number): void {
  const prevS = sim.s;
  if (sim.loopHold && sim.throttle !== sim.loopHold) sim.loopHold = 0;
  const throttle = sim.loopHold ? 0 : sim.throttle;
  const loop = loopState(sim);
  if (loop === "out") {
    sim.target = null;
    sim.v += clamp(sim.travelDir * LOOP_V - sim.v, -BRAKE * dt, ACC * dt);
    sim.s += sim.v * dt;
    const far = sim.s > LEN;
    const x = far ? sim.s - LEN : -sim.s;
    const L = far ? LOOPS.far.L : LOOPS.near.L;
    if (x >= L) {
      // round the loop and onto the other track: the same train, now heading back
      const e = x - L;
      sim.s = far ? LEN - e : e;
      sim.travelDir = far ? -1 : 1;
      sim.v = sim.travelDir * Math.abs(sim.v);
      sim.laneFrom = sim.laneTo = LANE * sim.travelDir;
      sim.target = sim.stationS[far ? sim.stationS.length - 1 : 0];
      // a key held through the loop would send the train straight back round it: it counts again once released
      sim.loopHold = sim.throttle;
      sim.s2 = clamp(sim.s + sim.travelDir * ONCOMING_RESEAT, stationS[0], stationS[stationS.length - 1]);
      sim.dwell2 = 0;
    }
    return;
  }
  if (loop === "tail") {
    // no braking to a stop or reversing with cars still in the loop: keep rolling back onto the line
    if (throttle * sim.travelDir > 0) sim.v += throttle * ACC * dt;
    else if (sim.target !== null && (sim.target - sim.s) * sim.travelDir > 0) {
      const d = sim.target - sim.s;
      sim.v = approach(sim.v, Math.sign(d) * Math.min(VMAX, Math.sqrt(2 * BRAKE * 0.9 * Math.abs(d))), dt);
    }
    if (sim.v * sim.travelDir < 6) sim.v = sim.travelDir * 6;
    sim.v = clamp(sim.v, -VMAX, VMAX);
    sim.s += sim.v * dt;
    return;
  }
  if (sim.braking) sim.v -= clamp(sim.v, -BRAKE * dt, BRAKE * dt);
  else if (throttle !== 0) sim.v += throttle * ACC * dt;
  else if (sim.target !== null) {
    const d = sim.target - sim.s;
    sim.v = approach(sim.v, Math.sign(d) * Math.min(VMAX, Math.sqrt(2 * BRAKE * 0.9 * Math.abs(d))), dt);
    if (Math.abs(d) < 0.12 && Math.abs(sim.v) < 1) {
      sim.s = sim.target;
      sim.v = 0;
      sim.target = null;
    }
  } else {
    sim.v -= sim.v * DRAG * dt;
    if (Math.abs(sim.v) < 0.04) sim.v = 0;
  }
  sim.v = clamp(sim.v, -VMAX, VMAX);
  sim.s += sim.v * dt;
  const want: 0 | 1 | -1 =
    sim.target !== null && Math.abs(sim.target - sim.s) > 0.5
      ? sim.target > sim.s
        ? 1
        : -1
      : Math.abs(sim.v) > 0.5
        ? sim.v > 0
          ? 1
          : -1
        : 0;
  if (want && want !== sim.travelDir) {
    if (sim.laneFrom !== sim.laneTo) {
      // mid-crossover: same diagonal, read from the other end
      sim.crossStart += sim.travelDir * CROSS_LEN;
      const t = sim.laneFrom;
      sim.laneFrom = sim.laneTo;
      sim.laneTo = t;
    }
    sim.travelDir = want;
    // the other train now comes the other way on the other track
    sim.s2 = clamp(sim.s + sim.travelDir * ONCOMING_RESEAT, stationS[0], stationS[stationS.length - 1]);
    sim.dwell2 = 0;
  }
  if (sim.laneFrom === sim.laneTo && sim.laneTo !== LANE * sim.travelDir) {
    for (const c0 of CROSSOVERS) {
      const entry = sim.travelDir > 0 ? c0 : c0 + CROSS_LEN;
      if ((prevS - entry) * sim.travelDir < 0 && (sim.s - entry) * sim.travelDir >= 0) {
        sim.laneFrom = sim.laneTo;
        sim.laneTo = LANE * sim.travelDir;
        sim.crossStart = entry;
        break;
      }
    }
  }
  if (sim.laneFrom !== sim.laneTo && (sim.s - sim.crossStart) * sim.travelDir > CROSS_LEN + TRAIN_LEN) sim.laneFrom = sim.laneTo;
}

const fo = makeFrame();
/** Within sight of the camera (the oncoming train never vanishes or appears where it can be seen). */
const seen = (sim: Sim, s: number) => {
  frameAt(s, fo);
  return Math.hypot(fo.p.x - sim.cam[0], fo.p.z - sim.cam[1]) < 300;
};

/**
 * The oncoming train: 30 u/s the other way with a 5 s dwell at each station. At the terminus it waits at the platform
 * until neither end of the line is in view, then re-enters service from the other end.
 */
export function updateOncoming(sim: Sim, dt: number): void {
  const d2 = -sim.travelDir;
  if (sim.dwell2 > 0) {
    sim.dwell2 -= dt;
    return;
  }
  const first = stationS[0];
  const last = stationS[stationS.length - 1];
  const terminus = d2 > 0 ? last : first;
  if ((sim.s2 - terminus) * d2 >= -1e-6) {
    const other = d2 > 0 ? first : last;
    sim.s2 = terminus;
    if (seen(sim, terminus) || seen(sim, other)) sim.dwell2 = 0.5;
    else {
      sim.s2 = other;
      sim.dwell2 = ONCOMING_DWELL;
    }
    return;
  }
  const before = sim.s2;
  sim.s2 += d2 * ONCOMING_SPEED * dt;
  for (const st of stationS) {
    if ((before - st) * d2 < 0 && (sim.s2 - st) * d2 >= 0) {
      sim.s2 = st;
      sim.dwell2 = ONCOMING_DWELL;
      break;
    }
  }
}

const sameReadout = (a: Readout, b: Readout) =>
  a.kind === b.kind && (a.kind === "end" || b.kind === "end" || (a.idx === b.idx && (a.kind !== "next" || b.kind !== "next" || a.metres === b.metres)));

/** The physics step, the film director on the same clock, and the UI-visible state derived from them (dock, readout, speed, next stop). */
export function Drive() {
  const lastDistAt = useRef(0);

  useFrame((state, delta) => {
    const st = useTrain.getState();
    const { sim } = st;
    if (!sim.stationS.length) return;
    // one 50 ms step per frame normally; under warp the same step repeats so the model never sees a bigger dt
    let remaining = Math.min(delta * sim.warp, 2);
    do {
      const dt = Math.min(remaining, 0.05);
      updateDrive(sim, dt);
      updateOncoming(sim, dt);
      stepFilm(useTrain.getState(), dt);
      remaining -= dt;
    } while (remaining > 1e-6);

    const ni = nearestStation(sim.s);
    const d = stationS[ni] - sim.s;
    const docked = Math.abs(d) < DOCK_DIST && Math.abs(sim.v) < DOCK_V ? ni : null;
    st.setDocked(docked);
    st.setKmh(Math.round(Math.abs(sim.v) * KMH_PER_UNIT));

    let readout: Readout;
    let nextIdx: number | null = null;
    if (docked !== null) readout = { kind: "at", idx: docked };
    else {
      const dir = sim.target !== null ? Math.sign(sim.target - sim.s) : sim.v !== 0 ? Math.sign(sim.v) : 1;
      for (let i = 0; i < stationS.length; i++) {
        const dd = (stationS[i] - sim.s) * dir;
        if (dd > 1 && (nextIdx === null || dd < (stationS[nextIdx] - sim.s) * dir)) nextIdx = i;
      }
      if (loopState(sim)) readout = { kind: "loop", idx: sim.s > stationS[stationS.length - 1] ? stationS.length - 1 : 0 };
      else if (nextIdx === null) readout = { kind: "end" };
      else {
        const metres = Math.abs(stationS[nextIdx] - sim.s) * METRES_PER_UNIT;
        readout = { kind: "next", idx: nextIdx, metres: metres >= 1000 ? Math.round(metres / 100) * 100 : Math.round(metres) };
      }
    }
    const cur = st.readout;
    const now = state.clock.elapsedTime;
    const structural = cur.kind !== readout.kind || (cur.kind !== "end" && readout.kind !== "end" && cur.idx !== readout.idx) || nextIdx !== st.nextIdx;
    if (structural || (!sameReadout(cur, readout) && now - lastDistAt.current > 0.12)) {
      lastDistAt.current = now;
      st.setReadout(readout, nextIdx);
    }
  }, -100);

  return null;
}
