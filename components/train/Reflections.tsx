"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3 } from "three";

import { getCityData, getZoning } from "./cityData";
import { GRID, SEA } from "./constants";
import { reflectRegistry, type ReflectSource } from "./reflectionSources";
import { groundAt, sdfAt } from "./terrain";
import { mirrorState, skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

const VERT = /* glsl */ `
attribute vec4 aSrc;
attribute vec4 aCol;
uniform vec3 uCam;
uniform float uSea;
uniform float uFogD;
varying vec2 vUv;
varying vec3 vCol;
varying float vSeed;
varying float vFog;
// where the camera sees q's mirror image through the water
vec3 hit( vec3 q ) {
  float my = 2.0 * uSea - q.y;
  float t = ( uCam.y - uSea ) / max( uCam.y - my, 1e-3 );
  return uCam + ( vec3( q.x, my, q.z ) - uCam ) * t;
}
void main() {
  vec3 base = vec3( aSrc.x, max( aSrc.z, uSea ), aSrc.y );
  vec3 w0 = hit( base );
  vec3 w1 = hit( base + vec3( 0.0, aSrc.w, 0.0 ) );
  vec2 ax = w1.xz - w0.xz;
  float len = length( ax );
  vec2 dir = len > 1e-3 ? ax / len : vec2( 0.0, 1.0 );
  // ripples draw a reflection out toward the viewer, longer than the mirror image
  vec2 far = w0.xz + dir * max( len * 1.4, aCol.w * 0.6 );
  vec2 side = vec2( -dir.y, dir.x );
  vec2 p = mix( w0.xz, far, position.y ) + side * position.x * aCol.w * ( 1.0 + 0.5 * position.y );
  vec4 mv = viewMatrix * vec4( p.x, uSea + 0.04, p.y, 1.0 );
  gl_Position = projectionMatrix * mv;
  vUv = vec2( position.x * 2.0, position.y );
  vCol = aCol.rgb;
  vSeed = fract( sin( dot( aSrc.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  float d = length( mv.xyz );
  vFog = exp( -uFogD * uFogD * d * d );
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying vec2 vUv;
varying vec3 vCol;
varying float vSeed;
varying float vFog;
float hash( float n ) { return fract( sin( n ) * 43758.5453 ); }
void main() {
  // broken into ripples: bands across the streak, each nudged sideways, some dark, shimmering
  float k = vUv.y * 28.0 + vSeed * 7.0;
  float band = floor( k );
  float h = hash( band * 1.7 + vSeed * 31.0 + floor( uTime * 1.4 + vSeed * 5.0 ) * 0.37 );
  float x = vUv.x + ( h - 0.5 ) * 0.55 + 0.12 * sin( uTime * 1.6 + band * 1.3 );
  float across = clamp( 1.0 - abs( x ), 0.0, 1.0 );
  float f = fract( k );
  float stripe = smoothstep( 0.0, 0.3, f ) * smoothstep( 1.0, 0.55, f ) * step( 0.22, h );
  // strongest at the foot, fading out toward the viewer
  float fade = ( 1.0 - vUv.y ) * smoothstep( 0.0, 0.3, vUv.y );
  gl_FragColor = vec4( vCol * across * across * stripe * fade * uLevel * vFog, 1.0 );
}`;

const WARM = [new Color(0xffc98a), new Color(0xffd9a8), new Color(0xfff0d8), new Color(0xd8e6ff)];

/**
 * Night reflections on Burrard Inlet and False Creek: a rippled streak on the water under every light along the
 * shores, from its foot toward the viewer, as long as its mirror image and then some. One instanced draw, worked out
 * in the vertex shader from the camera, so nothing moves on the CPU; landmark colours are copied in ten times a second.
 */
export function Reflections() {
  const world = useWorld();
  const { lowEnd } = world;
  // the buildings along both shores and the floating districts, the tallest nearest the water first
  const city = useMemo(() => {
    const out: (ReflectSource & { rank: number })[] = [];
    getCityData(lowEnd).lots.forEach((l, i) => {
      if (l.h < 4) return;
      const sd = sdfAt(l.x, l.z);
      if (sd > (l.h >= 10 ? 80 : 45) || sd < -60) return;
      const gain = 0.7 + (0.5 * ((i * 7) % 5)) / 4;
      out.push({ x: l.x, z: l.z, y: groundAt(l.x, l.z), h: l.h, w: Math.min(l.w, l.d) * 0.8, col: WARM[i % WARM.length], gain, rank: l.h / (8 + Math.max(0, sd)) });
    });
    out.sort((a, b) => b.rank - a.rank);
    // and the glow of every lit block along the shore: street lights and low windows, a broad warm wash
    const z = getZoning(lowEnd);
    const glow: ReflectSource[] = [];
    for (let j = 0; j < z.nj; j++) {
      for (let i = 0; i < z.ni; i++) {
        if (!z.data[j * z.ni + i]) continue;
        const x = GRID.x0 + (z.i0 + i + 0.5) * GRID.cw;
        const zz = GRID.z0 + (z.j0 + j + 0.5) * GRID.ch;
        const sd = sdfAt(x, zz);
        if (sd < 0 || sd > 40) continue;
        glow.push({ x, z: zz, y: groundAt(x, zz), h: 9, w: GRID.cw * 0.35, col: WARM[(i + j) % 2], gain: 0.28 });
      }
    }
    return [...glow, ...out.slice(0, lowEnd ? 420 : 900)];
  }, [lowEnd]);

  const built = useMemo(() => {
    const geo = new InstancedBufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uCam: { value: new Vector3() }, uSea: { value: SEA }, uFogD: { value: 0 }, uTime: { value: 0 }, uLevel: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return { geo, mat, mesh, version: -1, sources: [] as ReflectSource[], col: null as InstancedBufferAttribute | null, tick: 0 };
  }, []);

  useEffect(() => {
    const done = skipInMirror(built.mesh);
    return () => {
      done();
      built.geo.dispose();
      built.mat.dispose();
    };
  }, [built]);

  useFrame((state, delta) => {
    const level = world.buildings.solid.emissiveIntensity;
    // the mirror shows the real thing where it runs; these stand in for it elsewhere
    built.mesh.visible = level > 0.02 && !mirrorState.active;
    if (!built.mesh.visible) return;
    const u = built.mat.uniforms;
    u.uCam.value.copy(state.camera.position);
    u.uFogD.value = world.scene.fog.density;
    u.uTime.value = state.clock.elapsedTime;
    u.uLevel.value = level;
    // (re)build the instances when the landmarks register theirs
    const version = reflectRegistry.version * 4096 + city.length;
    if (built.version !== version) {
      built.version = version;
      built.sources = [...city, ...reflectRegistry.list];
      const n = built.sources.length;
      const src = new Float32Array(n * 4);
      built.sources.forEach((s, i) => src.set([s.x, s.z, s.y, s.h], i * 4));
      built.geo.setAttribute("aSrc", new InstancedBufferAttribute(src, 4));
      built.col = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
      built.geo.setAttribute("aCol", built.col);
      built.geo.instanceCount = n;
      built.tick = 0;
    }
    built.tick -= delta;
    if (built.tick > 0 || !built.col) return;
    built.tick = 0.1;
    const arr = built.col.array as Float32Array;
    built.sources.forEach((s, i) => arr.set([s.col.r * s.gain, s.col.g * s.gain, s.col.b * s.gain, s.w], i * 4));
    built.col.needsUpdate = true;
  });

  return <primitive object={built.mesh} />;
}
