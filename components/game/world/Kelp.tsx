"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { isDeepWater, noise2, terrainHeight } from "./terrainHeight";

const BAY = { minX: 10, maxX: 52, minZ: -28, maxZ: -6 };

/** Instanced kelp fronds in the bay, swaying gently. One draw call. */
export function Kelp({ count = 90 }: { count?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const stalks = useMemo(() => {
    const out: { x: number; y: number; z: number; h: number; phase: number }[] = [];
    let i = 0;
    let tries = 0;
    while (out.length < count && tries < count * 20) {
      tries += 1;
      const x = BAY.minX + noise2(i * 3.7, 1.3) * (BAY.maxX - BAY.minX);
      const z = BAY.minZ + noise2(2.9, i * 5.1) * (BAY.maxZ - BAY.minZ);
      i += 1;
      if (!isDeepWater(x, z)) continue;
      const y = terrainHeight(x, z);
      out.push({ x, y, z, h: 1.8 + noise2(x, z) * 1.6, phase: noise2(z, x) * Math.PI * 2 });
    }
    return out;
  }, [count]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    for (let k = 0; k < stalks.length; k++) {
      const s = stalks[k];
      dummy.position.set(s.x, s.y + s.h / 2, s.z);
      dummy.rotation.set(Math.sin(t * 0.8 + s.phase) * 0.12, s.phase, Math.cos(t * 0.6 + s.phase) * 0.12);
      dummy.scale.set(1, s.h / 2.6, 1);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, stalks.length]} frustumCulled={false}>
      <coneGeometry args={[0.16, 2.6, 5]} />
      <meshStandardMaterial color="#1d5c49" flatShading roughness={0.9} />
    </instancedMesh>
  );
}
