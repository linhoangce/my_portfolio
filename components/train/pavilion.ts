/**
 * The street furniture of the 2100 city's squares and waterfronts. The pavilion is a café, restaurant or shop:
 * - a timber deck;
 * - a glass box on slim dark mullions, its back a timber wall;
 * - a thick roof slab overhanging it, dark, planted or timber-clad, the larger ones with a skylit well;
 * - inside, warm light over round tables and a counter;
 * - out on the deck in front, tables under umbrellas and planters at its corners.
 *
 * There are also market stalls under striped awnings, food trucks, benches, bollards and festoon lights.
 *
 * Every piece is built in its own frame: x across the front, z out of the front, y up from the ground under it. It
 * comes in up to three geometries for the caller to merge:
 * - `solid`, painted, for one vertex-coloured material;
 * - `glass`;
 * - `warm`, the lights, painted, for one glowing material that brightens after dark.
 *
 * After dark the awnings, umbrellas and stalls' goods glow in their own colours too, lit from the bulbs under them: their
 * solid parts carry a glow (`lit`), and the material they are merged into is patched to show it (`shopGlow`).
 */
import { BoxGeometry, type BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, type Material, type MeshBasicMaterial, OctahedronGeometry, PlaneGeometry } from "three";

import { merge, paint } from "./shapes";
import type { World } from "./world";

export type Pieces = { solid: BufferGeometry[]; glass: BufferGeometry[]; warm: BufferGeometry[] };
/** Where a pavilion's name goes: the middle of its roof's front edge, its width and height (pavilion frame, facing +z). */
export type SignSpot = { x: number; y: number; z: number; w: number; h: number };

export type PavilionSpec = {
  /** The glass box: across the front, front to back. */
  w: number;
  d: number;
  /** Height of the glass. */
  h?: number;
  /** The deck in front of the glass, for the tables under umbrellas. */
  front?: number;
  /** Umbrella colour. */
  umbrella?: number;
  /** A skylit well through the roof. */
  well?: boolean;
  /** Umbrella tables on the deck (by default as many as fit). */
  tables?: number;
  /** The roof: a dark slab (the default), a planted one, or timber-clad. */
  roof?: "dark" | "green" | "timber";
};
const ROOFS = { dark: [0x34373c, 0x4a4e55], green: [0x3a3d42, 0x6f8f3a], timber: [0x8a6a4a, 0xa98260] };

export const UMBRELLAS = [0xe8663a, 0xd2452f, 0xf2b632, 0x2a9d8f, 0xf1e9da, 0x264653];
const TIMBER = 0xa98260;
const FRAME = 0x2b2f36;
const LINEN = 0xf2efe9;
const SHRUB = 0x4f7a3e;
const STONE = 0x9c958a;
const WARM = 0xffd49a;

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** Mark a painted part as glowing after dark, `v` of its own colour (after paint(), which drops the mark). */
export function lit(g: BufferGeometry, v: number): BufferGeometry {
  g.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
  return g;
}

/** Let a vertex-coloured material show its parts' glow (lit), by the world's shop light (0 by day, about 1 at night). */
export function shopGlow<M extends Material>(mat: M, world: World): M {
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uShopGlow = world.shopGlow;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vShopGlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShopGlow = aGlow;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uShopGlow;\nvarying float vShopGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vShopGlow * uShopGlow;");
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|shopGlow`;
  return mat;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => paint(at(new BoxGeometry(w, h, d), x, y, z), hex);
const cyl = (r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, hex: number) => paint(at(new CylinderGeometry(r0, r1, h, seg), x, y, z), hex);

/** A round table under an umbrella with two stools, standing on a floor at height y. */
export function umbrellaTable(out: Pieces, x: number, y: number, z: number, hex: number): void {
  // a bulb under the umbrella, its canvas glowing with it after dark
  out.warm.push(paint(at(new OctahedronGeometry(0.09, 0), x, y + 2.12, z), WARM));
  out.solid.push(
    cyl(0.04, 0.04, 2.3, 5, x, y + 1.15, z, FRAME),
    lit(paint(at(new ConeGeometry(1.15, 0.42, 8, 1, true), x, y + 2.42, z), hex), 0.35),
    cyl(0.4, 0.4, 0.05, 8, x, y + 0.78, z, LINEN),
    cyl(0.05, 0.05, 0.76, 4, x, y + 0.38, z, FRAME),
    box(0.32, 0.45, 0.32, x - 0.72, y + 0.22, z, TIMBER),
    box(0.32, 0.45, 0.32, x + 0.72, y + 0.22, z, TIMBER),
  );
}

/** A square planter with a clipped shrub, at ground or deck height y. */
export function planter(out: Pieces, x: number, y: number, z: number, s = 1): void {
  out.solid.push(box(0.9 * s, 0.55, 0.9 * s, x, y + 0.27, z, STONE), paint(at(new IcosahedronGeometry(0.55 * s, 0).scale(1, 0.8, 1), x, y + 0.85, z), SHRUB));
}

/**
 * A glass pavilion centred on its glass box: the box spans x ±w/2 and z ±d/2, its front at +z. The deck reaches 0.8
 * behind it and `front` before it, 0.3 above the ground, with a skirt down to -1.2 to meet a slope.
 */
export function pavilion(s: PavilionSpec): Pieces & { sign: SignSpot } {
  const { w, d } = s;
  const h = s.h ?? 3.2;
  const front = s.front ?? 3.4;
  const ov = 0.9;
  const fy = 0.3;
  const out: Pieces = { solid: [], glass: [], warm: [] };
  // the deck, and the floor inside
  out.solid.push(box(w + 1.6, 1.5, d + 0.8 + front, 0, fy - 0.75, (front - 0.8) / 2, TIMBER));
  out.solid.push(box(w - 0.1, 0.04, d - 0.1, 0, fy + 0.02, 0, 0xe8e0d2));
  // glass on three sides, mullions at each bay and a transom, the timber wall behind
  out.glass.push(at(new BoxGeometry(w, h, 0.05), 0, fy + h / 2, d / 2));
  for (const sx of [-1, 1]) out.glass.push(at(new BoxGeometry(0.05, h, d), (sx * w) / 2, fy + h / 2, 0));
  out.solid.push(box(w, h, 0.2, 0, fy + h / 2, -d / 2 + 0.1, 0xc29466));
  const nf = Math.max(2, Math.round(w / 1.6));
  for (let i = 0; i <= nf; i++) out.solid.push(box(0.09, h, 0.09, -w / 2 + (w * i) / nf, fy + h / 2, d / 2, FRAME));
  const ns = Math.max(2, Math.round(d / 1.6));
  for (const sx of [-1, 1]) for (let i = 1; i < ns; i++) out.solid.push(box(0.09, h, 0.09, (sx * w) / 2, fy + h / 2, -d / 2 + (d * i) / ns, FRAME));
  out.solid.push(box(w, 0.08, 0.1, 0, fy + h - 0.55, d / 2, FRAME));
  // the roof slab, with a well over the back of the room on the larger ones (its own glass, the warm ceiling below)
  const ry = fy + h + 0.21;
  const [slab, top] = ROOFS[s.roof ?? "dark"];
  const RW = w + ov * 2;
  const RD = d + ov * 2;
  if (s.well && w > 6) {
    const hw = w * 0.32;
    const hd = d * 0.38;
    const hx = -w * 0.16;
    const hz = -d * 0.08;
    const x0 = hx - hw / 2;
    const x1 = hx + hw / 2;
    const z0 = hz - hd / 2;
    const z1 = hz + hd / 2;
    out.solid.push(
      box(x0 + RW / 2, 0.42, RD, (-RW / 2 + x0) / 2, ry, 0, slab),
      box(RW / 2 - x1, 0.42, RD, (x1 + RW / 2) / 2, ry, 0, slab),
      box(hw, 0.42, z0 + RD / 2, hx, ry, (-RD / 2 + z0) / 2, slab),
      box(hw, 0.42, RD / 2 - z1, hx, ry, (z1 + RD / 2) / 2, slab),
    );
    out.glass.push(at(new BoxGeometry(hw, 0.05, hd), hx, ry + 0.1, hz));
  } else out.solid.push(box(RW, 0.42, RD, 0, ry, 0, slab));
  out.solid.push(box(RW + 0.04, 0.1, RD + 0.04, 0, ry + 0.24, 0, top));
  // inside: the lit ceiling and the lit wall behind the counter (what shows through the glass), round tables each
  // under a pendant
  out.warm.push(box(w - 0.2, 0.04, d - 0.2, 0, fy + h - 0.03, 0, WARM), box(w - 0.3, h - 0.5, 0.04, 0, fy + (h - 0.5) / 2 + 0.05, -d / 2 + 0.22, WARM));
  out.solid.push(box(w * 0.45, 1.0, 0.55, w * 0.15, fy + 0.5, -d / 2 + 0.55, 0x8a6a4a));
  const nt = Math.max(1, Math.floor((w - 1.2) / 2.2));
  for (let i = 0; i < nt; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / nt;
    out.solid.push(cyl(0.42, 0.42, 0.06, 6, x, fy + 0.95, d / 6, LINEN), cyl(0.05, 0.05, 0.92, 4, x, fy + 0.47, d / 6, FRAME));
    out.warm.push(cyl(0.12, 0.2, 0.22, 5, x, fy + h - 0.5, d / 6, WARM));
  }
  // the deck in front: tables under umbrellas, planters at its corners
  const nu = s.tables ?? Math.max(1, Math.floor(w / 2.8));
  const hex = s.umbrella ?? UMBRELLAS[0];
  if (front > 2.2) for (let i = 0; i < nu; i++) umbrellaTable(out, -w / 2 + (w * (i + 0.5)) / nu, fy, d / 2 + front * 0.55, hex);
  for (const sx of [-1, 1]) planter(out, sx * (w / 2 + 0.25), fy, d / 2 + front - 0.5, 0.9);
  return { ...out, sign: { x: 0, y: ry, z: d / 2 + ov + 0.02, w: Math.min(w * 0.55, 4.6), h: 0.34 } };
}

/**
 * A market stall: a timber counter with crates of produce, four posts and an awning striped in its colour and white;
 * after dark a lamp bar and three bulbs under the awning's front, the awning and the goods glowing with them.
 */
export function stall(hex: number, seed = 0): Pieces {
  const out: Pieces = { solid: [], glass: [], warm: [] };
  out.solid.push(box(2.2, 0.95, 1.1, 0, 0.47, 0, TIMBER));
  const goods = [0xd2452f, 0xf2b632, 0x6aa84f, 0xe8663a, 0x8e44ad, 0xf1e9da];
  for (let k = 0; k < 3; k++) out.solid.push(lit(box(0.55, 0.22, 0.6, -0.7 + k * 0.7, 1.06, 0.1, goods[(seed + k * 2) % goods.length]), 0.3));
  for (const [x, z] of [
    [-1.05, -0.5],
    [1.05, -0.5],
    [-1.05, 0.55],
    [1.05, 0.55],
  ])
    out.solid.push(box(0.07, 2.4, 0.07, x, 1.2, z, FRAME));
  // the awning, sloping down toward the customers, in four stripes
  for (let k = 0; k < 4; k++) out.solid.push(lit(paint(at(new BoxGeometry(0.62, 0.06, 1.6).rotateX(0.22), -0.93 + k * 0.62, 2.42, 0.05), k % 2 ? 0xf6f1e7 : hex), 0.55));
  out.warm.push(box(2.0, 0.06, 0.06, 0, 2.2, 0.5, WARM));
  for (const x of [-0.7, 0, 0.7]) out.warm.push(paint(at(new OctahedronGeometry(0.1, 0), x, 2.02, 0.45), WARM));
  return out;
}

/** A food truck: body and cab in its colour, the serving hatch on its +x side under a flap, its lit menu, wheels. */
export function foodTruck(hex: number): Pieces {
  const out: Pieces = { solid: [], glass: [], warm: [] };
  out.solid.push(box(2.0, 1.9, 3.6, 0, 1.35, -0.4, hex), box(2.0, 1.25, 1.2, 0, 1.02, 1.95, hex), box(1.9, 0.5, 0.05, 0, 1.35, 2.56, 0x1d2228));
  for (const [x, z] of [
    [-0.85, -1.5],
    [0.85, -1.5],
    [-0.85, 1.7],
    [0.85, 1.7],
  ])
    out.solid.push(paint(at(new CylinderGeometry(0.38, 0.38, 0.3, 8).rotateZ(Math.PI / 2), x, 0.38, z), 0x1d2228));
  // the hatch, its flap propped up over it, a counter shelf and the lit menu board beside it
  out.solid.push(box(0.05, 0.9, 2.2, 1.0, 1.65, -0.4, 0x1d2228), box(0.06, 0.06, 2.4, 1.45, 2.32, -0.4, 0xf6f1e7));
  out.solid.push(lit(paint(at(new BoxGeometry(0.9, 0.05, 2.4).rotateZ(-0.35), 1.42, 2.2, -0.4), 0xf6f1e7), 0.45), box(0.35, 0.06, 2.0, 1.15, 1.2, -0.4, 0xc0c4c8));
  out.warm.push(box(0.04, 0.6, 0.7, 1.03, 1.75, 0.95, WARM));
  return out;
}

/** A timber bench on two steel legs, facing +z. */
export function bench(out: Pieces, x: number, y: number, z: number, ry: number): void {
  const b = merge([
    paint(new BoxGeometry(1.8, 0.1, 0.5).translate(0, 0.45, 0), 0x9a7048),
    paint(new BoxGeometry(1.8, 0.45, 0.08).translate(0, 0.72, -0.24), 0x9a7048),
    paint(new BoxGeometry(0.08, 0.45, 0.45).translate(-0.75, 0.22, 0), 0x3a3f46),
    paint(new BoxGeometry(0.08, 0.45, 0.45).translate(0.75, 0.22, 0), 0x3a3f46),
  ]);
  out.solid.push(b.rotateY(ry).translate(x, y, z));
}

/** A stone bollard. */
export function bollard(out: Pieces, x: number, y: number, z: number): void {
  out.solid.push(cyl(0.13, 0.15, 0.8, 6, x, y + 0.4, z, 0x8f9298));
}

/**
 * Festoon lights strung between two points (each a post top): a sagging wire with a warm bulb every 0.9.
 * Points are in the caller's frame, y up.
 */
export function festoon(out: Pieces, a: [number, number, number], b: [number, number, number], sag = 0.6): void {
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(2, Math.round(L / 0.9));
  const pt = (t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < n; i++) {
    const p = pt(i / n);
    const q = pt((i + 1) / n);
    const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    // the wire between bulbs: a thin upright strip turned along its run, and a bulb hanging from it
    const g = paint(new PlaneGeometry(len, 0.035).rotateY(Math.PI / 2), 0x24272c);
    const yaw = Math.atan2(q[0] - p[0], q[2] - p[2]);
    const pitch = -Math.asin((q[1] - p[1]) / Math.max(len, 1e-6));
    g.rotateX(pitch).rotateY(yaw).translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    out.solid.push(g);
    if (i > 0) out.warm.push(paint(at(new OctahedronGeometry(0.15, 0), p[0], p[1] - 0.1, p[2]), WARM));
  }
}

/** Every piece's geometry for one set or district, merged by kind. */
export function gather(list: Pieces[]): { solid: BufferGeometry | null; glass: BufferGeometry | null; warm: BufferGeometry | null } {
  const solid = list.flatMap((p) => p.solid);
  const glass = list.flatMap((p) => p.glass);
  const warm = list.flatMap((p) => p.warm);
  return { solid: solid.length ? merge(solid) : null, glass: glass.length ? merge(glass) : null, warm: warm.length ? merge(warm) : null };
}

/** The warm lights' material: a little lit by day, bright after dark. */
export function warmLights(world: World, mat: MeshBasicMaterial): MeshBasicMaterial {
  world.events.followers.push((level) => mat.color.setScalar(0.72 + 0.75 * Math.max(0, (level - 0.4) / 0.6)));
  return mat;
}
