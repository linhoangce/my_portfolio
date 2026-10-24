/**
 * The attractions of downtown's open places (commonsLayout.ts):
 * - a group of laughing bronze figures;
 * - a wave arch of steel ribbons;
 * - a playground;
 * - a restored steam locomotive under its canopy;
 * - Gastown's five-globe lamps and park lamps;
 * - Chinatown's lantern strings and a dragon on poles;
 * - a giant chess board and ping-pong tables;
 * - a stage with terraced seats;
 * - a ring sculpture and picnic blankets.
 *
 * Each is built in its own frame (x across, z ahead or out of its front, y up from the ground under it) as pavilion.ts
 * Pieces: painted solid parts, glass, and warm lights.
 */
import { BoxGeometry, type BufferGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Matrix4, OctahedronGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";

import type { Pieces } from "./pavilion";
import { paint } from "./shapes";

const empty = (): Pieces => ({ solid: [], glass: [], warm: [] });
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => paint(new BoxGeometry(w, h, d).translate(x, y, z), hex);
const cyl = (r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, hex: number) => paint(new CylinderGeometry(r0, r1, h, seg).translate(x, y, z), hex);
/** A rod from a to b. */
function rod(a: Vector3, b: Vector3, r: number, hex: number, seg = 5): BufferGeometry {
  const d = b.clone().sub(a);
  const g = new CylinderGeometry(r, r, d.length(), seg);
  g.applyMatrix4(new Matrix4().lookAt(new Vector3(), d, new Vector3(0, 0, 1)).multiply(new Matrix4().makeRotationX(Math.PI / 2)));
  return paint(g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), hex);
}
const WARM = 0xffd49a;
const BLACK = 0x1b1d20;

/**
 * Laughing bronze figures, larger than life, in two loose rows on a granite pad (after A-maze-ing Laughter at
 * English Bay): each leans back from the hips, head thrown back and mouth wide, arms at its sides.
 */
export function laughingFigures(n = 8, seed = 1): Pieces {
  const out = empty();
  out.solid.push(box(n * 0.9 + 1.6, 0.18, 4.6, 0, 0.09, 0, 0xa9a49a));
  const bronze = [0x7a5a34, 0x86643a, 0x6f5230];
  for (let k = 0; k < n; k++) {
    const hex = bronze[k % bronze.length];
    const x = -((n - 1) * 0.9) / 2 + k * 0.9 + (k % 2 ? 0.2 : -0.2);
    const z = k % 2 ? 1.1 : -1.1;
    const yaw = Math.sin(seed * 7 + k * 2.3) * 0.5;
    const lean = -0.25 - 0.12 * Math.sin(seed + k);
    // the upper body, built about the hips and leant back
    const upper = [
      box(0.82, 1.0, 0.46, 0, 0.5, 0, hex),
      paint(new SphereGeometry(0.34, 7, 5).scale(1, 1.1, 1).translate(0, 1.42, 0), hex),
      // the open mouth, on the face's front
      box(0.22, 0.14, 0.06, 0, 1.33, 0.31, 0x2a1d12),
      box(0.22, 0.86, 0.24, -0.53, 0.42, 0, hex),
      box(0.22, 0.86, 0.24, 0.53, 0.42, 0, hex),
    ];
    const tilt = new Matrix4().makeRotationX(lean);
    const parts = [...upper.map((g) => g.applyMatrix4(tilt).translate(0, 1.1, 0)), box(0.34, 1.12, 0.38, -0.21, 0.56, 0, hex), box(0.34, 1.12, 0.38, 0.21, 0.56, 0, hex)];
    for (const g of parts) out.solid.push(g.scale(1.25, 1.25, 1.25).rotateY(yaw).translate(x, 0.18, z));
  }
  return out;
}

/** A wave arch over a path: three steel ribbons rising over it, leaning apart, one in red; it spans x, the path runs along z. */
export function waveArch(span = 8): Pieces {
  const out = empty();
  const R = span / 2;
  // each ribbon a half ring spanning x, leaning out of the upright
  for (const [z, lean, hex] of [
    [-0.7, -0.22, 0xd8dde3],
    [0, 0, 0xd2452f],
    [0.7, 0.22, 0xd8dde3],
  ] as const)
    out.solid.push(paint(new TorusGeometry(R, 0.14, 5, 18, Math.PI).rotateX(lean).translate(0, 0, z), hex));
  for (const x of [-R, R]) out.solid.push(box(0.9, 0.3, 2.6, x, 0.15, 0, 0x8f9298));
  return out;
}

/** A playground on a rubber pad: a slide tower, a climbing net, swings, a see-saw and two spring riders. */
export function playground(): Pieces {
  const out = empty();
  out.solid.push(box(9, 0.12, 8, 0, 0.06, 0, 0x3fa7a0), box(9.4, 0.25, 0.25, 0, 0.12, 4.1, 0xb98a5a), box(9.4, 0.25, 0.25, 0, 0.12, -4.1, 0xb98a5a));
  // the slide tower: a deck on posts, a little roof, a ladder and the slide
  for (const [x, z] of [
    [-3.6, -2.6],
    [-2, -2.6],
    [-3.6, -1],
    [-2, -1],
  ])
    out.solid.push(cyl(0.08, 0.08, 2.8, 5, x, 1.4, z, 0xf2b632));
  out.solid.push(box(1.8, 0.15, 1.8, -2.8, 1.5, -1.8, 0xb98a5a), paint(new ConeGeometry(1.4, 0.9, 4).rotateY(Math.PI / 4).translate(-2.8, 3.2, -1.8), 0xd2452f));
  out.solid.push(paint(new BoxGeometry(0.9, 0.1, 3.4).rotateX(-0.45).translate(-2.8, 0.85, 0.75), 0xd2452f));
  for (let y = 0.4; y < 1.5; y += 0.35) out.solid.push(box(0.8, 0.06, 0.08, -2.8, y, -2.75, 0x2a3039));
  // the climbing net: ropes from the mast's head to six anchors, and two rings
  const top = new Vector3(2.2, 2.8, -1.6);
  out.solid.push(cyl(0.07, 0.07, 2.9, 5, 2.2, 1.45, -1.6, 0x8e95a3));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    out.solid.push(rod(top, new Vector3(2.2 + Math.cos(a) * 1.9, 0.1, -1.6 + Math.sin(a) * 1.9), 0.035, 0xe0b020, 4));
  }
  for (const [y, r] of [
    [0.9, 1.3],
    [1.8, 0.7],
  ])
    out.solid.push(paint(new TorusGeometry(r, 0.035, 4, 16).rotateX(Math.PI / 2).translate(2.2, y, -1.6), 0xe0b020));
  // swings: an A-frame and two seats
  for (const x of [-1.4, 1.6]) {
    out.solid.push(rod(new Vector3(x, 0, 1.4), new Vector3(x, 2.3, 2.2), 0.07, 0x2d6cb0), rod(new Vector3(x, 0, 3), new Vector3(x, 2.3, 2.2), 0.07, 0x2d6cb0));
  }
  out.solid.push(paint(new CylinderGeometry(0.06, 0.06, 3.0, 5).rotateZ(Math.PI / 2).translate(0.1, 2.3, 2.2), 0x2d6cb0));
  for (const x of [-0.6, 0.8]) {
    out.solid.push(box(0.5, 0.06, 0.25, x, 0.55, 2.2, 0x2a3039));
    for (const s of [-0.22, 0.22]) out.solid.push(box(0.02, 1.75, 0.02, x + s, 1.42, 2.2, 0x8e95a3));
  }
  // a see-saw and two spring riders
  out.solid.push(box(0.3, 0.4, 0.3, 3.2, 0.2, 2.2, 0x2a3039), paint(new BoxGeometry(0.3, 0.08, 3).rotateX(0.18).translate(3.2, 0.45, 2.2), 0xe8663a));
  for (const [x, hex] of [
    [-3.3, 0x2a9d8f],
    [0.2, 0xe84393],
  ] as const) {
    out.solid.push(cyl(0.12, 0.12, 0.5, 5, x, 0.25, -2.8, 0x8e95a3), paint(new SphereGeometry(0.35, 8, 6).scale(1.4, 0.9, 0.8).translate(x, 0.75, -2.8), hex));
  }
  return out;
}

/**
 * A restored steam locomotive and its tender on a length of track, under a timber canopy with a glass roof: a
 * black boiler with brass domes and bands, a balloon stack, a red cab and pilot, red driving wheels. Front at +z.
 */
export function steamLocomotive(): Pieces {
  const out = empty();
  const RED = 0x8c2a1e;
  const BRASS = 0xc8a24a;
  // the track bed, sleepers and rails
  out.solid.push(box(3.2, 0.3, 19, 0, 0.15, 0, 0x8a8378));
  for (let z = -9; z <= 9; z += 0.9) out.solid.push(box(2.6, 0.12, 0.35, 0, 0.36, z, 0x6b5640));
  for (const x of [-0.72, 0.72]) out.solid.push(box(0.1, 0.14, 19, x, 0.49, 0, 0x8e95a3));
  const y0 = 0.56;
  // the frame, the driving wheels and the leading truck's
  out.solid.push(box(1.7, 0.45, 9.4, 0, y0 + 0.95, 0.9, BLACK));
  for (const z of [-1.4, 0.4, 2.2]) for (const x of [-0.95, 0.95]) out.solid.push(paint(new CylinderGeometry(0.78, 0.78, 0.16, 16).rotateZ(Math.PI / 2).translate(x, y0 + 0.78, z), RED));
  for (const x of [-0.95, 0.95]) out.solid.push(box(0.08, 0.12, 3.8, x * 1.1, y0 + 0.8, 0.4, 0x8e95a3));
  for (const z of [4.0, 5.0]) for (const x of [-0.8, 0.8]) out.solid.push(paint(new CylinderGeometry(0.4, 0.4, 0.14, 12).rotateZ(Math.PI / 2).translate(x, y0 + 0.4, z), BLACK));
  // the boiler, its bands, the smokebox, the stack, the domes, the headlamp
  out.solid.push(paint(new CylinderGeometry(0.86, 0.86, 6.0, 18).rotateX(Math.PI / 2).translate(0, y0 + 2.05, 1.9), BLACK));
  for (const z of [0.0, 1.6, 3.2]) out.solid.push(paint(new CylinderGeometry(0.89, 0.89, 0.14, 18).rotateX(Math.PI / 2).translate(0, y0 + 2.05, z), BRASS));
  out.solid.push(paint(new CylinderGeometry(0.9, 0.9, 0.3, 18).rotateX(Math.PI / 2).translate(0, y0 + 2.05, 5.0), 0x2a2d31));
  out.solid.push(cyl(0.26, 0.3, 1.0, 10, 0, y0 + 3.3, 4.2, BLACK), cyl(0.62, 0.26, 0.7, 12, 0, y0 + 4.1, 4.2, BLACK));
  for (const z of [2.6, 0.9]) out.solid.push(paint(new SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, y0 + 2.75, z), BRASS));
  out.solid.push(box(0.5, 0.55, 0.5, 0, y0 + 3.25, 5.0, BLACK));
  out.warm.push(box(0.36, 0.36, 0.04, 0, y0 + 3.25, 5.27, WARM));
  // the pilot (cowcatcher), in red
  out.solid.push(paint(new BoxGeometry(1.9, 0.7, 1.0).rotateX(0.55).translate(0, y0 + 0.45, 5.75), RED));
  // the cab, its windows and roof
  out.solid.push(box(2.3, 2.1, 2.1, 0, y0 + 2.4, -2.6, RED), box(2.6, 0.14, 2.6, 0, y0 + 3.52, -2.6, BLACK));
  for (const x of [-1.16, 1.16]) out.solid.push(box(0.04, 0.7, 1.2, x, y0 + 2.9, -2.6, 0x1e2a38));
  // the tender, its coal and wheels
  out.solid.push(box(2.2, 1.6, 4.3, 0, y0 + 1.75, -6.2, RED), box(2.0, 0.35, 3.0, 0, y0 + 2.7, -5.8, 0x15171c), box(2.24, 0.12, 4.34, 0, y0 + 2.5, -6.2, BLACK));
  for (const z of [-7.4, -5.0]) for (const x of [-0.85, 0.85]) out.solid.push(paint(new CylinderGeometry(0.45, 0.45, 0.14, 12).rotateZ(Math.PI / 2).translate(x, y0 + 0.45, z), BLACK));
  // the canopy: timber posts and beams under a glass roof, its lamps
  for (const z of [-8.4, -2.8, 2.8, 8.4]) for (const x of [-2.4, 2.4]) out.solid.push(box(0.26, 5.4, 0.26, x, 2.7, z, 0xa98260));
  for (const x of [-2.4, 2.4]) out.solid.push(box(0.3, 0.4, 17.6, x, 5.4, 0, 0xa98260));
  for (const z of [-8.4, -2.8, 2.8, 8.4]) out.solid.push(box(5.1, 0.3, 0.3, 0, 5.55, z, 0xa98260));
  out.glass.push(new BoxGeometry(5.4, 0.06, 18).translate(0, 5.75, 0));
  for (const z of [-5.6, 0, 5.6]) out.warm.push(cyl(0.14, 0.24, 0.24, 6, 0, 5.2, z, WARM));
  return out;
}

/** Gastown's lamp standard: a black post with four arms and five warm globes. */
export function globeLamp(): Pieces {
  const out = empty();
  out.solid.push(cyl(0.22, 0.3, 0.6, 8, 0, 0.3, 0, BLACK), cyl(0.09, 0.12, 3.9, 8, 0, 2.2, 0, BLACK), box(1.3, 0.07, 0.07, 0, 3.75, 0, BLACK), box(0.07, 0.07, 1.3, 0, 3.75, 0, BLACK));
  for (const [x, z] of [
    [0.62, 0],
    [-0.62, 0],
    [0, 0.62],
    [0, -0.62],
  ])
    out.warm.push(paint(new IcosahedronGeometry(0.22, 0).translate(x, 3.98, z), WARM));
  out.warm.push(paint(new IcosahedronGeometry(0.24, 0).translate(0, 4.32, 0), WARM));
  return out;
}

/** A park lamp: a slim post with one lamp. */
export function parkLamp(): Pieces {
  const out = empty();
  out.solid.push(cyl(0.06, 0.09, 3.4, 6, 0, 1.7, 0, 0x3a3f46));
  out.warm.push(paint(new IcosahedronGeometry(0.24, 0).translate(0, 3.5, 0), WARM));
  return out;
}

/** A string of paper lanterns, red and amber, between two posts' tops (points in the caller's frame, y up), bulbs hung below. */
export function lanternString(out: Pieces, a: [number, number, number], b: [number, number, number], sag = 0.5): void {
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(2, Math.round(L / 1.4));
  const pt = (t: number): Vector3 => new Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t);
  for (let i = 0; i < n; i++) {
    out.solid.push(rod(pt(i / n), pt((i + 1) / n), 0.02, 0x24272c, 3));
    if (i > 0) {
      const p = pt(i / n);
      // red lanterns and amber ones in turn, and under every other a bare bulb on a cord, down over the stalls
      out.warm.push(paint(new OctahedronGeometry(0.3, 0).scale(1, 1.2, 1).translate(p.x, p.y - 0.42, p.z), i % 2 ? 0xe23b2e : 0xffa53a));
      if (i % 2 === 0) {
        const q = p.clone().setY(p.y - 1.9);
        out.solid.push(rod(p.clone().setY(p.y - 0.7), q, 0.012, 0x24272c, 3));
        out.warm.push(paint(new OctahedronGeometry(0.12, 0).translate(q.x, q.y - 0.1, q.z), 0xffd49a));
      }
    }
  }
}

/** A dragon on poles, as the dancers hold it: a red body winding along z, its gold belly, its head at +z. */
export function dragon(): Pieces {
  const out = empty();
  const pts: Vector3[] = [];
  for (let k = 0; k <= 10; k++) pts.push(new Vector3(Math.sin(k * 0.9) * 1.2, 2.6 + Math.sin(k * 0.7 + 1) * 0.5, -6 + k * 1.2));
  const curve = new CatmullRomCurve3(pts);
  out.solid.push(paint(new TubeGeometry(curve, 32, 0.42, 7, false), 0xc8281e));
  const belly = new CatmullRomCurve3(pts.map((p) => p.clone().add(new Vector3(0, -0.3, 0))));
  out.solid.push(paint(new TubeGeometry(belly, 32, 0.24, 5, false), 0xe0b020));
  // spines along its back
  for (let t = 0.05; t < 0.95; t += 0.07) {
    const p = curve.getPointAt(t);
    out.solid.push(paint(new ConeGeometry(0.14, 0.4, 4).translate(p.x, p.y + 0.5, p.z), 0xe0b020));
  }
  // the head: a snout, jaws, eyes and horns, a gold mane
  const h = curve.getPointAt(1);
  out.solid.push(box(1.0, 0.8, 1.3, h.x, h.y + 0.1, h.z + 0.6, 0xc8281e), box(0.9, 0.22, 0.9, h.x, h.y - 0.35, h.z + 0.9, 0xe0b020));
  for (const s of [-0.3, 0.3]) {
    out.solid.push(box(0.16, 0.16, 0.06, h.x + s, h.y + 0.35, h.z + 1.26, 0xffffff), paint(new ConeGeometry(0.1, 0.7, 4).rotateX(-0.6).translate(h.x + s, h.y + 0.75, h.z + 0.2), 0xe0b020));
  }
  out.solid.push(paint(new SphereGeometry(0.7, 8, 6).scale(1, 0.7, 0.6).translate(h.x, h.y + 0.1, h.z - 0.1), 0xe0b020));
  // the poles, from the ground up into the body
  for (let t = 0.08; t < 1; t += 0.12) {
    const p = curve.getPointAt(t);
    out.solid.push(cyl(0.05, 0.05, p.y, 4, p.x, p.y / 2, p.z, 0x6b5640));
  }
  return out;
}

/** A giant chess board laid in the ground, its pieces standing about the game. */
export function chessBoard(): Pieces {
  const out = empty();
  const T = 1.1;
  out.solid.push(box(8 * T + 0.6, 0.08, 8 * T + 0.6, 0, 0.04, 0, 0x6b5640));
  // the squares as flat tiles (a box's sides would never show)
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) out.solid.push(paint(new PlaneGeometry(T, T).rotateX(-Math.PI / 2).translate((i - 3.5) * T, 0.1, (j - 3.5) * T), (i + j) % 2 ? 0x2a2d33 : 0xf1ece0));
  const pieces: [number, number, number, number][] = [
    [0, 0, 0, 0.9],
    [3, 1, 0, 0.7],
    [5, 0, 0, 1.1],
    [6, 1, 0, 0.7],
    [2, 2, 0, 0.7],
    [4, 3, 0, 0.9],
    [1, 6, 1, 0.7],
    [3, 7, 1, 1.1],
    [4, 6, 1, 0.7],
    [6, 7, 1, 0.9],
    [5, 4, 1, 0.7],
    [7, 5, 1, 0.9],
  ];
  for (const [i, j, side, h] of pieces) {
    const hex = side ? 0x23252b : 0xf4f1ea;
    const x = (i - 3.5) * T;
    const z = (j - 3.5) * T;
    out.solid.push(cyl(0.36, 0.42, 0.2, 8, x, 0.23, z, hex), cyl(0.18, 0.28, h, 8, x, 0.33 + h / 2, z, hex), paint(new SphereGeometry(0.22, 6, 4).translate(x, 0.45 + h, z), hex));
  }
  return out;
}

/** An outdoor ping-pong table on its legs, net across it. */
export function pingPong(): Pieces {
  const out = empty();
  out.solid.push(box(1.5, 0.08, 2.7, 0, 0.76, 0, 0x1e6b52), box(1.52, 0.02, 0.04, 0, 0.81, 0, 0xffffff), box(1.7, 0.18, 0.03, 0, 0.88, 0, 0x2a3039));
  for (const [x, z] of [
    [-0.6, -1.1],
    [0.6, -1.1],
    [-0.6, 1.1],
    [0.6, 1.1],
  ])
    out.solid.push(box(0.08, 0.72, 0.08, x, 0.36, z, 0x3a3f46));
  return out;
}

/**
 * A stage for bands and buskers facing +z under a white canopy, its lights along the front, and `rows` curved rows of
 * stone seats terraced in front of it (none where the lawn in front is the seating).
 */
export function stageWithSeats(rows = 3): Pieces {
  const out = empty();
  out.solid.push(box(7, 0.8, 4.4, 0, 0.4, 0, 0x2b2f36), box(7, 3.6, 0.3, 0, 2.6, -2.1, 0x264653));
  for (const [x, z] of [
    [-3.3, -2],
    [3.3, -2],
    [-3.3, 2],
    [3.3, 2],
  ])
    out.solid.push(box(0.16, 4.4, 0.16, x, 2.2, z, 0x3a3f46));
  out.solid.push(paint(new CylinderGeometry(5.2, 5.2, 7.6, 16, 1, true, -0.55, 1.1).rotateZ(Math.PI / 2).translate(0, -0.4, 0), 0xf1e9da));
  for (let x = -3; x <= 3.01; x += 0.75) out.warm.push(cyl(0.1, 0.14, 0.18, 6, x, 4.4, 2.1, WARM));
  for (const x of [-2.6, 2.6]) out.solid.push(box(0.7, 1.1, 0.6, x, 1.35, 1.6, 0x15171c));
  for (let row = 0; row < rows; row++) {
    const r = 6.5 + row * 1.7;
    for (let a = -0.9; a <= 0.91; a += 0.3) {
      const x = Math.sin(a) * r;
      const z = 2 + Math.cos(a) * r;
      out.solid.push(paint(new BoxGeometry(1.75, 0.45 + row * 0.25, 1.2).rotateY(a).translate(x, (0.45 + row * 0.25) / 2, z), 0xbab4a8));
    }
  }
  return out;
}

/** A ring sculpture: a tall gold ring standing on a steel one, on a plinth. */
export function ringSculpture(): Pieces {
  const out = empty();
  out.solid.push(cyl(1.6, 1.8, 0.5, 16, 0, 0.25, 0, 0x8f9298));
  out.solid.push(paint(new TorusGeometry(2.3, 0.3, 7, 24).translate(0, 2.85, 0), 0xe0b020));
  out.solid.push(paint(new TorusGeometry(1.5, 0.22, 6, 20).rotateY(Math.PI / 2).translate(0, 2.05, 0), 0xd8dde3));
  return out;
}

/** A picnic blanket in two colours with a basket on it. */
export function picnic(hex: number): Pieces {
  const out = empty();
  out.solid.push(box(1.8, 0.03, 1.4, 0, 0.03, 0, hex));
  for (const [x, z] of [
    [-0.45, -0.35],
    [0.45, 0.35],
  ])
    out.solid.push(box(0.9, 0.035, 0.7, x, 0.035, z, 0xf6f1e7));
  out.solid.push(box(0.45, 0.3, 0.32, 0.5, 0.18, -0.4, 0xa98260));
  return out;
}
