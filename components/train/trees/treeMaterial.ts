/**
 * One material for every tree: samples the species cell of the atlas, colours leaves per species and season, and
 * drops leaves in organic value-noise patches as cover falls (never in squares, never popping in the distance), with
 * the bark silhouette always underneath. Both faces of a crown share one rounded normal so the back of a quad is not
 * dark. Season changes ease cover and colour at each species' own rate.
 */
import { Color, DoubleSide, MeshStandardMaterial, type Texture } from "three";

import type { Season, Weather } from "../lookTypes";
import { ATLAS_COLS, ATLAS_ROWS } from "./atlas";
import { COVER, leafColours, SPECIES } from "./species";

const N = SPECIES.length;

export type TreeShading = {
  mat: MeshStandardMaterial;
  uniforms: {
    uAtlas: { value: Texture };
    uSnow: { value: number };
    uLeafA: { value: Color[] };
    uLeafB: { value: Color[] };
    uBark: { value: Color[] };
    uCov: { value: number[] };
    uEver: { value: number[] };
  };
  target: { cov: number[]; a: Color[]; b: Color[]; snow: number };
  /** Other tree materials (the conifers built in three dimensions) that dim with the forest at night. */
  extra: MeshStandardMaterial[];
};

export function createTreeShading(atlas: Texture, lowEnd: boolean): TreeShading {
  const uniforms: TreeShading["uniforms"] = {
    uAtlas: { value: atlas },
    uSnow: { value: 0 },
    uLeafA: { value: SPECIES.map(() => new Color()) },
    uLeafB: { value: SPECIES.map(() => new Color()) },
    uBark: { value: SPECIES.map((s) => new Color(s.bark)) },
    uCov: { value: SPECIES.map(() => 1) },
    uEver: { value: SPECIES.map((s) => (s.ever ? 1 : 0)) },
  };
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: DoubleSide, alphaTest: 0.5 });
  mat.alphaToCoverage = !lowEnd;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 aTree;
        uniform vec3 uLeafA[${N}]; uniform vec3 uLeafB[${N}]; uniform vec3 uBark[${N}]; uniform float uCov[${N}]; uniform float uEver[${N}];
        varying vec2 vTUv; varying vec2 vCellOff; varying float vSeed; varying vec3 vLeafA; varying vec3 vLeafB; varying vec3 vBark; varying float vCov; varying float vEver;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        int ci = int(aTree.x + 0.5);
        vTUv = uv;
        vCellOff = vec2(mod(aTree.x, ${ATLAS_COLS}.0), ${ATLAS_ROWS - 1}.0 - floor(aTree.x / ${ATLAS_COLS}.0));
        vSeed = aTree.y;
        vLeafA = uLeafA[ci] * (0.92 + 0.16 * aTree.z); vLeafB = uLeafB[ci]; vBark = uBark[ci]; vCov = uCov[ci]; vEver = uEver[ci];`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uAtlas; uniform float uSnow;
        varying vec2 vTUv; varying vec2 vCellOff; varying float vSeed; varying vec3 vLeafA; varying vec3 vLeafB; varying vec3 vBark; varying float vCov; varying float vEver;
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float tNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y); }`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        normal = normalize(vNormal);`,
      )
      .replace(
        "#include <map_fragment>",
        `vec2 tuv = clamp(vTUv, vec2(0.01), vec2(0.99));
        vec4 tx = texture2D(uAtlas, (tuv + vCellOff) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0));
        float rank = 0.62 * tNoise(vTUv * 6.0 + vSeed * 31.0) + 0.38 * tNoise(vTUv * 17.0 + vSeed * 13.0);
        float soft = 0.03 + clamp(fwidth(rank) * 1.5, 0.0, 0.3);
        float vis = smoothstep(-soft, soft, vCov - rank) * step(0.005, vCov);
        float leafA = tx.b * vis;
        vec3 leafC = mix(vLeafA, vLeafB, fract(vSeed * 7.31)) * (0.42 + 0.9 * tx.r);
        leafC = mix(leafC, vec3(0.92, 0.94, 0.97), uSnow * vEver * smoothstep(0.55, 0.95, tx.r));
        vec3 barkC = vBark * (0.62 + 0.7 * tx.g);
        barkC = mix(barkC, vec3(0.88, 0.9, 0.93), uSnow * 0.35 * step(0.62, tx.g));
        diffuseColor.rgb *= mix(barkC, leafC, step(0.45, leafA));
        diffuseColor.a = max(leafA, tx.a);`,
      );
  };
  const shading: TreeShading = { mat, uniforms, target: { cov: SPECIES.map(() => 1), a: SPECIES.map(() => new Color()), b: SPECIES.map(() => new Color()), snow: 0 }, extra: [] };
  return shading;
}

/** New targets for a season and weather. */
export function setTreeTargets(t: TreeShading, season: Season, weather: Weather): void {
  SPECIES.forEach((sp, i) => {
    const [a, b] = leafColours(sp, season);
    t.target.cov[i] = sp.ever ? 1 : COVER[season];
    t.target.a[i].setHex(a);
    t.target.b[i].setHex(b);
  });
  t.target.snow = weather === "snow" ? 1 : season === "winter" ? 0.35 : 0;
}

/** Ease cover, colour and snow toward the targets; `tone` dims the whole forest at night. */
export function tickTrees(t: TreeShading, dt: number, instant: boolean, tone: Color): void {
  const u = t.uniforms;
  SPECIES.forEach((sp, i) => {
    const k = instant ? 1 : 1 - Math.exp(-dt * 0.9 * sp.rate);
    u.uCov.value[i] += (t.target.cov[i] - u.uCov.value[i]) * k;
    u.uLeafA.value[i].lerp(t.target.a[i], k);
    u.uLeafB.value[i].lerp(t.target.b[i], k);
  });
  u.uSnow.value += (t.target.snow - u.uSnow.value) * (instant ? 1 : 1 - Math.exp(-dt));
  t.mat.color.copy(tone);
  for (const m of t.extra) m.color.copy(tone);
}
