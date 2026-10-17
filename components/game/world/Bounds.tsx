"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";

import { world } from "@/data";

/** Invisible walls at the edge of the play area. The kill plane is handled by the penguin. */
export function Bounds() {
  const { x, z } = world.bounds;
  const h = 30;
  const t = 1;
  return (
    <RigidBody type="fixed" colliders={false} userData={{ surface: "wall" }}>
      <CuboidCollider args={[t, h, z + t]} position={[x + t, h - 10, 0]} />
      <CuboidCollider args={[t, h, z + t]} position={[-x - t, h - 10, 0]} />
      <CuboidCollider args={[x + t, h, t]} position={[0, h - 10, z + t]} />
      <CuboidCollider args={[x + t, h, t]} position={[0, h - 10, -z - t]} />
    </RigidBody>
  );
}
