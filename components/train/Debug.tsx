"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { stations } from "@/data";

import type { Season, Weather } from "./lookTypes";
import { useTrain } from "./store";
import { BLOCKERS } from "./cityModel";
import { getCityData } from "./cityData";
import { CROSSOVERS, deckY, groundAt, LEN, profile, SAMPLES, samples, STATION_XZ, stationS } from "./track";
import { useWorld } from "./world";

export type TrainDebug = {
  ready: boolean;
  frames: number;
  calls: number;
  triangles: number;
  /** Debug camera: fixed position and look target until unview(). */
  view: (pos: [number, number, number], look: [number, number, number]) => void;
  unview: () => void;
  ground: (x: number, z: number) => number;
  profile: () => { s: number[]; y: number[]; cut: number[]; ground: number[]; lower: number[] };
  /** Terrain and deck checks: max grade, platform flatness, clearance, cut offset. */
  terrain: () => { maxGrade: number; maxGradeAt: number; platformSpread: number[]; minClearance: number; minClearanceAt: number; cutOffset: number };
  stations: string[];
  stationS: number[];
  crossovers: number[];
  LEN: number;
  driveTo: (i: number) => void;
  jump: (i: number) => void;
  look: (season?: Season, weather?: Weather) => void;
  warp: (k: number) => void;
  /** Current eased scene background as a hex string (theme and weather checks). */
  bg: () => string;
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
  const world = useWorld();

  useEffect(() => {
    gl.info.autoReset = false;
    const st = useTrain.getState;
    const handle: TrainDebug = {
      ready: true,
      frames: 0,
      calls: 0,
      triangles: 0,
      view: (pos, look) => {
        st().sim.freeCam = { pos, look };
      },
      unview: () => {
        st().sim.freeCam = null;
      },
      ground: (x, z) => groundAt(x, z),
      profile: () => ({ s: profile.s, y: profile.y, cut: profile.cut, ground: profile.ground, lower: profile.lower }),
      terrain: () => {
        let maxGrade = 0;
        let maxGradeAt = 0;
        let minClearance = 1e9;
        let minClearanceAt = 0;
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1].p;
          const b = samples[i].p;
          const gr = Math.abs(b.y - a.y) / Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
          if (gr > maxGrade) {
            maxGrade = gr;
            maxGradeAt = (i / SAMPLES) * LEN;
          }
          const f = samples[i];
          let g = -1e9;
          for (let lat = -7; lat <= 7; lat += 3.5) g = Math.max(g, groundAt(f.p.x + f.r.x * lat, f.p.z + f.r.z * lat));
          const c = f.p.y - 1.1 - g;
          if (c < minClearance) {
            minClearance = c;
            minClearanceAt = (i / SAMPLES) * LEN;
          }
        }
        const platformSpread = stationS.map((s0) => {
          let lo = 1e9;
          let hi = -1e9;
          for (let s = s0 - 18; s <= s0 + 18; s += 2) {
            const y = deckY(s);
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
          }
          return hi - lo;
        });
        return { maxGrade, maxGradeAt, platformSpread, minClearance, minClearanceAt, cutOffset: profile.cutOffset };
      },
      stations: stations.map((s) => s.id),
      stationS,
      crossovers: CROSSOVERS,
      LEN,
      driveTo: (i) => st().driveTo(i),
      jump: (i) => st().jump(i),
      look: (season, weather) => st().setLook({ season, weather, auto: false }),
      warp: (k) => {
        st().sim.warp = Math.max(0.1, Math.min(40, k));
      },
      bg: () => world.scene.background.getHexString(),
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
          reduced: s.env.reduced,
          phone: s.env.phone,
          warp: s.sim.warp,
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
  }, [gl, world]);

  // first every frame: read last frame's draw-call total, then reset the counter
  useFrame(() => {
    const h = window.__train;
    if (!h) return;
    h.frames++;
    h.calls = gl.info.render.calls;
    h.triangles = gl.info.render.triangles;
    gl.info.reset();
  }, -1000);

  return null;
}
