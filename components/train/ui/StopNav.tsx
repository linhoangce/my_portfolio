"use client";

import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";

import { stations } from "@/data";

import { hasSidebar } from "../scene/copy";
import { useTrain } from "../store";

/**
 * The stop buttons, bottom left and always there: Previous and Next stop, and the scene's details shown or hidden
 * (E). They stand where the scene's column ends, so the column opens round them and hides without taking them along.
 * At a stop they step from it; between stops, from the stop ahead.
 */
export function StopNav() {
  const overlay = useTrain((s) => s.overlay);
  const sceneIdx = useTrain((s) => s.sceneIdx);
  const phase = useTrain((s) => s.scenePhase);
  const dockedIdx = useTrain((s) => s.dockedIdx);
  const nextIdx = useTrain((s) => s.nextIdx);
  const filmOn = useTrain((s) => s.filmOn);
  const monument = useTrain((s) => s.monument);
  const driveTo = useTrain((s) => s.driveTo);
  const toggleOverlay = useTrain((s) => s.toggleOverlay);

  if (monument) return null;
  const inScene = filmOn ? phase === "establish" || phase === "hold" : dockedIdx !== null;
  const here = inScene ? sceneIdx : dockedIdx;
  const last = stations.length - 1;

  /** Where Previous (-1) or Next (+1) goes from here, or between stops from the train and the stop ahead. */
  const target = (dir: -1 | 1): number | null => {
    if (here !== null) return here + dir;
    if (nextIdx === null) return null;
    const { sim } = useTrain.getState();
    const S = sim.stationS;
    if (!S.length) return null;
    // the stop ahead lies up the line (higher index) or down it; the one behind is its neighbour the other way
    const up = S[nextIdx] >= sim.s;
    const targeted = sim.target === S[nextIdx];
    if ((dir > 0) === up) return targeted ? nextIdx + dir : nextIdx;
    return up ? nextIdx - 1 : nextIdx + 1;
  };
  const go = (dir: -1 | 1) => {
    const i = target(dir);
    if (i !== null && i >= 0 && i <= last) driveTo(i);
  };
  const canDetails = inScene && hasSidebar(sceneIdx, filmOn);

  return (
    <nav className="stop-nav" aria-label="Stops">
      <button type="button" className="btn" disabled={here === 0} onClick={() => go(-1)}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Previous
      </button>
      <button type="button" className="btn-primary" disabled={here === last} onClick={() => go(1)}>
        {here === last ? "End of the line" : "Next stop"}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {canDetails ? (
        <button type="button" className="btn details" onClick={toggleOverlay} aria-pressed={overlay}>
          {overlay ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          {overlay ? "Hide" : "Details"} <kbd>E</kbd>
        </button>
      ) : null}
    </nav>
  );
}
