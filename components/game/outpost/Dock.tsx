"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";

import { LampPost, mats } from "./materials";

const X = 46;
const Z = 18;
const W = 6;
const L = 16;
const TOP = 0.8;

/** Wooden dock reaching from the spit into the channel. The planning board (Awdon) stands on it. */
export function Dock() {
  const posts: [number, number][] = [];
  for (let i = -1; i <= 1; i++) {
    posts.push([-W / 2 + 0.3, (i * L) / 2 - (i === 0 ? 0 : 0.4 * Math.sign(i))]);
    posts.push([W / 2 - 0.3, (i * L) / 2 - (i === 0 ? 0 : 0.4 * Math.sign(i))]);
  }
  return (
    <group position={[X, 0, Z]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: "wood" }}>
        <CuboidCollider args={[W / 2, 0.15, L / 2]} position={[0, TOP - 0.15, 0]} />
        <mesh position={[0, TOP - 0.15, 0]} material={mats.wood} castShadow receiveShadow>
          <boxGeometry args={[W, 0.3, L]} />
        </mesh>
        {/* ramp from the ice onto the planks at the south end */}
        <CuboidCollider args={[W / 2, 0.08, 1.1]} position={[0, TOP - 0.22, L / 2 + 0.9]} rotation={[0.26, 0, 0]} />
        <mesh position={[0, TOP - 0.22, L / 2 + 0.9]} rotation={[0.26, 0, 0]} material={mats.woodLight} receiveShadow>
          <boxGeometry args={[W, 0.16, 2.2]} />
        </mesh>
      </RigidBody>
      {posts.map(([px, pz]) => (
        <mesh key={`${px}-${pz}`} position={[px, TOP - 1.6, pz]} material={mats.woodLight}>
          <cylinderGeometry args={[0.14, 0.16, 3, 6]} />
        </mesh>
      ))}
      <LampPost position={[-W / 2 + 0.5, TOP, -L / 2 + 1]} height={2.4} />
      <LampPost position={[W / 2 - 0.5, TOP, L / 2 - 1.5]} height={2.4} />
      {/* planning board frame; the screen panel mounts just in front of it */}
      <group position={[0, TOP, 3.75]}>
        <mesh position={[-1.6, 1.2, 0]} material={mats.woodLight}>
          <boxGeometry args={[0.14, 2.6, 0.14]} />
        </mesh>
        <mesh position={[1.6, 1.2, 0]} material={mats.woodLight}>
          <boxGeometry args={[0.14, 2.6, 0.14]} />
        </mesh>
        <mesh position={[0, 1.55, 0.02]} material={mats.dark} castShadow>
          <boxGeometry args={[3.7, 2.4, 0.08]} />
        </mesh>
      </group>
    </group>
  );
}
