"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { penguinState } from "./penguinState";

const dampScalar = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/**
 * Procedural low-poly penguin built around the capsule centre (y = 0, feet at
 * about -0.62). To use a rigged GLB later, replace the JSX below with the
 * loaded scene and drive its clips from `penguinState.move`.
 */
export function PenguinModel() {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftFlipper = useRef<THREE.Group>(null);
  const rightFlipper = useRef<THREE.Group>(null);
  const leftFoot = useRef<THREE.Mesh>(null);
  const rightFoot = useRef<THREE.Mesh>(null);

  const materials = useMemo(
    () => ({
      black: new THREE.MeshStandardMaterial({ color: "#14161c", flatShading: true, roughness: 0.8 }),
      white: new THREE.MeshStandardMaterial({ color: "#eef2f6", flatShading: true, roughness: 0.75 }),
      orange: new THREE.MeshStandardMaterial({ color: "#ff8c2a", flatShading: true, roughness: 0.7 }),
      eye: new THREE.MeshStandardMaterial({ color: "#f6f8fb", roughness: 0.4 }),
      pupil: new THREE.MeshStandardMaterial({ color: "#05070f", roughness: 0.4 }),
    }),
    [],
  );

  const anim = useRef({ t: 0, pitch: 0, lift: 0, roll: 0, flap: 0, squash: 1 }).current;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = penguinState;
    const g = root.current;
    const b = body.current;
    if (!g || !b) return;

    anim.t += dt * (1 + s.speed * 0.5);

    let targetPitch = 0;
    let targetLift = 0;
    let targetFlap = 0.15;
    let targetSquash = 1;
    const walking = s.move === "walk" && s.grounded && s.speed > 0.4;

    if (s.move === "slide") {
      targetPitch = -Math.PI / 2 + 0.1;
      targetLift = -0.3;
      targetFlap = 1.0;
    } else if (s.move === "swim") {
      targetPitch = s.diving ? -Math.PI / 2 + 0.3 : -Math.PI / 2 + 0.55;
      targetLift = -0.18;
      targetFlap = 0.35 + Math.sin(anim.t * 7) * 0.55;
    } else if (!s.grounded) {
      targetPitch = -0.22;
      targetFlap = 1.05;
      targetSquash = 0.94;
    } else if (walking) {
      targetFlap = 0.35 + Math.sin(anim.t * 11) * 0.35;
    }

    anim.pitch = dampScalar(anim.pitch, targetPitch, 10, dt);
    anim.lift = dampScalar(anim.lift, targetLift, 10, dt);
    anim.flap = dampScalar(anim.flap, targetFlap, 14, dt);
    anim.squash = dampScalar(anim.squash, targetSquash, 12, dt);

    g.rotation.set(anim.pitch, s.yaw, 0, "YXZ");

    const bob = walking ? Math.sin(anim.t * 11) * 0.035 : s.move === "swim" ? Math.sin(anim.t * 3.5) * 0.04 : 0;
    const roll = walking ? Math.sin(anim.t * 5.5) * 0.1 : s.move === "swim" ? Math.sin(anim.t * 3) * 0.08 : 0;
    anim.roll = dampScalar(anim.roll, roll, 12, dt);
    b.position.y = bob + anim.lift;
    b.rotation.z = anim.roll;
    b.scale.set(1 / Math.sqrt(anim.squash), anim.squash, 1 / Math.sqrt(anim.squash));

    if (leftFlipper.current && rightFlipper.current) {
      leftFlipper.current.rotation.z = 0.25 + anim.flap;
      rightFlipper.current.rotation.z = -(0.25 + anim.flap);
      // Swim strokes sweep backward as well.
      const sweep = s.move === "swim" ? Math.sin(anim.t * 7) * 0.5 : 0;
      leftFlipper.current.rotation.x = sweep;
      rightFlipper.current.rotation.x = sweep;
    }
    if (leftFoot.current && rightFoot.current) {
      const step = walking ? Math.sin(anim.t * 11) * 0.12 : 0;
      leftFoot.current.position.z = 0.06 + step;
      rightFoot.current.position.z = 0.06 - step;
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* body */}
        <mesh position={[0, -0.08, 0]} scale={[0.3, 0.4, 0.28]} material={materials.black} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        {/* belly */}
        <mesh position={[0, -0.1, 0.1]} scale={[0.23, 0.32, 0.2]} material={materials.white}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        {/* head */}
        <mesh position={[0, 0.4, 0.02]} material={materials.black} castShadow>
          <sphereGeometry args={[0.2, 10, 8]} />
        </mesh>
        {/* face patch */}
        <mesh position={[0, 0.39, 0.1]} scale={[0.16, 0.13, 0.12]} material={materials.white}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.08, 0.46, 0.16]} material={materials.eye}>
          <sphereGeometry args={[0.035, 6, 5]} />
        </mesh>
        <mesh position={[0.08, 0.46, 0.16]} material={materials.eye}>
          <sphereGeometry args={[0.035, 6, 5]} />
        </mesh>
        <mesh position={[-0.085, 0.46, 0.19]} material={materials.pupil}>
          <sphereGeometry args={[0.017, 5, 4]} />
        </mesh>
        <mesh position={[0.085, 0.46, 0.19]} material={materials.pupil}>
          <sphereGeometry args={[0.017, 5, 4]} />
        </mesh>
        {/* beak */}
        <mesh position={[0, 0.39, 0.27]} rotation={[Math.PI / 2, 0, 0]} material={materials.orange}>
          <coneGeometry args={[0.05, 0.18, 5]} />
        </mesh>
        {/* flippers, pivot at the shoulder */}
        <group ref={leftFlipper} position={[-0.29, 0.1, 0]}>
          <mesh position={[0, -0.18, 0]} material={materials.black} castShadow>
            <boxGeometry args={[0.05, 0.36, 0.14]} />
          </mesh>
        </group>
        <group ref={rightFlipper} position={[0.29, 0.1, 0]}>
          <mesh position={[0, -0.18, 0]} material={materials.black} castShadow>
            <boxGeometry args={[0.05, 0.36, 0.14]} />
          </mesh>
        </group>
        {/* tail */}
        <mesh position={[0, -0.32, -0.26]} rotation={[-0.6, 0, 0]} material={materials.black}>
          <boxGeometry args={[0.14, 0.05, 0.2]} />
        </mesh>
      </group>
      {/* feet stay on the ground plane of the capsule */}
      <mesh ref={leftFoot} position={[-0.1, -0.6, 0.06]} material={materials.orange}>
        <boxGeometry args={[0.12, 0.04, 0.22]} />
      </mesh>
      <mesh ref={rightFoot} position={[0.1, -0.6, 0.06]} material={materials.orange}>
        <boxGeometry args={[0.12, 0.04, 0.22]} />
      </mesh>
    </group>
  );
}
