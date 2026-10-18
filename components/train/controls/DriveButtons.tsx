"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useTrain } from "../store";

/** Hold buttons for phones (hidden on wide screens by CSS). */
export function DriveButtons() {
  const hold = (dir: 1 | -1) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      useTrain.getState().setThrottle(dir);
    },
    onPointerUp: () => release(dir),
    onPointerCancel: () => release(dir),
    onLostPointerCapture: () => release(dir),
  });
  const release = (dir: 1 | -1) => {
    const st = useTrain.getState();
    if (st.sim.throttle === dir) {
      st.setThrottle(0);
      st.assist();
    }
  };
  return (
    <div className="drive" aria-label="Drive controls">
      <button type="button" aria-label="Reverse (hold)" {...hold(-1)}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Reverse
      </button>
      <button type="button" className="go" aria-label="Drive forward (hold)" {...hold(1)}>
        Drive
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
