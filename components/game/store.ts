import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  type MissionId,
  type SectionId,
  type Vec3,
  missionById,
  missions,
  screenById,
  scoring,
  sections,
  world,
} from "@/data";

import { terrainHeight } from "./world/terrainHeight";

export type Mode = "loading" | "start" | "play" | "focus" | "menu";
export type MoveMode = "walk" | "slide" | "swim";
export type MissionStatus = "locked" | "active" | "done";

export type MissionState = {
  status: MissionStatus;
  progress: number;
  startedAt: number | null;
};

export type Settings = {
  sound: boolean;
  reducedEffects: boolean;
  easySeal: boolean;
  invertY: boolean;
};

export type Toast = { id: number; text: string; tone: "info" | "success" | "warn" };

export type TeleportRequest = { pos: Vec3; yaw: number; nonce: number };

type GameState = {
  mode: Mode;
  move: MoveMode;
  /** True while swimming below the surface; for the HUD label. */
  diving: boolean;
  /** Focus mode is shown as a full-screen overlay (narrow viewports). */
  focusOverlay: boolean;
  score: number;
  missions: Record<MissionId, MissionState>;
  activeMissionId: MissionId | null;
  unlocked: Record<SectionId, boolean>;
  focusedScreen: SectionId | null;
  /** Screen whose interact zone the penguin is standing in. */
  nearScreen: SectionId | null;
  respawn: { pos: Vec3; floeId: string | null };
  carrying: "bottle" | null;
  teleportRequest: TeleportRequest | null;
  settings: Settings;
  toast: Toast | null;
  /** Text for the aria-live region. */
  liveMessage: string;
  /** Element to return focus to when a dialog closes. */
  returnFocusTo: HTMLElement | null;

  setMode: (mode: Mode) => void;
  setMove: (move: MoveMode, diving?: boolean) => void;
  teleportToSpawn: () => void;
  addScore: (delta: number) => void;
  startMission: (id: MissionId) => void;
  advance: (id: MissionId, by?: number) => void;
  completeMission: (id: MissionId) => void;
  teleportTo: (section: SectionId) => void;
  enterFocus: (section: SectionId) => void;
  exitFocus: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  unlockAll: () => void;
  setNearScreen: (section: SectionId | null) => void;
  setRespawn: (pos: Vec3, floeId?: string | null) => void;
  toggleSetting: (key: keyof Settings) => void;
  pushToast: (text: string, tone?: Toast["tone"]) => void;
  clearToast: (id: number) => void;
  announce: (text: string) => void;
  setReturnFocus: (el: HTMLElement | null) => void;
  resetProgress: () => void;
};

const initialMissions = (): Record<MissionId, MissionState> =>
  Object.fromEntries(missions.map((m) => [m.id, { status: "locked", progress: 0, startedAt: null }])) as Record<
    MissionId,
    MissionState
  >;

const initialUnlocked = (): Record<SectionId, boolean> =>
  Object.fromEntries(sections.map((s) => [s.id, s.unlockedBy === undefined])) as Record<SectionId, boolean>;

let toastSeq = 0;
let teleportSeq = 0;

/** Camera yaw that puts the camera behind a penguin facing `penguinYaw`. */
export const cameraYawFor = (penguinYaw: number) => penguinYaw + Math.PI;

/** Standing spot in front of a screen: 2.6 m along the screen normal, dropped from just above the ground. */
export function standingSpotFor(section: SectionId): { pos: Vec3; yaw: number } {
  const screen = screenById[section];
  const nx = Math.sin(screen.yaw);
  const nz = Math.cos(screen.yaw);
  const d = 2.6;
  const x = screen.position[0] + nx * d;
  const z = screen.position[2] + nz * d;
  const ground = Math.max(terrainHeight(x, z), world.waterLevel - 0.3);
  const pos: Vec3 = [x, ground + 1.2, z];
  // Face the screen: forward = -normal; model faces +z at yaw 0, so yaw = atan2(fx, fz).
  const yaw = Math.atan2(-nx, -nz);
  return { pos, yaw };
}

export function timeBonus(elapsedSeconds: number, par: number): number {
  if (elapsedSeconds <= par) return scoring.timeBonusMax;
  const t = (elapsedSeconds - par) / par;
  return Math.max(0, Math.round(scoring.timeBonusMax * (1 - t)));
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      mode: "loading",
      move: "walk",
      diving: false,
      focusOverlay: false,
      score: 0,
      missions: initialMissions(),
      activeMissionId: null,
      unlocked: initialUnlocked(),
      focusedScreen: null,
      nearScreen: null,
      respawn: { pos: world.spawn.position, floeId: null },
      carrying: null,
      teleportRequest: null,
      settings: { sound: true, reducedEffects: false, easySeal: false, invertY: false },
      toast: null,
      liveMessage: "",
      returnFocusTo: null,

      setMode: (mode) => set({ mode }),
      setMove: (move, diving = false) => {
        const s = get();
        if (s.move !== move || s.diving !== diving) set({ move, diving });
      },
      teleportToSpawn: () => {
        teleportSeq += 1;
        set({
          teleportRequest: { pos: world.spawn.position, yaw: world.spawn.yaw, nonce: teleportSeq },
          mode: "play",
          focusedScreen: null,
          liveMessage: "Back at the spawn.",
        });
      },
      addScore: (delta) => set((s) => ({ score: Math.max(0, s.score + delta) })),

      startMission: (id) => {
        const state = get();
        const current = state.missions[id];
        if (!current || current.status !== "locked") return;
        if (state.activeMissionId && state.missions[state.activeMissionId]?.status === "active") return;
        const mission = missionById[id];
        set({
          missions: { ...state.missions, [id]: { status: "active", progress: 0, startedAt: performance.now() } },
          activeMissionId: id,
          liveMessage: `Mission started: ${mission.title}. ${mission.objectiveText}.`,
        });
        get().pushToast(`${mission.title}: ${mission.objectiveText}`, "info");
      },

      advance: (id, by = 1) => {
        const state = get();
        const current = state.missions[id];
        if (!current || current.status !== "active") return;
        const mission = missionById[id];
        const progress = current.progress + by;
        set({ missions: { ...state.missions, [id]: { ...current, progress } } });
        const target =
          mission.objective.type === "collect" ||
          mission.objective.type === "collectTagged" ||
          mission.objective.type === "herd"
            ? mission.objective.count
            : mission.objective.type === "aim"
              ? mission.objective.targets
              : 1;
        if (progress >= target) get().completeMission(id);
      },

      completeMission: (id) => {
        const state = get();
        const current = state.missions[id];
        if (!current || current.status === "done") return;
        const mission = missionById[id];
        const elapsed = current.startedAt === null ? Number.POSITIVE_INFINITY : (performance.now() - current.startedAt) / 1000;
        const bonus = current.status === "active" ? timeBonus(elapsed, mission.par) : 0;
        const base = current.status === "active" ? mission.points : 0;
        const sectionTitle = sections.find((s) => s.id === mission.section)?.title ?? mission.section;
        set({
          missions: { ...state.missions, [id]: { ...current, status: "done" } },
          activeMissionId: state.activeMissionId === id ? null : state.activeMissionId,
          unlocked: { ...state.unlocked, [mission.section]: true },
          score: Math.max(0, state.score + base + bonus),
          liveMessage: `Mission complete: ${mission.title}. ${sectionTitle} unlocked. ${base + bonus} points.`,
        });
        get().pushToast(`${mission.title} complete · +${base + bonus} · ${sectionTitle} unlocked`, "success");
      },

      teleportTo: (section) => {
        const spot = standingSpotFor(section);
        const title = sections.find((s) => s.id === section)?.title ?? section;
        teleportSeq += 1;
        set((s) => ({
          unlocked: { ...s.unlocked, [section]: true },
          teleportRequest: { ...spot, nonce: teleportSeq },
          mode: "play",
          focusedScreen: null,
          liveMessage: `Teleported to ${title}.`,
        }));
      },

      enterFocus: (section) => set({ mode: "focus", focusedScreen: section }),
      exitFocus: () => set({ mode: "play", focusedScreen: null }),
      openMenu: () => set({ mode: "menu" }),
      closeMenu: () => set({ mode: "play" }),

      unlockAll: () =>
        set({
          unlocked: Object.fromEntries(sections.map((s) => [s.id, true])) as Record<SectionId, boolean>,
        }),

      setNearScreen: (section) => {
        if (get().nearScreen !== section) set({ nearScreen: section });
      },
      setRespawn: (pos, floeId = null) => set({ respawn: { pos, floeId } }),
      toggleSetting: (key) => set((s) => ({ settings: { ...s.settings, [key]: !s.settings[key] } })),

      pushToast: (text, tone = "info") => {
        toastSeq += 1;
        set({ toast: { id: toastSeq, text, tone } });
      },
      clearToast: (id) => {
        if (get().toast?.id === id) set({ toast: null });
      },
      announce: (text) => set({ liveMessage: text }),
      setReturnFocus: (el) => set({ returnFocusTo: el }),

      resetProgress: () =>
        set({
          score: 0,
          missions: initialMissions(),
          activeMissionId: null,
          unlocked: initialUnlocked(),
        }),
    }),
    {
      name: "tide-lab",
      version: 1,
      partialize: (s) => ({
        score: s.score,
        missions: s.missions,
        unlocked: s.unlocked,
        settings: s.settings,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<GameState, "score" | "missions" | "unlocked" | "settings">>;
        const restoredMissions = initialMissions();
        for (const m of missions) {
          const saved = p.missions?.[m.id];
          if (saved?.status === "done") restoredMissions[m.id] = { status: "done", progress: saved.progress, startedAt: null };
        }
        return {
          ...current,
          score: typeof p.score === "number" ? p.score : current.score,
          missions: restoredMissions,
          unlocked: { ...current.unlocked, ...(p.unlocked ?? {}) },
          settings: { ...current.settings, ...(p.settings ?? {}) },
        };
      },
    },
  ),
);

export const missionsDone = (state: Pick<GameState, "missions">) =>
  Object.values(state.missions).filter((m) => m.status === "done").length;
