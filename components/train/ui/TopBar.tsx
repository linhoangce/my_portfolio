"use client";

import { AlignLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { person } from "@/data";

import { useTrain } from "../store";
import { StationChips } from "./StationChips";
import { ThemeToggle } from "./ThemeToggle";

/** Wordmark, stop chips, speed, the AUTO / season / weather chips, theme toggle, text version and the attendant. */
export function TopBar() {
  const kmh = useTrain((s) => s.kmh);
  const season = useTrain((s) => s.season);
  const weather = useTrain((s) => s.weather);
  const autoLook = useTrain((s) => s.autoLook);
  const askOpen = useTrain((s) => s.askOpen);
  const driveTo = useTrain((s) => s.driveTo);
  const cycleSeason = useTrain((s) => s.cycleSeason);
  const cycleWeather = useTrain((s) => s.cycleWeather);
  const toggleAuto = useTrain((s) => s.toggleAuto);
  const setAskOpen = useTrain((s) => s.setAskOpen);

  return (
    <header className="top">
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          driveTo(0);
        }}
      >
        <span className="name">{person.name}</span>
        <span className="line">EXPO LINE</span>
      </a>
      <StationChips />
      <div className="right">
        <div className="speed" aria-live="off">
          <b>{kmh}</b> KM/H
        </div>
        <button type="button" className="btn chipbtn" title="Seasons and weather cycle on their own; click to hold" onClick={toggleAuto}>
          {autoLook ? "AUTO" : "MANUAL"}
        </button>
        <button type="button" className="btn chipbtn" title="Change the season" onClick={cycleSeason}>
          {season.toUpperCase()}
        </button>
        <button type="button" className="btn chipbtn" title="Change the weather" onClick={cycleWeather}>
          {weather.toUpperCase()}
        </button>
        <ThemeToggle />
        <Link href="/text" className="btn" title="Read everything as a plain page">
          <AlignLeft className="h-4 w-4" aria-hidden="true" />
          <span className="label">Text version</span>
        </Link>
        <button type="button" className="btn-primary" onClick={() => setAskOpen(!askOpen)} aria-expanded={askOpen}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span className="label">Ask the attendant</span>
        </button>
      </div>
    </header>
  );
}
