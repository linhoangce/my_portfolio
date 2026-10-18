"use client";

import { useEffect, useRef } from "react";

import { stations } from "@/data";

import { useTrain } from "../store";

/** One chip per stop: the code box always, the section name for the current and next stop (all names from 1900 px). */
export function StationChips() {
  const dockedIdx = useTrain((s) => s.dockedIdx);
  const nextIdx = useTrain((s) => s.nextIdx);
  const reduced = useTrain((s) => s.env.reduced);
  const driveTo = useTrain((s) => s.driveTo);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (dockedIdx === null || !nav.current) return;
    const el = nav.current.children[dockedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [dockedIdx, reduced]);

  return (
    <nav ref={nav} className="stops" aria-label="Stations">
      {stations.map((st, i) => (
        <button
          key={st.id}
          type="button"
          className={`stop${i === nextIdx && dockedIdx === null ? " next" : ""}`}
          title={`${st.section} · ${st.name} station`}
          aria-current={i === dockedIdx ? "true" : undefined}
          onClick={() => driveTo(i)}
        >
          <span className="n">{st.code}</span>
          <span className="nm">{st.section}</span>
        </button>
      ))}
    </nav>
  );
}
