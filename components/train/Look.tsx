"use client";

import { useFrame } from "@react-three/fiber";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { AUTO_LOOK_PERIOD, TRAIN_LEN } from "./constants";
import { applyLook, tickLook } from "./lookModel";
import { useTrain } from "./store";
import { frameAt, makeFrame, nearestStation, stationS, UP } from "./track";
import { useWorld } from "./world";

const fA = makeFrame();
const fB = makeFrame();

/**
 * Applies theme × season × weather, runs the automatic cycle, eases the look every frame and keeps the sun, sky,
 * stars and station light where they belong.
 */
export function Look() {
  const world = useWorld();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  const season = useTrain((s) => s.season);
  const weather = useTrain((s) => s.weather);
  const first = useRef(true);
  const autoT = useRef(0);

  useEffect(() => {
    applyLook(world, { theme, season, weather });
  }, [world, theme, season, weather]);

  useFrame((state, delta) => {
    const st = useTrain.getState();
    const dt = Math.min(delta, 0.05) * st.sim.warp;
    if (st.autoLook) {
      autoT.current += dt;
      if (autoT.current > AUTO_LOOK_PERIOD) {
        autoT.current = 0;
        st.advanceCycle();
      }
    } else autoT.current = 0;
    tickLook(world, dt, st.env.reduced || first.current, st.dockedIdx);
    first.current = false;

    const { sim } = st;
    if (!sim.stationS.length) return;
    const cam = state.camera.position;
    frameAt(sim.s - TRAIN_LEN / 2, fA);
    world.lights.sun.position.copy(fA.p).addScaledVector(world.sunDir, 220);
    world.lights.sun.target.position.copy(fA.p);
    world.sky.mesh.position.copy(cam);
    world.sky.stars.position.copy(cam);
    world.sky.disc.position.copy(cam).addScaledVector(world.sunDir, 2400);
    const ni = nearestStation(sim.s);
    frameAt(stationS[ni], fB);
    world.lights.stationLight.position.copy(fB.p).addScaledVector(fB.r, -5).addScaledVector(UP, 6);
  }, -60);

  return null;
}
