"use client";

import { Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { RENDER } from "../constants";
import { penguinState } from "../penguin/penguinState";

const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    vec3 c = mix(uHorizon, uTop, smoothstep(-0.05, 0.55, h));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

const auroraVertex = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.y += sin(p.x * 0.03 + uTime * 0.3) * 6.0;
    p.z += p.x * p.x * 0.0018;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const auroraFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float x = vUv.x * 8.0 + uTime * 0.15;
    float n = sin(x * 1.7) * 0.5 + sin(x * 3.1 + uTime * 0.4) * 0.25 + sin(x * 0.7 - uTime * 0.2) * 0.25;
    float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35 + n * 0.2, 1.0, vUv.y));
    float curtain = 0.6 + 0.4 * sin(vUv.x * 60.0 + n * 4.0 + uTime * 0.8);
    float edge = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
    vec3 green = vec3(0.24, 0.95, 0.63);
    vec3 cyan = vec3(0.37, 0.95, 1.0);
    vec3 purple = vec3(0.65, 0.55, 0.98);
    vec3 col = mix(green, cyan, smoothstep(0.1, 0.6, vUv.y));
    col = mix(col, purple, smoothstep(0.5, 1.0, vUv.y));
    float a = band * curtain * edge * 0.42;
    gl_FragColor = vec4(col * a, a);
  }
`;

function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color("#05070f") },
      uHorizon: { value: new THREE.Color("#121e38") },
    }),
    [],
  );
  return (
    <mesh frustumCulled={false}>
      <sphereGeometry args={[380, 24, 12]} />
      <shaderMaterial vertexShader={domeVertex} fragmentShader={domeFragment} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

function Aurora() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((state) => {
    if (material.current) material.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh position={[10, 110, -230]} frustumCulled={false}>
      <planeGeometry args={[360, 48, 48, 6]} />
      <shaderMaterial
        ref={material}
        vertexShader={auroraVertex}
        fragmentShader={auroraFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        fog={false}
      />
    </mesh>
  );
}

function Moon() {
  return (
    <group position={[-150, 100, -210]}>
      <mesh>
        <sphereGeometry args={[6, 20, 14]} />
        <meshBasicMaterial color="#e8ecff" fog={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[11, 20, 14]} />
        <meshBasicMaterial color="#aab6ff" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

/** Moon light that follows the penguin so one 1024 shadow map covers the play area around it. */
function MoonLight({ shadows }: { shadows: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const frame = useRef(0);
  useFrame(() => {
    frame.current += 1;
    if (frame.current % 6 !== 0 || !light.current) return;
    const p = penguinState.visualPos;
    light.current.position.set(p.x - 28, p.y + 46, p.z - 36);
    target.position.set(p.x, p.y, p.z);
    target.updateMatrixWorld();
  });
  return (
    <>
      <directionalLight
        ref={light}
        target={target}
        color="#b7c4ff"
        intensity={1.5}
        castShadow={shadows}
        shadow-mapSize={[RENDER.shadowMapSize, RENDER.shadowMapSize]}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-camera-near={5}
        shadow-camera-far={160}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
      <primitive object={target} />
    </>
  );
}

export function Sky({ shadows, starCount = 2600 }: { shadows: boolean; starCount?: number }) {
  return (
    <>
      <fog attach="fog" args={["#070b18", 70, 260]} />
      <hemisphereLight args={["#3b4d80", "#1a2738", 1.35]} />
      <MoonLight shadows={shadows} />
      {/* cool fill from the south-east so walls facing away from the moon still read */}
      <directionalLight color="#2f3f6a" intensity={0.55} position={[40, 30, 60]} />
      <Stars radius={250} depth={80} count={starCount} factor={5} saturation={0} fade speed={0.4} />
      <SkyDome />
      <Aurora />
      <Moon />
    </>
  );
}
