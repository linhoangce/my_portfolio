"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";

import { BLOCKERS } from "./cityModel";
import { CAM } from "./constants";
import { useTrain } from "./store";
import { frameAt, groundAt, makeFrame, stationS, UP } from "./track";
import { laneAt } from "./Train";

const fA = makeFrame();
const fB = makeFrame();
const want = new Vector3();
const wantLook = new Vector3();
const tmp = new Vector3();
const tmp2 = new Vector3();
const wrel = new Vector3();
const lrel = new Vector3();
const camPos = new Vector3();
const camLook = new Vector3();

const damp = (a: Vector3, b: Vector3, l: number, dt: number) => a.lerp(b, 1 - Math.exp(-l * dt));

/**
 * Chase, station and cab views. The wanted position and look are computed relative to the lead car on its lane,
 * those offsets are damped, then the car position is added back, so there is no lag at speed.
 */
export function CameraRig() {
  const relPos = useRef(new Vector3());
  const relLook = useRef(new Vector3());

  useFrame((state, delta) => {
    const st = useTrain.getState();
    const { sim, env } = st;
    if (!sim.stationS.length) return;
    const dt = Math.min(delta, 0.05) * sim.warp; // the damp is a stable lerp, so warp only shortens the easing
    const camera = state.camera;
    frameAt(sim.s, fA, laneAt(sim, sim.s));
    const head = fA.p;
    const phone = env.phone;
    if (st.cab) {
      want.copy(head).addScaledVector(UP, CAM.cab.up).addScaledVector(fA.t, CAM.cab.ahead);
      tmp.copy(fA.t).applyAxisAngle(UP, -sim.yawOff);
      wantLook.copy(want).addScaledVector(tmp, CAM.cab.look).addScaledVector(UP, -sim.pitchOff * 20 + 0.2);
    } else if (st.dockedIdx !== null && !sim.dragging && Math.abs(sim.yawOff) < 0.01) {
      frameAt(stationS[st.dockedIdx], fB);
      const c = phone ? CAM.stationPhone : CAM.station;
      // high enough to look over the near platform's canopy
      want.copy(fB.p).addScaledVector(fB.r, c.right).addScaledVector(UP, c.up).addScaledVector(fB.t, c.ahead);
      const shift = !phone && st.dockOpen ? CAM.dockShift : 0;
      wantLook.copy(fB.p).addScaledVector(UP, 2).addScaledVector(fB.t, -8 + shift).addScaledVector(fB.r, 1);
    } else {
      const dir = sim.travelDir;
      const c = phone ? CAM.chasePhone : CAM.chase;
      tmp.copy(fA.r).applyAxisAngle(UP, sim.yawOff);
      tmp2.copy(fA.t).applyAxisAngle(UP, sim.yawOff);
      const back = c.back + Math.abs(sim.v) * 0.1;
      want.copy(head).addScaledVector(tmp, c.right).addScaledVector(UP, c.up + sim.pitchOff * 8).addScaledVector(tmp2, -back * dir);
      wantLook.copy(head).addScaledVector(fA.t, -10 * dir).addScaledVector(UP, 1.6);
      if (st.dockedIdx === null && !sim.dragging) sim.yawOff *= Math.exp(-CAM.yawDecay * dt);
    }
    wrel.copy(want).sub(head);
    lrel.copy(wantLook).sub(head);
    if (!sim.camInit) {
      relPos.current.copy(wrel);
      relLook.current.copy(lrel);
      sim.camInit = true;
    }
    const l = env.reduced ? CAM.lambdaReduced : CAM.lambda;
    damp(relPos.current, wrel, l, dt);
    damp(relLook.current, lrel, l, dt);
    camPos.copy(head).add(relPos.current);
    camLook.copy(head).add(relLook.current);
    const gy = groundAt(camPos.x, camPos.z) + 2;
    if (camPos.y < gy) camPos.y = gy;
    // keep clear of the landmarks: rise over a low one (stadium roof, the sphere), slide around a tall one (Harbour Centre)
    for (const b of BLOCKERS) {
      const dx = camPos.x - b.x;
      const dz = camPos.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < b.r + CAM.blockerMargin && camPos.y < b.h + 3) {
        const rise = b.h + 3 - camPos.y;
        if (rise < CAM.blockerRise) camPos.y = b.h + 3;
        else {
          const k = (b.r + CAM.blockerMargin) / Math.max(d, 0.01);
          camPos.x = b.x + dx * k;
          camPos.z = b.z + dz * k;
        }
      }
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }, -80);

  return null;
}
