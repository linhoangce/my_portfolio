"use client";

import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef } from "react";

import { CAM, SWIPE_GAIN } from "../constants";
import { useTrain } from "../store";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Wraps the canvas: drag orbits the camera (yaw, pitch); on touch screens a vertical swipe drives the train instead. */
export function Pointer({ children }: { children: ReactNode }) {
  const last = useRef({ x: 0, y: 0 });

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { sim } = useTrain.getState();
    sim.dragging = true;
    sim.dragAxis = null;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = useTrain.getState();
    const { sim } = st;
    if (!sim.dragging) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    if (!sim.dragAxis && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) sim.dragAxis = Math.abs(dy) > Math.abs(dx) && st.env.coarse ? "drive" : "look";
    if (sim.dragAxis === "drive") st.nudgeTarget(-dy * SWIPE_GAIN);
    else if (sim.dragAxis === "look") {
      sim.yawOff = clamp(sim.yawOff - dx * 0.005, -CAM.yawMax, CAM.yawMax);
      sim.pitchOff = clamp(sim.pitchOff + dy * 0.003, CAM.pitchMin, CAM.pitchMax);
    }
  };
  const onUp = () => {
    const st = useTrain.getState();
    const { sim } = st;
    if (sim.dragging && sim.dragAxis === "drive") st.snapTarget();
    sim.dragging = false;
  };

  return (
    <div className="fixed inset-0" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {children}
    </div>
  );
}
