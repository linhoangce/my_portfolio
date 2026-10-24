"use client";

import { useEffect } from "react";

import { WHEEL_GAIN } from "../constants";
import { zoomBy } from "../scene/view";
import { useTrain } from "../store";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * The scroll wheel drives the train; 220 ms after the last tick the target snaps to a nearby station. Ctrl or ⌘ with
 * the wheel (a trackpad pinch) zooms instead. For 1.2 s after a scene starts the wheel is ignored, and leaving a
 * scene's hold or a monument takes a deliberate 160 px within 250 ms, so a trackpad fling does not eject the visitor.
 * Panels scroll themselves.
 */
export function Wheel() {
  useEffect(() => {
    let timer = 0;
    let acc = 0;
    let accT = 0;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest("[data-panel]")) return;
      e.preventDefault();
      const st = useTrain.getState();
      if (e.ctrlKey || e.metaKey) {
        zoomBy(st, clamp(e.deltaY * 0.01, -0.12, 0.12));
        return;
      }
      const now = performance.now();
      const phase = st.sim.film.phase;
      if (phase !== "idle" && phase !== "exit" && now - st.sim.film.startedAt < 1200) return;
      if (phase === "hold" || phase === "establish" || st.monument) {
        if (now - accT > 250) acc = 0;
        accT = now;
        acc += e.deltaY;
        if (Math.abs(acc) < 160) return;
        acc = 0;
      }
      st.nudgeTarget(e.deltaY * WHEEL_GAIN);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => useTrain.getState().snapTarget(), 220);
    };
    // Safari's trackpad pinch
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGesture = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      zoomBy(useTrain.getState(), -Math.log(scale / lastScale));
      lastScale = scale;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("gesturestart", onGestureStart);
    window.addEventListener("gesturechange", onGesture);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturestart", onGestureStart);
      window.removeEventListener("gesturechange", onGesture);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
