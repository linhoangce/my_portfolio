"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";

import { registerOccluder } from "../screens/occluders";
import { GableRoof, WindowPane, mats } from "./materials";

const X = -40;
const Z = -8;
const W = 7;
const D = 5;
const H = 2.8;
const BASE = 0.5;

/** Wooden cottage; the colony board stands outside its east wall (see Props). */
export function Cottage() {
  return (
    <group position={[X, 0, Z]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: "rock" }}>
        <CuboidCollider args={[W / 2, H / 2 + 1, D / 2]} position={[0, BASE + H / 2 + 0.5, 0]} />
        <mesh ref={registerOccluder} position={[0, BASE + H / 2, 0]} material={mats.wood} castShadow receiveShadow>
          <boxGeometry args={[W, H, D]} />
        </mesh>
        <GableRoof width={D + 0.8} length={W + 0.8} height={2} position={[0, BASE + H, 0]} />
        {/* chimney */}
        <mesh position={[2, BASE + H + 1.8, -1]} material={mats.rock} castShadow>
          <boxGeometry args={[0.6, 1.4, 0.6]} />
        </mesh>
      </RigidBody>
      {/* door on the south wall */}
      <mesh position={[-1.6, BASE + 1, D / 2 + 0.02]} material={mats.dark}>
        <planeGeometry args={[1, 2]} />
      </mesh>
      <WindowPane position={[1.6, BASE + 1.7, D / 2 + 0.02]} />
      <WindowPane position={[W / 2 + 0.02, BASE + 1.7, 0]} rotation={[0, Math.PI / 2, 0]} />
      <WindowPane position={[-W / 2 - 0.02, BASE + 1.7, 0.6]} rotation={[0, -Math.PI / 2, 0]} />
      {/* lamp by the board side */}
      <mesh position={[W / 2 + 0.1, BASE + 2.4, 1.6]} material={mats.lamp}>
        <sphereGeometry args={[0.16, 8, 6]} />
      </mesh>
      <pointLight position={[W / 2 + 1.2, BASE + 2.6, 1.6]} color="#ffb85c" intensity={22} distance={18} decay={1.8} />
    </group>
  );
}
