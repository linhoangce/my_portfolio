/**
 * The ten set pieces, one built around each station's section. Each is made in its station's frame (x = lateral
 * toward the set side, y = up from the deck, z = along the track toward the set's "ahead") and merged per material,
 * so a set costs a handful of draw calls. Anchors are where the captions pin; `shot` is the establishing shot in the
 * station frame (along, lateral toward the set, up) that shots.ts checks against the city.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Euler,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
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
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";

import { stations } from "@/data";

import { getZoning } from "../cityData";

import { merged, type Part } from "../merge";
import { cap, type P2, walls } from "../shapes";
import { monumentFocus } from "../monuments";
import { groundAt, sdfAt } from "../terrain";
import { frameAt, makeFrame, PATH_SAMPLES, stationS, trackDist, UP } from "../track";
import type { World } from "../world";
import { fromStation, SET_SIDE, SET_TREES, STATION_FRAMES } from "./zones";

type V3 = [number, number, number];
export type ShotSpec = { from: V3; to: V3; look: V3; fromLook?: V3; free?: boolean };
export type BuiltSet = { group: Group; anchors: Vector3[]; focus: Vector3; update?: (t: number) => void; shot: ShotSpec };

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
  add: (mat: Material, geo: BufferGeometry, pos?: V3, rot?: V3, scale?: V3) => void;
};

const DEFAULT_SHOT: ShotSpec = { from: [-58, 82, 15], to: [-22, 62, 24], look: [0, 14, 5] };

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

/** A raised terrace at platform height (or on the ground where that is higher), with legs. Returns its top. */
function terrace(c: Ctx, a0: number, a1: number, l0: number, l1: number): number {
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
    c.add(mats.plat, new BoxGeometry(Math.hypot(run, rise), 0.3, 5), c.L(0, (l0 + 11.4) / 2, 1.3 + rise / 2), [0, 0, Math.atan2(rise, run)]);
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

// ------------------------------------------------------------------ 00 Depart · Waterfront
/** A paved plaza on the ground: one slab per 6-unit cell, each at its own ground height, with planters and benches. */
function plaza(c: Ctx, a0: number, a1: number, l0: number, l1: number): void {
  const paving = new MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.95 });
  const planter = new MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 });
  const green = new MeshStandardMaterial({ color: 0x4f7a3e, roughness: 1 });
  for (let a = a0; a < a1; a += 6) {
    for (let l = l0; l < l1; l += 6) {
      const g = Math.max(c.G(a + 3, l + 3), c.G(a, l), c.G(a + 6, l + 6));
      c.add(paving, new BoxGeometry(6.02, 0.4, 6.02), c.L(a + 3, l + 3, g + 0.1));
    }
  }
  for (let a = a0 + 4; a < a1 - 2; a += 10) {
    const l = (l0 + l1) / 2;
    const g = c.G(a, l);
    c.add(planter, new BoxGeometry(3, 0.8, 3), c.L(a, l, g + 0.6));
    c.add(green, new SphereGeometry(1.6, 10, 8), c.L(a, l, g + 1.6), [0, 0, 0], [1, 0.7, 1]);
    c.add(planter, new BoxGeometry(0.6, 0.5, 3.2), c.L(a + 3.2, l, g + 0.45));
  }
}

function depart(c: Ctx): Partial<BuiltSet> {
  plaza(c, -24, 24, 14, 44);
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
    update: () => {
      // the station's windows light with the city's
      if (lit) lit.emissiveIntensity = city.emissiveIntensity * 0.6;
    },
    shot: { from: [-74, 92, 22], to: [0, -46, 17], look: [0, 16, 6] },
  };
}

type Conifer = "cedar" | "fir" | "hemlock";
export type StandTree = { a: number; l: number; h: number; sp: Conifer; base?: number; crownFrom?: number };

/** Bark textures: the cedar's fibrous red-brown strips, the fir's deep grey-brown furrows (hemlock shares it). */
function barkTexture(sp: Conifer): CanvasTexture {
  const t = canvasTex(
    64,
    256,
    (g) => {
      const cedar = sp === "cedar";
      g.fillStyle = cedar ? "#74402c" : "#5b4a3f";
      g.fillRect(0, 0, 64, 256);
      const tones = cedar ? ["#8d5238", "#5c301f", "#a2643f", "#6a3825"] : ["#6e5c50", "#3e3029", "#7a6a5c", "#4a3a31"];
      for (let k = 0; k < 46; k++) {
        const x = (k * 37) % 64;
        const w = cedar ? 1 + ((k * 13) % 4) : 2 + ((k * 13) % 5);
        g.fillStyle = tones[k % 4];
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= 256; y += 16) g.lineTo(x + Math.sin(y * 0.05 + k) * (cedar ? 1.5 : 3), y);
        g.lineTo(x + w, 256);
        g.lineTo(x + w, 0);
        g.fill();
      }
    },
    true,
  );
  t.repeat.set(3, 7);
  return t;
}

/**
 * One spray of foliage on a card: the cedar's flat scale-leaf sprays, the fir's stiff needles all round a twig,
 * the hemlock's short soft needles in two flat ranks. In the species' greens, matched to the forest round them.
 */
function frondTexture(sp: Conifer): CanvasTexture {
  return canvasTex(128, 80, (g) => {
    g.clearRect(0, 0, 128, 80);
    if (sp === "cedar") {
      const shade = (t: number) => `rgb(${Math.round(56 + 40 * t)},${Math.round(98 + 46 * t)},${Math.round(52 + 22 * t)})`;
      for (let t = 0.04; t < 1; t += 0.055) {
        const x = 6 + t * 116;
        const len = 30 * (1 - t * 0.75);
        for (const side of [-1, 1]) {
          const ang = side * (0.9 - t * 0.35);
          for (let u = 0; u < 1; u += 0.12) {
            const px = x + Math.cos(ang) * len * u * 0.55;
            const py = 40 + Math.sin(ang) * len * u;
            g.fillStyle = shade(0.25 + u * 0.75 - t * 0.15);
            g.beginPath();
            g.ellipse(px, py, 4.2 * (1 - u * 0.5), 2.2, ang, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      g.strokeStyle = "#4a6b33";
    } else {
      const fir = sp === "fir";
      // side twigs off the rachis, each bristling with needles
      const greens = fir ? ["#21452f", "#2b5639", "#33603f", "#3c6b46"] : ["#2c553c", "#356046", "#3a6847", "#467653"];
      for (let t = 0.03; t < 1; t += fir ? 0.07 : 0.06) {
        const x = 6 + t * 116;
        const len = (fir ? 26 : 22) * (1 - t * 0.7);
        for (const side of [-1, 1]) {
          const ang = side * (fir ? 0.75 : 1.1) - side * t * 0.2;
          for (let u = 0.1; u < 1; u += fir ? 0.09 : 0.1) {
            const px = x + Math.cos(ang) * len * u * 0.6;
            const py = 40 + Math.sin(ang) * len * u;
            for (const n of fir ? [-1, 1, 0] : [-1, 1]) {
              g.strokeStyle = greens[(Math.round(u * 10) + (n + 1)) % 4];
              g.lineWidth = fir ? 1.6 : 1.4;
              g.beginPath();
              g.moveTo(px, py);
              const na = ang + n * (fir ? 0.9 : 1.4) + Math.PI * 0.5 * (n === 0 ? 0 : 0);
              const nl = fir ? 6 : 4.5;
              g.lineTo(px + Math.cos(na + 0.6) * nl, py + Math.sin(na + 0.6) * nl);
              g.stroke();
            }
          }
        }
      }
      g.strokeStyle = fir ? "#4a3a2c" : "#5a4a3a";
    }
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(2, 40);
    g.lineTo(124, 40);
    g.stroke();
  });
}

/**
 * A stand of conifers in three dimensions, for the trees a shot comes close to: a lathed, fluted trunk with a
 * buttressed foot; whorls of limbs up the crown, each carrying sprays of foliage; a nodding leader. The species set
 * the shape: the cedar broad with drooping, upturned limbs, the Douglas fir a narrow spire with level limbs, the
 * hemlock soft with drooping tips and a deeply nodding top. One merged bark mesh per bark, one instanced mesh of
 * sprays per species, sharing the forest's snow so they whiten with it.
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
  const shape = {
    cedar: { R: 5.1, droop: [0.3, 0.25], curl: 0.85, lean: 0.9, sprayS: 1.3 },
    fir: { R: 3.9, droop: [0.1, 0.14], curl: 0.6, lean: 0.35, sprayS: 1.15 },
    hemlock: { R: 4.3, droop: [0.36, 0.3], curl: 0.5, lean: 1.6, sprayS: 1.1 },
  } as const;
  // each spray is two cards crossed along its twig, one lying flat and one hanging, so the crown is as full from the
  // side as from above
  const card = merged([{ geo: new PlaneGeometry(1, 0.62).rotateX(-Math.PI / 2).translate(0.5, 0, 0) }, { geo: new PlaneGeometry(1, 0.5).translate(0.5, -0.14, 0) }]);
  const q = new Quaternion();
  const e = new Euler(0, 0, 0, "YZX");
  const m4 = new Matrix4();
  for (const t of trees) {
    const sh = shape[t.sp];
    const base = t.base ?? c.G(t.a, t.l);
    const height = t.h;
    const crownFrom = t.crownFrom ?? base + height * (t.sp === "fir" ? 0.32 : 0.22);
    const [cx, , cz] = c.L(t.a, t.l, 0);
    const top = base + height;
    const bark = barkOf(t.sp);
    const prof: Vector2[] = [];
    const girth = height / 36;
    for (let k = 0; k <= 24; k++) {
      const y = (k / 24) * height;
      // a buttressed flare at the foot, a slow taper to the leader
      const r = (0.32 + 0.95 * (1 - y / height) ** 1.2) * Math.max(0.55, girth) + (t.sp === "cedar" ? 1.7 : 0.9) * girth * Math.exp(-y / 1.4);
      prof.push(new Vector2(r, y));
    }
    const trunk = new LatheGeometry(prof, c.lowEnd ? 10 : 14);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const y = tp.getY(i);
      const z = tp.getZ(i);
      const th = Math.atan2(z, x);
      const k = 1 + (0.09 * Math.sin(th * 7) + 0.04 * Math.sin(th * 13 + 1)) * (0.35 + Math.exp(-y / 5));
      tp.setXYZ(i, x * k, y, z * k);
    }
    trunk.computeVertexNormals();
    c.add(bark, trunk, [cx, base - 0.3, cz]);
    const list = sprays.get(t.sp) ?? [];
    sprays.set(t.sp, list);
    const limbs: Part[] = [];
    const step = c.lowEnd ? 0.95 : 0.5;
    const perWhorl = c.lowEnd ? 3 : 4;
    const fronds = c.lowEnd ? 4 : 6;
    const crownH = top - crownFrom;
    const scale = Math.min(1.2, Math.max(0.6, height / 30));
    let az = t.a * 1.7 + t.l;
    for (let y = crownFrom; y < top - 1.2; y += step) {
      const h = (y - crownFrom) / crownH;
      // widest low down, narrowing to the leader
      const R = (sh.R * (1 - h) ** (t.sp === "fir" ? 1.05 : 0.9) * (0.75 + 0.25 * Math.min(1, h * 6)) + 0.5) * scale;
      for (let b = 0; b < perWhorl; b++) {
        az += 2.39996;
        const len = R * (0.75 + 0.3 * Math.abs(Math.sin(az * 3.1)));
        const dx = Math.cos(az);
        const dz = Math.sin(az);
        // the limb: out and down, then up at the tip (droop grows down the crown)
        const droop = sh.droop[0] + sh.droop[1] * (1 - h);
        const at = (u: number): [number, number, number] => [cx + dx * len * u, y + len * (-droop * u + droop * sh.curl * u * u * u), cz + dz * len * u];
        const p0 = at(0.05);
        const p1 = at(0.7);
        const mid: [number, number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
        const lv = new Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        const eu = new Euler().setFromQuaternion(q.setFromUnitVectors(new Vector3(0, 1, 0), lv.clone().normalize()));
        limbs.push({ geo: new CylinderGeometry(0.05, 0.12, lv.length(), 4), position: mid, rotation: [eu.x, eu.y, eu.z] });
        for (let k = 0; k < fronds; k++) {
          const u = 0.3 + (0.7 * k) / (fronds - 1);
          const [px, py, pz] = at(u);
          const side = k % 2 ? 1 : -1;
          const yaw = -az + side * (0.25 + (0.5 * ((k * 7 + b) % 3)) / 3);
          const s = (1.3 + 1.1 * (1 - u * 0.5)) * (0.7 + 0.3 * (1 - h)) * sh.sprayS * scale;
          e.set(0, yaw, -(0.25 + 0.4 * u * (1 - h)) * sh.lean, "YZX");
          m4.compose(new Vector3(px, py - 0.05, pz), q.setFromEuler(e), new Vector3(s, 1, s));
          list.push(m4.clone());
        }
      }
    }
    // the leader, nodding over at the top (a hemlock's droops right over)
    const nod = t.sp === "hemlock" ? 1.6 : t.sp === "fir" ? 0.2 : 0.9;
    const lead: Vector3[] = [];
    for (let k = 0; k <= 6; k++) lead.push(new Vector3(cx + (k / 6) ** 2 * nod, top - 1.4 + (k / 6) * 2.2 - (k / 6) ** 3 * nod * 0.7, cz));
    limbs.push({ geo: new TubeGeometry(new CatmullRomCurve3(lead), 8, 0.09, 4, false) });
    c.add(bark, merged(limbs));
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
  return {
    focus: new Vector3(...c.L(0, L0 - 6, deckY + 6)),
    shot: { from: [-30, 64, 6], to: [-22, 56, 30], look: [0, 22, 16], fromLook: [0, 26, 8] },
  };
}

// ------------------------------------------------------------------ 02 Experience · Granville: five portals over the line, stone to light
function experience(c: Ctx, world: World): Partial<BuiltSet> {
  // built in world space so each portal stands square to the track where it is
  const f = makeFrame();
  const s0 = stationS[c.i];
  const order = [4, 3, 2, 1, 0]; // oldest role first along the direction of travel
  const fonts = fontOf();
  const roles = ["2014", "2018", "2019", "2021", "2025"];
  const mats: Material[] = [
    new MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.95 }),
    new MeshStandardMaterial({ color: 0x9c4a36, roughness: 0.85 }),
    new MeshStandardMaterial({ color: 0x4a5160, metalness: 0.7, roughness: 0.35, envMap: world.envTex, envMapIntensity: 0.6 }),
    world.mats.pane,
    glowMat(0xa78bfa, 2),
  ];
  const anchors: Vector3[] = new Array(5);
  const parts: Map<Material, Part[]> = new Map();
  const push = (m: Material, p: Part) => {
    const list = parts.get(m);
    if (list) list.push(p);
    else parts.set(m, [p]);
  };
  const plaques: Mesh[] = [];
  for (let k = 0; k < 5; k++) {
    frameAt(s0 + 22 + k * 10, f);
    const yaw = Math.atan2(f.t.x, f.t.z);
    const base = f.p.clone();
    const m = mats[k];
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
      g.fillStyle = k === 4 ? "#c4b5fd" : "#f2e6c9";
      g.font = `400 64px ${fonts.serif}`;
      g.textAlign = "center";
      g.fillText(roles[k], 128, 70);
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
    focus: anchors[2].clone().setY(anchors[2].y - 6),
    shot: { from: [-14, -3, 6.5], to: [42, -64, 26], look: [42, 0, 6], fromLook: [60, 0, 5.5], free: true },
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
function awdon(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const top = terrace(c, -16, 16, 14, 30);
  const L0 = 22;
  // the meeting pod
  c.add(mats.pane, new CylinderGeometry(3.6, 3.6, 3.2, 28, 1, true), c.L(-9, L0, top + 1.6));
  c.add(mats.canopy, new SphereGeometry(3.7, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.L(-9, L0, top + 3.2), [0, 0, 0], [1, 0.45, 1]);
  c.add(glowMat(0xa78bfa, 1.8), new TorusGeometry(3.65, 0.08, 6, 48), c.L(-9, L0, top + 3.2), [Math.PI / 2, 0, 0]);
  // three translucent transcript ribbons flowing toward the task wall
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
    const geo = ribbonGeo(c, [-6, L0 + (k - 1) * 1.6, top + 1.4 + k * 0.6], [5, L0 + (k - 1) * 1.2, top + 2.2 + k * 0.4], 0.7);
    c.group.add(new Mesh(geo, m));
  });
  // the approval gate
  const gate = glowMat(0x34d399, 0.6);
  c.add(gate, new BoxGeometry(0.25, 4.2, 0.25), c.L(1.5, L0 - 2.6, top + 2.1));
  c.add(gate, new BoxGeometry(0.25, 4.2, 0.25), c.L(1.5, L0 + 2.6, top + 2.1));
  c.add(gate, new BoxGeometry(5.45, 0.25, 0.25), c.L(1.5, L0, top + 4.2));
  // a two-sided departures screen on two legs: the line, the stop and the time, then the next trains each way
  const zs = c.L(1, 0, 0)[2];
  const bezel = new MeshStandardMaterial({ color: 0x15181d, roughness: 0.45, metalness: 0.5 });
  c.add(bezel, new BoxGeometry(0.42, 4.5, 8.8), c.L(9.5, L0, top + 3.65), [0, Math.PI / 2, 0]);
  for (const s of [-1, 1]) c.add(bezel, new BoxGeometry(0.3, 1.4, 0.3), c.L(9.5, L0 + s * 3.4, top + 0.7));
  const board = trainBoard(stations[c.i].name);
  const screenMat = new MeshBasicMaterial({ map: board.tex, toneMapped: false });
  for (const face of [-1, 1]) {
    const m = new Mesh(new PlaneGeometry(8.4, 4.1), screenMat);
    m.position.set(...c.L(9.5 + face * 0.22, L0, top + 3.65));
    // a plane faces +z, and local z runs along the track as a × zs
    m.rotation.y = face * zs > 0 ? 0 : Math.PI;
    c.group.add(m);
  }
  return {
    anchors: [new Vector3(...c.L(-9, L0, top + 5.4)), new Vector3(...c.L(9.5, L0, top + 6.4)), new Vector3(...c.L(-3, L0 - 2, top + 3.6))],
    focus: new Vector3(...c.L(0, L0 - 4, top + 3)),
    update: (t) => {
      flow.offset.x = -t * 0.25;
      gate.emissiveIntensity = 0.6 + Math.max(0, Math.sin(t * 1.3)) ** 8 * 3;
      board.tick(t);
    },
    shot: { from: [-56, 66, 8], to: [-24, 58, 22], look: [0, 20, 4] },
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
  // between the station and Science World, off the guideway and clear of the sphere's plaza
  const fr = STATION_FRAMES[c.i];
  const sw = monumentFocus("scienceWorld");
  const toLocal = (x: number, z: number): [number, number] => {
    const dx = x - fr.x;
    const dz = z - fr.z;
    return [dx * fr.tx + dz * fr.tz, (dx * fr.rx + dz * fr.rz) * c.side];
  };
  // part way toward the sphere, then out until it clears the guideway and the sphere's plaza, on dry land
  const [sa, sl] = toLocal(sw.x, sw.z);
  const world = (aa: number, ll: number) => [fr.x + fr.tx * aa + fr.rx * ll * c.side, fr.z + fr.tz * aa + fr.rz * ll * c.side];
  let a = sa * 0.55;
  let l = Math.max(18, sl * 0.55);
  search: for (const f of [0.55, 0.45, 0.65, 0.35, 0.75]) {
    for (let k = 0, ll = Math.max(18, sl * f); k < 20; k++, ll += 2) {
      const [wx, wz] = world(sa * f, ll);
      if (trackDist(wx, wz) > 15 && Math.hypot(wx - sw.x, wz - sw.z) > 22 && sdfAt(wx, wz) > 8) {
        a = sa * f;
        l = ll;
        break search;
      }
    }
  }
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
    shot: { from: [0, 0, 0], to: [0, 0, 0], look: [0, 0, 0] },
  };
}

// ------------------------------------------------------------------ 05 Vessel Vision · Commercial–Broadway: the harbour table
function vessel(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const top = terrace(c, -14, 14, 13, 31);
  const L0 = 22;
  const boats: [number, number, number][] = [
    [-8, -4, 0.3],
    [-3, 5, 1.2],
    [4, -1, 2.1],
    [8, 4.5, 0.8],
    [1, -6, 2.6],
  ];
  const sea = canvasTex(512, 340, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 340);
    grd.addColorStop(0, "#0e3b5c");
    grd.addColorStop(1, "#14567d");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 340);
    g.strokeStyle = "rgba(255,255,255,0.08)";
    for (let k = 0; k < 40; k++) {
      g.beginPath();
      const y = (k * 37) % 340;
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 6, 340, y - 6, 512, y);
      g.stroke();
    }
  });
  const floor = new Mesh(new PlaneGeometry(16, 24), new MeshStandardMaterial({ map: sea, emissiveMap: sea, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(...c.L(0, L0, top + 0.03));
  c.group.add(floor);
  const hullMat = new MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.5 });
  for (const [a, l, r] of boats) c.add(hullMat, new BoxGeometry(0.5, 0.18, 1.4), c.L(a, L0 + l, top + 0.12), [0, r, 0]);
  // the SAHI tile grid (overlapping tiles) and one tile sweeping across
  const gridMat = glowMat(0xa78bfa, 1.4);
  for (let k = 0; k <= 4; k++) c.add(gridMat, new BoxGeometry(16, 0.05, 0.06), c.L(-12 + k * 6, L0, top + 0.12), [0, 0, 0], [1, 1, 1]);
  for (let k = 0; k <= 3; k++) c.add(gridMat, new BoxGeometry(0.06, 0.05, 24), c.L(0, L0 - 8 + k * (16 / 3), top + 0.12));
  const tile = new Mesh(new BoxGeometry(5.9, 0.08, 6.6), new MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.22, depthWrite: false }));
  c.group.add(tile);
  // detection boxes snapping onto the boats
  const boxMat = glowMat(0x34d399, 2);
  const dets: Mesh[] = boats.map(([a, l]) => {
    const m = new Mesh(new BoxGeometry(2.2, 0.5, 2.2), boxMat);
    m.position.set(...c.L(a, L0 + l, top + 0.3));
    m.scale.setScalar(0);
    c.group.add(m);
    return m;
  });
  // a drone hovering over the table
  const drone = new Group();
  drone.add(new Mesh(new BoxGeometry(1.2, 0.35, 1.2), mats.trim));
  for (const [x, z] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ]) {
    const rotor = new Mesh(new CylinderGeometry(0.45, 0.45, 0.05, 12), glowMat(0x7dd3fc, 1.2));
    rotor.position.set(x, 0.2, z);
    drone.add(rotor);
  }
  c.group.add(drone);
  const dc = new Vector3(...c.L(0, L0, top + 7));
  return {
    anchors: [dc.clone().setY(dc.y + 1.2), new Vector3(...c.L(-12, L0 - 8, top + 0.8)), new Vector3(...c.L(12, L0 + 8, top + 0.8))],
    focus: new Vector3(...c.L(0, L0 - 3, top + 2)),
    update: (t) => {
      const k = Math.floor(t / 0.8) % 12;
      const ta = -9 + (k % 4) * 6;
      const tl = L0 - 5.3 + Math.floor(k / 4) * (16 / 3);
      tile.position.set(...c.L(ta, tl, top + 0.2));
      dets.forEach((m, j) => {
        const [a, l] = boats[j];
        const near = Math.abs(a - ta) < 3.4 && Math.abs(L0 + l - tl) < 3.6;
        const s = m.scale.x + ((near || m.scale.x > 0.5 ? 1 : 0) - m.scale.x) * 0.2;
        m.scale.set(s, s, s);
        if (k === 0) m.scale.setScalar(0);
      });
      drone.position.copy(dc).add(new Vector3(Math.sin(t * 0.5) * 3, Math.sin(t * 1.3) * 0.4, Math.cos(t * 0.4) * 2));
    },
    shot: { from: [-34, 62, 34], to: [-14, 50, 26], look: [0, 20, 1] },
  };
}

// ------------------------------------------------------------------ 06 AI Weed Detector · Nanaimo: the berry greenhouse
function weed(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const L0 = 26;
  let gmax = -1e9;
  for (let a = -12; a <= 12; a += 4) for (let l = L0 - 8; l <= L0 + 8; l += 4) gmax = Math.max(gmax, c.G(a, l));
  const base = gmax + 0.2;
  c.add(mats.concrete, new BoxGeometry(18, 0.4, 28), c.L(0, L0, base));
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
    shot: { from: [-40, 50, 6], to: [-12, 58, 20], look: [0, 22, 2], fromLook: [0, 26, 2] },
  };
}

// ------------------------------------------------------------------ 07 ABCKidz · 29th Avenue: learning blocks
function abckidz(c: Ctx): Partial<BuiltSet> {
  const L0 = 24;
  let gmax = -1e9;
  for (let a = -10; a <= 10; a += 5) for (let l = L0 - 8; l <= L0 + 8; l += 4) gmax = Math.max(gmax, c.G(a, l));
  const base = gmax + 0.1;
  c.add(new MeshStandardMaterial({ color: 0x5b8a45, roughness: 1 }), new BoxGeometry(20, 0.3, 24), c.L(0, L0, base));
  const fonts = fontOf();
  const letters = ["A", "B", "C", "K", "I", "D", "Z"];
  const colours = ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#f97316", "#a855f7", "#06b6d4"];
  const stack: [number, number, number, number][] = [
    [-6, -2, 0, 0],
    [-2.6, -2, 0, 1],
    [-4.3, -2, 1, 2],
    [2, 3, 0, 3],
    [5.4, 3, 0, 4],
    [3.7, 3, 1, 5],
    [3.7, 3, 2, 6],
  ];
  const blocks: Mesh[] = [];
  stack.forEach(([a, l, lvl, k]) => {
    const tex = canvasTex(128, 128, (g) => {
      g.fillStyle = colours[k];
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 8;
      g.strokeRect(8, 8, 112, 112);
      g.fillStyle = "#ffffff";
      g.font = `700 84px ${fonts.sans}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(letters[k], 64, 70);
    });
    const m = new Mesh(new BoxGeometry(3.2, 3.2, 3.2), new MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    m.position.set(...c.L(a, L0 + l, base + 1.75 + lvl * 3.25));
    m.rotation.y = ((k * 37) % 20) / 100 - 0.1;
    c.group.add(m);
    blocks.push(m);
  });
  // three role arches with colour-coded paths: teacher, parent, child
  const archCols = [0xf97316, 0x22c55e, 0x3b82f6];
  archCols.forEach((col, k) => {
    const m = glowMat(col, 0.7);
    c.add(m, new TorusGeometry(2.4, 0.3, 8, 32, Math.PI), c.L(-8 + k * 5, L0 + 8, base), [0, Math.PI / 2, 0]);
    c.add(m, new BoxGeometry(7, 0.06, 1.4), c.L(-8 + k * 5, L0 + 4.5, base + 0.2));
  });
  // the upload beam into the vault
  c.add(new MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 }), new BoxGeometry(3.4, 2.4, 3.4), c.L(8, L0 - 7, base + 1.2));
  const beam = new Mesh(new CylinderGeometry(0.3, 0.3, 12, 12, 1, true), new MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }));
  beam.position.set(...c.L(8, L0 - 7, base + 8.4));
  c.group.add(beam);
  return {
    anchors: [new Vector3(...c.L(8, L0 - 7, base + 14.8)), new Vector3(...c.L(-3, L0 + 8, base + 3.4)), new Vector3(...c.L(3.7, L0 + 3, base + 9.4))],
    focus: new Vector3(...c.L(0, L0, base + 3)),
    update: (t) => {
      (beam.material as MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 3) * 0.2;
      blocks.forEach((b, k) => (b.position.y += Math.sin(t * 1.2 + k) * 0.002));
    },
    shot: { from: [-40, 72, 14], to: [-8, 56, 20], look: [0, 22, 4] },
  };
}

// ------------------------------------------------------------------ 08 More projects · Joyce–Collingwood: the night market
function more(c: Ctx): Partial<BuiltSet> {
  const top = terrace(c, -18, 18, 14, 30);
  const L0 = 24;
  const kinds: { col: number; roof: "flat" | "cone" | "dome" | "hex" }[] = [
    { col: 0xef4444, roof: "cone" },
    { col: 0xf59e0b, roof: "flat" },
    { col: 0x6366f1, roof: "hex" },
    { col: 0x10b981, roof: "dome" },
    { col: 0xec4899, roof: "flat" },
    { col: 0xfacc15, roof: "cone" },
  ];
  const anchors: Vector3[] = [];
  const counter = new MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.8 });
  kinds.forEach((k, j) => {
    const a = -14 + j * 5.6;
    const m = new MeshStandardMaterial({ color: k.col, roughness: 0.6, emissive: k.col, emissiveIntensity: 0.15 });
    c.add(counter, new BoxGeometry(3.4, 1.2, 3), c.L(a, L0, top + 0.6));
    for (const [da, dl] of [
      [-1.5, -1.3],
      [1.5, -1.3],
      [-1.5, 1.3],
      [1.5, 1.3],
    ])
      c.add(counter, new CylinderGeometry(0.08, 0.08, 3, 6), c.L(a + da, L0 + dl, top + 1.5));
    if (k.roof === "cone") c.add(m, new ConeGeometry(2.6, 1.6, 4), c.L(a, L0, top + 3.8), [0, Math.PI / 4, 0]);
    else if (k.roof === "dome") c.add(m, new SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), c.L(a, L0, top + 3));
    else if (k.roof === "hex") c.add(m, new CylinderGeometry(2.4, 2.4, 0.5, 6), c.L(a, L0, top + 3.2));
    else c.add(m, new BoxGeometry(3.8, 0.3, 3.4), c.L(a, L0, top + 3.1), [0.12, 0, 0]);
    anchors.push(new Vector3(...c.L(a, L0, top + 5.2 + (j % 2) * 3)));
  });
  // the props: a claw, scales, a mask, a headset, a pixel judge, a bee
  const prop = new MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.4, metalness: 0.3 });
  const p0 = (j: number): [number, number] => [-14 + j * 5.6, L0];
  {
    const [a, l] = p0(0);
    for (const s of [-1, 1]) c.add(prop, new BoxGeometry(0.15, 0.9, 0.15), c.L(a + s * 0.3, l, top + 1.75), [0, 0, s * 0.4]);
  }
  {
    const [a, l] = p0(1);
    c.add(prop, new BoxGeometry(0.1, 0.1, 1.6), c.L(a, l, top + 2.1));
    for (const s of [-1, 1]) c.add(prop, new CylinderGeometry(0.35, 0.35, 0.06, 12), c.L(a + s * 0.7, l, top + 1.75));
  }
  {
    const [a, l] = p0(2);
    c.add(prop, new SphereGeometry(0.5, 12, 8, 0, Math.PI), c.L(a, l, top + 1.8), [0, Math.PI / 2, 0]);
  }
  {
    const [a, l] = p0(3);
    c.add(prop, new TorusGeometry(0.45, 0.07, 6, 16, Math.PI), c.L(a, l, top + 1.6));
  }
  {
    const [a, l] = p0(4);
    c.add(prop, new BoxGeometry(0.6, 0.8, 0.6), c.L(a, l, top + 1.6));
  }
  {
    const [a, l] = p0(5);
    c.add(new MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }), new SphereGeometry(0.42, 12, 8), c.L(a, l, top + 1.65), [0, 0, 0], [1.4, 1, 1]);
  }
  // string lights over the lane
  const N = 48;
  const bulbs = new InstancedMesh(new SphereGeometry(0.12, 6, 4), new MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), N);
  const m4 = new Matrix4();
  for (let k = 0; k < N; k++) {
    const u = k / (N - 1);
    const a = -17 + u * 34;
    m4.makeTranslation(...c.L(a, L0 - 2.4, top + 5 - Math.sin(((u * 6) % 1) * Math.PI) * 0.6));
    bulbs.setMatrixAt(k, m4);
  }
  c.group.add(bulbs);
  return { anchors, focus: new Vector3(...c.L(0, L0 - 2, top + 2)), shot: { from: [-34, 46, 7], to: [24, 48, 12], look: [0, 22, 3], fromLook: [-6, 22, 3] } };
}

// ------------------------------------------------------------------ 09 Contact · Patterson: the forest lookout
function contactSet(c: Ctx): Partial<BuiltSet> {
  const { mats } = c.world;
  const L0 = 26;
  const g = c.G(0, L0);
  const deck = Math.max(g + 1.2, c.G(0, L0 + 6) + 1.2);
  c.add(mats.timber, new BoxGeometry(12, 0.5, 16), c.L(0, L0, deck));
  legs(c, mats.timber, [
    [-6, L0 - 5],
    [6, L0 - 5],
    [-6, L0 + 5],
    [6, L0 + 5],
  ], deck - 0.25, 0.3);
  for (const s of [-1, 1]) c.add(mats.timber, new BoxGeometry(0.15, 1, 16), c.L(0, L0 + s * 5.9, deck + 0.75), [0, 0, 0]);
  // a stand of cedar, fir and hemlock round the deck, in three dimensions since the shot comes close; none on a street
  const { shown } = getZoning(c.lowEnd);
  stand(
    c,
    SET_TREES.filter((t) => t.i === c.i && !shown(...fromStation(t.i, t.a, t.l), 2.5)),
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
  return { anchors, focus: new Vector3(...c.L(0, L0 - 2, deck + 3)), shot: { from: [-12, 46, 4], to: [0, 50, 11], look: [0, 22, 5], fromLook: [0, 30, 6] } };
}

const BUILDERS = [depart, about, null, awdon, planktoneer, vessel, weed, abckidz, more, contactSet] as const;

/** Build every station's set. */
export function buildSets(world: World): BuiltSet[] {
  return stations.map((_, i) => {
    const fr = STATION_FRAMES[i];
    const side = SET_SIDE[i];
    const group = new Group();
    const n = new Vector3(fr.rx * side, 0, fr.rz * side);
    const t = new Vector3(fr.tx, 0, fr.tz);
    const z = n.clone().cross(UP);
    group.matrixAutoUpdate = false;
    // the Granville portals are placed in world space, square to the track where each stands
    if (i !== 2) group.matrix.makeBasis(n, UP, z).setPosition(fr.x, fr.y, fr.z);
    group.matrixWorldNeedsUpdate = true;
    // local z runs along z = n × UP, which is ±t depending on the side
    const zs = z.dot(t) > 0 ? 1 : -1;
    const parts = new Map<Material, Part[]>();
    const c: Ctx = {
      i,
      side,
      world,
      lowEnd: world.lowEnd,
      group,
      L: (a, l, u) => [l, u, a * zs],
      G: (a, l) => groundAt(fr.x + t.x * a + n.x * l, fr.z + t.z * a + n.z * l) - fr.y,
      add: (mat, geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
        const list = parts.get(mat);
        const p: Part = { geo, position: pos, rotation: rot, scale };
        if (list) list.push(p);
        else parts.set(mat, [p]);
      },
    };
    const b = i === 2 ? experience(c, world) : (BUILDERS[i]?.(c) ?? {});
    for (const [mat, list] of parts) {
      const m = new Mesh(merged(list), mat);
      m.castShadow = !world.lowEnd;
      m.receiveShadow = true;
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
      shot: b.shot ?? DEFAULT_SHOT,
    };
  });
}
