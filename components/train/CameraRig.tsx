"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type PerspectiveCamera, Vector3 } from "three";

import { roofAt } from "./camSafe";
import { CAM, HEAD } from "./constants";
import { awayYaw, fitDistance, MONUMENT_BY_KEY, monumentFocus } from "./monuments";
import { BLOCKERS, LANDMARKS } from "./sites";
import { type TrainState, useTrain } from "./store";
import { groundAt, makeFrame, trainFrameAt, UP } from "./track";
import { laneAt } from "./Train";

type Mode = "chase" | "cab" | "monument" | "free";

const fA = makeFrame();
const want = new Vector3();
const wantLook = new Vector3();
const tmp = new Vector3();
const h = new Vector3();
const wrel = new Vector3();
const lrel = new Vector3();

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const ease = (u: number) => {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
};
const damp = (a: Vector3, b: Vector3, l: number, dt: number) => a.lerp(b, 1 - Math.exp(-l * dt));
const sph = (focus: Vector3, yaw: number, pitch: number, dist: number, out: Vector3) =>
  out.set(focus.x + Math.cos(pitch) * Math.cos(yaw) * dist, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * Math.sin(yaw) * dist);

function resolveMode(st: TrainState): Mode {
  if (st.sim.freeCam) return "free";
  if (st.monument) return "monument";
  if (st.cab) return "cab";
  return "chase";
}

/** How long to blend from one mode into another (0 = cut). */
function blendFor(from: Mode, to: Mode): number {
  if (from === "free" || to === "free") return 0;
  if (to === "monument") return 1.2;
  if (from === "monument") return 1.0;
  if (from === "cab" || to === "cab") return 0.5;
  return 0;
}

/**
 * Chase (360° orbit and zoom around the train), the cab and the monument view. The chase keeps its distance and height
 * whether the train runs or stands at a stop, so arriving, leaving or ending a scene never zooms; while a stop's scene
 * is on it turns slowly round the standing train, and swings back behind it once the train moves off. The chase and cab
 * poses are damped as offsets from the lead car, so there is no lag at speed; a change of mode blends from a snapshot
 * of the last pose. Last come the constraints: above the ground, out of building boxes (rise fast, settle slowly) and
 * clear of the landmarks the view does not own. A view offset keeps the train clear of the scene overlay.
 */
export function CameraRig() {
  const relPos = useRef(new Vector3());
  const relLook = useRef(new Vector3());
  const look = useRef(new Vector3());
  const rig = useRef({ mode: "chase" as Mode, w: 1, dur: 1, snapP: new Vector3(), snapL: new Vector3(), lift: 0, shift: 0, shiftY: 0, mon: null as string | null, arm: 1 });

  useFrame((state, delta) => {
    const st = useTrain.getState();
    const { sim, env } = st;
    if (!sim.stationS.length) return;
    const real = Math.min(delta, 0.05);
    const dt = real * sim.warp; // the damps are stable lerps, so warp only shortens the easing
    const camera = state.camera as PerspectiveCamera;
    const R = rig.current;
    const reduced = env.reduced;
    const phone = env.phone;

    const mode = resolveMode(st);
    if (mode !== R.mode) {
      const dur = blendFor(R.mode, mode);
      R.snapP.copy(camera.position);
      R.snapL.copy(look.current);
      R.w = dur > 0 ? 0 : 1;
      R.dur = reduced ? Math.min(dur, 0.25) : dur;
      R.mode = mode;
    }
    if (st.monument !== R.mon) {
      R.mon = st.monument;
      if (st.monument) sim.mon.yaw = awayYaw(st.monument);
    }
    if (sim.held) {
      if (mode === "monument") sim.mon.yaw += sim.held * real * 1.4;
      else sim.orbit.yaw += sim.held * real * 1.4;
      sim.orbit.idle = 0;
    }

    // the lead car: the chase and the cab ride with it
    const headS = sim.s + sim.travelDir * HEAD;
    trainFrameAt(headS, sim.travelDir, laneAt(sim, headS), fA);
    const head = fA.p;
    const relative = mode === "chase" || mode === "cab";
    if (mode === "free" && sim.freeCam) {
      want.set(...sim.freeCam.pos);
      wantLook.set(...sim.freeCam.look);
    } else if (mode === "monument" && st.monument) {
      const m = MONUMENT_BY_KEY[st.monument];
      const focus = monumentFocus(st.monument);
      if (!reduced && !sim.dragging) sim.mon.yaw += real * 0.07;
      const dist = fitDistance(m?.r ?? 20, camera.fov, camera.aspect) * Math.exp(sim.mon.zoom);
      sph(focus, sim.mon.yaw, clamp(sim.mon.pitch, 0.05, 1.3), dist, want);
      wantLook.copy(focus);
    } else if (mode === "cab") {
      want.copy(head).addScaledVector(UP, CAM.cab.up).addScaledVector(fA.t, CAM.cab.ahead * sim.travelDir);
      tmp.copy(fA.t).multiplyScalar(sim.travelDir).applyAxisAngle(UP, clamp(sim.orbit.yaw, -1.8, 1.8));
      wantLook.copy(want).addScaledVector(tmp, CAM.cab.look).addScaledVector(UP, clamp(sim.orbit.pitch, -0.4, 0.4) * -20 + 0.2);
    } else {
      // chase: the base offset as angles relative to the train, plus the visitor's orbit (yaw unbounded) and zoom. The
      // same at a stop as on the move: back and up over the line, low enough to see well down it ahead of the train
      const dir = sim.travelDir;
      const c = phone ? CAM.chasePhone : env.lowEnd ? CAM.chaseLite : CAM.chase;
      // ride on the right of the train unless a landmark is there and the left is clear, then swing over
      const blocked = (side: number) => {
        tmp.copy(head).addScaledVector(fA.r, c.right * 1.6 * side * dir).addScaledVector(fA.t, -c.back * dir * 0.8);
        return BLOCKERS.some((b) => b.h > 8 && Math.hypot(tmp.x - b.x, tmp.z - b.z) < b.r + 8);
      };
      if (blocked(sim.camSide) && !blocked(-sim.camSide)) sim.camSide = sim.camSide > 0 ? -1 : 1;
      else if (sim.camSide < 0 && !blocked(1)) sim.camSide = 1;
      const yaw0 = Math.atan2(c.right * sim.camSide, c.back);
      const pitch0 = Math.atan2(c.up, Math.hypot(c.right, c.back));
      const dist = Math.hypot(c.right, c.back, c.up) * Math.exp(sim.orbit.zoom);
      const yaw = yaw0 + sim.orbit.yaw;
      const pitch = clamp(pitch0 + sim.orbit.pitch, -0.05, 1.45);
      h.copy(fA.t).multiplyScalar(-dir * Math.cos(yaw)).addScaledVector(fA.r, Math.sin(yaw) * dir).setY(0).normalize();
      want.copy(head).addScaledVector(h, Math.cos(pitch) * dist).addScaledVector(UP, Math.sin(pitch) * dist);
      // look down the line ahead of the train; as the visitor turns the view to the side or the front, back to the train
      const ahead = c.ahead * Math.max(0, Math.cos(sim.orbit.yaw));
      wantLook.copy(head).addScaledVector(fA.t, ahead * dir).addScaledVector(UP, 1.6);
      // standing at a stop with its scene on, the view turns slowly round the train
      const ph = sim.film.phase;
      if ((ph === "establish" || ph === "hold") && Math.abs(sim.v) < 0.5 && !reduced && !sim.dragging) sim.orbit.yaw += real * 0.025;
      // the view swings back behind the train after 3 s without input, once it is moving; the height and distance a
      // visitor chose stay as they are
      if (!sim.dragging && !sim.held) {
        sim.orbit.idle += dt;
        if (sim.orbit.idle > 3 && Math.abs(sim.v) > 4) {
          const k = Math.exp(-dt * CAM.yawDecay);
          sim.orbit.yaw = Math.atan2(Math.sin(sim.orbit.yaw), Math.cos(sim.orbit.yaw)) * k;
        }
      }
    }

    // the monument view: a spring arm from the focus pulls the camera in before the first building in the way
    if (mode === "monument") {
      const steps = 28;
      let clear = 1;
      for (let k = 3; k <= steps; k++) {
        const u = k / steps;
        const x = wantLook.x + (want.x - wantLook.x) * u;
        const y = wantLook.y + (want.y - wantLook.y) * u;
        const z = wantLook.z + (want.z - wantLook.z) * u;
        if (y < roofAt(x, z, 0.5, env.lowEnd)) {
          clear = Math.max(0.25, (k - 1.5) / steps);
          break;
        }
      }
      R.arm = clear < R.arm ? R.arm + (clear - R.arm) * (1 - Math.exp(-8 * real)) : R.arm + (clear - R.arm) * (1 - Math.exp(-1.2 * real));
      want.lerpVectors(wantLook, want, R.arm);
    } else R.arm = 1;

    if (relative) {
      wrel.copy(want).sub(head);
      lrel.copy(wantLook).sub(head);
      if (!sim.camInit) {
        relPos.current.copy(wrel);
        relLook.current.copy(lrel);
        sim.camInit = true;
      }
      const l = reduced ? CAM.lambdaReduced : CAM.lambda;
      damp(relPos.current, wrel, l, dt);
      damp(relLook.current, lrel, l, dt);
      want.copy(head).add(relPos.current);
      wantLook.copy(head).add(relLook.current);
    } else {
      // keep the chase offsets seeded from wherever the camera is, so returning to it does not pop
      relPos.current.copy(camera.position).sub(head);
      relLook.current.copy(look.current).sub(head);
      sim.camInit = true;
    }
    if (R.w < 1) {
      // on the warped clock, so the headless checks (which speed time up) see blends finish
      R.w = Math.min(1, R.w + dt / Math.max(R.dur, 1e-3));
      const w = ease(R.w);
      want.lerpVectors(R.snapP, want, w);
      wantLook.lerpVectors(R.snapL, wantLook, w);
    }

    if (mode !== "free") {
      // the ground, then building boxes: rise fast, settle slowly
      const floor = Math.max(groundAt(want.x, want.z) + 2, roofAt(want.x, want.z, 1.5, env.lowEnd));
      const need = Math.max(0, floor - want.y);
      // the chase rises over a roof fast and settles slowly; the monument view has its spring arm instead
      R.lift = mode === "monument" || need > R.lift ? need : R.lift + (need - R.lift) * (1 - Math.exp(-1.5 * real));
      want.y = Math.max(want.y + R.lift, floor);
      // landmarks the view does not own: the chase rises over them, the monument view stays outside
      BLOCKERS.forEach((b, i) => {
        if (LANDMARKS[i].key === st.monument) return;
        const dx = want.x - b.x;
        const dz = want.z - b.z;
        const d = Math.hypot(dx, dz);
        const R2 = b.r + 4;
        const top = b.top + 3;
        if (d >= R2 || want.y >= top) return;
        if (mode === "chase" || mode === "cab") {
          const s = ease((R2 - d) / 6);
          want.y = Math.max(want.y, want.y + (top - want.y) * s);
        } else {
          want.x = b.x + (dx / Math.max(d, 0.01)) * R2;
          want.z = b.z + (dz / Math.max(d, 0.01)) * R2;
        }
      });
    }
    camera.position.copy(want);
    sim.cam[0] = want.x;
    sim.cam[1] = want.z;
    look.current.copy(wantLook);
    camera.lookAt(wantLook);

    // shift the frame right (desktop) or up (phone) while the scene overlay covers part of it
    const on = st.overlay && mode === "chase";
    const k = 1 - Math.exp(-4 * real);
    R.shift += ((on && !phone ? 0.15 : 0) - R.shift) * k;
    R.shiftY += ((on && phone ? 0.17 : 0) - R.shiftY) * k;
    const W = state.size.width;
    const H = state.size.height;
    if (Math.abs(R.shift) < 1e-3 && Math.abs(R.shiftY) < 1e-3) {
      if (camera.view?.enabled) camera.clearViewOffset();
    } else camera.setViewOffset(W, H, -R.shift * W, R.shiftY * H, W, H);
  }, -80);

  return null;
}
