"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useRef } from "react";

import { missionById, missions, sections } from "@/data";
import { cn } from "@/lib/utils";
import { missionsDone, useGame } from "../store";
import { useFocusTrap } from "../useFocusTrap";

const settingLabels = {
  sound: "Sound (arrives with the audio pass)",
  reducedEffects: "Reduced effects (no shadows, fewer stars)",
  easySeal: "Easy seal (arrives with the seal)",
  invertY: "Invert camera Y",
} as const;

/** Portfolio menu (M): every section, teleport, settings, controls and the flat link. */
export function PortfolioMenu() {
  const ref = useRef<HTMLDivElement>(null);
  const closeMenu = useGame((s) => s.closeMenu);
  const teleportTo = useGame((s) => s.teleportTo);
  const teleportToSpawn = useGame((s) => s.teleportToSpawn);
  const unlocked = useGame((s) => s.unlocked);
  const missionState = useGame((s) => s.missions);
  const score = useGame((s) => s.score);
  const done = useGame((s) => missionsDone(s));
  const settings = useGame((s) => s.settings);
  const toggleSetting = useGame((s) => s.toggleSetting);

  useFocusTrap(ref, true, { onEscape: closeMenu });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/60 p-3 backdrop-blur-sm sm:p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-title"
        tabIndex={-1}
        className="glass flex max-h-[92dvh] w-full max-w-2xl flex-col gap-6 overflow-y-auto p-5 outline-none sm:p-8"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h2 id="menu-title" className="font-serif text-4xl leading-tight text-fg">
              Where to?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Score {score} · {done} of {missions.length} missions done. Teleporting unlocks a section without points.
            </p>
          </div>
          <button type="button" className="btn-ghost min-h-10 shrink-0 whitespace-nowrap px-4 text-sm" onClick={closeMenu}>
            Resume · Esc
          </button>
        </header>

        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Sections">
          {sections.map((section) => {
            const isUnlocked = unlocked[section.id];
            const mission = section.unlockedBy ? missionById[section.unlockedBy] : null;
            const missionDone = mission ? missionState[mission.id].status === "done" : true;
            return (
              <li key={section.id} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3", isUnlocked ? "border-border/15 bg-surface/50" : "border-accent/25 bg-surface/30")}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-fg">
                    {!isUnlocked ? <Lock className="h-3.5 w-3.5 text-accent" aria-label="Locked" /> : null}
                    {section.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {section.place}
                    {mission && !missionDone ? ` · ${mission.title}` : ""}
                  </p>
                </div>
                <button type="button" className="btn-ghost min-h-9 shrink-0 px-3 text-xs" onClick={() => teleportTo(section.id)}>
                  {isUnlocked ? "Go there" : "Skip there"}
                </button>
              </li>
            );
          })}
        </ul>

        <section aria-labelledby="settings-title" className="flex flex-col gap-2">
          <h3 id="settings-title" className="eyebrow">
            Settings
          </h3>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(settingLabels) as (keyof typeof settingLabels)[]).map((key) => (
              <label key={key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-fg hover:bg-surface/60">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--cyan))]"
                  checked={settings[key]}
                  onChange={() => toggleSetting(key)}
                />
                {settingLabels[key]}
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="controls-title" className="flex flex-col gap-2">
          <h3 id="controls-title" className="eyebrow">
            Controls
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-muted sm:grid-cols-[auto_1fr_auto_1fr]">
            <dt className="font-medium text-fg">WASD / arrows</dt>
            <dd>move</dd>
            <dt className="font-medium text-fg">Shift</dt>
            <dd>belly-slide on ice</dd>
            <dt className="font-medium text-fg">Space</dt>
            <dd>jump · dive / surface</dd>
            <dt className="font-medium text-fg">E</dt>
            <dd>read a screen</dd>
            <dt className="font-medium text-fg">Drag · wheel</dt>
            <dd>orbit · zoom</dd>
            <dt className="font-medium text-fg">M · Esc</dt>
            <dd>menu · back</dd>
          </dl>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/10 pt-4 text-sm">
          <button type="button" className="btn-ghost min-h-9 px-3 text-xs" onClick={teleportToSpawn}>
            Unstick (back to spawn)
          </button>
          <Link href="/flat" className="btn-ghost min-h-9 px-3 text-xs">
            Flat version
          </Link>
        </footer>
      </div>
    </div>
  );
}
