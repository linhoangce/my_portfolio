"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type PerspectiveCamera, Vector3 } from "three";

import { roofAt } from "./camSafe";
import { CAM, HEAD } from "./constants";
import { awayYaw, fitDistance, MONUMENT_BY_KEY, monumentFocus } from "./monuments";
import { SHOT_S } from "./scene/director";
import { shotFor } from "./scene/shots";
import { BLOCKERS, LANDMARKS } from "./sites";
import { type TrainState, useTrain } from "./store";
import { frameAt, groundAt, makeFrame, stationS, trainFrameAt, UP } from "./track";
import { laneAt } from "./Train";

type Mode = "chase" | "station" | "cab" | "shot" | "hold" | "monument" | "free";

const fA = makeFrame();
const fB = makeFrame();
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
  const { sim } = st;
  if (sim.freeCam) return "free";
  if (st.monument) return "monument";
  if (st.cab) return "cab";
  const ph = sim.film.phase;
  if (ph === "establish") return "shot";
  if (ph === "hold") return "hold";
  const o = sim.orbit;
  if (st.dockedIdx !== null && ph === "idle" && !sim.dragging && Math.abs(o.yaw) < 0.01 && Math.abs(o.pitch) < 0.01) return "station";
  return "chase";
}

/** How long to blend from one mode into another (0 = cut). */
function blendFor(from: Mode, to: Mode): number {
  if (from === "free" || to === "free" || to === "shot") return 0;
  if (from === "shot" && to === "hold") return 0.6;
  if (to === "monument") return 1.2;
  if (from === "monument") return 1.0;
  if (from === "hold" || from === "shot") return 1.2;
  if (from === "cab" || to === "cab") return 0.5;
  return 0;
}

/**
 * Chase (360° orbit and zoom around the train), the docked station view, the cab, a scene's establishing shot and hold
 * orbit, and the monument view. The chase, station and cab poses are damped as offsets from the lead car, so there is
 * no lag at speed; a change of mode blends from a snapshot of the last pose. Last come the constraints: above the
 * ground, out of building boxes (rise fast, settle slowly) and clear of the landmarks the shot does not own. A
 * horizontal view offset keeps the subject clear of the scene overlay.
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
      else if (mode === "hold" || mode === "shot") sim.hold.yaw += sim.held * real * 1.4;
      else sim.orbit.yaw += sim.held * real * 1.4;
      sim.orbit.idle = 0;
    }

    // the lead car: the chase and the cab ride with it
    const headS = sim.s + sim.travelDir * HEAD;
    trainFrameAt(headS, sim.travelDir, laneAt(sim, headS), fA);
    const head = fA.p;
    const relative = mode === "chase" || mode === "station" || mode === "cab";
    if (mode === "free" && sim.freeCam) {
      want.set(...sim.freeCam.pos);
      wantLook.set(...sim.freeCam.look);
    } else if (mode === "shot" || mode === "hold") {
      const plan = shotFor(sim.film.idx, env.lowEnd);
      if (mode === "shot") {
        const u = reduced ? 1 : ease(sim.film.t / SHOT_S);
        want.lerpVectors(plan.from.pos, plan.to.pos, u);
        wantLook.lerpVectors(plan.from.look, plan.to.look, u);
      } else {
        tmp.copy(plan.to.pos).sub(plan.focus);
        const yaw0 = Math.atan2(tmp.z, tmp.x);
        const pitch0 = Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z));
        if (!reduced && !sim.dragging) sim.hold.yaw += real * 0.025;
        const dist = clamp(tmp.length() * Math.exp(sim.hold.zoom), plan.dist[0], plan.dist[1]);
        sph(plan.focus, yaw0 + sim.hold.yaw, clamp(pitch0 + sim.hold.pitch, 0.06, 1.3), dist, want);
        wantLook.copy(plan.focus);
      }
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
    } else if (mode === "station" && st.dockedIdx !== null) {
      frameAt(stationS[st.dockedIdx], fB);
      const c = phone ? CAM.stationPhone : CAM.station;
      // high enough to look over the near platform's canopy
      want.copy(fB.p).addScaledVector(fB.r, c.right).addScaledVector(UP, c.up).addScaledVector(fB.t, c.ahead);
      wantLook.copy(fB.p).addScaledVector(UP, 2).addScaledVector(fB.t, -8).addScaledVector(fB.r, 1);
    } else {
      // chase: the base offset as angles relative to the train, plus the visitor's orbit (yaw unbounded) and zoom
      const dir = sim.travelDir;
      const c = phone ? CAM.chasePhone : CAM.chase;
      // pull back and well up as the train gets going: on the move the view looks down on the line over a broad sweep
      // of the city round it
      const going = Math.min(1, Math.abs(sim.v) / 15);
      const pull = env.lowEnd ? CAM.pullLite : CAM.pull;
      const back = c.back + going * pull.back * (phone ? 1.1 : 1) + Math.abs(sim.v) * 0.15;
      const up = c.up + going * pull.up;
      // ride on the right of the train unless a landmark is there and the left is clear, then swing over
      const blocked = (side: number) => {
        tmp.copy(head).addScaledVector(fA.r, c.right * 1.6 * side * dir).addScaledVector(fA.t, -back * dir * 0.8);
        return BLOCKERS.some((b) => b.h > 8 && Math.hypot(tmp.x - b.x, tmp.z - b.z) < b.r + 8);
      };
      if (blocked(sim.camSide) && !blocked(-sim.camSide)) sim.camSide = sim.camSide > 0 ? -1 : 1;
      else if (sim.camSide < 0 && !blocked(1)) sim.camSide = 1;
      const yaw0 = Math.atan2(c.right * sim.camSide, back);
      const pitch0 = Math.atan2(up, Math.hypot(c.right, back));
      const dist = Math.hypot(c.right, back, up) * Math.exp(sim.orbit.zoom);
      const yaw = yaw0 + sim.orbit.yaw;
      const pitch = clamp(pitch0 + sim.orbit.pitch, -0.05, 1.45);
      h.copy(fA.t).multiplyScalar(-dir * Math.cos(yaw)).addScaledVector(fA.r, Math.sin(yaw) * dir).setY(0).normalize();
      want.copy(head).addScaledVector(h, Math.cos(pitch) * dist).addScaledVector(UP, Math.sin(pitch) * dist);
      wantLook.copy(head).addScaledVector(fA.t, -(10 + going * 6) * dir).addScaledVector(UP, 1.6);
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

    // orbit views: a spring arm from the focus pulls the camera in before the first building in the way
    if (mode === "hold" || mode === "monument") {
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
      // the chase rises over a roof fast and settles slowly; the orbit views have their spring arm instead
      const orbiting = mode === "hold" || mode === "monument" || mode === "shot";
      R.lift = orbiting || need > R.lift ? need : R.lift + (need - R.lift) * (1 - Math.exp(-1.5 * real));
      want.y = Math.max(want.y + R.lift, floor);
      // landmarks the view does not own: the chase rises over them, the other views stay outside
      const owns = mode === "shot" || mode === "hold" ? shotFor(sim.film.idx, env.lowEnd).owns : undefined;
      BLOCKERS.forEach((b, i) => {
        const key = LANDMARKS[i].key;
        if (key === st.monument || key === owns) return;
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
    const on = st.overlay && (mode === "shot" || mode === "hold" || mode === "station");
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
