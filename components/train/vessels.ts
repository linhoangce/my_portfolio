/**
 * The boats and drones, built so they read at a glance from the guideway: a cruise ship with stacked balcony decks,
 * the SeaBus catamaran, sailboats, motor yachts and quadcopter drones. Each is a vertex-coloured geometry (the cruise
 * ship adds a textured cabin mesh), length along +z with the bow forward, waterline at y = 0. Client only.
 */
import { BoxGeometry, type BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, BufferGeometry as Geo, SphereGeometry } from "three";

import { canvasTexture, cap, merge, type P2, paint, walls } from "./shapes";

const WHITE = 0xf4f5f7;
const NAVY = 0x21345c;
const GLASS = 0x1e2a38;
const DECK = 0xd9dcdf;

/** The plan outline of a hull: starboard from stern to bow, then port back, from a half-beam function. */
function outline(hw: (z: number) => number, z0: number, z1: number, step: number): P2[] {
  const zs: number[] = [];
  for (let z = z0; z < z1; z += step) zs.push(z);
  zs.push(z1);
  const star = zs.map((z) => [Math.max(0.02, hw(z)), z] as P2);
  const port = zs
    .slice()
    .reverse()
    .map((z) => [-Math.max(0.02, hw(z)), z] as P2);
  return [...star, ...port];
}

/** Walls round an outline in horizontal colour bands [y0, y1, colour]. */
function banded(ring: P2[], bands: [number, number, number][], smooth = true): BufferGeometry[] {
  return bands.map(([y0, y1, c]) => paint(walls(ring, y0, y1, { smooth }), c));
}

/** A box painted one colour, placed by its centre. */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) => {
  const g = new BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  return paint(g.translate(x, y, z), c);
};

/** A flat triangle visible from both sides (sails). */
function sheet(a: [number, number, number], b: [number, number, number], c: [number, number, number], col: number): BufferGeometry {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  g.computeVertexNormals();
  return paint(g, col);
}

/* ------------------------------------------------------------------ cruise ship */

/** Balcony rows for the cruise ship's cabin decks: one deck per texture row, two cabins per tile; `glow` lights them. */
export function cabinTexture() {
  const glow = canvasTexture(128, 64, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#ffd59a";
    g.fillRect(7, 18, 55, 26);
    g.fillStyle = "#e9c48c";
    g.fillRect(71, 18, 55, 26);
  });
  const map = canvasTexture(128, 64, (g) => {
    g.fillStyle = "#f4f5f7";
    g.fillRect(0, 0, 128, 64);
    const grd = g.createLinearGradient(0, 16, 0, 46);
    grd.addColorStop(0, "#3b4c63");
    grd.addColorStop(1, "#1d2938");
    g.fillStyle = grd;
    g.fillRect(0, 16, 128, 30);
    g.fillStyle = "#f4f5f7";
    for (const x of [0, 64]) g.fillRect(x, 12, 5, 40);
    g.fillStyle = "#c9d1da";
    g.fillRect(0, 38, 128, 3);
    g.fillStyle = "#e3e7ec";
    g.fillRect(0, 50, 128, 2);
  });
  return { map, glow };
}

export type ShipGeometry = { solid: BufferGeometry; cabins: BufferGeometry };

/** A cruise ship about 64 units long: white hull on a navy boot-top, seven stepped balcony decks, a funnel and domes. */
export function cruiseShip(lowEnd: boolean): ShipGeometry {
  const L = 32;
  const B = 4.4;
  const hw = (z: number) => {
    if (z > 10) {
      const t = (z - 10) / (L - 10);
      return B * Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 0.55);
    }
    if (z < -26) {
      const t = (-26 - z) / (L - 26);
      return B * (1 - 0.16 * t * t);
    }
    return B;
  };
  const step = lowEnd ? 2.4 : 1.4;
  const hull = outline(hw, -L, L, step);
  const solid: BufferGeometry[] = [...banded(hull, [
    [-0.8, 0.5, NAVY],
    [0.5, 0.75, 0x2f6fb5],
    [0.75, 4.6, WHITE],
  ])];
  solid.push(paint(cap(hull, 4.6), DECK));
  // the decks: each stepped back from the bow, cabins (textured) on the sides
  const cabins: BufferGeometry[] = [];
  const DH = 1.25;
  const nDecks = 7;
  let top = 4.6;
  for (let k = 0; k < nDecks; k++) {
    const z0 = -L + 2 + k * 0.4;
    const z1 = 22 - k * 2.3;
    const inset = 0.3 + k * 0.05;
    const ring = outline((z) => Math.min(hw(z), B) - inset, z0, z1, step);
    const y0 = 4.6 + k * DH;
    cabins.push(walls(ring, y0, y0 + DH, { uPer: 4.4, vPer: DH, vFrom: y0 }));
    solid.push(paint(cap(ring, y0 + DH), k === nDecks - 1 ? DECK : WHITE));
    top = y0 + DH;
  }
  // the bridge: a dark band of windows across the front of the fifth deck, with wings
  solid.push(box(2 * B + 0.6, 0.7, 1.2, 0, 4.6 + 4.5 * DH, 22 - 4 * 2.3 - 0.2, GLASS));
  // lifeboats in orange along both sides under the second deck
  for (let z = -20; z <= 12; z += 3.4) for (const s of [-1, 1]) solid.push(box(0.8, 0.8, 2.6, s * (B - 0.05), 6.1, z, 0xf08a24));
  // funnel, radar mast with two domes, a blue pool on the top deck
  const fun = new CylinderGeometry(1, 1.15, 4.4, 12).scale(1.4, 1, 2.4).translate(0, top + 2.2, -20);
  solid.push(paint(fun, WHITE), paint(new CylinderGeometry(1.02, 1.02, 0.7, 12).scale(1.4, 1, 2.4).translate(0, top + 4.2, -20), 0x1b1d22));
  solid.push(paint(new CylinderGeometry(0.12, 0.16, 4, 6).translate(0, top + 2, 6), 0xdfe3e8));
  for (const x of [-0.9, 0.9]) solid.push(paint(new SphereGeometry(0.65, 10, 8).translate(x, top + 3.6, 6), WHITE));
  solid.push(box(3.2, 0.12, 6, 0, top + 0.07, -9, 0x3fa9d6), box(5.6, 0.6, 7.2, 0, top + 0.3, -9.2, 0xe9edf1));
  return { solid: merge(solid), cabins: merge(cabins) };
}

/* ------------------------------------------------------------------ harbour craft */

/** The SeaBus: a double-ended catamaran, white with a wraparound window band and a blue stripe. 18 units long. */
export function seabus(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const hullR = (z: number) => 0.75 * Math.sqrt(Math.max(0.05, 1 - (z / 9) ** 6));
  for (const x of [-2, 2]) {
    const ring = outline(hullR, -9, 9, 1.5).map(([a, z]) => [a + x, z] as P2);
    parts.push(...banded(ring, [
      [-0.5, 0.2, NAVY],
      [0.2, 0.9, WHITE],
    ]));
  }
  const body = outline((z) => 2.9 * Math.sqrt(Math.max(0, 1 - (z / 9.3) ** 4)), -9.3, 9.3, 0.9);
  parts.push(...banded(body, [
    [0.9, 1.25, 0x1f5fa8],
    [1.25, 1.6, WHITE],
    [1.6, 2.55, GLASS],
    [2.55, 3.0, WHITE],
  ]));
  parts.push(paint(cap(body, 3.0), WHITE), paint(cap(body, 0.9, false), 0x9aa3ad));
  // a wheelhouse at each end
  for (const z of [-5.5, 5.5]) parts.push(box(2.4, 0.8, 1.6, 0, 3.4, z, GLASS), box(2.6, 0.12, 1.8, 0, 3.86, z, WHITE));
  return merge(parts);
}

/** A sloop under sail: white hull with a navy stripe, teak deck, a small cabin, mast, mainsail and jib. 7 units long. */
export function sailboat(): BufferGeometry {
  const hw = (z: number) => (z > 0 ? 1.25 * Math.pow(Math.max(0, 1 - (z / 3.5) ** 2), 0.7) : 1.25 * (1 - 0.25 * (z / 3.5) ** 2));
  const hull = outline(hw, -3.4, 3.5, 0.5);
  const parts = [
    ...banded(hull, [
      [-0.3, 0.45, WHITE],
      [0.45, 0.6, NAVY],
      [0.6, 0.75, WHITE],
    ]),
    paint(cap(hull, 0.75), 0xb98a5a),
    box(1.3, 0.5, 2.2, 0, 1.0, -0.6, WHITE),
    box(1.32, 0.16, 1.6, 0, 1.08, -0.5, GLASS),
    paint(new CylinderGeometry(0.06, 0.08, 8, 6).translate(0, 4.75, 0.6), 0xd4d8dd),
    paint(new CylinderGeometry(0.05, 0.05, 3.2, 5).rotateX(Math.PI / 2).translate(0, 1.6, -1.0), 0xd4d8dd),
    sheet([0, 1.65, 0.55], [0, 8.4, 0.55], [0, 1.65, -2.55], 0xf6f1e4),
    sheet([0, 7.6, 0.68], [0, 0.85, 3.3], [0, 1.4, 0.75], 0xfbf8f0),
  ];
  return merge(parts);
}

/** A motor yacht: navy boot-top, white hull with a dark window line, a glazed saloon and a flybridge. 11 units long. */
export function yacht(): BufferGeometry {
  const hw = (z: number) => (z > 0.5 ? 1.9 * Math.pow(Math.max(0, 1 - ((z - 0.5) / 5) ** 2), 0.65) : 1.9 * (1 - 0.08 * ((z - 0.5) / 5) ** 2));
  const hull = outline(hw, -5, 5.5, 0.6);
  const saloon = outline((z) => hw(z) - 0.35, -4.2, 2.2, 0.6);
  const fly = outline((z) => hw(z) - 0.6, -3.4, 0.2, 0.6);
  const parts = [
    ...banded(hull, [
      [-0.3, 0.3, NAVY],
      [0.3, 0.8, WHITE],
      [0.8, 1.0, GLASS],
      [1.0, 1.3, WHITE],
    ]),
    paint(cap(hull, 1.3), 0xe6e2da),
    ...banded(saloon, [
      [1.3, 1.5, WHITE],
      [1.5, 2.1, GLASS],
      [2.1, 2.35, WHITE],
    ], false),
    paint(cap(saloon, 2.35), WHITE),
    ...banded(fly, [
      [2.35, 2.75, GLASS],
      [2.75, 2.9, WHITE],
    ], false),
    paint(cap(fly, 2.9), WHITE),
    paint(new ConeGeometry(0.12, 0.9, 6).translate(0, 3.35, -1.6), 0xd4d8dd),
  ];
  return merge(parts);
}

/* ------------------------------------------------------------------ drones */

/** A quadcopter about two units across: a dark body, four arms with motors and pale prop discs. */
export function quadcopter(): BufferGeometry {
  const parts: BufferGeometry[] = [
    box(0.62, 0.26, 0.86, 0, 0, 0, 0x2a2f37),
    box(0.5, 0.1, 0.64, 0, 0.17, 0, 0x4a5260),
    box(0.3, 0.14, 0.12, 0, -0.06, 0.45, 0x0f1216),
  ];
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const ax = sx * 0.68;
    const az = sz * 0.68;
    parts.push(box(0.09, 0.07, 0.98, ax / 2, 0.02, az / 2, 0x353b45, Math.atan2(sx, sz)));
    parts.push(paint(new CylinderGeometry(0.1, 0.1, 0.16, 6).translate(ax, 0.08, az), 0x1b1f25));
    parts.push(paint(new CylinderGeometry(0.44, 0.44, 0.02, 10).translate(ax, 0.18, az), 0xaab3be));
  }
  return merge(parts);
}

/** The drones' running lights: a white one forward, a red one aft (emissive, lit after dark). */
export function quadcopterLights(): BufferGeometry {
  return merge([box(0.14, 0.08, 0.06, 0, -0.04, 0.47, 0xffffff), box(0.14, 0.08, 0.06, 0, -0.04, -0.47, 0xff3b30)]);
}

/* ------------------------------------------------------------------ lights after dark */

const WARM = 0xffcf8f;
const PORT = 0xff3b30;
const STARBOARD = 0x2fd36b;
const MAST = 0xfff8ec;

/** Lit window panes along an outline: one pane per segment with a mullion gap, set just proud of the glass. */
function panes(ring: P2[], y0: number, y1: number, col: number, gap = 0.14): BufferGeometry {
  const cx = ring.reduce((t, p) => t + p[0], 0) / ring.length;
  const cz = ring.reduce((t, p) => t + p[1], 0) / ring.length;
  const pos: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) continue;
    let nx = (bz - az) / len;
    let nz = -(bx - ax) / len;
    if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const g = Math.min(gap / len, 0.3);
    const p0 = [ax + (bx - ax) * g + nx * 0.03, az + (bz - az) * g + nz * 0.03];
    const p1 = [bx - (bx - ax) * g + nx * 0.03, bz - (bz - az) * g + nz * 0.03];
    pos.push(p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1, p1[1], p0[0], y0, p0[1], p1[0], y1, p1[1], p0[0], y1, p0[1]);
  }
  const geo = new Geo();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return paint(geo, col);
}

/** Navigation lights: red to port (+x, bow along +z), green to starboard, a white masthead light and a stern light. */
function navLights(halfBeam: number, y: number, bowZ: number, sternZ: number, mastY: number, mastZ: number): BufferGeometry[] {
  return [
    box(0.16, 0.16, 0.22, halfBeam, y, bowZ, PORT),
    box(0.16, 0.16, 0.22, -halfBeam, y, bowZ, STARBOARD),
    box(0.2, 0.2, 0.2, 0, mastY, mastZ, MAST),
    box(0.2, 0.16, 0.12, 0, y, sternZ, MAST),
  ];
}

/** What each harbour craft shows after dark (0 SeaBus, 1 sailboat, 2 yacht): lit windows and its running lights. */
export function boatLights(kind: number): BufferGeometry {
  if (kind === 0) {
    const body = outline((z) => 2.9 * Math.sqrt(Math.max(0, 1 - (z / 9.3) ** 4)), -9.3, 9.3, 0.9);
    const parts = [panes(body, 1.7, 2.45, WARM)];
    for (const z of [-5.5, 5.5]) parts.push(box(2.46, 0.6, 1.66, 0, 3.4, z, WARM));
    // double-ended: running lights at both ends, a masthead light on each wheelhouse
    parts.push(...navLights(2.5, 3.0, 8.4, -8.4, 4.0, 5.5), box(0.2, 0.2, 0.2, 0, 4.0, -5.5, MAST));
    return merge(parts);
  }
  if (kind === 1) {
    return merge([box(1.36, 0.12, 1.4, 0, 1.08, -0.5, WARM), ...navLights(0.75, 0.85, 2.8, -3.35, 8.8, 0.6)]);
  }
  const hw = (z: number) => (z > 0.5 ? 1.9 * Math.pow(Math.max(0, 1 - ((z - 0.5) / 5) ** 2), 0.65) : 1.9 * (1 - 0.08 * ((z - 0.5) / 5) ** 2));
  return merge([
    panes(outline(hw, -5, 5.5, 0.6), 0.84, 0.96, WARM),
    panes(outline((z) => hw(z) - 0.35, -4.2, 2.2, 0.6), 1.55, 2.05, WARM),
    ...navLights(1.75, 1.4, 3.6, -5.05, 3.85, -1.6),
  ]);
}

/** The cars' head and tail lights (bow along +x as the car body is built): two warm white in front, two red behind. */
export function carLights(): BufferGeometry {
  return merge([
    ...[-0.36, 0.36].map((z) => box(0.06, 0.12, 0.24, 1.24, 0.46, z, 0xfff3d6)),
    ...[-0.4, 0.4].map((z) => box(0.06, 0.1, 0.26, -1.24, 0.5, z, 0xff2a1f)),
  ]);
}
