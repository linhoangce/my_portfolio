"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ACESFilmicToneMapping, type Group, HalfFloatType, WebGLRenderTarget } from "three";

import { CameraRig } from "./CameraRig";
import { City } from "./City";
import { Commons } from "./Commons";
import { Culture } from "./Culture";
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
import { AirTaxis } from "./AirTaxis";
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
import { useWorld } from "./world";
import { WorldProvider } from "./WorldProvider";

/** The room the metal and glass reflect, rendered once the first stage is up (world.ts environmentTarget). */
function Environment() {
  const world = useWorld();
  useEffect(() => world.fillEnvironment(), [world]);
  return null;
}

/**
 * One loading stage: its parts mount when the stage before is in, hidden; their shaders compile in the background
 * (KHR_parallel_shader_compile, so the frames keep coming while the driver works); then they appear, and the next stage
 * starts a frame later.
 */
let target: WebGLRenderTarget | null = null;
/** A render target to compile against while the bloom draws the scene into its own. */
const compileTarget = () => (target ??= new WebGLRenderTarget(1, 1, { type: HalfFloatType }));

function Stage({ n, children }: { n: number; children: ReactNode }) {
  const reached = useTrain((s) => s.loadStage >= n);
  const bloomOn = useTrain((s) => !s.env.lowEnd && s.quality.bloom);
  const group = useRef<Group>(null);
  const [shown, setShown] = useState(false);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const g = group.current;
    if (!reached || !g) return;
    let live = true;
    // compiled as it will be drawn, a frame after it mounts (the look has set the lights by then): its own lights
    // counted, and into the bloom's target when the bloom draws the scene (no tone mapping there, linear colour)
    const frame = requestAnimationFrame(() => {
      const prev = gl.getRenderTarget();
      if (bloomOn) gl.setRenderTarget(compileTarget());
      // out of the scene for the call: three counts the lights of the scene and of the part compiled, so a part that is
      // in the scene would have its own counted twice
      const parent = g.parent;
      const was = g.visible;
      parent?.remove(g);
      g.visible = true;
      const compiled = gl.compileAsync(g, camera, scene);
      g.visible = was;
      parent?.add(g);
      gl.setRenderTarget(prev);
      compiled
        .catch(() => undefined)
        .then(() => {
          if (!live) return;
          setShown(true);
          performance.mark(`ride:stage-${n}`);
          requestAnimationFrame(() => requestAnimationFrame(() => live && useTrain.getState().stageIn(n)));
        });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [reached, gl, camera, scene, n, bloomOn]);
  if (!reached) return null;
  return (
    <group ref={group} visible={shown}>
      {children}
    </group>
  );
}

/**
 * The whole ride in one canvas, loaded lazily by TrainGate and never rendered on the server. It comes in stages, what
 * the opening shot needs first, so the ride shows within moments and fills in rather than waiting for everything:
 * 0. the train (its headlights are lights: there from the start, so no shader compiles again for them), the sky, the
 *    mountains, the water and the land;
 * 1. the line: guideway, sets, landmarks, the hub, the other rail lines and ferries, the scene's captions;
 * 2. the city: buildings, streets, stations (their entrances keep clear of its lots), downtown's places and its art;
 * 3. trees, nature and the weather;
 * 4. life: traffic, people, boats and the air taxis, signals, bus stops, the events;
 * 5. reflections, the water's mirror, the quality watch, the monument picker and the debug hook.
 * The lights, the look, the drive, the camera and the bloom are there from the start: the shaders compile for the
 * lights and the target the scene is drawn into.
 */
export default function Scene({ onContextLost }: { onContextLost?: () => void }) {
  const lowEnd = useTrain((s) => s.env.lowEnd);
  const dpr = useTrain((s) => s.quality.dpr);
  const bloom = useTrain((s) => s.quality.bloom);
  // the curve exists as soon as track.ts is imported; the store needs its station positions before the first frame
  useState(() => {
    useTrain.getState().resetStages();
    useTrain.getState().registerTrack(stationS, LEN);
  });

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
        <Look />
        <Drive />
        <CameraRig />
        {!lowEnd && bloom ? <Effects /> : null}
        <Stage n={0}>
          <Train />
          <Sky />
          <Mountains />
          <Water />
          <Ground />
        </Stage>
        <Stage n={1}>
          <Environment />
          <Guideway />
          <Sets />
          <Landmarks />
          <Hub />
          <Millennium />
          <WestCoastExpress />
          <SeaBus />
          <CaptionProjector />
        </Stage>
        <Stage n={2}>
          <City />
          <Roads />
          <Stations />
          <Commons />
          <Culture />
        </Stage>
        <Stage n={3}>
          <Trees />
          <Nature />
          <Precipitation />
        </Stage>
        <Stage n={4}>
          <Life />
          <AirTaxis />
          <Signals />
          <BusStops />
          <Events />
        </Stage>
        <Stage n={5}>
          <Reflections />
          <Mirror />
          {!lowEnd ? <Perf /> : null}
          <MonumentPicker />
          <Debug />
        </Stage>
      </WorldProvider>
    </Canvas>
  );
}
