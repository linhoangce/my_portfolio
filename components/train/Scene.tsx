"use client";

import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { ACESFilmicToneMapping } from "three";

import { CameraRig } from "./CameraRig";
import { City } from "./City";
import { CAM } from "./constants";
import { Debug } from "./Debug";
import { Drive } from "./Drive";
import { Effects } from "./Effects";
import { Ground } from "./Ground";
import { Guideway } from "./Guideway";
import { Landmarks } from "./Landmarks";
import { Life } from "./Life";
import { Lights } from "./Lights";
import { Look } from "./Look";
import { Mountains } from "./Mountains";
import { Perf } from "./Perf";
import { Precipitation } from "./Precipitation";
import { Sky } from "./Sky";
import { Stations } from "./Stations";
import { useTrain } from "./store";
import { LEN, stationS } from "./track";
import { Train } from "./Train";
import { Trees } from "./Trees";
import { Water } from "./Water";
import { WorldProvider } from "./WorldProvider";

/** The whole ride in one canvas. Loaded lazily by TrainGate; never rendered on the server. */
export default function Scene({ onContextLost }: { onContextLost?: () => void }) {
  const lowEnd = useTrain((s) => s.env.lowEnd);
  const dpr = useTrain((s) => s.quality.dpr);
  const bloom = useTrain((s) => s.quality.bloom);
  // the curve exists as soon as track.ts is imported; the store needs its station positions before the first frame
  useState(() => useTrain.getState().registerTrack(stationS, LEN));

  return (
    <Canvas
      className="!fixed inset-0"
      dpr={[1, dpr]}
      shadows={lowEnd ? false : "soft"}
      gl={{ antialias: !lowEnd, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping }}
      camera={{ fov: CAM.fov, near: CAM.near, far: CAM.far, position: [0, 30, 80] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost?.();
        });
      }}
    >
      <WorldProvider lowEnd={lowEnd}>
        <Lights />
        <Sky />
        <Ground />
        <Water />
        <Mountains />
        <City />
        <Trees />
        <Landmarks />
        <Guideway />
        <Stations />
        <Train />
        <Life />
        <Precipitation />
        <Drive />
        <CameraRig />
        <Look />
        {!lowEnd && bloom ? <Effects /> : null}
        {!lowEnd ? <Perf /> : null}
        <Debug />
      </WorldProvider>
    </Canvas>
  );
}
