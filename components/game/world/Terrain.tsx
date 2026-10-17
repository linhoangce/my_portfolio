"use client";

import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";

import { noise2, terrainHeight } from "./terrainHeight";

const SIZE_X = 136;
const SIZE_Z = 104;
const CELL = 1.5;

export function buildTerrain() {
  const nx = Math.round(SIZE_X / CELL);
  const nz = Math.round(SIZE_Z / CELL);
  const w = nx + 1;
  const d = nz + 1;
  const positions = new Float32Array(w * d * 3);
  const colors = new Float32Array(w * d * 3);
  const indices = new Uint32Array(nx * nz * 6);

  const ice = new THREE.Color("#dfe9f3");
  const iceDark = new THREE.Color("#9fc0dc");
  const shore = new THREE.Color("#3d6a8a");
  const deep = new THREE.Color("#0b1a2b");
  const deep2 = new THREE.Color("#102a43");
  const c = new THREE.Color();

  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const x = -SIZE_X / 2 + i * CELL;
      const z = -SIZE_Z / 2 + j * CELL;
      const h = terrainHeight(x, z);
      const k = (j * w + i) * 3;
      positions[k] = x;
      positions[k + 1] = h;
      positions[k + 2] = z;
      const n = noise2(x * 0.9 + 11, z * 0.9 + 5);
      if (h > 0.2) c.copy(ice).lerp(iceDark, n * 0.75);
      else if (h > -1.4) c.copy(iceDark).lerp(shore, (0.2 - h) / 1.6);
      else c.copy(deep).lerp(deep2, n);
      colors[k] = c.r;
      colors[k + 1] = c.g;
      colors[k + 2] = c.b;
    }
  }

  let q = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * w + i;
      const b = a + 1;
      const cc = a + w;
      const dd = cc + 1;
      // Alternate the diagonal so the facets read as broken ice rather than a grid.
      if ((i + j) % 2 === 0) {
        indices[q++] = a;
        indices[q++] = cc;
        indices[q++] = b;
        indices[q++] = b;
        indices[q++] = cc;
        indices[q++] = dd;
      } else {
        indices[q++] = a;
        indices[q++] = cc;
        indices[q++] = dd;
        indices[q++] = a;
        indices[q++] = dd;
        indices[q++] = b;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, positions, indices };
}

export function Terrain() {
  const { geometry, positions, indices } = useMemo(buildTerrain, []);
  return (
    <RigidBody type="fixed" colliders={false} friction={0.05} userData={{ surface: "ice" }}>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.92} metalness={0} />
      </mesh>
      <TrimeshCollider args={[positions, indices]} />
    </RigidBody>
  );
}
