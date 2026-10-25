/**
 * The ten set pieces, one built around each station's section. Each is made in its station's frame (x = lateral
 * toward the set side, y = up from the deck, z = along the track toward the set's "ahead") and merged per material,
 * so a set costs a handful of draw calls. Anchors are where the captions pin.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  FrontSide,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  BufferGeometry as BG,
  Quaternion,
  NoColorSpace,
  OctahedronGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  Vector4,
} from "three";

import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { busNetwork } from "../buses";
import { PEOPLE_WIDTH } from "../constants";
import { isRoad } from "../roadNetwork";
import { moreProjects, roles, stations } from "@/data";


import { merged, type Part } from "../merge";
import { cap, type P2, paint, walls } from "../shapes";
import { useTrain } from "../store";
import { groundAt, sdfAt, surfaceAt } from "../terrain";
import { dotTexture } from "../textures";
import { frameAt, makeFrame, PATH_SAMPLES, stationS, UP } from "../track";
import { type CarGeometry, carGeometry, PEARL } from "../trainGeometry";
import { glassBox, nets, pad as taxiPad, windsock } from "../vertiports";
import { barkTexture, type Conifer, coniferSkeleton, crownFromOf, DETAIL_FULL, DETAIL_LOW, frondTexture, limbGeometry, sprayCard, sprayMatrix, trunkGeometry } from "../trees/conifer";
import type { World } from "../world";
import { bench, bollard, festoon, foodTruck, lit, type Pieces, pavilion, planter, shopGlow, stall, umbrellaTable, warmLights } from "../pavilion";
import { inLandmark } from "../sites";
import { COURTS, type FrameBox, GYM, MATS, PERGOLA, RUN_PATH, YOGA_DECK } from "./wellness";
import { type BannerArt, boardsAtlas, galleryAtlas, PLAQUE_RATIO, screenTextures } from "./galleryArt";
import { along, inCbSquare, lineLength, MARKET_HALF, MARKET_STREET, type Square, SQUARES, VERTIPORT, VERTIPORT_TOP, WATCH, WOODLAND_LANE } from "./squares";
import { fromStation, MAIN_COLUMN, SET_RECT, SET_SHIFT, SET_SIDE, SET_TREES, STATION_FRAMES, toStation } from "./zones";

type V3 = [number, number, number];
export type BuiltSet = { group: Group; anchors: Vector3[]; focus: Vector3; update?: (t: number, cam: Vector3) => void };

type Ctx = {
  i: number;
  side: 1 | -1;
  world: World;
  lowEnd: boolean;
  group: Group;
  /** Local coordinates for (along, lateral toward the set, up). */
  L: (a: number, l: number, u: number) => V3;
  /** Ground height, local, under (along, lateral). */
  G: (a: number, l: number) => number;
  /** The drawn ground's surface there (its mesh, coarser on low-end devices), for what lies on it. */
  S: (a: number, l: number) => number;
  add: (mat: Material, geo: BufferGeometry, pos?: V3, rot?: V3, scale?: V3) => void;
};

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) paint(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

const fontOf = () => {
  const cs = getComputedStyle(document.documentElement);
  return { serif: `${cs.getPropertyValue("--font-serif").trim() || "Georgia"}, Georgia, serif`, mono: `${cs.getPropertyValue("--font-mono").trim() || "ui-monospace"}, ui-monospace, monospace`, sans: `${cs.getPropertyValue("--font-sans").trim() || "system-ui"}, system-ui, sans-serif` };
};

const glowMat = (c: number, i = 1.6) => new MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i, roughness: 0.6 });

/** How far a point of this set (along, lateral toward its side) is from the nearest track, the turning loops included. */
function trackClear(c: Ctx, a: number, l: number): number {
  const [x, z] = fromStation(c.i, a, l);
  let d = Infinity;
  for (const f of PATH_SAMPLES) d = Math.min(d, (f.p.x - x) ** 2 + (f.p.z - z) ** 2);
  return Math.sqrt(d);
}

/** Columns from a raised deck down to the ground. */
function legs(c: Ctx, mat: Material, pts: [number, number][], top: number, r = 0.45) {
  for (const [a, l] of pts) {
    const g = c.G(a, l);
    const h = top - g;
    if (h > 0.4) c.add(mat, new CylinderGeometry(r, r * 1.3, h, 10), c.L(a, l, g + h / 2));
  }
}

/**
 * A raised terrace at platform height (or on the ground where that is higher), with legs, and a bridge to it from the
 * platform's outer edge at `bridgeA` along. Returns its top.
 */
function terrace(c: Ctx, a0: number, a1: number, l0: number, l1: number, bridgeA = 0): number {
  let gmax = -1e9;
  for (let a = a0; a <= a1; a += 4) for (let l = l0; l <= l1; l += 4) gmax = Math.max(gmax, c.G(a, l));
  const top = Math.max(1.4, gmax + 0.35);
  const { mats } = c.world;
  c.add(mats.plat, new BoxGeometry(l1 - l0, 0.5, a1 - a0), c.L((a0 + a1) / 2, (l0 + l1) / 2, top - 0.25));
  legs(c, mats.girder, [
    [a0 + 3, l0 + 3],
    [a1 - 3, l0 + 3],
    [a0 + 3, l1 - 3],
    [a1 - 3, l1 - 3],
    [(a0 + a1) / 2, l1 - 3],
  ], top - 0.5);
  // a bridge from the platform's outer edge onto the terrace, sloping up where the terrace stands on a bank of the cut
  if (l0 > 11.6) {
    const run = l0 - 11.4;
    const rise = top - 0.1 - 1.3;
    c.add(mats.plat, new BoxGeometry(Math.hypot(run, rise), 0.3, 5), c.L(bridgeA, (l0 + 11.4) / 2, 1.3 + rise / 2), [0, 0, Math.atan2(rise, run)]);
  }
  return top;
}

/** The CPR station's buff stone: arched windows on the ground floor, square ones above, joints and a cornice band. */
function stationTextures(): { map: CanvasTexture; glow: CanvasTexture } {
  const paint = (lit: boolean) =>
    canvasTex(
      128,
      128,
      (g) => {
        g.fillStyle = lit ? "#000" : "#d9ccb3";
        g.fillRect(0, 0, 128, 128);
        if (!lit) {
          g.fillStyle = "#c7b99e";
          for (let y = 8; y < 128; y += 10) g.fillRect(0, y, 128, 1);
          g.fillStyle = "#e6dbc6";
          g.fillRect(0, 0, 128, 9);
          g.fillRect(0, 58, 128, 6);
        }
        for (const x of [14, 78]) {
          // a tall arched window below, a square one above
          g.fillStyle = lit ? "#ffcf8a" : "#2c3644";
          g.beginPath();
          g.moveTo(x, 120);
          g.lineTo(x, 84);
          g.arc(x + 18, 84, 18, Math.PI, 0);
          g.lineTo(x + 36, 120);
          g.fill();
          g.fillRect(x + 6, 22, 24, 26);
          if (!lit) {
            g.fillStyle = "#d9ccb3";
            g.fillRect(x + 17, 66, 2, 54);
            g.fillRect(x + 17, 22, 2, 26);
          }
        }
      },
      true,
    );
  return { map: paint(false), glow: paint(true) };
}
let stationGlow: MeshStandardMaterial | null = null;

// ------------------------------------------------------------------ the squares (sets/squares.ts)
/** A timber or steel strut from one point to another (local coordinates), as a cylinder. */
function strut(c: Ctx, mat: Material, p0: V3, p1: V3, r: number): void {
  const d = new Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = d.length();
  const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, d.normalize()));
  c.add(mat, new CylinderGeometry(r, r, len, 8), [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], [e.x, e.y, e.z]);
}

type Kit = { lit: MeshBasicMaterial; put: (p: Pieces, a: number, l: number, face: [number, number], y?: number) => void };

/**
 * A square's fixtures in its set's frame:
 * - the pavilions, each with its name lit over its front;
 * - the market stalls and food trucks;
 * - the splash fountains and the stage;
 * - a planter under each of its trees (the tree layer plants them).
 *
 * The painted parts share the set's vertex-coloured material and the glass the world's. The lights and the names
 * share one glowing material: an atlas of the names over a white strip at its foot, where the lights' unmapped
 * corner reads.
 */
function squareKit(c: Ctx, sq: Square, vc: Material): Kit {
  const { mats } = c.world;
  const zs = c.L(1, 0, 0)[2];
  const fonts = fontOf();
  const CELL = 128;
  const rows = Math.ceil(sq.pavilions.length / 2);
  const AH = CELL * rows + 16;
  const atlas = canvasTex(1024, AH, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, CELL * rows, 1024, 16);
    sq.pavilions.forEach((p, k) => {
      const x = (k % 2) * 512;
      const y = Math.floor(k / 2) * CELL;
      g.fillStyle = ["#1f2a33", "#3a2a22", "#22332a", "#2c2638"][k % 4];
      g.fillRect(x, y, 512, CELL);
      g.fillStyle = "#f6efe2";
      g.font = `500 62px ${fonts.serif}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(p.name, x + 256, y + CELL / 2 + 4, 470);
    });
  });
  const lit = warmLights(c.world, new MeshBasicMaterial({ map: atlas, vertexColors: true, toneMapped: false }));
  vc.userData.square = lit.userData.square = true;
  // a piece's front (its local +z) turned toward (da, dl)
  const turn = (f: [number, number]) => Math.atan2(f[1], f[0] * zs);
  const put = (p: Pieces, a: number, l: number, face: [number, number], y = c.G(a, l)) => {
    const pos = c.L(a, l, y);
    const rot: V3 = [0, turn(face), 0];
    for (const g of p.solid) c.add(vc, g, pos, rot);
    for (const g of p.glass) c.add(mats.pane, g, pos, rot);
    for (const g of p.warm) c.add(lit, g, pos, rot);
  };
  sq.pavilions.forEach((p, k) => {
    const piece = pavilion({ w: p.w, d: p.d, h: p.h, front: p.front, umbrella: p.umbrella, well: p.well, roof: p.roof });
    // standing on the highest ground under its deck, so the deck's skirt meets the lower side
    const [fa, fl] = p.face;
    let g = -Infinity;
    for (const [al, ac] of [
      [-p.d / 2 - 0.8, -p.w / 2 - 0.8],
      [-p.d / 2 - 0.8, p.w / 2 + 0.8],
      [p.d / 2 + (p.front ?? 3.4), -p.w / 2 - 0.8],
      [p.d / 2 + (p.front ?? 3.4), p.w / 2 + 0.8],
      [0, 0],
    ])
      g = Math.max(g, c.G(p.a + fa * al - fl * ac, p.l + fl * al + fa * ac));
    // its name over the front, from its cell of the atlas
    const s = piece.sign;
    const sign = new PlaneGeometry(s.w, s.h);
    const uv = sign.attributes.uv as Float32BufferAttribute;
    const u0 = (k % 2) / 2;
    const v0 = 1 - ((Math.floor(k / 2) + 1) * CELL) / AH;
    for (let q = 0; q < uv.count; q++) uv.setXY(q, u0 + uv.getX(q) / 2, v0 + (uv.getY(q) * CELL) / AH);
    piece.warm.push(paint(sign.translate(s.x, s.y, s.z), 0xffffff));
    put(piece, p.a, p.l, p.face, g - 0.02);
  });
  sq.stalls.forEach((q, k) => put(stall(q.hex, k), q.a, q.l, q.face));
  for (const q of sq.trucks) {
    // a truck serves from its +x side: its front (+z) a quarter turn round from where it serves
    put(foodTruck(q.hex), q.a, q.l, [q.face[1] * zs, -q.face[0] * zs]);
  }
  // tables under umbrellas out in the open
  for (const [a, l, hex] of sq.seats) {
    const out: Pieces = { solid: [], glass: [], warm: [] };
    umbrellaTable(out, 0, 0, 0, hex);
    put(out, a, l, [1, 0]);
  }
  // a stone planter round each tree's foot
  for (const t of sq.trees) {
    const g = c.G(t.a, t.l);
    c.add(vc, paint(new CylinderGeometry(0.85, 0.95, 0.5, 10), 0xa9a49a), c.L(t.a, t.l, g + 0.2));
    c.add(vc, paint(new CylinderGeometry(0.75, 0.75, 0.06, 10), 0x5b4a3a), c.L(t.a, t.l, g + 0.46));
  }
  // splash fountains: a low stone rim round a shallow pool
  for (const [a, l, r] of sq.pools) {
    const g = c.G(a, l);
    c.add(vc, paint(new CylinderGeometry(r, r + 0.15, 0.45, 20), 0xbab4a8), c.L(a, l, g + 0.2));
    c.add(vc, paint(new CylinderGeometry(r - 0.25, r - 0.25, 0.05, 20), 0x5fa8d3), c.L(a, l, g + 0.43));
  }
  // the stage: a dark platform, a back wall, a roof on four posts, speakers and lights along its front
  if (sq.stage) {
    const st = sq.stage;
    const out: Pieces = { solid: [], glass: [], warm: [] };
    out.solid.push(paint(new BoxGeometry(6, 0.7, 3.6).translate(0, 0.35, 0), 0x2b2f36), paint(new BoxGeometry(6, 3.4, 0.2).translate(0, 2.4, -1.7), st.hex));
    for (const [x, z] of [
      [-2.9, -1.7],
      [2.9, -1.7],
      [-2.9, 1.7],
      [2.9, 1.7],
    ])
      out.solid.push(paint(new BoxGeometry(0.14, 4.1, 0.14).translate(x, 2.05, z), 0x3a3f46));
    out.solid.push(paint(new BoxGeometry(6.6, 0.25, 4.2).translate(0, 4.2, 0), 0xf1e9da));
    for (const x of [-2.4, 2.4]) out.solid.push(paint(new BoxGeometry(0.7, 1.1, 0.6).translate(x, 1.25, 1.2), 0x15171c));
    for (let x = -2.6; x <= 2.61; x += 0.65) out.warm.push(paint(new CylinderGeometry(0.1, 0.14, 0.18, 6).translate(x, 3.98, 1.9), 0xffd49a));
    put(out, st.a, st.l, st.face);
  }
  return { lit, put };
}

/**
 * Paving over a square: two-unit stones laid on the drawn ground, a hand above it (the pavilions' decks stand a little
 * higher), one sheet that follows its slopes. `tone` picks each stone's colour, or skips it (null).
 */
function paveSquare(c: Ctx, vc: Material, a0: number, a1: number, l0: number, l1: number, tone: (a: number, l: number, i: number, j: number) => number | null): void {
  const pos: number[] = [];
  const col: number[] = [];
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const h = new Map<number, number>();
  const at = (a: number, l: number): V3 => {
    const k = a * 10007 + l;
    let y = h.get(k);
    if (y === undefined) h.set(k, (y = c.S(a, l) + 0.12));
    return c.L(a, l, y);
  };
  for (let a = a0, i = 0; a < a1; a += 2, i++) {
    for (let l = l0, j = 0; l < l1; l += 2, j++) {
      const hex = tone(a + 1, l + 1, i, j);
      if (hex === null) continue;
      const rgb = [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
      for (const tri of [
        [at(a, l), at(a, l + 2), at(a + 2, l)],
        [at(a + 2, l), at(a, l + 2), at(a + 2, l + 2)],
      ]) {
        // wound to face up, whichever way the frame's along axis runs
        const [p, q, r] = tri;
        const up = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
        for (const v of up > 0 ? [p, q, r] : [p, r, q]) {
          pos.push(...v);
          col.push(...rgb);
        }
      }
    }
  }
  const geo = new BG();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  c.add(vc, geo);
}

/** Poles along a line of points (a, l), festoon lights strung from each to the next. */
function festoons(c: Ctx, vc: Material, lit: Material, pts: [number, number][], h = 4.2): void {
  const out: Pieces = { solid: [], glass: [], warm: [] };
  const tops = pts.map(([a, l]): V3 => {
    const g = c.G(a, l);
    c.add(vc, paint(new CylinderGeometry(0.06, 0.08, h, 6), 0x3a3f46), c.L(a, l, g + h / 2));
    return c.L(a, l, g + h - 0.1);
  });
  for (let k = 1; k < tops.length; k++) festoon(out, tops[k - 1], tops[k], 0.5);
  for (const g of out.solid) c.add(vc, g);
  for (const g of out.warm) c.add(lit, g);
}

/** Distance from (a, l) to a polyline of (a, l). */
function lineDist(line: [number, number][], a: number, l: number): number {
  let d = Infinity;
  for (let k = 1; k < line.length; k++) {
    const [pa, pl] = line[k - 1];
    const [qa, ql] = line[k];
    const ea = qa - pa;
    const el = ql - pl;
    const t = Math.max(0, Math.min(1, ((a - pa) * ea + (l - pl) * el) / (ea * ea + el * el)));
    d = Math.min(d, Math.hypot(a - pa - ea * t, l - pl - el * t));
  }
  return d;
}

// ------------------------------------------------------------------ 00 Depart · Waterfront
/** A row of planters with clipped shrubs down the middle of a plaza, each with a bench beside it. */
function plaza(c: Ctx, a0: number, a1: number, l0: number, l1: number, skip: (a: number, l: number) => boolean = () => false): void {
  const planter = new MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 });
  const green = new MeshStandardMaterial({ color: 0x4f7a3e, roughness: 1 });
  for (let a = a0 + 4; a < a1 - 2; a += 10) {
    const l = (l0 + l1) / 2;
    if (skip(a, l)) continue;
    const g = c.G(a, l);
    c.add(planter, new BoxGeometry(3, 0.8, 3), c.L(a, l, g + 0.6));
    c.add(green, new SphereGeometry(1.6, 10, 8), c.L(a, l, g + 1.6), [0, 0, 0], [1, 0.7, 1]);
    c.add(planter, new BoxGeometry(0.6, 0.5, 3.2), c.L(a + 3.2, l, g + 0.45));
  }
}

/** The Canada Line's hall at Waterfront, as the set lays it out (along, lateral): open to the sky, in the plaza. */
const HALL = { a0: -21, a1: -5, l0: 17, l1: 27, deep: 6.2 };

/**
 * The Canada Line at Waterfront: it runs underground, so its platform is seen from the plaza through a sunken hall, a
 * pit cut into the paving (the ground leaves it open) with a glass balustrade round its rim and a glass canopy over
 * half of it. Below, a platform along one side and the track along the other, a tunnel mouth in each end wall, and a
 * two-car pearl train that comes in, waits and goes on; escalators run down from the rim, and a glass entrance pavilion
 * with the line's roundel stands at the end. Returns the per-frame update.
 */
function canadaLineHall(c: Ctx, vc: Material, lit: Material): (t: number) => void {
  const { mats } = c.world;
  const { a0, a1, l0, l1, deep } = HALL;
  let low = Infinity;
  let high = -Infinity;
  for (let a = a0; a <= a1; a += 2) {
    for (let l = l0; l <= l1; l += 2) {
      low = Math.min(low, c.G(a, l));
      high = Math.max(high, c.G(a, l));
    }
  }
  const rim = high + 0.05;
  const floor = low - deep;
  const H = rim - floor;
  const am = (a0 + a1) / 2;
  const lm = (l0 + l1) / 2;
  // the ground leaves the hall open
  const fr = STATION_FRAMES[c.i];
  const [hx, hz] = fromStation(c.i, am, lm);
  const u = c.world.mats.ground.userData as { hole: { value: Vector4 }; holeDir: { value: Vector2 } };
  u.hole.value.set(hx, hz, (a1 - a0) / 2, (l1 - l0) / 2);
  u.holeDir.value.set(fr.tx, fr.tz).normalize();
  // the hall's own parts in one painted mesh, its lit edges in one glowing one
  const wall = (geo: BufferGeometry, pos: V3, rot?: V3) => c.add(vc, paint(geo, 0xd8d4cc), pos, rot);
  c.add(vc, paint(new BoxGeometry(l1 - l0 + 0.8, 0.4, a1 - a0 + 0.8), 0xd8d4cc), c.L(am, lm, floor - 0.2));
  for (const l of [l0 - 0.2, l1 + 0.2]) wall(new BoxGeometry(0.4, H, a1 - a0 + 0.8), c.L(am, l, floor + H / 2));
  for (const a of [a0 - 0.2, a1 + 0.2]) {
    wall(new BoxGeometry(l1 - l0 + 0.8, H, 0.4), c.L(a, lm, floor + H / 2));
    // the tunnel mouth the train comes out of and goes into
    c.add(vc, paint(new BoxGeometry(4.2, 4.2, 0.5), 0x0b0d12), c.L(a, l1 - 3, floor + 2.3));
  }
  // the platform along the near side with its lit edge, the track along the far side
  c.add(mats.plat, new BoxGeometry(4.4, 1.2, a1 - a0), c.L(am, l0 + 2.2, floor + 0.6));
  c.add(lit, paint(new BoxGeometry(0.14, 0.06, a1 - a0 - 0.4), 0x1fb5c9), c.L(am, l0 + 4.35, floor + 1.22));
  c.add(mats.bed, new BoxGeometry(3.4, 0.15, a1 - a0), c.L(am, l1 - 3, floor + 0.08));
  for (const s of [-0.72, 0.72]) c.add(mats.rail, new BoxGeometry(0.12, 0.14, a1 - a0), c.L(am, l1 - 3 + s, floor + 0.22));
  // a glass balustrade round the rim, and a glass canopy on steel over the platform's end
  for (const l of [l0 - 0.1, l1 + 0.1]) c.add(mats.pane, new BoxGeometry(0.06, 1.1, a1 - a0), c.L(am, l, rim + 0.55));
  for (const a of [a0 - 0.1, a1 + 0.1]) c.add(mats.pane, new BoxGeometry(l1 - l0, 1.1, 0.06), c.L(a, lm, rim + 0.55));
  c.add(mats.pane, new BoxGeometry(l1 - l0 + 1, 0.08, 7), c.L(a0 + 3.5, lm, rim + 4.4), [0.12, 0, 0]);
  for (const a of [a0 + 0.4, a0 + 6.6]) for (const l of [l0 - 0.3, l1 + 0.3]) c.add(mats.post, new BoxGeometry(0.16, 4.4, 0.16), c.L(a, l, rim + 2.2));
  // escalators down from the rim at the pavilion's end to the platform
  const run = Math.hypot(8, H - 1.2);
  const tilt = Math.atan2(H - 1.2, 8);
  for (const l of [l0 + 0.9, l0 + 2.5]) {
    c.add(mats.plat, new BoxGeometry(1.3, 0.3, run), c.L(a1 - 4.4, l, floor + 1.2 + (H - 1.2) / 2), [-tilt * Math.sign(c.L(1, 0, 0)[2] || 1), 0, 0]);
  }
  // the entrance pavilion at the end of the hall: glass under a white roof, the line's roundel on a mast
  c.add(mats.pane, new BoxGeometry(l1 - l0, 3.6, 4), c.L(a1 + 2.6, lm, rim + 1.8));
  c.add(mats.plat, new BoxGeometry(l1 - l0 + 1.4, 0.3, 5), c.L(a1 + 2.6, lm, rim + 3.75));
  c.add(mats.post, new CylinderGeometry(0.1, 0.1, 6, 8), c.L(a1 + 5.4, l0 - 0.6, rim + 3));
  c.add(lit, paint(new CylinderGeometry(1.1, 1.1, 0.12, 24).rotateX(Math.PI / 2), 0x1fb5c9), c.L(a1 + 5.4, l0 - 0.6, rim + 6.3));
  // the train: two short pearl cars (trainGeometry.ts), the second turned round so both ends wear a nose, the line's
  // teal along them and a dark skirt under them, in and out of the tunnels
  const CL = 7.6;
  const cars = [1, -1].map((k) => ({ geo: carGeometry(CL, true, false, c.lowEnd ? 14 : 22, { ...PEARL, nose: 3 }), z: (k * (CL + 0.5)) / 2, ry: k > 0 ? 0 : Math.PI }));
  const both = (pick: (g: CarGeometry) => BufferGeometry) => merged(cars.map((car): Part => ({ geo: pick(car.geo), position: [0, 0, car.z], rotation: [0, car.ry, 0] })));
  const train = new Group();
  train.add(
    new Mesh(both((g) => g.body), mats.body),
    new Mesh(both((g) => g.glass), mats.window),
    new Mesh(both((g) => paint(g.line, 0x1fb5c9)), lit),
    new Mesh(merged(cars.map((car): Part => ({ geo: paint(new BoxGeometry(2.3, 0.62, CL - 1.2), 0x2a3039), position: [0, 0.42, car.z] }))), vc),
  );
  c.group.add(train);
  const place = (a: number) => {
    const [x, y, z] = c.L(a, l1 - 3, floor + 0.29);
    train.position.set(x, y, z);
    train.visible = a > a0 - 9 && a < a1 + 9;
  };
  return (t) => {
    // in from the far tunnel, a wait at the platform, out through the near one
    const T = t % 28;
    const ease = (v: number) => v * v * (3 - 2 * v);
    place(T < 5 ? a0 - 9 + (am - a0 + 9) * ease(T / 5) : T < 15 ? am : T < 20 ? am + (a1 + 9 - am) * ease((T - 15) / 5) : a0 - 20);
  };
}

/**
 * The plaza at Waterfront made the busiest place on the line: a row of market kiosks under coloured awnings, café
 * tables under umbrellas, a fountain with leaping jets, a bike-share dock, trees in planters, and a departures board
 * for all four lines (the Expo, the Canada Line, the West Coast Express and the SeaBus). Returns the per-frame update.
 */
function busyPlaza(c: Ctx, vc: Material, lamps: Material): (t: number) => void {
  const { mats } = c.world;
  const G = (a: number, l: number) => c.G(a, l);
  // market kiosks along the station side of the plaza
  const awnings = [0xe4572e, 0xf3a712, 0x29a19c, 0x6c5ce7, 0xe84393, 0x00b894];
  awnings.forEach((col, k) => {
    const a = 1 + k * 3.8;
    const l = 15.5;
    const g = G(a, l);
    c.add(mats.timber, new BoxGeometry(2.2, 1.1, 2.8), c.L(a, l, g + 0.55));
    c.add(vc, lit(paint(new BoxGeometry(2.8, 0.12, 3.4), col), 0.55), c.L(a, l + 0.3, g + 2.7), [0, 0, 0.18 * Math.sign(c.L(0, 1, 0)[0] || 1)]);
    for (const s of [-1.2, 1.2]) c.add(mats.post, new BoxGeometry(0.08, 2.6, 0.08), c.L(a + s * 1.1, l + 1.3, g + 1.3));
    c.add(lamps, paint(new BoxGeometry(0.06, 0.06, 2.4), 0xffd7a0), c.L(a, l + 1.3, g + 2.4));
  });
  // café tables under umbrellas
  for (let k = 0; k < 10; k++) {
    const a = 2 + (k % 5) * 4.2;
    const l = 25 + Math.floor(k / 5) * 4.5;
    const g = G(a, l);
    c.add(mats.post, new CylinderGeometry(0.5, 0.5, 0.06, 12), c.L(a, l, g + 0.8));
    c.add(mats.post, new CylinderGeometry(0.05, 0.05, 2.4, 6), c.L(a, l, g + 1.2));
    c.add(vc, lit(paint(new ConeGeometry(1.4, 0.5, 10), 0xf4efe6), 0.35), c.L(a, l, g + 2.5));
    for (const s of [-0.8, 0.8]) c.add(mats.timber, new BoxGeometry(0.4, 0.45, 0.4), c.L(a + s, l, g + 0.22));
  }
  // a fountain: a shallow round pool and jets that leap in turn
  const fa = -2;
  const fl = 30;
  const fg = G(fa, fl);
  c.add(mats.planter, new CylinderGeometry(3.2, 3.4, 0.5, 24), c.L(fa, fl, fg + 0.25));
  c.add(c.world.mats.water, new CylinderGeometry(2.9, 2.9, 0.05, 24), c.L(fa, fl, fg + 0.45));
  const jetMat = new MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7, roughness: 0.1, emissive: 0x88c8ff, emissiveIntensity: 0.3 });
  const jets = new InstancedMesh(new CylinderGeometry(0.06, 0.14, 1, 6).translate(0, 0.5, 0), jetMat, 6);
  const jetAt = Array.from({ length: 6 }, (_, k) => {
    const th = (k / 6) * Math.PI * 2;
    return new Vector3(...c.L(fa + Math.cos(th) * 1.7, fl + Math.sin(th) * 1.7, fg + 0.45));
  });
  c.group.add(jets);
  const jm = new Matrix4();
  const jq = new Quaternion();
  const js = new Vector3();
  // the bike-share dock: a row of bikes at their posts
  for (let k = 0; k < 8; k++) {
    const a = -4 + k * 1.1;
    const l = 33.5;
    const g = G(a, l);
    c.add(mats.post, new BoxGeometry(0.12, 0.9, 0.12), c.L(a, l - 0.6, g + 0.45));
    c.add(vc, paint(new BoxGeometry(0.12, 0.5, 1.4), 0x2f9e44), c.L(a, l, g + 0.6));
    for (const s of [-0.55, 0.55]) c.add(mats.trim, new TorusGeometry(0.32, 0.05, 6, 12).rotateY(Math.PI / 2), c.L(a, l + s, g + 0.35));
  }
  // the departures board for all four lines, facing the plaza, lit
  const fonts = fontOf();
  const board = canvasTex(1024, 512, (g) => {
    g.fillStyle = "#0b0f18";
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#f2e6c9";
    g.font = `600 52px ${fonts.sans}`;
    g.fillText("Departures · Waterfront", 40, 80);
    const rows: [string, string, string, string][] = [
      ["#a78bfa", "Expo Line", "Patterson", "2 min"],
      ["#1fb5c9", "Canada Line", "YVR–Airport · Richmond", "4 min"],
      ["#9b59d0", "West Coast Express", "Mission City", "17:25"],
      ["#4dabf7", "SeaBus", "Lonsdale Quay", "6 min"],
    ];
    rows.forEach(([col, line, to, when], k) => {
      const y = 170 + k * 88;
      g.fillStyle = col;
      g.fillRect(40, y - 40, 16, 52);
      g.fillStyle = "#ffffff";
      g.font = `500 40px ${fonts.sans}`;
      g.fillText(line, 76, y);
      g.fillStyle = "#b9bcc4";
      g.font = `400 34px ${fonts.sans}`;
      g.fillText(to, 470, y);
      g.fillStyle = "#ffb547";
      g.font = `500 38px ${fonts.mono}`;
      g.textAlign = "right";
      g.fillText(when, 984, y);
      g.textAlign = "left";
    });
  });
  const bg = G(-2, 16);
  c.add(mats.post, new BoxGeometry(0.2, 4.4, 0.2), c.L(-4.5, 16, bg + 2.2));
  c.add(mats.post, new BoxGeometry(0.2, 4.4, 0.2), c.L(0.5, 16, bg + 2.2));
  // both faces in one mesh
  const faces = [Math.PI / 2, -Math.PI / 2].map((ry) =>
    new PlaneGeometry(5.4, 2.7).rotateY(ry).translate(...c.L(-2, 16 + (ry > 0 ? 0.08 : -0.08), bg + 3.7)),
  );
  c.group.add(new Mesh(mergeGeometries(faces, false), new MeshBasicMaterial({ map: board, toneMapped: false })));
  for (const f of faces) f.dispose();
  return (t) => {
    jetAt.forEach((p, k) => {
      const v = Math.max(0, Math.sin(t * 2.2 - k * 1.05));
      jets.setMatrixAt(k, jm.compose(p, jq, js.set(1, 0.2 + 2.6 * v, 1)));
    });
    jets.instanceMatrix.needsUpdate = true;
  };
}

function depart(c: Ctx): Partial<BuiltSet> {
  // the hub's own parts share one painted material and one for what glows
  const vc = shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), c.world);
  const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  // the plaza: stone laid on the ground right up to the Canada Line's hall, its planters down the middle
  paveSquare(c, vc, -24, 24, 14, 44, (a, l, i, j) => {
    if (a > HALL.a0 - 1 && a < HALL.a1 + 1 && l > HALL.l0 - 1 && l < HALL.l1 + 1) return null;
    return i % 5 === 0 || j % 5 === 0 ? 0xbdb6a9 : (i + j) % 2 ? 0xd3ccbf : 0xcac3b6;
  });
  plaza(c, -24, 24, 14, 44, (a, l) => a > HALL.a0 - 3 && a < HALL.a1 + 3 && l > HALL.l0 - 3 && l < HALL.l1 + 3);
  const hall = canadaLineHall(c, vc, glow);
  const busy = busyPlaza(c, vc, glow);
  const top = Math.max(1.4, c.G(0, 24) + 0.5);
  // the restored CPR station: a beaux-arts block in buff stone, arched windows below and square ones above, a
  // colonnade with an entablature and pediment facing the line, a copper-roofed attic; its windows light at dusk
  const l = 36;
  const g = Math.min(c.G(10, l), c.G(10, l + 10), c.G(-1, l + 5), c.G(21, l + 5)) - 0.4;
  const h = top + 6.5 - g;
  const facade = stationTextures();
  const stoneWall = new MeshStandardMaterial({ map: facade.map, emissiveMap: facade.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
  const ring: P2[] = [
    [-1, l],
    [21, l],
    [21, l + 10],
    [-1, l + 10],
  ].map(([a, ll]) => {
    const [x, , z] = c.L(a, ll, 0);
    return [x, z] as P2;
  });
  c.add(stoneWall, walls(ring, g, g + h, { uPer: 6, vPer: h }));
  const stone = new MeshStandardMaterial({ color: 0xd9ccb3, roughness: 0.85 });
  c.add(stone, cap(ring, g + h));
  // the colonnade and its entablature, a step out from the wall
  for (let k = 0; k <= 9; k++) c.add(stone, new CylinderGeometry(0.4, 0.48, h * 0.74, 12), c.L(k * 2.2, l - 1.6, g + (h * 0.74) / 2));
  c.add(stone, new BoxGeometry(2.4, 1.1, 22.4), c.L(10, l - 1.4, g + h * 0.74 + 0.55));
  c.add(stone, new BoxGeometry(2.8, 0.5, 22.8), c.L(10, l - 0.2, g + h + 0.1));
  // the pediment over the centre bays: a low triangular prism
  // (a 3-sided cylinder turned so its axis runs back into the wall and one edge points up)
  c.add(stone, new CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), c.L(10, l - 1.4, g + h * 0.74 + 1.9), [0, 0, 0], [2.2, 1.6, 5.8]);
  // the attic with its copper hip roof
  c.add(stone, new BoxGeometry(6, 2.2, 12), c.L(10, l + 5, g + h + 1.1));
  c.add(new MeshStandardMaterial({ color: 0x5f9c86, roughness: 0.6 }), new ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), c.L(10, l + 5, g + h + 3.2), [0, 0, 0], [4.8, 2, 9.2]);
  stationGlow = stoneWall;
  // the light-line map of the ten stops, floating over the terrace
  const lineMat = glowMat(0xa78bfa, 2.2);
  c.add(lineMat, new BoxGeometry(0.12, 0.12, 30), c.L(0, 22, top + 7));
  // two slim masts hold the light line over the plaza
  for (const a of [-15, 15]) {
    const g0 = c.G(a, 22);
    c.add(c.world.mats.girder, new CylinderGeometry(0.12, 0.16, top + 7 - g0, 8), c.L(a, 22, (top + 7 + g0) / 2));
  }
  const anchors: Vector3[] = [new Vector3(...c.L(10, l, g + h + 2.2))];
  for (let k = 0; k < stations.length; k++) {
    const a = -15 + (30 * k) / (stations.length - 1);
    c.add(k === 0 ? glowMat(0xffffff, 2.4) : lineMat, new SphereGeometry(k === 0 ? 0.55 : 0.38, 14, 10), c.L(a, 22, top + 7));
  }
  anchors.push(new Vector3(...c.L(-15, 22, top + 7.8)), new Vector3(...c.L(15, 22, top + 7.8)));
  // from the city side, over the station and the plaza to the harbour, the loop over the water and the North Shore
  const lit = stationGlow;
  const city = c.world.buildings.solid;
  return {
    anchors,
    focus: new Vector3(...c.L(0, 16, top + 4)),
    update: (t) => {
      // the station's windows light with the city's
      if (lit) lit.emissiveIntensity = city.emissiveIntensity * 0.6;
      hall(t);
      busy(t);
    },
  };
}

export type StandTree = { a: number; l: number; h: number; sp: Conifer; base?: number; crownFrom?: number };

/**
 * A stand of conifers in three dimensions, for the trees a view comes close to (trees/conifer.ts describes them). One
 * merged bark mesh per bark, one instanced mesh of sprays per species, sharing the forest's snow so they whiten with it.
 */
function stand(c: Ctx, trees: StandTree[]): void {
  const barks = new Map<Conifer, MeshStandardMaterial>();
  const barkOf = (sp: Conifer) => {
    const key: Conifer = sp === "cedar" ? "cedar" : "fir";
    let m = barks.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ map: barkTexture(key), roughness: 1 });
      barks.set(key, m);
    }
    return m;
  };
  const sprays = new Map<Conifer, Matrix4[]>();
  const card = sprayCard();
  const m4 = new Matrix4();
  for (const t of trees) {
    const base = t.base ?? c.G(t.a, t.l);
    const [cx, , cz] = c.L(t.a, t.l, 0);
    const sk = coniferSkeleton(t.sp, t.h, (t.crownFrom ?? base + crownFromOf(t.sp, t.h)) - base, c.lowEnd ? DETAIL_LOW : DETAIL_FULL, t.a * 1.7 + t.l);
    const bark = barkOf(t.sp);
    c.add(bark, trunkGeometry(sk, c.lowEnd ? 10 : 14), [cx, base - 0.3, cz]);
    c.add(bark, limbGeometry(sk, 4), [cx, base, cz]);
    const list = sprays.get(t.sp) ?? [];
    sprays.set(t.sp, list);
    const at = new Matrix4().makeTranslation(cx, base, cz);
    for (const sp of sk.sprays) list.push(at.clone().multiply(sprayMatrix(sp, m4)));
  }
  for (const [sp, list] of sprays) {
    const mat = new MeshStandardMaterial({ map: frondTexture(sp), alphaTest: 0.45, side: DoubleSide, roughness: 0.9 });
    // snow settles on the upper faces of the sprays as it does on the forest
    const snow = c.world.trees.uniforms.uSnow;
    mat.onBeforeCompile = (shd) => {
      shd.uniforms.uSnow = snow;
      shd.fragmentShader = shd.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uSnow;")
        .replace(
          "#include <normal_fragment_maps>",
          "#include <normal_fragment_maps>\nfloat snowUp = dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );\ndiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.92, 0.94, 0.97 ), uSnow * smoothstep( 0.35, 0.85, snowUp ) );",
        );
    };
    const inst = new InstancedMesh(card, mat, list.length);
    list.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = !c.lowEnd;
    inst.receiveShadow = true;
    c.group.add(inst);
  }
}

/** The atrium's western red cedar, through the oculus. */
function cedar(c: Ctx, a: number, l: number, base: number, height: number, crownFrom: number): void {
  stand(c, [{ a, l, h: height, sp: "cedar", base, crownFrom }]);
}

/**
 * For Bright Nights, Vancouver's Christmas lights, the atrium's cedar is the city's Christmas tree: strings of lights
 * wound up its crown (twinkling, and bright after dark), baubles on its boughs and a star on top. Fitted to the crown
 * stand() grows (the same skeleton), so nothing floats off it or sinks into it. Returns the per-frame update.
 */
function christmasTree(c: Ctx, a: number, l: number, base: number, height: number, crownFrom: number): (t: number) => void {
  const sk = coniferSkeleton("cedar", height, crownFrom - base, c.lowEnd ? DETAIL_LOW : DETAIL_FULL, a * 1.7 + l);
  // the crown's outline: the farthest spray tip from the trunk in each band of height, the bands between filled in
  const BANDS = 32;
  const out = new Array<number>(BANDS).fill(0);
  const m4 = new Matrix4();
  const tip = new Vector3();
  for (const sp of sk.sprays) {
    tip.set(1, 0, 0).applyMatrix4(sprayMatrix(sp, m4));
    const k = Math.min(BANDS - 1, Math.max(0, Math.floor((tip.y / height) * BANDS)));
    out[k] = Math.max(out[k], Math.hypot(tip.x, tip.z));
  }
  const y0 = crownFrom - base;
  const radius = (y: number) => {
    const f = Math.min(BANDS - 1.001, Math.max(0, (y / height) * BANDS - 0.5));
    const k = Math.floor(f);
    // a band no spray reached takes the cone between its neighbours
    const r0 = out[k] || out[Math.max(0, k - 1)] || 0;
    const r1 = out[k + 1] || r0;
    return r0 + (r1 - r0) * (f - k);
  };
  const [cx, , cz] = c.L(a, l, 0);
  const deco = new Group();
  deco.visible = false;
  c.group.add(deco);
  // two strings wound up the crown, half a turn apart, one twinkling against the other
  const RED = 0xe03131;
  const GREEN = 0x2f9e44;
  const WARM = 0xfff1d6;
  const GOLD = 0xffc94a;
  const strings: PointsMaterial[] = [];
  const col = new Color();
  for (const phase of [0, Math.PI]) {
    const pos: number[] = [];
    const cols: number[] = [];
    const turns = 9;
    const top = height - 1.2;
    for (let u = 0; u <= 1; u += c.lowEnd ? 0.0025 : 0.0014) {
      const y = y0 + (top - y0) * u;
      const th = phase + u * turns * Math.PI * 2;
      const r = radius(y) * 0.92 + 0.25;
      pos.push(cx + Math.cos(th) * r, base + y, cz + Math.sin(th) * r);
      col.setHex([WARM, RED, WARM, GREEN, WARM, GOLD][pos.length % 6]);
      cols.push(col.r, col.g, col.b);
    }
    const g = new BG();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new Float32BufferAttribute(cols, 3));
    const mat = new PointsMaterial({ size: 0.85, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending });
    strings.push(mat);
    deco.add(new Points(g, mat));
  }
  // baubles hung on the outside of the boughs: red, gold and silver
  const baubles: [Material, Part[]][] = [
    [new MeshStandardMaterial({ color: 0xc81e2a, roughness: 0.25, metalness: 0.5, emissive: 0x3a0508, envMap: c.world.envTex }), []],
    [new MeshStandardMaterial({ color: 0xe0b040, roughness: 0.2, metalness: 0.85, emissive: 0x2a1c04, envMap: c.world.envTex }), []],
    [new MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.15, metalness: 0.9, envMap: c.world.envTex }), []],
  ];
  const ball = new SphereGeometry(1, 12, 8);
  const N = c.lowEnd ? 45 : 80;
  for (let k = 0; k < N; k++) {
    // spread over the crown's surface: more round the wide lower boughs
    const u = 1 - Math.sqrt((k + 0.5) / N);
    const y = y0 + 0.8 + (height - y0 - 3) * u;
    const th = k * 2.39996;
    const r = radius(y) * 0.88;
    const s = 0.32 + ((k * 7) % 5) * 0.05;
    baubles[k % 3][1].push({ geo: ball.clone().scale(s, s, s), position: [cx + Math.cos(th) * r, base + y - 0.25, cz + Math.sin(th) * r] });
  }
  ball.dispose();
  for (const [mat, parts] of baubles) deco.add(new Mesh(merged(parts), mat));
  // the star on top: two five-pointed stars crossed, so it reads from every side, glowing gold
  const star = new Shape();
  for (let k = 0; k <= 10; k++) {
    const th = Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? 0.55 : 1.4;
    if (k === 0) star.moveTo(Math.cos(th) * r, Math.sin(th) * r);
    else star.lineTo(Math.cos(th) * r, Math.sin(th) * r);
  }
  const starGeo = new ExtrudeGeometry(star, { depth: 0.25, bevelEnabled: false }).translate(0, 0, -0.125);
  const starMat = new MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffc23a, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.3 });
  for (const ry of [0, Math.PI / 2]) {
    const m = new Mesh(starGeo, starMat);
    m.position.set(cx, base + height + 1.1, cz);
    m.rotation.y = ry;
    deco.add(m);
  }
  const city = c.world.buildings.solid;
  return (t) => {
    deco.visible = useTrain.getState().event === "brightnights";
    if (!deco.visible) return;
    // the strings bright after dark, softer by day; the two take turns twinkling
    const night = Math.min(1, city.emissiveIntensity * 1.2);
    strings.forEach((m, i) => (m.opacity = (0.35 + 0.65 * night) * (0.55 + 0.45 * Math.sin(t * 2.2 + i * Math.PI))));
    starMat.emissiveIntensity = 1 + 1.4 * night;
  };
}

// ------------------------------------------------------------------ 01 About · Burrard: the cedar atrium
function about(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  // the line bends back past the cedar toward Granville: it stands as near its spot as the guideway allows, and the
  // canopy reaches out over the track, high enough for the trains to run under it
  let L0 = 28;
  while (L0 > 19 && trackClear(c, 0, L0) < 10) L0 -= 0.5;
  const g = c.G(0, L0);
  // a mass-timber canopy with an oculus the cedar grows through, on columns that keep off the guideway
  const deckY = Math.max(g + 9, 1.4 + 7);
  cedar(c, 0, L0, g, 36, deckY + 0.9);
  const dress = christmasTree(c, 0, L0, g, 36, deckY + 0.9);
  const annulus = (r0: number, r1: number, h: number) =>
    new LatheGeometry([new Vector2(r0, 0), new Vector2(r1, 0), new Vector2(r1, h), new Vector2(r0, h), new Vector2(r0, 0)], 40);
  c.add(mats.timber, annulus(3.2, 10, 0.6), c.L(0, L0, deckY - 0.6));
  c.add(mats.roofGreen, annulus(3.4, 9.7, 0.3), c.L(0, L0, deckY));
  // up to four columns on a ring under the deck, each the clear spot nearest a diagonal
  const ring = Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI * 2).filter((th) => trackClear(c, Math.cos(th) * 7.5, L0 + Math.sin(th) * 7.5) > 9);
  const posts: [number, number][] = [];
  for (const want of [0.25, 0.75, 1.25, 1.75].map((q) => q * Math.PI)) {
    const best = ring.reduce<number | null>((b, th) => (b === null || Math.abs(Math.sin((th - want) / 2)) < Math.abs(Math.sin((b - want) / 2)) ? th : b), null);
    if (best === null) break;
    ring.splice(ring.indexOf(best), 1);
    posts.push([Math.cos(best) * 7.5, L0 + Math.sin(best) * 7.5]);
  }
  legs(c, mats.timber, posts, deckY);
  // a moss wall behind, where the track leaves room
  if ([-9, 0, 9].every((a) => trackClear(c, a, L0 + 11) > 9)) c.add(new MeshStandardMaterial({ color: 0x4d6b35, roughness: 1 }), new BoxGeometry(1, 7, 18), c.L(0, L0 + 11, g + 3.5));
  // the Harbour Market round it
  harbourMarket(c, L0, posts);
  return {
    focus: new Vector3(...c.L(0, L0 - 6, deckY + 6)),
    update: dress,
  };
}

/**
 * The Harbour Market, from the harbour's edge round the cedar's canopy to the line's far side (sets/squares.ts):
 * - paving over it all;
 * - the pavilions, stalls, food trucks, fountain and stage of its layout;
 * - café tables under the canopy round the cedar;
 * - festoons strung between the canopy's columns and over the stalls by the water.
 */
function harbourMarket(c: Ctx, L0: number, posts: [number, number][]): void {
  const sq = SQUARES.find((s) => s.i === 1) as Square;
  const vc = shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), c.world);
  const kit = squareKit(c, sq, vc);
  const d = SET_RECT[0] as [number, number, number, number];
  paveSquare(c, vc, -22, 34, 8, 60, (a, l, i, j) => {
    const [x, z] = fromStation(1, a, l);
    if (sdfAt(x, z) < 0.6 || inLandmark(x, z, 1.5)) return null;
    // the Waterfront set paves its own
    const [da, dl] = toStation(0, x, z);
    if (da > d[0] && da < d[1] && dl > d[2] && dl < d[3]) return null;
    return i % 4 === 0 || j % 4 === 0 ? 0xb9b2a5 : (i + j) % 2 ? 0xd6d0c4 : 0xccc5b7;
  });
  // café tables under the canopy, round the cedar, each with two chairs
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2 + 0.2;
    const a = Math.cos(th) * 5.4;
    const l = L0 + Math.sin(th) * 5.4;
    if (trackClear(c, a, l) < 4.5) continue;
    const out: Pieces = { solid: [], glass: [], warm: [] };
    out.solid.push(
      paint(new CylinderGeometry(0.45, 0.45, 0.06, 8).translate(0, 0.78, 0), 0xf2efe9),
      paint(new CylinderGeometry(0.05, 0.05, 0.76, 4).translate(0, 0.38, 0), 0x2b2f36),
      paint(new BoxGeometry(0.4, 0.45, 0.4).translate(0, 0.22, 0.75), 0xa98260),
      paint(new BoxGeometry(0.4, 0.45, 0.4).translate(0, 0.22, -0.75), 0xa98260),
    );
    kit.put(out, a, l, [Math.cos(th), Math.sin(th)]);
  }
  // festoons from column to column under the canopy, and zigzag over the stalls by the water
  if (posts.length > 2) festoons(c, vc, kit.lit, [...posts, posts[0]], 4.8);
  festoons(c, vc, kit.lit, [
    [-17.5, 35.5],
    [-14.5, 41],
    [-11, 37.5],
    [-7.5, 42],
  ]);
  festoons(c, vc, kit.lit, [
    [10, 50],
    [12, 56.6],
    [15.5, 52.6],
    [19.5, 58],
  ]);
}

// ------------------------------------------------------------------ 02 Experience · Granville: a portal over the line for each role, stone to light
function experience(c: Ctx, world: World): Partial<BuiltSet> {
  // built in world space so each portal stands square to the track where it is
  const f = makeFrame();
  const s0 = stationS[c.i];
  const fonts = fontOf();
  // oldest role first along the direction of travel (the role list runs newest first), each lintel its start year,
  // spread over the same 40 units of line whatever their number
  const n = roles.length;
  const years = roles.map((r) => r.period.slice(0, 4)).reverse();
  const order = years.map((_, k) => n - 1 - k);
  const gap = n > 1 ? 40 / (n - 1) : 0;
  const mats: Material[] = [
    new MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.95 }),
    new MeshStandardMaterial({ color: 0x9c4a36, roughness: 0.85 }),
    new MeshStandardMaterial({ color: 0x4a5160, metalness: 0.7, roughness: 0.35, envMap: world.envTex, envMapIntensity: 0.6 }),
    world.mats.pane,
    glowMat(0xa78bfa, 2),
  ];
  const anchors: Vector3[] = new Array(n);
  const parts: Map<Material, Part[]> = new Map();
  const push = (m: Material, p: Part) => {
    const list = parts.get(m);
    if (list) list.push(p);
    else parts.set(m, [p]);
  };
  const plaques: Mesh[] = [];
  for (let k = 0; k < n; k++) {
    frameAt(s0 + 22 + k * gap, f);
    const yaw = Math.atan2(f.t.x, f.t.z);
    const base = f.p.clone();
    // stone for the oldest, light for the newest, the rest in between
    const m = mats[n > 1 ? Math.round((k * (mats.length - 1)) / (n - 1)) : mats.length - 1];
    const at = (lat: number, up: number): V3 => {
      const p = base.clone().addScaledVector(f.r, lat).addScaledVector(UP, up);
      return [p.x, p.y, p.z];
    };
    for (const sd of [-1, 1]) {
      const gy = groundAt(base.x + f.r.x * sd * 9, base.z + f.r.z * sd * 9);
      const h = base.y + 10 - gy;
      const p = base.clone().addScaledVector(f.r, sd * 9);
      push(m, { geo: new BoxGeometry(1.1, h, 1.1), position: [p.x, gy + h / 2, p.z], rotation: [0, yaw, 0] });
    }
    push(m, { geo: new BoxGeometry(19.2, 1.2, 1.3), position: at(0, 10.4), rotation: [0, yaw, 0] });
    // the year, lit, on the lintel
    const tex = canvasTex(256, 96, (g) => {
      g.fillStyle = "#0b0f18";
      g.fillRect(0, 0, 256, 96);
      g.fillStyle = k === n - 1 ? "#c4b5fd" : "#f2e6c9";
      g.font = `400 64px ${fonts.serif}`;
      g.textAlign = "center";
      g.fillText(years[k], 128, 70);
    });
    // one plaque on each face of the lintel, so the year reads from either direction
    for (const turn of [0, Math.PI]) {
      const plaque = new Mesh(new PlaneGeometry(3.2, 1.2), new MeshBasicMaterial({ map: tex, toneMapped: false }));
      plaque.position.set(...at(0, 10.4));
      plaque.rotation.set(0, yaw + turn, 0);
      plaque.translateZ(0.7);
      plaques.push(plaque);
    }
    anchors[order[k]] = new Vector3(...at(0, 12.2));
  }
  const g = new Group();
  for (const [m, list] of parts) g.add(new Mesh(merged(list), m));
  for (const p of plaques) g.add(p);
  // built in world space: buildSets leaves this set's group untransformed
  c.group.add(g);
  return {
    anchors,
    focus: anchors[order[n >> 1]].clone().setY(anchors[order[n >> 1]].y - 6),
  };
}

/**
 * A departures screen for a stop: the Expo Line badge, the stop and the clock, then the next trains each way counting
 * down (a train every six minutes in each direction, a minute every 20 s of ride time). Redrawn only when it changes.
 */
function trainBoard(stop: string): { tex: CanvasTexture; tick: (t: number) => void } {
  const W = 1024;
  const H = 500;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const fonts = fontOf();
  const amber = "#ffb547";
  const grey = "#7b8494";
  let last = "";
  const tick = (t: number) => {
    if (!g) return;
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const step = Math.floor(t / 20);
    const west = (((2 - step) % 6) + 6) % 6;
    const east = (((4 - step) % 6) + 6) % 6;
    const rows: [string, number][] = [
      ["Waterfront", west],
      ["Patterson", east],
      ["Waterfront", west + 6],
      ["Patterson", east + 6],
    ];
    rows.sort((x, y) => x[1] - y[1]);
    const key = clock + rows.map((r) => r.join()).join("|");
    if (key === last) return;
    last = key;
    g.fillStyle = "#04060b";
    g.fillRect(0, 0, W, H);
    // the header: line badge, stop, clock
    g.fillStyle = "#1f5fd0";
    g.beginPath();
    g.roundRect(36, 30, 150, 58, 10);
    g.fill();
    g.fillStyle = "#ffffff";
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.font = `700 36px ${fonts.mono}`;
    g.fillText("EXPO", 111, 60);
    g.textAlign = "left";
    g.font = `600 44px ${fonts.sans}`;
    g.fillText(stop, 212, 60, 560);
    g.textAlign = "right";
    g.fillStyle = amber;
    g.font = `600 50px ${fonts.mono}`;
    g.fillText(clock, W - 40, 60);
    g.fillStyle = "#1d2533";
    g.fillRect(36, 118, W - 72, 3);
    g.fillStyle = grey;
    g.font = `500 26px ${fonts.mono}`;
    g.textAlign = "left";
    g.fillText("NEXT TRAINS TO", 40, 160);
    g.textAlign = "right";
    g.fillText("DUE", W - 40, 160);
    rows.forEach(([dest, due], k) => {
      const y = 228 + k * 64;
      g.fillStyle = k === 0 ? "#ffd27a" : amber;
      g.font = `600 46px ${fonts.mono}`;
      g.textAlign = "left";
      g.fillText(dest, 40, y);
      g.textAlign = "right";
      g.fillText(due === 0 ? "Due" : `${due} min`, W - 40, y);
    });
    g.fillStyle = grey;
    g.font = `500 24px ${fonts.mono}`;
    g.textAlign = "left";
    g.fillText("4-car trains  ·  doors open on the right", 40, H - 26);
    tex.needsUpdate = true;
  };
  tick(0);
  return { tex, tick };
}

// ------------------------------------------------------------------ 03 Awdon · Stadium–Chinatown: meeting to sprint

/** A guard rail: a steel handrail, a mid rail and posts, from (a0, l0) to (a1, l1) along a floor at height y. */
function balustrade(c: Ctx, a0: number, l0: number, a1: number, l1: number, y: number): void {
  const { mats } = c.world;
  const zs = c.L(1, 0, 0)[2];
  const len = Math.hypot(a1 - a0, l1 - l0);
  if (len < 0.2) return;
  // local x runs along l, z along a × zs; a box's length turned onto the run
  const ry: V3 = [0, -Math.atan2((a1 - a0) * zs, l1 - l0), 0];
  const am = (a0 + a1) / 2;
  const lm = (l0 + l1) / 2;
  c.add(mats.girder, new BoxGeometry(len, 0.08, 0.12), c.L(am, lm, y + 1.1), ry);
  c.add(mats.girder, new BoxGeometry(len, 0.05, 0.06), c.L(am, lm, y + 0.6), ry);
  c.add(mats.girder, new BoxGeometry(len, 0.05, 0.06), c.L(am, lm, y + 0.2), ry);
  const n = Math.max(1, Math.round(len / 2));
  for (let k = 0; k <= n; k++) c.add(mats.girder, new BoxGeometry(0.08, 1.1, 0.08), c.L(a0 + ((a1 - a0) * k) / n, l0 + ((l1 - l0) * k) / n, y + 0.55));
}

/**
 * The sprint board: what the meeting decided, as cards in three columns (to do, doing, approved by the PM, in green),
 * under the meeting's name.
 */
/** Where the sprint board's canvas keeps a warm white corner, for the terrace's lamps (u, v). */
const LAMP_UV: [number, number] = [1012 / 1024, 1 - 500 / 512];

function sprintBoard(): CanvasTexture {
  const fonts = fontOf();
  return canvasTex(1024, 512, (g) => {
    g.fillStyle = "#121826";
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#ffe2b0";
    g.fillRect(1000, 488, 24, 24);
    g.fillStyle = "#f6efe2";
    g.font = `600 34px ${fonts.sans}`;
    g.textBaseline = "middle";
    g.fillText("Sprint 14 · from Monday's client meeting", 36, 42);
    g.fillStyle = "#a78bfa";
    g.fillRect(36, 70, 952, 4);
    const cols: [string, string, string[]][] = [
      ["To do", "#7dd3fc", ["Draft minutes", "Email the client", "Timesheet, week 42"]],
      ["Doing", "#f9a8d4", ["Update the Jira board", "Status report"]],
      ["Approved", "#34d399", ["Scope change", "Sprint goal", "Risk log"]],
    ];
    cols.forEach(([head, col, cards], k) => {
      const x = 36 + k * 322;
      g.fillStyle = col;
      g.font = `600 28px ${fonts.sans}`;
      g.fillText(head, x, 108);
      cards.forEach((t, j) => {
        const y = 140 + j * 116;
        g.fillStyle = k === 2 ? "#123d2f" : "#1d2638";
        g.fillRect(x, y, 300, 98);
        g.fillStyle = col;
        g.fillRect(x, y, 8, 98);
        g.fillStyle = "#f6efe2";
        g.font = `500 26px ${fonts.sans}`;
        g.fillText(t, x + 24, y + 34, 260);
        g.fillStyle = "rgba(246,239,226,0.35)";
        g.fillRect(x + 24, y + 62, 150 + ((j * 53 + k * 31) % 90), 8);
        if (k === 2) {
          g.fillStyle = col;
          g.font = `700 30px ${fonts.sans}`;
          g.fillText("✓", x + 262, y + 34);
        }
      });
    });
  });
}

/**
 * A roof garden at platform level over Chinatown's night market, reached across a bridge from the platform: a glass
 * meeting room under a planted roof, a long table inside; its transcripts flowing as ribbons to the sprint board they
 * become; the arrivals board where the bridge lands; trees, café tables and benches; a glass balustrade all round.
 */
function awdon(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  // the garden's plain colours share the set's one painted material (a textured one would be a mesh, a draw, each)
  const plain = (color: number) => new MeshStandardMaterial({ color, roughness: 0.8 });
  const GREEN = plain(0x5f8f3e);
  const WOOD = plain(0x9a7048);
  const POST = plain(0x3a3f46);
  const STONE = plain(0x9c958a);
  const A0 = -16;
  const A1 = 16;
  const LI = 14;
  const LO = 30;
  const top = terrace(c, A0, A1, LI, LO);
  const L0 = 22;
  // the balustrade round the open edges, open where the bridge from the platform lands (a ±2.5), and along the bridge
  const e = 0.15;
  balustrade(c, A0 + e, LI + e, -2.8, LI + e, top);
  balustrade(c, 2.8, LI + e, A1 - e, LI + e, top);
  balustrade(c, A1 - e, LI + e, A1 - e, LO - e, top);
  balustrade(c, A1 - e, LO - e, A0 + e, LO - e, top);
  balustrade(c, A0 + e, LO - e, A0 + e, LI + e, top);
  for (const s of [-1, 1]) balustrade(c, s * 2.6, 11.5, s * 2.6, LI + e, Math.min(top, 1.4));
  // the meeting room: glass on slim dark mullions, a planted roof, a long table and eight chairs, a screen at its end
  const MA = -9;
  const MW = 8;
  const MD = 6;
  c.add(mats.pane, new BoxGeometry(MD, 3.2, MW), c.L(MA, L0, top + 1.6));
  for (const [da, dl] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    c.add(mats.girder, new BoxGeometry(0.14, 3.2, 0.14), c.L(MA + (da * MW) / 2, L0 + (dl * MD) / 2, top + 1.6));
  for (const da of [-2, 0, 2]) for (const dl of [-1, 1]) c.add(mats.girder, new BoxGeometry(0.08, 3.2, 0.08), c.L(MA + da, L0 + (dl * MD) / 2, top + 1.6));
  c.add(mats.canopy, new BoxGeometry(MD + 0.8, 0.3, MW + 0.8), c.L(MA, L0, top + 3.35));
  c.add(GREEN, new BoxGeometry(MD + 0.4, 0.16, MW + 0.4), c.L(MA, L0, top + 3.55));
  c.add(WOOD, new BoxGeometry(1.5, 0.08, 4.6), c.L(MA, L0, top + 0.78));
  for (const da of [-2, 2]) c.add(POST, new BoxGeometry(0.1, 0.74, 0.1), c.L(MA + da, L0, top + 0.39));
  const seats = [0xe8663a, 0x2a9d8f, 0xf2b632, 0x6c5ce7].map((color) => new MeshStandardMaterial({ color, roughness: 0.7 }));
  for (let k = 0; k < 8; k++) {
    const da = -1.8 + (k % 4) * 1.2;
    const dl = k < 4 ? -1.15 : 1.15;
    c.add(seats[k % 4], new BoxGeometry(0.5, 0.08, 0.5), c.L(MA + da, L0 + dl, top + 0.48));
    c.add(seats[k % 4], new BoxGeometry(0.06, 0.5, 0.5), c.L(MA + da, L0 + dl + (dl > 0 ? 0.25 : -0.25), top + 0.75));
  }
  c.add(POST, new BoxGeometry(1.6, 0.9, 0.06), c.L(MA - MW / 2 + 0.2, L0, top + 1.7), [0, Math.PI / 2, 0]);
  // three translucent transcript ribbons flowing out of the room to the sprint board
  const flow = canvasTex(256, 32, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 256, 32);
    for (let x = 0; x < 256; x += 10) {
      g.fillStyle = `rgba(255,255,255,${0.45 + ((x * 37) % 50) / 100})`;
      g.fillRect(x, 8 + ((x * 13) % 10), 3 + ((x * 7) % 6), 4);
    }
  }, true);
  flow.colorSpace = NoColorSpace;
  const ribbonMats = [0x7dd3fc, 0xa78bfa, 0xf9a8d4].map((col) => new MeshBasicMaterial({ color: col, map: flow, alphaMap: flow, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }));
  ribbonMats.forEach((m, k) => {
    const geo = ribbonGeo(c, [MA + MW / 2 + 0.2, L0 + (k - 1) * 1.6, top + 1.4 + k * 0.6], [8.9, L0 + (k - 1) * 1.8, top + 2.4 + k * 0.6], 0.7);
    c.group.add(new Mesh(geo, m));
  });
  // the sprint board: two-sided, lit, on two legs, facing back along the ribbons and out the far way
  const zs = c.L(1, 0, 0)[2];
  const bezel = new MeshStandardMaterial({ color: 0x15181d, roughness: 0.45, metalness: 0.5 });
  c.add(bezel, new BoxGeometry(0.42, 4.6, 9.2), c.L(9.5, L0, top + 3.7), [0, Math.PI / 2, 0]);
  for (const s of [-1, 1]) c.add(bezel, new BoxGeometry(0.3, 1.4, 0.3), c.L(9.5, L0 + s * 3.6, top + 0.7));
  // its two faces and the terrace's lamps in one mesh: the lamps take the board's warm corner (sprintBoard), so they are
  // lit as it is
  const boardTex = sprintBoard();
  const boardMat = new MeshBasicMaterial({ map: boardTex, toneMapped: false });
  const lit: Part[] = [];
  for (const face of [-1, 1]) {
    // a plane faces +z, and local z runs along the track as a × zs
    lit.push({ geo: new PlaneGeometry(8.8, 4.4), position: c.L(9.5 + face * 0.22, L0, top + 3.7), rotation: [0, face * zs > 0 ? 0 : Math.PI, 0] });
  }
  const lamp = (geo: BufferGeometry, pos: V3) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, LAMP_UV[0], LAMP_UV[1]);
    lit.push({ geo, position: pos });
  };
  // the meeting room's ceiling light, and lamps along the balustrade
  lamp(new BoxGeometry(1.2, 0.08, 3.6), c.L(MA, L0, top + 3.1));
  for (const [a0, l0] of [
    [-12, 15],
    [-6, 15],
    [8, 15],
    [13, 15],
    [-10, 29.2],
    [-3, 29.2],
    [4, 29.2],
    [11, 29.2],
  ])
    lamp(new CylinderGeometry(0.16, 0.16, 0.5, 8), c.L(a0, l0, top + 1.45));
  c.group.add(new Mesh(merged(lit), boardMat));
  // the arrivals board where the bridge lands, facing the people coming off the platform
  const board = trainBoard(stations[c.i].name);
  c.add(bezel, new BoxGeometry(0.3, 2.7, 5.2), c.L(5.2, 16.2, top + 2.6));
  for (const s of [-1, 1]) c.add(bezel, new BoxGeometry(0.2, 1.3, 0.2), c.L(5.2 + s * 2, 16.2, top + 0.65));
  const screenMat = new MeshBasicMaterial({ map: board.tex, toneMapped: false });
  c.group.add(new Mesh(merged([-1, 1].map((face) => ({ geo: new PlaneGeometry(4.9, 2.4), position: c.L(5.2, 16.2 + face * 0.17, top + 2.6), rotation: [0, (face * Math.PI) / 2, 0] }))), screenMat));
  // the garden: trees in planters at the corners, shrubs along the far rail, café tables between, benches facing out
  for (const [a, l] of [
    [-14.4, 15.6],
    [14.4, 15.6],
    [-14.4, 28.4],
    [14.4, 28.4],
    [0.5, 28.4],
  ]) {
    c.add(STONE, new BoxGeometry(2.2, 0.8, 2.2), c.L(a, l, top + 0.4));
    c.add(WOOD, new CylinderGeometry(0.12, 0.16, 2.4, 6), c.L(a, l, top + 1.6));
    c.add(GREEN, new IcosahedronGeometry(1.4, 1), c.L(a, l, top + 3.2), [0, 0, 0], [1, 0.85, 1]);
  }
  for (let a = -11; a <= 12; a += 3.2) {
    if (Math.abs(a - 0.5) < 2) continue;
    c.add(STONE, new BoxGeometry(2.4, 0.6, 0.9), c.L(a, 29.1, top + 0.3));
    c.add(GREEN, new SphereGeometry(0.75, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), c.L(a, 29.1, top + 0.6), [0, 0, 0], [1.4, 0.8, 0.6]);
  }
  for (const a of [-3.2, 0.8, 4.8]) {
    for (const l of [26.4]) {
      c.add(POST, new CylinderGeometry(0.5, 0.5, 0.06, 12), c.L(a, l, top + 0.8));
      c.add(POST, new CylinderGeometry(0.05, 0.05, 0.78, 6), c.L(a, l, top + 0.4));
      for (const s of [-0.8, 0.8]) c.add(WOOD, new BoxGeometry(0.4, 0.45, 0.4), c.L(a + s, l, top + 0.22));
    }
  }
  for (const a of [-12.5, 11.5]) {
    c.add(WOOD, new BoxGeometry(0.5, 0.1, 1.8), c.L(a, 26.8, top + 0.45), [0, Math.PI / 2, 0]);
    c.add(POST, new BoxGeometry(0.5, 0.42, 0.08), c.L(a, 26.4, top + 0.22), [0, Math.PI / 2, 0]);
  }
  return {
    anchors: [new Vector3(...c.L(MA, L0, top + 5.2)), new Vector3(...c.L(9.5, L0, top + 6.6)), new Vector3(...c.L(-1, L0 - 2, top + 3.6))],
    focus: new Vector3(...c.L(0, L0 - 4, top + 3)),
    update: (t) => {
      flow.offset.x = -t * 0.25;
      board.tick(t);
    },
  };
}

/** A curved ribbon between two local points, `w` wide, bowing upward. */
function ribbonGeo(c: Ctx, a: V3, b: V3, w: number): BufferGeometry {
  const n = 24;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const A = new Vector3(...c.L(a[0], a[1], a[2]));
  const B = new Vector3(...c.L(b[0], b[1], b[2]));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const p = A.clone().lerp(B, u).addScaledVector(UP, Math.sin(u * Math.PI) * 1.6);
    pos.push(p.x, p.y - w / 2, p.z, p.x, p.y + w / 2, p.z);
    uv.push(u * 3, 0, u * 3, 1);
    if (k < n) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
  }
  const g = new BG();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ 04 Planktoneer · Main Street: the water column
function planktoneer(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  // on the lawn in Creekside Park, between the station and the head of the basin (see zones.ts)
  const fr = STATION_FRAMES[c.i];
  const dx = MAIN_COLUMN[0] - fr.x;
  const dz = MAIN_COLUMN[1] - fr.z;
  const a = dx * fr.tx + dz * fr.tz;
  const l = (dx * fr.rx + dz * fr.rz) * c.side;
  const g = c.G(a, l);
  c.add(mats.concrete, new CylinderGeometry(4.6, 5.2, 1.2, 32), c.L(a, l, g + 0.6));
  c.add(mats.pane, new CylinderGeometry(3.2, 3.2, 16, 32, 1, true), c.L(a, l, g + 9.2));
  c.add(new MeshStandardMaterial({ color: 0x1d6fa3, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }), new CylinderGeometry(3.05, 3.05, 15.6, 32), c.L(a, l, g + 9.2));
  c.add(mats.girder, new TorusGeometry(3.25, 0.12, 6, 48), c.L(a, l, g + 17.2), [Math.PI / 2, 0, 0]);
  const amber = glowMat(0xf59e0b, 1.8);
  c.add(amber, new TorusGeometry(3.3, 0.09, 6, 48), c.L(a, l, g + 12.5), [Math.PI / 2, 0, 0]);
  const scan = new Mesh(new TorusGeometry(3.35, 0.07, 6, 48), glowMat(0x7dd3fc, 2.4));
  scan.rotation.x = Math.PI / 2;
  c.group.add(scan);
  // four species of plankton drifting in the column
  const N = c.lowEnd ? 160 : 360;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const seed = new Float32Array(N * 3);
  const cols = [0x86efac, 0xf472b6, 0xfde047, 0x93c5fd].map((h) => new Color(h));
  for (let k = 0; k < N; k++) {
    seed.set([Math.random() * Math.PI * 2, Math.random() * 2.7, Math.random()], k * 3);
    const cc = cols[k % 4];
    col.set([cc.r, cc.g, cc.b], k * 3);
  }
  const geo = new BG();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  const pts = new Points(geo, new PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
  pts.frustumCulled = false;
  c.group.add(pts);
  const centre = new Vector3(...c.L(a, l, g));
  const pa = geo.attributes.position as Float32BufferAttribute;
  return {
    anchors: [new Vector3(...c.L(a, l, g + 18.4)), new Vector3(...c.L(a, l - 3.6, g + 9)), new Vector3(...c.L(a, l + 4.8, g + 1.4))],
    focus: new Vector3(...c.L(a * 0.6, l * 0.6, g + 8)),
    update: (t) => {
      scan.position.copy(centre).setY(centre.y + 2 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 14);
      for (let k = 0; k < N; k++) {
        const ang = seed[k * 3] + t * (0.1 + seed[k * 3 + 2] * 0.15);
        const r = seed[k * 3 + 1];
        const y = 2 + ((seed[k * 3 + 2] * 14 + t * 0.25 * (0.5 + seed[k * 3 + 2])) % 14.5);
        pa.setXYZ(k, centre.x + Math.cos(ang) * r, centre.y + y, centre.z + Math.sin(ang) * r);
      }
      pa.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ 05 Vessel Vision · Commercial–Broadway: Coast Watch
/** A boat in the coast camera's frame (1024 × 256): its waterline's middle, length, kind and the detector's score. */
type FeedBoat = { x: number; y: number; len: number; kind: "ferry" | "freighter" | "sail" | "speed" | "skiff"; score: number };
/**
 * The camera's frame: a ferry, a freighter, a sailboat and a speedboat, and skiffs a few pixels long far out that only
 * the tiles find.
 */
const FEED_BOATS: FeedBoat[] = [
  { x: 214, y: 176, len: 88, kind: "ferry", score: 0.94 },
  { x: 318, y: 141, len: 14, kind: "skiff", score: 0.71 },
  { x: 462, y: 196, len: 40, kind: "sail", score: 0.88 },
  { x: 598, y: 138, len: 11, kind: "skiff", score: 0.64 },
  { x: 716, y: 182, len: 36, kind: "speed", score: 0.91 },
  { x: 872, y: 150, len: 112, kind: "freighter", score: 0.96 },
  { x: 968, y: 222, len: 20, kind: "skiff", score: 0.82 },
];
/** How tall each kind stands over its waterline, as a share of its length. */
const BOAT_H = { ferry: 0.42, freighter: 0.36, sail: 1.5, speed: 0.3, skiff: 0.45 } as const;
/**
 * The frame's bar along the top, and SAHI's tiles over the rest: six across and two down, each a fifth of the width and
 * 0.55 of the height, overlapping.
 */
const FEED_BAR = 24;
const TILE = { cols: 6, rows: 2, w: 1024 * 0.2, h: (256 - FEED_BAR) * 0.55, stepX: 1024 * 0.16, stepY: (256 - FEED_BAR) * 0.45 };
const tileBox = (k: number): [number, number, number, number] => {
  const x = (k % TILE.cols) * TILE.stepX;
  const y = FEED_BAR + Math.floor(k / TILE.cols) * TILE.stepY;
  return [x, y, x + TILE.w, y + TILE.h];
};
/** A boat's box in the frame (x0, y0, x1, y1), a little round it. */
const boatBox = (b: FeedBoat): [number, number, number, number] => [b.x - b.len / 2 - 3, b.y - b.len * BOAT_H[b.kind] - 3, b.x + b.len / 2 + 3, b.y + 4];

/**
 * The coast camera's frame, 1024 × 256, as the detector sees it: the inlet from the shore, the North Shore's ridges
 * over the far shore, the boats with their wakes, SAHI's tiles marked faintly over it, the camera's bar along the top.
 * By day in colour; after dark the same frame in thermal, false-coloured: the water coldest, the shore's rocks warm from
 * the day, every hull orange and every engine white hot.
 */
function coastFeed(thermal: boolean): CanvasTexture {
  const fonts = fontOf();
  const T = (day: string, heat: string) => (thermal ? heat : day);
  return canvasTex(1024, 256, (g) => {
    let grd = g.createLinearGradient(0, FEED_BAR, 0, 124);
    grd.addColorStop(0, T("#8fbfe0", "#1b0b33"));
    grd.addColorStop(1, T("#d8ebf4", "#33124f"));
    g.fillStyle = grd;
    g.fillRect(0, FEED_BAR, 1024, 110);
    const ridge = (base: number, amp: number, seed: number, fill: string) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(0, 132);
      for (let x = 0; x <= 1024; x += 16) g.lineTo(x, base - amp * (0.55 + 0.45 * Math.sin(x * 0.011 + seed) * Math.sin(x * 0.004 + seed * 2)));
      g.lineTo(1024, 132);
      g.closePath();
      g.fill();
    };
    ridge(100, 52, 1.3, T("#8ea3b6", "#4a1866"));
    ridge(118, 34, 4.1, T("#5f7a6c", "#6a1f6e"));
    g.fillStyle = T("#2f4a3a", "#93306a");
    g.fillRect(0, 120, 1024, 10);
    grd = g.createLinearGradient(0, 128, 0, 256);
    grd.addColorStop(0, T("#4f7f9c", "#1a0838"));
    grd.addColorStop(1, T("#24506e", "#0c0424"));
    g.fillStyle = grd;
    g.fillRect(0, 128, 1024, 128);
    // ripples, longer toward the camera
    g.strokeStyle = T("rgba(255,255,255,0.14)", "rgba(150,90,220,0.25)");
    g.lineWidth = 1;
    for (let k = 0; k < 80; k++) {
      const y = 132 + ((k * 37) % 124);
      const x = (k * 151) % 1024;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 8 + (y - 128) * 0.3, y);
      g.stroke();
    }
    // the near shore's rocks, bottom left
    g.fillStyle = T("#857d70", "#b8445a");
    g.beginPath();
    g.moveTo(0, 256);
    g.lineTo(0, 204);
    g.lineTo(44, 212);
    g.lineTo(96, 228);
    g.lineTo(150, 242);
    g.lineTo(186, 256);
    g.closePath();
    g.fill();
    // the boats, bows to the right: their wakes, then their hulls and what stands on them
    const hot = "#fff8d6";
    for (const b of FEED_BOATS) {
      const L = b.len;
      const x0 = b.x - L / 2;
      const y = b.y;
      if (b.kind !== "sail") {
        const trail = b.kind === "speed" ? L * 1.6 : L * 0.7;
        g.fillStyle = T("rgba(240,248,255,0.75)", "rgba(196,64,110,0.85)");
        g.beginPath();
        g.moveTo(x0 + 2, y - 1);
        g.lineTo(x0 - trail, y - 1 - L * 0.04);
        g.lineTo(x0 - trail, y + 2 + L * 0.06);
        g.closePath();
        g.fill();
      }
      const box = (fx: number, fy: number, fw: number, fh: number, day: string, heat: string) => {
        g.fillStyle = T(day, heat);
        g.fillRect(x0 + fx * L, y - fy * L, fw * L, fh * L);
      };
      if (b.kind === "ferry") {
        box(0, 0.12, 1, 0.12, "#f4f4f2", "#f08a24");
        box(0, 0.05, 1, 0.03, "#1d3a6b", "#e0662a");
        box(0.12, 0.26, 0.74, 0.14, "#f7f7f5", "#ffb43c");
        box(0.28, 0.38, 0.42, 0.12, "#f7f7f5", "#ffd04a");
        box(0.2, 0.22, 0.6, 0.03, "#2a3440", "#ffe27a");
        box(0.08, 0.1, 0.1, 0.06, "#f4f4f2", hot);
      } else if (b.kind === "freighter") {
        box(0, 0.1, 1, 0.1, "#7a1f1f", "#d9562e");
        const cols = ["#c0392b", "#2d6cb0", "#e0b020", "#2e8b57", "#d35400", "#7f8c8d"];
        for (let k = 0; k < 10; k++) for (let r = 0; r < 2; r++) box(0.06 + k * 0.068, 0.16 + r * 0.06, 0.062, 0.058, cols[(k * 3 + r) % cols.length], "#a83a6a");
        box(0.8, 0.34, 0.12, 0.24, "#f2f2f0", "#ffb43c");
        box(0.84, 0.4, 0.04, 0.06, "#2a2a2a", hot);
      } else if (b.kind === "sail") {
        box(0, 0.12, 1, 0.12, "#f4f4f2", "#f08a24");
        g.fillStyle = T("#3a3a3a", "#8a2a72");
        g.fillRect(b.x - 0.5, y - L * 1.46, 1.2, L * 1.34);
        g.fillStyle = T("#fbfbf8", "#5b1a74");
        g.beginPath();
        g.moveTo(b.x - 1, y - L * 1.4);
        g.lineTo(b.x - 1, y - L * 0.16);
        g.lineTo(b.x - L * 0.46, y - L * 0.16);
        g.closePath();
        g.fill();
        g.beginPath();
        g.moveTo(b.x + 1.5, y - L * 1.3);
        g.lineTo(b.x + L * 0.46, y - L * 0.16);
        g.lineTo(b.x + 1.5, y - L * 0.16);
        g.closePath();
        g.fill();
      } else if (b.kind === "speed") {
        box(0, 0.14, 0.86, 0.14, "#f6f6f4", "#ffb43c");
        g.beginPath();
        g.moveTo(x0 + L * 0.86, y - L * 0.14);
        g.lineTo(x0 + L, y - L * 0.1);
        g.lineTo(x0 + L * 0.86, y);
        g.closePath();
        g.fill();
        box(0.4, 0.26, 0.2, 0.12, "#22303c", "#ff8a2a");
        box(0, 0.12, 0.08, 0.08, "#f6f6f4", hot);
      } else {
        box(0, 0.2, 1, 0.2, "#5a4a3a", "#ffa035");
        box(0.55, 0.45, 0.2, 0.25, "#d9822b", hot);
      }
    }
    // SAHI's tiles, faint and dashed
    g.strokeStyle = "rgba(167,139,250,0.45)";
    g.lineWidth = 1.5;
    g.setLineDash([6, 5]);
    for (let k = 0; k < TILE.cols * TILE.rows; k++) {
      const [x0, y0, x1, y1] = tileBox(k);
      g.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    }
    g.setLineDash([]);
    // the camera's bar
    g.fillStyle = "#0b0f14";
    g.fillRect(0, 0, 1024, FEED_BAR);
    g.fillStyle = "#ff3b30";
    g.beginPath();
    g.arc(14, FEED_BAR / 2, 5, 0, Math.PI * 2);
    g.fill();
    g.font = `500 14px ${fonts.mono}`;
    g.textBaseline = "middle";
    g.fillStyle = "#e8ecef";
    g.textAlign = "left";
    g.fillText(`CAM 07 · BURRARD INLET · ${thermal ? "THERMAL" : "DAY"} · LIVE`, 26, FEED_BAR / 2 + 1);
    g.textAlign = "right";
    g.fillStyle = "#c4b5fd";
    g.fillText(`VESSEL VISION · YOLO + SAHI · ${FEED_BOATS.length} BOATS`, 1012, FEED_BAR / 2 + 1);
  });
}

/** The detector's boxes over the frame, each labelled with its score, on a clear ground (shown as each tile finds it). */
function detectionsTexture(): CanvasTexture {
  const fonts = fontOf();
  return canvasTex(1024, 256, (g) => {
    g.font = `600 11px ${fonts.mono}`;
    g.textBaseline = "alphabetic";
    for (const b of FEED_BOATS) {
      const [x0, y0, x1, y1] = boatBox(b);
      g.strokeStyle = "#3ee86a";
      g.lineWidth = 2.5;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = "#3ee86a";
      g.fillRect(x0 - 1.25, y0 - 14, 64, 13);
      g.fillStyle = "#05230e";
      g.fillText(`boat ${b.score.toFixed(2)}`, x0 + 3, y0 - 4);
    }
  });
}

/**
 * The coast as the room watches it, 1024 × 224, for the video wall: the camera's frame with the detector's boxes over
 * it and, under it, its thermal channel and the detections' log; three of SAHI's tiles blown up, each round a skiff
 * too small to find in the whole frame; and the map of Burrard Inlet with the cameras' sites and what they look at.
 */
function watchWallTexture(day: CanvasTexture, heat: CanvasTexture, dets: CanvasTexture): CanvasTexture {
  const fonts = fontOf();
  const dayC = day.image as HTMLCanvasElement;
  const heatC = heat.image as HTMLCanvasElement;
  const detC = dets.image as HTMLCanvasElement;
  return canvasTex(1024, 224, (g) => {
    g.fillStyle = "#0b0f14";
    g.fillRect(0, 0, 1024, 224);
    const label = (text: string, x: number, y: number, col = "#e8ecef") => {
      g.font = `600 10px ${fonts.mono}`;
      g.textBaseline = "top";
      g.fillStyle = "rgba(11,15,20,0.75)";
      g.fillRect(x, y, g.measureText(text).width + 8, 13);
      g.fillStyle = col;
      g.fillText(text, x + 4, y + 2);
    };
    // the whole frame, its boxes over it
    for (const src of [dayC, detC]) g.drawImage(src, 0, 0, 1024, 256, 8, 8, 512, 128);
    // its thermal channel, and the log
    g.drawImage(heatC, 0, 0, 1024, 256, 8, 144, 252, 63);
    g.fillStyle = "#101820";
    g.fillRect(268, 144, 252, 72);
    g.font = `500 10px ${fonts.mono}`;
    g.textBaseline = "top";
    const log = [...FEED_BOATS].sort((p, q) => q.score - p.score);
    log.forEach((b, k) => {
      g.fillStyle = k % 2 ? "#9fe8b4" : "#3ee86a";
      g.fillText(`07:42:${String(8 + k).padStart(2, "0")}  boat ${b.score.toFixed(2)}  ${b.kind.padEnd(9)} ${b.kind === "skiff" ? "TILE" : "FRAME"}`, 276, 150 + k * 9.4);
    });
    label("DETECTIONS", 268, 207 - 13, "#c4b5fd");
    // the tiles that found the skiffs, blown up
    FEED_BOATS.filter((b) => b.kind === "skiff").forEach((b, k) => {
      const [x0, y0, x1, y1] = boatBox(b);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2 - 3;
      const sw = 84;
      const sh = 28;
      for (const src of [dayC, detC]) g.drawImage(src, cx - sw / 2, cy - sh / 2, sw, sh, 528, 8 + k * 70, 192, 64);
      g.strokeStyle = "#c4b5fd";
      g.lineWidth = 1.5;
      g.strokeRect(528.75, 8.75 + k * 70, 190.5, 62.5);
      label(`TILE ${String(1 + k * 4).padStart(2, "0")} · ${(b.len * 0.8).toFixed(0)} PX`, 532, 12 + k * 70, "#c4b5fd");
    });
    // the map: the North Shore along the top, Stanley Park and the downtown peninsula, the south shore and False Creek
    const mx = 728;
    const my = 8;
    const mw = 288;
    const mh = 208;
    g.save();
    g.beginPath();
    g.rect(mx, my, mw, mh);
    g.clip();
    g.fillStyle = "#0b2f47";
    g.fillRect(mx, my, mw, mh);
    const land = (pts: [number, number][]) => {
      g.beginPath();
      pts.forEach(([u, v], k) => (k ? g.lineTo(mx + u * mw, my + v * mh) : g.moveTo(mx + u * mw, my + v * mh)));
      g.closePath();
      g.fillStyle = "#1c2833";
      g.fill();
      g.strokeStyle = "rgba(95,216,255,0.6)";
      g.lineWidth = 1;
      g.stroke();
    };
    land([[0, 0], [1, 0], [1, 0.24], [0.8, 0.27], [0.62, 0.22], [0.42, 0.25], [0.22, 0.2], [0, 0.24]]);
    land([[0, 0.48], [0.06, 0.38], [0.16, 0.35], [0.24, 0.4], [0.36, 0.42], [0.52, 0.41], [0.66, 0.44], [0.78, 0.43], [1, 0.45], [1, 0.62], [0.6, 0.62], [0.5, 0.66], [0.32, 0.64], [0.2, 0.6], [0, 0.6]]);
    land([[0, 0.8], [0.3, 0.76], [0.42, 0.72], [0.5, 0.7], [0.62, 0.71], [1, 0.7], [1, 1], [0, 1]]);
    g.fillStyle = "rgba(95,216,255,0.75)";
    g.font = `600 9px ${fonts.mono}`;
    g.textBaseline = "middle";
    g.fillText("BURRARD INLET", mx + 0.42 * mw, my + 0.32 * mh);
    g.fillText("ENGLISH BAY", mx + 0.04 * mw, my + 0.7 * mh);
    g.fillText("FALSE CREEK", mx + 0.56 * mw, my + 0.66 * mh);
    // the cameras: a mark and a faint cone over the water each looks at
    for (const [u, v, dir, name] of [
      [0.14, 0.36, -1.9, "03"],
      [0.5, 0.41, -1.5, "07"],
      [0.88, 0.44, -1.7, "11"],
    ] as const) {
      const x = mx + u * mw;
      const y = my + v * mh;
      g.fillStyle = "rgba(167,139,250,0.22)";
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, 46, dir - 0.45, dir + 0.45);
      g.closePath();
      g.fill();
      g.fillStyle = "#c4b5fd";
      g.beginPath();
      g.moveTo(x, y - 5);
      g.lineTo(x + 5, y + 4);
      g.lineTo(x - 5, y + 4);
      g.closePath();
      g.fill();
      g.fillText(name, x + 7, y + 3);
    }
    g.restore();
    g.strokeStyle = "#2a3a48";
    g.lineWidth = 2;
    g.strokeRect(mx, my, mw, mh);
    label("COAST · 3 CAMERAS · LIVE", mx + 4, my + mh - 17, "#5fd8ff");
    label("CAM 07 · BURRARD INLET", 12, 12);
    label("THERMAL", 12, 148);
  });
}

/** The video wall's panes (x0, y0, x1, y1 of its 1024 × 224), in the order the duty officer's frame steps through. */
const WALL_PANES: [number, number, number, number][] = [
  [8, 8, 520, 136],
  [528, 8, 720, 72],
  [528, 78, 720, 142],
  [528, 148, 720, 212],
  [8, 144, 260, 207],
  [728, 8, 1016, 216],
];
/** Boats crossing the map (start and end, as shares of the map's width and height), each at its own pace. */
const MAP_TRACKS: [number, number, number, number, number][] = [
  [0.12, 0.31, 0.92, 0.3, 0.012],
  [0.88, 0.36, 0.18, 0.35, 0.016],
  [0.58, 0.26, 0.61, 0.39, 0.03],
  [0.06, 0.66, 0.34, 0.74, 0.02],
  [0.3, 0.3, 0.55, 0.36, 0.025],
];

/**
 * The city's people (world.ts's atlas material) lit by a room's lights as well as the sky: their figure glows a little,
 * so they read under a roof by day and in a lit room after dark.
 */
function indoorPeople(people: MeshStandardMaterial): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: people.map, emissive: 0xffffff, emissiveMap: people.map, emissiveIntensity: 0.5, alphaTest: 0.5, side: DoubleSide, roughness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvec2 cell = vec2(mod(aCell, 4.0), 3.0 - floor(aCell / 4.0));\nvMapUv = (vMapUv + cell) * 0.25;\nvEmissiveMapUv = (vEmissiveMapUv + cell) * 0.25;");
  };
  m.customProgramCacheKey = () => "people-atlas-indoor";
  return m;
}

/**
 * Coast Watch's inside, a room two storeys high behind its glass, in the set's frame:
 * - the video wall across the inside of its wall to the square: the camera's frame with its boxes, its thermal channel,
 *   the detections' log, the tiles that found the far skiffs blown up, the map of the inlet with the cameras' sites and
 *   boats moving across it, the duty officer's frame stepping from pane to pane;
 * - the watch floor before it, dark: three rows of desks facing it, two screens on each, the operators at them, the
 *   duty officer walking the front; glass between it and the public;
 * - the public's: the lobby under a gallery along the glass to Broadway, the reception desk by the door from the
 *   bridge, a stair up at its far end; on the gallery, people at its rail watching the wall, a guide with a group, and
 *   kiosks where anyone can try the detector on a photo of their own (the Space it runs as); visitors coming in from
 *   the bridge, along the lobby, up the stair and along the gallery.
 * The people are the city's own (its atlas, turned to the camera every frame). Returns the per-frame update.
 */
function watchInterior(c: Ctx, vc: Material, top: number, WH: number, bridgeA: number, day: CanvasTexture, heat: CanvasTexture, dets: CanvasTexture): (t: number, cam: Vector3) => void {
  const { mats } = c.world;
  const H = WATCH;
  // glass inside the room all but clear, so the room reads through the façade's
  const glass = new MeshStandardMaterial({ color: 0xd6e6f0, roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false, side: DoubleSide });
  const zs = c.L(1, 0, 0)[2];
  const turn = (f: [number, number]) => Math.atan2(f[1], f[0] * zs);
  // the gallery along the glass to Broadway, a storey up; under it the lobby
  const GA = { a0: H.a0 + 0.1, a1: H.a0 + 4.4, l0: H.l0 + 0.1, l1: H.l1 - 0.3, y: top + 3.2 };
  const gm = (GA.a0 + GA.a1) / 2;
  const glm = (GA.l0 + GA.l1) / 2;
  const STAIR = { a0: GA.a1 + 0.1, a1: GA.a1 + 1.3, l0: GA.l1 - 6.3, l1: GA.l1 - 0.2 };
  // floors: timber in the lobby, dark under the watch floor
  c.add(vc, paint(new BoxGeometry(GA.l1 - GA.l0, 0.04, GA.a1 - GA.a0), 0xb98a5a), c.L(gm, glm, top + 0.02));
  c.add(vc, paint(new BoxGeometry(GA.l1 - GA.l0, 0.04, H.a1 - 0.4 - GA.a1), 0x2c3540), c.L((GA.a1 + H.a1 - 0.4) / 2, glm, top + 0.02));
  // the gallery: its slab, timber floor, glass rail with a timber handrail (open where the stair comes up), its columns
  c.add(vc, paint(new BoxGeometry(GA.l1 - GA.l0, 0.25, GA.a1 - GA.a0), 0xe9e6df), c.L(gm, glm, GA.y - 0.125));
  c.add(vc, paint(new BoxGeometry(GA.l1 - GA.l0, 0.04, GA.a1 - GA.a0), 0xb98a5a), c.L(gm, glm, GA.y + 0.02));
  for (const [r0, r1] of [
    [GA.l0, STAIR.l0 - 0.2],
    [STAIR.l0 + 1.6, GA.l1],
  ]) {
    c.add(glass, new BoxGeometry(r1 - r0, 0.85, 0.05), c.L(GA.a1, (r0 + r1) / 2, GA.y + 0.43));
    c.add(mats.timber, new BoxGeometry(r1 - r0, 0.07, 0.12), c.L(GA.a1, (r0 + r1) / 2, GA.y + 0.88));
  }
  for (const l of [GA.l0 + 5, GA.l0 + 12, GA.l0 + 19]) c.add(vc, paint(new CylinderGeometry(0.12, 0.12, GA.y - top, 8), 0xf3f4f6), c.L(GA.a1 - 0.2, l, (GA.y + top) / 2));
  // glass between the lobby and the watch floor, open at the door's end and at the stair
  const partL0 = H.l0 + 2.6;
  c.add(glass, new BoxGeometry(STAIR.l0 - 0.1 - partL0, GA.y - 0.25 - top, 0.05), c.L(GA.a1, (partL0 + STAIR.l0 - 0.1) / 2, top + (GA.y - 0.25 - top) / 2));
  // the stair up to the gallery at the lobby's far end, rising toward the door, glass along its open side
  const STEPS = 13;
  const run = (STAIR.l1 - STAIR.l0) / STEPS;
  for (let k = 0; k < STEPS; k++) {
    const h = ((k + 1) * (GA.y - top)) / STEPS;
    c.add(vc, paint(new BoxGeometry(run, h, STAIR.a1 - STAIR.a0), 0xd9d4ca), c.L((STAIR.a0 + STAIR.a1) / 2, STAIR.l1 - (k + 0.5) * run, top + h / 2));
  }
  const pitch = Math.atan2(GA.y - top, STAIR.l1 - STAIR.l0);
  c.add(glass, new BoxGeometry((STAIR.l1 - STAIR.l0) / Math.cos(pitch), 0.85, 0.05), c.L(STAIR.a1, (STAIR.l0 + STAIR.l1) / 2, (top + GA.y) / 2 + 0.45), [0, 0, -pitch]);
  // the reception desk by the door, in white with a timber top
  c.add(vc, paint(new BoxGeometry(3.2, 0.5, 0.8), 0xf1f0ec), c.L(GA.a0 + 1.3, H.l0 + 4.2, top + 0.25));
  c.add(vc, paint(new BoxGeometry(3.3, 0.06, 0.9), 0xb98a5a), c.L(GA.a0 + 1.3, H.l0 + 4.2, top + 0.53));
  c.add(vc, lit(paint(new BoxGeometry(0.5, 0.3, 0.04), 0x7fc8ff), 0.9), c.L(GA.a0 + 1.1, H.l0 + 4.2, top + 0.72));
  // the watch floor: three rows of desks facing the wall, two screens on each and a chair behind each place
  const desks: [number, number][] = [];
  for (const a of [GA.a1 + 2.4, GA.a1 + 5.4, GA.a1 + 8.4]) for (const l of [H.l0 + 4.5, H.l0 + 8.5, H.l0 + 12.5, H.l0 + 16.5]) desks.push([a, l]);
  for (const [a, l] of desks) {
    c.add(vc, paint(new BoxGeometry(2.8, 0.42, 0.7), 0x4a4038), c.L(a, l, top + 0.21));
    for (const s of [-0.62, 0.62]) {
      c.add(vc, lit(paint(new BoxGeometry(0.6, 0.36, 0.04), 0x7fc8ff), 1.0), c.L(a + 0.22, l + s, top + 0.64));
      c.add(vc, paint(new BoxGeometry(0.42, 0.5, 0.2), 0x30343b), c.L(a - 0.95, l + s, top + 0.25));
    }
  }
  // the lights along the ceiling and under the gallery
  for (const a of [GA.a1 + 2, GA.a1 + 6, GA.a1 + 10]) c.add(vc, lit(paint(new BoxGeometry(GA.l1 - GA.l0 - 3, 0.06, 0.22), 0xfff1d8), 1.1), c.L(a, glm, top + WH - 0.1));
  c.add(vc, lit(paint(new BoxGeometry(GA.l1 - GA.l0 - 3, 0.05, 0.2), 0xfff1d8), 1.1), c.L(gm, glm, GA.y - 0.28));
  // the kiosks on the gallery: a post and a screen facing the glass, the detector's page on it: a photo, a box round
  // its boat, the button to run it
  const fonts = fontOf();
  const kioskTex = canvasTex(256, 160, (g) => {
    g.fillStyle = "#101114";
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = "#f4f4f5";
    g.font = `600 15px ${fonts.sans}`;
    g.textBaseline = "top";
    g.fillText("Try Vessel Vision", 12, 10);
    const grd = g.createLinearGradient(0, 34, 0, 116);
    grd.addColorStop(0, "#9cc7e6");
    grd.addColorStop(0.45, "#5f7a6c");
    grd.addColorStop(0.5, "#4f7f9c");
    grd.addColorStop(1, "#24506e");
    g.fillStyle = grd;
    g.fillRect(12, 34, 232, 82);
    g.fillStyle = "#f4f4f2";
    g.fillRect(118, 86, 34, 7);
    g.fillRect(126, 80, 16, 6);
    g.strokeStyle = "#3ee86a";
    g.lineWidth = 2;
    g.strokeRect(112, 74, 46, 24);
    g.fillStyle = "#3ee86a";
    g.fillRect(111, 64, 46, 10);
    g.fillStyle = "#05230e";
    g.font = `600 8px ${fonts.mono}`;
    g.fillText("boat 0.93", 114, 65);
    g.fillStyle = "#d9622b";
    g.fillRect(12, 124, 232, 26);
    g.fillStyle = "#ffffff";
    g.font = `600 12px ${fonts.sans}`;
    g.textAlign = "center";
    g.fillText("Start Detection", 128, 131);
  });
  const kioskMat = new MeshBasicMaterial({ map: kioskTex, toneMapped: false });
  const KIOSK_A = GA.a0 + 1.6;
  const kiosks = [GA.l0 + 5, GA.l0 + 11, GA.l0 + 17];
  for (const l of kiosks) {
    c.add(vc, paint(new BoxGeometry(0.16, 0.95, 0.16), 0x3a3f46), c.L(KIOSK_A + 0.1, l, GA.y + 0.48));
    c.add(kioskMat, new PlaneGeometry(0.8, 0.5), c.L(KIOSK_A, l, GA.y + 1.1), [0, turn([-1, 0]), 0]);
  }

  // the video wall on the inside of the wall to the square, facing the room
  const VW = H.l1 - H.l0 - 3.4;
  const VH = (VW * 224) / 1024;
  const vw = new Group();
  vw.position.set(...c.L(H.a1 - 0.4, (H.l0 + H.l1) / 2, top + 0.95 + VH / 2));
  vw.rotation.y = turn([-1, 0]);
  c.group.add(vw);
  c.add(vc, paint(new BoxGeometry(VW + 0.5, VH + 0.5, 0.08), 0x15181d), c.L(H.a1 - 0.32, (H.l0 + H.l1) / 2, top + 0.95 + VH / 2));
  vw.add(new Mesh(new PlaneGeometry(VW, VH), new MeshBasicMaterial({ map: watchWallTexture(day, heat, dets), color: 0xe6e6e6, toneMapped: false })));
  const WX = (px: number) => (px / 1024 - 0.5) * VW;
  const WY = (py: number) => (0.5 - py / 224) * VH;
  // the duty officer's frame, one round each pane, shown in turn
  const pickMat = new MeshBasicMaterial({ color: 0xffb648, toneMapped: false });
  const picks = WALL_PANES.map(([x0, y0, x1, y1]) => {
    const w = WX(x1) - WX(x0) + 0.1;
    const h = WY(y0) - WY(y1) + 0.1;
    const r = 0.06;
    const m = new Mesh(
      mergeGeometries([
        new PlaneGeometry(w, r).translate(0, h / 2, 0),
        new PlaneGeometry(w, r).translate(0, -h / 2, 0),
        new PlaneGeometry(r, h).translate(w / 2, 0, 0),
        new PlaneGeometry(r, h).translate(-w / 2, 0, 0),
      ]),
      pickMat,
    );
    m.position.set(WX((x0 + x1) / 2), WY((y0 + y1) / 2), 0.02);
    m.visible = false;
    vw.add(m);
    return m;
  });
  // the boats on the map
  const dots = new InstancedMesh(new PlaneGeometry(0.16, 0.16), new MeshBasicMaterial({ color: 0x3ee86a, toneMapped: false }), MAP_TRACKS.length);
  dots.position.z = 0.02;
  dots.frustumCulled = false;
  vw.add(dots);

  // the people: where each stands (a, l, height) and its figure; the operators at the desks, the duty officer, people
  // on the gallery, the receptionist; then the visitors on their way in
  type Stand = { a: number; l: number; u: number; cell: number };
  const stands: Stand[] = [];
  desks.forEach(([a, l], k) => {
    // seated: between the chair and the desk, down to the chair's height
    for (const s of [-0.62, 0.62]) if ((k * 2 + (s > 0 ? 1 : 0)) % 7 !== 3) stands.push({ a: a - 0.6, l: l + s, u: top - 0.32, cell: (k * 3 + (s > 0 ? 1 : 0)) % 10 });
  });
  stands.push({ a: GA.a0 + 0.55, l: H.l0 + 4.2, u: top, cell: 7 });
  stands.push({ a: GA.a0 + 1.2, l: H.l0 + 8.5, u: top, cell: 10 });
  stands.push({ a: H.a1 - 1.6, l: H.l0 + 20.5, u: top, cell: 6 });
  for (const [l, cell] of [
    [GA.l0 + 3, 11],
    [GA.l0 + 8.5, 2],
    [GA.l0 + 9.2, 5],
    [GA.l0 + 14.5, 12],
    [GA.l0 + 20.2, 8],
  ])
    stands.push({ a: GA.a1 - 0.45, l, u: GA.y, cell });
  for (const l of kiosks) stands.push({ a: KIOSK_A - 0.75, l: l + 0.65, u: GA.y, cell: Math.round(l) % 10 });
  // the guide and the group gathered round, at the gallery's far end past the stair's head
  const guideL = STAIR.l0 + 3.6;
  stands.push({ a: GA.a0 + 0.9, l: guideL, u: GA.y, cell: 4 });
  for (const [da, dl, cell] of [
    [1.6, -1.1, 1],
    [1.9, 0.0, 9],
    [1.5, 1.1, 3],
    [2.5, -0.5, 13],
  ])
    stands.push({ a: GA.a0 + 0.9 + da, l: guideL + dl, u: GA.y, cell });
  // the way in: from the bridge's door, along the lobby, up the stair, along the gallery to the kiosks
  const path: [number, number, number][] = [
    [bridgeA, H.l0 + 0.6, top],
    [GA.a0 + 2.6, H.l0 + 3.2, top],
    [GA.a0 + 2.6, STAIR.l1 - 0.6, top],
    [(STAIR.a0 + STAIR.a1) / 2, STAIR.l1 + 0.2, top],
    [(STAIR.a0 + STAIR.a1) / 2, STAIR.l0 - 0.2, GA.y],
    [GA.a0 + 2.8, STAIR.l0 - 0.8, GA.y],
    [GA.a0 + 2.8, GA.l0 + 6, GA.y],
  ];
  const seg = path.slice(1).map((p, k) => Math.hypot(p[0] - path[k][0], p[1] - path[k][1], p[2] - path[k][2]));
  const pathLen = seg.reduce((s, v) => s + v, 0);
  const WALKERS = 4;
  const walkCells = [0, 6, 14, 3];
  const n = stands.length + WALKERS;
  const quad = new PlaneGeometry(0.55, 1.1).translate(0, 0.55, 0);
  quad.setAttribute("aCell", new InstancedBufferAttribute(Float32Array.from([...stands.map((p) => p.cell), ...walkCells]), 1));
  const folk = new InstancedMesh(quad, indoorPeople(mats.people), n);
  folk.frustumCulled = false;
  c.group.add(folk);
  const inv = c.group.matrix.clone().invert();
  const camL = new Vector3();
  const fp = new Vector3();
  const fq = new Quaternion();
  const fs = new Vector3();
  const fm = new Matrix4();
  const place = (i: number, a: number, l: number, u: number, cell: number, s: number) => {
    fp.set(...c.L(a, l, u));
    fq.setFromAxisAngle(UP, Math.atan2(camL.x - fp.x, camL.z - fp.z));
    folk.setMatrixAt(i, fm.compose(fp, fq, fs.set(PEOPLE_WIDTH[cell] * s, s, s)));
  };

  return (t, cam) => {
    camL.copy(cam).applyMatrix4(inv);
    stands.forEach((p, i) => place(i, p.a, p.l, p.u, p.cell, 1));
    for (let w = 0; w < WALKERS; w++) {
      // each a quarter of the way behind the last, growing in at the door and fading out at the kiosks
      const gone = (((t * 0.7 + (w * pathLen) / WALKERS) % pathLen) + pathLen) % pathLen;
      let d = gone;
      let k = 0;
      while (k < seg.length - 1 && d > seg[k]) d -= seg[k++];
      const u = Math.min(1, d / seg[k]);
      const [a0, l0, y0] = path[k];
      const [a1, l1, y1] = path[k + 1];
      const s = Math.min(1, gone / 1.2, (pathLen - gone) / 1.2);
      place(stands.length + w, a0 + (a1 - a0) * u, l0 + (l1 - l0) * u, y0 + (y1 - y0) * u + Math.abs(Math.sin(t * 7 + w)) * 0.03, walkCells[w], s);
    }
    folk.instanceMatrix.needsUpdate = true;
    // the wall: the duty officer's frame, and the boats crossing the map
    const sel = Math.floor(t / 2.2) % WALL_PANES.length;
    picks.forEach((m, k) => (m.visible = k === sel));
    MAP_TRACKS.forEach(([u0, v0, u1, v1, speed], k) => {
      const f = 0.5 - 0.5 * Math.cos(t * speed * Math.PI * 2 + k);
      fp.set(WX(728 + (u0 + (u1 - u0) * f) * 288), WY(8 + (v0 + (v1 - v0) * f) * 208), 0);
      dots.setMatrixAt(k, fm.makeTranslation(fp.x, fp.y, 0));
    });
    dots.instanceMatrix.needsUpdate = true;
  };
}

/**
 * Coast Watch: the control room of the coast's cameras, inland at the interchange as a control room can be, where the
 * shore cameras' feeds come in and the detector finds every boat in them; the project at work on its face.
 * - Raised on timber columns at platform height in the station's square (sets/squares.ts), square to Broadway, its
 *   bridge from the platform's south end over Commercial Drive, cafés and restaurants in glass pavilions under it.
 * - Glass to Broadway and to the station, the room two storeys high behind it (watchInterior): the video wall, the
 *   operators at their desks, the public's gallery with its visitors and kiosks; white to the west.
 * - Its wall to the square a screen the width of the building: the camera's frame across the inlet, SAHI's tiles
 *   stepping across it one by one and a green box closing round each boat as its tile finds it, the far skiffs only a
 *   tile can find among them, scores over the boxes; by day in colour, after dark the thermal feed.
 * - On its roof a mast of drum dishes, the feeds' links from the cameras along the coast.
 * The square round it is paved, East 12th Avenue through it a market street under festoon lights. Across the way, on
 * Clark Park's lawn, the Clark Park Vertiport (built here too): a deck a storey over a glass hall, four taxi pads, the
 * lounge, the charging posts, nets round the deck, the departures board and the sign.
 */
function vessel(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const sq = SQUARES.find((s) => s.i === 5) as Square;
  const vc = shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), c.world);
  const kit = squareKit(c, sq, vc);
  const H = WATCH;
  const zs = c.L(1, 0, 0)[2];
  // a piece's front (its local +z) turned toward (da, dl)
  const turn = (f: [number, number]) => Math.atan2(f[1], f[0] * zs);
  // the square's paving: granite, the market street in brick, Woodland Drive's lane in grey setts
  paveSquare(c, vc, -24, 30, 20, 66, (a, l, i, j) => {
    if (!inCbSquare(a, l)) return null;
    if (lineDist(MARKET_STREET, a, l) < MARKET_HALF) return (i + j) % 2 ? 0xa65f45 : 0xb36b4f;
    if (a > 9 && lineDist(WOODLAND_LANE, a, l) < 2.4) return 0x8f8d88;
    return i % 5 === 0 || j % 5 === 0 ? 0xbdb6a9 : (i + j) % 2 ? 0xd3ccbf : 0xcac3b6;
  });
  // the market street: bollards where it leaves Commercial Drive and Clark Drive, festoons zigzagging over it
  const ML = lineLength(MARKET_STREET);
  for (const s of [5.5, ML - 3]) {
    const p = along(MARKET_STREET, s);
    for (let k = -2; k <= 2; k++) {
      const a = p.a - p.ul * k * 1.3;
      const l = p.l + p.ua * k * 1.3;
      const out: Pieces = { solid: [], glass: [], warm: [] };
      bollard(out, 0, 0, 0);
      kit.put(out, a, l, [1, 0]);
    }
  }
  const zig: [number, number][] = [];
  for (let s = 7, k = 0; s < ML - 4; s += 5.5, k++) {
    const p = along(MARKET_STREET, s);
    const side = k % 2 ? 1 : -1;
    zig.push([p.a - p.ul * side * (MARKET_HALF - 0.2), p.l + p.ua * side * (MARKET_HALF - 0.2)]);
  }
  festoons(c, vc, kit.lit, zig);
  // under the hall: benches round a planter in the middle, between the pavilions
  {
    const out: Pieces = { solid: [], glass: [], warm: [] };
    planter(out, 0, 0, 0, 1.6);
    for (const [x, z, r] of [
      [0, 2, Math.PI],
      [0, -2, 0],
      [2, 0, -Math.PI / 2],
      [-2, 0, Math.PI / 2],
    ])
      bench(out, x, 0.05, z, r);
    kit.put(out, -7.5, 42.5, [1, 0]);
  }
  // the fountain's jets, leaping in turn
  const [fa, fl] = sq.pools[0];
  const fg = c.G(fa, fl);
  const jets = new InstancedMesh(
    new CylinderGeometry(0.06, 0.14, 1, 6).translate(0, 0.5, 0),
    new MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7, roughness: 0.1, emissive: 0x88c8ff, emissiveIntensity: 0.3 }),
    8,
  );
  const jetAt = Array.from({ length: 8 }, (_, k) => {
    const th = (k / 8) * Math.PI * 2;
    return new Vector3(...c.L(fa + Math.cos(th) * 1.3, fl + Math.sin(th) * 1.3, fg + 0.45));
  });
  c.group.add(jets);
  const jm = new Matrix4();
  const jq = new Quaternion();
  const js = new Vector3();

  // the floor at platform height, its timber soffit lit from below
  let gmax = -Infinity;
  for (let a = H.a0; a <= H.a1; a += 4) for (let l = H.l0; l <= H.l1; l += 4) gmax = Math.max(gmax, c.G(a, l));
  const top = Math.max(1.4, gmax + 4.5);
  const am = (H.a0 + H.a1) / 2;
  const lm = (H.l0 + H.l1) / 2;
  c.add(mats.plat, new BoxGeometry(H.l1 - H.l0, 0.5, H.a1 - H.a0), c.L(am, lm, top - 0.25));
  c.add(vc, paint(new BoxGeometry(H.l1 - H.l0 - 0.1, 0.08, H.a1 - H.a0 - 0.1), 0xb98a5a), c.L(am, lm, top - 0.54));
  for (let a = H.a0 + 2; a < H.a1 - 1; a += 4) for (let l = H.l0 + 2.5; l < H.l1 - 1; l += 4.5) c.add(kit.lit, paint(new CylinderGeometry(0.22, 0.22, 0.05, 8), 0xffd49a), c.L(a, l, top - 0.6));
  // timber columns in V pairs at its corners and the middle of its long sides
  for (const a of [H.a0 + 0.8, H.a1 - 0.8]) {
    for (const l of [H.l0 + 1.4, lm, H.l1 - 1.4]) {
      const g = c.G(a, l);
      for (const s of [-1, 1]) strut(c, mats.timber, c.L(a, l, g), c.L(a, l + s * 1.3, top - 0.55), 0.26);
    }
  }
  // the bridge from the platform's outer edge, glass along its sides, on a pier at the kerb
  const bridgeA = 9.5 - SET_SHIFT[5];
  const run = H.l0 - 11.4;
  c.add(mats.plat, new BoxGeometry(run, 0.3, 5), c.L(bridgeA, (H.l0 + 11.4) / 2, top - 0.15));
  for (const s of [-1, 1]) c.add(mats.pane, new BoxGeometry(run, 1.1, 0.06), c.L(bridgeA + s * 2.45, (H.l0 + 11.4) / 2, top + 0.55));
  legs(c, mats.girder, [[bridgeA, 25.6]], top - 0.3, 0.5);
  // the walls (box sizes: lateral, up, along): glass to Broadway and to the station on timber mullions, the door where
  // the bridge lands; white to the west, with fins, and to the square, where the screen hangs
  const WH = 7.2;
  const WHITE = 0xe9e6df;
  const DOOR = [bridgeA - 1.8, bridgeA + 1.8];
  // the glass clearer than the city's, low in iron, so the room inside reads from the street
  const clear = new MeshStandardMaterial({ color: 0xd6e6f0, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false, side: DoubleSide, envMap: c.world.envTex, envMapIntensity: 0.35 });
  c.add(clear, new BoxGeometry(H.l1 - H.l0, WH, 0.08), c.L(H.a0, lm, top + WH / 2));
  c.add(clear, new BoxGeometry(0.08, WH, DOOR[0] - H.a0), c.L((H.a0 + DOOR[0]) / 2, H.l0, top + WH / 2));
  c.add(clear, new BoxGeometry(0.08, WH, H.a1 - DOOR[1]), c.L((DOOR[1] + H.a1) / 2, H.l0, top + WH / 2));
  c.add(clear, new BoxGeometry(0.08, WH - 3, DOOR[1] - DOOR[0]), c.L(bridgeA, H.l0, top + 3 + (WH - 3) / 2));
  for (let l = H.l0; l <= H.l1 + 0.01; l += (H.l1 - H.l0) / 12) c.add(mats.timber, new BoxGeometry(0.16, WH, 0.16), c.L(H.a0, l, top + WH / 2));
  for (let a = H.a0 + (H.a1 - H.a0) / 6; a < H.a1 - 0.01; a += (H.a1 - H.a0) / 6) c.add(mats.timber, new BoxGeometry(0.16, WH, 0.16), c.L(a, H.l0, top + WH / 2));
  c.add(vc, paint(new BoxGeometry(0.3, WH, H.a1 - H.a0), WHITE), c.L(am, H.l1 - 0.15, top + WH / 2));
  c.add(vc, paint(new BoxGeometry(H.l1 - H.l0, WH, 0.3), WHITE), c.L(H.a1 - 0.15, lm, top + WH / 2));
  for (let a = H.a0 + 1; a < H.a1 - 0.5; a += 2) c.add(vc, paint(new BoxGeometry(0.5, WH - 0.4, 0.14), WHITE), c.L(a, H.l1 + 0.25, top + WH / 2));
  // the roof: a white slab and parapet, sedum over most of it
  const roofY = top + WH;
  c.add(vc, paint(new BoxGeometry(H.l1 - H.l0 + 0.8, 0.5, H.a1 - H.a0 + 0.8), 0xf1f0ec), c.L(am, lm, roofY + 0.25));
  c.add(vc, paint(new BoxGeometry(H.l1 - H.l0 - 10, 0.1, H.a1 - H.a0 - 1.6), 0x6f8f4e), c.L(am, H.l0 + (H.l1 - H.l0 - 10) / 2 + 0.8, roofY + 0.55));
  for (const [a, w] of [
    [H.a0 - 0.2, H.l1 - H.l0 + 0.8],
    [H.a1 + 0.2, H.l1 - H.l0 + 0.8],
  ])
    c.add(vc, paint(new BoxGeometry(w, 0.5, 0.2), 0xf1f0ec), c.L(a, lm, roofY + 0.75));
  for (const l of [H.l0 - 0.2, H.l1 + 0.2]) c.add(vc, paint(new BoxGeometry(0.2, 0.5, H.a1 - H.a0 + 0.8), 0xf1f0ec), c.L(am, l, roofY + 0.75));
  // the plant on the roof's west end, by the mast
  for (const [a, l, w, h, d] of [
    [H.a1 - 4, H.l1 - 3, 3.4, 1.4, 2.6],
    [H.a1 - 8, H.l1 - 2.6, 2.4, 1.0, 2.4],
  ])
    c.add(vc, paint(new BoxGeometry(w, h, d), 0xb9bcbf), c.L(a, l, roofY + 0.5 + h / 2));
  // the mast: four legs tapering up, rings of bracing, three drum dishes facing the coast, a red light on top
  const MA = H.a0 + 4.5;
  const MLat = H.l1 - 4.5;
  const MH = 9.5;
  const mb = roofY + 0.5;
  const halfAt = (h: number) => 1.1 - (0.75 * h) / MH;
  for (const [da, dl] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    strut(c, mats.girder, c.L(MA + da * halfAt(0), MLat + dl * halfAt(0), mb), c.L(MA + da * halfAt(MH), MLat + dl * halfAt(MH), mb + MH), 0.07);
  for (let h = 1.4; h < MH; h += 1.4) {
    const r = halfAt(h);
    for (const s of [-1, 1]) {
      c.add(mats.girder, new BoxGeometry(2 * r, 0.06, 0.06), c.L(MA + s * r, MLat, mb + h));
      c.add(mats.girder, new BoxGeometry(0.06, 0.06, 2 * r), c.L(MA, MLat + s * r, mb + h));
    }
  }
  for (const [h, da, dl] of [
    [MH - 1.6, -1, 0],
    [MH - 3.3, -0.6, 1],
    [MH - 5, 0.3, 1],
  ]) {
    const n = Math.hypot(da, dl);
    const r = halfAt(h) + 0.3;
    const dish = new CylinderGeometry(0.75, 0.75, 0.45, 18).rotateX(Math.PI / 2).rotateY(Math.atan2(dl / n, (da / n) * zs));
    c.add(vc, paint(dish, 0xf4f5f3), c.L(MA + (da / n) * r, MLat + (dl / n) * r, mb + h));
  }
  c.add(vc, lit(paint(new BoxGeometry(0.22, 0.22, 0.22), 0xff2a1f), 1.4), c.L(MA, MLat, mb + MH + 0.15));
  // its name over the door, toward the station
  const fontsO = fontOf();
  const nameTex = canvasTex(1024, 220, (g) => {
    g.fillStyle = "#14202b";
    g.fillRect(0, 0, 1024, 220);
    g.fillStyle = "#ffffff";
    g.font = `500 92px ${fontsO.serif}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("Coast Watch", 512, 92);
    g.fillStyle = "#3ee86a";
    g.font = `500 32px ${fontsO.mono}`;
    g.fillText("THE COAST'S CAMERAS · VESSEL VISION LIVE", 512, 172);
  });
  const nm = new Mesh(new PlaneGeometry(14, 3.0), new MeshBasicMaterial({ map: nameTex, toneMapped: false }));
  nm.position.set(...c.L(am + 1.5, H.l0 - 0.12, top + WH - 1.7));
  nm.rotation.y = turn([0, -1]);
  c.group.add(nm);

  // the screen on the wall to the square: the camera's frame, the tile at work, the boxes it has found; a dark bezel
  const SW = H.l1 - H.l0 - 3;
  const SH = SW / 4;
  const wall = new Group();
  wall.position.set(...c.L(H.a1 + 0.12, lm, top + 0.5 + SH / 2));
  wall.rotation.y = turn([1, 0]);
  c.group.add(wall);
  c.add(vc, paint(new BoxGeometry(SW + 0.6, SH + 0.6, 0.12), 0x15181d), c.L(H.a1 + 0.02, lm, top + 0.5 + SH / 2));
  const day = coastFeed(false);
  const heat = coastFeed(true);
  const feed = new MeshBasicMaterial({ map: day, color: 0xe6e6e6, toneMapped: false });
  const X = (px: number) => (px / 1024 - 0.5) * SW;
  const Y = (py: number) => (0.5 - py / 256) * SH;
  wall.add(new Mesh(new PlaneGeometry(SW, SH), feed));
  // the tile: a violet wash and its frame
  const [t0x0, t0y0, t0x1, t0y1] = tileBox(0);
  const tw = X(t0x1) - X(t0x0);
  const th = Y(t0y0) - Y(t0y1);
  const tile = new Group();
  tile.add(new Mesh(new PlaneGeometry(tw, th), new MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false })));
  const rim = 0.07;
  tile.add(
    new Mesh(
      mergeGeometries([
        new PlaneGeometry(tw, rim).translate(0, th / 2, 0),
        new PlaneGeometry(tw, rim).translate(0, -th / 2, 0),
        new PlaneGeometry(rim, th).translate(tw / 2, 0, 0),
        new PlaneGeometry(rim, th).translate(-tw / 2, 0, 0),
      ]),
      new MeshBasicMaterial({ color: 0xc4b5fd, toneMapped: false }),
    ),
  );
  tile.position.z = 0.015;
  wall.add(tile);
  // the boxes: a quad each over its box and label, cut from the detections' texture, scaled round its middle to show
  const found = FEED_BOATS.map((b) => {
    const [x0, y0, x1, y1] = boatBox(b);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    for (let k = 0; k < TILE.cols * TILE.rows; k++) {
      const [u0, v0, u1, v1] = tileBox(k);
      if (cx > u0 && cx < u1 && cy > v0 && cy < v1) return k;
    }
    return 0;
  });
  const quads = FEED_BOATS.map((b) => {
    const [x0, y0, x1, y1] = boatBox(b);
    return [x0 - 2, y0 - 15, Math.max(x1, x0 + 63) + 1, y1 + 2];
  });
  const qPos = new Float32Array(quads.length * 12);
  const qUv: number[] = [];
  const qIdx: number[] = [];
  quads.forEach(([x0, y0, x1, y1], i) => {
    qUv.push(x0 / 1024, 1 - y0 / 256, x1 / 1024, 1 - y0 / 256, x0 / 1024, 1 - y1 / 256, x1 / 1024, 1 - y1 / 256);
    qIdx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3);
  });
  const boxes = new BG();
  boxes.setAttribute("position", new Float32BufferAttribute(qPos, 3));
  boxes.setAttribute("uv", new Float32BufferAttribute(qUv, 2));
  boxes.setIndex(qIdx);
  const dets = detectionsTexture();
  const boxesMesh = new Mesh(boxes, new MeshBasicMaterial({ map: dets, transparent: true, depthWrite: false, toneMapped: false }));
  boxesMesh.position.z = 0.03;
  boxesMesh.frustumCulled = false;
  wall.add(boxesMesh);
  const qp = boxes.attributes.position as Float32BufferAttribute;
  const showBoxes = (scale: (i: number) => number) => {
    quads.forEach(([x0, y0, x1, y1], i) => {
      const s = scale(i);
      const cx = X((x0 + x1) / 2);
      const cy = Y((y0 + y1) / 2);
      const hx = ((X(x1) - X(x0)) / 2) * s;
      const hy = ((Y(y0) - Y(y1)) / 2) * s;
      qp.setXYZ(i * 4, cx - hx, cy + hy, 0);
      qp.setXYZ(i * 4 + 1, cx + hx, cy + hy, 0);
      qp.setXYZ(i * 4 + 2, cx - hx, cy - hy, 0);
      qp.setXYZ(i * 4 + 3, cx + hx, cy - hy, 0);
    });
    qp.needsUpdate = true;
  };

  // inside: the video wall, the watch floor, the public's gallery and the people
  const inside = watchInterior(c, vc, top, WH, bridgeA, day, heat, dets);

  // ---- the Clark Park Vertiport across the square: the deck over the glass hall, on columns kept off the streets
  const V = VERTIPORT;
  const D = VERTIPORT_TOP - STATION_FRAMES[5].y;
  const portRoad = (a: number, l: number) => isRoad(...fromStation(5, a + SET_SHIFT[5], l), 0.4);
  for (const [a0, a1, l0, l1] of V.deck) {
    c.add(mats.plat, new BoxGeometry(l1 - l0, 0.5, a1 - a0), c.L((a0 + a1) / 2, (l0 + l1) / 2, D - 0.25));
    for (let a = a0 + 1.8; a < a1 - 1; a += 3.6) for (let l = l0 + 1.8; l < l1 - 1; l += 3.6) c.add(kit.lit, paint(new CylinderGeometry(0.2, 0.2, 0.05, 8), 0xffd49a), c.L(a, l, D - 0.53));
  }
  const cols: [number, number][] = [];
  for (const a of [30.4, 36.4, 42.4]) for (const l of [29.2, 36.8, 43.6]) cols.push([a, l]);
  for (const a of [30.4, 39.6]) for (const l of [49, 53.8]) cols.push([a, l]);
  legs(
    c,
    mats.girder,
    cols.filter(([a, l]) => !portRoad(a, l)),
    D - 0.5,
    0.36,
  );
  // the hall under it: glass on white mullions between the lawn and the deck, a floor laid level inside
  const HALL_RECTS: [number, number, number, number][] = [
    [30.6, 42.2, 29.4, 44.2],
    [30.6, 39.4, 44.2, 53.6],
  ];
  let hLo = Infinity;
  let hHi = -Infinity;
  for (const [a0, a1, l0, l1] of HALL_RECTS) {
    for (const a of [a0, (a0 + a1) / 2, a1]) {
      for (const l of [l0, (l0 + l1) / 2, l1]) {
        hLo = Math.min(hLo, c.G(a, l));
        hHi = Math.max(hHi, c.G(a, l));
      }
    }
  }
  for (const [a0, a1, l0, l1] of HALL_RECTS) c.add(vc, paint(new BoxGeometry(l1 - l0, hHi - hLo + 0.4, a1 - a0), 0xcfc8bb), c.L((a0 + a1) / 2, (l0 + l1) / 2, (hHi + hLo) / 2 - 0.1));
  const hallH = D - 0.5 - hLo;
  // its faces: (a0, l0) to (a1, l1), one of them constant
  const faces: [number, number, number, number][] = [
    [30.6, 29.4, 30.6, 53.6],
    [30.6, 29.4, 42.2, 29.4],
    [42.2, 29.4, 42.2, 44.2],
    [39.4, 44.2, 42.2, 44.2],
    [39.4, 44.2, 39.4, 53.6],
    [30.6, 53.6, 39.4, 53.6],
  ];
  for (const [a0, l0, a1, l1] of faces) {
    const alongA = a0 !== a1;
    const len = alongA ? a1 - a0 : l1 - l0;
    c.add(mats.pane, alongA ? new BoxGeometry(0.08, hallH, len) : new BoxGeometry(len, hallH, 0.08), c.L((a0 + a1) / 2, (l0 + l1) / 2, hLo + hallH / 2));
    const n = Math.max(2, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) c.add(vc, paint(new BoxGeometry(0.14, hallH, 0.14), 0xf3f4f6), c.L(a0 + ((a1 - a0) * k) / n, l0 + ((l1 - l0) * k) / n, hLo + hallH / 2));
  }
  // on the deck, in the station's frame (x lateral, z along): the pads, the lounge, the charging posts between the
  // pads' rows, the nets round the edges (out from the deck), the windsock by the lounge, red lights at the corners
  const port: BufferGeometry[] = [];
  const at = (a: number, l: number): [number, number] => [l, a * zs];
  for (const [a, l] of V.pads) taxiPad(port, ...c.L(a, l, D));
  const Lo = V.lounge;
  glassBox(port, { x0: Lo.l0, x1: Lo.l1, z0: Math.min(Lo.a0 * zs, Lo.a1 * zs), z1: Math.max(Lo.a0 * zs, Lo.a1 * zs) }, D, Lo.h);
  for (const l of [33, 41]) {
    port.push(paint(new BoxGeometry(0.9, 1.5, 0.6).translate(...c.L(37, l, D + 0.75)), 0x2f343c));
    port.push(lit(paint(new BoxGeometry(0.3, 0.12, 0.62).translate(...c.L(37, l, D + 1.25)), 0x7ef0ff), 1.4));
  }
  const [dk1, dk2] = V.deck;
  const edges: [number, number, number, number, number, number][] = [
    [dk1[0], dk1[2], dk2[0], dk2[3], -1, 0],
    [dk1[0], dk1[2], dk1[1], dk1[2], 0, -1],
    [dk1[1], dk1[2], dk1[1], dk1[3], 1, 0],
    [dk2[1], dk1[3], dk1[1], dk1[3], 0, 1],
    [dk2[1], dk2[2], dk2[1], dk2[3], 1, 0],
    [dk2[0], dk2[3], dk2[1], dk2[3], 0, 1],
  ];
  for (const [a0, l0, a1, l1, oa, ol] of edges) nets(port, ...at(a0, l0), ...at(a1, l1), D, ol, oa * zs);
  windsock(port, ...c.L(dk2[1] - 0.6, dk2[3] - 0.5, D));
  for (const [a, l] of [
    [dk1[0] + 0.3, dk1[2] + 0.3],
    [dk1[1] - 0.3, dk1[2] + 0.3],
    [dk1[1] - 0.3, dk1[3] - 0.3],
    [dk2[0] + 0.3, dk2[3] - 0.3],
  ])
    port.push(lit(paint(new BoxGeometry(0.22, 0.22, 0.22).translate(...c.L(a, l, D + 0.11)), 0xff2a1f), 1.4));
  for (const g of port) c.add(vc, g);
  // its name over the lounge, toward the square, and the departures board hung under the deck's edge over the way in
  const portName = canvasTex(1024, 180, (g) => {
    g.fillStyle = "#14202b";
    g.fillRect(0, 0, 1024, 180);
    g.fillStyle = "#ffffff";
    g.font = `500 76px ${fontsO.serif}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("Clark Park Vertiport", 512, 74);
    g.fillStyle = "#5fd8ff";
    g.font = `500 28px ${fontsO.mono}`;
    g.fillText("AIR TAXIS EAST · COQUITLAM · SURREY", 512, 144);
  });
  const pn = new Mesh(new PlaneGeometry(7.2, 1.27), new MeshBasicMaterial({ map: portName, toneMapped: false }));
  pn.position.set(...c.L(Lo.a0 - 0.12, (Lo.l0 + Lo.l1) / 2, D + Lo.h + 0.95));
  pn.rotation.y = turn([-1, 0]);
  c.group.add(pn);
  const board = canvasTex(512, 176, (g) => {
    g.fillStyle = "#0a0c10";
    g.fillRect(0, 0, 512, 176);
    g.font = `600 22px ${fontsO.mono}`;
    g.textBaseline = "middle";
    g.fillStyle = "#ffb648";
    g.fillText("DEPARTURES", 18, 22);
    g.font = `500 17px ${fontsO.mono}`;
    [
      ["12:04", "COQUITLAM CENTRAL", "1", "BOARDING"],
      ["12:06", "SURREY CENTRAL", "3", "ON TIME"],
      ["12:10", "COQUITLAM CENTRAL", "2", "ON TIME"],
      ["12:12", "SURREY CENTRAL", "4", "ON TIME"],
    ].forEach(([time, to, padNo, state], k) => {
      const y = 58 + k * 32;
      g.fillStyle = "#ffd9a0";
      g.fillText(time, 18, y);
      g.fillText(to, 90, y);
      g.fillText(`PAD ${padNo}`, 316, y);
      g.fillStyle = state === "BOARDING" ? "#3ee86a" : "#ffd9a0";
      g.fillText(state, 400, y);
    });
  });
  const bd = new Mesh(new PlaneGeometry(5.2, 1.79), new MeshBasicMaterial({ map: board, toneMapped: false }));
  bd.position.set(...c.L(dk1[0] + 0.1, 38, D - 0.5 - 1.25));
  bd.rotation.y = turn([-1, 0]);
  c.group.add(bd);
  for (const s of [-1, 1]) c.add(mats.post, new BoxGeometry(0.05, 0.4, 0.05), c.L(dk1[0] + 0.1, 38 + s * 2.2, D - 0.5 - 0.2));

  const CYCLE = TILE.cols * TILE.rows + 4;
  const STEP = 0.7;
  return {
    anchors: [new Vector3(...c.L(H.a1 + 0.5, lm, top + 0.5 + SH)), new Vector3(...c.L(Lo.a0, (Lo.l0 + Lo.l1) / 2, D + Lo.h + 1.6)), new Vector3(...c.L(MA, MLat, mb + MH))],
    focus: new Vector3(...c.L(14, 42, top + 2)),
    update: (time, cam) => {
      inside(time, cam);
      // by day the colour feed, after dark the thermal
      const map = c.world.shopGlow.value > 0.45 ? heat : day;
      if (feed.map !== map) feed.map = map;
      // the tile steps across the frame, row by row; each boat's box closes round it as its tile reaches it, all held a
      // while once the frame is done, then the next frame
      const tau = time % (CYCLE * STEP);
      const k = Math.floor(tau / STEP);
      tile.visible = k < TILE.cols * TILE.rows;
      if (tile.visible) {
        const [x0, y0, x1, y1] = tileBox(k);
        tile.position.x = X((x0 + x1) / 2);
        tile.position.y = Y((y0 + y1) / 2);
      }
      showBoxes((i) => {
        const since = tau - (found[i] + 0.5) * STEP;
        return since < 0 ? 0 : 1 + 0.6 * Math.exp(-since * 7);
      });
      jetAt.forEach((p, j) => {
        const v = Math.max(0, Math.sin(time * 2.4 - j * 0.8));
        jets.setMatrixAt(j, jm.compose(p, jq, js.set(1, 0.2 + 2.2 * v, 1)));
      });
      jets.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * The community garden round the berry greenhouse (Nanaimo's set, toward the street): raised allotment beds of many
 * crops (lettuce, kale, tomatoes on stakes, corn, squash, sunflowers, flowers), a small orchard, a pollinator meadow
 * with beehives, a herb spiral, a pond with a boardwalk, a tool shed under a green roof with compost bays and a rain
 * tank, gravel paths, and a gate with the garden's name. Built in the set's frame (along, lateral).
 */
function communityGarden(c: Ctx): void {
  const G = (a: number, l: number) => c.G(a, l);
  // every plant, bed and path in one vertex-coloured mesh
  const veg = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const soil = 0x4a3626;
  const gravel = 0xcdbfa6;
  const leaf = 0x5f9a3c;
  const darkLeaf = 0x2f5f35;
  const paleLeaf = 0x9cc96b;
  const red = 0xd93b2b;
  const orange = 0xe8862a;
  const yellow = 0xf4c430;
  const corn = 0x9db84a;
  const plum = 0x6b2a6e;
  const wood = 0xb98a5a;
  const stone = 0x8a8378;
  const flowers = [0xe86fa5, 0xb07cd8, 0xf2f2f2, 0xf4c430, 0xe8862a];
  const v = (hex: number, geo: BufferGeometry, pos: V3, rot?: V3, scale?: V3) => c.add(veg, paint(geo, hex), pos, rot, scale);
  const ball = (r: number) => new SphereGeometry(r, 6, 4);
  // the garden's ground, laid in tiles that follow the slope: mown grass round the beds, longer meadow by the greenhouse
  // (each tile a little larger than its spacing and sunk into the slope, so neighbours overlap without a seam)
  for (let a = -22; a <= 22; a += 4) for (let l = 38; l <= 48; l += 4) v(0x7f9f58, new BoxGeometry(4.6, 0.5, 4.6), c.L(a, l, G(a, l) - 0.2));
  for (let a = 16.5; a <= 22.5; a += 3) for (let l = 15.5; l <= 34; l += 3.7) v(0x8daa5c, new BoxGeometry(4.2, 0.5, 3.5), c.L(a, l, G(a, l) - 0.2));
  // the gravel paths (box sizes: lateral, up, along): in from the gate past the greenhouse, along the beds' near side,
  // and up the middle of the beds
  v(gravel, new BoxGeometry(23.6, 0.08, 1.6), c.L(-16, 26, G(-16, 26) + 0.04));
  v(gravel, new BoxGeometry(1.6, 0.08, 44), c.L(0, 37.6, G(0, 37.6) + 0.04));
  v(gravel, new BoxGeometry(12, 0.08, 1.6), c.L(-1, 44, G(-1, 44) + 0.04));
  // the allotment beds: a timber frame, the soil, and its crop
  const crops = ["lettuce", "kale", "tomato", "corn", "squash", "sunflower", "flowers", "lettuce", "tomato", "flowers"] as const;
  let n = 0;
  for (let l = 39.5; l <= 48.5; l += 3) {
    for (let a = -17; a <= 11; a += 4) {
      if (Math.abs(a + 1) < 2.2) continue;
      const g = G(a, l);
      v(wood, new BoxGeometry(1.8, 0.45, 3.2), c.L(a, l, g + 0.22));
      v(soil, new BoxGeometry(1.6, 0.06, 3.0), c.L(a, l, g + 0.47));
      const crop = crops[n++ % crops.length];
      for (let k = -1; k <= 1; k++) {
        for (const s of [-0.45, 0.45]) {
          const pa = a + k * 0.95;
          const pl = l + s;
          const y = g + 0.5;
          if (crop === "lettuce") v(paleLeaf, ball(0.32), c.L(pa, pl, y + 0.15), [0, 0, 0], [1, 0.6, 1]);
          else if (crop === "kale") v(darkLeaf, ball(0.38), c.L(pa, pl, y + 0.3), [0, 0, 0], [1, 1.2, 1]);
          else if (crop === "tomato") {
            v(wood, new BoxGeometry(0.05, 1.5, 0.05), c.L(pa, pl, y + 0.75));
            v(leaf, ball(0.35), c.L(pa, pl, y + 0.8), [0, 0, 0], [0.9, 1.4, 0.9]);
            v(red, ball(0.1), c.L(pa + 0.15, pl, y + 0.9));
            v(red, ball(0.1), c.L(pa - 0.12, pl + 0.1, y + 0.6));
          } else if (crop === "corn") {
            v(corn, new CylinderGeometry(0.05, 0.08, 2.2, 5), c.L(pa, pl, y + 1.1));
            v(corn, new ConeGeometry(0.35, 1.0, 5), c.L(pa, pl, y + 1.4), [0, 0, 0], [1, 1, 0.3]);
          } else if (crop === "squash") {
            v(leaf, ball(0.5), c.L(pa, pl, y + 0.15), [0, 0, 0], [1.2, 0.4, 1.2]);
            if (k !== 0) v(orange, ball(0.22), c.L(pa + 0.2, pl, y + 0.2), [0, 0, 0], [1.2, 0.9, 1.2]);
          } else if (crop === "sunflower") {
            v(leaf, new CylinderGeometry(0.04, 0.06, 2.4, 5), c.L(pa, pl, y + 1.2));
            v(yellow, new CylinderGeometry(0.32, 0.32, 0.08, 10), c.L(pa, pl, y + 2.4), [Math.PI / 2.4, 0, 0]);
          } else {
            v(leaf, ball(0.3), c.L(pa, pl, y + 0.15), [0, 0, 0], [1, 0.7, 1]);
            v(flowers[(n + k + 2) % flowers.length], ball(0.12), c.L(pa, pl, y + 0.4));
          }
        }
      }
    }
  }
  // the orchard: apple and plum trees in rows, their fruit showing, toward the station's end
  for (let k = 0; k < 6; k++) {
    const a = -22.5 + (k % 2) * 3.5;
    const l = 16 + Math.floor(k / 2) * 7;
    const g = G(a, l);
    v(wood, new CylinderGeometry(0.16, 0.22, 2.0, 6), c.L(a, l, g + 1.0));
    v(leaf, new IcosahedronGeometry(1.5, 0), c.L(a, l, g + 2.8), [0, k, 0], [1, 0.85, 1]);
    for (let f = 0; f < 4; f++) v(k % 2 ? red : plum, ball(0.14), c.L(a + Math.cos(f * 1.7) * 1.1, l + Math.sin(f * 1.7) * 1.1, g + 2.6 + (f % 2) * 0.4));
  }
  // the pollinator meadow and its beehives, at the far end
  for (let k = 0; k < 90; k++) {
    const a = 15.5 + ((k * 37) % 75) / 10;
    const l = 14.5 + ((k * 53) % 200) / 10;
    const g = G(a, l);
    // a tuft, and its flowers held above it
    v(k % 3 ? leaf : paleLeaf, ball(0.38), c.L(a, l, g + 0.2), [0, 0, 0], [1, 0.8, 1]);
    v(flowers[k % flowers.length], ball(0.16), c.L(a + 0.15, l, g + 0.6));
    if (k % 2) v(flowers[(k + 2) % flowers.length], ball(0.14), c.L(a - 0.2, l + 0.15, g + 0.52));
  }
  for (const [a, l] of [
    [17, 35.3],
    [19.5, 35.3],
    [22, 35.3],
  ]) {
    const g = G(a, l);
    v(0xf2f2ee, new BoxGeometry(1.0, 1.2, 1.0), c.L(a, l, g + 0.6));
    v(yellow, new BoxGeometry(1.1, 0.12, 1.1), c.L(a, l, g + 1.26));
  }
  // the herb spiral by the gate: a stone spiral climbing to its middle, herbs along it
  const sa = -11;
  const sl = 14.8;
  const sg = G(sa, sl);
  for (let k = 0; k < 14; k++) {
    const th = k * 0.75;
    const r = 1.9 - k * 0.12;
    const hgt = 0.2 + k * 0.08;
    v(stone, new BoxGeometry(0.5, hgt, 0.5), c.L(sa + Math.cos(th) * r, sl + Math.sin(th) * r, sg + hgt / 2));
    v(k % 2 ? leaf : paleLeaf, ball(0.24), c.L(sa + Math.cos(th) * r, sl + Math.sin(th) * r, sg + hgt + 0.15));
  }
  // the pond with its boardwalk
  const pa = 18.5;
  const pl = 45.5;
  const pg = G(pa, pl);
  c.add(c.world.mats.water, new CylinderGeometry(3, 3, 0.06, 20), c.L(pa, pl, pg + 0.05));
  v(stone, new TorusGeometry(3.05, 0.18, 4, 24).rotateX(Math.PI / 2), c.L(pa, pl, pg + 0.08));
  v(wood, new BoxGeometry(1.2, 0.15, 7.6), c.L(pa, pl - 0.5, pg + 0.35));
  for (const s of [-1, 1]) v(paleLeaf, new CylinderGeometry(0.6, 0.6, 0.05, 8), c.L(pa + s * 1.6, pl + 1.5, pg + 0.1));
  // the tool shed under a green roof, the compost bays and the rain tank
  const ha = -21.5;
  const hl = 47.5;
  const hg = G(ha, hl);
  v(wood, new BoxGeometry(3.2, 2.6, 4.4), c.L(ha, hl, hg + 1.3));
  v(0x5b8a45, new BoxGeometry(3.8, 0.3, 5.0), c.L(ha, hl, hg + 2.75));
  for (let k = 0; k < 3; k++) {
    v(wood, new BoxGeometry(1.4, 0.9, 1.4), c.L(ha + (k - 1) * 1.6, 43.5, G(ha, 43.5) + 0.45));
    v(soil, new BoxGeometry(1.2, 0.05, 1.2), c.L(ha + (k - 1) * 1.6, 43.5, G(ha, 43.5) + 0.92));
  }
  v(0x3d6b8a, new CylinderGeometry(0.9, 0.9, 2.2, 12), c.L(ha, 40.3, G(ha, 40.3) + 1.1));
  // gardeners at work among the beds and the orchard
  const clothes = [0x2f6db0, 0xc0392b, 0x2e8b57, 0xe0b020, 0x7d5ba6];
  [
    [-15.2, 41],
    [-7.2, 44],
    [4.8, 41],
    [9, 47],
    [-20.7, 23],
  ].forEach(([a, l], k) => {
    const g = G(a, l);
    v(clothes[k], new CylinderGeometry(0.26, 0.32, 1.1, 6), c.L(a, l, g + 0.55));
    v(0xd9a782, ball(0.2), c.L(a, l, g + 1.3));
    v(0xe8d8a8, new CylinderGeometry(0.34, 0.34, 0.06, 8), c.L(a, l, g + 1.48));
  });
  // the gate: a timber arch over the path with the garden's name
  const ga = -16;
  const gl = 14.2;
  const gg = G(ga, gl);
  for (const s of [-1.6, 1.6]) v(wood, new BoxGeometry(0.3, 3.2, 0.3), c.L(ga + s, gl, gg + 1.6));
  v(wood, new BoxGeometry(0.4, 0.4, 4.2), c.L(ga, gl, gg + 3.3));
  const fonts = fontOf();
  const name = canvasTex(512, 128, (g) => {
    g.fillStyle = "#3d5a2a";
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = "#f4efe2";
    g.font = `500 56px ${fonts.serif}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("Community Garden", 256, 66);
  });
  const sign = new Mesh(new PlaneGeometry(3.8, 0.95), new MeshBasicMaterial({ map: name }));
  sign.position.set(...c.L(ga, gl - 0.25, gg + 2.75));
  sign.rotation.y = -Math.PI / 2;
  c.group.add(sign);
  const back = sign.clone();
  back.position.set(...c.L(ga, gl + 0.25, gg + 2.75));
  back.rotation.y = Math.PI / 2;
  c.group.add(back);
}

// ------------------------------------------------------------------ 06 AI Weed Detector · Nanaimo: the berry greenhouse
function weed(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const L0 = 26;
  let gmax = -1e9;
  for (let a = -12; a <= 12; a += 4) for (let l = L0 - 8; l <= L0 + 8; l += 4) gmax = Math.max(gmax, c.G(a, l));
  const base = gmax + 0.2;
  c.add(mats.concrete, new BoxGeometry(18, 0.4, 28), c.L(0, L0, base));
  communityGarden(c);
  // the glass gridshell
  // a half cylinder lying along the line (its open half turned up), ribbed every 3 units
  const vault = new CylinderGeometry(8, 8, 26, 24, 1, true, -Math.PI / 2, Math.PI);
  c.add(mats.pane, vault, c.L(0, L0, base), [-Math.PI / 2, 0, 0], [1, 1, 0.9]);
  for (let k = -12; k <= 12; k += 3) c.add(mats.girder, new TorusGeometry(8, 0.08, 4, 24, Math.PI), c.L(k, L0, base), [0, 0, 0], [1, 0.9, 1]);
  // rows of blueberry bushes with weeds between them
  const bushes = new InstancedMesh(new IcosahedronGeometry(0.75, 1), new MeshStandardMaterial({ color: 0x35553a, roughness: 0.9, flatShading: true }), 60);
  const m4 = new Matrix4();
  let n = 0;
  const weedsAt: V3[] = [];
  const weedsAlong: number[] = [];
  for (let row = -2; row <= 2; row++) {
    for (let k = 0; k < 12; k++) {
      const a = -11 + k * 2;
      const l = L0 + row * 2.6;
      m4.compose(new Vector3(...c.L(a, l, base + 0.75)), new Quaternion(), new Vector3(1, 0.8 + ((k * 7 + row) % 3) * 0.12, 1));
      bushes.setMatrixAt(n++, m4);
      if ((k + row * 5) % 7 === 3 && row < 2) {
        weedsAt.push(c.L(a + 1, l + 1.3, base + 0.4));
        weedsAlong.push(a + 1);
      }
    }
  }
  c.group.add(bushes);
  const weedMat = new MeshStandardMaterial({ color: 0x8bc34a, roughness: 0.9 });
  for (const p of weedsAt) c.add(weedMat, new ConeGeometry(0.35, 0.9, 6), p);
  const boxes = weedsAt.map((p) => {
    const m = new Mesh(new BoxGeometry(1.1, 1.3, 1.1), new MeshBasicMaterial({ color: 0xf59e0b, wireframe: true }));
    m.position.set(p[0], p[1] + 0.3, p[2]);
    m.scale.setScalar(0);
    c.group.add(m);
    return m;
  });
  // the scanning gantry riding along the house
  const gantry = new Group();
  gantry.add(new Mesh(new BoxGeometry(14, 0.35, 0.5), mats.girder));
  const beamLine = new Mesh(new BoxGeometry(13, 0.06, 0.06), glowMat(0x7dd3fc, 2.6));
  beamLine.position.y = -0.25;
  gantry.add(beamLine);
  c.group.add(gantry);
  const gStart = new Vector3(...c.L(-11, L0, base + 5.6));
  const gEnd = new Vector3(...c.L(11, L0, base + 5.6));
  return {
    anchors: [new Vector3(...c.L(0, L0 - 7, base + 6.6)), new Vector3(...c.L(4, L0 - 4, base + 2.6)), new Vector3(...c.L(0, L0, base + 8.6))],
    focus: new Vector3(...c.L(0, L0 - 4, base + 3)),
    update: (t) => {
      const u = Math.sin(t * 0.35) * 0.5 + 0.5;
      gantry.position.lerpVectors(gStart, gEnd, u);
      const ga = -11 + u * 22;
      boxes.forEach((m, j) => {
        const hit = Math.abs(weedsAlong[j] - ga) < 1.4 || m.scale.x > 0.95;
        const s = m.scale.x + ((hit ? 1 : 0) - m.scale.x) * 0.25;
        m.scale.setScalar(u < 0.03 ? 0 : s);
      });
    },
  };
}

// ------------------------------------------------------------------ 07 ABCKidz · 29th Avenue: the Wonder Grounds
/**
 * A family recreation park by the station: an observation wheel with lit gondolas, a corkscrew slide tower, a
 * carousel under a striped canopy, a climbing-net dome, a splash pad with dancing jets and a rainbow arch at the gate,
 * on a lawn crossed by coloured paths. The wheel, the carousel and the jets move; the bulbs light up after dark.
 */
function abckidz(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const L0 = 27;
  let gmax = -1e9;
  for (let a = -18; a <= 18; a += 6) for (let l = 14; l <= 39; l += 5) gmax = Math.max(gmax, c.G(a, l));
  const base = gmax + 0.1;
  // the lawn and its paths, on a plinth that meets the ground
  const lawnTex = canvasTex(512, 380, (g) => {
    g.fillStyle = "#5f9a48";
    g.fillRect(0, 0, 512, 380);
    for (let k = 0; k < 400; k++) {
      g.fillStyle = `rgba(${k % 2 ? "255,255,255" : "0,40,0"},0.05)`;
      g.fillRect((k * 97) % 512, (k * 61) % 380, 14, 10);
    }
    // the paths (u across the park from the gate, v along it): a spine from the gate and a loop joining the rides,
    // in warm paving with a coloured line down the middle
    g.lineCap = "round";
    for (const [col, w] of [
      ["#e9dcc4", 30],
      ["#f2b33d", 6],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(270, 190, 190, 150, 0, 0, Math.PI * 2);
      g.moveTo(0, 190);
      g.lineTo(420, 190);
      g.stroke();
    }
  });
  const W = 40;
  const D = 27;
  const lawn = new Mesh(new PlaneGeometry(D, W), new MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(...c.L(0, L0, base + 0.16));
  c.group.add(lawn);
  c.add(mats.plat, new BoxGeometry(D, 4, W), c.L(0, L0, base - 1.85));

  const white = new MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.45 });
  const bulbMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const rainbow = [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7];
  const colMats = rainbow.map((col) => new MeshStandardMaterial({ color: col, roughness: 0.5, emissive: col, emissiveIntensity: 0.12 }));

  // the observation wheel: an A-frame each side, a rim of lights, sixteen gondolas that stay level as it turns
  const WA = -9;
  const WL = 34;
  const HUB = 12.5;
  const WR = 9.5;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const foot = new Vector3(...c.L(WA + t * 5, WL + s * 1.6, base));
      const hub = new Vector3(...c.L(WA, WL + s * 1.2, base + HUB));
      const d = hub.clone().sub(foot);
      const leg = new Mesh(new CylinderGeometry(0.28, 0.4, d.length(), 8), white);
      leg.position.copy(foot).add(hub).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(UP, d.normalize());
      c.group.add(leg);
    }
  }
  const wheel = new Group();
  wheel.position.set(...c.L(WA, WL, base + HUB));
  // the wheel turns about the lateral axis (local x)
  const rim = new Mesh(new TorusGeometry(WR, 0.22, 6, 72).rotateY(Math.PI / 2), white);
  const rim2 = new Mesh(new TorusGeometry(WR - 0.9, 0.12, 5, 72).rotateY(Math.PI / 2), white);
  wheel.add(rim, rim2, new Mesh(new CylinderGeometry(0.7, 0.7, 2.8, 16).rotateZ(Math.PI / 2), white));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const spoke = new Mesh(new CylinderGeometry(0.06, 0.06, WR, 4), white);
    spoke.position.set(0, (Math.sin(a) * WR) / 2, (Math.cos(a) * WR) / 2);
    spoke.rotation.x = -a + Math.PI / 2;
    wheel.add(spoke);
  }
  const NBULB = 64;
  const bulbs = new InstancedMesh(new SphereGeometry(0.16, 6, 4), bulbMat, NBULB);
  const m4 = new Matrix4();
  for (let k = 0; k < NBULB; k++) {
    const a = (k / NBULB) * Math.PI * 2;
    m4.makeTranslation(0.3, Math.sin(a) * (WR + 0.3), Math.cos(a) * (WR + 0.3));
    bulbs.setMatrixAt(k, m4);
    bulbs.setColorAt(k, new Color(rainbow[k % rainbow.length]));
  }
  wheel.add(bulbs);
  c.group.add(wheel);
  const gondolas: Mesh[] = [];
  for (let k = 0; k < 16; k++) {
    const g = new Mesh(new CylinderGeometry(0.9, 0.9, 1.4, 10), colMats[k % colMats.length]);
    const roof = new Mesh(new SphereGeometry(0.95, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), white);
    roof.position.y = 0.7;
    g.add(roof);
    c.group.add(g);
    gondolas.push(g);
  }

  // the corkscrew: a glass tower with two slides winding down round it, a red cap and a lookout
  const TA = 7;
  const TL = 33;
  const TH = 15;
  c.add(mats.pane, new CylinderGeometry(2.3, 2.3, TH, 20, 1, true), c.L(TA, TL, base + TH / 2));
  for (let k = 0; k <= 5; k++) c.add(white, new TorusGeometry(2.35, 0.12, 5, 24).rotateX(Math.PI / 2), c.L(TA, TL, base + k * 3));
  c.add(white, new CylinderGeometry(2.9, 2.9, 0.4, 24), c.L(TA, TL, base + TH));
  c.add(colMats[0], new ConeGeometry(3.1, 3, 20), c.L(TA, TL, base + TH + 1.7));
  ([
    [0, colMats[2], 2.6],
    [Math.PI, colMats[4], 2.2],
  ] as const).forEach(([phase, mat, turns]) => {
    const pts: Vector3[] = [];
    for (let k = 0; k <= 80; k++) {
      const u = k / 80;
      const ang = phase + u * turns * Math.PI * 2;
      const [x, , z] = c.L(TA + Math.cos(ang) * 3.7, TL + Math.sin(ang) * 3.7, 0);
      pts.push(new Vector3(x, base + 0.8 + (TH - 1.2) * (1 - u), z));
    }
    c.add(mat, new TubeGeometry(new CatmullRomCurve3(pts), 160, 0.55, 8, false));
  });

  // the carousel: a disc, a centre column, a striped canopy, horses on poles; it turns
  const CA = 10;
  const CL = 19;
  const carousel = new Group();
  carousel.position.set(...c.L(CA, CL, base));
  const stripes = canvasTex(256, 32, (g) => {
    for (let k = 0; k < 16; k++) {
      g.fillStyle = k % 2 ? "#fef3c7" : "#ef4444";
      g.fillRect(k * 16, 0, 16, 32);
    }
  });
  const canopy = new Mesh(new ConeGeometry(4.6, 2.4, 32, 1, true), new MeshStandardMaterial({ map: stripes, roughness: 0.6, side: DoubleSide }));
  canopy.position.y = 5.2;
  const disc = new Mesh(new CylinderGeometry(4.2, 4.3, 0.5, 32), white);
  disc.position.y = 0.25;
  const column = new Mesh(new CylinderGeometry(0.8, 0.8, 4, 12), colMats[2]);
  column.position.y = 2.3;
  carousel.add(canopy, disc, column);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = Math.cos(a) * 3.2;
    const z = Math.sin(a) * 3.2;
    const pole = new Mesh(new CylinderGeometry(0.06, 0.06, 3.6, 5), white);
    pole.position.set(x, 2.3, z);
    const horse = new Mesh(new BoxGeometry(0.5, 0.7, 1.4), colMats[k % colMats.length]);
    horse.position.set(x, 1.4 + (k % 2) * 0.4, z);
    horse.rotation.y = -a;
    carousel.add(pole, horse);
  }
  const ringBulbs = new InstancedMesh(new SphereGeometry(0.13, 6, 4), bulbMat, 24);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * 4.5, 4.05, Math.sin(a) * 4.5);
    ringBulbs.setMatrixAt(k, m4);
    ringBulbs.setColorAt(k, new Color(k % 2 ? 0xffe7a8 : 0xffffff));
  }
  carousel.add(ringBulbs);
  c.group.add(carousel);

  // the climbing dome: a geodesic net of rope over a soft floor
  const DA = -6;
  const DL = 20;
  const ico = new IcosahedronGeometry(3.6, 1);
  const ip = ico.attributes.position;
  const ropeMat = new MeshStandardMaterial({ color: 0xc2410c, roughness: 0.7 });
  const seen = new Set<string>();
  for (let i = 0; i < ip.count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const A = new Vector3(ip.getX(i + k), ip.getY(i + k), ip.getZ(i + k));
      const B = new Vector3(ip.getX(i + ((k + 1) % 3)), ip.getY(i + ((k + 1) % 3)), ip.getZ(i + ((k + 1) % 3)));
      if (A.y < -0.1 || B.y < -0.1) continue;
      const key = [A, B].map((v) => v.toArray().map((n) => n.toFixed(2)).join(",")).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const d = B.clone().sub(A);
      const [cx, cy, cz] = c.L(DA, DL, base);
      const mid = A.clone().add(B).multiplyScalar(0.5).add(new Vector3(cx, cy, cz));
      const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
      c.add(ropeMat, new CylinderGeometry(0.08, 0.08, d.length(), 5), [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
    }
  }
  ico.dispose();
  c.add(colMats[4], new CylinderGeometry(3.7, 3.7, 0.2, 24), c.L(DA, DL, base + 0.1));

  // the splash pad: a shallow pool and a ring of jets that rise and fall in turn
  const SA = -15;
  const SL = 21;
  c.add(new MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.2, emissive: 0x0ea5e9, emissiveIntensity: 0.25 }), new CylinderGeometry(3.4, 3.4, 0.12, 28), c.L(SA, SL, base + 0.2));
  const jetMat = new MeshStandardMaterial({ color: 0xe0f7ff, transparent: true, opacity: 0.6, roughness: 0.1, depthWrite: false });
  const jets: Mesh[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const jet = new Mesh(new CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0), jetMat);
    jet.position.set(...c.L(SA + Math.cos(a) * 2.2, SL + Math.sin(a) * 2.2, base + 0.25));
    c.group.add(jet);
    jets.push(jet);
  }

  // the rainbow gate on the station side, a band of each colour arching over the path
  colMats.forEach((m, j) => c.add(m, new TorusGeometry(5.6 - j * 0.42, 0.21, 6, 40, Math.PI).rotateY(Math.PI / 2), c.L(0, 14.5, base)));
  // soft mats under the carousel and the wheel
  c.add(colMats[3], new CylinderGeometry(5.2, 5.2, 0.12, 32), c.L(CA, CL, base + 0.18));
  c.add(colMats[5], new CylinderGeometry(6.5, 6.5, 0.12, 32), c.L(WA, WL, base + 0.18));

  const city = c.world.buildings.solid;
  return {
    anchors: [new Vector3(...c.L(WA, WL, base + HUB + WR + 1)), new Vector3(...c.L(TA, TL, base + TH + 3.5)), new Vector3(...c.L(CA, CL, base + 7))],
    focus: new Vector3(...c.L(0, L0, base + 7)),
    update: (t) => {
      const turn = t * 0.12;
      wheel.rotation.x = turn;
      // round the rim as the wheel turns (a turn about x carries the angle back), hanging level beneath it
      gondolas.forEach((g, k) => {
        const a = (k / 16) * Math.PI * 2 - turn;
        g.position.set(wheel.position.x, wheel.position.y + Math.sin(a) * WR - 1.2, wheel.position.z + Math.cos(a) * WR);
      });
      carousel.rotation.y = t * 0.5;
      jets.forEach((j, k) => j.scale.set(1, 0.4 + 2.2 * (0.5 + 0.5 * Math.sin(t * 2.2 + k * 0.8)) ** 2, 1));
      // the bulbs come up with the city's windows, and the gondolas' lights with them
      const night = Math.min(1, city.emissiveIntensity * 1.2);
      bulbMat.color.setScalar(0.35 + 1.4 * night);
      for (const m of colMats) m.emissiveIntensity = 0.12 + 0.45 * night;
    },
  };
}

// ------------------------------------------------------------------ 08 More projects · Joyce–Collingwood: the Project Gallery
/** The Project Gallery's cloth banners, five on the arcade toward the line and five toward the street (galleryArt.ts). */
const GALLERY_ART: { front: BannerArt[]; back: BannerArt[] } = {
  front: ["jianzhi", "parol", "phulkari", "dongson", "salmon"],
  back: ["rangoli", "bojagi", "girih", "asanoha", "papel"],
};

/**
 * Joyce–Collingwood's Project Gallery, one hall of the neighbourhood's cultures on the old footprint:
 * - a Chinese two-tier roof: green glazed tiles over a hip-and-gable upper roof with upturned eaves and a gold ridge
 *   curling at its ends, and a lower pent roof wrapping the hall at the upper floor, its sunny slope laid in solar tiles;
 * - a shophouse arcade: red lacquered columns with bracket sets under the pent eave, the stalls behind warm glass, red
 *   lanterns at every column, ten community artworks hung as cloth banners between them;
 * - the upper floor screened in Filipino capiz windows and South Asian jali in turn, glowing after dark, parol stars in
 *   its windows;
 * - two sandstone chhatri kiosks flanking the way in, and the hall's name on a lacquered plaque on every side.
 * Inside, a stall for each of the other projects (data moreProjects), and upstairs a workshop; the skybridge comes in
 * from the platform at the upper floor.
 */
function more(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const A0 = -18;
  const A1 = 18;
  const LF = 17;
  const LB = 33;
  let gmax = -1e9;
  for (let a = A0; a <= A1; a += 6) for (let l = LF - 3; l <= LB; l += 4) gmax = Math.max(gmax, c.G(a, l));
  const base = gmax + 0.1;
  // the upper floor meets the platform's level, so the bridge runs level; the market below is as tall as that makes it
  const UP1 = Math.max(base + 4.6, 1.4);
  const TOP = UP1 + 4.4;
  const LM = (LF + LB) / 2;
  const LW = LB - LF;
  const AW = A1 - A0;
  const H1 = UP1 - base;
  const zs = Math.sign(c.L(1, 0, 0)[2]) || 1;
  // the painted parts, some glowing after dark (the lanterns, the parols): one vertex-coloured material
  const vc = shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), c.world);
  const part = (geo: BufferGeometry, hex: number, a: number, l: number, u: number, glow = 0) => {
    const g = paint(geo, hex);
    c.add(vc, glow ? lit(g, glow) : g, c.L(a, l, u));
  };
  const RED = 0xb3261e;
  const GOLD = 0xd4a641;
  const GREEN = 0x2f7d5a;
  const SANDSTONE = 0xd8b98a;
  // the plinth and the plaza in front, down to the ground
  c.add(mats.plat, new BoxGeometry(LW + 8, 3, AW + 6), c.L(0, LM - 3, base - 1.5));
  // the market floor: warm glass shopfronts between timber posts, set back behind the arcade
  c.add(mats.pane, new BoxGeometry(LW, H1, AW), c.L(0, LM, (base + UP1) / 2));
  for (let a = A0; a <= A1 + 0.01; a += 4) {
    for (const l of [LF, LB]) c.add(mats.timber, new BoxGeometry(0.4, H1, 0.4), c.L(a, l, (base + UP1) / 2));
  }
  for (const a of [A0, A1]) for (let l = LF; l <= LB + 0.01; l += 4) c.add(mats.timber, new BoxGeometry(0.4, H1, 0.4), c.L(a, l, (base + UP1) / 2));

  // a stall for each of the other projects (data moreProjects), side by side along the hall: a white plinth with a
  // band of the project's colour, the model on it, a lit board behind it with the project's name and what it is (all
  // the boards one atlas, galleryArt.ts)
  const fonts = fontOf();
  const STALL_COLS = [0xef4444, 0xf59e0b, 0x6366f1, 0x10b981, 0xec4899, 0x06b6d4, 0xfacc15];
  const hex = (k: number) => `#${k.toString(16).padStart(6, "0")}`;
  const n = moreProjects.length;
  const bay = AW / n;
  const anchors: Vector3[] = [];
  const facing = -Math.PI / 2;
  const stallLight = glowMat(0xffe2b0, 0.6);
  const boards = boardsAtlas(moreProjects, moreProjects.map((_, j) => hex(STALL_COLS[j % STALL_COLS.length])), fonts);
  const boardMat = new MeshBasicMaterial({ map: boards.tex, toneMapped: false });
  // a plane w × h showing the rectangle r of an atlas
  const atlasPlane = (w: number, h: number, r: [number, number, number, number]) => {
    const g = new PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, r[0] + uv.getX(k) * (r[2] - r[0]), r[1] + uv.getY(k) * (r[3] - r[1]));
    return g;
  };
  // the exhibits' models, each painted its project's colour, in one mesh
  const modelMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
  moreProjects.forEach((_, j) => {
    const col = STALL_COLS[j % STALL_COLS.length];
    const a = A0 + bay * (j + 0.5);
    // the exhibit: a white plinth with a lit band of its colour at its foot, the model on it (each a shape of its own),
    // its spotlight over it, and a white wall between bays
    c.add(mats.plat, new BoxGeometry(1.6, 1.0, 1.6), c.L(a, LM - 1, base + 0.5));
    const band = new BoxGeometry(1.64, 0.08, 1.64);
    const [su, sv] = boards.swatch[j];
    for (let k = 0; k < band.attributes.uv.count; k++) band.attributes.uv.setXY(k, su, sv);
    c.add(boardMat, band, c.L(a, LM - 1, base + 0.06));
    const model = [new IcosahedronGeometry(0.55, 0), new TorusGeometry(0.45, 0.16, 8, 20), new OctahedronGeometry(0.6, 0), new ConeGeometry(0.5, 1.1, 6), new BoxGeometry(0.75, 0.75, 0.75).rotateY(0.6).rotateX(0.5)][j % 5];
    c.add(modelMat, paint(model, col), c.L(a, LM - 1, base + 1.65));
    c.add(stallLight, new CylinderGeometry(0.25, 0.4, 0.3, 10), c.L(a, LM - 1, UP1 - 0.35));
    if (j > 0) c.add(mats.plat, new BoxGeometry(LW - 4, Math.min(3, H1 - 0.4), 0.2), c.L(A0 + bay * j, LM + 1, base + Math.min(3, H1 - 0.4) / 2));
    // the board on the wall behind it, two faces back to back: it reads from the counter and through the glass behind
    const bh = Math.min(2.6, H1 - 1.2);
    for (const [ry, dl] of [
      [facing, 0],
      [-facing, 0.03],
    ])
      c.add(boardMat, atlasPlane(bay - 1.6, bh, boards.board[j]), c.L(a, LB - 4 + dl, base + 1.2 + bh / 2), [0, ry, 0]);
    // a warm lamp over the stall, under the upper floor
    c.add(stallLight, new BoxGeometry(LW - 6, 0.12, 0.5), c.L(a, LM, UP1 - 0.4));
    anchors.push(new Vector3(...c.L(a, LF - 0.4, UP1 + 0.4)));
  });

  // the floor between the storeys
  c.add(mats.plat, new BoxGeometry(LW + 0.6, 0.5, AW + 0.6), c.L(0, LM, UP1));
  // the upper floor's screens, capiz and jali in turn (a bay each, 3 wide), a gap on the front for the skybridge's door
  const screens = screenTextures(c.lowEnd);
  const screenMat = new MeshStandardMaterial({ map: screens.map, emissiveMap: screens.glow, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.75 });
  const DOOR: [number, number] = [-7.75, -5.15];
  const wallPos: number[] = [];
  const wallNor: number[] = [];
  const wallUv: number[] = [];
  const y0 = UP1 + 0.25;
  // a wall from p to q (along, lateral), facing out along (na, nl); u counts 6 to a tile from `u0`
  const screen = (p: [number, number], q: [number, number], na: number, nl: number, u0: number) => {
    const [pa, pl] = p;
    const [qa, ql] = q;
    const len = Math.hypot(qa - pa, ql - pl);
    const corners: [number, number, number, number][] = [
      [pa, pl, y0, 0],
      [qa, ql, y0, 0],
      [qa, ql, TOP + 0.35, 1],
      [pa, pl, TOP + 0.35, 1],
    ];
    const P = corners.map(([a, l, u]) => c.L(a, l, u));
    const N = c.L(na, nl, 0);
    // wound to face out: (p0, p1, p2) faces along (p1 - p0) × (p2 - p0)
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
    const e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    const fx = e1[1] * e2[2] - e1[2] * e2[1];
    const fz = e1[0] * e2[1] - e1[1] * e2[0];
    const out = fx * N[0] + fz * N[2] > 0;
    for (const k of out ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      wallPos.push(...P[k]);
      wallNor.push(N[0], 0, N[2]);
      wallUv.push((u0 + (k === 1 || k === 2 ? len : 0)) / 6, corners[k][3]);
    }
  };
  screen([A0 + 0.2, LF + 0.2], [DOOR[0], LF + 0.2], 0, -1, 0);
  screen([DOOR[1], LF + 0.2], [A1 - 0.2, LF + 0.2], 0, -1, DOOR[1] - A0);
  screen([A0 + 0.2, LB - 0.2], [A1 - 0.2, LB - 0.2], 0, 1, 0);
  for (const [a, s] of [
    [A0 + 0.2, -1],
    [A1 - 0.2, 1],
  ] as const)
    screen([a, LF + 0.2], [a, LB - 0.2], s, 0, 0);
  const wallGeo = new BG();
  wallGeo.setAttribute("position", new Float32BufferAttribute(wallPos, 3));
  wallGeo.setAttribute("normal", new Float32BufferAttribute(wallNor, 3));
  wallGeo.setAttribute("uv", new Float32BufferAttribute(wallUv, 2));
  c.add(screenMat, wallGeo);
  // the door's red frame where the skybridge comes in
  for (const a of DOOR) part(new BoxGeometry(0.3, TOP - y0 - 1.2, 0.3), RED, a, LF + 0.1, y0 + (TOP - y0 - 1.2) / 2);
  part(new BoxGeometry(0.34, 0.4, DOOR[1] - DOOR[0] + 0.3), RED, (DOOR[0] + DOOR[1]) / 2, LF + 0.1, TOP - 1.2);
  // parol stars hung in the capiz windows, front and back, lit after dark
  const PAROL = [0xd4342c, 0xf2b632, 0x2f6bd0, 0x2e9b5f, 0xe2559a];
  const starShape = new Shape();
  for (let k = 0; k < 10; k++) {
    const ang = Math.PI / 2 + (k / 10) * Math.PI * 2;
    const r = k % 2 ? 0.24 : 0.58;
    if (k) starShape.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    else starShape.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  let pk = 0;
  for (let a = A0 + 1.5; a < A1; a += 6) {
    for (const [l, s] of [
      [LF + 0.2, -1],
      [LB - 0.2, 1],
    ] as const) {
      // clear of the skybridge's door and of the name plaques
      if (s < 0 && ((a > DOOR[0] - 1 && a < DOOR[1] + 1) || (a > 0 && a < 13))) continue;
      if (s > 0 && a > -6.6 && a < 6.6) continue;
      const col = PAROL[pk++ % PAROL.length];
      const y = UP1 + 2.9;
      const lo = l + s * 0.3;
      c.add(vc, lit(paint(new ExtrudeGeometry(starShape, { depth: 0.1, bevelEnabled: false }).rotateY(Math.PI / 2), col), 1.1), c.L(a, lo, y));
      c.add(vc, lit(paint(new TorusGeometry(0.62, 0.035, 4, 20).rotateY(Math.PI / 2), 0xf2e2b0), 0.8), c.L(a, lo, y));
      for (const dt of [-0.18, 0.18]) part(new BoxGeometry(0.04, 1.0, 0.06), 0xf2b632, a + dt * zs, lo, y - 1.05, 0.8);
    }
  }
  // upstairs, a workshop for whoever builds the next one: long tables under lamps
  for (let a = A0 + 4; a <= A1 - 4; a += 7) {
    c.add(mats.timber, new BoxGeometry(LW - 7, 0.15, 1.6), c.L(a, LM, UP1 + 1.05));
    for (const s of [-1, 1]) c.add(mats.timber, new BoxGeometry(LW - 7, 0.12, 0.4), c.L(a + s * 1.3, LM, UP1 + 0.7));
    c.add(stallLight, new BoxGeometry(LW - 8, 0.1, 0.3), c.L(a, LM, TOP - 0.5));
  }

  // the roofs: surfaces over the plan (along, lateral), each quad flat in its own colour, faced up, a dark timber
  // soffit under it and a red fascia round its eave
  const roofPos: number[] = [];
  const roofCol: number[] = [];
  const lin = (hx: number) => {
    const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return [f(((hx >> 16) & 255) / 255), f(((hx >> 8) & 255) / 255), f((hx & 255) / 255)];
  };
  const tri = (p: V3[], col: number[], up: boolean) => {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const order = ny > 0 === up ? [0, 1, 2] : [0, 2, 1];
    for (const k of order) {
      roofPos.push(...p[k]);
      roofCol.push(...col);
    }
  };
  const quad = (p: V3[], hx: number, up = true) => {
    const col = lin(hx);
    tri([p[0], p[1], p[2]], col, up);
    tri([p[0], p[2], p[3]], col, up);
  };
  const SOFFIT = 0x5a3a24;
  /** Lay a roof: its height h(a, l) over [a0, a1] × [l0, l1] in steps, each quad's colour by tone(a, l, i, j) (its middle
   * and its place in the grid), skipping quads where skip(a, l); the soffit `thick` below it, and the fascia along the
   * outer edges. */
  const roof = (as: number[], ls: number[], h: (a: number, l: number) => number, tone: (a: number, l: number, i: number, j: number) => number, skip: (a: number, l: number) => boolean, thick: number) => {
    for (let i = 0; i + 1 < as.length; i++) {
      for (let j = 0; j + 1 < ls.length; j++) {
        const am = (as[i] + as[i + 1]) / 2;
        const lm = (ls[j] + ls[j + 1]) / 2;
        if (skip(am, lm)) continue;
        const pts: [number, number][] = [
          [as[i], ls[j]],
          [as[i + 1], ls[j]],
          [as[i + 1], ls[j + 1]],
          [as[i], ls[j + 1]],
        ];
        quad(
          pts.map(([a, l]) => c.L(a, l, h(a, l))),
          tone(am, lm, i, j),
        );
        quad(
          pts.map(([a, l]) => c.L(a, l, h(a, l) - thick)),
          SOFFIT,
          false,
        );
        // the fascia on an outer edge (or one beside a skipped quad)
        const edges: [number, number, boolean][] = [
          [0, 1, j === 0 || skip(am, ls[j] - 0.01 - (ls[j + 1] - ls[j]) / 2)],
          [1, 2, i + 2 === as.length || skip(as[i + 1] + 0.01 + (as[i + 1] - as[i]) / 2, lm)],
          [2, 3, j + 2 === ls.length || skip(am, ls[j + 1] + 0.01 + (ls[j + 1] - ls[j]) / 2)],
          [3, 0, i === 0 || skip(as[i] - 0.01 - (as[i + 1] - as[i]) / 2, lm)],
        ];
        for (const [x, y, open] of edges) {
          if (!open) continue;
          const [pa, pl] = pts[x];
          const [qa, ql] = pts[y];
          const f = [c.L(pa, pl, h(pa, pl)), c.L(qa, ql, h(qa, ql)), c.L(qa, ql, h(qa, ql) - thick), c.L(pa, pl, h(pa, pl) - thick)];
          const col = lin(RED);
          // faced away from the quad's middle
          const mid = c.L(am, lm, 0);
          const e1 = [f[1][0] - f[0][0], f[1][2] - f[0][2]];
          const nx = e1[1];
          const nz = -e1[0];
          const outward = nx * (f[0][0] - mid[0]) + nz * (f[0][2] - mid[2]) > 0;
          const o = outward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
          // (a, b, c) faces along (b - a) × (c - a): its horizontal part is (e1.z, -e1.x) for the first winding
          for (const k of o) {
            roofPos.push(...f[k]);
            roofCol.push(...col);
          }
        }
      }
    }
  };
  const steps = (from: number, to: number, step: number, keep: number[] = []) => {
    const out: number[] = [];
    const k = Math.max(1, Math.round((to - from) / step));
    for (let i = 0; i <= k; i++) out.push(from + ((to - from) * i) / k);
    for (const v of keep) if (v > from && v < to && !out.some((o) => Math.abs(o - v) < 1e-3)) out.push(v);
    return out.sort((x, y) => x - y);
  };
  // the tiles' ribs a quad wide, in two greens close together
  const step = c.lowEnd ? 1.0 : 0.5;
  const GREEN2 = 0x286c4e;
  // the lower tier: a pent roof round the hall from the upper floor's foot out over the arcade, mitred at the corners,
  // its corners turned up; the slope facing the sun laid in dark solar tiles; open over the skybridge
  const PO = 1.6;
  const lift = (a: number, l: number, a0: number, a1: number, l0: number, l1: number, r: number, up: number) => {
    const d = Math.hypot(Math.min(a - a0, a1 - a), Math.min(l - l0, l1 - l));
    return up * Math.max(0, 1 - d / r) ** 2;
  };
  const pentD = (a: number, l: number) => Math.max(A0 - a, a - A1, LF - l, l - LB, 0);
  const pentH = (a: number, l: number) => UP1 + 0.8 - (pentD(a, l) / PO) * 0.95 + lift(a, l, A0 - PO, A1 + PO, LF - PO, LB + PO, 3, 0.45);
  // which way each of the pent's four slopes faces in the world: the sunniest (most southerly, +z) takes the solar tiles
  const sideOf = (a: number, l: number) => {
    const da = Math.max(A0 - a, a - A1);
    const dl = Math.max(LF - l, l - LB);
    return dl >= da ? (l < LM ? 0 : 1) : a < 0 ? 2 : 3;
  };
  const outwardZ = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ].map(([da, dl]) => fromStation(c.i, da, LM + dl)[1] - fromStation(c.i, 0, LM)[1]);
  const sunny = outwardZ.indexOf(Math.max(...outwardZ));
  roof(
    steps(A0 - PO, A1 + PO, step, [A0, A1, DOOR[0], DOOR[1]]),
    steps(LF - PO, LB + PO, step, [LF, LB]),
    pentH,
    (a, l, i, j) => (sideOf(a, l) === sunny ? ((i + j) % 2 ? 0x1c2a44 : 0x24365a) : (sideOf(a, l) < 2 ? i : j) % 2 ? GREEN : GREEN2),
    (a, l) => pentD(a, l) <= 0 || (l < LF && a > DOOR[0] && a < DOOR[1]),
    0.2,
  );
  // the upper tier: hip-and-gable (xieshan), its eaves 1.5 out; the ends hipped up to the gables, set back 3.4 from
  // them, the long slopes rising to a gold ridge between; every slope sagging a little, its corners turned up
  const EO = 1.5;
  const ea0 = A0 - EO;
  const ea1 = A1 + EO;
  const el0 = LF - EO;
  const el1 = LB + EO;
  const W2 = (el1 - el0) / 2;
  const RISE = 2.4;
  const GABLE = 3.4;
  const eaveY = TOP + 0.3;
  const longH = (l: number) => eaveY + RISE * (Math.min(l - el0, el1 - l, W2) / W2) ** 1.6;
  const hipH = (a: number) => eaveY + RISE * 0.45 * Math.min(1, Math.min(a - ea0, ea1 - a) / GABLE) ** 1.4;
  const upturn = (a: number, l: number) => lift(a, l, ea0, ea1, el0, el1, 3.5, 0.6);
  const ends = [ea0 + GABLE, ea1 - GABLE];
  const ls = steps(el0, el1, step, [LM]);
  const tiles = (a: number, l: number, i: number, j: number) => {
    const da = Math.min(a - ea0, ea1 - a);
    const dl = Math.min(l - el0, el1 - l);
    // the tiles' ribs run down each slope: across the long slopes along the hall, across the hips along the ends
    return (da < GABLE && da < dl ? j : i) % 2 ? GREEN : GREEN2;
  };
  // the two hipped ends, then the gabled middle (separate, so the gables stand sheer between them)
  roof(steps(ea0, ends[0], step), ls, (a, l) => Math.min(longH(l), hipH(a)) + upturn(a, l), tiles, () => false, 0.22);
  roof(steps(ends[1], ea1, step), ls, (a, l) => Math.min(longH(l), hipH(a)) + upturn(a, l), tiles, () => false, 0.22);
  roof(steps(ends[0], ends[1], step), ls, (a, l) => longH(l) + upturn(a, l), tiles, () => false, 0.22);
  // the gables: red boards between the hip's top and the gable's slopes, a gold fish hanging at each peak
  for (const a of ends) {
    for (let j = 0; j + 1 < ls.length; j++) {
      const [l0, l1] = [ls[j], ls[j + 1]];
      const lo0 = Math.min(longH(l0), eaveY + RISE * 0.45);
      const lo1 = Math.min(longH(l1), eaveY + RISE * 0.45);
      if (longH(l0) - lo0 < 0.01 && longH(l1) - lo1 < 0.01) continue;
      const f = [c.L(a, l0, lo0), c.L(a, l1, lo1), c.L(a, l1, longH(l1) - 0.05), c.L(a, l0, longH(l0) - 0.05)];
      for (const s of [1, -1]) {
        // both faces, the outer one toward its end
        const o = s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const k of o) {
          roofPos.push(...f[k]);
          roofCol.push(...lin(0x9e2a1f));
        }
      }
    }
    part(new BoxGeometry(0.12, 0.7, 0.3), GOLD, a + Math.sign(a) * 0.05, LM, longH(LM) - 0.45);
  }
  const roofGeo = new BG();
  roofGeo.setAttribute("position", new Float32BufferAttribute(roofPos, 3));
  roofGeo.setAttribute("color", new Float32BufferAttribute(roofCol, 3));
  roofGeo.setAttribute("uv", new Float32BufferAttribute(new Float32Array((roofPos.length / 3) * 2), 2));
  roofGeo.computeVertexNormals();
  c.add(vc, roofGeo);
  // the gold ridge between the gables, curling up at both ends
  const ridgeY = longH(LM);
  part(new BoxGeometry(0.34, 0.3, ends[1] - ends[0] + 0.4), GOLD, 0, LM, ridgeY + 0.1);
  for (const [a, s] of [
    [ends[0], -1],
    [ends[1], 1],
  ] as const) {
    const curl = new TorusGeometry(0.3, 0.09, 6, 12, Math.PI * 1.4).rotateZ(s > 0 ? -0.2 : Math.PI - 1.2);
    // the curl stands in the along-up plane: torus in x-y, turned so its x runs along the hall
    c.add(vc, paint(curl.rotateY(zs > 0 ? -Math.PI / 2 : Math.PI / 2), GOLD), c.L(a - s * 0.1, LM, ridgeY + 0.5));
  }

  // the arcade: red lacquered columns on stone bases round the hall under the pent eave, a bracket set on each (stacked
  // blocks in red, green and gold under a red beam), a red lantern hung from each, its glow on the red after dark
  const COL_A = [-18, -13.5, -9, -4.5, 0, 4.5, 9, 13.5, 18];
  const colTop = UP1 - 0.95;
  const column = (a: number, l: number, alongA: boolean) => {
    part(new CylinderGeometry(0.34, 0.38, 0.28, 10), 0x8d8a83, a, l, base + 0.14);
    part(new CylinderGeometry(0.2, 0.23, colTop - base - 0.28, 10), RED, a, l, (base + 0.28 + colTop) / 2, 0.45);
    // the brackets: each tier longer along the beam than the one under it
    const along = (len: number, w: number) => (alongA ? new BoxGeometry(w, 0.18, len) : new BoxGeometry(len, 0.18, w));
    part(new BoxGeometry(0.5, 0.18, 0.5), RED, a, l, colTop + 0.09, 0.4);
    part(along(1.0, 0.42), GREEN, a, l, colTop + 0.27, 0.4);
    part(along(1.5, 0.36), RED, a, l, colTop + 0.45, 0.4);
    part(along(1.5, 0.38), GOLD, a, l, colTop + 0.36, 0.4);
    // the lantern, on the column's outer face
    const [la, ll] = alongA ? [a, l + (l < LM ? -0.42 : 0.42)] : [a + (a < 0 ? -0.42 : 0.42), l];
    part(new CylinderGeometry(0.015, 0.015, 0.35, 3), 0x24272c, la, ll, colTop - 0.1);
    part(new SphereGeometry(0.3, 10, 7).scale(1, 1.25, 1), 0xd8261e, la, ll, colTop - 0.6, 0.9);
    for (const dy of [-0.38, 0.38]) part(new CylinderGeometry(0.16, 0.16, 0.08, 8), GOLD, la, ll, colTop - 0.6 + dy);
    part(new CylinderGeometry(0.03, 0.06, 0.4, 5), 0xf2b632, la, ll, colTop - 1.18);
  };
  for (const a of COL_A) {
    column(a, LF - 1.3, true);
    column(a, LB + 1.3, true);
  }
  for (let l = LF; l <= LB + 0.01; l += 4) {
    column(A0 - 1.3, l, false);
    column(A1 + 1.3, l, false);
  }
  // the beams over the columns, round the arcade
  const beamY = colTop + 0.66;
  for (const l of [LF - 1.3, LB + 1.3]) part(new BoxGeometry(0.3, 0.25, AW + 2.9), RED, 0, l, beamY, 0.35);
  for (const a of [A0 - 1.3, A1 + 1.3]) part(new BoxGeometry(LW + 2.9, 0.25, 0.3), RED, a, LM, beamY, 0.35);

  // the banners between the columns, five toward the line and five toward the street, on gold rods (the skybridge's
  // bay and the doors left open)
  const arts = [...GALLERY_ART.front, ...GALLERY_ART.back];
  const atlas = galleryAtlas(c.lowEnd, arts, n, fonts);
  const artMat = new MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.85 });
  const BW = 3.2;
  const BH = Math.min(3.0, H1 - 1.6);
  const BAYS = { front: [-15.75, -11.25, 6.75, 11.25, 15.75], back: [-15.75, -11.25, -2.25, 11.25, 15.75] };
  arts.forEach((_, k) => {
    const front = k < 5;
    const a = (front ? BAYS.front : BAYS.back)[k % 5];
    const l = front ? LF - 1.3 : LB + 1.3;
    const top = beamY - 0.2;
    c.add(artMat, atlasPlane(BW, BH, atlas.banner[k]), c.L(a, l, top - 0.1 - BH / 2), [0, front ? facing : -facing, 0]);
    part(new CylinderGeometry(0.04, 0.04, BW + 0.4, 6).rotateX(Math.PI / 2), GOLD, a, l, top - 0.05);
    part(new CylinderGeometry(0.03, 0.03, BW + 0.1, 5).rotateX(Math.PI / 2), 0x3b2416, a, l, top - 0.15 - BH);
  });
  // the name plaque on all four sides of the upper floor, in black lacquer framed red and gold (the atlas's plaque)
  const plaqueAt: [number, number, number, number][] = [
    [6.5, LF + 0.2, -1, 12],
    [0, LB - 0.2, 1, 12],
    [A0 + 0.2, LM, -1, 9],
    [A1 - 0.2, LM, 1, 9],
  ];
  plaqueAt.forEach(([a, l, s, w], k) => {
    const h = w / PLAQUE_RATIO;
    const y = UP1 + 2.55;
    const onLong = k < 2;
    const [fa, fl] = onLong ? [a, l + s * 0.2] : [a + s * 0.2, l];
    part(onLong ? new BoxGeometry(0.16, h + 0.3, w + 0.3) : new BoxGeometry(w + 0.3, h + 0.3, 0.16), RED, onLong ? a : a + s * 0.1, onLong ? l + s * 0.1 : l, y);
    const ry = onLong ? (s < 0 ? facing : -facing) : s * zs > 0 ? 0 : Math.PI;
    c.add(artMat, atlasPlane(w, h, atlas.plaque), c.L(fa, fl, y), [0, ry, 0]);
  });

  // the plaza: two chhatri kiosks of sandstone flanking the way in (four columns, a deep eave, a dome and a gold
  // finial), planters and benches either side
  for (const a of [-3, 3]) {
    const l = LF - 4.3;
    part(new BoxGeometry(2.4, 0.4, 2.4), SANDSTONE, a, l, base + 0.2);
    for (const [da, dl] of [
      [-0.85, -0.85],
      [0.85, -0.85],
      [-0.85, 0.85],
      [0.85, 0.85],
    ])
      part(new CylinderGeometry(0.13, 0.16, 2.2, 8), SANDSTONE, a + da, l + dl, base + 1.5, 0.3);
    part(new BoxGeometry(2.7, 0.14, 2.7), 0xc9a878, a, l, base + 2.65, 0.3);
    part(new CylinderGeometry(0.85, 0.9, 0.3, 14), SANDSTONE, a, l, base + 2.87, 0.35);
    part(new SphereGeometry(0.9, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1), 0xe3c9a0, a, l, base + 3.0, 0.35);
    // a lamp hung under the dome, lighting the kiosk from within after dark
    part(new SphereGeometry(0.2, 8, 6), 0xffe2b0, a, l, base + 2.2, 1.4);
    part(new ConeGeometry(0.12, 0.6, 8), GOLD, a, l, base + 4.35);
    part(new SphereGeometry(0.1, 8, 6), GOLD, a, l, base + 4.1);
  }
  for (const a of [-16, -8, 8, 16]) {
    c.add(mats.planter, new BoxGeometry(2.2, 0.8, 2.2), c.L(a, LF - 5.5, base + 0.4));
    c.add(mats.roofGreen, new SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c.L(a, LF - 5.5, base + 0.8));
  }
  for (const a of [-12, 12]) c.add(mats.timber, new BoxGeometry(0.6, 0.45, 2.6), c.L(a, LF - 5.5, base + 0.25));
  // the skybridge from the platform to the upper floor: glazed walls and roof on timber frames, between two of the
  // station gridshell's ribs (2.58 apart from the platform's end) and reaching in under its glass to meet it (box sizes:
  // lateral, up, along)
  {
    const BA = -6.46;
    const BWD = 2.0;
    const l0 = 11.5;
    const lIn = 9.7;
    const roofY = Math.max(UP1, 1.4) + 2.55;
    const deckL = LF - l0;
    c.add(mats.plat, new BoxGeometry(deckL, 0.4, BWD + 0.2), c.L(BA, l0 + deckL / 2, UP1 - 0.2));
    const wallL = LF - lIn;
    for (const sd of [-1, 1]) {
      c.add(mats.pane, new BoxGeometry(wallL, roofY - UP1, 0.06), c.L(BA + (sd * BWD) / 2, lIn + wallL / 2, (UP1 + roofY) / 2));
      for (let l = lIn; l <= LF + 0.01; l += wallL / 5) c.add(mats.timber, new BoxGeometry(0.14, roofY - UP1, 0.14), c.L(BA + (sd * BWD) / 2, l, (UP1 + roofY) / 2));
      c.add(mats.timber, new BoxGeometry(wallL, 0.22, 0.2), c.L(BA + (sd * BWD) / 2, lIn + wallL / 2, roofY));
    }
    c.add(mats.pane, new BoxGeometry(wallL, 0.06, BWD), c.L(BA, lIn + wallL / 2, roofY + 0.08));
    for (let l = lIn; l <= LF + 0.01; l += wallL / 5) c.add(mats.timber, new BoxGeometry(0.16, 0.18, BWD + 0.2), c.L(BA, l, roofY + 0.02));
  }
  const city = c.world.buildings.solid;
  return {
    anchors,
    focus: new Vector3(...c.L(0, LM - 2, (base + TOP) / 2)),
    update: () => {
      // after dark the banners and plaques glow in their own colours, the capiz and the jali light up from within
      const night = Math.min(1, city.emissiveIntensity * 1.2);
      artMat.emissiveIntensity = 0.05 + 0.55 * night;
      screenMat.emissiveIntensity = 0.1 + 1.3 * night;
      stallLight.emissiveIntensity = 0.4 + 1.6 * night;
    },
  };
}

// ------------------------------------------------------------------ 09 Contact · Patterson: the forest lookout
/**
 * Patterson's wellness park round the lookout (sets/wellness.ts):
 * - two tennis courts on a level terrace with a stone retaining wall where the ground falls away, fenced in green
 *   mesh, with nets and lines;
 * - a timber pergola between them over benches and a drinking fountain;
 * - an outdoor gym on a rubber pad: pull-up bars, parallel bars, monkey bars, sit-up benches and a bouldering rock;
 * - a yoga lawn with mats in rows facing the instructor's deck;
 * - a red running path joining them, and the park's name on a board where the path from the station comes in.
 *
 * Plain colours (folded into the set's painted material) but for the fences' mesh and the sign.
 */
function wellnessPark(c: Ctx): void {
  const G = (a: number, l: number) => c.G(a, l);
  const zs = c.L(1, 0, 0)[2];
  /** A plain material per colour (the set folds them into one painted mesh). */
  const cols = new Map<number, MeshStandardMaterial>();
  const col = (hex: number) => {
    let m = cols.get(hex);
    if (!m) cols.set(hex, (m = new MeshStandardMaterial({ color: hex, roughness: 0.8 })));
    return m;
  };
  /** A box laid in the frame: across (lateral), up, along, centred at (a, l) with its foot at height y. */
  const put = (hex: number, w: number, h: number, d: number, a: number, l: number, y: number, rot?: V3) => c.add(col(hex), new BoxGeometry(w, h, d), c.L(a, l, y + h / 2), rot);
  /** The ground under a box at its highest and lowest (local heights). */
  const span = (b: FrameBox) => {
    let hi = -Infinity;
    let lo = Infinity;
    for (let a = b.a0; a <= b.a1 + 0.01; a += (b.a1 - b.a0) / 6) {
      for (let l = b.l0; l <= b.l1 + 0.01; l += (b.l1 - b.l0) / 6) {
        hi = Math.max(hi, G(a, l));
        lo = Math.min(lo, G(a, l));
      }
    }
    return { hi, lo };
  };
  const mesh = new MeshStandardMaterial({ color: 0x1f3d2b, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false, roughness: 1 });

  // ------------------------------------------------ the tennis courts on their terrace
  for (const b of COURTS) {
    const { hi, lo } = span(b);
    const top = hi + 0.15;
    const am = (b.a0 + b.a1) / 2;
    const lm = (b.l0 + b.l1) / 2;
    const A = b.a1 - b.a0;
    const Lw = b.l1 - b.l0;
    // the terrace: a stone wall round a level pad, the court's green surround and its blue court
    put(0xa9a49a, Lw + 0.6, top - (lo - 0.6), A + 0.6, am, lm, lo - 0.6);
    put(0x3f7d5a, Lw, 0.06, A, am, lm, top);
    put(0x2f6db0, 6.6, 0.07, 14.2, am, lm, top);
    // the lines: baselines, sidelines (doubles and singles), service lines and the centre line
    const line = (w: number, d: number, a: number, l: number) => put(0xf4f4f0, w, 0.02, d, a, l, top + 0.075);
    for (const s of [-1, 1]) {
      line(6.6, 0.1, am + s * 7.05, lm);
      line(0.1, 14.2, am, lm + s * 3.25);
      line(0.1, 14.2, am, lm + s * 2.45);
      line(4.9, 0.1, am + s * 3.4, lm);
    }
    line(0.1, 6.8, am, lm);
    // the net across the middle, on its posts
    for (const s of [-1, 1]) put(0x2a3039, 0.12, 1.1, 0.12, am, lm + s * 3.6, top);
    c.add(col(0x1d2228), new BoxGeometry(7.2, 0.8, 0.04), c.L(am, lm, top + 0.55));
    put(0xf4f4f0, 7.2, 0.08, 0.06, am, lm, top + 0.95);
    // the fence: posts and a top rail round the edge, green mesh between (a gap toward the pergola for the gate)
    const gateA = b.a0 < 0 ? b.a1 : b.a0;
    const posts: [number, number][] = [];
    for (let k = 0; k <= 5; k++) posts.push([b.a0 + (A * k) / 5, b.l0], [b.a0 + (A * k) / 5, b.l1]);
    for (let k = 1; k < 3; k++) posts.push([b.a0, b.l0 + (Lw * k) / 3], [b.a1, b.l0 + (Lw * k) / 3]);
    for (const [a, l] of posts) put(0x2a3a30, 0.12, 3, 0.12, a, l, top);
    for (const l of [b.l0, b.l1]) {
      put(0x2a3a30, 0.08, 0.08, A, am, l, top + 2.95);
      c.add(mesh, new PlaneGeometry(A, 3).rotateY(Math.PI / 2), c.L(am, l, top + 1.5));
    }
    for (const a of [b.a0, b.a1]) {
      put(0x2a3a30, Lw, 0.08, 0.08, a, lm, top + 2.95);
      // the end toward the pergola leaves its middle open for the gate
      if (a === gateA) {
        for (const s of [-1, 1]) c.add(mesh, new PlaneGeometry(Lw / 2 - 1.2, 3), c.L(a, lm + s * (Lw / 4 + 0.6), top + 1.5));
      } else c.add(mesh, new PlaneGeometry(Lw, 3), c.L(a, lm, top + 1.5));
    }
    // a bench by the gate
    put(0x9a7048, 1.8, 0.45, 0.5, gateA + (b.a0 < 0 ? -1 : 1), b.l0 + 1.4, top);
  }

  // ------------------------------------------------ the pergola between the courts: timber posts and slatted roof
  {
    const b = PERGOLA;
    const { hi, lo } = span(b);
    const top = hi + 0.12;
    const am = (b.a0 + b.a1) / 2;
    const lm = (b.l0 + b.l1) / 2;
    put(0x9c8f7c, b.l1 - b.l0, top - (lo - 0.5), b.a1 - b.a0, am, lm, lo - 0.5);
    for (const a of [b.a0 + 0.5, b.a1 - 0.5]) for (const l of [b.l0 + 0.6, b.l1 - 0.6]) put(0xa98260, 0.28, 3.2, 0.28, a, l, top);
    for (const a of [b.a0 + 0.5, b.a1 - 0.5]) put(0x8a6a4a, b.l1 - b.l0, 0.3, 0.3, a, lm, top + 3.2);
    for (let l = b.l0 + 0.4; l <= b.l1 - 0.39; l += 0.9) put(0xa98260, 0.18, 0.2, b.a1 - b.a0 + 0.6, am, l, top + 3.5);
    // benches facing each court, and a drinking fountain
    for (const s of [-1, 1]) put(0x9a7048, b.l1 - b.l0 - 2, 0.45, 0.6, am + s * 2, lm, top);
    c.add(col(0x8f9298), new CylinderGeometry(0.3, 0.35, 1.0, 10), c.L(am, b.l0 + 0.9, top + 0.5));
  }

  // ------------------------------------------------ the outdoor gym
  {
    const b = GYM;
    const { hi } = span(b);
    const top = hi + 0.1;
    const am = (b.a0 + b.a1) / 2;
    const lm = (b.l0 + b.l1) / 2;
    put(0xb5523b, b.l1 - b.l0, 0.4, b.a1 - b.a0, am, lm, top - 0.3);
    const BLUE = 0x2d6cb0;
    const YEL = 0xf2b632;
    // pull-up bars: three bars at three heights between four posts, along the lateral
    for (let k = 0; k < 4; k++) put(BLUE, 0.14, 2.9, 0.14, b.a0 + 1.4, b.l0 + 1.2 + k * 1.4, top);
    for (let k = 0; k < 3; k++) c.add(col(YEL), new CylinderGeometry(0.05, 0.05, 1.4, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 2), c.L(b.a0 + 1.4, b.l0 + 1.9 + k * 1.4, top + 2.1 + k * 0.35));
    // parallel bars
    for (const s of [-0.3, 0.3]) {
      for (const d of [-1, 1]) put(BLUE, 0.1, 1.1, 0.1, b.a0 + 4.6 + d, b.l0 + 2 + s, top);
      put(YEL, 0.08, 0.08, 2.3, b.a0 + 4.6, b.l0 + 2 + s, top + 1.1);
    }
    // monkey bars: two rails on posts, rungs across
    for (const s of [-0.45, 0.45]) {
      for (const d of [-2.2, 2.2]) put(BLUE, 0.14, 2.4, 0.14, b.a0 + 7.6 + d, b.l0 + 2.4 + s, top);
      put(BLUE, 0.1, 0.1, 4.6, b.a0 + 7.6, b.l0 + 2.4 + s, top + 2.35);
    }
    for (let d = -2; d <= 2.01; d += 0.5) put(YEL, 1.0, 0.06, 0.06, b.a0 + 7.6 + d, b.l0 + 2.4, top + 2.42);
    // sit-up benches, inclined
    for (const k of [0, 1]) {
      const a = b.a0 + 2 + k * 2.6;
      const l = b.l1 - 2.2;
      c.add(col(0x2a3039), new BoxGeometry(0.6, 0.12, 2.0), c.L(a, l, top + 0.55), [0.35 * zs, 0, 0]);
      put(BLUE, 0.1, 0.5, 0.1, a, l - 0.8, top);
      put(BLUE, 0.1, 0.9, 0.1, a, l + 0.8, top);
    }
    // a bouldering rock with coloured holds
    const ra = b.a1 - 2.6;
    const rl = b.l1 - 3;
    c.add(col(0x8c8a85), new IcosahedronGeometry(1.9, 0), c.L(ra, rl, top + 1.2), [0.3, 0.5, 0.2], [1.2, 1, 1]);
    [0xd2452f, 0xf2b632, 0x2a9d8f, 0xe84393, 0x2d6cb0, 0xd2452f, 0xf2b632].forEach((hex, k) => {
      const th = k * 0.9;
      c.add(col(hex), new BoxGeometry(0.2, 0.14, 0.2), c.L(ra + Math.cos(th) * 1.95, rl + Math.sin(th) * 1.75, top + 0.6 + (k % 4) * 0.5));
    });
  }

  // ------------------------------------------------ the park's lawn, cell by cell on the ground, round what stands on it
  {
    const inBox = (bx: FrameBox, a: number, l: number, pad: number) => a > bx.a0 - pad && a < bx.a1 + pad && l > bx.l0 - pad && l < bx.l1 + pad;
    for (let a = -22; a < 22; a += 2.2) {
      for (let l = 7; l < 36; l += 2.2) {
        const ca = a + 1.1;
        const cl = l + 1.1;
        if (inBox(GYM, ca, cl, 0.5) || COURTS.some((bx) => inBox(bx, ca, cl, 0.5)) || inBox(PERGOLA, ca, cl, 0.5)) continue;
        // its top a little under the paths' (theirs a hand over the ground at their middles)
        put(0x5f8f45, 2.25, 0.2, 2.25, ca, cl, G(ca, cl) - 0.15);
      }
    }
  }

  // ------------------------------------------------ the yoga lawn: mats in rows facing the instructor's deck
  {
    const MAT = [0x7c6bd6, 0x2a9d8f, 0xe8663a, 0xf2b632, 0xe84393, 0x3f8a5a];
    MATS.forEach(([a, l], k) => put(MAT[k % MAT.length], 0.8, 0.04, 1.9, a, l, G(a, l) + 0.1));
    const [da, dl] = YOGA_DECK;
    put(0xa98260, 3.2, 0.32, 2.6, da, dl, G(da, dl) + 0.02);
  }

  // ------------------------------------------------ the running path, red rubber laid on the ground
  for (let k = 1; k < RUN_PATH.length; k++) {
    const [a0, l0] = RUN_PATH[k - 1];
    const [a1, l1] = RUN_PATH[k];
    const L = Math.hypot(a1 - a0, l1 - l0);
    const steps = Math.max(1, Math.ceil(L / 2));
    const ry = Math.atan2(l1 - l0, (a1 - a0) * zs);
    for (let s = 0; s < steps; s++) {
      const u = (s + 0.5) / steps;
      const a = a0 + (a1 - a0) * u;
      const l = l0 + (l1 - l0) * u;
      c.add(col(0xa8453a), new BoxGeometry(1.8, 0.1, L / steps + 0.08), c.L(a, l, G(a, l) + 0.07), [0, ry, 0]);
    }
  }

  // ------------------------------------------------ the park's name on a board where the station's path comes in
  {
    const a = -2.6;
    const l = 10.5;
    const g = G(a, l);
    put(0x3a3f46, 0.14, 2.6, 0.14, a, l, g);
    put(0x3a3f46, 0.14, 2.6, 0.14, a - 2.8, l, g);
    const fonts = fontOf();
    const tex = canvasTex(1024, 300, (gx) => {
      gx.fillStyle = "#1f3d2b";
      gx.fillRect(0, 0, 1024, 300);
      gx.fillStyle = "#f6efe2";
      gx.font = `500 96px ${fonts.serif}`;
      gx.textAlign = "center";
      gx.textBaseline = "middle";
      gx.fillText("Patterson Wellness Park", 512, 120, 980);
      gx.fillStyle = "#b9e4c9";
      gx.font = `500 40px ${fonts.mono}`;
      gx.fillText("TENNIS · OUTDOOR GYM · YOGA · RUN LOOP", 512, 228, 980);
    });
    const board = [Math.PI / 2, -Math.PI / 2].map((ry) => new PlaneGeometry(3.4, 1.0).rotateY(ry).translate(...c.L(a - 1.4, l + (ry > 0 ? 0.03 : -0.03), g + 2.1)));
    c.group.add(new Mesh(mergeGeometries(board, false), new MeshBasicMaterial({ map: tex, toneMapped: false })));
    for (const p of board) p.dispose();
  }
}

/** The forest lookout with its words and signposts, in Patterson's wellness park. */
function contactSet(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const L0 = 26;
  const g = c.G(0, L0);
  const deck = Math.max(g + 1.2, c.G(0, L0 + 6) + 1.2);
  wellnessPark(c);
  // paved paths across the lawn: from the station's foot to the lookout, and on to the bus exchange on Beresford,
  // with benches, lamps and a coffee kiosk along them
  {
    const walk = new MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.95 });
    // a box's long side (local z) turned onto the path: local x is lateral, local z is along by the frame's sign
    const zs = c.L(1, 0, 0)[2];
    const ex = busNetwork().stops.find((st) => st.station === c.i && st.exchange);
    const pts: [number, number][] = [[0, 12], [0, L0 - 8.5]];
    if (ex) {
      const [ea, el] = toStation(c.i, ex.x, ex.z);
      if (Math.hypot(ea, el - L0) < 60) pts.push([Math.max(-30, Math.min(30, ea * 0.5)), L0 - 8.5], [Math.max(-40, Math.min(40, ea)), Math.max(10, Math.min(44, el))]);
    }
    for (let k = 1; k < pts.length; k++) {
      const [a0, l0] = pts[k - 1];
      const [a1, l1] = pts[k];
      const L = Math.hypot(a1 - a0, l1 - l0);
      const steps = Math.max(1, Math.ceil(L / 3));
      for (let s = 0; s < steps; s++) {
        const u = (s + 0.5) / steps;
        const a = a0 + (a1 - a0) * u;
        const l = l0 + (l1 - l0) * u;
        // a slab square to the path (its own turn in the set's frame)
        const ry = Math.atan2(l1 - l0, (a1 - a0) * zs);
        c.add(walk, new BoxGeometry(2.4, 0.12, L / steps + 0.1), c.L(a, l, c.G(a, l) + 0.06), [0, ry, 0]);
        if (s % 3 === 1) {
          // a bench on one side, a lamp on the other
          const na = -(l1 - l0) / L;
          const nl = (a1 - a0) / L;
          c.add(mats.timber, new BoxGeometry(0.5, 0.45, 1.6), c.L(a + na * 2, l + nl * 2, c.G(a + na * 2, l + nl * 2) + 0.25), [0, ry, 0]);
          c.add(mats.post, new CylinderGeometry(0.06, 0.08, 3.2, 6), c.L(a - na * 1.8, l - nl * 1.8, c.G(a - na * 1.8, l - nl * 1.8) + 1.6));
          c.add(mats.lamp, new SphereGeometry(0.22, 8, 6), c.L(a - na * 1.8, l - nl * 1.8, c.G(a - na * 1.8, l - nl * 1.8) + 3.3));
        }
      }
    }
    // the coffee kiosk where the paths meet below the lookout
    const ka = 6;
    const kl = L0 - 10;
    const kg = c.G(ka, kl);
    c.add(mats.timber, new BoxGeometry(2.6, 2.4, 2.6), c.L(ka, kl, kg + 1.2));
    c.add(new MeshStandardMaterial({ color: 0x2f6e5d, roughness: 0.7 }), new BoxGeometry(3.6, 0.15, 3.4), c.L(ka, kl, kg + 2.55), [0.08, 0, 0]);
    c.add(glowMat(0xffd7a0, 1.2), new BoxGeometry(0.06, 0.5, 1.8), c.L(ka, kl - 1.32, kg + 1.6));
  }
  c.add(mats.timber, new BoxGeometry(12, 0.5, 16), c.L(0, L0, deck));
  legs(c, mats.timber, [
    [-6, L0 - 5],
    [6, L0 - 5],
    [-6, L0 + 5],
    [6, L0 + 5],
  ], deck - 0.25, 0.3);
  for (const s of [-1, 1]) c.add(mats.timber, new BoxGeometry(0.15, 1, 16), c.L(0, L0 + s * 5.9, deck + 0.75), [0, 0, 0]);
  // a stand of cedar, fir and hemlock round the deck, in three dimensions since a view comes close; none on a street
  stand(
    c,
    SET_TREES.filter((t) => t.i === c.i && !isRoad(...fromStation(t.i, t.a, t.l), 2.5)),
  );
  // the light sculpture
  const fonts = fontOf();
  const tex = canvasTex(1024, 256, (gx) => {
    gx.clearRect(0, 0, 1024, 256);
    gx.font = `400 170px ${fonts.serif}`;
    gx.textAlign = "center";
    gx.textBaseline = "middle";
    gx.shadowColor = "#a78bfa";
    gx.shadowBlur = 30;
    gx.fillStyle = "#f5f3ff";
    gx.fillText("Let's talk.", 512, 132);
  });
  // two faces back to back, so the words read from the train and from the lookout
  const signMat = new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
  for (const ry of [-Math.PI / 2, Math.PI / 2]) {
    const sign = new Mesh(new PlaneGeometry(12, 3), signMat);
    sign.position.set(...c.L(0, L0 + 2, deck + 4.4));
    sign.rotation.y = ry;
    c.group.add(sign);
  }
  c.add(glowMat(0xa78bfa, 2.2), new BoxGeometry(0.1, 0.1, 12.4), c.L(0, L0 + 2, deck + 2.7));
  // four lit signposts
  const post = glowMat(0xc4b5fd, 1.2);
  const anchors: Vector3[] = [];
  [-5.4, -1.8, 1.8, 5.4].forEach((a, k) => {
    const h = 2.2 + (k % 2) * 1.4;
    c.add(mats.timber, new BoxGeometry(0.2, h, 0.2), c.L(a, L0 - 5, deck + 0.25 + h / 2));
    c.add(post, new BoxGeometry(0.15, 0.5, 1.6), c.L(a, L0 - 5, deck + h + 0.1));
    anchors.push(new Vector3(...c.L(a, L0 - 5, deck + h + 0.9)));
  });
  return { anchors, focus: new Vector3(...c.L(0, L0 - 2, deck + 3)) };
}

const BUILDERS = [depart, about, null, awdon, planktoneer, vessel, weed, abckidz, more, contactSet] as const;

/** Build every station's set. */
export function buildSets(world: World): BuiltSet[] {
  const { mats } = world;
  // the colours the look keeps changing (lookModel.ts): these stay their own materials
  const LOOKED = new Set<Material>([mats.plat, mats.concrete, mats.landmark, mats.dome, mats.sail, mats.park, mats.forestFloor, mats.ground, mats.water, mats.mountain]);
  return stations.map((_, i) => {
    const fr = STATION_FRAMES[i];
    const side = SET_SIDE[i];
    const group = new Group();
    const n = new Vector3(fr.rx * side, 0, fr.rz * side);
    const t = new Vector3(fr.tx, 0, fr.tz);
    const z = n.clone().cross(UP);
    group.matrixAutoUpdate = false;
    // the Granville portals are placed in world space, square to the track where each stands; a set that stands along
    // the platform from its station (SET_SHIFT) has its origin moved there
    const A0 = SET_SHIFT[i];
    if (i !== 2) group.matrix.makeBasis(n, UP, z).setPosition(fr.x + t.x * A0, fr.y, fr.z + t.z * A0);
    group.matrixWorldNeedsUpdate = true;
    // local z runs along z = n × UP, which is ±t depending on the side
    const zs = z.dot(t) > 0 ? 1 : -1;
    const parts = new Map<Material, Part[]>();
    // a material that is one plain colour (no map, glow, transparency, vertex colours, second side, nor a colour the
    // look or the events change) draws the same painted, so they all share one painted material: a draw call each saved
    const painted = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const plainHex = (mat: Material): number | null => {
      if (!(mat instanceof MeshStandardMaterial) || mat.type !== "MeshStandardMaterial" || LOOKED.has(mat)) return null;
      if (mat.map || mat.emissiveMap || mat.transparent || mat.vertexColors || mat.side !== FrontSide || mat.emissive.getHex() !== 0) return null;
      return mat.color.getHex();
    };
    const c: Ctx = {
      i,
      side,
      world,
      lowEnd: world.lowEnd,
      group,
      L: (a, l, u) => [l, u, a * zs],
      G: (a, l) => groundAt(fr.x + t.x * (a + A0) + n.x * l, fr.z + t.z * (a + A0) + n.z * l) - fr.y,
      S: (a, l) => surfaceAt(fr.x + t.x * (a + A0) + n.x * l, fr.z + t.z * (a + A0) + n.z * l, world.lowEnd ? 2 : 1) - fr.y,
      add: (mat, geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
        const hex = plainHex(mat);
        const into = hex === null ? mat : painted;
        const list = parts.get(into);
        const p: Part = { geo: hex === null ? geo : paint(geo, hex), position: pos, rotation: rot, scale };
        if (list) list.push(p);
        else parts.set(into, [p]);
      },
    };
    const b = i === 2 ? experience(c, world) : (BUILDERS[i]?.(c) ?? {});
    for (const [mat, list] of parts) {
      const m = new Mesh(merged(list), mat);
      // glass, light and what glows cast no shadow (and so cost no shadow pass)
      const sm = mat as MeshStandardMaterial;
      const glows = mat.type === "MeshBasicMaterial" || (sm.emissiveIntensity > 0.5 && sm.color?.getHex() === 0x111111);
      m.castShadow = !world.lowEnd && !mat.transparent && !glows;
      m.receiveShadow = true;
      // the squares' stalls, pavilions and paving are too small and low to show in the water
      m.userData.lowInMirror = mat.userData.square === true;
      group.add(m);
    }
    group.updateMatrixWorld(true);
    // anchors and focus are local except for the world-built Granville portals
    const toWorld = (v: Vector3) => (i === 2 ? v.clone() : v.clone().applyMatrix4(group.matrix));
    return {
      group,
      anchors: (b.anchors ?? []).map(toWorld),
      focus: b.focus ? toWorld(b.focus) : new Vector3(fr.x, fr.y + 4, fr.z),
      update: b.update,
    };
  });
}
