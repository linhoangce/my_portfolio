"use client";

import { useEffect, useState } from "react";

import { stations } from "@/data";

import { EVENT_META } from "../lookTypes";
import { hasSidebar } from "../scene/copy";
import { useTrain } from "../store";

/**
 * A small footnote in the bottom-right corner, above the map credit: "At About · Burrard" or "Next stop Awdon · 540 m
 * · 46 km/h" (aria-live), the event the city is lit for and the season, and the key hints until the visitor's first
 * input, after which they fold into a "Controls" link.
 */
export function Readout() {
  const readout = useTrain((s) => s.readout);
  const overlay = useTrain((s) => s.overlay);
  const kmh = useTrain((s) => s.kmh);
  const event = useTrain((s) => s.event);
  const season = useTrain((s) => s.season);
  const introDone = useTrain((s) => s.introDone);
  const setUi = useTrain((s) => s.setUi);
  const filmOn = useTrain((s) => s.filmOn);
  const [hints, setHints] = useState(true);

  useEffect(() => {
    if (!introDone || !hints) return;
    const fold = () => setHints(false);
    const t = window.setTimeout(fold, 12000);
    window.addEventListener("keydown", fold, { once: true });
    window.addEventListener("wheel", fold, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", fold);
      window.removeEventListener("wheel", fold);
    };
  }, [introDone, hints]);

  let body: React.ReactNode;
  if (readout.kind === "at") {
    const st = stations[readout.idx];
    body = (
      <>
        At <b>{st.section}</b> · {st.name}
        {overlay || !hasSidebar(readout.idx, filmOn) ? null : (
          <>
            {" · "}
            <b>E</b>
            {" to open"}
          </>
        )}
      </>
    );
  } else if (readout.kind === "next") {
    const m = readout.metres;
    body = (
      <>
        Next stop <b>{stations[readout.idx].section}</b>
        {` · ${m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`}`}
        {kmh > 0 ? ` · ${kmh} km/h` : null}
      </>
    );
  } else if (readout.kind === "loop") {
    body = (
      <>
        Turning loop · back to <b>{stations[readout.idx].section}</b>
      </>
    );
  } else body = "End of the line";

  const ev = event ? EVENT_META[event] : null;
  return (
    <div className="foot">
      <p aria-live="polite">{body}</p>
      <p>
        {ev ? `${ev.label} · ${season} · ` : `${season[0].toUpperCase()}${season.slice(1)} · `}
        {hints && introDone ? <span className="foot-hint">W / scroll drive · drag look around · </span> : null}
        <button type="button" onClick={() => setUi("help")}>
          Controls
        </button>
      </p>
    </div>
  );
}
