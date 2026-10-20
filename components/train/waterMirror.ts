/**
 * The water's mirror, shared between the pass that renders it (Mirror.tsx), the water material that shows it
 * (world.ts) and the components whose objects it leaves out: the ground, trees, houses, people, cars and other
 * small or low things a reflection would not show, which keeps the second pass cheap. `active` is false where the
 * mirror is off (low-end devices) or no water is in view; the light streaks stand in for it then.
 */
import { Matrix4, type MeshStandardMaterial, type Object3D, type Texture } from "three";

export const mirrorSkip = new Set<Object3D>();

export const mirrorState = { active: false };

export const mirrorUniforms = {
  tMirror: { value: null as Texture | null },
  uMirrorMatrix: { value: new Matrix4() },
  uMirrorOn: { value: 0 },
  uMirrorTime: { value: 0 },
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
 * Give the sea's material the mirror: the reflection sampled through the mirror camera's projection, broken by small
 * waves (which smear it along the line of sight far more than sideways), mixed in by a Fresnel term so the water
 * mirrors most at a glancing view. Trout Lake shares the material but not the sea level, so it is left plain.
 */
export function applyMirror(mat: MeshStandardMaterial, seaLevel: number): void {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mirrorUniforms, { uSeaLevel: { value: seaLevel } });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform mat4 uMirrorMatrix;\nvarying vec4 vMirrorCoord;\nvarying vec3 vMirrorWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvec4 mirrorWorld = modelMatrix * vec4( transformed, 1.0 );\nvMirrorWorld = mirrorWorld.xyz;\nvMirrorCoord = uMirrorMatrix * mirrorWorld;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D tMirror;\nuniform float uMirrorOn;\nuniform float uMirrorTime;\nuniform float uSeaLevel;\nvarying vec4 vMirrorCoord;\nvarying vec3 vMirrorWorld;",
      )
      .replace(
        "#include <opaque_fragment>",
        [
          "if ( uMirrorOn > 0.5 && abs( vMirrorWorld.y - uSeaLevel ) < 0.3 ) {",
          "  vec2 mp = vMirrorWorld.xz;",
          "  float mt = uMirrorTime;",
          "  vec2 wav = vec2(",
          "    sin( mp.x * 0.35 + mt * 1.1 ) * 0.6 + sin( mp.y * 0.83 - mt * 1.7 + mp.x * 0.2 ) * 0.4,",
          "    sin( mp.y * 0.41 + mt * 1.3 ) * 0.5 + sin( mp.x * 0.67 + mp.y * 0.3 + mt * 2.1 ) * 0.5 );",
          "  vec4 mc = vMirrorCoord;",
          "  mc.x += wav.x * 0.005 * mc.w;",
          "  mc.y += wav.y * 0.02 * mc.w;",
          "  vec3 refl = texture2DProj( tMirror, mc ).rgb;",
          "  vec3 mv = normalize( cameraPosition - vMirrorWorld );",
          "  float fres = 0.3 + 0.62 * pow( 1.0 - max( mv.y, 0.0 ), 3.0 );",
          "  outgoingLight = mix( outgoingLight, refl, fres );",
          "}",
          "#include <opaque_fragment>",
        ].join("\n"),
      );
  };
}
