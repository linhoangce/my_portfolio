"use client";

import { useEffect, useRef, useState } from "react";

import { PanelFor } from "@/components/panels";
import { missions, sectionById } from "@/data";
import { SCREENS } from "../constants";
import { missionsDone, useGame } from "../store";
import { useFocusTrap } from "../useFocusTrap";

/**
 * DOM side of focus mode. On wide viewports it traps keyboard focus inside the
 * in-world panel (which the camera has dollied to) and handles Escape; on
 * narrow ones it shows the same panel as a full-screen overlay for legibility.
 */
export function FocusController() {
  const mode = useGame((s) => s.mode);
  const focused = useGame((s) => s.focusedScreen);
  const exitFocus = useGame((s) => s.exitFocus);
  const announce = useGame((s) => s.announce);
  const active = mode === "focus" && focused !== null;
  const [overlay, setOverlay] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !focused) {
      panelRef.current = null;
      useGame.setState({ focusOverlay: false });
      return;
    }
    const useOverlay = window.innerWidth < SCREENS.overlayBelowPx;
    useGame.setState({ focusOverlay: useOverlay });
    setOverlay(useOverlay);
    panelRef.current = useOverlay ? null : document.getElementById(`screen-${focused}`);
    announce(`Reading ${sectionById[focused].title}. Press Escape to go back.`);
  }, [active, focused, announce]);

  useFocusTrap(panelRef, active && !overlay, { onEscape: exitFocus });

  if (!active || !focused) return null;
  if (overlay) return <OverlayPanel id={focused} onClose={exitFocus} />;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 safe-bottom">
      <p className="glass px-4 py-2 text-xs text-muted">Scroll to read · links open in a new tab · Esc to go back</p>
    </div>
  );
}

function OverlayPanel({ id, onClose }: { id: Parameters<typeof PanelFor>[0]["id"]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const score = useGame((s) => s.score);
  const done = useGame((s) => missionsDone(s));
  useFocusTrap(ref, true, { onEscape: onClose });
  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex flex-col bg-bg">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={sectionById[id].title}
        tabIndex={-1}
        className="flex h-full flex-col outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border/15 px-4 py-3">
          <p className="eyebrow">{sectionById[id].place}</p>
          <button type="button" className="btn-ghost min-h-10 px-4 text-sm" onClick={onClose}>
            Back
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-6 safe-bottom">
          <PanelFor id={id} score={id === "contact" ? { score, missionsDone: done, missionsTotal: missions.length } : undefined} />
        </div>
      </div>
    </div>
  );
}
