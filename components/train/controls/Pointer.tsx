"use client";

import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef } from "react";

import { SWIPE_GAIN } from "../constants";
import { pickBus } from "../scene/pickBus";
import { orbitBy, zoomBy } from "../scene/view";
import { useTrain } from "../store";

type Drag = { x: number; y: number; x0: number; y0: number; t0: number; axis: "drive" | "look" | "pinch" | null; pinch: number };

/**
 * Wraps the canvas. A drag orbits the current view a full 360° (the chase, a scene's set, a monument); two fingers
 * pinch to zoom; on touch screens a vertical swipe in the chase drives the train instead. A short tap or click on a
 * monument opens its view, and hovering one shows a pointer cursor.
 */
export function Pointer({ children }: { children: ReactNode }) {
  const pts = useRef(new Map<number, [number, number]>());
  const d = useRef<Drag>({ x: 0, y: 0, x0: 0, y0: 0, t0: 0, axis: null, pinch: 0 });
  const hoverT = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    e.currentTarget.setPointerCapture(e.pointerId);
    const st = useTrain.getState();
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      d.current.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
      d.current.axis = "pinch";
      return;
    }
    st.sim.dragging = true;
    Object.assign(d.current, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), axis: null });
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = useTrain.getState();
    if (!pts.current.has(e.pointerId)) {
      // hover: a pointer cursor over a monument, ten checks a second
      if (e.pointerType === "mouse" && pickBus.pick) {
        const now = performance.now();
        if (now - hoverT.current > 100) {
          hoverT.current = now;
          const k = pickBus.pick(e.clientX, e.clientY);
          st.setHoverMon(k);
          if (box.current) box.current.style.cursor = k ? "pointer" : "";
        }
      }
      return;
    }
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    const g = d.current;
    if (g.axis === "pinch") {
      if (pts.current.size === 2) {
        const [a, b] = [...pts.current.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (g.pinch > 0) zoomBy(st, -Math.log(dist / g.pinch));
        g.pinch = dist;
      }
      return;
    }
    if (!st.sim.dragging) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    g.x = e.clientX;
    g.y = e.clientY;
    const travel = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
    if (!g.axis && travel > (e.pointerType === "touch" ? 10 : 6)) {
      const chase = st.sim.film.phase !== "hold" && st.sim.film.phase !== "establish" && !st.monument;
      g.axis = st.env.coarse && chase && Math.abs(dy) > Math.abs(dx) ? "drive" : "look";
    }
    if (g.axis === "drive") st.nudgeTarget(-dy * SWIPE_GAIN);
    else if (g.axis === "look") orbitBy(st, -dx * ((Math.PI * 2) / Math.max(600, window.innerWidth)) * 1.2, dy * 0.004);
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = useTrain.getState();
    const g = d.current;
    pts.current.delete(e.pointerId);
    if (st.sim.dragging && !g.axis && performance.now() - g.t0 < 400 && pickBus.pick) {
      const k = pickBus.pick(e.clientX, e.clientY);
      if (k) st.openMonument(k);
    }
    if (g.axis === "drive") st.snapTarget();
    if (pts.current.size === 0) {
      st.sim.dragging = false;
      g.axis = null;
    }
  };

  return (
    <div ref={box} className="fixed inset-0" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {children}
    </div>
  );
}
