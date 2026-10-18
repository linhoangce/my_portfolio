"use client";

import { useEffect } from "react";

import { WHEEL_GAIN } from "../constants";
import { useTrain } from "../store";

/** The scroll wheel drives the train; 220 ms after the last tick the target snaps to a nearby station. Panels scroll themselves. */
export function Wheel() {
  useEffect(() => {
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest("[data-panel]")) return;
      e.preventDefault();
      const st = useTrain.getState();
      st.nudgeTarget(e.deltaY * WHEEL_GAIN);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => useTrain.getState().snapTarget(), 220);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
