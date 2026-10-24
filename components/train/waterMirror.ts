/**
 * The water's mirror, shared between the pass that renders it (Mirror.tsx), the water material that shows it
 * (world.ts) and the components whose objects it leaves out: the ground, trees, houses, people, cars and other
 * small or low things a reflection would not show, which keeps the second pass cheap. `active` is false where the
 * mirror is off (low-end devices) or no water is in view; the light streaks stand in for it then.
 */
import { Color, Matrix4, type MeshStandardMaterial, type Object3D, type Texture, type Vector3 } from "three";

export const mirrorSkip = new Set<Object3D>();

export const mirrorState = { active: false };

export const mirrorUniforms = {
  tMirror: { value: null as Texture | null },
  uMirrorMatrix: { value: new Matrix4() },
  uMirrorOn: { value: 0 },
  uMirrorTime: { value: 0 },
};

/** The sea's own colour (eased by the look) and the sun or moon it glitters with (colour times strength). */
export const seaUniforms = {
  uSeaDeep: { value: new Color(0x1f5a86) },
  uSunCol: { value: new Color(0xffffff) },
};

/** Leave these out of the reflection; returns the cleanup for an effect. */
export function skipInMirror(...objs: (Object3D | null | undefined)[]): () => void {
  const list = objs.filter((o): o is Object3D => !!o);
  for (const o of list) mirrorSkip.add(o);
  return () => {
    for (const o of list) mirrorSkip.delete(o);
  };
}

/**
 * Give the sea's material its surface and the mirror. The surface: the water's own deep colour, small waves that
 * fade into the distance, the sky reflected by a Fresnel term (the waves tilt the far sea's reflection up into the
 * bluer sky, so the open water stays blue to the horizon instead of turning the colour of the haze), and the sun's
 * glitter. The haze takes only part of the far sea, so the horizon is a line between sea and sky. The mirror (on
 * desktop) is the reflection sampled through the mirror camera's projection, broken by the same waves (smeared along
 * the line of sight far more than sideways), strongest near at a glancing view and giving way to the sky's
 * reflection far out. Trout Lake, at its own level, has the same water with calmer waves and the sky's reflection in
 * place of the mirror (whose plane is the sea's).
 */
export function applyMirror(mat: MeshStandardMaterial, seaLevel: number, lakeLevel: number, sky: { top: { value: Color }; hor: { value: Color } }, sunDir: Vector3): void {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mirrorUniforms, seaUniforms, { uSeaLevel: { value: seaLevel }, uLakeLevel: { value: lakeLevel }, uSkyTop: sky.top, uSkyHor: sky.hor, uSunDir: { value: sunDir } });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform mat4 uMirrorMatrix;\nvarying vec4 vMirrorCoord;\nvarying vec3 vMirrorWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvec4 mirrorWorld = modelMatrix * vec4( transformed, 1.0 );\nvMirrorWorld = mirrorWorld.xyz;\nvMirrorCoord = uMirrorMatrix * mirrorWorld;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform sampler2D tMirror;",
          "uniform float uMirrorOn;",
          "uniform float uMirrorTime;",
          "uniform float uSeaLevel;",
          "uniform float uLakeLevel;",
          "uniform vec3 uSeaDeep;",
          "uniform vec3 uSunCol;",
          "uniform vec3 uSunDir;",
          "uniform vec3 uSkyTop;",
          "uniform vec3 uSkyHor;",
          "varying vec4 vMirrorCoord;",
          "varying vec3 vMirrorWorld;",
        ].join("\n"),
      )
      .replace(
        "#include <opaque_fragment>",
        [
          "bool onSea = abs( vMirrorWorld.y - uSeaLevel ) < 0.3;",
          "bool onLake = !onSea && abs( vMirrorWorld.y - uLakeLevel ) < 0.3;",
          "if ( onSea || onLake ) {",
          "  float mt = uMirrorTime;",
          // the swells' crests wander, so they never line up into a grid
          "  vec2 mp = vMirrorWorld.xz + 6.0 * vec2( sin( vMirrorWorld.z * 0.031 + mt * 0.05 ), sin( vMirrorWorld.x * 0.027 - mt * 0.04 ) );",
          "  float dist = length( cameraPosition - vMirrorWorld );",
          "  vec3 V = normalize( cameraPosition - vMirrorWorld );",
          // the waves' slope: a few crossing swells and a chop, fading with distance (they average out)
          "  vec2 sl = vec2(",
          "    cos( mp.x * 0.21 + mp.y * 0.07 + mt * 0.8 ) * 0.5 + cos( mp.x * 0.57 - mp.y * 0.33 + mt * 1.5 ) * 0.3 + cos( mp.x * 1.9 + mp.y * 1.3 + mt * 2.6 ) * 0.2,",
          "    cos( mp.y * 0.26 - mp.x * 0.05 + mt * 0.9 ) * 0.5 + cos( mp.y * 0.71 + mp.x * 0.29 + mt * 1.7 ) * 0.3 + cos( mp.y * 2.3 - mp.x * 0.9 + mt * 2.9 ) * 0.2 );",
          "  float amp = ( 0.025 + 0.08 * ( 1.0 - smoothstep( 40.0, 600.0, dist ) ) ) * ( onLake ? 0.55 : 1.0 );",
          "  vec3 N = normalize( vec3( -sl.x * amp, 1.0, -sl.y * amp ) );",
          "  vec3 R = reflect( -V, N );",
          "  R.y = max( R.y, 0.05 + 0.12 * smoothstep( 150.0, 2500.0, dist ) );",
          "  vec3 skyR = mix( uSkyHor, uSkyTop, pow( smoothstep( -0.02, 0.6, R.y ), 0.7 ) );",
          "  float fres = min( 0.02 + 0.98 * pow( 1.0 - max( V.y, 0.0 ), 5.0 ), 0.68 );",
          // the water's own colour, a little lighter where a wave faces the light
          "  vec3 body = uSeaDeep * ( 0.82 + 0.3 * max( dot( N, normalize( uSunDir ) ), 0.0 ) );",
          "  vec3 sea = mix( body, skyR, fres );",
          // the sun's (or the moon's) glitter on the near waves, a broad sheen far out
          "  float rs = max( dot( reflect( -V, N ), normalize( uSunDir ) ), 0.0 );",
          "  sea += uSunCol * ( pow( rs, 260.0 ) * 3.0 * ( 1.0 - smoothstep( 300.0, 1400.0, dist ) ) + pow( rs, 24.0 ) * 0.12 );",
          "  outgoingLight = sea + totalEmissiveRadiance;",
          "  if ( uMirrorOn > 0.5 && onSea ) {",
          "    vec4 mc = vMirrorCoord;",
          "    mc.x += sl.x * 0.004 * mc.w;",
          "    mc.y += sl.y * 0.016 * mc.w;",
          "    vec3 refl = texture2DProj( tMirror, mc ).rgb;",
          "    float mf = ( 0.3 + 0.62 * pow( 1.0 - max( V.y, 0.0 ), 3.0 ) ) * ( 1.0 - smoothstep( 350.0, 1300.0, dist ) );",
          "    outgoingLight = mix( outgoingLight, refl, mf );",
          "  }",
          "}",
          "#include <opaque_fragment>",
        ].join("\n"),
      )
      // the haze takes only part of the open sea, so it stays blue out to a clear horizon
      .replace(
        "#include <fog_fragment>",
        [
          "#ifdef USE_FOG",
          "  #ifdef FOG_EXP2",
          "    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );",
          "  #else",
          "    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );",
          "  #endif",
          "  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * ( onSea || onLake ? 0.5 : 1.0 ) );",
          "#endif",
        ].join("\n"),
      );
  };
}
