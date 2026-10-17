"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useRef } from "react";
import * as THREE from "three";

import { screenById, world } from "@/data";
import { CAMERA } from "../constants";
import { input } from "../controller/input";
import { getPenguinBody, penguinState } from "../penguin/penguinState";
import { focusPose } from "../screens/screenRegistry";
import { cameraYawFor, useGame } from "../store";
import { cameraState } from "./cameraState";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dampScalar = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));
function damp3(v: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  const k = 1 - Math.exp(-lambda * dt);
  v.x += (target.x - v.x) * k;
  v.y += (target.y - v.y) * k;
  v.z += (target.z - v.z) * k;
}

/**
 * Orbit follow camera. The target is damped; the orbit itself is immediate so
 * dragging never lags. Obstructions pull the camera in instantly and it eases
 * back out. Focus mode dollies to the active screen.
 */
export function FollowCam() {
  const { world: physics, rapier } = useRapier();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const refs = useRef({
    target: new THREE.Vector3(),
    goal: new THREE.Vector3(),
    desired: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    dist: CAMERA.distance,
    initialized: false,
    teleportNonce: 0,
    wasFocus: false,
    underwater: false,
  }).current;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const state = useGame.getState();

    const tr = state.teleportRequest;
    if (tr && tr.nonce !== refs.teleportNonce) {
      refs.teleportNonce = tr.nonce;
      cameraState.yaw = cameraYawFor(tr.yaw);
      cameraState.pitch = CAMERA.pitch;
      refs.initialized = false;
    }

    const p = penguinState.visualPos;
    refs.goal.set(p.x, p.y + CAMERA.targetHeight, p.z);
    let snap = false;
    if (!refs.initialized) {
      refs.target.copy(refs.goal);
      refs.initialized = true;
      snap = true;
    }

    // Focus mode: dolly to the screen and hold.
    if (state.mode === "focus" && state.focusedScreen) {
      const pose = focusPose(screenById[state.focusedScreen], camera.fov, size.width / size.height);
      damp3(camera.position, pose.position, CAMERA.focusLambda, dt);
      damp3(refs.target, pose.lookAt, CAMERA.focusLambda, dt);
      camera.lookAt(refs.target);
      refs.wasFocus = true;
      input.look.dx = 0;
      input.look.dy = 0;
      input.zoom = 0;
      setUnderwater(refs, camera.position.y < world.waterLevel);
      return;
    }

    // Orbit input.
    if (state.mode === "play") {
      const { dx, dy } = input.look;
      input.look.dx = 0;
      input.look.dy = 0;
      cameraState.yaw -= dx * CAMERA.yawPerPx;
      cameraState.pitch += (state.settings.invertY ? -dy : dy) * CAMERA.pitchPerPx;
      if (input.zoom !== 0) {
        cameraState.distance = clamp(
          cameraState.distance * (1 + (input.zoom / 100) * CAMERA.zoomStep),
          CAMERA.minDistance,
          CAMERA.maxDistance,
        );
        input.zoom = 0;
      }
    } else {
      input.look.dx = 0;
      input.look.dy = 0;
      input.zoom = 0;
    }
    const minPitch = penguinState.move === "swim" && !penguinState.diving ? CAMERA.swimMinPitch : CAMERA.minPitch;
    cameraState.pitch = clamp(cameraState.pitch, minPitch, CAMERA.maxPitch);

    // Follow target.
    damp3(refs.target, refs.goal, CAMERA.targetLambda, dt);

    const cp = Math.cos(cameraState.pitch);
    const sp = Math.sin(cameraState.pitch);
    refs.dir.set(Math.sin(cameraState.yaw) * cp, sp, Math.cos(cameraState.yaw) * cp);

    // Obstruction: pull in instantly, ease back out.
    let wanted = cameraState.distance;
    const ray = new rapier.Ray(refs.target, refs.dir);
    const hit = physics.castRay(ray, wanted, true, undefined, undefined, undefined, getPenguinBody() ?? undefined, (c) => !c.isSensor());
    if (hit) wanted = Math.max(hit.timeOfImpact - CAMERA.collisionPad, CAMERA.minDistance * 0.5);

    if (snap || refs.wasFocus || wanted < refs.dist) refs.dist = wanted;
    else refs.dist = dampScalar(refs.dist, wanted, 4, dt);

    refs.desired.copy(refs.target).addScaledVector(refs.dir, refs.dist);
    if (refs.wasFocus && !snap) {
      // Leaving focus: ease back to the follow pose rather than cutting.
      damp3(camera.position, refs.desired, CAMERA.focusLambda, dt);
      if (camera.position.distanceToSquared(refs.desired) < 0.01) refs.wasFocus = false;
    } else {
      camera.position.copy(refs.desired);
      refs.wasFocus = false;
    }
    // Keep the lens above the water at the surface, and under it on a dive so the dive reads.
    if (penguinState.move === "swim" && penguinState.diving) {
      camera.position.y = Math.min(camera.position.y, world.waterLevel - 0.45);
    } else {
      camera.position.y = Math.max(camera.position.y, world.waterLevel + 0.25);
    }
    camera.lookAt(refs.target);
    setUnderwater(refs, camera.position.y < world.waterLevel);
  });

  return null;
}

function setUnderwater(refs: { underwater: boolean }, value: boolean) {
  if (refs.underwater === value) return;
  refs.underwater = value;
  cameraState.underwater = value;
  if (value) document.documentElement.dataset.underwater = "1";
  else delete document.documentElement.dataset.underwater;
}
