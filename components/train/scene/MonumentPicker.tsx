"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Raycaster, Sphere, Vector2, Vector3 } from "three";

import { MONUMENTS, monumentFocus, type MonumentKey } from "../monuments";
import { pickBus } from "./pickBus";

const ray = new Raycaster();
const ndc = new Vector2();
const sphere = new Sphere();
const hit = new Vector3();

/** Raycasts the monuments' bounding spheres (analytic, no meshes) for the DOM pointer controls. */
export function MonumentPicker() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    pickBus.pick = (cx, cy) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let best: MonumentKey | null = null;
      let bd = Infinity;
      for (const m of MONUMENTS) {
        sphere.set(monumentFocus(m.key), m.r * 0.8);
        if (ray.ray.intersectSphere(sphere, hit)) {
          const d = hit.distanceTo(camera.position);
          if (d < bd && d < 900) {
            bd = d;
            best = m.key;
          }
        }
      }
      return best;
    };
    return () => {
      pickBus.pick = null;
    };
  }, [camera, gl]);

  return null;
}
