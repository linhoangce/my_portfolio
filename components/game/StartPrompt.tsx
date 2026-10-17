"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";

import { useGame } from "./store";
import { useFocusTrap } from "./useFocusTrap";

export function StartPrompt() {
  const ref = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const setMode = useGame((s) => s.setMode);
  const unlockAll = useGame((s) => s.unlockAll);
  const announce = useGame((s) => s.announce);

  const play = useCallback(() => {
    setMode("play");
    announce("You are the penguin. Walk to the colony board to start the first mission.");
  }, [setMode, announce]);

  const showWork = useCallback(() => {
    unlockAll();
    setMode("menu");
    announce("Portfolio menu opened with every section unlocked.");
  }, [unlockAll, setMode, announce]);

  useFocusTrap(ref, true, { initial: primary, onEscape: play });

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-bg/40 p-4 sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-title"
        aria-describedby="start-desc"
        tabIndex={-1}
        className="glass flex w-full max-w-md flex-col gap-5 p-6 sm:p-8"
      >
        <p className="eyebrow">Tide Lab outpost</p>
        <h2 id="start-title" className="font-serif text-4xl leading-tight text-fg">
          A portfolio you play.
        </h2>
        <p id="start-desc" className="text-sm text-muted">
          You are a penguin on an icy coast. Finish small missions to unlock the projects, or skip straight to the work.
        </p>
        <div className="flex flex-col gap-2">
          <button ref={primary} type="button" className="btn-primary" onClick={play}>
            Play as the penguin
          </button>
          <button type="button" className="btn-ghost" onClick={showWork}>
            Just show me the work
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
          <dt className="font-medium text-fg">WASD</dt>
          <dd>waddle</dd>
          <dt className="font-medium text-fg">Shift</dt>
          <dd>belly-slide on ice</dd>
          <dt className="font-medium text-fg">Space</dt>
          <dd>jump · dive and surface in water</dd>
          <dt className="font-medium text-fg">E</dt>
          <dd>read a screen</dd>
          <dt className="font-medium text-fg">M</dt>
          <dd>portfolio menu</dd>
          <dt className="font-medium text-fg">Drag</dt>
          <dd>orbit the camera · wheel to zoom</dd>
        </dl>
        <Link href="/flat" className="text-xs text-muted underline decoration-border/40 underline-offset-4 hover:text-fg">
          Prefer a normal page? Open the flat version.
        </Link>
      </div>
    </div>
  );
}
