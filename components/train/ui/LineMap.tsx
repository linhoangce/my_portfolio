"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { stations } from "@/data";

import { useTrain } from "../store";

/**
 * The line as the navigation: ten stops as dots on a thin rail with the train's position on it, the current stop
 * marked, the next one pulsing, names in tooltips. Phones get a compact "‹ 03 · Awdon ›" stepper instead.
 */
export function LineMap() {
  const dockedIdx = useTrain((s) => s.dockedIdx);
  const nextIdx = useTrain((s) => s.nextIdx);
  const sceneIdx = useTrain((s) => s.sceneIdx);
  const phase = useTrain((s) => s.scenePhase);
  const driveTo = useTrain((s) => s.driveTo);
  const marker = useRef<HTMLSpanElement>(null);

  const inScene = phase === "cut" || phase === "establish" || phase === "hold";
  const cur = dockedIdx ?? (inScene ? sceneIdx : null);

  // the train marker moves along the rail ten times a second, without React renders
  useEffect(() => {
    const id = window.setInterval(() => {
      const { sim } = useTrain.getState();
      const S = sim.stationS;
      if (!marker.current || S.length < 2) return;
      let k = 0;
      while (k < S.length - 2 && sim.s > S[k + 1]) k++;
      const u = Math.min(1, Math.max(0, (sim.s - S[k]) / (S[k + 1] - S[k])));
      marker.current.style.left = `${((k + u) / (S.length - 1)) * 100}%`;
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const shown = cur ?? nextIdx ?? 0;
  return (
    <nav className="linemap" aria-label="Stops on the line">
      <ol>
        <span className="rail" aria-hidden="true">
          <span ref={marker} className="train-mark" />
        </span>
        {stations.map((st, i) => (
          <li key={st.id}>
            <button
              type="button"
              className={`dot${i === nextIdx && cur === null ? " next" : ""}`}
              aria-label={`Stop ${st.code} ${st.section}`}
              aria-current={i === cur ? "step" : undefined}
              onClick={() => driveTo(i)}
            >
              <i aria-hidden="true" />
              <span className="tip" aria-hidden="true">
                {st.code} · {st.section}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="stepper">
        <button type="button" className="btn btn-icon" aria-label="Previous stop" disabled={shown === 0} onClick={() => driveTo(shown - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="here" aria-live="polite">
          {cur === null ? <b>Next</b> : <b>{stations[shown].code}</b>}
          {stations[shown].section}
        </span>
        <button type="button" className="btn btn-icon" aria-label="Next stop" disabled={shown === stations.length - 1} onClick={() => driveTo(shown + 1)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
