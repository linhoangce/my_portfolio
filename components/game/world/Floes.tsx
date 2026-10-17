"use client";

import { RigidBody, type RapierRigidBody, useBeforePhysicsStep } from "@react-three/rapier";
import { useEffect, useRef } from "react";

import { world } from "@/data";
import { PHYSICS } from "../constants";

type FloeDef = { id: string; x: number; z: number; r: number; drift?: { ax: number; az: number; period: number; phase: number } };

/** Ice floes in the channel: two fixed islands and two slow drifters you can ride. */
export const floes: FloeDef[] = [
  { id: "floe-a", x: 16, z: 7, r: 3.6 },
  { id: "floe-b", x: 46, z: 8, r: 3 },
  { id: "floe-c", x: 30, z: 4, r: 3.2, drift: { ax: 5, az: 2.5, period: 26, phase: 0 } },
  { id: "floe-d", x: 37, z: 13, r: 2.6, drift: { ax: 4, az: 2, period: 21, phase: 2.1 } },
];

const TOP = world.waterLevel + 0.38;
const THICK = 0.9;

const bodies = new Map<string, RapierRigidBody>();

/** Current centre of a floe, for the seal's respawn search and automated checks. */
export function floePosition(id: string): [number, number, number] | null {
  const def = floes.find((f) => f.id === id);
  if (!def) return null;
  const body = bodies.get(id);
  if (body) {
    const t = body.translation();
    return [t.x, t.y + THICK / 2, t.z];
  }
  return [def.x, TOP, def.z];
}

function FloeMesh({ r }: { r: number }) {
  return (
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[r, r * 0.82, THICK, 7]} />
      <meshStandardMaterial color="#cfe0ee" flatShading roughness={0.85} />
    </mesh>
  );
}

function DriftingFloe({ def }: { def: FloeDef }) {
  const body = useRef<RapierRigidBody>(null);
  const t = useRef(def.drift?.phase ?? 0);
  useEffect(() => {
    if (body.current) bodies.set(def.id, body.current);
    return () => {
      bodies.delete(def.id);
    };
  }, [def.id]);
  useBeforePhysicsStep(() => {
    const rb = body.current;
    const drift = def.drift;
    if (!rb || !drift) return;
    t.current += PHYSICS.timeStep;
    const w = (Math.PI * 2) / drift.period;
    rb.setNextKinematicTranslation({
      x: def.x + Math.sin(t.current * w) * drift.ax,
      y: TOP - THICK / 2,
      z: def.z + Math.sin(t.current * w * 0.5 + 1.3) * drift.az,
    });
  });
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders="hull"
      position={[def.x, TOP - THICK / 2, def.z]}
      userData={{ surface: "ice", floe: def.id }}
    >
      <FloeMesh r={def.r} />
    </RigidBody>
  );
}

export function Floes() {
  return (
    <>
      {floes.map((def) =>
        def.drift ? (
          <DriftingFloe key={def.id} def={def} />
        ) : (
          <RigidBody
            key={def.id}
            type="fixed"
            colliders="hull"
            position={[def.x, TOP - THICK / 2, def.z]}
            userData={{ surface: "ice", floe: def.id }}
          >
            <FloeMesh r={def.r} />
          </RigidBody>
        ),
      )}
    </>
  );
}
