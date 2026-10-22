"use client";

import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { ACESFilmicToneMapping } from "three";

import { CameraRig } from "./CameraRig";
import { City } from "./City";
import { Commons } from "./Commons";
import { CAM } from "./constants";
import { Debug } from "./Debug";
import { Drive } from "./Drive";
import { Effects } from "./Effects";
import { Events } from "./Events";
import { Ground } from "./Ground";
import { Guideway } from "./Guideway";
import { Hub } from "./Hub";
import { Millennium } from "./Millennium";
import { Roads } from "./Roads";
import { BusStops } from "./BusStops";
import { WestCoastExpress } from "./WestCoastExpress";
import { SeaBus } from "./SeaBus";
import { Signals } from "./Signals";
import { Landmarks } from "./Landmarks";
import { Life } from "./Life";
import { Lights } from "./Lights";
import { Look } from "./Look";
import { Mountains } from "./Mountains";
import { Nature } from "./Nature";
import { Perf } from "./Perf";
import { Precipitation } from "./Precipitation";
import { CaptionProjector } from "./scene/CaptionProjector";
import { MonumentPicker } from "./scene/MonumentPicker";
import { Sets } from "./sets/Sets";
import { Sky } from "./Sky";
import { Stations } from "./Stations";
import { useTrain } from "./store";
import { LEN, stationS } from "./track";
import { Train } from "./Train";
import { Trees } from "./Trees";
import { Mirror } from "./Mirror";
import { Reflections } from "./Reflections";
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
        <Roads />
        <Signals />
        <BusStops />
        <WestCoastExpress />
        <SeaBus />
        <Water />
        <Reflections />
        <Mirror />
        <Mountains />
        <City />
        <Trees />
        <Landmarks />
        <Commons />
        <Events />
        <Nature />
        <Guideway />
        <Stations />
        <Sets />
        <Train />
        <Millennium />
        <Hub />
        <Life />
        <Precipitation />
        <Drive />
        <CameraRig />
        <MonumentPicker />
        <CaptionProjector />
        <Look />
        {!lowEnd && bloom ? <Effects /> : null}
        {!lowEnd ? <Perf /> : null}
        <Debug />
      </WorldProvider>
    </Canvas>
  );
}
