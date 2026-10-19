"use client";

import { ArrowRight, ArrowUpRight, Sparkles, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { stations } from "@/data";

import { useTrain } from "../train/store";
import { scripted, SUGGESTIONS } from "./scripted";

type Msg = { role: "user" | "bot"; text: string; chips?: number[] };

/** Stations named in an answer become "Go to" chips. */
function goChips(answer: string): number[] {
  const low = answer.toLowerCase();
  return stations
    .map((st, i) => (i > 0 && (low.includes(st.name.toLowerCase()) || low.includes(st.section.toLowerCase())) ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, 3);
}

/**
 * Ask the attendant. Milestone 1 ships the scripted fallback only ("Preview mode"); the streaming Claude route with
 * go_to_station and set_scene tools arrives in Milestone 2 and reuses this panel.
 */
export function AskPanel() {
  const open = useTrain((s) => s.askOpen);
  const setAskOpen = useTrain((s) => s.setAskOpen);
  const driveTo = useTrain((s) => s.driveTo);
  const setLook = useTrain((s) => s.setLook);
  const phone = useTrain((s) => s.env.phone);
  const reduced = useTrain((s) => s.env.reduced);
  const { setTheme } = useTheme();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      useTrain.getState().dismissIntro();
      const t = window.setTimeout(() => input.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [msgs]);

  const send = async (q: string) => {
    if (busy || !q.trim()) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    await new Promise((r) => setTimeout(r, reduced ? 0 : 650));
    const r = scripted(q);
    let answer = r.answer ?? "";
    if (r.scene?.event !== undefined) {
      setLook({ event: r.scene.event, season: r.scene.season, weather: r.scene.weather, auto: false });
      if (r.scene.time) setTheme(r.scene.time === "day" ? "light" : "dark");
    } else if (r.scene) {
      setLook({ season: r.scene.season, weather: r.scene.weather, auto: false });
      if (r.scene.time) setTheme(r.scene.time === "day" ? "light" : "dark");
      const st = useTrain.getState();
      const time = r.scene.time ?? (document.documentElement.classList.contains("light") ? "day" : "night");
      answer = `Done: ${st.season} on the line, ${st.weather} skies, ${time === "day" ? "daytime" : "night"}. Ask about a project whenever you are ready.`;
    }
    setMsgs((m) => [...m, { role: "bot", text: answer, chips: goChips(answer) }]);
    setBusy(false);
    if (r.monument) {
      useTrain.getState().openMonument(r.monument);
      if (phone) setAskOpen(false);
    }
    if (r.go !== null) {
      driveTo(r.go);
      if (phone) setAskOpen(false);
    }
  };

  return (
    <section className={`ask glass${open ? " open" : ""}`} role="dialog" aria-labelledby="ask-h" aria-hidden={!open} data-panel>
      <div className="ask-head">
        <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
        <div className="t">
          <b id="ask-h">Ask the attendant</b>
          <small>Preview mode · scripted answers</small>
        </div>
        <button type="button" className="btn btn-icon" aria-label="Close" onClick={() => setAskOpen(false)} tabIndex={open ? 0 : -1}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div ref={body} className="ask-body">
        <div className="msg bot">Ask about any project, skill or role on this line. If a station has the answer, I&apos;ll take you there.</div>
        {msgs.length === 0 ? (
          <div className="sugg">
            {SUGGESTIONS.map((q) => (
              <button key={q} type="button" onClick={() => send(q)} tabIndex={open ? 0 : -1}>
                {q}
              </button>
            ))}
          </div>
        ) : null}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
            {m.chips && m.chips.length ? (
              <div>
                {m.chips.map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="go"
                    onClick={() => {
                      driveTo(idx);
                      if (phone) setAskOpen(false);
                    }}
                  >
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    Go to {stations[idx].section}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <div className="msg bot thinking">Thinking…</div> : null}
      </div>
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          const q = value.trim();
          if (q) {
            setValue("");
            void send(q);
          }
        }}
      >
        <label className="sr-only" htmlFor="askInput">
          Your question
        </label>
        <input
          ref={input}
          id="askInput"
          type="text"
          maxLength={300}
          placeholder="e.g. Which projects use PyTorch?"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          tabIndex={open ? 0 : -1}
        />
        <button type="submit" className="btn-primary btn-icon" aria-label="Send" tabIndex={open ? 0 : -1}>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      <div className="ask-foot">Answers come from this page only. Nothing you type is stored.</div>
    </section>
  );
}
