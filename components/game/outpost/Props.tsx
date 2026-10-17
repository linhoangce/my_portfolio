"use client";

import { CylinderCollider, RigidBody } from "@react-three/rapier";

import { world } from "@/data";
import { MOUNDS, terrainHeight } from "../world/terrainHeight";
import { LampPost, mats } from "./materials";

/** Board frame on two posts. The DOM screen mounts just in front of it. */
export function BoardFrame({ position, yaw, width = 3.8, height = 2.5 }: { position: [number, number, number]; yaw: number; width?: number; height?: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[-width / 2 + 0.2, 1.3, -0.1]} material={mats.woodLight}>
        <boxGeometry args={[0.14, 2.8, 0.14]} />
      </mesh>
      <mesh position={[width / 2 - 0.2, 1.3, -0.1]} material={mats.woodLight}>
        <boxGeometry args={[0.14, 2.8, 0.14]} />
      </mesh>
      <mesh position={[0, 1.5, -0.08]} material={mats.dark} castShadow>
        <boxGeometry args={[width, height, 0.08]} />
      </mesh>
    </group>
  );
}

function Crate({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody type="dynamic" colliders="cuboid" position={position} mass={6} friction={0.6} userData={{ surface: "wood" }}>
      <mesh material={mats.wood} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
      </mesh>
    </RigidBody>
  );
}

/** Holographic buoy in the bay. Fixed so it can be climbed; the Planktoneer panel hangs on its mast. */
function Buoy({ x, z }: { x: number; z: number }) {
  const y = world.waterLevel;
  return (
    <group position={[x, y, z]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: "wood" }}>
        <CylinderCollider args={[0.3, 1.4]} position={[0, 0, 0]} />
        <mesh material={mats.panel} castShadow>
          <cylinderGeometry args={[1.4, 1.2, 0.6, 8]} />
        </mesh>
      </RigidBody>
      <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.cyan}>
        <torusGeometry args={[1.25, 0.06, 6, 16]} />
      </mesh>
      <mesh position={[0, 1.6, 0]} material={mats.dark}>
        <cylinderGeometry args={[0.08, 0.1, 2.8, 6]} />
      </mesh>
      <mesh position={[0, 3.1, 0]} material={mats.cyan}>
        <sphereGeometry args={[0.16, 8, 6]} />
      </mesh>
      <pointLight position={[0, 2.2, 0]} color="#5ef2ff" intensity={14} distance={14} decay={1.8} />
    </group>
  );
}

export function Props() {
  const sr = MOUNDS.schoolRock;
  const schoolRockY = terrainHeight(sr.x, sr.z);
  const spawn = world.spawn.position;
  return (
    <group>
      {/* colony board outside the cottage */}
      <BoardFrame position={[-32, terrainHeight(-32, -8.2) - 0.1, -8.2]} yaw={0} />
      {/* school rock and its signboard */}
      <RigidBody type="fixed" colliders="hull" position={[sr.x, schoolRockY + 0.9, sr.z]} rotation={[0.1, 0.7, 0]} userData={{ surface: "rock" }}>
        <mesh material={mats.rock} castShadow receiveShadow>
          <dodecahedronGeometry args={[2.2, 0]} />
        </mesh>
      </RigidBody>
      <BoardFrame position={[-45, terrainHeight(-45, -19.2) - 0.1, -19.2]} yaw={0} width={3.6} height={2.3} />
      {/* lookout telescope display frame */}
      <BoardFrame position={[-8, terrainHeight(-8, -14.7) - 0.1, -14.7]} yaw={0} width={3.6} height={2.3} />
      {/* radio shack screen frame */}
      <BoardFrame position={[-12, terrainHeight(-12, 26.3) - 0.1, 26.3]} yaw={0} width={3.6} height={2.3} />
      {/* buoy for the Planktoneer screen */}
      <Buoy x={7.5} z={-16} />
      {/* crates near the spawn */}
      <Crate position={[-31, 1.3, 32]} />
      <Crate position={[-30, 1.3, 33.1]} />
      <Crate position={[-30.6, 2.2, 32.5]} />
      {/* lamp posts marking the spawn */}
      <LampPost position={[spawn[0] - 3, terrainHeight(spawn[0] - 3, spawn[2] + 2), spawn[2] + 2]} />
      <LampPost position={[spawn[0] + 3, terrainHeight(spawn[0] + 3, spawn[2] + 2), spawn[2] + 2]} />
      {/* a few scattered rocks on the shelf for scale */}
      {[
        [-50, 5, 1.1],
        [-22, 30, 0.8],
        [-2, 36, 1.3],
        [-24, -24, 0.9],
        [36, 32, 1.0],
      ].map(([x, z, r]) => (
        <RigidBody key={`${x}-${z}`} type="fixed" colliders="hull" position={[x, terrainHeight(x, z) + r * 0.4, z]} rotation={[0.3, x * 0.1, 0.2]} userData={{ surface: "rock" }}>
          <mesh material={mats.rock} castShadow receiveShadow>
            <dodecahedronGeometry args={[r, 0]} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}
