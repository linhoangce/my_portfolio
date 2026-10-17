"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Lock } from "lucide-react";
import { useRef, useState } from "react";

import { PanelFor } from "@/components/panels";
import { type ScreenDef, type SectionId, missionById, missions, screens, sectionById } from "@/data";
import { cn } from "@/lib/utils";
import { SCREENS } from "../constants";
import { penguinState } from "../penguin/penguinState";
import { missionsDone, useGame } from "../store";
import { screenAnchor } from "./screenRegistry";

const DISTANCE_FACTOR = 400 / SCREENS.pxPerMetre;

/** Mounts the nearest screens (within mountDistance, at most maxMounted) as DOM, checked at checkHz. */
export function Screens() {
  const [mounted, setMounted] = useState<Set<SectionId>>(() => new Set());
  const acc = useRef(0);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 1 / SCREENS.checkHz) return;
    acc.current = 0;
    const p = penguinState.visualPos;
    const focused = useGame.getState().focusedScreen;
    const near = screens
      .map((s) => ({ id: s.id, d: screenAnchor(s).distanceTo(p) }))
      .filter((s) => s.d < SCREENS.mountDistance || s.id === focused)
      .sort((a, b) => a.d - b.d)
      .slice(0, SCREENS.maxMounted)
      .map((s) => s.id);
    setMounted((prev) => (prev.size === near.length && near.every((id) => prev.has(id)) ? prev : new Set(near)));
  });

  return (
    <>
      {screens.map((def) => (
        <WorldScreen key={def.id} def={def} mounted={mounted.has(def.id)} />
      ))}
    </>
  );
}

function LockedPanel({ id }: { id: SectionId }) {
  const section = sectionById[id];
  const mission = section.unlockedBy ? missionById[section.unlockedBy] : null;
  return (
    <div className="flex h-full flex-col justify-center gap-4 text-center">
      <Lock className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
      <p className="eyebrow">Locked</p>
      <h2 className="font-serif text-3xl text-fg">{section.title}</h2>
      {mission ? (
        <p className="text-sm text-muted">
          Complete <span className="text-fg">{mission.title}</span> to unlock it: {mission.objectiveText.toLowerCase()}.
        </p>
      ) : null}
      <p className="text-xs text-muted">Skip: open it from the portfolio menu (M).</p>
    </div>
  );
}

function WorldScreen({ def, mounted }: { def: ScreenDef; mounted: boolean }) {
  const anchor = screenAnchor(def);
  const unlocked = useGame((s) => s.unlocked[def.id]);
  const focused = useGame((s) => s.focusedScreen === def.id && s.mode === "focus");
  const overlay = useGame((s) => s.focusOverlay);
  const near = useGame((s) => s.nearScreen === def.id);
  const score = useGame((s) => s.score);
  const done = useGame((s) => missionsDone(s));
  const enterFocus = useGame((s) => s.enterFocus);
  const exitFocus = useGame((s) => s.exitFocus);

  const [w, h] = def.size;
  const pxW = Math.round(w * SCREENS.pxPerMetre);
  const pxH = Math.round(h * SCREENS.pxPerMetre);
  const section = sectionById[def.id];
  const interactive = focused && !overlay;

  return (
    <group position={anchor} rotation={[0, def.yaw, 0]}>
      {/* frame glow: cyan once unlocked, violet while locked; brighter when the visitor is close */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[w + 0.16, h + 0.16]} />
        <meshStandardMaterial
          color="#0e1424"
          emissive={unlocked ? "#5ef2ff" : "#a78bfa"}
          emissiveIntensity={near ? 0.55 : 0.2}
          roughness={0.4}
        />
      </mesh>
      {/* placeholder glass seen from afar */}
      <mesh position={[0, 0, -0.012]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#070b16" />
      </mesh>
      {mounted ? (
        <Html
          transform
          distanceFactor={DISTANCE_FACTOR}
          position={[0, 0, 0.01]}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: interactive || near ? "auto" : "none" }}
        >
          <div
            id={`screen-${def.id}`}
            role={interactive ? "dialog" : undefined}
            aria-modal={interactive ? true : undefined}
            aria-label={section.title}
            tabIndex={-1}
            onClick={() => {
              if (!focused && near) enterFocus(def.id);
            }}
            className={cn(
              "flex flex-col overflow-hidden rounded-xl border bg-[#0b1020]/95 text-fg shadow-[0_0_48px_rgba(94,242,255,0.16)] outline-none",
              unlocked ? "border-cyan/35" : "border-accent/35",
              !focused && near && "cursor-pointer",
            )}
            style={{ width: pxW, height: pxH, fontSize: 15 }}
          >
            {interactive ? (
              <header className="flex items-center justify-between gap-3 border-b border-border/15 px-5 py-2.5">
                <p className="eyebrow">{def.mount}</p>
                <button type="button" className="btn-ghost min-h-9 px-3 text-xs" onClick={exitFocus}>
                  Back · Esc
                </button>
              </header>
            ) : null}
            <div className={cn("flex-1 p-6", interactive ? "overflow-y-auto" : "overflow-hidden")}>
              {unlocked ? (
                <PanelFor id={def.id} score={def.id === "contact" ? { score, missionsDone: done, missionsTotal: missions.length } : undefined} />
              ) : (
                <LockedPanel id={def.id} />
              )}
            </div>
            {!focused ? (
              <footer className="border-t border-border/10 px-5 py-2 text-xs text-muted">
                {near ? (
                  <span className="text-cyan">Press E to read</span>
                ) : (
                  <span>{def.mount}</span>
                )}
              </footer>
            ) : null}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
