"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PanelFor } from "@/components/panels";
import { stations } from "@/data";

import { useTrain } from "../store";

/**
 * The station's section over the scene: a card bottom left on desktop, a bottom sheet on phones, both collapsed to the
 * kicker, title, lead and links until More shows the rest (Explore has nothing more on desktop). The panel is the same
 * one /text renders; its parts appear in stages as the train arrives. Hide with E or Esc (remembered for this stay). The
 * stop buttons are StopNav's, just below the card. A visually hidden status line announces each scene once.
 */
export function SceneOverlay() {
  const overlay = useTrain((s) => s.overlay);
  const sceneIdx = useTrain((s) => s.sceneIdx);
  const stage = useTrain((s) => s.sceneStage);
  const phase = useTrain((s) => s.scenePhase);
  const filmOn = useTrain((s) => s.filmOn);
  const monument = useTrain((s) => s.monument);
  const phone = useTrain((s) => s.env.phone);
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
  const tab = open ? 0 : -1;
  // collapsed, Explore shows all it has on desktop; a phone clamps its lead
  const more = phone || st.panel !== "depart";
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
          {more ? (
            <div className="col-foot">
              <button type="button" className="btn expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} tabIndex={tab}>
                {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
                {expanded ? "Less" : "More"}
              </button>
            </div>
          ) : null}
        </div>
      </aside>
      <p className="sr-only" role="status">
        {status}
      </p>
    </>
  );
}
