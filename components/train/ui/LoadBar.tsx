"use client";

import { LOAD_STAGES } from "../constants";
import { useTrain } from "../store";

/** A thin line across the top while the ride's scene comes in stage by stage (Scene.tsx), gone once all of it is in. */
export function LoadBar() {
  const stage = useTrain((s) => s.loadStage);
  const done = stage >= LOAD_STAGES;
  return (
    <div className="load-bar" data-done={done || undefined} role="progressbar" aria-label="Loading the ride" aria-valuemin={0} aria-valuemax={LOAD_STAGES} aria-valuenow={stage} aria-hidden={done || undefined}>
      <span style={{ transform: `scaleX(${(stage + 0.5) / (LOAD_STAGES + 0.5)})` }} />
    </div>
  );
}
