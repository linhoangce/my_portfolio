"use client";

import { stations } from "@/data";

import { captionBus } from "../scene/captionBus";
import { captionsAreContent, captionsFor } from "../scene/copy";
import { useTrain } from "../store";

/**
 * Captions pinned to the scene's set: the years on Experience's portals, and Contact's links on its signposts. The
 * Experience ones are decoration (aria-hidden; the sidebar is the accessible source). Contact has no sidebar, so its
 * captions are the content: a labelled list of real links, reachable by keyboard. The projector in the canvas moves
 * them.
 */
export function SceneCaptions() {
  const sceneIdx = useTrain((s) => s.sceneIdx);
  const phone = useTrain((s) => s.env.phone);
  const i = Math.min(Math.max(sceneIdx, 0), stations.length - 1);
  const caps = captionsFor(stations[i].panel);
  const content = captionsAreContent(i);
  const docked = content && phone;
  captionBus.els.length = caps.length;
  captionBus.prio = caps.map((c) => c.prio);
  captionBus.all = content;
  captionBus.docked = docked;
  return (
    <div className={`caps${content ? " content" : ""}${docked ? " docked" : ""}`} aria-hidden={content ? undefined : true} role={content ? "list" : undefined} aria-label={content ? "Contact" : undefined}>
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
            role={content ? "listitem" : undefined}
            ref={(el) => {
              captionBus.els[k] = el;
            }}
          >
            <span className="pin" />
            <span className="stem" />
            {c.href ? (
              <a className="chip-c" href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer noopener" tabIndex={content ? 0 : -1} aria-label={content ? `${c.value}: ${c.label}` : undefined}>
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
