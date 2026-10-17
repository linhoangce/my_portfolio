"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { fishSchools, world } from "@/data";
import { FISH } from "../constants";
import { emit } from "../missions/events";
import { penguinState } from "../penguin/penguinState";
import { noise2 } from "../world/terrainHeight";

type Fish = {
  cx: number;
  cy: number;
  cz: number;
  r: number;
  a: number;
  b: number;
  phase: number;
  speedMul: number;
  flee: THREE.Vector3;
  caughtAt: number;
};

const SURFACE_MARGIN = world.waterLevel - 0.4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * All fish in one InstancedMesh. Each fish follows a Lissajous loop around its
 * school, drifts away from a swimming penguin and is caught by distance.
 * No physics bodies.
 */
export function FishSchools() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => {
    const g = new THREE.ConeGeometry(0.11, 0.46, 5);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const fish = useMemo(() => {
    const out: Fish[] = [];
    let k = 0;
    for (const school of fishSchools) {
      for (let i = 0; i < school.count; i++) {
        const h1 = noise2(k * 1.7, 0.3);
        const h2 = noise2(0.9, k * 2.3);
        k += 1;
        out.push({
          cx: school.position[0],
          cy: school.position[1],
          cz: school.position[2],
          r: school.radius * (0.45 + h1 * 0.55),
          a: 0.9 + h2 * 0.4,
          b: 0.7 + h1 * 0.5,
          phase: h2 * Math.PI * 2,
          speedMul: 0.8 + h1 * 0.4,
          flee: new THREE.Vector3(),
          caughtAt: Number.NEGATIVE_INFINITY,
        });
      }
    }
    return out;
  }, []);

  useFrame((state, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const p = penguinState.visualPos;
    const swimming = penguinState.move === "swim";

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (t - f.caughtAt < FISH.respawnSeconds) {
        dummy.position.set(f.cx, f.cy, f.cz);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const tt = (t * FISH.cruiseSpeed * f.speedMul) / Math.max(f.r, 1) + f.phase;
      const px = f.cx + Math.sin(tt * f.a) * f.r;
      const py = f.cy + Math.sin(tt * 2.1) * 0.35;
      const pz = f.cz + Math.cos(tt * f.b) * f.r;
      const vx = Math.cos(tt * f.a) * f.a * f.r;
      const vz = -Math.sin(tt * f.b) * f.b * f.r;

      const dx = px + f.flee.x - p.x;
      const dy = py + f.flee.y - p.y;
      const dz = pz + f.flee.z - p.z;
      const d = Math.hypot(dx, dy, dz);

      if (swimming && d < FISH.catchRadius) {
        f.caughtAt = t;
        f.flee.set(0, 0, 0);
        emit({ type: "collect", tag: "fish" });
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        continue;
      }
      if (swimming && d < FISH.scareRadius && d > 1e-3) {
        const push = ((FISH.scareRadius - d) / FISH.scareRadius) * FISH.fleeSpeed * dt;
        f.flee.x += (dx / d) * push;
        f.flee.z += (dz / d) * push;
        f.flee.y += (dy / d) * push * 0.3;
        if (f.flee.length() > 4) f.flee.setLength(4);
      } else {
        f.flee.multiplyScalar(Math.max(0, 1 - 0.8 * dt));
      }

      dummy.position.set(px + f.flee.x, clamp(py + f.flee.y, f.cy - 0.8, SURFACE_MARGIN), pz + f.flee.z);
      dummy.rotation.set(0, Math.atan2(vx - f.flee.x * 0.2, vz - f.flee.z * 0.2), 0);
      dummy.scale.setScalar(1.3);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, fish.length]} frustumCulled={false}>
      <meshStandardMaterial color="#bfe9f5" emissive="#3fb7d6" emissiveIntensity={0.8} flatShading roughness={0.5} />
    </instancedMesh>
  );
}
