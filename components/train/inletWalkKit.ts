/**
 * The Inlet Walk and the Inlet Stage built (inletWalk.ts lays them out); client only.
 *
 * The walk: a slim white box beam either side, a fritted glass band down the middle of the deck between pale walking
 * strips, glass balustrades under a white handrail with a strip of LEDs on its inner face that takes the event's
 * colours, a steel spine and cross-beams under the glass, and white V piers on dark pile caps. Off it, two glazed
 * shelters, the balcony over the stage and the glass-floored lookout at the crest under a glass canopy; red, green and
 * white lights mark the navigation span; a pair of white pylons with its name marks each end.
 *
 * The stage: a pontoon moored to four dolphins, its deck open to the inlet behind, under a ring of lights on four raked
 * masts that holds a sail of translucent fabric, footlights in the event's colours and, after dark, beams coloured by
 * the event; gangways to the terraces, which step up from the water to the crown with its glass Stage House, its lift
 * down to the shore and a stair at the back.
 *
 * Glass is split along the walk so each piece sorts as what it is (three sorts transparent meshes by their centres).
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  Vector3,
} from "three";

import { SEA } from "./constants";
import { eventColour, registerLine, registerPattern } from "./eventLights";
import {
  ABUTMENT,
  BALCONY_H,
  type Bay,
  bayBox,
  BAYS,
  CROWN,
  deckY,
  depthAt,
  LIFT,
  LOOKOUT,
  NAV,
  PIERS,
  PROFILE,
  SHELTER_H,
  STAGE,
  STAGE_AT,
  STAGE_HOUSE,
  STAIR,
  terraceRow,
  TERRACES,
  WALK,
} from "./inletWalk";
import { type Built, cityToned, nightOf, spaceFrameTexture } from "./landmarkKit";
import { merged, type Part } from "./merge";
import { lit, shopGlow, warmLights } from "./pavilion";
import { addReflections, type ReflectSource } from "./reflectionSources";
import { canvasTexture, merge, paint } from "./shapes";
import { groundAt } from "./terrain";
import type { World } from "./world";

/** What the walk and the stage leave out of the water's mirror (glass, beams, people-sized things). */
export type InletBuilt = Built & { skipMirror: Object3D[] };

const UP = new Vector3(0, 1, 0);
const WHITE = 0xf3f4f1;
const STEEL = 0x5b6068;
const CAP = 0x55534e;
const STRIP = 0xd9d6cf;
const TIMBER = 0xb9875a;
const CONCRETE = 0xd6d0c4;

/** A box of w × h × d painted `hex`, centred at (x, y, z). */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number, ry = 0): Part => ({ geo: paint(new BoxGeometry(w, h, d), hex), position: [x, y, z], rotation: [0, ry, 0] });
/** A round strut of radius r from a to b, painted `hex`. */
function strut(a: Vector3, b: Vector3, r: number, hex: number, seg = 8): Part {
  const d = new Vector3().subVectors(b, a);
  const L = d.length();
  const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, d.divideScalar(L)));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return { geo: paint(new CylinderGeometry(r, r, L, seg), hex), position: [m.x, m.y, m.z], rotation: [e.x, e.y, e.z] };
}
/** Scale a geometry's uvs (to repeat its texture). */
function uvScale(g: BufferGeometry, su: number, sv: number): BufferGeometry {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/**
 * The walk's straight stretches, south to north: between its profile's knots and the navigation span's ends, each
 * with its ends' z and deck height, its length along the slope and its pitch (about x, as Object3D.rotation.x, for a
 * part whose length runs along its local z).
 */
type Stretch = { za: number; zb: number; ya: number; yb: number; L: number; pitch: number; zm: number; ym: number };
function stretches(): Stretch[] {
  const zs = [...new Set([...PROFILE.map(([z]) => z), NAV.zS, NAV.zN])].sort((a, b) => b - a);
  const out: Stretch[] = [];
  for (let i = 1; i < zs.length; i++) {
    const za = zs[i - 1];
    const zb = zs[i];
    const ya = deckY(za);
    const yb = deckY(zb);
    out.push({ za, zb, ya, yb, L: Math.hypot(za - zb, ya - yb), pitch: Math.atan2(yb - ya, za - zb), zm: (za + zb) / 2, ym: (ya + yb) / 2 });
  }
  return out;
}

/** A canvas of glass with a white frit of dots and a band at either edge: the deck's glass and the lookout's floor. */
const fritTexture = (glass: number, dots: number) => {
  const t = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = `rgba(206,230,240,${glass})`;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = `rgba(250,251,252,${dots})`;
    for (let x = 4; x < 64; x += 8) for (let y = 4; y < 64; y += 8) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    g.fillStyle = "rgba(250,251,252,0.85)";
    g.fillRect(0, 0, 64, 2);
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
};

/** A name board: white letters on the walk's dark grey, both sides alike. */
const nameTexture = (text: string) =>
  canvasTexture(512, 96, (g) => {
    g.fillStyle = "#2a3039";
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = "#f3f4f1";
    g.font = "600 54px Inter, Helvetica, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 50);
  });

/** The shared glass of the walk and the stage: clear, fritted and the shelters' warm-lit, their reflections fading at night. */
function glassMats(world: World) {
  const clear = world.mats.pane.clone();
  clear.color.setHex(0xdfeef5);
  clear.opacity = 0.2;
  const deck = new MeshStandardMaterial({ map: fritTexture(0.42, 0.75), transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.12, metalness: 0.1, envMap: world.envTex, envMapIntensity: 0.7, emissive: 0xbfe6ff, emissiveIntensity: 0, forceSinglePass: true });
  const floor = new MeshStandardMaterial({ map: fritTexture(0.26, 0.45), transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.1, metalness: 0.1, envMap: world.envTex, envMapIntensity: 0.7, emissive: 0xbfe6ff, emissiveIntensity: 0, forceSinglePass: true });
  const warm = world.mats.pane.clone();
  warm.color.setHex(0xe4eef2);
  warm.opacity = 0.32;
  warm.emissive.setHex(0xffd29a);
  // the foyer's: tinted, so its windows read by day, the light behind them showing through after dark
  const tint = world.mats.pane.clone();
  tint.color.setHex(0x5f7684);
  tint.opacity = 0.62;
  tint.emissive.setHex(0xffd29a);
  const canopy = new MeshStandardMaterial({ map: spaceFrameTexture("rgba(250,251,252,0.95)", 0.28), transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.15, metalness: 0.2, envMap: world.envTex, envMapIntensity: 0.8, emissive: 0xffe2b8, emissiveIntensity: 0, forceSinglePass: true });
  const all = [clear, deck, floor, warm, tint, canopy];
  const env = all.map((m) => m.envMapIntensity);
  world.events.followers.push((level) => {
    const n = nightOf(level);
    all.forEach((m, k) => (m.envMapIntensity = env[k] * (1 - 0.85 * n)));
    tint.emissiveIntensity = 0.45 * n;
    deck.emissiveIntensity = 0.3 * n;
    floor.emissiveIntensity = 0.25 * n;
    warm.emissiveIntensity = 0.32 * n;
    canopy.emissiveIntensity = 0.3 * n;
  });
  return { clear, deck, floor, warm, tint, canopy };
}

/** The painted structure's material: the city's night tone, its lit parts (lit()) glowing after dark. */
const structureMat = (world: World) => shopGlow(cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }), 0), world);

/** Glass meshes cut along the walk: one piece per stretch of `cuts` (south to north), merged per material. */
function chunked(group: Group, parts: { z: number; geo: BufferGeometry }[], mat: MeshStandardMaterial, cuts: number[], order: number, skip: Object3D[]): void {
  for (let k = 0; k <= cuts.length; k++) {
    const hi = k === 0 ? Infinity : cuts[k - 1];
    const lo = k === cuts.length ? -Infinity : cuts[k];
    const mine = parts.filter((p) => p.z <= hi && p.z > lo).map((p) => p.geo);
    if (!mine.length) continue;
    const m = new Mesh(merge(mine), mat);
    m.renderOrder = order;
    group.add(m);
    skip.push(m);
  }
}

/* ------------------------------------------------------------------ the walk */

export function buildInletWalk(world: World): InletBuilt {
  const { lowEnd } = world;
  const g = new Group();
  g.name = "inletWalk";
  const skip: Object3D[] = [];
  const glass = glassMats(world);
  const S: Part[] = [];
  const glassBand: { z: number; geo: BufferGeometry }[] = [];
  const rails: { z: number; geo: BufferGeometry }[] = [];
  const floors: { z: number; geo: BufferGeometry }[] = [];
  const warmGlass: { z: number; geo: BufferGeometry }[] = [];
  const canopies: { z: number; geo: BufferGeometry }[] = [];
  const warm: Part[] = [];
  const X = WALK.x;
  const B = WALK.beam;
  const RAIL = 2.3;

  // ---- the deck, stretch by stretch: beams, walking strips, the glass band, the spine under it, balustrade and rail
  for (const s of stretches()) {
    const along = (w: number, h: number, u: number, v: number, hex: number, geo?: BufferGeometry): Part => ({
      geo: geo ?? paint(new BoxGeometry(w, h, s.L), hex),
      position: [X + u, s.ym + v, s.zm],
      rotation: [s.pitch, 0, 0],
    });
    const depth = depthAt(s.zm);
    for (const side of [-1, 1]) {
      // the beam (its top a kerb a little over the deck), its walking strip, the handrail and the warm strip at its foot
      S.push(along(B - 1.95, depth + 0.06, side * (1.95 + B) / 2, -depth / 2 + 0.03, WHITE));
      S.push(along(1.95 - 1.6, 0.1, side * 1.775, -0.05, STRIP));
      S.push(along(0.14, 0.07, side * RAIL, 0.84, WHITE));
      warm.push(along(0.04, 0.04, side * (1.95 - 0.03), 0.2, 0, paint(new BoxGeometry(0.04, 0.04, s.L), 0xffd7a0)));
      // the balustrade's glass, standing in the beam
      const pane = new PlaneGeometry(s.L, 0.74).rotateY(Math.PI / 2);
      rails.push({ z: s.zm, geo: merged([{ geo: pane, position: [X + side * RAIL, s.ym + 0.05 + 0.37, s.zm], rotation: [s.pitch, 0, 0] }]) });
    }
    // the spine under the glass, and the glass band over it
    S.push(along(0.7, 0.45, 0, -0.3, STEEL));
    const band = uvScale(new PlaneGeometry(2 * 1.6, s.L).rotateX(-Math.PI / 2), 1.6, s.L / 3.2);
    glassBand.push({ z: s.zm, geo: merged([{ geo: band, position: [X, s.ym - 0.01, s.zm], rotation: [s.pitch, 0, 0] }]) });
  }
  // cross-beams under the glass and the balustrade's posts, every 3 (6 on a small budget)
  const every = lowEnd ? 6 : 3;
  for (let z = WALK.z0 - 1.5; z > WALK.z1 + 0.5; z -= every) {
    const y = deckY(z);
    S.push(box(2 * 1.95, 0.16, 0.12, X, y - 0.14, z, WHITE));
    for (const side of [-1, 1]) S.push(box(0.07, 0.78, 0.07, X + side * RAIL, y + 0.44, z, WHITE));
  }

  // ---- the bays: a slab level with the landing, the beam carried round it, a balustrade; a shelter's glass walls
  // and roof, a bench and its warm light; the balcony's glass canopy on two posts
  const bayParts = (b: Bay) => {
    const r = bayBox(b);
    const y = deckY((b.z0 + b.z1) / 2);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const w = r.x1 - r.x0;
    const d = b.z0 - b.z1;
    const outer = b.side > 0 ? r.x1 : r.x0;
    S.push(box(w, WALK.depth + 0.06, d, cx, y - WALK.depth / 2 + 0.03, cz, WHITE));
    S.push(box(w - 0.5, 0.06, d - 0.5, cx, y + 0.03, cz, b.kind === "shelter" ? TIMBER : STRIP));
    // a strut down to the pier under its middle, raking back to the walk
    S.push(strut(new Vector3(outer - b.side * 0.6, y - WALK.depth, cz), new Vector3(X + b.side * 0.9, SEA + 0.6, cz), 0.16, WHITE));
    // the rail round its three open sides
    const ring: [number, number, number, number][] = [
      [outer, b.z0, outer, b.z1],
      [X + b.side * B, b.z0, outer, b.z0],
      [X + b.side * B, b.z1, outer, b.z1],
    ];
    for (const [ax, az, bx, bz] of ring) {
      const L = Math.hypot(bx - ax, bz - az);
      const ry = Math.atan2(bx - ax, bz - az);
      S.push(box(0.14, 0.07, L, (ax + bx) / 2, y + 0.84, (az + bz) / 2, WHITE, ry));
      const pane = new PlaneGeometry(L, 0.74).rotateY(Math.PI / 2);
      if (b.kind === "shelter") {
        // glass walls to the roof
        warmGlass.push({ z: cz, geo: merged([{ geo: new PlaneGeometry(L, SHELTER_H).rotateY(Math.PI / 2), position: [(ax + bx) / 2, y + SHELTER_H / 2, (az + bz) / 2], rotation: [0, ry, 0] }]) });
      } else rails.push({ z: cz, geo: merged([{ geo: pane, position: [(ax + bx) / 2, y + 0.42, (az + bz) / 2], rotation: [0, ry, 0] }]) });
    }
    if (b.kind === "shelter") {
      // the roof over the bay and the walk beside it, its edge white, the light under it warm
      const rx0 = Math.min(r.x0, X - b.side * 0.2 * B) - 0.3;
      const rx1 = Math.max(r.x1, X - b.side * 0.2 * B) + 0.3;
      const roofX = (rx0 + rx1) / 2;
      canopies.push({ z: cz, geo: merged([{ geo: new PlaneGeometry(rx1 - rx0, d + 0.6).rotateX(-Math.PI / 2), position: [roofX, y + SHELTER_H + 0.12, cz] }]) });
      S.push(box(rx1 - rx0, 0.16, 0.2, roofX, y + SHELTER_H + 0.05, b.z0 + 0.3, WHITE), box(rx1 - rx0, 0.16, 0.2, roofX, y + SHELTER_H + 0.05, b.z1 - 0.3, WHITE));
      for (const z of [b.z0 + 0.3, b.z1 - 0.3]) for (const x of [rx0 + 0.15, X - b.side * 0.2 * B]) S.push(box(0.12, SHELTER_H, 0.12, x, y + SHELTER_H / 2, z, WHITE));
      S.push(box(0.7, 0.45, d - 2.4, outer - b.side * 0.9, y + 0.25, cz, TIMBER));
      warm.push({ geo: paint(new BoxGeometry(0.12, 0.05, d - 1.2), 0xffd7a0), position: [cx, y + SHELTER_H - 0.05, cz] });
    } else {
      const top = y + BALCONY_H;
      canopies.push({ z: cz, geo: merged([{ geo: new PlaneGeometry(w + 0.8, d + 0.6).rotateX(-Math.PI / 2), position: [cx, top, cz] }]) });
      S.push(box(w + 0.8, 0.12, 0.16, cx, top - 0.05, b.z0 + 0.3, WHITE), box(w + 0.8, 0.12, 0.16, cx, top - 0.05, b.z1 - 0.3, WHITE));
      for (const z of [b.z0 + 0.4, b.z1 - 0.4]) S.push(box(0.12, BALCONY_H, 0.12, outer - b.side * 0.3, y + BALCONY_H / 2, z, WHITE));
    }
  };
  for (const b of BAYS) bayParts(b);

  // ---- the lookout: a glass floor in a white rim off the west beam, ribs under it, a balustrade round it and a glass
  // canopy over it and the walk on four white columns
  const ly = deckY(LOOKOUT.z);
  const lx = X - B;
  const half = new CircleGeometry(1, lowEnd ? 16 : 28, Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(LOOKOUT.reach, 1, LOOKOUT.half);
  floors.push({ z: LOOKOUT.z, geo: uvScale(half.translate(lx, ly + 0.02, LOOKOUT.z), 3, 6) });
  const arc = Array.from({ length: (lowEnd ? 12 : 24) + 1 }, (_, k) => {
    const a = Math.PI / 2 + (Math.PI * k) / (lowEnd ? 12 : 24);
    return new Vector3(lx + Math.cos(a) * LOOKOUT.reach, ly, LOOKOUT.z - Math.sin(a) * LOOKOUT.half);
  });
  for (let k = 1; k < arc.length; k++) {
    const a = arc[k - 1];
    const b = arc[k];
    const L = a.distanceTo(b);
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    S.push(box(0.35, 0.5, L + 0.05, mx, ly - 0.25, mz, WHITE, ry), box(0.14, 0.07, L + 0.05, mx, ly + 0.84, mz, WHITE, ry));
    rails.push({ z: LOOKOUT.z, geo: merged([{ geo: new PlaneGeometry(L, 0.74).rotateY(Math.PI / 2), position: [mx, ly + 0.42, mz], rotation: [0, ry, 0] }]) });
    if (k % 3 === 0) S.push(strut(new Vector3(a.x, ly - 0.3, a.z), new Vector3(lx + 0.2, ly - 1.4, LOOKOUT.z + (a.z - LOOKOUT.z) * 0.4), 0.09, STEEL));
  }
  const canopyY = ly + LOOKOUT.canopy - 0.15;
  const cw = LOOKOUT.reach + 2 * B + 0.8;
  const ccx = X + B + 0.4 - cw / 2;
  canopies.push({ z: LOOKOUT.z, geo: new CircleGeometry(1, lowEnd ? 16 : 32).rotateX(-Math.PI / 2).scale(cw / 2, 1, LOOKOUT.half + 0.8).translate(ccx, canopyY, LOOKOUT.z) });
  const rim = Array.from({ length: 25 }, (_, k) => {
    const a = (k / 24) * Math.PI * 2;
    return new Vector3(ccx + (Math.cos(a) * cw) / 2, canopyY, LOOKOUT.z + Math.sin(a) * (LOOKOUT.half + 0.8));
  });
  for (let k = 1; k < rim.length; k++) S.push(strut(rim[k - 1], rim[k], 0.09, WHITE, 5));
  for (const [x, z] of [
    [X + B - 0.2, LOOKOUT.z - 5],
    [X + B - 0.2, LOOKOUT.z + 5],
    [lx - LOOKOUT.reach * 0.62, LOOKOUT.z - 5],
    [lx - LOOKOUT.reach * 0.62, LOOKOUT.z + 5],
  ])
    S.push(box(0.14, canopyY - ly, 0.14, x, (ly + canopyY) / 2, z, WHITE));

  // ---- the piers: a V of white struts on a pile cap with a fender round it, a head beam under the deck
  for (const z of PIERS) {
    // under the beam's bottom: the navigation span's deeper beam at its two piers
    const top = deckY(z) - (z === NAV.zS || z === NAV.zN ? WALK.navDepth : WALK.depth);
    const capTop = SEA + 0.6;
    S.push(box(4.6, 3.6, 2.2, X, capTop - 1.8, z, CAP), box(4.9, 0.3, 2.5, X, SEA + 0.12, z, 0x1f2125));
    S.push(box(4.4, 0.4, 1, X, top - 0.2, z, WHITE));
    for (const side of [-1, 1]) S.push(strut(new Vector3(X + side * 0.6, capTop, z), new Vector3(X + side * 1.95, top - 0.3, z), 0.24, WHITE));
  }

  // ---- the ends: an abutment at the plaza (down to the rim's foot), the pylons and name boards at either end
  const g0 = Math.min(groundAt(X, ABUTMENT.z1), groundAt(X, (ABUTMENT.z0 + ABUTMENT.z1) / 2));
  // its top just under the walking surface at its low end (the deck rises a little over it)
  const aTop = deckY(ABUTMENT.z0) - 0.06;
  S.push(box(2 * B, aTop - g0 + 1, ABUTMENT.z0 - ABUTMENT.z1, X, (aTop + g0 - 1) / 2, (ABUTMENT.z0 + ABUTMENT.z1) / 2, CONCRETE));
  const board = new MeshStandardMaterial({ map: nameTexture("INLET WALK"), roughness: 0.6, emissive: 0xffffff, emissiveMap: nameTexture("INLET WALK"), emissiveIntensity: 0 });
  const boards: BufferGeometry[] = [];
  for (const [z, face] of [
    [WALK.z0 - 0.6, 1],
    [WALK.z1 + 1.5, -1],
  ]) {
    const y = deckY(z);
    for (const side of [-1, 1]) S.push(box(0.3, 4.2, 0.3, X + side * (B + 0.25), y + 2.1, z, WHITE));
    S.push(box(2 * B + 0.8, 0.2, 0.3, X, y + 4.2, z, WHITE));
    boards.push(new PlaneGeometry(2 * B - 0.2, 0.55).rotateY(face > 0 ? 0 : Math.PI).translate(X, y + 3.75, z + face * 0.17));
  }
  world.events.followers.push((level) => (board.emissiveIntensity = 0.85 * nightOf(level)));

  // ---- the navigation span's lights: red on its south pier, green on its north, white at its middle, either side
  const navGeo = (hex: number, pts: [number, number, number][]) => new Mesh(merged(pts.map(([x, y, z]) => ({ geo: new SphereGeometry(0.2, 8, 6), position: [x, y, z] as [number, number, number] }))), new MeshBasicMaterial({ color: hex, toneMapped: false }));
  const yS = deckY(NAV.zS) - depthAt(NAV.zS + 1) - 0.25;
  const yN = deckY(NAV.zN) - depthAt(NAV.zN - 1) - 0.25;
  const yM = deckY((NAV.zS + NAV.zN) / 2) - WALK.navDepth - 0.2;
  const sides = [-1, 1].map((s) => X + s * (B + 0.15));
  const red = navGeo(0xff2a2a, sides.map((x) => [x, yS, NAV.zS - 1.3]));
  const green = navGeo(0x2aff6a, sides.map((x) => [x, yN, NAV.zN + 1.3]));
  const white = navGeo(0xffffff, sides.map((x) => [x, yM, (NAV.zS + NAV.zN) / 2]));

  // ---- the handrails' LEDs, which the event's pattern runs along (eventLights.ts registerLine)
  const step = lowEnd ? 2.4 : 1.2;
  const ledAt: Vector3[] = [];
  for (let z = WALK.z0 - 0.6; z > WALK.z1 + 0.6; z -= step) for (const side of [-1, 1]) ledAt.push(new Vector3(X + side * (RAIL - 0.08), deckY(z) + 0.8, z));
  const leds = new InstancedMesh(new BoxGeometry(0.05, 0.05, step * 0.7), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), ledAt.length);
  const m4 = new Matrix4();
  const white1 = new Color(0xffffff);
  ledAt.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    leds.setMatrixAt(i, m4);
    leds.setColorAt(i, white1);
  });
  registerLine(world.events, leds, ledAt.map((p) => (WALK.z0 - p.z) / (WALK.z0 - WALK.z1)));

  // ---- meshes
  const structure = new Mesh(merged(S), structureMat(world));
  structure.castShadow = !lowEnd;
  structure.receiveShadow = true;
  const warmMesh = new Mesh(merged(warm), warmLights(world, new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  const cuts = lowEnd ? [] : [-120, -230];
  g.add(structure, warmMesh, red, green, white, leds, new Mesh(merge(boards), board));
  chunked(g, glassBand, glass.deck, cuts, 1, skip);
  chunked(g, floors, glass.floor, [], 1, skip);
  chunked(g, rails, glass.clear, cuts, 1, skip);
  chunked(g, warmGlass, glass.warm, cuts, 1, skip);
  chunked(g, canopies, glass.canopy, cuts, 2, skip);
  skip.push(warmMesh);

  // ---- its lights in the water: the LEDs (by stretches, in the event's two colours), the shelters, the nav lights
  const ledCol = [new Color(), new Color()];
  const warmCol = new Color();
  const navCol = { r: new Color(), g: new Color(), w: new Color() };
  const refl: ReflectSource[] = [];
  const nRefl = lowEnd ? 5 : 10;
  for (let k = 0; k < nRefl; k++) {
    const z = WALK.z0 - ((k + 0.5) / nRefl) * (WALK.z0 - WALK.z1);
    for (const side of [-1, 1]) refl.push({ x: X + side * RAIL, z, y: deckY(z) + 0.6, h: 0.4, w: 2.4, col: ledCol[k % 2], gain: 0.5 });
  }
  for (const b of BAYS) {
    const r = bayBox(b);
    refl.push({ x: (r.x0 + r.x1) / 2, z: (b.z0 + b.z1) / 2, y: deckY(b.z0), h: b.kind === "shelter" ? SHELTER_H : 1, w: r.x1 - r.x0, col: warmCol, gain: 0.35 });
  }
  for (const x of sides) {
    refl.push({ x, z: NAV.zS - 1.3, y: yS, h: 0.4, w: 0.5, col: navCol.r, gain: 0.8 });
    refl.push({ x, z: NAV.zN + 1.3, y: yN, h: 0.4, w: 0.5, col: navCol.g, gain: 0.8 });
    refl.push({ x, z: (NAV.zS + NAV.zN) / 2, y: yM, h: 0.4, w: 0.5, col: navCol.w, gain: 0.6 });
  }
  addReflections(refl);
  const navMats = [red, green, white].map((m) => m.material as MeshBasicMaterial);
  const navHex = [0xff2a2a, 0x2aff6a, 0xffffff];
  world.events.followers.push((level, ev, t) => {
    const n = nightOf(level);
    eventColour(ev, 0, t, ledCol[0]).multiplyScalar(n);
    eventColour(ev, 1, t, ledCol[1]).multiplyScalar(n);
    warmCol.setHex(0xffd29a).multiplyScalar(n);
    navCol.r.setHex(0xff2a2a).multiplyScalar(n);
    navCol.g.setHex(0x2aff6a).multiplyScalar(n);
    navCol.w.setHex(0xffffff).multiplyScalar(n * 0.7);
    navMats.forEach((m, k) => m.color.setHex(navHex[k]).multiplyScalar(0.55 + 0.6 * n));
  });
  return { group: g, skipMirror: skip };
}

/* ------------------------------------------------------------------ the stage, its terraces and crown */

export function buildInletStage(world: World): InletBuilt {
  const { lowEnd, events } = world;
  const g = new Group();
  g.name = "inletStage";
  const skip: Object3D[] = [];
  const glass = glassMats(world);
  const S: Part[] = [];
  const warm: Part[] = [];
  const glow: Part[] = [];
  const { x0, x1, z0, z1, deck } = STAGE;
  const cx = STAGE_AT.x;
  const cz = STAGE_AT.z;
  const w = x1 - x0;
  const d = z0 - z1;
  const R = STAGE.ring;

  // ---- the pontoon and its deck, its edge trimmed white, speaker stacks at the front corners, a rail along the back
  S.push(box(w, deck - (SEA - 0.6), d, cx, (deck + SEA - 0.6) / 2, cz, 0x3a3f46));
  S.push(box(w - 0.3, 0.08, d - 0.3, cx, deck + 0.04, cz, 0x4a3b30));
  S.push(box(w, 0.12, 0.25, cx, deck + 0.02, z1 + 0.12, WHITE), box(w, 0.12, 0.25, cx, deck + 0.02, z0 - 0.12, WHITE));
  for (const x of [x0 + 0.9, x1 - 0.9]) S.push(box(1.2, 2.2, 1, x, deck + 1.1, z1 + 0.8, 0x15171c));
  S.push(box(w - 2, 0.07, 0.07, cx, deck + 0.9, z0 - 0.15, WHITE));
  for (let x = x0 + 1; x <= x1 - 1; x += 2) S.push(box(0.06, 0.9, 0.06, x, deck + 0.45, z0 - 0.15, WHITE));
  // footlights along the front, in the event's colour
  for (let x = x0 + 1; x <= x1 - 1; x += lowEnd ? 2 : 1.1) glow.push({ geo: new BoxGeometry(0.4, 0.14, 0.2), position: [x, deck + 0.15, z1 + 0.4] });

  // ---- the dolphins at its corners, and the gangways to the terraces' front row
  for (const [x, z] of [
    [x0 - 1, z0 + 1],
    [x1 + 1, z0 + 1],
    [x0 - 1, z1 - 1],
    [x1 + 1, z1 - 1],
  ]) {
    for (let k = 0; k < 3; k++) S.push(box(0.5, 4.6, 0.5, x + Math.cos(k * 2.1) * 0.35, SEA + 0.1, z + Math.sin(k * 2.1) * 0.35, 0x4a4038));
    S.push(box(1.3, 0.25, 1.3, x, SEA + 2.45, z, WHITE));
  }
  const fy = terraceRow(0).y;
  for (const gx of [x0 + w * 0.28, x1 - w * 0.28]) {
    const L = Math.hypot(z1 - TERRACES.front, fy - deck);
    const pitch = Math.atan2(fy - deck, z1 - TERRACES.front);
    S.push({ geo: paint(new BoxGeometry(1.8, 0.15, L), STRIP), position: [gx, (deck + fy) / 2, (z1 + TERRACES.front) / 2], rotation: [pitch, 0, 0] });
    for (const s of [-1, 1]) S.push({ geo: paint(new BoxGeometry(0.06, 0.06, L), WHITE), position: [gx + s * 0.9, (deck + fy) / 2 + 0.9, (z1 + TERRACES.front) / 2], rotation: [pitch, 0, 0] });
  }

  // ---- the ring: two chords round an ellipse over the stage, braced, on four raked masts
  const N = lowEnd ? 16 : 28;
  const ringAt = (a: number, y: number, k = 1) => new Vector3(cx + Math.cos(a) * R.rx * k, y, cz + Math.sin(a) * R.rz * k);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    S.push(strut(ringAt(a0, R.y), ringAt(a1, R.y), 0.16, 0xdfe3e8, 6), strut(ringAt(a0, R.y - 0.7, 0.96), ringAt(a1, R.y - 0.7, 0.96), 0.12, 0xdfe3e8, 6));
    S.push(strut(ringAt(a0, R.y), ringAt(a1, R.y - 0.7, 0.96), 0.06, 0xdfe3e8, 4));
  }
  const masts: Vector3[] = [];
  for (const a of [0.7, Math.PI - 0.7, Math.PI + 0.7, -0.7]) {
    const top = ringAt(a, R.y + 1.1);
    const foot = new Vector3(cx + Math.sign(Math.cos(a)) * (w / 2 - 0.5), deck, cz + Math.sign(Math.sin(a)) * (d / 2 - 0.5));
    S.push(strut(foot, top, 0.2, WHITE));
    masts.push(top);
  }
  // the sail under the ring: translucent fabric drawn down to a low point over the middle, rising to the ring's chords
  const rows: Vector3[][] = [];
  const NR = lowEnd ? 4 : 7;
  for (let r = 0; r <= NR; r++) {
    const u = r / NR;
    rows.push(
      Array.from({ length: N + 1 }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
        return new Vector3(cx + Math.cos(a) * R.rx * 0.95 * u, R.y - 0.7 - 1.3 * (1 - u * u) + 0.35 * u * u * Math.cos(2 * a), cz + Math.sin(a) * R.rz * 0.95 * u);
      }),
    );
  }
  const sailGeo = (() => {
    const pos: number[] = [];
    for (let r = 0; r < NR; r++) {
      for (let i = 0; i < N; i++) {
        for (const [a, b] of [
          [r, i],
          [r + 1, i],
          [r + 1, i + 1],
          [r, i],
          [r + 1, i + 1],
          [r, i + 1],
        ]) {
          const v = rows[a][b];
          pos.push(v.x, v.y, v.z);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  })();
  const sailMat = new MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.8, transparent: true, opacity: 0.72, depthWrite: false, side: DoubleSide, emissive: 0xffffff, emissiveIntensity: 0, forceSinglePass: true });
  const sail = new Mesh(sailGeo, sailMat);
  sail.renderOrder = 2;
  // the ring's lights, which take the event's pattern round it
  const nodeAt = Array.from({ length: lowEnd ? 24 : 44 }, (_, i) => ringAt((i / (lowEnd ? 24 : 44)) * Math.PI * 2, R.y - 0.35, 0.98));
  const nodes = new InstancedMesh(new SphereGeometry(0.2, 6, 4), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), nodeAt.length);
  const m4 = new Matrix4();
  nodeAt.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    nodes.setMatrixAt(i, m4);
    nodes.setColorAt(i, new Color(0xffffff));
  });
  registerPattern(events, nodes, "ring", nodeAt, new Vector3(cx, R.y, cz));
  // the beams after dark: cones from the ring down onto the stage, in the event's two colours
  const beamMats = [0, 1].map(() => new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  const beams = beamMats.map((mat, k) => {
    const parts: Part[] = [];
    const n = lowEnd ? 2 : 4;
    for (let j = 0; j < n; j++) {
      const a = Math.PI * 0.15 + ((j * 2 + k) / (n * 2)) * Math.PI * 0.7;
      const top = ringAt(a, R.y - 0.5, 0.92);
      const foot = new Vector3(cx + (j * 2 + k - n + 0.5) * 2, deck, cz - 3.5 + ((j + k) % 2) * 4);
      const dir = new Vector3().subVectors(top, foot);
      const L = dir.length();
      const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, dir.divideScalar(L)));
      const mid = top.clone().add(foot).multiplyScalar(0.5);
      parts.push({ geo: new ConeGeometry(1, L, 14, 1, true), position: [mid.x, mid.y, mid.z], rotation: [e.x, e.y, e.z] });
    }
    const m = new Mesh(merged(parts), mat);
    m.renderOrder = 3;
    m.visible = false;
    return m;
  });
  // a red light atop the masts, blinking
  const beacon = new Mesh(merged(masts.map((p) => ({ geo: new SphereGeometry(0.18, 8, 6), position: [p.x, p.y + 0.2, p.z] as [number, number, number] }))), new MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));

  // ---- the terraces: each row a step of concrete with a timber seat (two aisles through), walls at either side
  const T = TERRACES;
  const aisles = [T.x0 + (T.x1 - T.x0) / 3, T.x0 + ((T.x1 - T.x0) * 2) / 3];
  for (let k = 0; k < T.rows; k++) {
    const { y, zf, zb } = terraceRow(k);
    const zm = (zf + zb) / 2;
    S.push(box(T.x1 - T.x0, y - T.base, T.deep, (T.x0 + T.x1) / 2, (y + T.base) / 2, zm, CONCRETE));
    const cuts = [T.x0 + 0.3, aisles[0] - 0.7, aisles[0] + 0.7, aisles[1] - 0.7, aisles[1] + 0.7, T.x1 - 0.3];
    for (let j = 0; j < cuts.length; j += 2) S.push(box(cuts[j + 1] - cuts[j], 0.08, 0.72, (cuts[j] + cuts[j + 1]) / 2, y + 0.04, zf - 0.42, TIMBER));
    for (const ax of aisles) S.push(box(1.2, T.rise / 2, T.deep / 2, ax, y + T.rise / 4, zf - T.deep * 0.75, 0xe3ddd2));
    for (const wx of [T.x0 - 0.15, T.x1 + 0.15]) S.push(box(0.3, y + 0.9 - T.base, T.deep, wx, (y + 0.9 + T.base) / 2, zm, CONCRETE));
  }
  // ---- the crown: a plaza on a podium over the shore, glass balustrades round it where it stands over the ground
  const C = CROWN;
  const cw = C.x1 - C.x0;
  const cd = C.z0 - C.z1;
  const ccx = (C.x0 + C.x1) / 2;
  const ccz = (C.z0 + C.z1) / 2;
  S.push(box(cw, C.y - T.base, cd, ccx, (C.y + T.base) / 2, ccz, CONCRETE), box(cw - 0.2, 0.06, cd - 0.2, ccx, C.y + 0.03, ccz, 0xe3ddd2));
  const edge: [number, number, number, number][] = [
    [C.x0, C.z0, C.x0, C.z1],
    [C.x0, C.z1, LIFT.x0, C.z1],
    [LIFT.x1, C.z1, STAIR.x0, C.z1],
    [STAIR.x1, C.z1, C.x1, C.z1],
    [C.x1, C.z1, C.x1, C.z0],
    [C.x0, C.z0, WALK.x - WALK.beam, C.z0],
  ];
  const crownRails: BufferGeometry[] = [];
  for (const [ax, az, bx, bz] of edge) {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    const ry = Math.atan2(bx - ax, bz - az);
    S.push(box(0.14, 0.07, L, (ax + bx) / 2, C.y + 0.84, (az + bz) / 2, WHITE, ry));
    crownRails.push(merged([{ geo: new PlaneGeometry(L, 0.74).rotateY(Math.PI / 2), position: [(ax + bx) / 2, C.y + 0.42, (az + bz) / 2], rotation: [0, ry, 0] }]));
  }
  // the foyer under it, glazed along its back and its west side where these stand clear of the ground, white fins
  // between the panes
  const foyer: BufferGeometry[] = [];
  const faces: [number, number, number, number, number][] = [
    [C.x0 + 0.6, C.z1, LIFT.x0 - 0.4, C.z1, -1],
    [LIFT.x1 + 0.4, C.z1, STAIR.x0 - 0.6, C.z1, -1],
    [STAIR.x1 + 0.6, C.z1, C.x1 - 0.6, C.z1, -1],
    [C.x0, C.z1 + 0.6, C.x0, C.z0 - 0.6, -1],
  ];
  for (const [ax, az, bx, bz, out] of faces) {
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    // outward: −z for the back, −x for the west side
    const ox = az === bz ? 0 : out * 0.06;
    const oz = az === bz ? out * 0.06 : 0;
    const n = Math.max(1, Math.round(L / 2));
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * L;
      const t1 = ((k + 1) / n) * L;
      const mx = ax + ux * (t0 + t1) / 2;
      const mz = az + uz * (t0 + t1) / 2;
      const base = groundAt(mx + ox * 10, mz + oz * 10) + 0.2;
      const top = Math.min(base + 2.6, C.y - 1.2);
      if (top - base < 1) continue;
      const ry = Math.atan2(ux, uz);
      foyer.push(merged([{ geo: new PlaneGeometry(t1 - t0, top - base).rotateY(Math.PI / 2), position: [mx + ox, (base + top) / 2, mz + oz], rotation: [0, ry, 0] }]));
      S.push(box(0.3, top - base + 0.4, 0.16, ax + ux * t0 + ox * 2, (base + top) / 2, az + uz * t0 + oz * 2, WHITE, ry));
      S.push({ geo: lit(paint(new BoxGeometry(0.1, top - base - 0.2, (t1 - t0) * 0.9), 0xf1e3c8), 0.8), position: [mx - ox * 6, (base + top) / 2, mz - oz * 6], rotation: [0, ry, 0] });
    }
  }
  // the stair down the back to the shore
  const foot = groundAt((STAIR.x0 + STAIR.x1) / 2, STAIR.z1 - 0.5);
  const nSteps = Math.max(2, Math.ceil((C.y - foot) / 0.26));
  for (let k = 0; k < nSteps; k++) {
    const u = (k + 1) / nSteps;
    const y = C.y - (C.y - foot) * u;
    const z = STAIR.z0 - (STAIR.z0 - STAIR.z1) * u;
    S.push(box(STAIR.x1 - STAIR.x0, y - foot + 0.3, (STAIR.z0 - STAIR.z1) / nSteps + 0.02, (STAIR.x0 + STAIR.x1) / 2, (y + foot - 0.3) / 2, z, 0xe3ddd2));
  }
  for (const sx of [STAIR.x0 - 0.15, STAIR.x1 + 0.15]) {
    const L = Math.hypot(STAIR.z0 - STAIR.z1, C.y - foot);
    S.push({ geo: paint(new BoxGeometry(0.3, 1, L), CONCRETE), position: [sx, (C.y + foot) / 2 + 0.3, (STAIR.z0 + STAIR.z1) / 2], rotation: [Math.atan2(foot - C.y, STAIR.z0 - STAIR.z1), 0, 0] });
  }
  // the Stage House: glass walls under a white roof that overhangs them, lit warm after dark, its name on the fascia
  const H = STAGE_HOUSE;
  const hw = H.x1 - H.x0;
  const hd = H.z0 - H.z1;
  const hx = (H.x0 + H.x1) / 2;
  const hz = (H.z0 + H.z1) / 2;
  const houseGlass: BufferGeometry[] = [];
  for (const [ax, az, bx, bz] of [
    [H.x0, H.z0, H.x1, H.z0],
    [H.x1, H.z0, H.x1, H.z1],
    [H.x1, H.z1, H.x0, H.z1],
    [H.x0, H.z1, H.x0, H.z0],
  ]) {
    const L = Math.hypot(bx - ax, bz - az);
    houseGlass.push(merged([{ geo: new PlaneGeometry(L, H.h).rotateY(Math.PI / 2), position: [(ax + bx) / 2, C.y + H.h / 2, (az + bz) / 2], rotation: [0, Math.atan2(bx - ax, bz - az), 0] }]));
  }
  S.push(box(hw + 1.6, 0.3, hd + 1.6, hx, C.y + H.h + 0.15, hz, WHITE));
  for (const [x, z] of [
    [H.x0, H.z0],
    [H.x1, H.z0],
    [H.x0, H.z1],
    [H.x1, H.z1],
  ])
    S.push(box(0.14, H.h, 0.14, x, C.y + H.h / 2, z, WHITE));
  S.push({ geo: lit(paint(new BoxGeometry(hw - 0.4, 0.04, hd - 0.4), 0xfff1d8), 0.9), position: [hx, C.y + H.h - 0.04, hz] });
  const sign = new MeshStandardMaterial({ map: nameTexture("INLET STAGE"), roughness: 0.6, emissive: 0xffffff, emissiveMap: nameTexture("INLET STAGE"), emissiveIntensity: 0 });
  const signMesh = new Mesh(new PlaneGeometry(hw * 0.7, (hw * 0.7 * 96) / 512).translate(hx, C.y + H.h + 0.15, H.z0 + 0.81 + 0.01), sign);
  // the lift: a glass shaft in a white frame against the crown's back, from the shore to its head over the crown
  const lg = Math.min(groundAt(LIFT.x0, LIFT.z1), groundAt(LIFT.x1, LIFT.z1)) - 0.3;
  const lw = LIFT.x1 - LIFT.x0;
  const ld = LIFT.z0 - LIFT.z1;
  const lcx = (LIFT.x0 + LIFT.x1) / 2;
  const lcz = (LIFT.z0 + LIFT.z1) / 2;
  for (const [x, z] of [
    [LIFT.x0, LIFT.z0],
    [LIFT.x1, LIFT.z0],
    [LIFT.x0, LIFT.z1],
    [LIFT.x1, LIFT.z1],
  ])
    S.push(box(0.16, LIFT.top - lg, 0.16, x, (LIFT.top + lg) / 2, z, WHITE));
  S.push(box(lw + 0.3, 0.6, ld + 0.3, lcx, LIFT.top - 0.3, lcz, WHITE), box(lw + 0.3, 0.3, ld + 0.3, lcx, lg + 0.15, lcz, WHITE));
  // the car, part way up
  S.push({ geo: lit(paint(new BoxGeometry(lw - 0.5, 1.4, ld - 0.5), 0xe9e4da), 0.6), position: [lcx, (C.y + lg) / 2, lcz] });
  const liftGlass = walls4(LIFT.x0, LIFT.x1, LIFT.z0, LIFT.z1, lg, LIFT.top - 0.6);
  // warm lights: under the Stage House's roof, along the crown's rails
  warm.push({ geo: paint(new BoxGeometry(cw - 1, 0.04, 0.04), 0xffd7a0), position: [ccx, C.y + 0.2, C.z1 + 0.25] });

  // ---- meshes
  const structure = new Mesh(merged(S), structureMat(world));
  structure.castShadow = !lowEnd;
  structure.receiveShadow = true;
  const warmMesh = new Mesh(merged(warm), warmLights(world, new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  const glowMesh = new Mesh(merged(glow), events.glow);
  const glassClear = new Mesh(merge([...crownRails, liftGlass]), glass.clear);
  const glassHouse = new Mesh(merge(houseGlass), glass.warm);
  const glassFoyer = new Mesh(merge(foyer), glass.tint);
  glassClear.renderOrder = glassHouse.renderOrder = glassFoyer.renderOrder = 1;
  g.add(structure, warmMesh, glowMesh, glassClear, glassHouse, glassFoyer, sail, nodes, ...beams, beacon, signMesh);
  skip.push(glassClear, glassHouse, glassFoyer, ...beams, warmMesh, glowMesh, beacon);

  // ---- its lights in the water, and after dark: the beams and the sail in the event's colours, the sign lit
  const stageCol = [new Color(), new Color()];
  const houseCol = new Color();
  addReflections([
    { x: cx - 4, z: z0, y: deck, h: R.y - deck, w: 7, col: stageCol[0], gain: 0.5 },
    { x: cx + 4, z: z0, y: deck, h: R.y - deck, w: 7, col: stageCol[1], gain: 0.5 },
    { x: hx, z: H.z0, y: C.y, h: H.h, w: hw, col: houseCol, gain: 0.3 },
  ]);
  const sailCol = new Color();
  world.events.followers.push((level, ev, t) => {
    const n = nightOf(level);
    eventColour(ev, 0, t, stageCol[0]).multiplyScalar(n);
    eventColour(ev, 1, t, stageCol[1]).multiplyScalar(n);
    houseCol.setHex(0xffd29a).multiplyScalar(n);
    beamMats.forEach((m, k) => {
      eventColour(ev, k, t, m.color);
      m.opacity = 0.075 * n;
    });
    for (const b of beams) b.visible = n > 0.05;
    eventColour(ev, 0, t, sailCol);
    sailMat.emissive.copy(sailCol);
    sailMat.emissiveIntensity = 0.28 * n;
    sign.emissiveIntensity = 0.85 * n;
  });
  return {
    group: g,
    skipMirror: skip,
    animate: (t) => {
      beacon.visible = t % 2 < 1;
    },
  };
}

/** Glass walls round an axis box (x0 < x1, z0 > z1) from y0 to y1. */
function walls4(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): BufferGeometry {
  const h = y1 - y0;
  const parts: Part[] = [];
  for (const [ax, az, bx, bz] of [
    [x0, z0, x1, z0],
    [x1, z0, x1, z1],
    [x1, z1, x0, z1],
    [x0, z1, x0, z0],
  ]) {
    const L = Math.hypot(bx - ax, bz - az);
    parts.push({ geo: new PlaneGeometry(L, h).rotateY(Math.PI / 2), position: [(ax + bx) / 2, y0 + h / 2, (az + bz) / 2], rotation: [0, Math.atan2(bx - ax, bz - az), 0] });
  }
  return merged(parts);
}
