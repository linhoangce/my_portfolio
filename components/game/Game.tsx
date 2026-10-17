"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import type { WebGLRenderer } from "three";

import type { Vec3 } from "@/data";
import { cameraState } from "./camera/cameraState";
import { CAMERA, GRAVITY, PHYSICS, RENDER } from "./constants";
import { Keyboard } from "./controller/Keyboard";
import { Hud } from "./hud/Hud";
import { Toasts } from "./hud/Toasts";
import { PortfolioMenu } from "./menu/PortfolioMenu";
import { MissionRunner } from "./missions/MissionRunner";
import { FocusController } from "./screens/FocusController";
import { StartPrompt } from "./StartPrompt";
import { useIsTouch } from "./mobile/useIsTouch";
import { penguinState } from "./penguin/penguinState";
import { useGame } from "./store";
import { floePosition } from "./world/Floes";
import { World } from "./world/World";

type DebugHandle = {
  penguin: typeof penguinState;
  camera: typeof cameraState;
  game: typeof useGame;
  floePosition: typeof floePosition;
  teleportRaw: (pos: Vec3, yaw: number) => void;
  renderer?: WebGLRenderer;
};

/** Exposes the renderer on the debug handle (draw-call counts for the performance checks). */
function RendererHandle() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const w = window as Window & { __tideLab?: DebugHandle };
    if (w.__tideLab) w.__tideLab.renderer = gl;
  }, [gl]);
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const setMode = useGame((s) => s.setMode);
  useEffect(() => {
    setMode("start");
    onReady();
  }, [onReady, setMode]);
  return null;
}

/** Read-only hooks for automated checks and tuning from the console. */
function useDebugHandle() {
  useEffect(() => {
    const w = window as Window & { __tideLab?: DebugHandle };
    w.__tideLab = {
      penguin: penguinState,
      camera: cameraState,
      game: useGame,
      floePosition,
      teleportRaw: (pos, yaw) => {
        const nonce = (useGame.getState().teleportRequest?.nonce ?? 0) + 1;
        useGame.setState({ teleportRequest: { pos, yaw, nonce } });
      },
    };
    return () => {
      delete w.__tideLab;
    };
  }, []);
}

type GameProps = {
  onReady: () => void;
  onContextLost: () => void;
};

export default function Game({ onReady, onContextLost }: GameProps) {
  const mode = useGame((s) => s.mode);
  const reducedEffects = useGame((s) => s.settings.reducedEffects);
  const touch = useIsTouch();
  useDebugHandle();
  const [dprScale, setDprScale] = useState(1);
  const [lowDetail, setLowDetail] = useState(false);

  const baseDpr = touch ? RENDER.dprMobile : RENDER.dprDesktop;
  const dpr: [number, number] = [baseDpr[0], Math.max(baseDpr[0], baseDpr[1] * dprScale)];
  const shadows = !touch && !reducedEffects && !lowDetail;

  return (
    <div className="fixed inset-0 bg-bg" style={{ height: "100dvh" }}>
      <Link
        href="/flat"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-bg"
      >
        Skip to flat version
      </Link>
      <Canvas
        dpr={dpr}
        shadows={shadows}
        camera={{ fov: CAMERA.fov, near: 0.1, far: 400, position: [-40, 4, 38] }}
        gl={{ antialias: !touch, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onContextLost();
          });
        }}
      >
        <color attach="background" args={["#05070f"]} />
        <RendererHandle />
        <PerformanceMonitor
          onDecline={() => {
            setDprScale((s) => (s > 0.75 ? 0.75 : s));
            setLowDetail(true);
          }}
          onIncline={() => setDprScale(1)}
          flipflops={2}
        />
        <Suspense fallback={null}>
          <Physics timeStep={PHYSICS.timeStep} interpolate gravity={[0, GRAVITY, 0]}>
            <World shadows={shadows} lowDetail={lowDetail || reducedEffects} />
          </Physics>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>

      <Keyboard />
      <MissionRunner />

      {/* Underwater tint, toggled by the camera via a data attribute (no re-render). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#0b1a2b]/60 opacity-0 transition-opacity duration-300 [html[data-underwater]_&]:opacity-100"
      />

      <div className="pointer-events-none absolute inset-0">
        <Hud />
        <Toasts />
        <FocusController />
        <div className="pointer-events-auto">
          {mode === "start" ? <StartPrompt /> : null}
          {mode === "menu" ? <PortfolioMenu /> : null}
        </div>
      </div>
    </div>
  );
}
