"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Mesh, type Object3D } from "three";

import { skipInMirror } from "../waterMirror";

import { useTrain } from "../store";
import { useWorld } from "../world";
import { buildSets } from "./build";
import { setRegistry } from "./registry";

/**
 * The ten set pieces. Each is drawn only within 600 units of the camera (400 on low-end devices) or while its own
 * scene plays, and animates only while drawn.
 */
export function Sets() {
  const world = useWorld();
  const sets = useMemo(() => {
    const s = buildSets(world);
    setRegistry.sets = s;
    return s;
  }, [world]);

  useEffect(() => {
    const low: Object3D[] = [];
    for (const s of sets) s.group.traverse((o) => o.userData.lowInMirror && low.push(o));
    return skipInMirror(...low);
  }, [sets]);

  useEffect(
    () => () => {
      if (setRegistry.sets === sets) setRegistry.sets = null;
      for (const s of sets) {
        s.group.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
    },
    [sets],
  );

  useFrame((state) => {
    const st = useTrain.getState();
    const cam = state.camera.position;
    const reach = world.lowEnd ? 400 : 600;
    const ph = st.scenePhase;
    const playing = ph === "cut" || ph === "establish" || ph === "hold";
    const t = state.clock.elapsedTime;
    sets.forEach((s, i) => {
      const on = (playing && st.sceneIdx === i) || s.focus.distanceTo(cam) < reach;
      s.group.visible = on;
      if (on) s.update?.(t, cam);
    });
  });

  return (
    <>
      {sets.map((s, i) => (
        <primitive key={i} object={s.group} />
      ))}
    </>
  );
}
