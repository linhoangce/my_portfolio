"use client";

import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { Rng } from "./cityModel";
import { getTreeData } from "./cityData";
import { groundAt } from "./terrain";
import { trackDist, UP } from "./track";
import { CONIFER_FILL } from "./trees/atlas";
import { barkTexture, type Conifer, CONIFERS, coniferSkeleton, crownFromOf, type Detail, frondAtlas, frondBand, limbGeometry, sprayCard, sprayMatrix, trunkGeometry } from "./trees/conifer";
import { SPECIES, SPECIES_INDEX } from "./trees/species";
import { type TreeShading } from "./trees/treeMaterial";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/**
 * Conifers this close to the line are built in three dimensions, as at Contact (trees/conifer.ts), at most so many
 * (the nearest win); the rest stay painted cards, drawn from the same build.
 */
const NEAR: Record<"full" | "lite", { d: number; max: number; detail: Detail; radial: number }> = {
  full: { d: 46, max: 180, detail: { step: 1.05, perWhorl: 3, fronds: 4 }, radial: 7 },
  lite: { d: 26, max: 70, detail: { step: 1.5, perWhorl: 3, fronds: 3 }, radial: 5 },
};
const TEMPLATE_H = 20;
/** Trees in the same 220-unit square share a mesh, so the squares off screen are culled. */
const CHUNK = 220;
const CONIFER_IDX = new Set(CONIFERS.map((c) => SPECIES_INDEX[c]));

/** One conifer of each species at height 20, its foot at the origin: sprays (reading the frond atlas) and bark. */
function templates(detail: Detail, radial: number): Record<Conifer, { sprays: BufferGeometry; bark: BufferGeometry }> {
  const card = sprayCard();
  const m4 = new Matrix4();
  const out = {} as Record<Conifer, { sprays: BufferGeometry; bark: BufferGeometry }>;
  for (const sp of CONIFERS) {
    const sk = coniferSkeleton(sp, TEMPLATE_H, crownFromOf(sp, TEMPLATE_H), detail, 0.7);
    const parts = sk.sprays.map((s) => card.clone().applyMatrix4(sprayMatrix(s, m4)));
    const sprays = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    const [v0, v1] = frondBand(sp);
    const uv = sprays.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
    // one bark texture (the cedar's) for all: the fir and hemlock take it greyer and darker
    const trunk = trunkGeometry(sk, radial, 3).translate(0, -0.1, 0);
    const limbs = limbGeometry(sk, 3, true);
    const bark = mergeGeometries([trunk.index ? trunk.toNonIndexed() : trunk, limbs.index ? limbs.toNonIndexed() : limbs], false);
    trunk.dispose();
    limbs.dispose();
    const tint = sp === "cedar" ? [1, 1, 1] : [0.74, 0.76, 0.8];
    const col = new Float32Array(bark.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set(tint, i);
    bark.setAttribute("color", new Float32BufferAttribute(col, 3));
    out[sp] = { sprays, bark };
  }
  card.dispose();
  return out;
}

/** The frond and bark materials: snow settles on the sprays' upper faces as on the forest, and both dim with it. */
function coniferMaterials(trees: TreeShading): { frond: MeshStandardMaterial; bark: MeshStandardMaterial } {
  const frond = new MeshStandardMaterial({ map: frondAtlas(), alphaTest: 0.45, side: DoubleSide, roughness: 0.9 });
  const snow = trees.uniforms.uSnow;
  frond.onBeforeCompile = (shd) => {
    shd.uniforms.uSnow = snow;
    shd.fragmentShader = shd.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSnow;")
      .replace(
        "#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\nfloat snowUp = dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );\ndiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.92, 0.94, 0.97 ), uSnow * smoothstep( 0.35, 0.85, snowUp ) );",
      );
  };
  const bark = new MeshStandardMaterial({ map: barkTexture("cedar"), vertexColors: true, roughness: 1 });
  return { frond, bark };
}

/** Three planes crossed at 60°, base at the origin, normals bent outward and up so a crown shades like a volume. */
export function crossGeo(): BufferGeometry {
  const parts = [0, 1, 2].map((k) => {
    const p = new PlaneGeometry(1, 1, 1, 1);
    p.translate(0, 0.5, 0);
    p.rotateY((k * Math.PI) / 3);
    return p;
  });
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i) * 0.9, 0.55 + pos.getY(i) * 0.6, pos.getZ(i) * 0.9).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/**
 * Every tree: the conifers near the line in three dimensions, merged per square; the rest in one instanced mesh of
 * painted cards, species, seed and hue in an instance attribute, season and leaf fall in the shader.
 */
export function Trees() {
  const world = useWorld();
  const { lowEnd, trees } = world;
  const data = useMemo(() => getTreeData(lowEnd), [lowEnd]);

  const built = useMemo(() => {
    const cfg = NEAR[lowEnd ? "lite" : "full"];
    // the near conifers: on the ground (not the terrace trees on buildings), nearest the line first
    const near = data
      .map((t, i) => ({ t, i, d: CONIFER_IDX.has(t.sp) ? trackDist(t.x, t.z) : Infinity }))
      .filter((c) => c.d < cfg.d && c.t.y - groundAt(c.t.x, c.t.z) < 1)
      .sort((a, b) => a.d - b.d)
      .slice(0, cfg.max);
    const in3d = new Set(near.map((c) => c.i));
    const rng = new Rng(4);
    const n = data.length - in3d.size;
    const m = new InstancedMesh(crossGeo(), trees.mat, Math.max(1, n));
    const attr = new Float32Array(Math.max(1, n) * 4);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    const p = new Vector3();
    const tpl = templates(cfg.detail, cfg.radial);
    const chunks = new Map<string, { sprays: BufferGeometry[]; bark: BufferGeometry[] }>();
    let k = 0;
    data.forEach((t, i) => {
      const [w, h] = SPECIES[t.sp].size;
      // the same draws for every tree, so the painted ones stand as they did
      const yaw = rng.next() * Math.PI * 2;
      const stretch = 0.9 + rng.next() * 0.25;
      const seed = rng.next();
      const hue = rng.next();
      q.setFromAxisAngle(UP, yaw);
      if (in3d.has(i)) {
        // as tall as its painted card would stand (the card's tree fills that share of it), foot on the ground
        const s = (h * t.s * stretch * CONIFER_FILL) / TEMPLATE_H;
        m4.compose(p.set(t.x, t.y + 0.1, t.z), q, sc.setScalar(s));
        const key = `${Math.floor(t.x / CHUNK)},${Math.floor(t.z / CHUNK)}`;
        const c = chunks.get(key) ?? { sprays: [], bark: [] };
        chunks.set(key, c);
        const sp = SPECIES[t.sp].id as Conifer;
        c.sprays.push(tpl[sp].sprays.clone().applyMatrix4(m4));
        c.bark.push(tpl[sp].bark.clone().applyMatrix4(m4));
        return;
      }
      m4.compose(p.set(t.x, t.y, t.z), q, sc.set(w * t.s, h * t.s * stretch, w * t.s));
      m.setMatrixAt(k, m4);
      attr.set([t.sp, seed, hue, 0], k * 4);
      k++;
    });
    m.geometry.setAttribute("aTree", new InstancedBufferAttribute(attr, 4));
    m.count = n;
    m.castShadow = false;
    m.receiveShadow = true;
    const mats = coniferMaterials(trees);
    trees.extra.push(mats.frond, mats.bark);
    const group = new Group();
    for (const c of chunks.values()) {
      const sprays = new Mesh(mergeGeometries(c.sprays, false), mats.frond);
      const bark = new Mesh(mergeGeometries(c.bark, false), mats.bark);
      for (const g of [...c.sprays, ...c.bark]) g.dispose();
      sprays.receiveShadow = bark.receiveShadow = true;
      group.add(sprays, bark);
    }
    for (const t of Object.values(tpl)) {
      t.sprays.dispose();
      t.bark.dispose();
    }
    return { mesh: m, group, mats };
  }, [data, trees, lowEnd]);

  useEffect(
    () => () => {
      built.mesh.geometry.dispose();
      built.mesh.dispose();
      built.group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      trees.extra = trees.extra.filter((m) => m !== built.mats.frond && m !== built.mats.bark);
      built.mats.frond.dispose();
      built.mats.bark.dispose();
    },
    [built, trees],
  );

  useEffect(() => skipInMirror(built.mesh, built.group), [built]);
  return (
    <>
      <primitive object={built.mesh} />
      <primitive object={built.group} />
    </>
  );
}
