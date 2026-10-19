"use client";

import { ArrowLeft, ArrowRight, ChevronUp, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PanelFor } from "@/components/panels";
import { stations } from "@/data";

import { useTrain } from "../store";

/**
 * The station's section as a film overlay: a left column on a gradient scrim on desktop, a bottom sheet on phones
 * (collapsed to the kicker, title, two lines of lead and the stop buttons until expanded). The panel is the same one
 * /text renders; its parts appear in stages as the establishing shot plays. Hide with E or Esc (remembered for this
 * stay). A visually hidden status line announces each scene once.
 */
export function SceneOverlay() {
  const overlay = useTrain((s) => s.overlay);
  const sceneIdx = useTrain((s) => s.sceneIdx);
  const stage = useTrain((s) => s.sceneStage);
  const phase = useTrain((s) => s.scenePhase);
  const filmOn = useTrain((s) => s.filmOn);
  const monument = useTrain((s) => s.monument);
  const hideOverlay = useTrain((s) => s.hideOverlay);
  const driveTo = useTrain((s) => s.driveTo);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const announced = useRef<number | null>(null);

  const open = overlay && !monument;
  const i = Math.min(Math.max(sceneIdx, 0), stations.length - 1);

  useEffect(() => {
    if (open) {
      if (body.current) body.current.scrollTop = 0;
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && !aside.current?.contains(active)) returnTo.current = active;
      aside.current?.focus({ preventScroll: true });
    } else {
      setExpanded(false);
      if (returnTo.current) {
        returnTo.current.focus({ preventScroll: true });
        returnTo.current = null;
      }
    }
  }, [open, i]);

  useEffect(() => {
    if ((phase === "establish" || (!filmOn && overlay)) && announced.current !== i) {
      announced.current = i;
      setStatus(`Scene: ${stations[i].section}, stop ${stations[i].code}`);
    }
    if (phase === "idle" && filmOn) announced.current = null;
  }, [phase, i, filmOn, overlay]);

  const st = stations[i];
  const last = i === stations.length - 1;
  const tab = open ? 0 : -1;
  return (
    <>
      <aside
        ref={aside}
        className={`scene-ov${open ? " open" : ""}${expanded ? " expanded" : ""}`}
        data-stage={filmOn ? stage : 4}
        aria-label={`${st.section} section`}
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="col" data-panel>
          <div ref={body} className="col-body">
            <PanelFor id={st.panel} code={st.code} />
          </div>
          <div className="col-foot">
            <button type="button" className="btn expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} tabIndex={tab}>
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
              {expanded ? "Less" : "More"}
            </button>
            <button type="button" className="btn" disabled={i === 0} onClick={() => driveTo(i - 1)} tabIndex={tab}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </button>
            <button type="button" className="btn-primary" disabled={last} onClick={() => driveTo(i + 1)} tabIndex={tab}>
              {last ? "End of the line" : "Next stop"}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" className="btn hide" onClick={hideOverlay} tabIndex={tab}>
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              Hide <kbd>E</kbd>
            </button>
          </div>
        </div>
      </aside>
      <p className="sr-only" role="status">
        {status}
      </p>
    </>
  );
}
