import { create } from "zustand";

import { stations } from "@/data";

import { ASSIST_RADIUS, DRAG, LANE, S_MIN } from "./constants";
import { LOOK_CYCLE, type Season, SEASONS, type Weather, WEATHERS, cycleNext } from "./lookTypes";

/**
 * Hot-path numbers, mutated in place by Drive, the camera rig and the controls every frame.
 * They never trigger React renders; UI-visible values are copied into the store only when they change.
 */
export type Sim = {
  s: number;
  v: number;
  target: number | null;
  throttle: number;
  braking: boolean;
  travelDir: 1 | -1;
  laneFrom: number;
  laneTo: number;
  crossStart: number;
  /** The oncoming train. */
  s2: number;
  dwell2: number;
  yawOff: number;
  pitchOff: number;
  dragging: boolean;
  dragAxis: "drive" | "look" | null;
  camInit: boolean;
  /** Simulated seconds per real second; the headless checks raise it, the physics is sub-stepped so it stays exact. */
  warp: number;
  /** Registered by the scene once the curve exists. */
  stationS: number[];
  LEN: number;
};

export type Readout = { kind: "at"; idx: number } | { kind: "next"; idx: number; metres: number } | { kind: "end" };

export type Env = { lowEnd: boolean; phone: boolean; reduced: boolean; coarse: boolean };

type LookPatch = { season?: Season; weather?: Weather; auto?: boolean };

export type TrainState = {
  sim: Sim;
  env: Env;
  ready: boolean;
  dockedIdx: number | null;
  dismissed: number | null;
  dockOpen: boolean;
  nextIdx: number | null;
  kmh: number;
  readout: Readout;
  cab: boolean;
  introDone: boolean;
  askOpen: boolean;
  textOpen: boolean;
  season: Season;
  weather: Weather;
  autoLook: boolean;
  cycleIdx: number;
  quality: { dpr: number; bloom: boolean };

  setEnv: (env: Partial<Env>) => void;
  setReady: (ready: boolean) => void;
  registerTrack: (stationS: number[], LEN: number) => void;
  driveTo: (i: number) => void;
  jump: (i: number) => void;
  setThrottle: (t: number) => void;
  setBraking: (b: boolean) => void;
  assist: () => void;
  nudgeTarget: (delta: number) => void;
  snapTarget: () => void;
  setDocked: (idx: number | null) => void;
  setReadout: (r: Readout, next: number | null) => void;
  setKmh: (k: number) => void;
  openDock: () => void;
  closeDock: () => void;
  toggleDock: () => void;
  dismissIntro: () => void;
  toggleCab: () => void;
  setAskOpen: (open: boolean) => void;
  setLook: (patch: LookPatch) => void;
  cycleSeason: () => void;
  cycleWeather: () => void;
  toggleAuto: () => void;
  advanceCycle: () => void;
  setQuality: (q: Partial<{ dpr: number; bloom: boolean }>) => void;
};

const nearest = (stationS: number[], x: number): number => {
  let b = 0;
  for (let i = 1; i < stationS.length; i++) if (Math.abs(stationS[i] - x) < Math.abs(stationS[b] - x)) b = i;
  return b;
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const useTrain = create<TrainState>((set, get) => ({
  sim: {
    s: 0,
    v: 0,
    target: null,
    throttle: 0,
    braking: false,
    travelDir: 1,
    laneFrom: LANE,
    laneTo: LANE,
    crossStart: 0,
    s2: 0,
    dwell2: 0,
    yawOff: 0,
    pitchOff: 0,
    dragging: false,
    dragAxis: null,
    camInit: false,
    warp: 1,
    stationS: [],
    LEN: 0,
  },
  env: { lowEnd: false, phone: false, reduced: false, coarse: false },
  ready: false,
  dockedIdx: null,
  dismissed: null,
  dockOpen: false,
  nextIdx: null,
  kmh: 0,
  readout: { kind: "at", idx: 0 },
  cab: false,
  introDone: false,
  askOpen: false,
  textOpen: false,
  season: LOOK_CYCLE[0][0],
  weather: LOOK_CYCLE[0][1],
  autoLook: true,
  cycleIdx: 0,
  quality: { dpr: 1.75, bloom: true },

  setEnv: (env) => set((st) => ({ env: { ...st.env, ...env } })),
  setReady: (ready) => set({ ready }),
  registerTrack: (stationS, LEN) => {
    const { sim } = get();
    sim.stationS = stationS;
    sim.LEN = LEN;
    sim.s = stationS[0];
    sim.s2 = LEN - 60;
    sim.v = 0;
    sim.target = null;
  },
  driveTo: (i) => {
    const { sim } = get();
    if (!sim.stationS.length) return;
    const idx = clamp(Math.trunc(i), 0, stations.length - 1);
    sim.target = sim.stationS[idx];
    sim.throttle = 0;
    sim.braking = false;
    set({ dismissed: null, introDone: true });
  },
  jump: (i) => {
    const { sim } = get();
    if (!sim.stationS.length) return;
    const idx = clamp(Math.trunc(i), 0, stations.length - 1);
    sim.s = sim.stationS[idx];
    sim.v = 0;
    sim.target = null;
    sim.camInit = false;
    set({ dismissed: null });
  },
  setThrottle: (t) => {
    const { sim } = get();
    sim.throttle = t;
    if (t !== 0) {
      sim.target = null;
      if (!get().introDone) set({ introDone: true });
    }
  },
  setBraking: (b) => {
    const { sim } = get();
    sim.braking = b;
    if (b) sim.target = null;
  },
  assist: () => {
    const { sim } = get();
    if (sim.target !== null || !sim.stationS.length) return;
    const stop = sim.s + sim.v / DRAG;
    const i = nearest(sim.stationS, stop);
    if (Math.abs(sim.stationS[i] - stop) < ASSIST_RADIUS) sim.target = sim.stationS[i];
  },
  nudgeTarget: (delta) => {
    const { sim } = get();
    if (!sim.stationS.length) return;
    const base = sim.target ?? sim.s + sim.v / DRAG;
    sim.target = clamp(base + delta, S_MIN, sim.LEN - 6);
    sim.throttle = 0;
    if (!get().introDone) set({ introDone: true });
  },
  snapTarget: () => {
    const { sim } = get();
    if (sim.target === null || !sim.stationS.length) return;
    const i = nearest(sim.stationS, sim.target);
    if (Math.abs(sim.stationS[i] - sim.target) < ASSIST_RADIUS) sim.target = sim.stationS[i];
  },
  setDocked: (idx) => {
    const st = get();
    if (idx === st.dockedIdx) return;
    if (idx === null) set({ dockedIdx: null, dockOpen: false });
    else set({ dockedIdx: idx, dockOpen: st.dismissed !== idx && st.introDone });
  },
  setReadout: (readout, nextIdx) => set({ readout, nextIdx }),
  setKmh: (kmh) => {
    if (kmh !== get().kmh) set({ kmh });
  },
  openDock: () => {
    const { dockedIdx } = get();
    if (dockedIdx !== null) set({ dockOpen: true, dismissed: null });
  },
  closeDock: () => {
    const { dockedIdx } = get();
    set({ dockOpen: false, dismissed: dockedIdx });
  },
  toggleDock: () => {
    const st = get();
    if (st.dockedIdx === null) return;
    if (st.dockOpen) st.closeDock();
    else st.openDock();
  },
  dismissIntro: () => {
    if (!get().introDone) set({ introDone: true });
  },
  toggleCab: () => set((st) => ({ cab: !st.cab })),
  setAskOpen: (askOpen) => set({ askOpen }),
  setLook: ({ season, weather, auto }) =>
    set((st) => ({
      season: season ?? st.season,
      weather: weather ?? st.weather,
      autoLook: auto ?? false,
    })),
  cycleSeason: () => set((st) => ({ season: cycleNext(SEASONS, st.season), autoLook: false })),
  cycleWeather: () => set((st) => ({ weather: cycleNext(WEATHERS, st.weather), autoLook: false })),
  toggleAuto: () => set((st) => ({ autoLook: !st.autoLook })),
  advanceCycle: () =>
    set((st) => {
      const cycleIdx = (st.cycleIdx + 1) % LOOK_CYCLE.length;
      const [season, weather] = LOOK_CYCLE[cycleIdx];
      return { cycleIdx, season, weather };
    }),
  setQuality: (q) => set((st) => ({ quality: { ...st.quality, ...q } })),
}));
