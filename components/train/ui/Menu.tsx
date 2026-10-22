"use client";

import { AlignLeft, Keyboard, X } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { EVENT_IDS, EVENT_META, type EventId, SEASONS, WEATHERS } from "../lookTypes";
import { MONUMENTS } from "../monumentData";
import { useTrain } from "../store";
import { eventSwatch } from "./MonumentCard";
import { MAP_SOURCES } from "../mapSources";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * The menu popover: the text version, the scene (automatic cycle, season, weather, the Vancouver event the city is
 * lit for), the landmarks to circle, and the controls. Picking an event shows it in its season; a night event also
 * switches to night (L switches back).
 */
export function Menu() {
  const ui = useTrain((s) => s.ui);
  const season = useTrain((s) => s.season);
  const weather = useTrain((s) => s.weather);
  const event = useTrain((s) => s.event);
  const autoLook = useTrain((s) => s.autoLook);
  const monument = useTrain((s) => s.monument);
  const setLook = useTrain((s) => s.setLook);
  const setUi = useTrain((s) => s.setUi);
  const toggleAuto = useTrain((s) => s.toggleAuto);
  const openMonument = useTrain((s) => s.openMonument);
  const { setTheme } = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const open = ui === "menu";

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (box.current && t && !box.current.contains(t) && !t.closest("[data-menu-toggle]")) setUi(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open, setUi]);

  if (!open) return null;
  const pickEvent = (k: EventId | null) => {
    if (!k) {
      setLook({ event: null });
      return;
    }
    const m = EVENT_META[k];
    setLook({ event: k, season: m.season, weather: m.weather });
    if (m.night) setTheme("dark");
  };
  return (
    <div ref={box} className="menu glass" role="dialog" aria-label="Menu" data-panel>
      <div className="menu-head">
        <span className="kicker">Menu</span>
        <button type="button" className="btn btn-icon" aria-label="Close menu" onClick={() => setUi(null)}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <Link href="/text" className="btn menu-text">
        <AlignLeft className="h-4 w-4" aria-hidden="true" />
        Text version
      </Link>
      <section>
        <h3>Scene</h3>
        <label className="toggle">
          <input type="checkbox" checked={autoLook} onChange={toggleAuto} />
          Cycle day and night, seasons, weather and events on their own
        </label>
        <div className="chips" role="group" aria-label="Season">
          {SEASONS.map((s) => (
            <button key={s} type="button" className="chip-btn" aria-pressed={season === s} onClick={() => setLook({ season: s })}>
              {cap(s)}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Weather">
          {WEATHERS.map((w) => (
            <button key={w} type="button" className="chip-btn" aria-pressed={weather === w} onClick={() => setLook({ weather: w })}>
              {cap(w)}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Vancouver event</h3>
        <div className="chips" role="group" aria-label="Event">
          <button type="button" className="chip-btn" aria-pressed={event === null} onClick={() => pickEvent(null)}>
            None
          </button>
          {EVENT_IDS.map((k) => (
            <button key={k} type="button" className="chip-btn" aria-pressed={event === k} onClick={() => pickEvent(k)}>
              <i style={{ background: eventSwatch(k) }} aria-hidden="true" />
              {EVENT_META[k].label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Landmarks</h3>
        <div className="chips" role="group" aria-label="Circle a landmark">
          {MONUMENTS.map((m) => (
            <button key={m.key} type="button" className="chip-btn" aria-pressed={monument === m.key} onClick={() => openMonument(m.key)}>
              {m.name}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Map data</h3>
        <ul className="map-sources">
          {MAP_SOURCES.map((m) => (
            <li key={m.label}>
              <a href={m.href} target="_blank" rel="noreferrer noopener">
                {m.label}
              </a>
              : {m.note}
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="btn" onClick={() => setUi("help")}>
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        Controls
      </button>
    </div>
  );
}

const KEYS: [string, string][] = [
  ["W · ↑ · scroll", "drive forward; the train settles at the next stop"],
  ["S · ↓", "reverse"],
  ["Space", "brake"],
  ["1 – 0", "drive to a stop"],
  ["Drag · A D · ← →", "look around, a full 360°"],
  ["Ctrl + scroll · pinch · + −", "zoom"],
  ["R", "reset the view"],
  ["E", "show or hide the station's section"],
  ["Click a landmark · M", "circle it; Esc comes back"],
  ["C", "cab view"],
  ["L", "day or night"],
  ["T", "text version"],
];

/** The controls, as a dialog from the menu or the ? key. */
export function Help() {
  const ui = useTrain((s) => s.ui);
  const setUi = useTrain((s) => s.setUi);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ui === "help") box.current?.focus({ preventScroll: true });
  }, [ui]);
  if (ui !== "help") return null;
  return (
    <div className="help-wrap" onPointerDown={(e) => e.target === e.currentTarget && setUi(null)}>
      <div ref={box} className="help glass" role="dialog" aria-label="Controls" tabIndex={-1}>
        <div className="menu-head">
          <span className="kicker">Controls</span>
          <button type="button" className="btn btn-icon" aria-label="Close controls" onClick={() => setUi(null)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <dl className="keys">
          {KEYS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
