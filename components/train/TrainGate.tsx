"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AskPanel } from "@/components/ask/AskPanel";

import { PHONE_MAX_WIDTH } from "./constants";
import { DriveButtons } from "./controls/DriveButtons";
import { Keyboard } from "./controls/Keyboard";
import { Pointer } from "./controls/Pointer";
import { Wheel } from "./controls/Wheel";
import { useTrain } from "./store";
import { FilmFx } from "./ui/FilmFx";
import { Intro } from "./ui/Intro";
import { Help, Menu } from "./ui/Menu";
import { MonumentCard } from "./ui/MonumentCard";
import { Readout } from "./ui/Readout";
import { MapCredit } from "./ui/MapCredit";
import { SceneCaptions } from "./ui/SceneCaptions";
import { SceneOverlay } from "./ui/SceneOverlay";
import { TopBar } from "./ui/TopBar";

const Scene = dynamic(() => import("./Scene"), { ssr: false, loading: () => null });

type Gate = "checking" | "redirect" | "ok" | "lost";

type NavigatorExtras = Navigator & { connection?: { saveData?: boolean } };

/** WebGL2 and data-saver check; anything that fails goes to /text. */
function canRide(): boolean {
  try {
    const nav = navigator as NavigatorExtras;
    if (nav.connection?.saveData) return false;
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Client gate for the home page: checks capabilities, redirects to /text when the ride would be a bad experience,
 * otherwise lazy-loads the scene chunk under the DOM shell (top bar, HUD, intro, dock, attendant).
 */
export function TrainGate() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    if (!canRide()) {
      setGate("redirect");
      router.replace("/text");
      return;
    }
    const setEnv = useTrain.getState().setEnv;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const phone = () => window.innerWidth < PHONE_MAX_WIDTH;
    const lite = /[?&]lite=1/.test(window.location.search); // forces the phone budget (used by the headless checks)
    setEnv({ coarse, reduced: reducedMq.matches, phone: phone(), lowEnd: coarse || phone() || lite });
    // ?film=0: arrivals open the section without the film (a visitor setting and a harness switch)
    if (/[?&]film=0/.test(window.location.search)) useTrain.getState().setFilmOn(false);
    const onResize = () => setEnv({ phone: phone() });
    const onMotion = () => setEnv({ reduced: reducedMq.matches });
    window.addEventListener("resize", onResize);
    reducedMq.addEventListener("change", onMotion);
    setGate("ok");
    return () => {
      window.removeEventListener("resize", onResize);
      reducedMq.removeEventListener("change", onMotion);
    };
  }, [router]);

  useEffect(() => {
    if (gate !== "ok") return;
    document.documentElement.dataset.train = "1";
    return () => {
      delete document.documentElement.dataset.train;
    };
  }, [gate]);

  const onContextLost = useCallback(() => setGate("lost"), []);

  if (gate === "redirect") {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg px-6 text-center text-sm text-muted">
        <p>
          This browser cannot run the ride, so here is the text version.{" "}
          <Link href="/text" className="text-fg underline underline-offset-4">
            Open it
          </Link>
          .
        </p>
      </div>
    );
  }
  if (gate === "checking") return <div className="fixed inset-0 bg-bg" aria-hidden="true" />;
  if (gate === "lost") {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center" role="alert">
        <h1 className="font-serif text-3xl text-fg">The graphics context was lost.</h1>
        <p className="max-w-sm text-sm text-muted">The browser dropped WebGL. Reload to try again, or read the text version.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <Link href="/text" className="btn">
            Text version
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Pointer>
        <Scene onContextLost={onContextLost} />
      </Pointer>
      <Keyboard />
      <Wheel />
      <FilmFx />
      <TopBar />
      <Readout />
      <MapCredit />
      <DriveButtons />
      <SceneCaptions />
      <SceneOverlay />
      <MonumentCard />
      <Menu />
      <Help />
      <Intro />
      <AskPanel />
    </>
  );
}
