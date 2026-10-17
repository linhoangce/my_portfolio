"use client";

import { useFrame } from "@react-three/fiber";
import { CylinderCollider, RigidBody } from "@react-three/rapier";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { registerOccluder } from "../screens/occluders";
import { mats } from "./materials";

const X = -12;
const Z = 8;
const BASE_Y = 0.5;
const TOWER_H = 10;
const LANTERN_Y = BASE_Y + 1.2 + TOWER_H + 0.8;

/** Lighthouse with a slowly sweeping beam: one spot light plus an additive cone. */
export function Lighthouse() {
  const sweep = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const beamMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffb85c",
        transparent: true,
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [],
  );

  useFrame((state) => {
    if (sweep.current) sweep.current.rotation.y = state.clock.elapsedTime * 0.45;
  });

  return (
    <group position={[X, 0, Z]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: "rock" }}>
        <CylinderCollider args={[0.6, 2.6]} position={[0, BASE_Y + 0.6, 0]} />
        <CylinderCollider args={[TOWER_H / 2 + 1, 1.5]} position={[0, BASE_Y + 1.2 + TOWER_H / 2, 0]} />
        <mesh position={[0, BASE_Y + 0.6, 0]} material={mats.rock} castShadow receiveShadow>
          <cylinderGeometry args={[2.4, 2.8, 1.2, 8]} />
        </mesh>
        <mesh ref={registerOccluder} position={[0, BASE_Y + 1.2 + TOWER_H / 2, 0]} material={mats.tower} castShadow>
          <cylinderGeometry args={[1.1, 1.5, TOWER_H, 10]} />
        </mesh>
        <mesh position={[0, BASE_Y + 4.5, 0]} material={mats.dark}>
          <cylinderGeometry args={[1.37, 1.42, 0.5, 10]} />
        </mesh>
        <mesh position={[0, BASE_Y + 8, 0]} material={mats.dark}>
          <cylinderGeometry args={[1.22, 1.27, 0.5, 10]} />
        </mesh>
        {/* lantern room */}
        <mesh position={[0, LANTERN_Y, 0]} material={mats.dark}>
          <cylinderGeometry args={[1.25, 1.25, 1.6, 10, 1, true]} />
        </mesh>
        <mesh position={[0, LANTERN_Y, 0]} material={mats.lamp}>
          <sphereGeometry args={[0.6, 10, 8]} />
        </mesh>
        <mesh position={[0, LANTERN_Y + 1.3, 0]} material={mats.rock} castShadow>
          <coneGeometry args={[1.5, 1.1, 10]} />
        </mesh>
      </RigidBody>

      <pointLight position={[0, LANTERN_Y, 0]} color="#ffb85c" intensity={40} distance={40} decay={1.6} />

      <group ref={sweep} position={[0, LANTERN_Y, 0]}>
        <group rotation={[0, 0, -0.08]}>
          <mesh position={[36, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={beamMaterial}>
            <coneGeometry args={[4.5, 72, 14, 1, true]} />
          </mesh>
          <primitive object={target} position={[70, -4, 0]} />
          <spotLight
            target={target}
            color="#ffb85c"
            intensity={420}
            distance={95}
            angle={0.15}
            penumbra={0.7}
            decay={1.3}
          />
        </group>
      </group>
    </group>
  );
}
