"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

import { ACC, BRAKE, CROSS_LEN, DOCK_DIST, DOCK_V, DRAG, KMH_PER_UNIT, LANE, METRES_PER_UNIT, ONCOMING_DWELL, ONCOMING_RESEAT, ONCOMING_SPEED, S_MIN, TRAIN_LEN, VMAX } from "./constants";
import { type Readout, type Sim, useTrain } from "./store";
import { CROSSOVERS, LEN, nearestStation, stationS } from "./track";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Right-hand running: outbound on the right track, inbound on the left. A reversing train keeps its track
 * (wrong-way running, as the automated line does when single-tracking) until it reaches the next scissors
 * crossover, where it takes the diagonal across. Reversing mid-crossover rereads the same diagonal from the other end.
 */
export function updateDrive(sim: Sim, dt: number): void {
  const prevS = sim.s;
  if (sim.braking) sim.v -= clamp(sim.v, -BRAKE * dt, BRAKE * dt);
  else if (sim.throttle !== 0) sim.v += sim.throttle * ACC * dt;
  else if (sim.target !== null) {
    const d = sim.target - sim.s;
    const desired = Math.sign(d) * Math.min(VMAX, Math.sqrt(2 * BRAKE * 0.9 * Math.abs(d)));
    const dv = desired - sim.v;
    sim.v += clamp(dv, -BRAKE * dt, ACC * 1.3 * dt);
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
  if (sim.s < S_MIN) {
    sim.s = S_MIN;
    sim.v = 0;
    sim.target = null;
  }
  if (sim.s > LEN - 6) {
    sim.s = LEN - 6;
    sim.v = 0;
    sim.target = null;
  }
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
    sim.s2 = clamp(sim.s + sim.travelDir * ONCOMING_RESEAT, 40, LEN - 40);
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

/** The oncoming train: 30 u/s the other way, a 5 s dwell at each station, looping end to end. */
export function updateOncoming(sim: Sim, dt: number): void {
  const d2 = -sim.travelDir;
  if (sim.dwell2 > 0) {
    sim.dwell2 -= dt;
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
  if (sim.s2 < 40 || sim.s2 > LEN - 40) sim.s2 = d2 > 0 ? 40 : LEN - 40;
}

const sameReadout = (a: Readout, b: Readout) =>
  a.kind === b.kind && (a.kind === "end" || b.kind === "end" || (a.idx === b.idx && (a.kind !== "next" || b.kind !== "next" || a.metres === b.metres)));

/** The physics step and the UI-visible state derived from it (dock, readout, speed, next stop). */
export function Drive() {
  const lastDistAt = useRef(0);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const st = useTrain.getState();
    const { sim } = st;
    if (!sim.stationS.length) return;
    updateDrive(sim, dt);
    updateOncoming(sim, dt);

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
      if (nextIdx === null) readout = { kind: "end" };
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
