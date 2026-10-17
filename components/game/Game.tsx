"use client";

import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect } from "react";

import { CAMERA, GRAVITY, PHYSICS, RENDER } from "./constants";
import { StartPrompt } from "./StartPrompt";
import { useIsTouch } from "./mobile/useIsTouch";
import { useGame } from "./store";

function Ready({ onReady }: { onReady: () => void }) {
  const setMode = useGame((s) => s.setMode);
  useEffect(() => {
    setMode("start");
    onReady();
  }, [onReady, setMode]);
  return null;
}

type GameProps = {
  onReady: () => void;
  onContextLost: () => void;
};

export default function Game({ onReady, onContextLost }: GameProps) {
  const mode = useGame((s) => s.mode);
  const touch = useIsTouch();

  return (
    <div className="fixed inset-0 bg-bg" style={{ height: "100dvh" }}>
      <Canvas
        dpr={touch ? RENDER.dprMobile : RENDER.dprDesktop}
        shadows={!touch}
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
        <Suspense fallback={null}>
          <Physics timeStep={PHYSICS.timeStep} interpolate gravity={[0, GRAVITY, 0]}>
            <hemisphereLight args={["#1a2340", "#0b1a2b", 0.8]} />
            <mesh position={[-40, 0.5, 30]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#dfe9f3" flatShading />
            </mesh>
          </Physics>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto">{mode === "start" ? <StartPrompt /> : null}</div>
      </div>
    </div>
  );
}
