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

/**
 * A floatplane, a Beaver of the harbour's fleet: a white fuselage and high wing with a band of `hex` down the side and
 * on the fin, a dark cockpit, a cowled radial and its propeller, on two floats with their struts. About 6 units long
 * and as wide, its floats on the water.
 */
export function floatplane(hex: number): BufferGeometry {
  const parts: BufferGeometry[] = [
    // fuselage, tail boom, cockpit glass, the band along it
    box(0.85, 0.9, 2.9, 0, 1.55, 0.6, WHITE),
    paint(new BoxGeometry(0.5, 0.5, 2.6).translate(0, 1.65, -1.95), WHITE),
    box(0.88, 0.38, 0.8, 0, 1.92, 1.55, GLASS),
    box(0.87, 0.16, 4.8, 0, 1.4, -0.4, hex),
    // the cowl and the propeller
    paint(new CylinderGeometry(0.42, 0.45, 0.6, 10).rotateX(Math.PI / 2).translate(0, 1.55, 2.3), 0x2a2f37),
    box(1.9, 0.12, 0.06, 0, 1.55, 2.66, 0x15171c),
    // the high wing, the tail
    box(5.6, 0.1, 1.0, 0, 2.08, 1.0, WHITE),
    box(0.06, 0.8, 0.7, 0, 2.15, -3.1, hex),
    box(1.9, 0.06, 0.55, 0, 1.75, -3.05, WHITE),
    // floats and struts
    box(0.32, 0.3, 4.2, -0.85, 0.15, 0.4, DECK),
    box(0.32, 0.3, 4.2, 0.85, 0.15, 0.4, DECK),
  ];
  for (const x of [-0.65, 0.65]) for (const z of [1.5, -0.4]) parts.push(box(0.06, 1.0, 0.06, x, 0.75, z, 0x8a9099));
  return merge(parts);
}

/* ------------------------------------------------------------------ freighters */

export type FreighterKind = "bulk" | "container" | "tanker" | "carCarrier";

/**
 * A freighter's colours: the hull above the boot-top and the boot-top's antifouling red, the deck, the house, the
 * funnel and its company band, the cranes and pipes, and the cargo's (hatch covers, or the boxes' palette).
 */
export type Livery = { hull: number; boot: number; deck: number; house: number; funnel: number; band: number; gear: number; cargo: number[] };

/**
 * Each kind's proportions: half length and half beam, the deck's height over the water in ballast, the house's tiers
 * (a deck each) and how far forward it ends. About twice life, as the cruise ship at Canada Place is.
 */
const SHIP = {
  bulk: { L: 22, B: 3.6, H: 3.0, tiers: 5, house: 5.5 },
  container: { L: 25, B: 3.8, H: 2.8, tiers: 7, house: 4.5 },
  tanker: { L: 21, B: 3.9, H: 2.6, tiers: 5, house: 5 },
  carCarrier: { L: 20, B: 3.4, H: 2.2, tiers: 0, house: 0 },
} as const;
/** How deep a fully laden ship sits below its ballast waterline. */
export const LADEN = 1.2;
/** Where the antifouling red ends on the hull: the summer load line and a little, as built (in ballast it shows). */
const BOOT_TOP = 1.5;

/** A freighter's hull in plan: a parallel middle body, a raked bow from 7 back of the stem, a transom stern a little fined. */
const freighterHull = (L: number, B: number) => (z: number) => {
  const bow = L - 7;
  if (z > bow) return B * Math.sqrt(Math.max(0, 1 - ((z - bow) / (L - bow)) ** 2.2));
  if (z < -L + 5) return B * (1 - 0.14 * ((-L + 5 - z) / 5) ** 2);
  return B;
};

/** A rectangle's ring, half width hw, from z0 to z1. */
const rect = (hw: number, z0: number, z1: number): P2[] => [
  [hw, z0],
  [hw, z1],
  [-hw, z1],
  [-hw, z0],
];

/** A crane on its pedestal at z, its jib stowed forward on a slight rise (the bulkers' deck cranes, the tankers' hose crane). */
function deckCrane(z: number, deckY: number, jib: number, hex: number): BufferGeometry[] {
  const rise = 0.22;
  const g = new BoxGeometry(0.3, 0.3, jib)
    .translate(0, 0, jib / 2)
    .rotateX(-rise)
    .translate(0, deckY + 2.6, z + 0.3);
  return [box(0.9, 2.2, 0.9, 0, deckY + 1.1, z, hex), box(1.1, 0.8, 1.3, 0, deckY + 2.6, z, hex), paint(g, hex)];
}

/**
 * A freighter at anchor or under way in English Bay, built as the rest of the harbour's craft are (length along +z,
 * bow forward, the waterline at y 0), `draft` (0 in ballast, LADEN loaded) deep:
 * - bulk carrier: hatch covers down the deck, deck cranes if `geared`;
 * - container ship: stacks of boxes in bays, four across, in the livery's palette;
 * - tanker: a pipe rack down the centreline, the manifold amidships and its hose crane;
 * - car carrier: a slab-sided box over the whole hull, its bridge at the top of the front.
 * Every one but the car carrier has its house aft (tiers of cabins with a band of windows each, the bridge with its
 * wings on top, a radar mast), a funnel in the company's colours and a foremast on the forecastle. The boot-top's red
 * shows high in ballast and as a line laden. `seed` varies the cargo.
 */
export function freighter(kind: FreighterKind, c: Livery, draft: number, geared: boolean, seed: number, lowEnd: boolean): BufferGeometry {
  const { L, B, H, tiers, house } = SHIP[kind];
  const hw = freighterHull(L, B);
  const step = lowEnd ? 3 : 2;
  const hull = outline(hw, -L, L, step);
  const parts: BufferGeometry[] = [
    ...banded(hull, [
      [-1.5, BOOT_TOP, c.boot],
      [BOOT_TOP, H, c.hull],
    ]),
    paint(cap(hull, H), c.deck),
  ];
  let rnd = seed * 9301 + 49297;
  const next = () => {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  };
  const top = (y: number, z0: number, z1: number, hb: number, hex: number) => {
    const ring = rect(hb, z0, z1);
    return paint(cap(ring, y), hex);
  };
  if (kind === "carCarrier") {
    // the box: from the transom to a rounded front over the bow, a company stripe along it, the bridge's windows high
    // across the front and a funnel at the back of the roof
    const front = L - 5;
    const body = outline((z) => (z > front ? B * 0.98 * Math.sqrt(Math.max(0, 1 - ((z - front) / 4.6) ** 2)) : Math.min(hw(z), B * 0.98)), -L + 0.4, front + 4.5, step);
    const roof = H + 9;
    parts.push(
      ...banded(body, [
        [H - 0.01, roof - 3.4, c.hull],
        [roof - 3.4, roof - 2.6, c.band],
        [roof - 2.6, roof, c.hull],
      ]),
      paint(cap(body, roof), c.deck),
      paint(cap(body, H, false), c.hull),
      box(2 * B * 0.86, 0.8, 0.5, 0, roof - 0.7, front + 2.9, GLASS),
      box(1.4, 1.8, 2.2, 0, roof + 0.9, -L + 3.5, c.funnel),
      box(1.42, 0.5, 2.22, 0, roof + 1.2, -L + 3.5, c.band),
      box(1.42, 0.35, 2.22, 0, roof + 1.95, -L + 3.5, 0x1b1d22),
      paint(new CylinderGeometry(0.1, 0.12, 2.4, 5).translate(0, roof + 1.2, front - 1), 0xdfe3e8),
    );
    return merge(parts).translate(0, -draft, 0);
  }
  // the forecastle, a deck higher, and the foremast on it
  const fc = outline((z) => hw(z) - 0.05, L - 4.5, L - 0.15, step);
  parts.push(...banded(fc, [[H - 0.01, H + 1, c.hull]]), paint(cap(fc, H + 1), c.deck));
  parts.push(paint(new CylinderGeometry(0.09, 0.12, 3.2, 5).translate(0, H + 2.6, L - 2.6), 0xdfe3e8));
  // the house aft: a tier a deck, each with its band of windows, then the bridge across the full beam with its wings
  const z0 = -L + 1.2;
  const z1 = z0 + house;
  const hb = B - 0.35;
  const T = 1.0;
  const bands: [number, number, number][] = [];
  for (let k = 0; k < tiers; k++) {
    const y = H + k * T;
    bands.push([y, y + 0.64, c.house], [y + 0.64, y + 0.9, GLASS], [y + 0.9, y + T, c.house]);
  }
  parts.push(...banded(rect(hb, z0, z1), bands, false));
  const roofY = H + tiers * T;
  parts.push(top(roofY, z0, z1, hb, c.house));
  const bz0 = z1 - 2.4;
  parts.push(...banded(rect(B + 0.5, bz0, z1 + 0.2), [
    [roofY, roofY + 0.62, c.house],
    [roofY + 0.62, roofY + 0.95, GLASS],
    [roofY + 0.95, roofY + 1.1, c.house],
  ], false));
  parts.push(top(roofY + 1.1, bz0, z1 + 0.2, B + 0.5, c.house));
  // the radar mast on the bridge's roof, its crossbar
  parts.push(box(0.18, 2.2, 0.18, 0, roofY + 2.2, z1 - 1.2, 0xdfe3e8), box(2.2, 0.12, 0.12, 0, roofY + 2.8, z1 - 1.2, 0xdfe3e8));
  // the funnel abaft the bridge: the company's colour, its band, a black top
  const fz = z0 + 1.4;
  parts.push(box(1.7, 2.6, 2.1, 0, roofY + 1.3, fz, c.funnel), box(1.72, 0.55, 2.12, 0, roofY + 1.5, fz, c.band), box(1.72, 0.4, 2.12, 0, roofY + 2.4, fz, 0x1b1d22));
  // the cargo deck from the house to the forecastle
  const zA = z1 + 1.2;
  const zB = L - 5.2;
  if (kind === "bulk") {
    const n = 7;
    const pitch = (zB - zA) / n;
    for (let k = 0; k < n; k++) {
      const zc = zA + pitch * (k + 0.5);
      parts.push(box(2 * (Math.min(hw(zc + pitch / 2), B) - 1.1), 0.55, pitch * 0.74, 0, H + 0.28, zc, c.cargo[0]));
      // a crane between every other pair of hatches, its jib over the hatch ahead
      if (geared && k % 2 === 0 && k < n - 1) parts.push(...deckCrane(zc + pitch / 2, H, pitch * 1.25, c.gear));
    }
  } else if (kind === "container") {
    const bay = 2.4;
    for (let z = zA; z + bay <= zB + 0.3; z += bay + 0.3) {
      const half = Math.min(hw(z + bay), B) - 0.45;
      if (half < 1.6) break;
      const w = (2 * half) / 4;
      // lower toward the bow, so the bridge sees over them; one bay in a few left part empty
      const most = z > L - 12 ? 3 : 5;
      for (let r = 0; r < 4; r++) {
        const tiersHere = Math.max(1, Math.round(most - next() * 2.4));
        const lo = Math.max(1, Math.min(tiersHere, 1 + Math.floor(next() * tiersHere)));
        const x = -half + w * (r + 0.5);
        const pick = () => c.cargo[Math.floor(next() * c.cargo.length)];
        parts.push(box(w - 0.08, lo * 0.55, bay, x, H + (lo * 0.55) / 2, z + bay / 2, pick()));
        if (tiersHere > lo) parts.push(box(w - 0.08, (tiersHere - lo) * 0.55, bay, x, H + lo * 0.55 + ((tiersHere - lo) * 0.55) / 2, z + bay / 2, pick()));
      }
    }
  } else {
    // tanker: the pipe rack and the catwalk over it, the manifold's pipes across, the hose crane beside them
    parts.push(box(0.6, 0.4, zB - zA, 0, H + 0.2, (zA + zB) / 2, c.gear), box(0.9, 0.12, zB - zA, 0.6, H + 1.25, (zA + zB) / 2, c.gear));
    for (const dz of [-1.2, -0.4, 0.4, 1.2]) parts.push(box(2 * B - 1.0, 0.28, 0.28, 0, H + 0.4, dz, c.gear));
    parts.push(...deckCrane(3, H, 4.5, c.gear));
    // and the tank domes down both sides
    for (let z = zA + 2; z < zB - 1; z += 4.5) for (const s of [-1, 1]) parts.push(box(0.8, 0.35, 0.8, s * (B - 1.3), H + 0.17, z, c.gear));
  }
  return merge(parts).translate(0, -draft, 0);
}

/**
 * Where a freighter shows its lights after dark (ship's frame, as `freighter` builds it), for the points that keep
 * them visible from across the bay: an anchor or masthead light forward and aft, white; at anchor the deck's
 * floodlights and the house's windows, warm; under way the sidelights instead (red to port, +x; green to starboard)
 * and the stern light.
 */
export function freighterLights(kind: FreighterKind, draft: number, underWay: boolean): [number, number, number, number][] {
  const { L, B, H, tiers, house } = SHIP[kind];
  const out: [number, number, number, number][] = [];
  const y = (v: number) => v - draft;
  if (kind === "carCarrier") {
    const roof = H + 9;
    out.push([0, y(roof + 2.4), L - 6, MAST], [0, y(roof + 2.8), -L + 3.5, MAST], [0, y(roof - 0.7), L - 1.6, WARM]);
    if (underWay) out.push([B, y(roof - 0.5), L - 3, PORT], [-B, y(roof - 0.5), L - 3, STARBOARD], [0, y(H + 1), -L, MAST]);
    else for (const z of [-L + 6, -2, 6]) out.push([B, y(H + 4), z, WARM], [-B, y(H + 4), z, WARM]);
    return out;
  }
  const z1 = -L + 1.2 + house;
  const roofY = H + tiers;
  out.push([0, y(H + 4.3), L - 2.6, MAST], [0, y(roofY + 3.4), z1 - 1.2, MAST]);
  if (underWay) {
    out.push([B + 0.5, y(roofY + 0.8), z1 - 0.8, PORT], [-B - 0.5, y(roofY + 0.8), z1 - 0.8, STARBOARD], [0, y(H + 0.6), -L, MAST]);
    out.push([0, y(H + 2.7), z1 + 0.05, WARM]);
    return out;
  }
  // the floodlights along the deck, the house's lit windows
  for (let z = z1 + 3; z < L - 5; z += 7) out.push([B - 0.4, y(H + 1.2), z, WARM], [-(B - 0.4), y(H + 1.2), z, WARM]);
  out.push([1.2, y(H + 1.7), z1 + 0.05, WARM], [-1.2, y(H + 2.7), z1 + 0.05, WARM], [0, y(roofY + 0.8), z1 + 0.25, WARM]);
  return out;
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

/**
 * The drones' lights (nose along +z, port +x): red under the two port motors, green under the starboard ones, a white
 * light at the nose and the anti-collision strobe on top, which the scene flashes.
 */
export function quadcopterLights(): BufferGeometry {
  const parts: BufferGeometry[] = [box(0.16, 0.1, 0.08, 0, -0.04, 0.47, 0xffffff)];
  for (const sz of [1, -1]) {
    parts.push(box(0.2, 0.1, 0.2, 0.68, -0.03, sz * 0.68, 0xff2a1f), box(0.2, 0.1, 0.2, -0.68, -0.03, sz * 0.68, 0x22e06a));
  }
  return merge(parts);
}

/** Where the drones' lights sit, for the points that keep them visible from far off: port, starboard, strobe. */
export const DRONE_LIGHT_POINTS: [number, number, number, number][] = [
  [0.68, -0.03, 0, 0xff2a1f],
  [-0.68, -0.03, 0, 0x22e06a],
  [0, 0.26, 0, 0xffffff],
];

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

/** A part's glow: 1 where it lights (signs, lamps, the light line), for the vehicles' shader (Life.tsx). */
const glowing = (g: BufferGeometry, v: number): BufferGeometry => {
  g.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
  return g;
};

/** The bus's lamps, as busSection places them: the front section's headlamps, the rear one's tail lamps ([x, y, z]). */
export const BUS_LAMPS = { head: [1.52, 0.6, 0.42], tail: [-1.52, 0.62, 0.44] } as const;

/**
 * One section of a 2100 articulated electric bus, built nose along +x, wheels on the ground at y 0, 3 long: white
 * with a wraparound tinted window band and the line's violet light line, a battery pod on the roof. The front section
 * has the windscreen, the lit route sign, headlights and the charging pantograph; the rear one the rear window, sign
 * and tail lamps at -x and the bellows at +x, toward the joint. The aGlow attribute marks what lights.
 */
export function busSection(front: boolean): BufferGeometry {
  const parts: BufferGeometry[] = [
    glowing(box(3.0, 0.3, 1.18, 0, 0.33, 0, 0x2b2f36), 0),
    glowing(box(3.0, 0.5, 1.24, 0, 0.73, 0, WHITE), 0),
    glowing(box(3.02, 0.07, 1.26, 0, 0.99, 0, 0xa78bfa), 1),
    glowing(box(2.96, 0.48, 1.22, 0, 1.27, 0, 0x22303f), 0),
    glowing(box(3.0, 0.16, 1.24, 0, 1.59, 0, WHITE), 0),
    glowing(box(1.8, 0.16, 0.86, -0.2, 1.75, 0, 0xd5d9de), 0),
    ...[-0.95, 0.95].map((x) => glowing(box(0.6, 0.56, 1.28, x, 0.28, 0, 0x16181c), 0)),
  ];
  if (front) {
    parts.push(
      glowing(box(0.06, 0.62, 1.12, 1.5, 1.15, 0, 0x2a3a4c), 0),
      glowing(box(0.05, 0.16, 0.86, 1.52, 1.5, 0, 0xffb547), 1),
      ...[-0.42, 0.42].map((z) => glowing(box(0.05, 0.1, 0.22, 1.52, 0.6, z, 0xfff3d6), 1)),
      // the pantograph folded on the roof
      ...[-0.3, 0.3].map((z) => glowing(box(0.05, 0.3, 0.05, 0.55, 1.95, z, 0x3a3f46), 0)),
      glowing(box(0.9, 0.04, 0.72, 0.25, 2.1, 0, 0x3a3f46), 0),
    );
  } else {
    parts.push(
      glowing(box(0.06, 0.5, 1.1, -1.5, 1.25, 0, 0x22303f), 0),
      glowing(box(0.05, 0.14, 0.7, -1.52, 1.52, 0, 0xffb547), 1),
      ...[-0.44, 0.44].map((z) => glowing(box(0.05, 0.12, 0.24, -1.52, 0.62, z, 0xff2a1f), 1)),
      glowing(box(0.5, 1.15, 1.08, 1.62, 0.98, 0, 0x2f343c), 0),
    );
  }
  return merge(parts);
}
