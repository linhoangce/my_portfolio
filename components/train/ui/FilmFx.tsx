"use client";

import { useEffect } from "react";

import { useTrain } from "../store";

/**
 * The film's frame: a dip to black over the cut and letterbox bars while a scene plays, both CSS transitions keyed
 * off data attributes on the root, so nothing runs per frame. The top bar turns black in film (see globals.css).
 */
export function FilmFx() {
  const phase = useTrain((s) => s.scenePhase);
  const introDone = useTrain((s) => s.introDone);
  const filmOn = useTrain((s) => s.filmOn);
  const monument = useTrain((s) => s.monument);

  const film = filmOn && introDone && !monument && (phase === "establish" || phase === "hold") ? "on" : "off";
  const dip = filmOn && phase === "cut";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.film = film;
    root.dataset.scene = phase;
    return () => {
      delete root.dataset.film;
      delete root.dataset.scene;
    };
  }, [film, phase]);

  return (
    <>
      <div className="film-bar t" aria-hidden="true" />
      <div className="film-bar b" aria-hidden="true" />
      <div className={`film-dip${dip ? " on" : ""}`} aria-hidden="true" />
    </>
  );
}
