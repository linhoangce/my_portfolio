"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BatchedMesh, Color, Euler, Matrix4, MeshStandardMaterial, Quaternion, Vector3, Vector4 } from "three";

import { aircraft } from "./aircraft";
import { airTaxis, flyTaxis } from "./airways";
import { useDispose } from "./useDispose";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/** The accents the taxis' light lines take: ice, cyan, amber, warm white, violet (never the drones' red, green or strobe). */
const ACCENTS = [0xcfe8ff, 0x5fd8ff, 0xffb048, 0xffdfae, 0x9f92ff];
/** The liveries, a maker's metallic paints: a paint and its accent (an index into ACCENTS). */
const LIVERIES: [number, number][] = [
  [0x15171b, 1], // obsidian
  [0xe9e8e3, 0], // pearl
  [0x4b525c, 2], // gunmetal
  [0x1c2a4a, 0], // midnight
  [0xa9b0b8, 1], // titanium
  [0x5a1822, 3], // burgundy
  [0xc8b38f, 3], // champagne
  [0x1d4a4f, 2], // deep teal
  [0x30343b, 4], // graphite
  [0x203a2b, 3], // racing green
  [0x8a5a3c, 0], // bronze
  [0x51637a, 1], // slate
];

const m4 = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const one = new Vector3(1, 1, 1);
const none = new Vector3(0, 0, 0);
const eu = new Euler();
const white = new Color(0xffffff);

/**
 * The air taxis on their timetables (airways.ts), the five makes (aircraft.ts) in a dozen liveries, one batched mesh,
 * one draw. Each taxi's paint is its livery's and its light lines and fan rings its accent, lit by day and bright
 * after dark, breathing slowly (the delivery drones show points and a strobe); after dark the cabins glow warm and the
 * paint keeps some of its colour, so a taxi reads against the night as a lit shape.
 */
export function AirTaxis() {
  const world = useWorld();
  const { lowEnd } = world;

  const built = useMemo(() => {
    const air = airTaxis(lowEnd);
    const geos = aircraft();
    const u = {
      uGlow: { value: 0.7 },
      uCabin: { value: 0.05 },
      uSelf: { value: 0 },
      uTime: { value: 0 },
      uAccent: { value: ACCENTS.map((h) => new Color(h)) },
    };
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.45, envMap: world.envTex, envMapIntensity: 0.9 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          [
            "#include <common>",
            "attribute float aGlow;",
            "attribute float aTint;",
            "uniform float uGlow;",
            "uniform float uCabin;",
            "uniform float uSelf;",
            "uniform float uTime;",
            `uniform vec3 uAccent[${ACCENTS.length}];`,
            "varying vec3 vEmit;",
            "varying float vGlass;",
          ].join("\n"),
        )
        .replace(
          "#include <color_vertex>",
          [
            "#include <color_vertex>",
            // the instance's colour is its livery: the paint, and its accent's index in the alpha
            "vec4 livery = vec4( 1.0 );",
            "float beat = 0.0;",
            "#ifdef USE_BATCHING_COLOR",
            "livery = getBatchingColor( getIndirectIndex( gl_DrawID ) );",
            "beat = fract( getIndirectIndex( gl_DrawID ) * 0.618034 ) * 6.2832;",
            "#endif",
            "vec3 accent = uAccent[ int( livery.a + 0.5 ) ];",
            "vec3 paint = mix( color.rgb, livery.rgb, aTint );",
            "vGlass = 0.0;",
            "vEmit = paint * uSelf * aTint;",
            "if ( aGlow > 2.5 ) { vGlass = 1.0; vEmit = vec3( 1.0, 0.62, 0.3 ) * uCabin * step( 3.5, aGlow ); }",
            "else if ( aGlow > 1.5 ) { paint = accent; vEmit = accent * uGlow * ( 0.82 + 0.18 * sin( uTime * 1.6 + beat ) ); }",
            "else if ( aGlow > 0.5 ) vEmit = paint * uGlow;",
            "vColor = vec4( paint, 1.0 );",
          ].join("\n"),
        );
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vEmit;\nvarying float vGlass;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.06, vGlass );")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 0.0, vGlass );")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit;");
    };
    mat.customProgramCacheKey = () => "aircraft";
    const mesh = new BatchedMesh(
      Math.max(1, air.taxis.length),
      geos.reduce((s, g) => s + g.attributes.position.count, 0),
      0,
      mat,
    );
    const geoIds = geos.map((g) => mesh.addGeometry(g));
    for (const g of geos) g.dispose();
    // the makes in turn and the liveries stepped through, so neighbours differ
    const c = new Color();
    const v = new Vector4();
    const ids = air.taxis.map((_, k) => {
      const id = mesh.addInstance(geoIds[k % geoIds.length]);
      const [paint, accent] = LIVERIES[(k * 5 + 2) % LIVERIES.length];
      c.setHex(paint);
      mesh.setColorAt(id, v.set(c.r, c.g, c.b, accent));
      return id;
    });
    mesh.castShadow = !lowEnd;
    mesh.frustumCulled = false;
    mesh.sortObjects = false;
    return { air, mesh, mat, u, ids };
  }, [lowEnd, world.envTex]);

  // too small to show in the water
  useEffect(() => skipInMirror(built.mesh), [built]);
  useDispose(built, (b) => {
    b.mesh.dispose();
    b.mat.dispose();
  });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // their bank and pitch on top of the heading; none past the map's edge
    flyTaxis(built.air, t);
    built.air.taxis.forEach((h, i) => {
      p.set(h.x, h.y, h.z);
      q.setFromEuler(eu.set(h.roll, h.yaw, h.pitch, "YZX"));
      built.mesh.setMatrixAt(built.ids[i], m4.compose(p, q, h.shown ? one : none));
    });
    // after dark: the lights brighter, the cabins lit, the paint only partly taking the city's night tone and holding a
    // little of its own colour, the lit room the metal reflects (world.ts) mostly gone
    const lit = world.buildings.solid.emissiveIntensity;
    built.u.uTime.value = t;
    built.u.uGlow.value = 0.7 + 1.9 * lit;
    built.u.uCabin.value = 0.04 + 0.5 * lit;
    built.u.uSelf.value = 0.06 * lit;
    built.mat.color.copy(white).lerp(world.buildings.solid.color, 0.8);
    built.mat.envMapIntensity = 0.9 - 0.65 * lit;
  }, -40);

  return <primitive object={built.mesh} />;
}
