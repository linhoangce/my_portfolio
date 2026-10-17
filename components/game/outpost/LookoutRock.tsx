"use client";

import { RigidBody } from "@react-three/rapier";

import { MOUNDS, terrainHeight } from "../world/terrainHeight";
import { mats } from "./materials";

const rocks: { x: number; z: number; r: number; rot: number }[] = [
  { x: -8, z: -19.5, r: 1.6, rot: 0.4 },
  { x: -10.5, z: -17, r: 1.2, rot: 1.9 },
  { x: -5.5, z: -18.5, r: 1.0, rot: 0.9 },
  { x: -7, z: -22, r: 0.9, rot: 2.6 },
];

/** Rocks on the lookout mound and a telescope stub at the top (aim mode arrives in M2). */
export function LookoutRock() {
  const top = terrainHeight(MOUNDS.lookout.x, MOUNDS.lookout.z);
  return (
    <group>
      {rocks.map((r) => (
        <RigidBody key={`${r.x}-${r.z}`} type="fixed" colliders="hull" position={[r.x, terrainHeight(r.x, r.z) + r.r * 0.5, r.z]} rotation={[0, r.rot, 0.2]} userData={{ surface: "rock" }}>
          <mesh material={mats.rock} castShadow receiveShadow>
            <dodecahedronGeometry args={[r.r, 0]} />
          </mesh>
        </RigidBody>
      ))}
      {/* telescope */}
      <group position={[-8, top, -17]}>
        <mesh position={[0, 0.7, 0]} material={mats.dark}>
          <cylinderGeometry args={[0.05, 0.08, 1.4, 5]} />
        </mesh>
        <mesh position={[0, 1.45, 0.25]} rotation={[-0.4, 0, 0]} material={mats.panel}>
          <cylinderGeometry args={[0.1, 0.14, 1.1, 8]} />
        </mesh>
        <mesh position={[0, 1.75, 0.6]} material={mats.cyan}>
          <sphereGeometry args={[0.08, 6, 5]} />
        </mesh>
      </group>
    </group>
  );
}
