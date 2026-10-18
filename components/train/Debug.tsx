"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { stations } from "@/data";

import type { Season, Weather } from "./lookTypes";
import { useTrain } from "./store";
import { BLOCKERS } from "./cityModel";
import { getCityData } from "./cityData";
import { CROSSOVERS, LEN, samples, STATION_XZ, stationS } from "./track";

export type TrainDebug = {
  ready: boolean;
  frames: number;
  calls: number;
  stations: string[];
  stationS: number[];
  crossovers: number[];
  LEN: number;
  driveTo: (i: number) => void;
  jump: (i: number) => void;
  look: (season?: Season, weather?: Weather) => void;
  state: () => Record<string, unknown>;
  /** Static geometry for the headless checks: track samples, footprints, blockers, station points. */
  geometry: () => {
    samples: [number, number, number, number, number, number, number][];
    lots: { x: number; z: number; w: number; d: number; h: number }[];
    houses: { x: number; z: number; w: number; d: number }[];
    blockers: { x: number; z: number; r: number; h: number }[];
    stationXZ: [number, number][];
    stationPts: [number, number][];
  };
};

declare global {
  interface Window {
    __train?: TrainDebug;
  }
}

/** `window.__train`: a debug handle for the headless checks (frames, draw calls, simulation state, jumps). */
export function Debug() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    gl.info.autoReset = false;
    const st = useTrain.getState;
    const handle: TrainDebug = {
      ready: true,
      frames: 0,
      calls: 0,
      stations: stations.map((s) => s.id),
      stationS,
      crossovers: CROSSOVERS,
      LEN,
      driveTo: (i) => st().driveTo(i),
      jump: (i) => st().jump(i),
      look: (season, weather) => st().setLook({ season, weather, auto: false }),
      geometry: () => {
        const city = getCityData(st().env.lowEnd);
        return {
          samples: samples.map((f) => [f.p.x, f.p.y, f.p.z, f.t.x, f.t.z, f.r.x, f.r.z]),
          lots: city.lots,
          houses: city.houses.map((h) => ({ x: h.x, z: h.z, w: h.w, d: h.d })),
          blockers: BLOCKERS,
          stationXZ: STATION_XZ,
          stationPts: stationS.map((s) => {
            const i = Math.round((s / LEN) * (samples.length - 1));
            return [samples[i].p.x, samples[i].p.z];
          }),
        };
      },
      state: () => {
        const s = st();
        return {
          s: s.sim.s,
          v: s.sim.v,
          target: s.sim.target,
          travelDir: s.sim.travelDir,
          laneFrom: s.sim.laneFrom,
          laneTo: s.sim.laneTo,
          crossStart: s.sim.crossStart,
          dockedIdx: s.dockedIdx,
          dockOpen: s.dockOpen,
          season: s.season,
          weather: s.weather,
          autoLook: s.autoLook,
          cab: s.cab,
          introDone: s.introDone,
          lowEnd: s.env.lowEnd,
          quality: s.quality,
        };
      },
    };
    window.__train = handle;
    useTrain.getState().setReady(true);
    return () => {
      delete window.__train;
      useTrain.getState().setReady(false);
    };
  }, [gl]);

  // first every frame: read last frame's draw-call total, then reset the counter
  useFrame(() => {
    const h = window.__train;
    if (!h) return;
    h.frames++;
    h.calls = gl.info.render.calls;
    gl.info.reset();
  }, -1000);

  return null;
}
