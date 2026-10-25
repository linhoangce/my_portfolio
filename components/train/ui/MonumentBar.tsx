"use client";

import { ArrowLeft } from "lucide-react";

import { EVENT_IDS, EVENT_META, type EventId } from "../lookTypes";
import { MONUMENT_BY_KEY } from "../monumentData";
import { useTrain } from "../store";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
/** A swatch for each event; Pride gets the full rainbow. */
export const eventSwatch = (k: EventId) => (k === "pride" ? `conic-gradient(${EVENT_META.pride.colours.map(hex).join(",")},${hex(EVENT_META.pride.colours[0])})` : hex(EVENT_META[k].colours[0]));

/**
 * A landmark's view, with no card: the way back to the train at the bottom left, where the stop buttons stand, and
 * bottom centre the landmark's name with the events' lights as stops along a line beside it (each named on hover, the
 * one lit named all along), like the line map.
 */
export function MonumentBar() {
  const key = useTrain((s) => s.monument);
  const event = useTrain((s) => s.event);
  const setLook = useTrain((s) => s.setLook);
  const closeMonument = useTrain((s) => s.closeMonument);
  const m = key ? MONUMENT_BY_KEY[key] : undefined;
  if (!m) return null;
  return (
    <>
      <button type="button" className="btn mon-back" onClick={closeMonument}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          Back<span className="long"> to the train</span>
        </span>
      </button>
      <section className="mon-bar" aria-label={m.name}>
        <h2 className="mon-name font-serif" aria-live="polite">
          {m.name}
        </h2>
        <div className="mon-events" role="group" aria-label="Light it for an event">
          <span className="rail" aria-hidden="true" />
          {EVENT_IDS.map((k) => (
            <button
              key={k}
              type="button"
              className="ev"
              aria-label={EVENT_META[k].label}
              aria-pressed={event === k}
              onClick={() => setLook({ event: k, season: EVENT_META[k].season, weather: EVENT_META[k].weather })}
            >
              <i style={{ background: eventSwatch(k) }} aria-hidden="true" />
              <span className="tip" aria-hidden="true">
                {EVENT_META[k].label}
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
