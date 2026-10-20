"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { HalfFloatType, LinearFilter, Matrix4, PerspectiveCamera, Plane, Vector3, Vector4, WebGLRenderTarget } from "three";

import { SEA } from "./constants";
import { mirrorSkip, mirrorState, mirrorUniforms, skipInMirror } from "./waterMirror";
import { sdfAt } from "./terrain";
import { useWorld } from "./world";

const normal = new Vector3(0, 1, 0);
const camPos = new Vector3();
const look = new Vector3();
const target = new Vector3();
const p = new Vector3();
const dir = new Vector3();
const plane = new Plane();
const clip = new Vector4();
const q = new Vector4();
const rot = new Matrix4();
const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/** Whether any of a 5 × 5 grid of view rays meets open water. */
function waterInView(cam: PerspectiveCamera): boolean {
  camPos.setFromMatrixPosition(cam.matrixWorld);
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      p.set(i * 0.45, j * 0.45, 0.5).unproject(cam);
      dir.subVectors(p, camPos).normalize();
      if (dir.y > -0.002) continue;
      const t = (SEA - camPos.y) / dir.y;
      if (t > 4000) continue;
      if (sdfAt(camPos.x + dir.x * t, camPos.z + dir.z * t) < 0) return true;
    }
  }
  return false;
}

/**
 * The water's mirror on desktop: every other frame the scene is drawn once more from the camera reflected in the sea
 * level, at half resolution, with an oblique near plane so nothing under the water shows, leaving out the objects in
 * `mirrorSkip`. The water material samples it, rippled. Skipped when no water is in view.
 */
export function Mirror() {
  const { lowEnd, scene, sky } = useWorld();
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const built = useMemo(() => {
    const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
    const cam = new PerspectiveCamera();
    return { rt, cam, frame: 0 };
  }, []);

  useEffect(() => {
    built.rt.setSize(Math.max(1, Math.round(size.width * dpr * 0.5)), Math.max(1, Math.round(size.height * dpr * 0.5)));
  }, [built, size, dpr]);

  // stars in the water read as specks of noise
  useEffect(() => skipInMirror(sky.stars), [sky]);

  useEffect(() => {
    mirrorUniforms.tMirror.value = built.rt.texture;
    return () => {
      mirrorUniforms.tMirror.value = null;
      mirrorUniforms.uMirrorOn.value = 0;
      mirrorState.active = false;
      built.rt.dispose();
    };
  }, [built]);

  useFrame((state) => {
    mirrorUniforms.uMirrorTime.value = state.clock.elapsedTime;
    const main = state.camera as PerspectiveCamera;
    const on = !lowEnd && main.isPerspectiveCamera && waterInView(main);
    mirrorState.active = on;
    mirrorUniforms.uMirrorOn.value = on ? 1 : 0;
    if (!on) return;
    // every other frame: a frame-old reflection under the ripples is not to be seen, and it halves the cost
    built.frame++;
    if (built.frame % 2) return;
    const { cam, rt } = built;
    // the camera and its view target, reflected in the water
    camPos.setFromMatrixPosition(main.matrixWorld);
    if (camPos.y <= SEA + 0.05) {
      mirrorUniforms.uMirrorOn.value = 0;
      return;
    }
    rot.extractRotation(main.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    cam.position.set(camPos.x, 2 * SEA - camPos.y, camPos.z);
    target.set(look.x, 2 * SEA - look.y, look.z);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    cam.lookAt(target);
    cam.near = main.near;
    cam.far = main.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(main.projectionMatrix);
    mirrorUniforms.uMirrorMatrix.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // an oblique near plane on the water (Lengyel), so nothing below it is drawn
    plane.setFromNormalAndCoplanarPoint(normal, p.set(0, SEA, 0)).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = cam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x;
    e[6] = clip.y;
    e[10] = clip.z + 1 - 0.003;
    e[14] = clip.w;

    const gl = state.gl;
    const hidden: { o: { visible: boolean }; v: boolean }[] = [];
    for (const o of mirrorSkip) {
      hidden.push({ o, v: o.visible });
      o.visible = false;
    }
    const prevTarget = gl.getRenderTarget();
    const prevShadow = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(rt);
    gl.state.buffers.depth.setMask(true);
    gl.clear();
    gl.render(scene, cam);
    gl.setRenderTarget(prevTarget);
    gl.shadowMap.autoUpdate = prevShadow;
    for (const h of hidden) h.o.visible = h.v;
  }, -45);

  return null;
}
