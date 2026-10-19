"use client";

import { useEffect, useState } from "react";

import { stations } from "@/data";

import { EVENT_META } from "../lookTypes";
import { hasSidebar } from "../scene/copy";
import { useTrain } from "../store";
import { eventSwatch } from "./MonumentCard";

/**
 * Bottom-left: the event the city is lit for, "At About · Burrard" or "Next stop Awdon · 540 m · 46 km/h"
 * (aria-live), and the key hints until the visitor's first input, after which they fold into a "?" button.
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
        {kmh > 0 ? <span className="kmh"> · {kmh} km/h</span> : null}
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
    <div className="hud">
      {ev ? (
        <span className="evt">
          <i style={{ background: eventSwatch(event!) }} aria-hidden="true" />
          {ev.label} · {season}
        </span>
      ) : null}
      <div className="readout" aria-live="polite">
        <span className="dot" aria-hidden="true" />
        <span>{body}</span>
      </div>
      {hints ? (
        <div className="hint">
          <kbd>W</kbd> / scroll drive · <kbd>S</kbd> reverse · drag to look around (360°) · <kbd>ctrl</kbd>+scroll zoom · click a landmark ·{" "}
          <kbd>?</kbd> controls
        </div>
      ) : (
        <button type="button" className="btn btn-icon hint-btn" aria-label="Controls" onClick={() => setUi("help")}>
          ?
        </button>
      )}
    </div>
  );
}
