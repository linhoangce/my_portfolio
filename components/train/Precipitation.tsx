"use client";

import { useFrame } from "@react-three/fiber";
import type { BufferAttribute } from "three";

import { useWorld } from "./world";

/** Rain streaks and snow around the camera; both follow it. The look toggles their visibility. */
export function Precipitation() {
  const { precip } = useWorld();
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const cam = state.camera.position;
    const { rain, rainPos, rainVel, RAIN_N, snow, snowPos, SNOW_N } = precip;
    if (rain.visible) {
      rain.position.copy(cam);
      for (let i = 0; i < RAIN_N; i++) {
        let y = rainPos[i * 6 + 1] - rainVel[i] * dt;
        if (y < -30) {
          y = 40;
          const a = Math.random() * 6.28;
          const r = 8 + Math.random() * 60;
          rainPos[i * 6] = Math.cos(a) * r;
          rainPos[i * 6 + 2] = Math.sin(a) * r;
        }
        rainPos[i * 6 + 1] = y;
        rainPos[i * 6 + 3] = rainPos[i * 6] + 0.15;
        rainPos[i * 6 + 4] = y - 1.1;
        rainPos[i * 6 + 5] = rainPos[i * 6 + 2];
      }
      (rain.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    }
    if (snow.visible) {
      snow.position.copy(cam);
      const t = state.clock.elapsedTime;
      for (let i = 0; i < SNOW_N; i++) {
        let y = snowPos[i * 3 + 1] - 7 * dt;
        snowPos[i * 3] += Math.sin(t * 0.8 + i) * dt * 1.5;
        if (y < -30) {
          y = 40;
          snowPos[i * 3] = (Math.random() - 0.5) * 120;
          snowPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
        }
        snowPos[i * 3 + 1] = y;
      }
      (snow.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    }
  }, -50);
  return null;
}
