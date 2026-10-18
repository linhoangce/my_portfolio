"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { intro, person } from "@/data";

import { useTrain } from "../store";

/** First-load card. Any drive input dismisses it; Depart drives to the first stop. */
export function Intro() {
  const introDone = useTrain((s) => s.introDone);
  const driveTo = useTrain((s) => s.driveTo);
  return (
    <div className={`intro${introDone ? " gone" : ""}`} aria-hidden={introDone}>
      <div className="card glass" role="dialog" aria-labelledby="intro-h">
        <p className="kicker m-0">{intro.kicker}</p>
        <h1 id="intro-h" className="font-serif">
          {person.name}
        </h1>
        <p>{intro.lead}</p>
        <div className="keys">
          {intro.keys.map(([k, what]) => (
            <div key={k} className="contents">
              <kbd>{k}</kbd>
              <span>{what}</span>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn-primary" type="button" onClick={() => driveTo(1)} disabled={introDone}>
            Depart
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <Link className="btn" href="/text" tabIndex={introDone ? -1 : undefined}>
            Just read the work
          </Link>
        </div>
      </div>
    </div>
  );
}
