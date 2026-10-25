"use client";

import { useFrame } from "@react-three/fiber";
import { type Camera, Vector3 } from "three";

import { setRegistry } from "../sets/registry";
import { useTrain } from "../store";
import { captionBus } from "./captionBus";

const v = new Vector3();
const last: { x: number; y: number; on: boolean; flip: boolean; el: HTMLElement }[] = [];
const sizes = new WeakMap<HTMLElement, { w: number; h: number }>();

/**
 * Whether Contact's pinned chips would overlap one another (within `pad` px) or one of them would be lost behind the
 * camera, off screen or under the top bar or the controls along the bottom. Chip sizes are measured once per element.
 */
function contactCrowded(anchors: Vector3[], camera: Camera, W: number, H: number, left: number, top: number, bottom: number, pad: number): boolean {
  const boxes: [number, number, number, number][] = [];
  for (let k = 0; k < captionBus.els.length; k++) {
    const el = captionBus.els[k];
    const a = anchors[k];
    if (!el || !a) return true;
    let s = sizes.get(el);
    if (!s) {
      const chip = el.querySelector<HTMLElement>(".chip-c");
      s = { w: chip?.offsetWidth ?? 180, h: chip?.offsetHeight ?? 60 };
      sizes.set(el, s);
    }
    v.copy(a).project(camera);
    const x = (v.x * 0.5 + 0.5) * W;
    const y = (-v.y * 0.5 + 0.5) * H;
    const flip = x > Math.max(W / 2, W - 280);
    const x0 = flip ? x + 8 - s.w : x - 8;
    const y0 = y - 34 - s.h;
    if (v.z >= 1 || x0 < left + 10 || x0 + s.w > W - 10 || y0 < top || y > bottom) return true;
    boxes.push([x0, y0, x0 + s.w, y]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a0, b0, a1, b1] = boxes[i];
      const [c0, d0, c1, d1] = boxes[j];
      if (a0 < c1 + pad && c0 < a1 + pad && b0 < d1 + pad && d0 < b1 + pad) return true;
    }
  }
  return false;
}

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
    // the scene's card, bottom left on a desktop
    const left = st.overlay && !phone ? 32 + Math.min(420, W * 0.38) : 0;
    // clear of the top bar, and on a desktop of the stop buttons and the line map along the bottom
    const bottom = phone ? H * (st.overlay ? 0.58 : 0.86) : H - 96;
    const top = phone ? 70 : 72;
    const order = captionBus.prio.map((p, k) => [p, k]).sort((a, b) => a[0] - b[0]);
    // Contact's links must stay readable and reachable: on a desktop, when the view crowds their chips together or
    // loses one off screen, they line up in a row above the line map instead (with some slack before going back)
    const box = captionBus.els[0]?.parentElement;
    if (box && captionBus.all && !captionBus.docked) {
      const crowded = show && contactCrowded(anchors, state.camera, W, H, left, top, bottom, box.classList.contains("docked") ? 40 : 6);
      if (crowded !== box.classList.contains("docked")) {
        box.classList.toggle("docked", crowded);
        box.classList.toggle("wide", crowded);
      }
    }
    const docked = captionBus.docked || (captionBus.all && !!box?.classList.contains("docked"));
    let shown = 0;
    for (const [, k] of order) {
      const el = captionBus.els[k];
      if (!el) continue;
      const a = anchors[k];
      let on = show && !!a;
      let x = 0;
      let y = 0;
      if (docked) {
        // laid out by CSS along the bottom of the screen: only shown or hidden here
        if (on !== (last[k]?.on ?? false)) el.classList.toggle("on", on);
        last[k] = { x: -1, y: -1, on, flip: false, el };
        continue;
      }
      if (on && a) {
        v.copy(a).project(state.camera);
        x = (v.x * 0.5 + 0.5) * W;
        y = (-v.y * 0.5 + 0.5) * H;
        const far = a.distanceTo(state.camera.position) > 450;
        on = v.z < 1 && !far && x > left + 10 && x < W - 16 && y > top && y < bottom && (!phone || captionBus.all || shown < 3);
      }
      if (on) shown++;
      // a new scene renders new elements: start their state afresh
      if (!last[k] || last[k].el !== el) last[k] = { x: -1, y: -1, on: false, flip: false, el };
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
      // near the right edge (on a phone, anywhere in the right half) the chip hangs to the left of its pin
      const flip = x > Math.max(W / 2, W - 280);
      if (on && flip !== L.flip) {
        el.classList.toggle("flip", flip);
        L.flip = flip;
      }
    }
  }, -50);
  return null;
}
