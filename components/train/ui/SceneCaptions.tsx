"use client";

import { stations } from "@/data";

import { captionBus } from "../scene/captionBus";
import { captionsFor } from "../scene/copy";
import { useTrain } from "../store";

/**
 * Captions pinned to the scene's set: real numbers from the section (metrics, skills, roles, projects, contact).
 * They are decoration for sighted visitors (aria-hidden; the overlay is the accessible source); the projector in
 * the canvas moves them, and pointer users can click the ones that link somewhere.
 */
export function SceneCaptions() {
  const sceneIdx = useTrain((s) => s.sceneIdx);
  const i = Math.min(Math.max(sceneIdx, 0), stations.length - 1);
  const caps = captionsFor(stations[i].panel);
  captionBus.els.length = caps.length;
  captionBus.prio = caps.map((c) => c.prio);
  return (
    <div className="caps" aria-hidden="true">
      {caps.map((c, k) => {
        const chip = (
          <>
            <b>{c.value}</b>
            <span>{c.label}</span>
          </>
        );
        return (
          <div
            key={`${i}-${k}`}
            className="cap"
            ref={(el) => {
              captionBus.els[k] = el;
            }}
          >
            <span className="pin" />
            <span className="stem" />
            {c.href ? (
              <a className="chip-c" href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer noopener" tabIndex={-1}>
                {chip}
              </a>
            ) : (
              <span className="chip-c">{chip}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
