"use client";

import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useRef } from "react";
import * as THREE from "three";

import { WindowPane, mats } from "./materials";

const X = -12;
const Z = 24;
const W = 5;
const D = 4;
const H = 2.6;
const BASE = 0.5;

/** Radio shack with a mast and a blinking beacon. Hosts the score card screen (M2). */
export function RadioShack() {
  const beacon = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (beacon.current) beacon.current.visible = Math.sin(state.clock.elapsedTime * 3) > 0;
  });
  return (
    <group position={[X, 0, Z]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: "rock" }}>
        <CuboidCollider args={[W / 2, H / 2, D / 2]} position={[0, BASE + H / 2, 0]} />
        <mesh position={[0, BASE + H / 2, 0]} material={mats.dark} castShadow receiveShadow>
          <boxGeometry args={[W, H, D]} />
        </mesh>
        <mesh position={[0, BASE + H + 0.15, 0]} material={mats.rock} castShadow>
          <boxGeometry args={[W + 0.5, 0.3, D + 0.5]} />
        </mesh>
        <CuboidCollider args={[0.2, 3.5, 0.2]} position={[-2, BASE + 3.5, -1.5]} />
        <mesh position={[-2, BASE + 3.8, -1.5]} material={mats.rock}>
          <cylinderGeometry args={[0.07, 0.1, 7.5, 6]} />
        </mesh>
        <mesh position={[-2, BASE + 6.2, -1.5]} material={mats.rock}>
          <boxGeometry args={[1.6, 0.06, 0.06]} />
        </mesh>
        <mesh ref={beacon} position={[-2, BASE + 7.7, -1.5]} material={mats.red}>
          <sphereGeometry args={[0.16, 6, 5]} />
        </mesh>
      </RigidBody>
      <WindowPane position={[-1.3, BASE + 1.6, D / 2 + 0.02]} size={[0.8, 0.6]} />
      <mesh position={[1.4, BASE + 2.25, D / 2 + 0.1]} material={mats.lamp}>
        <sphereGeometry args={[0.14, 8, 6]} />
      </mesh>
      <pointLight position={[1.4, BASE + 2.3, D / 2 + 0.8]} color="#ffb85c" intensity={16} distance={14} decay={1.8} />
    </group>
  );
}
