"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";

import { registerOccluder } from "../screens/occluders";
import { WindowPane, mats } from "./materials";

const X = -36;
const Z = 12;
const W = 10;
const D = 6;
const H = 3.2;
const BASE = 0.5;

/** Lab hut: a panelled block for now. M2 opens the interior (screens wall, shelf, timeline). */
export function LabHut() {
  return (
    <group position={[X, 0, Z]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: "rock" }}>
        <CuboidCollider args={[W / 2, H / 2, D / 2]} position={[0, BASE + H / 2, 0]} />
        <mesh ref={registerOccluder} position={[0, BASE + H / 2, 0]} material={mats.panel} castShadow receiveShadow>
          <boxGeometry args={[W, H, D]} />
        </mesh>
        <mesh position={[0, BASE + H + 0.2, 0]} material={mats.dark} castShadow>
          <boxGeometry args={[W + 0.6, 0.4, D + 0.6]} />
        </mesh>
        {/* roof vents / instruments */}
        <mesh position={[-3, BASE + H + 0.9, 1]} material={mats.rock}>
          <cylinderGeometry args={[0.35, 0.4, 1, 6]} />
        </mesh>
        <mesh position={[2.5, BASE + H + 1.2, -1]} material={mats.dark}>
          <boxGeometry args={[0.12, 1.6, 0.12]} />
        </mesh>
        <mesh position={[2.5, BASE + H + 2.1, -1]} material={mats.cyan}>
          <sphereGeometry args={[0.14, 6, 5]} />
        </mesh>
      </RigidBody>
      {/* door on the east wall, lamp above it */}
      <mesh position={[W / 2 + 0.02, BASE + 1.1, 2.3]} rotation={[0, Math.PI / 2, 0]} material={mats.dark}>
        <planeGeometry args={[1.1, 2.2]} />
      </mesh>
      <mesh position={[W / 2 + 0.1, BASE + 2.6, 2.3]} material={mats.lamp}>
        <sphereGeometry args={[0.16, 8, 6]} />
      </mesh>
      <pointLight position={[W / 2 + 0.6, BASE + 2.6, 2.3]} color="#ffb85c" intensity={18} distance={16} decay={1.8} />
      {/* windows on the west and south walls */}
      <WindowPane position={[-W / 2 - 0.02, BASE + 1.9, -1.2]} rotation={[0, -Math.PI / 2, 0]} />
      <WindowPane position={[-W / 2 - 0.02, BASE + 1.9, 1.2]} rotation={[0, -Math.PI / 2, 0]} />
      <WindowPane position={[3.2, BASE + 1.9, D / 2 + 0.02]} />
      <WindowPane position={[-2.6, BASE + 1.9, -D / 2 - 0.02]} rotation={[0, Math.PI, 0]} size={[0.8, 0.6]} />
    </group>
  );
}
