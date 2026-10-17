"use client";

import Link from "next/link";

import { missionById, screenById } from "@/data";
import { useGame } from "../store";

const moveLabel: Record<string, string> = {
  walk: "Walking",
  slide: "Sliding",
  swim: "Swimming",
  dive: "Diving",
};

function objectiveTarget(id: string): number {
  const m = missionById[id as keyof typeof missionById];
  const o = m.objective;
  if (o.type === "collect" || o.type === "collectTagged" || o.type === "herd") return o.count;
  if (o.type === "aim") return o.targets;
  return 1;
}

/** Score, mission tracker, mode chip, interaction prompt and the aria-live region. */
export function Hud() {
  const mode = useGame((s) => s.mode);
  const score = useGame((s) => s.score);
  const activeId = useGame((s) => s.activeMissionId);
  const progress = useGame((s) => (s.activeMissionId ? s.missions[s.activeMissionId].progress : 0));
  const move = useGame((s) => s.move);
  const diving = useGame((s) => s.diving);
  const near = useGame((s) => s.nearScreen);
  const unlocked = useGame((s) => (s.nearScreen ? s.unlocked[s.nearScreen] : false));
  const live = useGame((s) => s.liveMessage);
  const openMenu = useGame((s) => s.openMenu);

  const mission = activeId ? missionById[activeId] : null;
  const target = activeId ? objectiveTarget(activeId) : 1;
  const label = move === "swim" && diving ? moveLabel.dive : moveLabel[move];

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </div>
      {mode === "play" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-5 safe-bottom">
          <div className="flex items-start justify-between gap-3">
            <div className="glass flex min-w-[220px] max-w-sm flex-col gap-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <p className="eyebrow">Score</p>
                <p className="font-serif text-2xl leading-none text-cyan" data-testid="score">
                  {score}
                </p>
              </div>
              {mission ? (
                <div className="border-t border-border/10 pt-2" data-testid="mission">
                  <p className="text-sm font-medium text-fg">
                    {mission.title}
                    {target > 1 ? (
                      <span className="ml-2 text-xs text-muted">
                        {Math.min(progress, target)} / {target}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">{mission.objectiveText}</p>
                </div>
              ) : (
                <p className="border-t border-border/10 pt-2 text-xs text-muted">Explore. Missions start at their boards and shores.</p>
              )}
            </div>
            <div className="glass px-3 py-2 text-xs text-muted" data-testid="move-mode">
              {label}
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col items-start gap-2">
              {near ? (
                <p className="glass px-4 py-2 text-sm text-fg" data-testid="prompt">
                  <kbd className="mr-2 rounded border border-border/30 bg-surface px-1.5 py-0.5 text-xs">E</kbd>
                  {unlocked ? "Read" : "Inspect"} the {screenById[near].mount.toLowerCase()}
                </p>
              ) : (
                <p className="glass px-4 py-2 text-xs text-muted">WASD move · Shift slide · Space jump · drag to look</p>
              )}
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <button type="button" className="btn-ghost min-h-10 px-4 text-sm" onClick={openMenu}>
                <kbd className="rounded border border-border/30 bg-surface px-1.5 py-0.5 text-xs">M</kbd>
                Menu
              </button>
              <Link href="/flat" className="btn-ghost min-h-10 px-4 text-sm">
                Flat version
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
