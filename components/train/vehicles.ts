/**
 * The city's vehicles in 2100, each built nose along +x, wheels on the ground at y 0, its length centred on 0:
 * - a body lofted through cross-sections along its length (smooth, or faceted for the truck);
 * - the glass where a section says the greenhouse runs, dark, with a glass roof on some;
 * - aero wheels;
 * - a light bar across the nose and a red one across the tail, which glow.
 * Every vertex carries what the vehicles' shader needs:
 * - its colour;
 * - aGlow (1 where it lights, brighter after dark);
 * - aTint (1 where the paint takes the instance's colour).
 * So the five car kinds, the hover car and the bus sections all batch into one mesh (Life.tsx).
 */
import { BoxGeometry, type BufferGeometry, CircleGeometry, CylinderGeometry, Float32BufferAttribute, BufferGeometry as Geo, PlaneGeometry } from "three";

import { merge, paint } from "./shapes";

/** The paint the instance tints (white, so the tint is the colour), the glass, the dark of wheels and undersides. */
const PAINT = 0xf2f3f5;
const GLASS = 0x18212c;
const DARK = 0x16181b;
const RIM = 0x9aa1a9;
const HEAD = 0xeaf6ff;
const TAIL = 0xff2a1f;
const HOVER_GLOW = 0x5ef2ff;

/** Mark every vertex of a part: lit (aGlow) and tinted by the instance (aTint). */
export function mark(g: BufferGeometry, glow: number, tint: number): BufferGeometry {
  const n = g.attributes.position.count;
  g.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(n).fill(glow), 1));
  g.setAttribute("aTint", new Float32BufferAttribute(new Float32Array(n).fill(tint), 1));
  return g;
}

/**
 * One cross-section of a body: at x along its length, its widest (w) at the belt line, the bottom (yb), belt (ybelt)
 * and roof (yt) heights and the roof's width (wr); `glass` makes the greenhouse from here to the next section glass.
 */
type Sec = [x: number, w: number, yb: number, ybelt: number, yt: number, wr: number, glass: 0 | 1];

/**
 * A body lofted through its sections. Each section is a ring of ten points:
 * - right side, bottom up: the floor edge, the lower side, the belt line, the greenhouse's flank, the roof edge;
 * - then the same on the left, top down.
 * The faces between rings are coloured by where they sit:
 * - paint below the belt line;
 * - the greenhouse glass, or paint where a section says no glass;
 * - the roof glass or paint (`roofGlass`);
 * - the underside dark.
 * The ends are capped flat in paint. `flat` facets it, a truck's folded steel; otherwise it is shaded smooth.
 */
function loft(secs: Sec[], roofGlass: boolean, flat = false): BufferGeometry {
  const R = 10;
  const pos: number[] = [];
  for (const [x, w, yb, ybelt, yt, wr] of secs) {
    const wb = w * 0.86;
    const side: [number, number][] = [
      [wb / 2, yb],
      [w / 2, yb + Math.min(0.12, (ybelt - yb) * 0.4)],
      [w / 2, ybelt],
      [wr / 2 + ((w - wr) / 2) * 0.45, ybelt + (yt - ybelt) * 0.6],
      [wr / 2, yt],
    ];
    for (const [z, y] of side) pos.push(x, y, z);
    for (let j = side.length - 1; j >= 0; j--) pos.push(x, side[j][1], -side[j][0]);
  }
  // quads between consecutive rings, wound outward; each face's class by its place round the ring
  const idx: number[] = [];
  const cls: number[] = [];
  const BODY = 0;
  const GL = 1;
  const UNDER = 2;
  for (let i = 0; i < secs.length - 1; i++) {
    const glassSeg = secs[i][6] === 1;
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + ((j + 1) % R);
      const c = (i + 1) * R + ((j + 1) % R);
      const d = (i + 1) * R + j;
      idx.push(a, d, c, a, c, b);
      const k = j === 9 ? UNDER : j === 4 ? (glassSeg && roofGlass ? GL : BODY) : j === 2 || j === 3 || j === 5 || j === 6 ? (glassSeg ? GL : BODY) : BODY;
      cls.push(k, k);
    }
  }
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (!flat) g.computeVertexNormals();
  const ng = g.toNonIndexed();
  g.dispose();
  if (flat) ng.computeVertexNormals();
  colourFaces(ng, (f) => [cls[f] === GL ? GLASS : cls[f] === UNDER ? DARK : PAINT, cls[f] === BODY ? 1 : 0]);
  // the ends: a flat fan over each end ring
  const caps: BufferGeometry[] = [];
  for (const [i, out] of [
    [0, -1],
    [secs.length - 1, 1],
  ] as const) {
    const ring: number[][] = [];
    for (let j = 0; j < R; j++) ring.push(pos.slice((i * R + j) * 3, (i * R + j) * 3 + 3));
    const cx = ring.reduce((s, p) => s + p[0], 0) / R;
    const cy = ring.reduce((s, p) => s + p[1], 0) / R;
    const fan: number[] = [];
    for (let j = 0; j < R; j++) {
      const p = ring[j];
      const q = ring[(j + 1) % R];
      // the ring runs one way round seen from +x: the front cap takes it as it is, the back one reversed
      if (out > 0) fan.push(cx, cy, 0, ...q, ...p);
      else fan.push(cx, cy, 0, ...p, ...q);
    }
    const cg = new Geo();
    cg.setAttribute("position", new Float32BufferAttribute(fan, 3));
    cg.computeVertexNormals();
    caps.push(mark(paint(cg, PAINT), 0, 1));
  }
  ng.setAttribute("uv", new Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return merge([ng, ...caps]);
}

/** Colour a non-indexed geometry face by face: the colour and whether the instance tints it. */
function colourFaces(g: BufferGeometry, fn: (face: number) => [number, number]): void {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const tint = new Float32Array(n);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  for (let f = 0; f < n / 3; f++) {
    const [hex, t] = fn(f);
    const rgb = [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
    for (let v = 0; v < 3; v++) {
      col.set(rgb, (f * 3 + v) * 3);
      tint[f * 3 + v] = t;
    }
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(n), 1));
  g.setAttribute("aTint", new Float32BufferAttribute(tint, 1));
}

/** An axle's pair of aero wheels as one drum across the car: dark tyres, pale discs on the faces. */
function axle(x: number, r: number, width: number): BufferGeometry {
  const g = paint(new CylinderGeometry(r, r, width, 8).rotateX(Math.PI / 2).translate(x, r, 0), DARK);
  const nz = g.attributes.normal;
  const n = g.attributes.position.count;
  const col = g.attributes.color.array as Float32Array;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const rim = [lin(((RIM >> 16) & 255) / 255), lin(((RIM >> 8) & 255) / 255), lin((RIM & 255) / 255)];
  for (let v = 0; v < n; v++) if (Math.abs(nz.getZ(v)) > 0.9) col.set(rim, v * 3);
  return mark(g, 0, 0);
}

/** A light bar on an end of the body (+1 the nose, -1 the tail), facing out. */
function lightBar(end: 1 | -1, x: number, y: number, w: number, h: number, hex: number): BufferGeometry {
  return mark(paint(new PlaneGeometry(w, h).rotateY((end * Math.PI) / 2).translate(x + end * 0.006, y, 0), hex), 1, 0);
}

/** A strip along both flanks (the van's light band), facing out. */
function sideBand(x0: number, x1: number, y: number, h: number, z: number, hex: number): BufferGeometry[] {
  return [1, -1].map((s) => mark(paint(new PlaneGeometry(x1 - x0, h).rotateY(s > 0 ? 0 : Math.PI).translate((x0 + x1) / 2, y, s * (z + 0.006)), hex), 1, 0));
}

/** A car of `secs`, its axles (x, wheel radius), its lamps at the ends' sections. */
function car(secs: Sec[], axles: [number, number][], roofGlass: boolean, flat = false, extra: BufferGeometry[] = []): BufferGeometry {
  const nose = secs[secs.length - 1];
  const tail = secs[0];
  const width = Math.max(...secs.map((s) => s[1])) - 0.04;
  return merge([
    loft(secs, roofGlass, flat),
    ...axles.map(([x, r]) => axle(x, r, width)),
    lightBar(1, nose[0], nose[2] + (nose[3] - nose[2]) * 0.7, nose[1] * 0.82, 0.05, HEAD),
    lightBar(-1, tail[0], tail[2] + (tail[3] - tail[2]) * 0.75, tail[1] * 0.86, 0.06, TAIL),
    ...extra,
  ]);
}

/**
 * The five kinds, in traffic.ts CAR_KINDS order (sedan, pod, crossover, van, truck), each its length (x) long. Tesla's
 * lines, no grilles:
 * - the sedan a low fastback under a glass roof;
 * - the pod a two-seat bubble, nearly all glass;
 * - the crossover taller and longer, a painted roof;
 * - the van a windowless autonomous delivery shuttle, a light band round its flanks;
 * - the truck folded stainless steel, a single ridge from nose to tailgate, a light bar the width of its nose.
 */
export function carKinds(): BufferGeometry[] {
  // prettier-ignore
  const sedan: Sec[] = [
    [-1.25, 1.05, 0.26, 0.62, 0.66, 0.9, 0],
    [-1.12, 1.16, 0.2, 0.66, 0.74, 0.95, 1],
    [-0.6, 1.2, 0.18, 0.66, 0.98, 0.82, 1],
    [-0.1, 1.2, 0.18, 0.64, 1.04, 0.84, 1],
    [0.35, 1.2, 0.18, 0.62, 0.98, 0.82, 1],
    [0.7, 1.18, 0.18, 0.58, 0.64, 0.95, 0],
    [1.1, 1.12, 0.2, 0.52, 0.55, 0.9, 0],
    [1.25, 0.95, 0.26, 0.42, 0.45, 0.75, 0],
  ];
  // prettier-ignore
  const pod: Sec[] = [
    [-0.9, 0.9, 0.24, 0.5, 0.56, 0.7, 0],
    [-0.78, 1.04, 0.2, 0.56, 0.9, 0.8, 1],
    [-0.4, 1.1, 0.18, 0.58, 1.14, 0.78, 1],
    [0.15, 1.1, 0.18, 0.58, 1.12, 0.78, 1],
    [0.55, 1.06, 0.18, 0.54, 0.86, 0.8, 1],
    [0.8, 0.98, 0.2, 0.48, 0.54, 0.82, 0],
    [0.9, 0.84, 0.26, 0.42, 0.45, 0.7, 0],
  ];
  // prettier-ignore
  const crossover: Sec[] = [
    [-1.35, 1.15, 0.28, 0.72, 0.78, 0.95, 0],
    [-1.25, 1.24, 0.24, 0.76, 1.12, 0.98, 1],
    [-0.7, 1.26, 0.22, 0.76, 1.3, 0.96, 1],
    [0.1, 1.26, 0.22, 0.74, 1.3, 0.96, 1],
    [0.5, 1.26, 0.22, 0.72, 1.2, 0.94, 1],
    [0.85, 1.24, 0.22, 0.7, 0.76, 1.0, 0],
    [1.2, 1.16, 0.24, 0.62, 0.66, 0.95, 0],
    [1.35, 1.0, 0.3, 0.52, 0.55, 0.8, 0],
  ];
  // prettier-ignore
  const van: Sec[] = [
    [-1.5, 1.28, 0.26, 1.0, 1.42, 1.1, 0],
    [-1.4, 1.36, 0.22, 1.08, 1.6, 1.22, 1],
    [1.25, 1.36, 0.22, 1.08, 1.6, 1.22, 0],
    [1.5, 1.26, 0.28, 0.98, 1.4, 1.08, 0],
  ];
  // the truck's ridge: straight from the nose's top (0.66) up to the apex (1.3 at x 0.1) and down to the tailgate (0.86)
  // prettier-ignore
  const truck: Sec[] = [
    [-1.45, 1.3, 0.3, 0.8, 0.86, 1.22, 0],
    [-0.55, 1.32, 0.26, 0.82, 1.1, 1.14, 1],
    [0.1, 1.32, 0.26, 0.84, 1.3, 1.02, 1],
    [0.95, 1.32, 0.26, 0.76, 0.9, 1.2, 0],
    [1.45, 1.28, 0.32, 0.62, 0.66, 1.2, 0],
  ];
  return [
    car(sedan, [[-0.82, 0.26], [0.82, 0.26]], true),
    car(pod, [[-0.55, 0.2], [0.55, 0.2]], true),
    car(crossover, [[-0.9, 0.3], [0.9, 0.3]], false),
    car(van, [[-1.0, 0.28], [1.0, 0.28]], false, false, sideBand(-1.35, 1.35, 1.0, 0.07, 0.68, 0x7ef0ff)),
    car(truck, [[-0.98, 0.32], [0.98, 0.32]], false, true, [lightBar(1, 1.45, 0.64, 1.2, 0.04, HEAD)]),
  ];
}

/**
 * A hover car, a flying car for the hyperwave lanes, built about its centre (it floats):
 * - a teardrop body under a glass canopy;
 * - a ducted fan at each corner, its lower rim and the disc under it glowing;
 * - struts across to them, front and back.
 */
export function hoverCar(): BufferGeometry {
  // prettier-ignore
  const body: Sec[] = [
    [-1.3, 0.5, 0.2, 0.36, 0.4, 0.4, 0],
    [-0.9, 0.95, 0.08, 0.42, 0.56, 0.7, 1],
    [-0.3, 1.2, 0.0, 0.46, 0.92, 0.7, 1],
    [0.3, 1.2, 0.0, 0.46, 0.9, 0.72, 1],
    [0.8, 1.0, 0.05, 0.42, 0.56, 0.8, 0],
    [1.3, 0.5, 0.16, 0.32, 0.34, 0.4, 0],
  ];
  const parts: BufferGeometry[] = [loft(body, true), lightBar(1, 1.3, 0.27, 0.4, 0.05, HEAD), lightBar(-1, -1.3, 0.3, 0.42, 0.06, TAIL)];
  for (const x of [-0.85, 0.85]) {
    parts.push(mark(paint(new BoxGeometry(0.18, 0.06, 1.7).translate(x, 0.26, 0), PAINT), 0, 1));
    for (const z of [-0.95, 0.95]) {
      // the duct: a short drum, its lower half's flank lit
      const duct = paint(new CylinderGeometry(0.36, 0.36, 0.16, 8, 2).translate(x, 0.24, z), DARK);
      const n = duct.attributes.position.count;
      const glow = new Float32Array(n);
      const pos = duct.attributes.position;
      const nrm = duct.attributes.normal;
      const col = duct.attributes.color.array as Float32Array;
      for (let f = 0; f < n / 3; f++) {
        const cy = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
        const lit = cy < 0.24 && Math.abs(nrm.getY(f * 3)) < 0.5;
        if (!lit) continue;
        for (let v = 0; v < 3; v++) {
          glow[f * 3 + v] = 1;
          col.set([0.11, 0.89, 1.0], (f * 3 + v) * 3);
        }
      }
      mark(duct, 0, 0);
      duct.setAttribute("aGlow", new Float32BufferAttribute(glow, 1));
      parts.push(duct);
      parts.push(mark(paint(new CircleGeometry(0.3, 8).rotateX(Math.PI / 2).translate(x, 0.15, z), HOVER_GLOW), 1, 0));
    }
  }
  return merge(parts);
}

/**
 * A Coast Salish–style journey canoe on False Creek, bow along +z as the boats are built: a long dark hull, bow and
 * stern sweeping up, and (with its crew) ten paddlers in red and black, their paddles in the water, alternating sides.
 */
export function canoe(crew = true): BufferGeometry {
  // prettier-ignore
  const hull: Sec[] = [
    [-3.4, 0.08, 0.6, 0.92, 0.96, 0.06, 0],
    [-3.0, 0.5, 0.2, 0.62, 0.66, 0.42, 0],
    [-2.0, 0.92, 0.0, 0.45, 0.48, 0.8, 0],
    [0, 1.0, -0.02, 0.42, 0.45, 0.88, 0],
    [2.0, 0.9, 0.0, 0.45, 0.48, 0.8, 0],
    [3.1, 0.45, 0.22, 0.72, 0.76, 0.36, 0],
    [3.6, 0.08, 0.62, 1.12, 1.16, 0.06, 0],
  ];
  const skins = [0xd39b6f, 0xb07a4f, 0x8a5a36, 0x5e3b22, 0xeac09a];
  const parts: BufferGeometry[] = [loft(hull, false)];
  for (let k = 0; k < (crew ? 10 : 0); k++) {
    const x = -2.45 + k * 0.54;
    const s = k % 2 ? 1 : -1;
    parts.push(
      mark(paint(new BoxGeometry(0.24, 0.42, 0.26).translate(x, 0.66, s * 0.14), k % 3 ? 0xb3261e : 0x1d1b1a), 0, 0),
      mark(paint(new BoxGeometry(0.17, 0.18, 0.17).translate(x, 0.97, s * 0.14), skins[k % skins.length]), 0, 0),
      mark(paint(new BoxGeometry(0.04, 0.95, 0.09).translate(0, -0.47, 0).rotateX(-s * 0.55).translate(x + 0.08, 0.86, s * 0.34), 0x7a4a2a), 0, 0),
    );
  }
  return merge(parts).rotateY(-Math.PI / 2);
}

/** Give a geometry built elsewhere (the bus sections) the vehicles' attributes: its own colours, no instance tint. */
export function asVehicle(g: BufferGeometry): BufferGeometry {
  const n = g.attributes.position.count;
  if (!g.attributes.aGlow) g.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(n), 1));
  g.setAttribute("aTint", new Float32BufferAttribute(new Float32Array(n), 1));
  if (!g.attributes.uv) g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
