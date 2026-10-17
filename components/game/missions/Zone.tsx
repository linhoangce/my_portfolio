"use client";

import { type CollisionTarget, CuboidCollider, RigidBody } from "@react-three/rapier";

import { type ZoneDef, zones } from "@/data";
import { emit, updateMembership } from "./events";

type Tagged = { type?: string; tag?: string } | undefined;

function tagOf(target: CollisionTarget): string | null {
  const ud = target.rigidBody?.userData as Tagged;
  return ud?.tag ?? ud?.type ?? null;
}

/** Fixed sensor box that reports tagged bodies entering and leaving. */
export function Zone({ def }: { def: ZoneDef }) {
  return (
    <CuboidCollider
      sensor
      args={[def.size[0] / 2, def.size[1] / 2, def.size[2] / 2]}
      position={def.position}
      onIntersectionEnter={(e) => {
        const tag = tagOf(e.other);
        if (!tag) return;
        updateMembership(def.id, tag, true);
        emit({ type: "zone", zone: def.id, tag, enter: true });
      }}
      onIntersectionExit={(e) => {
        const tag = tagOf(e.other);
        if (!tag) return;
        updateMembership(def.id, tag, false);
        emit({ type: "zone", zone: def.id, tag, enter: false });
      }}
    />
  );
}

export function Zones() {
  return (
    <RigidBody type="fixed" colliders={false}>
      {zones.map((def) => (
        <Zone key={def.id} def={def} />
      ))}
    </RigidBody>
  );
}
