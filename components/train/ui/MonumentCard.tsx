"use client";

import { ArrowLeft } from "lucide-react";

import { EVENT_IDS, EVENT_META, type EventId } from "../lookTypes";
import { MONUMENT_BY_KEY } from "../monumentData";
import { useTrain } from "../store";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
/** A swatch for each event; Pride gets the full rainbow. */
export const eventSwatch = (k: EventId) => (k === "pride" ? `conic-gradient(${EVENT_META.pride.colours.map(hex).join(",")},${hex(EVENT_META.pride.colours[0])})` : hex(EVENT_META[k].colours[0]));

/** The monument view's card: what it is, the era line, chips to preview each event's lighting, and the way back to the train. */
export function MonumentCard() {
  const key = useTrain((s) => s.monument);
  const event = useTrain((s) => s.event);
  const setLook = useTrain((s) => s.setLook);
  const closeMonument = useTrain((s) => s.closeMonument);
  const m = key ? MONUMENT_BY_KEY[key] : undefined;
  if (!m) return null;
  return (
    <section className="mon-card glass" aria-live="polite" aria-label={m.name}>
      <p className="kicker m-0">{m.era}</p>
      <h2 className="font-serif">{m.name}</h2>
      <div className="chips" role="group" aria-label="Preview the lighting for an event">
        {EVENT_IDS.map((k) => (
          <button
            key={k}
            type="button"
            className="chip-btn"
            aria-pressed={event === k}
            onClick={() => setLook({ event: k, season: EVENT_META[k].season, weather: EVENT_META[k].weather })}
          >
            <i style={{ background: eventSwatch(k) }} aria-hidden="true" />
            {EVENT_META[k].label}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={closeMonument}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to the train
        </button>
        <span className="hint-inline">Drag to circle · ctrl + scroll to zoom</span>
      </div>
    </section>
  );
}
