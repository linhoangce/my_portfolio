"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { stations } from "@/data";

import type { Season, Weather } from "./lookTypes";
import { useTrain } from "./store";
import { CROSSOVERS, LEN, stationS } from "./track";

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
