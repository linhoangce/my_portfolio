/**
 * The culture sites' pieces (cultureLayout in commonsLayout.ts places them, Culture.tsx draws them), each built about
 * its own origin on the ground, its front toward +z. Every part is either painted (its colour on the art atlas's
 * white cell) or shows a cell of the atlas (cultureArt.ts), so a whole site is one mesh on one material.
 */
import { BoxGeometry, type BufferGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Path, PlaneGeometry, Shape } from "three";

import { ART, intoCell, MURAL0, onWhite } from "./cultureArt";
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

/**
 * A Coast Salish longhouse: cedar planks under a single shed roof falling from its tall front (facing +z, toward the
 * water) to its low back, the front a painted house front (a woven one, one of the city's murals), two carved house
 * posts at its corners, a smoke hole along the roof's high edge; on a timber platform reaching down to meet a slope.
 */
export function longhouse(w = 10, d = 6): BufferGeometry[] {
  const hf = 5.2;
  const hb = 3.2;
  const out: BufferGeometry[] = [P(new BoxGeometry(w + 1.6, 3.2, d + 1.6).translate(0, -1.5, 0), 0x7d6650)];
  out.push(
    P(new BoxGeometry(w, hb, 0.3).translate(0, hb / 2, -d / 2 + 0.15), CEDAR),
    P(new BoxGeometry(w, hf, 0.3).translate(0, hf / 2, d / 2 - 0.15), CEDAR),
  );
  // the side walls, tall at the front and low at the back
  for (const s of [-1, 1]) {
    const side = new Shape();
    side.moveTo(-d / 2, 0);
    side.lineTo(d / 2, 0);
    side.lineTo(d / 2, hf);
    side.lineTo(-d / 2, hb);
    side.closePath();
    out.push(P(new ExtrudeGeometry(side, { depth: 0.3, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(s * (w / 2 - 0.15) + 0.15, 0, 0), CEDAR));
  }
  // the plank seams on the front and back, the painted front over them
  for (let x = -w / 2 + 0.8; x < w / 2; x += 0.8) out.push(P(new BoxGeometry(0.05, hb, 0.05).translate(x, hb / 2, -d / 2 - 0.02), 0x6e4a2e));
  out.push(...panel(MURAL0 + (muralsOf("front").at(-1) ?? 0), w - 0.3, hf - 0.2, 0, hf / 2, d / 2 + 0.005));
  // the shed roof, overhanging front and back, and the smoke hole's raised board along its high edge
  const run = d + 1.2;
  const pitch = Math.atan2(hf - hb, d);
  out.push(P(new BoxGeometry(w + 1, 0.22, Math.hypot(run, (hf - hb) * (run / d))).rotateX(-pitch).translate(0, (hf + hb) / 2 + 0.12, 0), 0x5e4a3a));
  out.push(P(new BoxGeometry(w * 0.6, 0.5, 0.7).translate(0, hf + 0.15, d / 2 - 1.1), 0x5e4a3a));
  // the house posts at the front corners, carved, their faces out
  for (const s of [-1, 1]) {
    out.push(P(new BoxGeometry(0.8, hf + 0.8, 0.8).translate(s * (w / 2 + 0.2), (hf + 0.8) / 2, d / 2 + 0.25), CEDAR));
    out.push(...panel(s < 0 ? ART.welcome : ART.welcome2, 0.8, hf + 0.8, s * (w / 2 + 0.2), (hf + 0.8) / 2, d / 2 + 0.655));
  }
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
