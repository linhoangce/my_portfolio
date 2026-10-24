/**
 * The conifers from one description, wherever they stand: the stand built in three dimensions at Contact, the
 * city's conifers near the line (the same build at a lighter detail) and the far ones painted into the tree atlas
 * from it. A conifer is a fluted, tapering trunk with a buttressed foot; whorls of limbs up the crown, each carrying
 * sprays of foliage (two cards crossed along a twig, one flat and one hanging); and a nodding leader. The species set
 * the shape: the cedar broad with drooping, upturned limbs, the Douglas fir a narrow spire with level limbs, the
 * hemlock soft with drooping tips and a deeply nodding top. The skeleton is pure; the textures need a canvas.
 */
import {
  type BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";

import { merged, type Part } from "../merge";

export type Conifer = "cedar" | "fir" | "hemlock";
export const CONIFERS: Conifer[] = ["cedar", "fir", "hemlock"];

const SHAPE = {
  cedar: { R: 5.1, droop: [0.3, 0.25], curl: 0.85, lean: 0.9, sprayS: 1.3, crown: 0.22 },
  fir: { R: 3.9, droop: [0.1, 0.14], curl: 0.6, lean: 0.35, sprayS: 1.15, crown: 0.32 },
  hemlock: { R: 4.3, droop: [0.36, 0.3], curl: 0.5, lean: 1.6, sprayS: 1.1, crown: 0.22 },
} as const;

/** How finely a crown is built: height between whorls, limbs per whorl, sprays per limb. */
export type Detail = { step: number; perWhorl: number; fronds: number };
export const DETAIL_FULL: Detail = { step: 0.5, perWhorl: 4, fronds: 6 };
export const DETAIL_LOW: Detail = { step: 0.95, perWhorl: 3, fronds: 4 };

/** A spray: where its twig starts, its turn about the vertical, its droop, its size (positions from the trunk's foot). */
export type Spray = { p: Vector3; yaw: number; tilt: number; s: number };
export type Skeleton = { sprays: Spray[]; limbs: [Vector3, Vector3][]; trunk: Vector2[]; lead: Vector3[]; height: number };

/** The lowest whorl's height above the foot, if the caller does not set one. */
export const crownFromOf = (sp: Conifer, height: number): number => height * SHAPE[sp].crown;

/** The tree's structure, from its foot at the origin. `seed` turns where the first limb points. */
export function coniferSkeleton(sp: Conifer, height: number, crownFrom: number, detail: Detail, seed: number): Skeleton {
  const sh = SHAPE[sp];
  const trunk: Vector2[] = [];
  const girth = height / 36;
  for (let k = 0; k <= 24; k++) {
    const y = (k / 24) * height;
    // a buttressed flare at the foot, a slow taper to the leader
    const r = (0.32 + 0.95 * (1 - y / height) ** 1.2) * Math.max(0.55, girth) + (sp === "cedar" ? 1.7 : 0.9) * girth * Math.exp(-y / 1.4);
    trunk.push(new Vector2(r, y));
  }
  const sprays: Spray[] = [];
  const limbs: [Vector3, Vector3][] = [];
  const crownH = height - crownFrom;
  const scale = Math.min(1.2, Math.max(0.6, height / 30));
  let az = seed;
  for (let y = crownFrom; y < height - 1.2; y += detail.step) {
    const h = (y - crownFrom) / crownH;
    // widest low down, narrowing to the leader
    const R = (sh.R * (1 - h) ** (sp === "fir" ? 1.05 : 0.9) * (0.75 + 0.25 * Math.min(1, h * 6)) + 0.5) * scale;
    for (let b = 0; b < detail.perWhorl; b++) {
      az += 2.39996;
      const len = R * (0.75 + 0.3 * Math.abs(Math.sin(az * 3.1)));
      const dx = Math.cos(az);
      const dz = Math.sin(az);
      // the limb: out and down, then up at the tip (droop grows down the crown)
      const droop = sh.droop[0] + sh.droop[1] * (1 - h);
      const at = (u: number) => new Vector3(dx * len * u, y + len * (-droop * u + droop * sh.curl * u * u * u), dz * len * u);
      limbs.push([at(0.05), at(0.7)]);
      for (let k = 0; k < detail.fronds; k++) {
        const u = 0.3 + (0.7 * k) / (detail.fronds - 1);
        const side = k % 2 ? 1 : -1;
        sprays.push({
          p: at(u).add(new Vector3(0, -0.05, 0)),
          yaw: -az + side * (0.25 + (0.5 * ((k * 7 + b) % 3)) / 3),
          tilt: (0.25 + 0.4 * u * (1 - h)) * sh.lean,
          s: (1.3 + 1.1 * (1 - u * 0.5)) * (0.7 + 0.3 * (1 - h)) * sh.sprayS * scale,
        });
      }
    }
  }
  // the leader, nodding over at the top (a hemlock's droops right over)
  const nod = sp === "hemlock" ? 1.6 : sp === "fir" ? 0.2 : 0.9;
  const lead: Vector3[] = [];
  for (let k = 0; k <= 6; k++) lead.push(new Vector3((k / 6) ** 2 * nod, height - 1.4 + (k / 6) * 2.2 - (k / 6) ** 3 * nod * 0.7, 0));
  return { sprays, limbs, trunk, lead, height };
}

const q = new Quaternion();
const eu = new Euler(0, 0, 0, "YZX");
const sc = new Vector3();
/** A spray's card transform: along its twig, turned, drooping, and as long and wide as its size. */
export function sprayMatrix(sp: Spray, out: Matrix4): Matrix4 {
  eu.set(0, sp.yaw, -sp.tilt, "YZX");
  return out.compose(sp.p, q.setFromEuler(eu), sc.set(sp.s, 1, sp.s));
}
/** The spray card: two cards crossed along the twig, one lying flat and one hanging, so a crown is full from any side. */
export const sprayCard = (): BufferGeometry =>
  merged([{ geo: new PlaneGeometry(1, 0.62).rotateX(-Math.PI / 2).translate(0.5, 0, 0) }, { geo: new PlaneGeometry(1, 0.5).translate(0.5, -0.14, 0) }]);

/** The trunk, lathed and fluted, from the foot at the origin; `every` keeps one ring of the profile in so many. */
export function trunkGeometry(sk: Skeleton, radial: number, every = 1): BufferGeometry {
  const trunk = new LatheGeometry(
    sk.trunk.filter((_, i) => i % every === 0 || i === sk.trunk.length - 1),
    radial,
  );
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
  return trunk;
}

/** The limbs and the leader as one geometry, from the foot at the origin (`open`: no end caps on the limbs). */
export function limbGeometry(sk: Skeleton, sides: number, open = false): BufferGeometry {
  const up = new Vector3(0, 1, 0);
  const parts: Part[] = sk.limbs.map(([a, b]) => {
    const lv = b.clone().sub(a);
    const r = new Euler().setFromQuaternion(q.setFromUnitVectors(up, lv.clone().normalize()));
    return { geo: new CylinderGeometry(0.05, 0.12, lv.length(), sides, 1, open), position: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], rotation: [r.x, r.y, r.z] };
  });
  parts.push({ geo: new TubeGeometry(new CatmullRomCurve3(sk.lead), 8, 0.09, Math.max(3, sides), false) });
  return merged(parts);
}

/* ------------------------------------------------------------------ textures */

function canvasOf(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) paint(g);
  return c;
}

/** Bark: the cedar's fibrous red-brown strips, the fir's deep grey-brown furrows (hemlock shares it). */
export function barkTexture(sp: Conifer): CanvasTexture {
  const c = canvasOf(64, 256, (g) => {
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
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 7);
  return t;
}

/**
 * One spray of foliage, 128 × 80, the twig along the middle row: the cedar's flat scale-leaf sprays, the fir's stiff
 * needles all round a twig, the hemlock's short soft needles in two flat ranks. In the species' greens.
 */
export function frondCanvas(sp: Conifer): HTMLCanvasElement {
  return canvasOf(128, 80, (g) => {
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
              const na = ang + n * (fir ? 0.9 : 1.4);
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

export function frondTexture(sp: Conifer): CanvasTexture {
  const t = new CanvasTexture(frondCanvas(sp));
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The three fronds stacked in one texture (cedar, fir, hemlock from the top), for one material over all species. */
export function frondAtlas(): CanvasTexture {
  const c = canvasOf(128, 240, (g) => CONIFERS.forEach((sp, k) => g.drawImage(frondCanvas(sp), 0, k * 80)));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
/** Which band of the frond atlas a species reads (v from the bottom, as the texture is flipped). */
export const frondBand = (sp: Conifer): [number, number] => {
  const k = CONIFERS.indexOf(sp);
  return [(2 - k) / 3, (3 - k) / 3];
};
