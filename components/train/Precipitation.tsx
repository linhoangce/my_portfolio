"use client";

import { useFrame } from "@react-three/fiber";
import { type BufferAttribute, type LineBasicMaterial, Vector3 } from "three";

import { useWorld } from "./world";

const look = new Vector3();

/**
 * Rain streaks and snow around the camera; both follow it. The look toggles their visibility. Rain falls close round
 * the camera and fades as the view tips down toward the ground: seen from above, far streaks over the dark deck of the
 * guideway read as static, not rain.
 */
export function Precipitation() {
  const { precip } = useWorld();
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const cam = state.camera.position;
    const { rain, rainPos, rainVel, RAIN_N, snow, snowPos, SNOW_N } = precip;
    if (rain.visible) {
      rain.position.copy(cam);
      state.camera.getWorldDirection(look);
      (rain.material as LineBasicMaterial).opacity = 0.2 * Math.min(1, Math.max(0, (look.y + 0.8) / 0.45));
      for (let i = 0; i < RAIN_N; i++) {
        let y = rainPos[i * 6 + 1] - rainVel[i] * dt;
        if (y < -20) {
          y = 30;
          const a = Math.random() * 6.28;
          const r = 3 + Math.random() * 32;
          rainPos[i * 6] = Math.cos(a) * r;
          rainPos[i * 6 + 2] = Math.sin(a) * r;
        }
        rainPos[i * 6 + 1] = y;
        rainPos[i * 6 + 3] = rainPos[i * 6] + 0.2;
        rainPos[i * 6 + 4] = y - 1.6;
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
