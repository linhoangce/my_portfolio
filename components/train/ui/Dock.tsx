"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { PanelFor } from "@/components/panels";
import { stations } from "@/data";

import { useTrain } from "../store";

/**
 * The station's content panel: a right column on desktop, a bottom sheet on phones. Opens on docking, closes with
 * × or Esc (remembered for that station), toggles with E. Wheel inside scrolls the panel only (data-panel).
 */
export function Dock() {
  const dockedIdx = useTrain((s) => s.dockedIdx);
  const dockOpen = useTrain((s) => s.dockOpen);
  const closeDock = useTrain((s) => s.closeDock);
  const driveTo = useTrain((s) => s.driveTo);
  const shown = useRef<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  if (dockedIdx !== null) shown.current = dockedIdx;
  const i = shown.current;

  useEffect(() => {
    if (dockOpen) {
      if (body.current) body.current.scrollTop = 0;
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) returnTo.current = active;
      aside.current?.focus({ preventScroll: true });
    } else if (returnTo.current) {
      returnTo.current.focus({ preventScroll: true });
      returnTo.current = null;
    }
  }, [dockOpen, i]);

  if (i === null) return null;
  const st = stations[i];
  const last = i === stations.length - 1;
  return (
    <aside
      ref={aside}
      className={`dock glass${dockOpen ? " open" : ""}`}
      aria-label="Station section"
      aria-hidden={!dockOpen}
      tabIndex={-1}
      data-panel
    >
      <div className="dock-head">
        <span className="kicker">
          {st.code} · {st.section}
        </span>
        <button type="button" className="btn btn-icon" aria-label="Close section" onClick={closeDock} tabIndex={dockOpen ? 0 : -1}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div ref={body} className="dock-body">
        <PanelFor id={st.panel} code={st.code} />
      </div>
      <div className="dock-foot">
        <button type="button" className="btn" disabled={i === 0} onClick={() => driveTo(i - 1)} tabIndex={dockOpen ? 0 : -1}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Previous
        </button>
        <button type="button" className="btn-primary" disabled={last} onClick={() => driveTo(i + 1)} tabIndex={dockOpen ? 0 : -1}>
          {last ? "End of the line" : "Next stop"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
