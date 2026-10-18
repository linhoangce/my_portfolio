"use client";

import { stations } from "@/data";

import { useTrain } from "../store";

/** Bottom-left: "At About · press E to open" / "Next stop Awdon · 540 m" (aria-live) and the key hints. */
export function Readout() {
  const readout = useTrain((s) => s.readout);
  const dockOpen = useTrain((s) => s.dockOpen);

  let body: React.ReactNode;
  if (readout.kind === "at") {
    body = (
      <>
        At <b>{stations[readout.idx].section}</b>
        {dockOpen ? null : (
          <>
            {" · press "}
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
      </>
    );
  } else body = "End of the line";

  return (
    <div className="hud">
      <div className="readout" aria-live="polite">
        <span className="dot" aria-hidden="true" />
        <span>{body}</span>
      </div>
      <div className="hint">
        <kbd>W</kbd> / scroll drive · <kbd>S</kbd> reverse · <kbd>Space</kbd> brake · <kbd>1</kbd>–<kbd>0</kbd> stops · <kbd>E</kbd> open ·{" "}
        <kbd>C</kbd> cab view · drag to look
      </div>
    </div>
  );
}
