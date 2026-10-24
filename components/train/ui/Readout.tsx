"use client";

import { stations } from "@/data";

import { useTrain } from "../store";

/**
 * Where the train is, for screen readers only: "At About · Burrard" or "Next stop Awdon · 540 m · 46 km/h" (the line
 * map and the stop buttons show it on screen).
 */
export function Readout() {
  const readout = useTrain((s) => s.readout);
  const kmh = useTrain((s) => s.kmh);

  let body: string;
  if (readout.kind === "at") {
    const st = stations[readout.idx];
    body = `At ${st.section} · ${st.name}`;
  } else if (readout.kind === "next") {
    const m = readout.metres;
    body = `Next stop ${stations[readout.idx].section} · ${m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`}${kmh > 0 ? ` · ${kmh} km/h` : ""}`;
  } else if (readout.kind === "loop") body = `Turning loop · back to ${stations[readout.idx].section}`;
  else body = "End of the line";

  return (
    <p className="sr-only" aria-live="polite">
      {body}
    </p>
  );
}
