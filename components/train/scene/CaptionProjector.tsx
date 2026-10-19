"use client";

import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

import { setRegistry } from "../sets/registry";
import { useTrain } from "../store";
import { captionBus } from "./captionBus";

const v = new Vector3();
const last: { x: number; y: number; on: boolean; el: HTMLElement }[] = [];

/**
 * Projects the scene's caption anchors to the screen after the camera has moved, writing a transform only when a
 * caption moved by more than 0.3 px. A caption hides behind the camera, off screen, too far, under the overlay
 * column, or (on phones) beyond the top three or below the bottom sheet's edge.
 */
export function CaptionProjector() {
  useFrame((state) => {
    const st = useTrain.getState();
    const anchors = setRegistry.sets?.[st.sceneIdx]?.anchors ?? [];
    const ph = st.scenePhase;
    const show = st.filmOn && st.introDone && !st.monument && (ph === "hold" || (ph === "establish" && st.sceneStage >= 3));
    const W = state.size.width;
    const H = state.size.height;
    const phone = st.env.phone;
    const left = st.overlay && !phone ? Math.min(560, W * 0.46) * 0.8 : 0;
    const bottom = phone ? H * (st.overlay ? 0.58 : 0.86) : H - Math.max(64, Math.min(110, H * 0.1)) - 12;
    const top = phone ? 70 : Math.max(64, Math.min(110, H * 0.1)) + 8;
    const order = captionBus.prio.map((p, k) => [p, k]).sort((a, b) => a[0] - b[0]);
    let shown = 0;
    for (const [, k] of order) {
      const el = captionBus.els[k];
      if (!el) continue;
      const a = anchors[k];
      let on = show && !!a;
      let x = 0;
      let y = 0;
      if (on && a) {
        v.copy(a).project(state.camera);
        x = (v.x * 0.5 + 0.5) * W;
        y = (-v.y * 0.5 + 0.5) * H;
        const far = a.distanceTo(state.camera.position) > 450;
        on = v.z < 1 && !far && x > left + 10 && x < W - 40 && y > top && y < bottom && (!phone || shown < 3);
      }
      if (on) shown++;
      // a new scene renders new elements: start their state afresh
      if (!last[k] || last[k].el !== el) last[k] = { x: -1, y: -1, on: false, el };
      const L = last[k];
      if (on && (Math.abs(x - L.x) > 0.3 || Math.abs(y - L.y) > 0.3)) {
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        L.x = x;
        L.y = y;
      }
      if (on !== L.on) {
        el.classList.toggle("on", on);
        L.on = on;
      }
    }
  }, -50);
  return null;
}
