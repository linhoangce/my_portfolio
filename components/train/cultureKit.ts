/**
 * The culture sites' pieces (cultureLayout in commonsLayout.ts places them, Culture.tsx draws them), each built about
 * its own origin on the ground, its front toward +z. Every part is either painted (its colour on the art atlas's
 * white cell) or shows a cell of the atlas (cultureArt.ts), so a whole site is one mesh on one material.
 */
import { BoxGeometry, type BufferGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Path, PlaneGeometry, Quaternion, Shape, SphereGeometry, Vector2, Vector3 } from "three";

import { ART, intoCell, MURAL0, onWhite, PLAQUE, PLAQUE_ASPECT, plaqueRect } from "./cultureArt";
import { muralsOf } from "./muralArt";
import { canoe } from "./vehicles";
import { paint } from "./shapes";

const CEDAR = 0x8b4a2b;
const CEDAR_DARK = 0x5e3219;
const STONE = 0x8d8a83;
const STEEL = 0x5b616a;
const PLASTER = 0xf1ece2;
const BLACK_PAINT = 0x15110e;

/** A painted part. */
export const P = (g: BufferGeometry, hex: number): BufferGeometry => onWhite(paint(g, hex));
/** A part showing a cell of the atlas (or a sub-rectangle of it), its uvs spanning the cell. */
export const A = (g: BufferGeometry, cell: number, sub?: [number, number, number, number]): BufferGeometry => paint(intoCell(g, cell, sub), 0xffffff);

/** An art panel w × h facing +z, centred at (x, y, z); `backZ` adds its mirror there facing -z, the right way round. */
function panel(cell: number, w: number, h: number, x: number, y: number, z: number, backZ?: number, sub?: [number, number, number, number]): BufferGeometry[] {
  const out = [A(new PlaneGeometry(w, h).translate(x, y, z), cell, sub)];
  if (backZ !== undefined) {
    const b = new PlaneGeometry(w, h);
    // read from behind, its left and right swap: flip the uvs across
    const uv = b.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    out.push(A(b.rotateY(Math.PI).translate(x, y, backZ), cell, sub));
  }
  return out;
}

/**
 * A Coast Salish–inspired welcome figure in red cedar, about 8 units tall (`s` scales it):
 * - a carved log on a stone plinth, its face and chest painted on the front (the atlas's welcome cells, a man or a
 *   woman), formline in black, red and blue-green round its back, a carved nose standing out of the face;
 * - a shoulder yoke and a button-blanket cape over the back and sides;
 * - both arms raised from the shoulders, bent at the elbow, open palms to the front;
 * - a woven cedar hat (the man), or long hair under a cedar-bark headband (the woman).
 */
export function welcomeFigure(variant = 0, s = 1.15): BufferGeometry[] {
  const out: BufferGeometry[] = [P(new BoxGeometry(2.6, 0.5, 2.2).translate(0, 0.25, 0), STONE), P(new CylinderGeometry(0.95, 1.0, 0.6, 18).translate(0, 0.8, 0), CEDAR_DARK)];
  const y0 = 1.1;
  const y1 = 6.1;
  const H = y1 - y0;
  const half = (r0: number, r1: number, from: number, cell: number) => A(new CylinderGeometry(r1, r0, H, 14, 1, true, from, Math.PI).translate(0, y0 + H / 2, 0), cell);
  out.push(half(0.82, 0.72, -Math.PI / 2, variant ? ART.welcome2 : ART.welcome), half(0.82, 0.72, Math.PI / 2, ART.back), P(new CylinderGeometry(0.72, 0.72, 0.08, 14).translate(0, y1, 0), CEDAR));
  // the nose out of the face, the brows over the eyes
  out.push(P(new BoxGeometry(0.2, 0.42, 0.26).translate(0, y1 - H * 0.24, 0.74), CEDAR), P(new BoxGeometry(0.62, 0.07, 0.12).translate(0, y1 - H * 0.13, 0.72), BLACK_PAINT));
  // the yoke at the shoulders and the cape from them to the knees, round the back and sides
  out.push(A(new CylinderGeometry(0.98, 0.88, 0.42, 18).translate(0, 4.25, 0), ART.weave));
  out.push(A(new CylinderGeometry(0.93, 1.12, 2.7, 18, 1, true, Math.PI / 2 - 0.3, Math.PI + 0.6).translate(0, 4.05 - 1.35, 0), ART.robe));
  // the arms: up and out from the shoulder, then the forearm upright, the palm open to the front
  for (const side of [-1, 1]) {
    const sx = side * 0.95;
    const up = 0.62;
    const ux = sx + side * Math.sin(up) * 1.45;
    const uy = 4.35 + Math.cos(up) * 1.45;
    out.push(A(new BoxGeometry(0.34, 1.5, 0.36).translate(0, 0.75, 0).rotateZ(-side * up).translate(sx, 4.35, 0.05), ART.back));
    out.push(A(new BoxGeometry(0.3, 1.25, 0.32).translate(0, 0.62, 0).rotateZ(-side * 0.12).translate(ux, uy, 0.05), ART.back));
    const hx = ux + side * Math.sin(0.12) * 1.25;
    const hy = uy + Math.cos(0.12) * 1.25;
    out.push(P(new BoxGeometry(0.52, 0.62, 0.14).translate(hx, hy + 0.22, 0.12), CEDAR_DARK), P(new BoxGeometry(0.34, 0.36, 0.02).translate(hx, hy + 0.2, 0.2), 0xa3191b));
  }
  if (variant === 0) {
    // the woven hat: a wide cone of plaited bark over a dark brim, a knob on its crown
    out.push(A(new ConeGeometry(1.2, 0.8, 22, 1, true).translate(0, y1 + 0.42, 0), ART.weave), P(new CylinderGeometry(1.2, 1.2, 0.05, 22).translate(0, y1 + 0.04, 0), 0x6b4a2b), P(new CylinderGeometry(0.1, 0.16, 0.3, 10).translate(0, y1 + 0.95, 0), 0x6b4a2b));
  } else {
    // long hair down the back from under the headband, and the band's ring
    out.push(P(new CylinderGeometry(0.78, 0.86, 1.9, 14, 1, true, Math.PI / 2 + 0.2, Math.PI - 0.4).translate(0, y1 - 0.85, 0), 0x16120f), P(new CylinderGeometry(0.75, 0.75, 0.42, 14).translate(0, y1 + 0.2, 0), 0x16120f));
    out.push(A(new CylinderGeometry(0.77, 0.77, 0.2, 18, 1, true).translate(0, y1 - 0.15, 0), ART.weave));
  }
  for (const g of out) g.scale(s, s, s);
  return out;
}

/** A plaque: a stone slab on a low plinth, the atlas cell (or a quarter of the plaques' cell) on its face. */
export function plaque(cell: number, sub?: [number, number, number, number], w = 1.4, h = 1.4): BufferGeometry[] {
  return [P(new BoxGeometry(w + 0.5, 0.5, 0.7).translate(0, 0.25, 0), STONE), P(new BoxGeometry(w + 0.2, h + 0.2, 0.25).translate(0, 0.5 + (h + 0.2) / 2, 0), 0x6b665e), ...panel(cell, w, h, 0, 0.6 + h / 2, 0.127, undefined, sub)];
}

/** A flag on a pole, `h` tall, flying toward +x and rippling a little, readable from both sides. */
export function flagPole(cell: number, h = 6.5, fw = 2.6, fh = 1.6): BufferGeometry[] {
  const out: BufferGeometry[] = [P(new CylinderGeometry(0.06, 0.09, h, 8).translate(0, h / 2, 0), STEEL), P(new CylinderGeometry(0.12, 0.12, 0.12, 8).translate(0, h + 0.06, 0), 0xd4af37)];
  for (const back of [false, true]) {
    const f = new PlaneGeometry(fw, fh, 8, 1);
    if (back) {
      const uv = f.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      f.rotateY(Math.PI);
    }
    f.translate(fw / 2, h - fh / 2 - 0.1, 0);
    const pos = f.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(x * 2.4) * 0.14 * (x / fw) + (back ? -0.01 : 0.01));
    }
    out.push(A(f, cell));
  }
  return out;
}

/** A spindle whorl the size of a person and more: a cedar disc on a timber frame, the whorl's carving both faces. */
export function spindleWhorl(r = 1.6): BufferGeometry[] {
  const cy = r + 1.0;
  const out: BufferGeometry[] = [
    P(new BoxGeometry(2 * r + 0.8, 0.4, 1.4).translate(0, 0.2, 0), STONE),
    P(new CylinderGeometry(r, r, 0.24, 36).rotateX(Math.PI / 2).translate(0, cy, 0), CEDAR),
    A(new CircleGeometry(r * 0.99, 36).translate(0, cy, 0.122), ART.whorl),
    A(new CircleGeometry(r * 0.99, 36).rotateY(Math.PI).translate(0, cy, -0.122), ART.whorl),
  ];
  for (const s of [-1, 1]) out.push(P(new BoxGeometry(0.24, cy + 0.2, 0.3).translate(s * (r + 0.2), (cy + 0.2) / 2 + 0.2, 0), CEDAR_DARK));
  out.push(P(new CylinderGeometry(0.06, 0.06, 2 * r + 0.4, 8).rotateZ(Math.PI / 2).translate(0, cy, 0), CEDAR_DARK));
  return out;
}

/**
 * A Coast Salish big house, `w` long and `d` deep: cedar plank walls under a low gable of planks, its front painted
 * (the atlas's big house cell) round a dark doorway, two carved house posts flanking the entrance, a smoke hole along
 * the ridge.
 */
export function bigHouse(w = 11, d = 6.5): BufferGeometry[] {
  const wallH = 3.0;
  const ridge = 4.3;
  const out: BufferGeometry[] = [P(new BoxGeometry(w + 0.8, 0.25, d + 0.8).translate(0, 0.12, 0), 0x9a8f80)];
  // the walls: back and ends plank-dark, the front a painted housefront
  out.push(
    P(new BoxGeometry(w, wallH, 0.3).translate(0, wallH / 2, -d / 2 + 0.15), CEDAR),
    P(new BoxGeometry(0.3, wallH, d).translate(-w / 2 + 0.15, wallH / 2, 0), CEDAR),
    P(new BoxGeometry(0.3, wallH, d).translate(w / 2 - 0.15, wallH / 2, 0), CEDAR),
    P(new BoxGeometry(w, wallH, 0.3).translate(0, wallH / 2, d / 2 - 0.15), CEDAR),
  );
  out.push(...panel(ART.bighouse, w - 0.2, wallH, 0, wallH / 2 + 0.05, d / 2 + 0.005));
  // the gable ends' triangles and the two roof slopes, the smoke hole a gap along the ridge
  const half = d / 2 + 0.5;
  const slope = Math.hypot(half, ridge - wallH);
  const pitch = Math.atan2(ridge - wallH, half);
  for (const s of [-1, 1]) {
    const roof = new BoxGeometry(w + 0.8, 0.18, slope - 0.35)
      .rotateX(s * pitch)
      .translate(0, (wallH + ridge) / 2 + 0.05, s * (half / 2 + 0.17));
    out.push(P(roof, 0x6e5a48));
    const gable = new Shape();
    gable.moveTo(-d / 2, 0);
    gable.lineTo(d / 2, 0);
    gable.lineTo(0, ridge - wallH);
    gable.closePath();
    out.push(P(new ExtrudeGeometry(gable, { depth: 0.3, bevelEnabled: false }).rotateY(Math.PI / 2).translate(s * (w / 2 - 0.15) - 0.15, wallH, 0), CEDAR));
  }
  // the house posts at the entrance: carved figures, faces to the front
  for (const s of [-1, 1]) {
    out.push(P(new BoxGeometry(0.8, 3.6, 0.7).translate(s * 2.1, 1.8, d / 2 + 0.6), CEDAR), ...panel(ART.welcome, 0.8, 3.6, s * 2.1, 1.8, d / 2 + 0.952));
  }
  return out;
}

const GRANITE = 0x6f6a66;
const BRONZE = 0x5b4630;
const BRONZE_DEEP = 0x3e2e1f;
const VERDIGRIS = 0x4f6b5a;
/** A colour as three stores vertex colours (linear). */
const linear = (hex: number): [number, number, number] => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
};
const hash3 = (x: number, y: number, z: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

/** Granite: painted, each vertex a little lighter or darker by where it is (a subdivided part shows the speckle). */
function granite(g: BufferGeometry, hex = GRANITE, amount = 0.3): BufferGeometry {
  const out = P(g, hex);
  const pos = out.attributes.position;
  const col = out.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const f = 1 - amount / 2 + amount * hash3(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  return out;
}

/**
 * Cast bronze on the parts of a group standing about its own axis: the bronze darkens into the recesses (faces turned
 * down, and the deep middle of the group, within `core` of its axis) and takes a faint verdigris on its upward faces.
 */
function patina(parts: BufferGeometry[], core: number): BufferGeometry[] {
  const [br, bg, bb] = linear(BRONZE);
  const [dr, dg, db] = linear(BRONZE_DEEP);
  const [vr, vg, vb] = linear(VERDIGRIS);
  return parts.map((part) => {
    const g = P(part, BRONZE);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const col = g.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const ny = nor.getY(i);
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const deep = Math.min(1, Math.max(0, -ny) * 0.8 + Math.max(0, 1 - r / core) * 0.6);
      const green = Math.min(1, Math.max(0, (ny - 0.55) / 0.4)) * 0.5;
      const c = [br + (dr - br) * deep, bg + (dg - bg) * deep, bb + (db - bb) * deep];
      col.setXYZ(i, c[0] + (vr - c[0]) * green, c[1] + (vg - c[1]) * green, c[2] + (vb - c[2]) * green);
    }
    return g;
  });
}

/** An ellipsoid with radii (rx, ry, rz) about (x, y, z). */
const ellipsoid = (rx: number, ry: number, rz: number, x: number, y: number, z: number, seg: number) => new SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.6))).scale(rx, ry, rz).translate(x, y, z);
/** A box h tall, w × d at its foot narrowing to tw × td at its head, standing on the origin. */
function taper(w: number, d: number, tw: number, td: number, h: number): BufferGeometry {
  const g = new BoxGeometry(1, h, 1).translate(0, h / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > h / 2;
    pos.setX(i, pos.getX(i) * (top ? tw : w));
    pos.setZ(i, pos.getZ(i) * (top ? td : d));
  }
  g.computeVertexNormals();
  return g;
}
/** A feather or a fin: a blade from the origin along +x, `len` long, w wide (along y) and t thick at its root. */
const blade = (len: number, w: number, t: number, tip = 0.35) => taper(w, t, w * tip, t * 0.6, len).rotateZ(-Math.PI / 2);
const UP = new Vector3(0, 1, 0);
/** A limb from a to b, r0 thick at a and r1 at b. */
function limb(a: [number, number, number], b: [number, number, number], r0: number, r1: number): BufferGeometry {
  const v = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = v.length();
  const g = new CylinderGeometry(r1, r0, len, 5, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, v.normalize()));
  return g.translate(a[0], a[1], a[2]);
}
/** A blade fanned out from a shoulder on side s (1 right, -1 left): raised by `rise`, swept back by `sweep`. */
const fanned = (b: BufferGeometry, s: number, rise: number, sweep: number) => b.rotateZ(s > 0 ? rise : Math.PI - rise).rotateY(s * sweep);

/**
 * One of the four standing figures, about 3.4 tall, facing +z, its feet on the origin: a robed body turned on a lathe,
 * the head, the arms, and what each carries:
 * - 0, an elder with a hand drum and its beater;
 * - 1, a woman in a button blanket, an eagle-feather fan raised in her right hand;
 * - 2, a youth with a canoe paddle;
 * - 3, a mother carrying her child.
 */
function standingFigure(kind: number, seg: number): BufferGeometry[] {
  const robe: [number, number][] = [
    [0.001, 0],
    [0.66, 0],
    [0.62, 0.35],
    [0.52, 1.3],
    [0.44, 2.1],
    [0.5, 2.5],
    [0.36, 2.72],
    [0.15, 2.82],
    [0.001, 2.86],
  ];
  const out: BufferGeometry[] = [new LatheGeometry(robe.map(([r, y]) => new Vector2(r, y)), seg).scale(1, 1, 0.72)];
  out.push(ellipsoid(0.22, 0.28, 0.24, 0, 3.12, 0.02, seg), ellipsoid(0.13, 0.14, 0.1, 0, 2.86, 0, 6));
  const shoulder = (s: number): [number, number, number] => [s * 0.46, 2.5, 0];
  if (kind === 0) {
    // the drum held up before the chest in the left hand, the beater raised in the right; a headband
    out.push(new CylinderGeometry(0.46, 0.46, 0.1, seg).rotateX(Math.PI / 2).translate(-0.12, 2.1, 0.62));
    out.push(limb(shoulder(-1), [-0.42, 1.85, 0.35], 0.11, 0.08), limb([-0.42, 1.85, 0.35], [-0.2, 2.05, 0.56], 0.08, 0.06));
    out.push(limb(shoulder(1), [0.62, 2.1, 0.25], 0.11, 0.08), limb([0.62, 2.1, 0.25], [0.5, 2.6, 0.55], 0.08, 0.06));
    out.push(limb([0.5, 2.6, 0.55], [0.18, 2.35, 0.82], 0.025, 0.025), ellipsoid(0.07, 0.07, 0.07, 0.18, 2.35, 0.82, 5));
    out.push(new CylinderGeometry(0.235, 0.235, 0.08, seg).translate(0, 3.2, 0.02));
  } else if (kind === 1) {
    // the blanket's wide collar over the shoulders, the fan of five feathers raised in the right hand, her hair
    out.push(new LatheGeometry([new Vector2(0.62, 2.0), new Vector2(0.6, 2.42), new Vector2(0.38, 2.68)], seg).scale(1, 1, 0.78));
    out.push(limb(shoulder(-1), [-0.5, 1.75, 0.18], 0.1, 0.08), limb([-0.5, 1.75, 0.18], [-0.2, 1.7, 0.42], 0.08, 0.06));
    out.push(limb(shoulder(1), [0.62, 2.0, 0.2], 0.1, 0.08), limb([0.62, 2.0, 0.2], [0.58, 2.62, 0.42], 0.08, 0.06));
    for (let k = 0; k < 5; k++) out.push(blade(0.62, 0.14, 0.03).rotateZ(Math.PI / 2 - 0.5 + k * 0.25).translate(0.58, 2.66, 0.44));
    out.push(ellipsoid(0.24, 0.32, 0.18, 0, 3.0, -0.12, seg));
  } else if (kind === 2) {
    // the paddle held upright at the right side, its blade by the feet
    out.push(limb([0.48, 0.12, 0.42], [0.48, 3.5, 0.42], 0.045, 0.04), ellipsoid(0.15, 0.5, 0.04, 0.48, 0.62, 0.42, seg), ellipsoid(0.1, 0.05, 0.06, 0.48, 3.52, 0.42, 5));
    out.push(limb(shoulder(1), [0.56, 2.0, 0.3], 0.1, 0.08), limb([0.56, 2.0, 0.3], [0.48, 2.35, 0.42], 0.08, 0.06));
    out.push(limb(shoulder(-1), [-0.5, 1.75, 0.12], 0.1, 0.08), limb([-0.5, 1.75, 0.12], [-0.42, 1.4, 0.26], 0.08, 0.06));
  } else {
    // the child carried on the left hip, her arms round it, her hair down her back
    out.push(ellipsoid(0.26, 0.38, 0.24, -0.3, 1.95, 0.5, seg), ellipsoid(0.17, 0.18, 0.17, -0.28, 2.48, 0.56, seg));
    out.push(limb(shoulder(-1), [-0.56, 1.95, 0.25], 0.1, 0.08), limb([-0.56, 1.95, 0.25], [-0.1, 1.7, 0.7], 0.08, 0.06));
    out.push(limb(shoulder(1), [0.5, 1.95, 0.3], 0.1, 0.08), limb([0.5, 1.95, 0.3], [-0.1, 2.15, 0.72], 0.08, 0.06));
    out.push(ellipsoid(0.24, 0.36, 0.16, 0, 2.95, -0.14, seg));
  }
  return out;
}

/** The thunderbird over the group: body, head and hooked beak, wings raised and spread 6.5 across, its tail fanned. */
function thunderbird(seg: number): BufferGeometry[] {
  const out: BufferGeometry[] = [ellipsoid(0.5, 0.9, 0.55, 0, 0, 0, seg).rotateX(0.18), ellipsoid(0.3, 0.32, 0.36, 0, 0.98, 0.22, seg)];
  // the beak, out and hooking down
  out.push(new ConeGeometry(0.12, 0.42, 6).rotateX(Math.PI / 2).translate(0, 0.98, 0.72), new ConeGeometry(0.07, 0.2, 5).rotateX(Math.PI).translate(0, 0.84, 0.88));
  // each wing seven feathers fanned from its shoulder, the lowest reaching furthest out, the highest standing up, and
  // a broad covert over their roots
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) out.push(fanned(blade(2.85 - k * 0.06, 0.42 - k * 0.02, 0.07), s, 0.09 + k * 0.135, 0.14).translate(s * 0.44, 0.42, -0.08 - 0.06 * k));
    out.push(ellipsoid(0.75, 0.35, 0.16, s * 0.8, 0.66, -0.12, seg));
  }
  // the tail: five feathers fanned down and back
  for (let k = 0; k < 5; k++) out.push(blade(1.0, 0.24, 0.05).rotateZ(-Math.PI / 2 + (k - 2) * 0.22).rotateX(0.45).translate(0, -0.7, -0.38));
  // the talons gripping the perch
  for (const s of [-1, 1]) out.push(limb([s * 0.2, -0.65, 0.08], [s * 0.22, -1.05, 0.12], 0.08, 0.06));
  return out;
}

/** The four spirit animals, about 1.2 to 1.9 tall, each facing +z on the origin: bear, wolf, raven, salmon. */
function spiritAnimal(kind: number, seg: number): BufferGeometry[] {
  if (kind === 0) {
    // the bear, rearing: haunches, the body up and leaning back, the head, snout and ears, forepaws raised
    return [
      ellipsoid(0.42, 0.34, 0.42, 0, 0.34, -0.05, seg),
      ellipsoid(0.38, 0.62, 0.34, 0, 0.98, 0, seg).rotateX(-0.15),
      ellipsoid(0.26, 0.24, 0.26, 0, 1.68, 0.1, seg),
      ellipsoid(0.11, 0.1, 0.16, 0, 1.63, 0.34, 5),
      ellipsoid(0.08, 0.08, 0.05, -0.17, 1.88, 0.06, 4),
      ellipsoid(0.08, 0.08, 0.05, 0.17, 1.88, 0.06, 4),
      limb([-0.28, 1.3, 0.12], [-0.34, 1.62, 0.46], 0.11, 0.09),
      limb([0.28, 1.3, 0.12], [0.34, 1.62, 0.46], 0.11, 0.09),
    ];
  }
  if (kind === 1) {
    // the wolf, sitting and howling: haunches, chest, the head thrown back with its muzzle to the sky, ears, forelegs, tail
    return [
      ellipsoid(0.32, 0.3, 0.42, 0, 0.3, -0.12, seg),
      ellipsoid(0.24, 0.48, 0.26, 0, 0.72, 0.16, seg).rotateX(-0.25),
      ellipsoid(0.19, 0.2, 0.22, 0, 1.18, 0.26, seg),
      new ConeGeometry(0.12, 0.42, 6).rotateX(0.6).translate(0, 1.42, 0.38),
      new ConeGeometry(0.06, 0.18, 4).translate(-0.1, 1.38, 0.18),
      new ConeGeometry(0.06, 0.18, 4).translate(0.1, 1.38, 0.18),
      limb([-0.12, 0.62, 0.32], [-0.12, 0.02, 0.38], 0.06, 0.05),
      limb([0.12, 0.62, 0.32], [0.12, 0.02, 0.38], 0.06, 0.05),
      limb([0.15, 0.12, -0.4], [0.32, 0.06, -0.78], 0.1, 0.04),
    ];
  }
  if (kind === 2) {
    // the raven, its wings half open: body, head and heavy beak, two wings out, up and back, the tail, the legs
    const out = [
      ellipsoid(0.24, 0.26, 0.46, 0, 0.62, 0, seg).rotateX(0.35),
      ellipsoid(0.16, 0.16, 0.18, 0, 0.98, 0.32, seg),
      new ConeGeometry(0.07, 0.3, 5).rotateX(Math.PI / 2).translate(0, 0.96, 0.6),
      blade(0.6, 0.16, 0.04).rotateZ(-Math.PI / 2).rotateX(1.2).translate(0, 0.5, -0.3),
      limb([-0.08, 0.4, 0.05], [-0.08, 0.02, 0.1], 0.03, 0.03),
      limb([0.08, 0.4, 0.05], [0.08, 0.02, 0.1], 0.03, 0.03),
    ];
    for (const s of [-1, 1]) out.push(fanned(blade(0.95, 0.34, 0.04), s, 0.55, 0.5).translate(s * 0.18, 0.74, 0.02));
    return out;
  }
  // the salmon, leaping from a wave: its body an arc of segments rising from the water, head forward, the tail fin
  // down at the wave and a fin on its back
  const out: BufferGeometry[] = [new LatheGeometry([new Vector2(0.55, 0), new Vector2(0.5, 0.12), new Vector2(0.2, 0.28), new Vector2(0.001, 0.32)], seg)];
  const at = (t: number): [number, number, number, number] => [0, 0.3 + Math.sin(t * Math.PI) * 1.05, -0.55 + t * 1.1, Math.atan2(1.05 * Math.PI * Math.cos(t * Math.PI), 1.1)];
  for (let k = 0; k < 5; k++) {
    const t = 0.1 + k * 0.13;
    const [x, y, z, up] = at(t);
    const r = 0.17 + 0.07 * Math.sin(((k + 0.5) / 5) * Math.PI);
    out.push(new SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.6))).scale(r * 0.75, r, 0.26).rotateX(-up).translate(x, y, z));
  }
  const [hx, hy, hz, hup] = at(0.72);
  out.push(new ConeGeometry(0.14, 0.32, 6).rotateX(Math.PI / 2 - hup).translate(hx, hy, hz));
  const [tx, ty, tz, tup] = at(0.06);
  out.push(blade(0.42, 0.34, 0.03).rotateY(Math.PI / 2).rotateX(-tup).translate(tx, ty, tz));
  const [fx, fy, fz] = at(0.42);
  out.push(blade(0.28, 0.2, 0.03).rotateZ(Math.PI / 2).translate(fx, fy + 0.16, fz));
  return out;
}

/**
 * A monument to truth and reconciliation, after Lloyd Pinay's National Aboriginal Veterans Monument in Ottawa (not a
 * copy of it), about 11 tall, its front (+z, the bronze plaque) to the water:
 * - a granite base 3.6 high: two steps, 5.6 then 4.4 square, and a plinth tapering a little to a polished cap, the
 *   lowest step reaching 1.5 down to meet a slope;
 * - on it, in bronze, four figures standing back to back, facing the four directions (an elder with a hand drum, a
 *   woman in a button blanket raising an eagle-feather fan, a youth with a paddle, a mother carrying her child);
 * - over them a thunderbird, its wings raised and spread;
 * - at the cap's corners the spirit animals: a rearing bear, a howling wolf, a raven, a leaping salmon;
 * - the plaque on the plinth's front (cultureArt.ts, PLAQUE.monument).
 * About 4k triangles (half on low-end devices).
 */
export function reconciliationMonument(lowEnd = false): BufferGeometry[] {
  const seg = lowEnd ? 5 : 10;
  const sub = lowEnd ? 1 : 4;
  const out: BufferGeometry[] = [];
  // the granite: the lowest step down into the slope, the second, the plinth narrowing a little, the polished cap
  out.push(granite(new BoxGeometry(5.6, 1.95, 5.6, sub, Math.ceil(sub / 2), sub).translate(0, -1.5 + 1.95 / 2, 0)));
  out.push(granite(new BoxGeometry(4.4, 0.45, 4.4, Math.max(1, sub - 1), 1, Math.max(1, sub - 1)).translate(0, 0.45 + 0.225, 0)));
  out.push(granite(taper(3.2, 3.2, 2.9, 2.9, 2.4).translate(0, 0.9, 0), 0x67625e));
  out.push(granite(new BoxGeometry(3.3, 0.3, 3.3).translate(0, 3.45, 0), 0x55504d, 0.08));
  // the plaque on the plinth's front, leaning back with its face, in a bronze frame
  const lean = Math.atan2(0.15, 2.4);
  const at = (g: BufferGeometry) => g.rotateX(-lean).translate(0, 2.1, 1.525 + 0.045);
  out.push(...patina([at(new BoxGeometry(2.05, 1.4, 0.06))], 0.1));
  const pw = 1.85;
  out.push(...panel(ART.plaques, pw, pw / PLAQUE_ASPECT, 0, 0, 0.04, undefined, plaqueRect(PLAQUE.monument)).map(at));
  // the bronze group on the cap: the four figures back to back round a core, the thunderbird over them
  const bronze: BufferGeometry[] = [new LatheGeometry([new Vector2(0.001, 0), new Vector2(0.62, 0), new Vector2(0.5, 1.6), new Vector2(0.42, 3.4), new Vector2(0.3, 4.1), new Vector2(0.001, 4.3)], seg)];
  for (let k = 0; k < 4; k++) for (const g of standingFigure(k, seg)) bronze.push(g.translate(0, 0, 0.42).rotateY((k * Math.PI) / 2));
  for (const g of thunderbird(seg)) bronze.push(g.translate(0, 5.0, 0.05));
  // the animals on the cap's corners, each facing out along its diagonal
  for (let k = 0; k < 4; k++) {
    const sx = k === 0 || k === 3 ? 1 : -1;
    const sz = k < 2 ? 1 : -1;
    for (const g of spiritAnimal(k, Math.max(4, seg - 3))) bronze.push(g.rotateY(Math.atan2(sx, sz)).translate(sx * 1.22, 0, sz * 1.22));
  }
  out.push(...patina(bronze, 0.55).map((g) => g.translate(0, 3.6, 0)));
  return out;
}

/** A tall carved post: a welcome face at its head, formline salmon down its front, its back and sides carved too. */
export function carvedPost(h = 8): BufferGeometry[] {
  const out: BufferGeometry[] = [P(new BoxGeometry(1.0, h, 1.0).translate(0, h / 2, 0), CEDAR)];
  out.push(...panel(ART.welcome2, 1.0, 3.0, 0, h - 1.5, 0.505));
  out.push(...panel(MURAL0 + (muralsOf("formline").at(-1) ?? 0), 1.0, h - 3.2, 0, (h - 3.2) / 2 + 0.1, 0.505));
  out.push(...panel(ART.back, 1.0, h, 0, h / 2, -0.505, undefined));
  out.push(P(new BoxGeometry(1.5, 0.3, 1.5).translate(0, h + 0.15, 0), 0x5e4a3a));
  return out;
}

/** A fire circle: a ring of stones round its embers, log benches round it. */
export function fireCircle(): BufferGeometry[] {
  const out: BufferGeometry[] = [P(new CylinderGeometry(0.75, 0.85, 0.12, 12).translate(0, 0.06, 0), 0x2a1d14)];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    out.push(P(new BoxGeometry(0.4, 0.3, 0.35).rotateY(a).translate(Math.cos(a) * 1.0, 0.15, Math.sin(a) * 1.0), 0x8f8a82));
  }
  out.push(P(new ConeGeometry(0.4, 0.5, 6).translate(0, 0.35, 0), 0xd2452f), P(new ConeGeometry(0.22, 0.4, 5).translate(0.15, 0.3, -0.1), 0xf2b632));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    out.push(P(new CylinderGeometry(0.22, 0.22, 2.2, 7).rotateZ(Math.PI / 2).rotateY(-a).translate(Math.cos(a) * 2.4, 0.22, Math.sin(a) * 2.4), 0x7a5a3a));
  }
  return out;
}

/** A journey canoe without its crew, bow along +z, its hull black. */
export function canoeHull(): BufferGeometry[] {
  return [P(canoe(false), 0x1d1b1a)];
}

/** A moon gate: a white garden wall with a round opening, under a tiled cap. */
export function moonGate(w = 5, h = 3.2, r = 1.15): BufferGeometry[] {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const hole = new Path();
  hole.absarc(0, r + 0.35, r, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const wall = new ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -0.18);
  const out = [P(wall, PLASTER), P(new BoxGeometry(w + 0.5, 0.18, 0.75).translate(0, h + 0.09, 0), 0x2f343b), P(new BoxGeometry(w + 0.2, 0.22, 0.5).translate(0, h + 0.28, 0), 0x2f343b)];
  // the cap's upturned ends
  for (const sx of [-1, 1]) out.push(P(new ConeGeometry(0.16, 0.5, 6).rotateZ(-sx * 1.1).translate(sx * (w / 2 + 0.3), h + 0.3, 0), 0x2f343b));
  return out;
}

/** A taiko stage: a timber platform, three drums on their stands, a red and white curtain behind. */
export function taikoStage(): BufferGeometry[] {
  const out: BufferGeometry[] = [P(new BoxGeometry(4.4, 0.45, 2.8).translate(0, 0.22, 0), 0x9b7653), P(new BoxGeometry(4.4, 2.2, 0.08).translate(0, 1.55, -1.35), PLASTER)];
  for (let k = 0; k < 4; k++) out.push(P(new BoxGeometry(0.55, 2.2, 0.1).translate(-1.65 + k * 1.1, 1.55, -1.3), 0xc8281e));
  for (const [x, r] of [
    [-1.4, 0.38],
    [0, 0.55],
    [1.4, 0.38],
  ] as const) {
    const y = 0.45 + r + 0.35;
    out.push(P(new CylinderGeometry(r, r * 1.08, 0.75, 14).rotateX(Math.PI / 2).translate(x, y, 0.2), 0x7a2e1a));
    out.push(P(new CircleGeometry(r * 0.96, 14).translate(x, y, 0.58), 0xf3e9d2));
    out.push(P(new BoxGeometry(0.1, y - 0.45, 0.1).translate(x - r * 0.6, 0.45 + (y - 0.45) / 2, 0.2), 0x3b2412), P(new BoxGeometry(0.1, y - 0.45, 0.1).translate(x + r * 0.6, 0.45 + (y - 0.45) / 2, 0.2), 0x3b2412));
  }
  return out;
}

/** A banner on a pole: a crossbar and a hanging banner (the atlas cell), readable from both sides. */
export function banner(cell: number, h = 4.4, bw = 1.2, bh = 2.4): BufferGeometry[] {
  return [
    P(new CylinderGeometry(0.06, 0.08, h, 8).translate(0, h / 2, 0), STEEL),
    P(new BoxGeometry(bw + 0.2, 0.06, 0.06).translate(bw / 2, h - 0.2, 0), STEEL),
    ...panel(cell, bw, bh, bw / 2 + 0.05, h - 0.25 - bh / 2, 0.01, -0.01),
  ];
}

/**
 * One of senákw's sculpted forms, 9 across and 5.8 high, standing out from a face: a stem that splits into two arms
 * curving apart, like a Y on its side (flip turns it to point the other way). Built in its face's plane, the face's
 * outward normal along +z.
 */
export function towerForm(white: boolean, flip: boolean): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(-1.9, 0.14);
  sh.lineTo(-0.5, 0.14);
  sh.quadraticCurveTo(0.6, 0.2, 1.9, 1.2);
  sh.lineTo(1.9, 0.86);
  sh.quadraticCurveTo(0.7, 0.06, 1.9, -0.86);
  sh.lineTo(1.9, -1.2);
  sh.quadraticCurveTo(0.6, -0.2, -0.5, -0.14);
  sh.lineTo(-1.9, -0.14);
  sh.closePath();
  const g = new ExtrudeGeometry(sh, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 10 });
  g.scale(flip ? -2.4 : 2.4, 2.4, 2);
  return P(g, white ? 0xf3f1ec : 0xe2541c);
}

/** A freestanding mural wall, its painting on both faces. */
export function muralWall(cell: number, w = 6, h = 3.4): BufferGeometry[] {
  return [P(new BoxGeometry(w + 0.3, h + 0.5, 0.3).translate(0, (h + 0.5) / 2, 0), 0xc9c4ba), ...panel(cell, w, h, 0, 0.35 + h / 2, 0.152, -0.152)];
}
