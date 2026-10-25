import { create } from "zustand";

import { stations } from "@/data";

import { ASSIST_RADIUS, DRAG, LANE } from "./constants";
import { hasSidebar } from "./scene/copy";
import { type EventId, LOOK_CYCLE, type Season, SEASONS, type Weather, WEATHERS, cycleNext } from "./lookTypes";
import type { MonumentKey } from "./monumentData";

/** idle → cut (a beat) → establish (the section's copy comes in by stages) → hold (all of it shown) → exit (it goes). */
export type ScenePhase = "idle" | "cut" | "establish" | "hold" | "exit";
export type Orbit = { yaw: number; pitch: number; zoom: number };
export type UiPanel = null | "menu" | "help";

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
  /** The visitor's view: around the chase angles (yaw unbounded), around a monument. */
  orbit: Orbit & { idle: number };
  mon: Orbit;
  /** A/D or ←/→ held: −1, 0, 1. */
  held: number;
  dragging: boolean;
  /** The chase camera rides right of the train (1) unless a landmark is there (−1). */
  camSide: 1 | -1;
  camInit: boolean;
  /** The scene director's clock; the React-visible phase and stage are mirrored into the store on change. */
  film: { phase: ScenePhase; idx: number; t: number; cooldown: number; startedAt: number };
  /** Simulated seconds per real second; the headless checks raise it, the physics is sub-stepped so it stays exact. */
  warp: number;
  /** The throttle that was held when the train came out of a turning loop; ignored until released. */
  loopHold: number;
  /** Where a train turning round through a loop heads once it is back on the line. */
  afterLoop: number | null;
  /** The camera's ground position, written by the rig each frame (the oncoming train stays out of its sight when it reappears). */
  cam: [number, number];
  /** Debug only: a fixed camera (position, look target) for the headless checks. */
  freeCam: { pos: [number, number, number]; look: [number, number, number] } | null;
  /** Registered by the scene once the curve exists. */
  stationS: number[];
  LEN: number;
};

/** "loop": turning round past either end of the line, heading back to the terminus `idx`. */
export type Readout = { kind: "at"; idx: number } | { kind: "next"; idx: number; metres: number } | { kind: "loop"; idx: number } | { kind: "end" };

export type Env = { lowEnd: boolean; phone: boolean; reduced: boolean; coarse: boolean };

type LookPatch = { season?: Season; weather?: Weather; event?: EventId | null; auto?: boolean };

export type TrainState = {
  sim: Sim;
  env: Env;
  ready: boolean;
  /** How many of the scene's loading stages are in (Scene.tsx); LOAD_STAGES when the whole ride is. */
  loadStage: number;
  dockedIdx: number | null;
  /** The scene whose overlay the visitor hid (E or Esc); it stays hidden for this stay. */
  dismissed: number | null;
  /** The station overlay is on screen (owned by the director). */
  overlay: boolean;
  scenePhase: ScenePhase;
  sceneIdx: number;
  /** 0–4: kicker and title, lead, the beats, the metrics; drives the reveal. */
  sceneStage: number;
  /** false with ?film=0: arrivals open the overlay without the film. */
  filmOn: boolean;
  monument: MonumentKey | null;
  hoverMon: MonumentKey | null;
  ui: UiPanel;
  nextIdx: number | null;
  kmh: number;
  readout: Readout;
  cab: boolean;
  introDone: boolean;
  askOpen: boolean;
  textOpen: boolean;
  season: Season;
  weather: Weather;
  /** The Vancouver event the city is lit for, or none. */
  event: EventId | null;
  autoLook: boolean;
  cycleIdx: number;
  quality: { dpr: number; bloom: boolean };

  setEnv: (env: Partial<Env>) => void;
  setReady: (ready: boolean) => void;
  /** Stage n is in: let the next one start. */
  stageIn: (n: number) => void;
  /** A fresh canvas starts from the first stage. */
  resetStages: () => void;
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
  startScene: (i: number) => void;
  setPhase: (phase: ScenePhase) => void;
  endScene: () => void;
  setStage: (n: number) => void;
  showOverlay: () => void;
  hideOverlay: () => void;
  toggleOverlay: () => void;
  setFilmOn: (on: boolean) => void;
  openMonument: (key: MonumentKey) => void;
  closeMonument: () => void;
  setHoverMon: (key: MonumentKey | null) => void;
  setUi: (ui: UiPanel) => void;
  setEvent: (event: EventId | null) => void;
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
    orbit: { yaw: 0, pitch: 0, zoom: 0, idle: 0 },
    mon: { yaw: 0, pitch: 0.3, zoom: 0 },
    held: 0,
    dragging: false,
    camSide: 1,
    camInit: false,
    // the page opens on the Waterfront scene, held
    film: { phase: "hold", idx: 0, t: 0, cooldown: 0, startedAt: -10 },
    warp: 1,
    loopHold: 0,
    afterLoop: null,
    cam: [0, 0],
    freeCam: null,
    stationS: [],
    LEN: 0,
  },
  env: { lowEnd: false, phone: false, reduced: false, coarse: false },
  ready: false,
  loadStage: 0,
  dockedIdx: null,
  dismissed: null,
  overlay: false,
  scenePhase: "hold",
  sceneIdx: 0,
  sceneStage: 0,
  filmOn: true,
  monument: null,
  hoverMon: null,
  ui: null,
  nextIdx: null,
  kmh: 0,
  readout: { kind: "at", idx: 0 },
  cab: false,
  // no card over the first stop: the page opens on its scene
  introDone: true,
  askOpen: false,
  textOpen: false,
  season: LOOK_CYCLE[0][0],
  weather: LOOK_CYCLE[0][1],
  event: LOOK_CYCLE[0][2],
  autoLook: true,
  cycleIdx: 0,
  quality: { dpr: 1.75, bloom: true },

  setEnv: (env) => set((st) => ({ env: { ...st.env, ...env } })),
  setReady: (ready) => set({ ready }),
  stageIn: (n) => set((st) => ({ loadStage: Math.max(st.loadStage, n + 1) })),
  resetStages: () => set({ loadStage: 0 }),
  registerTrack: (stationS, LEN) => {
    const { sim } = get();
    sim.stationS = stationS;
    sim.LEN = LEN;
    sim.s = stationS[0];
    sim.s2 = stationS[stationS.length - 1];
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
    set({ dismissed: null, introDone: true, monument: null });
  },
  jump: (i) => {
    const { sim } = get();
    if (!sim.stationS.length) return;
    const idx = clamp(Math.trunc(i), 0, stations.length - 1);
    sim.s = sim.stationS[idx];
    sim.v = 0;
    sim.target = null;
    sim.camInit = false;
    sim.film = { phase: "idle", idx, t: 0, cooldown: 0, startedAt: -10 };
    set({ dismissed: null, monument: null, scenePhase: "idle", sceneIdx: idx, sceneStage: 0, overlay: false });
  },
  setThrottle: (t) => {
    const { sim } = get();
    // a held key repeats: only a change of throttle counts (a repeat must not cancel a turn through a loop)
    if (t === sim.throttle) return;
    sim.throttle = t;
    if (t !== 0) {
      sim.target = null;
      if (!get().introDone) set({ introDone: true });
      if (get().monument) set({ monument: null });
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
    // a little past either end, so scrolling on at a terminus runs the turning loop
    sim.target = clamp(base + delta, -2, sim.LEN + 2);
    sim.throttle = 0;
    if (!get().introDone) set({ introDone: true });
    if (get().monument) set({ monument: null });
  },
  snapTarget: () => {
    const { sim } = get();
    if (sim.target === null || !sim.stationS.length) return;
    const i = nearest(sim.stationS, sim.target);
    if (Math.abs(sim.stationS[i] - sim.target) < ASSIST_RADIUS) sim.target = sim.stationS[i];
  },
  setDocked: (idx) => {
    if (idx !== get().dockedIdx) set({ dockedIdx: idx });
  },
  setReadout: (readout, nextIdx) => set({ readout, nextIdx }),
  setKmh: (kmh) => {
    if (kmh !== get().kmh) set({ kmh });
  },
  startScene: (i) => {
    const { sim } = get();
    sim.film = { phase: "cut", idx: i, t: 0, cooldown: 0, startedAt: performance.now() };
    set({ scenePhase: "cut", sceneIdx: i, sceneStage: 0, overlay: false });
  },
  setPhase: (phase) => {
    const { sim } = get();
    sim.film.phase = phase;
    sim.film.t = 0;
    if (get().scenePhase !== phase) set({ scenePhase: phase });
  },
  endScene: () => {
    const st = get();
    const ph = st.sim.film.phase;
    if (ph === "idle" || ph === "exit") return;
    st.sim.film.cooldown = 3;
    st.setPhase("exit");
    // ended by the visitor: the scene stays ended while the train sits at this stop (the director re-arms it only on
    // a new arrival), so a zoom out or a look round is not pulled back into it
    set({ overlay: false, dismissed: st.sim.film.idx });
  },
  setStage: (n) => {
    const st = get();
    if (n === st.sceneStage) return;
    const open = n >= 1 && st.dismissed !== st.sceneIdx && st.introDone && hasSidebar(st.sceneIdx, st.filmOn);
    set({ sceneStage: n, overlay: open ? true : st.overlay });
  },
  showOverlay: () => set({ overlay: true, dismissed: null }),
  hideOverlay: () => set((st) => ({ overlay: false, dismissed: st.sceneIdx })),
  toggleOverlay: () => {
    const st = get();
    const active = st.scenePhase === "establish" || st.scenePhase === "hold" || (!st.filmOn && st.dockedIdx !== null);
    if (!active || !hasSidebar(st.sceneIdx, st.filmOn)) return;
    if (st.overlay) st.hideOverlay();
    else st.showOverlay();
  },
  setFilmOn: (filmOn) => set({ filmOn }),
  openMonument: (monument) => {
    const { sim } = get();
    sim.mon.zoom = 0;
    sim.mon.pitch = 0.3;
    set({ monument, ui: null, introDone: true });
  },
  closeMonument: () => {
    if (get().monument) set({ monument: null });
  },
  setHoverMon: (hoverMon) => {
    if (hoverMon !== get().hoverMon) set({ hoverMon });
  },
  setUi: (ui) => set({ ui }),
  setEvent: (event) => set({ event, autoLook: false }),
  dismissIntro: () => {
    if (!get().introDone) set({ introDone: true });
  },
  toggleCab: () => set((st) => ({ cab: !st.cab })),
  setAskOpen: (askOpen) => set({ askOpen }),
  setLook: ({ season, weather, event, auto }) =>
    set((st) => ({
      season: season ?? st.season,
      weather: weather ?? st.weather,
      event: event === undefined ? st.event : event,
      autoLook: auto ?? false,
    })),
  cycleSeason: () => set((st) => ({ season: cycleNext(SEASONS, st.season), autoLook: false })),
  cycleWeather: () => set((st) => ({ weather: cycleNext(WEATHERS, st.weather), autoLook: false })),
  toggleAuto: () => set((st) => ({ autoLook: !st.autoLook })),
  advanceCycle: () =>
    set((st) => {
      const cycleIdx = (st.cycleIdx + 1) % LOOK_CYCLE.length;
      const [season, weather, event] = LOOK_CYCLE[cycleIdx];
      return { cycleIdx, season, weather, event };
    }),
  setQuality: (q) => set((st) => ({ quality: { ...st.quality, ...q } })),
}));
