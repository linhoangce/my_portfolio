"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, type BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { busNetwork } from "./buses";
import { paint } from "./shapes";
import { groundAt } from "./terrain";
import { UP } from "./track";
import { useWorld } from "./world";

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number, glow = 0): BufferGeometry => {
  const g = paint(new BoxGeometry(w, h, d).translate(x, y, z), hex);
  g.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(glow), 1));
  return g;
};
const GLASS = 0xcfe0ea;
const STEEL = 0x3a3f46;
const WHITE = 0xf2f3f5;
const SOLAR = 0x1d2c4a;
const TIMBER = 0xb98a5a;
const BOARD = 0xffb547;
const VIOLET = 0xa78bfa;

/**
 * A stop's shelter, built along x with its open front toward the road (+z): a slab, a glass back and sides on slim
 * posts, a white roof carrying a solar panel, a timber bench, a lit arrivals board and, at the kerb, the route's flag.
 * `long` makes an exchange's canopy: 8 long over two benches and two boards.
 */
function shelter(len: number): BufferGeometry {
  const L = len - 0.2;
  const long = L > 3;
  const parts: BufferGeometry[] = [
    box(L + 0.2, 0.1, 1.4, 0, 0.05, 0, 0xc9cbc6),
    box(L, 1.9, 0.05, 0, 1.05, -0.6, GLASS),
    ...[-1, 1].map((s) => box(0.05, 1.9, 1.0, (s * L) / 2, 1.05, -0.1, GLASS)),
    ...[-1, 1].flatMap((s) => [box(0.08, 2.0, 0.08, (s * L) / 2, 1.0, -0.6, STEEL), box(0.08, 2.0, 0.08, (s * L) / 2, 1.0, 0.55, STEEL)]),
    box(L + 0.4, 0.1, 1.6, 0, 2.05, 0, WHITE),
    box(L, 0.05, 1.3, 0, 2.13, 0, SOLAR),
  ];
  const bays = L > 7 ? [-2.6, 2.6] : L > 3 ? [-1.3, 1.3] : [0];
  for (const x of bays) {
    parts.push(box(1.6, 0.08, 0.4, x, 0.45, -0.32, TIMBER), box(0.08, 0.4, 0.3, x - 0.7, 0.22, -0.32, STEEL), box(0.08, 0.4, 0.3, x + 0.7, 0.22, -0.32, STEEL));
    parts.push(box(0.9, 0.34, 0.05, x + (long ? 0 : 0.5), 1.62, -0.56, BOARD, 1));
  }
  if (long) for (const x of [-L / 2 + 0.1, 0, L / 2 - 0.1]) parts.push(box(0.08, 2.0, 0.08, x, 1.0, 0.55, STEEL));
  // a bay's totem at its far end: a tall post with the lit bus sign, seen from along the street
  if (long) parts.push(box(0.12, 3.6, 0.12, -L / 2 - 0.5, 1.8, 0.55, STEEL), box(0.08, 0.8, 0.8, -L / 2 - 0.5, 3.4, 0.55, VIOLET, 1), box(0.1, 0.5, 0.5, -L / 2 - 0.5, 3.4, 0.55, WHITE, 1));
  // the route flag at the kerb
  parts.push(box(0.06, 2.6, 0.06, L / 2 + 0.4, 1.3, 0.55, STEEL), box(0.06, 0.5, 0.5, L / 2 + 0.4, 2.4, 0.55, VIOLET, 1));
  const out = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return out;
}

/** Every bus stop: the shelters as one instanced mesh, the exchanges' canopies as another; their boards and flags lit. */
export function BusStops() {
  const world = useWorld();
  const built = useMemo(() => {
    const { stops } = busNetwork();
    const glow = { value: 0.6 };
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uStopGlow = glow;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uStopGlow;\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uStopGlow;");
    };
    const m4 = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const one = new Vector3(1, 1, 1);
    const small = stops.filter((s) => !s.exchange);
    const shelters = new InstancedMesh(shelter(2.6), mat, Math.max(1, small.length));
    small.forEach((s, i) => shelters.setMatrixAt(i, m4.compose(p.set(s.x, groundAt(s.x, s.z), s.z), q.setFromAxisAngle(UP, s.ry), one)));
    shelters.count = small.length;
    // an exchange's stops come in pairs (one each way) close together: one canopy for each
    const big = stops.filter((s) => s.exchange);
    const canopies: BufferGeometry[] = [];
    const placed: [number, number][] = [];
    for (const s of big) {
      if (placed.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < 6)) continue;
      placed.push([s.x, s.z]);
      canopies.push(shelter(s.len).applyMatrix4(m4.compose(p.set(s.x, groundAt(s.x, s.z), s.z), q.setFromAxisAngle(UP, s.ry), one)));
    }
    const exchanges = new Mesh(canopies.length ? mergeGeometries(canopies, false) : new BoxGeometry(0, 0, 0), mat);
    for (const g of canopies) g.dispose();
    for (const m of [shelters, exchanges]) m.receiveShadow = true;
    return { shelters, exchanges, mat, glow };
  }, []);

  useEffect(
    () => () => {
      built.shelters.geometry.dispose();
      built.shelters.dispose();
      built.exchanges.geometry.dispose();
      built.mat.dispose();
    },
    [built],
  );
  // the boards light up with the windows
  useEffect(() => {
    const f = (level: number) => {
      built.glow.value = 0.5 + 1.8 * Math.max(0, (level - 0.4) / 0.6);
      built.mat.color.copy(world.buildings.solid.color);
    };
    world.events.followers.push(f);
    return () => {
      world.events.followers = world.events.followers.filter((g) => g !== f);
    };
  }, [built, world]);

  return (
    <>
      <primitive object={built.shelters} />
      <primitive object={built.exchanges} />
    </>
  );
}
