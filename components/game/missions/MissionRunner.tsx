"use client";

import { useEffect } from "react";

import { missionById, missions, screens, scoring } from "@/data";
import { MISSIONS } from "../constants";
import { useGame } from "../store";
import { type GameEvent, subscribe, zonesOf } from "./events";

const enabled = new Set<string>(MISSIONS.enabled);
const screenByZone = new Map(screens.map((s) => [s.zone, s.id]));

/** Entering a zone can start a mission from its start zone or complete a `reach` objective. */
function onZoneEnter(zone: string) {
  const state = useGame.getState();
  if (state.mode !== "play") return;

  if (!state.activeMissionId) {
    for (const mission of missions) {
      if (mission.startZone !== zone || !enabled.has(mission.id)) continue;
      if (state.missions[mission.id].status !== "locked") continue;
      state.startMission(mission.id);
      break;
    }
  }

  const active = useGame.getState().activeMissionId;
  if (!active) return;
  const mission = missionById[active];
  if (mission.objective.type === "reach" && mission.objective.zone === zone) {
    useGame.getState().completeMission(active);
  }
}

function handle(event: GameEvent) {
  const state = useGame.getState();
  if (event.type === "zone") {
    if (event.tag !== "penguin") return;
    const screen = screenByZone.get(event.zone);
    if (screen) {
      if (event.enter) state.setNearScreen(screen);
      else if (state.nearScreen === screen) state.setNearScreen(null);
    }
    if (event.enter) onZoneEnter(event.zone);
    return;
  }
  if (event.type === "collect") {
    if (event.tag === "fish") state.addScore(scoring.perFish);
    const active = state.activeMissionId;
    if (!active) return;
    const mission = missionById[active];
    const objective = mission.objective;
    if (objective.type === "collect" && objective.tag === event.tag && (!objective.zone || objective.zone === event.zone)) {
      state.advance(active);
    }
  }
}

/** Mounted once. Subscribes to the bus and advances only the active mission. */
export function MissionRunner() {
  useEffect(() => {
    const unsubscribe = subscribe(handle);
    // When play begins or resumes, re-evaluate the zones the penguin already stands in
    // (the spawn pad fires before the start prompt is dismissed).
    const unsubscribeStore = useGame.subscribe((s, prev) => {
      if (s.mode === "play" && prev.mode !== "play") {
        for (const zone of zonesOf("penguin")) onZoneEnter(zone);
      }
    });
    return () => {
      unsubscribe();
      unsubscribeStore();
    };
  }, []);
  return null;
}
