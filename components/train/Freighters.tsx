"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, MeshStandardMaterial, Points, PointsMaterial, Quaternion, Vector3 } from "three";

import { Rng } from "./cityModel";
import { SEA } from "./constants";
import { merged } from "./merge";
import { dotTexture } from "./textures";
import { UP } from "./track";
import { useDispose } from "./useDispose";
import { freighter, type FreighterKind, freighterLights, LADEN, type Livery } from "./vessels";
import { useWorld } from "./world";

/**
 * English Bay's anchorage, where the ships waiting for a berth at the port lie: across the bay from off Stanley Park
 * to the Point Grey shore, a ship's swing apart, clear of the sands off Spanish Banks and of the turns the ships under
 * way make (below). Every other one is left out on the low end.
 */
const ANCHORAGE: [number, number][] = [
  [-560, -380],
  [-690, -395],
  [-820, -372],
  [-950, -390],
  [-625, -262],
  [-755, -248],
  [-885, -272],
  [-560, -140],
  [-690, -152],
  [-820, -128],
  [-950, -150],
  [-625, -24],
  [-755, -8],
  [-885, -32],
];
/** What lies there: mostly bulk carriers waiting on grain, coal and potash, a few tankers, boxes and a car carrier. */
const KINDS: FreighterKind[] = ["bulk", "bulk", "tanker", "bulk", "container", "bulk", "carCarrier", "bulk", "tanker", "bulk", "bulk", "container", "bulk", "tanker"];

/**
 * The ships under way: each comes in from the strait to its own spot on the anchorage's west side, swings round to
 * lie to the ebb with the rest, waits, then sails out west again, and far out (beyond what the haze lets through) turns
 * back for the next arrival. Its way round: the spot, the side its turn is to (+1 south) and the turn's radius.
 */
const LANES: { at: [number, number]; side: 1 | -1; r: number; kind: FreighterKind }[] = [
  { at: [-1090, -330], side: -1, r: 50, kind: "bulk" },
  { at: [-1120, -200], side: -1, r: 45, kind: "container" },
  { at: [-1090, -70], side: 1, r: 50, kind: "tanker" },
];
/** Where the lanes turn back, out in the strait. */
const FAR_X = -3900;
/** Speed in the bay, and out in the strait where no one sees it (units a second), and the gentle way they get there. */
const V_BAY = 4;
const V_FAR = 30;
const ACCEL = 0.12;
/** Seconds at anchor before sailing again. */
const DWELL = 240;

const HULLS = [0x1d1f24, 0x23324f, 0x2a4a7a, 0x5a1f22, 0x9a2b25, 0x4b545e, 0x2f4a3a, 0x1f5f6b];
const BOOTS = [0xa8322b, 0x8e2a26, 0xb5452e];
const DECKS = [0x7a4a32, 0x4f6b4c, 0x8a3b2e, 0x6f7375];
const HOUSES = [0xf2f2ee, 0xf2f2ee, 0xece6d4];
const FUNNELS: [number, number][] = [
  [0xd9a21e, 0x1f3b73],
  [0x1f3b73, 0xffffff],
  [0xc0392b, 0xffffff],
  [0xf2f2ee, 0x2b6cb0],
  [0xe07b24, 0x1d1f24],
  [0x2b2f36, 0xd9a21e],
  [0x2a7a4b, 0xffffff],
];
const GEARS = [0xd9b229, 0xe8e4da, 0x8b9096, 0xc0392b];
const BOXES = [0xb03a2e, 0x2b5fa6, 0x2f7a4a, 0xd96c1f, 0x8a8f95, 0xe9e7e1, 0x6b2b5e, 0x1f6d8a, 0xc9a227];

/** A company's colours for a ship of this kind; car carriers are white or steel blue with a stripe. */
function livery(kind: FreighterKind, rng: Rng): Livery {
  const [funnel, band] = rng.pick(FUNNELS);
  const c: Livery = { hull: rng.pick(HULLS), boot: rng.pick(BOOTS), deck: rng.pick(DECKS), house: rng.pick(HOUSES), funnel, band, gear: rng.pick(GEARS), cargo: [rng.pick([0x8a3b2e, 0x3f6b4a, 0x6f7375, 0xc9a227])] };
  if (kind === "container") c.cargo = BOXES;
  if (kind === "carCarrier") {
    c.hull = rng.pick([0xe9ecef, 0x3a5f8f, 0xe9ecef]);
    c.deck = 0xd3d6da;
    c.band = rng.pick([0x1f4f9a, 0xc0392b, 0x2f7a4a]);
  }
  return c;
}

/** How deep it lies: the bulkers and car carriers waiting to load in ballast, tankers either way, the boxes laden. */
const draftOf = (kind: FreighterKind, rng: Rng) => (kind === "container" ? LADEN * (0.6 + 0.3 * rng.next()) : kind === "tanker" ? LADEN * rng.next() : LADEN * 0.25 * rng.next());

/** A lane's way round as a polyline from its spot (out west, the far turn, back east, the near turn) and its lengths. */
function laneLoop(l: (typeof LANES)[number]): { pts: [number, number][]; cum: number[]; len: number } {
  const [sx, sz] = l.at;
  const pts: [number, number][] = [[sx, sz]];
  const arc = (cx: number, cz: number, a0: number, sweep: number) => {
    const n = Math.ceil((Math.abs(sweep) * l.r) / 6);
    for (let k = 1; k <= n; k++) pts.push([cx + Math.cos(a0 + (sweep * k) / n) * l.r, cz + Math.sin(a0 + (sweep * k) / n) * l.r]);
  };
  pts.push([FAR_X, sz]);
  // round the west side from the outbound line to the inbound one, then round the east side back to the spot
  arc(FAR_X, sz + l.r * l.side, -Math.PI / 2 * l.side, -Math.PI * l.side);
  pts.push([sx, sz + 2 * l.r * l.side]);
  arc(sx, sz + l.r * l.side, Math.PI / 2 * l.side, -Math.PI * l.side);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

const m4 = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const one = new Vector3(1, 1, 1);
const col = new Color();

/**
 * The freighters of English Bay, as the bay looks from downtown on any day: a dozen and more at anchor waiting for a
 * berth at the port, lying to the ebb with their bows west, each in its company's colours; and a few under way,
 * coming in from the strait to anchor and sailing out again. After dark their anchor lights and deck lights show
 * across the water (points, so they stay visible however far off).
 */
export function Freighters() {
  const world = useWorld();
  const { lowEnd } = world;

  const built = useMemo(() => {
    const rng = new Rng(11);
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
    const lights: number[] = [];
    const lightCols: number[] = [];
    const addLight = (x: number, y: number, z: number, hex: number) => {
      lights.push(x, y, z);
      col.setHex(hex);
      lightCols.push(col.r, col.g, col.b);
    };
    // at anchor: one mesh for the lot, their lights in place
    const parts = ANCHORAGE.flatMap(([x, z], k) => {
      const kind = KINDS[k % KINDS.length];
      const c = livery(kind, rng);
      const draft = draftOf(kind, rng);
      const geared = rng.next() < 0.5;
      // lying to the ebb, west-north-west, each swung its own way about that
      const yaw = -Math.PI / 2 - 0.12 + (rng.next() - 0.5) * 0.6;
      if (lowEnd && k % 2) return [];
      q.setFromAxisAngle(UP, yaw);
      for (const [lx, ly, lz, hex] of freighterLights(kind, draft, false)) {
        p.set(lx, ly, lz).applyQuaternion(q);
        addLight(x + p.x, SEA + p.y, z + p.z, hex);
      }
      return [{ geo: freighter(kind, c, draft, geared, k, lowEnd), position: [x, SEA, z] as [number, number, number], rotation: [0, yaw, 0] as [number, number, number] }];
    });
    const anchored = new Mesh(merged(parts), mat);
    // under way: a mesh each, moved round its lane, its lights moved with it
    const fixedLights = lights.length / 3;
    const ships = (lowEnd ? LANES.slice(0, 2) : LANES).map((l, k) => {
      const c = livery(l.kind, rng);
      const draft = draftOf(l.kind, rng);
      const mesh = new Mesh(freighter(l.kind, c, draft, true, 100 + k, lowEnd), mat);
      const own = freighterLights(l.kind, draft, true);
      for (const [, , , hex] of own) addLight(0, 0, 0, hex);
      const loop = laneLoop(l);
      // spread round their rounds: one lying at anchor, one leaving, one coming in
      const s = [0, 0.06, 0.9][k] * loop.len;
      return { mesh, loop, own, s, dwell: k === 0 ? 90 : 0, v: V_BAY, lane: l };
    });
    const dotGeo = new BufferGeometry();
    dotGeo.setAttribute("position", new BufferAttribute(new Float32Array(lights), 3));
    dotGeo.setAttribute("color", new BufferAttribute(new Float32Array(lightCols), 3));
    const dotMat = new PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false, toneMapped: false });
    const dots = new Points(dotGeo, dotMat);
    dots.frustumCulled = false;
    dots.visible = false;
    const base = Float32Array.from(lightCols);
    return { mat, anchored, ships, dots, dotMat, base, fixedLights };
  }, [lowEnd]);

  useDispose(built, (b) => {
    b.anchored.geometry.dispose();
    for (const s of b.ships) s.mesh.geometry.dispose();
    b.dots.geometry.dispose();
    b.dotMat.dispose();
    b.mat.dispose();
  });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const pos = built.dots.geometry.attributes.position as BufferAttribute;
    let j = built.fixedLights;
    for (const sh of built.ships) {
      const { pts, cum, len } = sh.loop;
      if (sh.dwell > 0) sh.dwell -= dt;
      else {
        // slow in the bay, quick out in the strait (by where it was last frame), easing away from the spot and back onto it
        const far = Math.min(1, Math.max(0, (-1700 - sh.mesh.position.x) / 900));
        const cruise = V_BAY + (V_FAR - V_BAY) * far * far * (3 - 2 * far);
        sh.v = Math.min(cruise, Math.max(0.3, Math.sqrt(2 * ACCEL * Math.min(sh.s, len - sh.s))));
        sh.s += sh.v * dt;
        if (sh.s >= len) {
          sh.s = 0;
          sh.dwell = DWELL;
        }
      }
      let i = 1;
      while (i < cum.length - 1 && cum[i] < sh.s) i++;
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const seg = cum[i] - cum[i - 1] || 1;
      const f = Math.min(1, Math.max(0, (sh.s - cum[i - 1]) / seg));
      // at its spot it lies along its lane, bow west, as it arrived and will leave
      const yaw = sh.dwell > 0 || sh.s === 0 ? -Math.PI / 2 : Math.atan2(bx - ax, bz - az);
      sh.mesh.position.set(ax + (bx - ax) * f, SEA, az + (bz - az) * f);
      sh.mesh.rotation.y = yaw;
      q.setFromAxisAngle(UP, yaw);
      m4.compose(sh.mesh.position, q, one);
      for (const [lx, ly, lz] of sh.own) {
        p.set(lx, ly, lz).applyMatrix4(m4);
        pos.setXYZ(j++, p.x, p.y, p.z);
      }
    }
    pos.needsUpdate = true;
    // the hulls take the city's night tone; the lights come on with the windows
    built.mat.color.copy(world.buildings.solid.color);
    const lit = world.buildings.solid.emissiveIntensity;
    built.dots.visible = lit > 0.02;
    if (built.dots.visible) {
      const c = built.dots.geometry.attributes.color as BufferAttribute;
      const k = Math.min(1.6, 1.6 * lit);
      for (let i = 0; i < built.base.length; i++) (c.array as Float32Array)[i] = built.base[i] * k;
      c.needsUpdate = true;
    }
  });

  return (
    <>
      <primitive object={built.anchored} />
      {built.ships.map((s, i) => (
        <primitive key={i} object={s.mesh} />
      ))}
      <primitive object={built.dots} />
    </>
  );
}
