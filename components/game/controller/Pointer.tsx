"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { useGame } from "../store";
import { input } from "./input";

/** Drag on the canvas orbits the camera; the wheel zooms. Only in play mode. */
export function Pointer() {
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(() => {
    let last = { x: 0, y: 0 };
    let activeId: number | null = null;

    const down = (e: PointerEvent) => {
      if (useGame.getState().mode !== "play") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (activeId !== null) return;
      activeId = e.pointerId;
      input.dragging = true;
      last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (activeId !== e.pointerId) return;
      input.look.dx += e.clientX - last.x;
      input.look.dy += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (activeId !== e.pointerId) return;
      activeId = null;
      input.dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      if (useGame.getState().mode !== "play") return;
      e.preventDefault();
      input.zoom += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    };
    const contextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", contextMenu);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", contextMenu);
    };
  }, [canvas]);

  return null;
}
