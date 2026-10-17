"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { world } from "@/data";

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  #include <fog_pars_vertex>

  void main() {
    vec3 p = position;
    float t = uTime;
    float w = sin(p.x * 0.35 + t * 0.9) * 0.05
            + sin(p.z * 0.5 - t * 0.7) * 0.04
            + sin((p.x + p.z) * 0.22 + t * 0.5) * 0.06;
    p.y += w;
    float dx = cos(p.x * 0.35 + t * 0.9) * 0.35 * 0.05 + cos((p.x + p.z) * 0.22 + t * 0.5) * 0.22 * 0.06;
    float dz = cos(p.z * 0.5 - t * 0.7) * 0.5 * 0.04 + cos((p.x + p.z) * 0.22 + t * 0.5) * 0.22 * 0.06;
    vNormal = normalize(vec3(-dx, 1.0, -dz));
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uMoonDir;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  #include <fog_pars_fragment>

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorldPos);
    float facing = max(dot(n, v), 0.0);
    float fres = pow(1.0 - facing, 3.0);
    vec3 col = mix(uDeep, uShallow, fres * 0.8);
    col = mix(col, uSky, fres * 0.35);

    vec3 h = normalize(uMoonDir + v);
    float spec = pow(max(dot(n, h), 0.0), 140.0);
    col += vec3(0.75, 0.82, 1.0) * spec * 0.9;

    float s = sin(vWorldPos.x * 0.9 + uTime * 0.8) * sin(vWorldPos.z * 0.7 - uTime * 0.6);
    float streak = smoothstep(0.86, 1.0, s) * 0.16;
    col += vec3(0.6, 0.85, 1.0) * streak;

    float alpha = 0.9 - fres * 0.12;
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

export function Water() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(140, 110, 96, 80);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color("#0b1a2b") },
      uShallow: { value: new THREE.Color("#163a56") },
      uSky: { value: new THREE.Color("#1a2340") },
      uMoonDir: { value: new THREE.Vector3(-0.45, 0.6, -0.65).normalize() },
    }),
    [],
  );

  useFrame((state) => {
    if (material.current) material.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh geometry={geometry} position={[0, world.waterLevel, 0]} renderOrder={1} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        fog
      />
    </mesh>
  );
}
