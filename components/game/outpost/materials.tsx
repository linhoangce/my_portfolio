"use client";

import { useMemo } from "react";
import * as THREE from "three";

/** Shared flat-shaded materials for the outpost so buildings batch by material. */
export const mats = {
  // A faint emissive floor keeps unlit walls readable at night without washing out the moonlight.
  rock: new THREE.MeshStandardMaterial({ color: "#2b2f3a", emissive: "#0b0d14", emissiveIntensity: 1, flatShading: true, roughness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: "#1c2030", emissive: "#0c1020", emissiveIntensity: 1, flatShading: true, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: "#5a3d2b", emissive: "#1a110a", emissiveIntensity: 1, flatShading: true, roughness: 0.9 }),
  woodLight: new THREE.MeshStandardMaterial({ color: "#7a573d", emissive: "#1e150d", emissiveIntensity: 1, flatShading: true, roughness: 0.9 }),
  panel: new THREE.MeshStandardMaterial({ color: "#9fb3c8", emissive: "#1f2a3c", emissiveIntensity: 1, flatShading: true, roughness: 0.8 }),
  ice: new THREE.MeshStandardMaterial({ color: "#dfe9f3", flatShading: true, roughness: 0.85 }),
  tower: new THREE.MeshStandardMaterial({ color: "#e4e9f0", emissive: "#232a3a", emissiveIntensity: 1, flatShading: true, roughness: 0.8 }),
  lamp: new THREE.MeshStandardMaterial({ color: "#ffb85c", emissive: "#ffb85c", emissiveIntensity: 2.6 }),
  window: new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ffb85c", emissiveIntensity: 1.5 }),
  cyan: new THREE.MeshStandardMaterial({ color: "#5ef2ff", emissive: "#5ef2ff", emissiveIntensity: 2 }),
  accent: new THREE.MeshStandardMaterial({ color: "#a78bfa", emissive: "#a78bfa", emissiveIntensity: 1.4 }),
  red: new THREE.MeshStandardMaterial({ color: "#ff5a5a", emissive: "#ff3b3b", emissiveIntensity: 2 }),
};

/** Triangular prism roof: `width` across the ridge, `length` along it. */
export function GableRoof({
  width,
  length,
  height,
  position,
  material = mats.rock,
}: {
  width: number;
  length: number;
  height: number;
  position: [number, number, number];
  material?: THREE.Material;
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
    g.translate(0, 0, -length / 2);
    g.computeVertexNormals();
    return g;
  }, [width, length, height]);
  return <mesh geometry={geometry} material={material} position={position} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />;
}

/** Simple warm window: an emissive quad slightly proud of the wall. */
export function WindowPane({
  position,
  rotation = [0, 0, 0],
  size = [0.9, 0.7],
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} material={mats.window}>
      <planeGeometry args={size} />
    </mesh>
  );
}

/** Post lamp without a real light: emissive head only, cheap. */
export function LampPost({ position, height = 2.6 }: { position: [number, number, number]; height?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} material={mats.dark}>
        <cylinderGeometry args={[0.06, 0.08, height, 6]} />
      </mesh>
      <mesh position={[0, height + 0.15, 0]} material={mats.lamp}>
        <sphereGeometry args={[0.22, 8, 6]} />
      </mesh>
    </group>
  );
}
