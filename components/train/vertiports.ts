/**
 * The air network's ports, where the air taxis land and the delivery drones dock (airways.ts and droneways.ts fly
 * them). Each sits at a transit interchange, over water or on a roof, never in a neighbourhood:
 * - the Harbour Vertiport, a floating deck on the inlet east of the Waterfront hub's gallery (the Expo, the Canada
 *   Line, the West Coast Express and the SeaBus): six pads in a row, a glass terminal under a green roof with drone
 *   docks on it, a charging canopy, safety nets round the deck, a windsock, and a covered gangway to the gallery;
 * - the Lonsdale Vertiport, a smaller float east of the SeaBus's Lonsdale berth: two pads, a shelter with four drone
 *   docks on its roof out of the taxis' way, a gangway to the quay;
 * - the Commercial–Broadway Skyport, a deck on the tallest of the Broadway & Commercial towers (built with the tower,
 *   buildings/heroes.ts): two pads, a glass lounge with a drone deck of six docks on its roof, safety nets;
 * - the Clark Park Vertiport across the square from the station, the regional routes' port: a deck of four pads over a
 *   glass hall (laid out in sets/squares.ts, built with Commercial–Broadway's set from the parts here);
 * - (the rail yard's drone port is on its shed's roof: railYardKit.ts).
 * The layout as data, shared by the builders and the fliers; the floats' geometry painted (its lights marked to glow
 * after dark, pavilion.ts lit) for SeaBus.tsx's mesh. Pure apart from three.js geometry.
 */
import { BoxGeometry, type BufferGeometry, CylinderGeometry, RingGeometry, TorusGeometry } from "three";

import { padDeck } from "./buildings/archetypes";
import type { Tint } from "./buildings/meshBuilder";
import { box as part, fp, type Sink, solid, strut, tpl, walls, WHITE } from "./buildings/parts";
import { SEA } from "./constants";
import { lit } from "./pavilion";
import { merge, paint } from "./shapes";

/** A landing spot: its centre on the deck's top. */
export type Spot = { x: number; y: number; z: number };
type Box = { x0: number; x1: number; z0: number; z1: number };

/** The floats' deck, a little above the sea. */
export const FLOAT_DECK = SEA + 1.3;
/** A taxi pad's radius. */
export const PAD_R = 2.6;

/**
 * The Harbour Vertiport: its float, its pads in a row from west to east (the trunk's two services, the North Shore
 * crossing's two, the Skyport spur's two: every service climbs away to the north or east, over none of the others),
 * and its terminal.
 */
export const HARBOUR = {
  float: { x0: 56, x1: 118, z0: -86, z1: -70 },
  pads: [72, 80, 88, 96, 104, 112].map((x): Spot => ({ x, y: FLOAT_DECK + 0.14, z: -78 })),
  terminal: { x0: 57.5, x1: 66.5, z0: -85, z1: -71, h: 3.4 },
};
/** The Harbour terminal's drone docks, on its green roof: parcels to and from the taxis and the SeaBus. */
export const HARBOUR_DOCKS: Spot[] = [60, 64].flatMap((x) => [-82, -78, -74].map((z) => ({ x, y: FLOAT_DECK + HARBOUR.terminal.h + 0.45, z })));

/**
 * The Lonsdale Vertiport: its float, its two pads at its west end (the taxis come and go to the south-west), its
 * shelter at the east end with the drone docks on its roof, out of the taxis' way; where its gangway comes ashore (z).
 */
export const LONSDALE = {
  float: { x0: 243, x1: 275, z0: -265, z1: -253 },
  pads: [249, 261].map((x): Spot => ({ x, y: FLOAT_DECK + 0.14, z: -259 })),
  shelter: { x0: 267, x1: 273, z0: -264, z1: -254, h: 2.8 },
  shore: -274,
};
/** The Lonsdale shelter's drone docks, on its roof. */
export const LONSDALE_DOCKS: Spot[] = [268.3, 271.7].flatMap((x) => [-261.5, -256.5].map((z) => ({ x, y: FLOAT_DECK + LONSDALE.shelter.h + 0.45, z })));

/** Where the floats stand, for the boats to keep clear of (waterfrontHub.ts NO_SAIL). */
export const VERTIPORT_FLOATS: Box[] = [HARBOUR.float, LONSDALE.float];

/**
 * The Skyport, about the centre of the tower it stands on (local x east, z south), its deck `lift` over the tower's
 * roof: the deck reaches past the tower's east face and a little north and south (its west edge keeps the tower's,
 * 25 back from the guideway), its two pads to the north, the lounge to the south with the drone deck on its roof.
 */
export const SKYPORT = {
  deck: { x0: -4.5, x1: 13, z0: -6.5, z1: 7, lift: 1.6, t: 0.5 },
  pads: [
    [-0.5, -3.3],
    [7.5, -3.3],
  ] as [number, number][],
  lounge: { x0: -2.5, x1: 9.5, z0: 1, z1: 6.6, h: 2.8 },
  docks: [-0.5, 3.5, 7.5].flatMap((x) => [2.3, 5.6].map((z) => [x, z] as [number, number])),
};
/** Over the tower's roof: the Skyport's deck top, its pads' tops and the drone deck's top (the lounge's roof). */
export const SKYPORT_DECK = SKYPORT.deck.lift + SKYPORT.deck.t;
export const SKYPORT_PAD = SKYPORT_DECK + 0.14;
export const SKYPORT_DRONE_DECK = SKYPORT_DECK + SKYPORT.lounge.h + 0.3;

/* ------------------------------------------------------------------ the floats, painted */

const DECK = 0xb9bcbf;
const HULL = 0x8e949b;
const WHITE_HEX = 0xeef0f2;
const PAD = 0x3b4047;
const MARK = 0xecebe4;
const GREEN_LIGHT = 0x3ee08f;
const GLASS = 0x9fbfcf;

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => paint(new BoxGeometry(w, h, d).translate(x, y, z), hex);

/** A taxi pad on a deck at y: the dark pad, its white touchdown ring and aiming bar, a ring of green light round its edge. */
export function pad(out: BufferGeometry[], x: number, y: number, z: number): void {
  out.push(paint(new CylinderGeometry(PAD_R, PAD_R, 0.12, 28).translate(x, y + 0.06, z), PAD));
  out.push(paint(new RingGeometry(1.5, 1.78, 28).rotateX(-Math.PI / 2).translate(x, y + 0.125, z), MARK));
  out.push(box(0.3, 0.02, 1.6, x, y + 0.13, z, MARK));
  out.push(lit(paint(new RingGeometry(PAD_R - 0.16, PAD_R, 28).rotateX(-Math.PI / 2).translate(x, y + 0.13, z), GREEN_LIGHT), 1.2));
}

/** A drone dock at a spot: a dark square on a plinth, its edges lit, the charging plate pale. */
function dock(out: BufferGeometry[], s: Spot): void {
  out.push(box(2.2, 0.12, 2.2, s.x, s.y - 0.06, s.z, 0x3a3f46));
  for (const [dx, dz, w, d] of [
    [0, -1.05, 2.2, 0.1],
    [0, 1.05, 2.2, 0.1],
    [-1.05, 0, 0.1, 2.0],
    [1.05, 0, 0.1, 2.0],
  ])
    out.push(lit(box(w, 0.04, d, s.x + dx, s.y + 0.01, s.z + dz, 0x7ef0ff), 0.9));
  out.push(box(0.9, 0.02, 0.9, s.x, s.y + 0.01, s.z, 0xc9ced4));
}

/** Safety nets along a deck's edge from a to b at height y, leaning out and down toward (ox, oz), framed at their rim. */
export function nets(out: BufferGeometry[], ax: number, az: number, bx: number, bz: number, y: number, ox: number, oz: number): void {
  const L = Math.hypot(bx - ax, bz - az);
  // built along local x, reaching out along local +z and down; a turn by ry takes +z to (sin ry, cos ry)
  const ry = Math.atan2(ox, oz);
  const at = (g: BufferGeometry) => g.rotateY(ry).translate((ax + bx) / 2, y - 0.05, (az + bz) / 2);
  out.push(paint(at(new BoxGeometry(L, 0.03, 1.3).translate(0, 0, 0.65).rotateX(0.26)), 0x4a4f57));
  out.push(paint(at(new BoxGeometry(L, 0.08, 0.08).translate(0, -1.3 * Math.sin(0.26), 1.3 * Math.cos(0.26))), 0x8a9099));
}

/** A windsock on its pole, the sock streaming east, lit after dark, a red light on top. */
export function windsock(out: BufferGeometry[], x: number, y: number, z: number): void {
  out.push(paint(new CylinderGeometry(0.07, 0.09, 4.6, 6).translate(x, y + 2.3, z), WHITE_HEX));
  for (let k = 0; k < 4; k++) {
    const r0 = 0.42 - k * 0.07;
    out.push(lit(paint(new CylinderGeometry(r0 - 0.07, r0, 0.42, 10, 1, true).rotateZ(-Math.PI / 2).translate(x + 0.25 + k * 0.42, y + 4.35, z), k % 2 ? WHITE_HEX : 0xf97316), 0.35));
  }
  out.push(lit(box(0.16, 0.16, 0.16, x, y + 4.7, z, 0xff2a1f), 1.4));
}

/** A glass box on a deck: glass walls lit from within after dark, white mullions, a white slab, a green roof. */
export function glassBox(out: BufferGeometry[], b: Box, y: number, h: number): void {
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  out.push(lit(box(w - 0.1, h, d - 0.1, cx, y + h / 2, cz, GLASS), 0.4));
  const nx = Math.max(2, Math.round(w / 2.2));
  const nz = Math.max(2, Math.round(d / 2.2));
  for (let k = 0; k <= nx; k++) for (const z of [b.z0, b.z1]) out.push(box(0.12, h, 0.12, b.x0 + (w * k) / nx, y + h / 2, z, WHITE_HEX));
  for (let k = 1; k < nz; k++) for (const x of [b.x0, b.x1]) out.push(box(0.12, h, 0.12, x, y + h / 2, b.z0 + (d * k) / nz, WHITE_HEX));
  out.push(box(w + 0.6, 0.3, d + 0.6, cx, y + h + 0.15, cz, WHITE_HEX));
  out.push(box(w + 0.2, 0.06, d + 0.2, cx, y + h + 0.33, cz, 0x5d8a4a));
}

/** A float's pontoon over the water, its deck and the fender along its waterline. */
function float(out: BufferGeometry[], f: Box): void {
  const cx = (f.x0 + f.x1) / 2;
  const cz = (f.z0 + f.z1) / 2;
  const w = f.x1 - f.x0;
  const d = f.z1 - f.z0;
  out.push(box(w, FLOAT_DECK - SEA + 0.5, d, cx, (FLOAT_DECK + SEA - 0.5) / 2 - 0.03, cz, HULL));
  out.push(box(w - 0.3, 0.06, d - 0.3, cx, FLOAT_DECK + 0.03, cz, DECK));
  out.push(box(w + 0.3, 0.35, d + 0.3, cx, SEA + 0.35, cz, 0x22252a));
}

/**
 * The Harbour Vertiport: float, pads, terminal and its docks, the charging canopy, nets, windsock, and the covered
 * gangway from the side of the hub's gallery (its wall at gx, its floor at gy).
 */
export function harbourVertiport(gx: number, gy: number): BufferGeometry {
  const out: BufferGeometry[] = [];
  const F = HARBOUR.float;
  float(out, F);
  for (const p of HARBOUR.pads) pad(out, p.x, FLOAT_DECK, p.z);
  const T = HARBOUR.terminal;
  glassBox(out, T, FLOAT_DECK, T.h);
  for (const s of HARBOUR_DOCKS) dock(out, s);
  // the charging canopy along the south edge behind the pads: a white roof on posts, a cabinet for each pad with its
  // status light and its cable run out toward the pad
  const cz = F.z1 - 1.8;
  const cx0 = 69;
  out.push(box(F.x1 - 1 - cx0, 0.2, 2.8, (cx0 + F.x1 - 1) / 2, FLOAT_DECK + 3.0, cz, WHITE_HEX));
  for (let x = cx0 + 0.5; x <= F.x1 - 1; x += 8) out.push(box(0.16, 2.9, 0.16, x, FLOAT_DECK + 1.45, cz + 1.1, 0x8a9099));
  for (const p of HARBOUR.pads) {
    out.push(box(0.9, 1.5, 0.6, p.x, FLOAT_DECK + 0.75, cz, 0x2f343c));
    out.push(lit(box(0.3, 0.12, 0.04, p.x, FLOAT_DECK + 1.25, cz - 0.32, 0x7ef0ff), 1.4));
    out.push(box(0.12, 0.06, 2.0, p.x + 0.6, FLOAT_DECK + 0.09, cz - 1.6, 0x1c1f24));
  }
  // safety nets round the deck, but where the terminal stands and the gangway comes aboard
  nets(out, T.x1 + 1, F.z0, F.x1, F.z0, FLOAT_DECK, 0, -1);
  nets(out, F.x1, F.z0, F.x1, F.z1, FLOAT_DECK, 1, 0);
  nets(out, T.x1 + 1, F.z1, F.x1, F.z1, FLOAT_DECK, 0, 1);
  windsock(out, F.x1 - 1.2, FLOAT_DECK, F.z0 + 1.2);
  // the covered gangway from the side of the hub's gallery, sloping down to the float
  const gz = (T.z0 + T.z1) / 2;
  const run = F.x0 - gx;
  const len = Math.hypot(run, gy - FLOAT_DECK);
  const fall = Math.atan2(gy - FLOAT_DECK, run);
  const ramp = (w: number, h: number, dy: number, hex: number, dz = 0) => paint(new BoxGeometry(len, h, w).rotateZ(-fall).translate((gx + F.x0) / 2, (gy + FLOAT_DECK) / 2 + dy, gz + dz), hex);
  out.push(ramp(2.8, 0.3, -0.15, HULL), ramp(3.2, 0.2, 2.8, WHITE_HEX), ramp(0.06, 2.2, 1.3, GLASS, 1.45), ramp(0.06, 2.2, 1.3, GLASS, -1.45));
  return merge(out);
}

/** The Lonsdale Vertiport: float, two pads, the shelter and its docks, nets, windsock, the gangway ashore. */
export function lonsdaleVertiport(): BufferGeometry {
  const out: BufferGeometry[] = [];
  const F = LONSDALE.float;
  float(out, F);
  for (const p of LONSDALE.pads) pad(out, p.x, FLOAT_DECK, p.z);
  const S = LONSDALE.shelter;
  glassBox(out, S, FLOAT_DECK, S.h);
  for (const s of LONSDALE_DOCKS) dock(out, s);
  nets(out, F.x0, F.z1, F.x1, F.z1, FLOAT_DECK, 0, 1);
  nets(out, F.x1, F.z0, F.x1, F.z1, FLOAT_DECK, 1, 0);
  nets(out, F.x0, F.z0, F.x0, F.z1, FLOAT_DECK, -1, 0);
  nets(out, F.x0, F.z0, S.x0 - 1, F.z0, FLOAT_DECK, 0, -1);
  windsock(out, F.x0 + 1.2, FLOAT_DECK, (F.z0 + F.z1) / 2);
  // the gangway north to the quay, railed
  const L = F.z0 - LONSDALE.shore;
  const zc = (F.z0 + LONSDALE.shore) / 2;
  const x = (S.x0 + S.x1) / 2;
  out.push(box(2.4, 0.3, L, x, FLOAT_DECK - 0.15, zc, HULL));
  for (const sd of [-1, 1]) out.push(box(0.08, 1.0, L, x + sd * 1.15, FLOAT_DECK + 0.5, zc, 0xd9dcdf));
  return merge(out);
}

/* ------------------------------------------------------------------ the Skyport, in the city's own meshes */

const tint = (hex: number): Tint => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/**
 * The Skyport on its tower (centre cx, cz; roof y; the tower's rounded plan tw by td, its ends round), into a city
 * chunk's meshes: the deck reaching past the tower, carried on the tower's walls (taken up to it as a drum) and on a
 * grillage of beams under it, raking struts from a ring beam round the tower out to the beams under the overhang; its
 * two pads (the pad façade's mark, a violet ring of light round each), the glass lounge, the drone deck on the lounge's
 * roof with its six docks ringed in light, the nets round the deck leaning out, and red obstruction lights at its
 * corners (the city's neon). Draws nothing from the rng.
 */
export function skyport(s: Sink, cx: number, cz: number, y: number, tw: number, td: number): void {
  const D = SKYPORT.deck;
  const top = y + SKYPORT_DECK;
  const X = (lx: number) => cx + lx;
  const Z = (lz: number) => cz + lz;
  const steel = tint(0x8a9099);
  const stone = tint(0xd8d4cc);
  part(s, "concrete", X((D.x0 + D.x1) / 2), y + D.lift, Z((D.z0 + D.z1) / 2), D.x1 - D.x0, D.t, D.z1 - D.z0, stone);
  // the tower's walls taken up to the deck's underside
  const r = Math.min(tw, td) / 2 - 0.05;
  walls(s, "concrete", fp.rounded(tw, td, r, 5), cx, cz, y, y + D.lift, { tint: stone });
  // the grillage under the deck: beams along it and across it
  const BEAM = 0.55;
  const under = y + D.lift - BEAM;
  const xs = [D.x0 + 0.6, 0.5, 4.5, 8.7, D.x1 - 0.6];
  const zs = [D.z0 + 0.6, 0, D.z1 - 0.6];
  for (const lz of zs) part(s, "metal", X((D.x0 + D.x1) / 2), under, Z(lz), D.x1 - D.x0 - 0.6, BEAM, 0.35, steel);
  for (const lx of xs) part(s, "metal", X(lx), under, Z((D.z0 + D.z1) / 2), 0.35, BEAM, D.z1 - D.z0 - 0.6, steel);
  // the raking struts: from a ring beam round the tower a storey and a half down, each from the point of the tower's
  // face nearest where it lands, up to a crossing of the beams beyond the drum; so every strut stays over the deck,
  // clear of the towers beside
  const ringY = y - 6;
  walls(s, "metal", fp.rounded(tw + 0.5, td + 0.5, r + 0.25, 5), cx, cz, ringY - 0.35, ringY + 0.35, { tint: steel });
  const hx = tw / 2 - r;
  const hz = td / 2 - r;
  for (const lx of xs) {
    for (const lz of zs) {
      const qx = Math.max(-hx, Math.min(hx, lx));
      const qz = Math.max(-hz, Math.min(hz, lz));
      const d = Math.hypot(lx - qx, lz - qz);
      if (d < r + 0.4) continue;
      const fx = qx + ((lx - qx) / d) * (r + 0.15);
      const fz = qz + ((lz - qz) / d) * (r + 0.15);
      strut(s, "metal", [X(fx), ringY, Z(fz)], [X(lx), under + 0.1, Z(lz)], lx > 8 ? 0.2 : 0.16, steel);
    }
  }
  for (const [lx, lz] of SKYPORT.pads) {
    solid(s, "pad", tpl("padDeck", padDeck), X(lx), top, Z(lz), PAD_R, SKYPORT_PAD - SKYPORT_DECK, PAD_R);
    solid(s, "crownA", tpl("padRing", () => new TorusGeometry(1, 0.06, 6, 32).rotateX(Math.PI / 2)), X(lx), top + 0.17, Z(lz), PAD_R * 0.97, 1, PAD_R * 0.97);
  }
  // the lounge: glass between white mullions under a white slab; on it the drone deck, railed
  const L = SKYPORT.lounge;
  const lw = L.x1 - L.x0;
  const ld = L.z1 - L.z0;
  part(s, "glass", X((L.x0 + L.x1) / 2), top, Z((L.z0 + L.z1) / 2), lw, L.h, ld, tint(0xdde9f1));
  for (let k = 0; k <= 5; k++) for (const lz of [L.z0, L.z1]) part(s, "concrete", X(L.x0 + (lw * k) / 5), top, Z(lz), 0.14, L.h, 0.14, WHITE);
  part(s, "concrete", X((L.x0 + L.x1) / 2), top + L.h, Z((L.z0 + L.z1) / 2), lw + 0.4, 0.3, ld + 0.4, WHITE);
  const dy = y + SKYPORT_DRONE_DECK;
  for (const [lx, lz] of SKYPORT.docks) {
    part(s, "roof", X(lx), dy - 0.02, Z(lz), 2.2, 0.06, 2.2, tint(0x3a3f46));
    solid(s, "crownB", tpl("dockRing", () => new TorusGeometry(1, 0.05, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4)), X(lx), dy + 0.06, Z(lz), 1.45, 1, 1.45);
  }
  for (const lz of [L.z0 - 0.15, L.z1 + 0.15]) part(s, "concrete", X((L.x0 + L.x1) / 2), dy, Z(lz), lw + 0.3, 0.5, 0.06, tint(0xd9dcdf));
  // the nets round the deck's edges, leaning out and down: ribs from the edge, a rail along their ends
  const netTint = tint(0x4a4f57);
  const edges: [number, number, number, number, number, number][] = [
    [D.x0, D.z0, D.x1, D.z0, 0, -1],
    [D.x1, D.z0, D.x1, D.z1, 1, 0],
    [D.x1, D.z1, D.x0, D.z1, 0, 1],
    [D.x0, D.z1, D.x0, D.z0, -1, 0],
  ];
  for (const [ax, az, bx, bz, ox, oz] of edges) {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.2));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const ex = ax + (bx - ax) * u;
      const ez = az + (bz - az) * u;
      strut(s, "metal", [X(ex), top - 0.1, Z(ez)], [X(ex + ox * 1.2), top - 0.42, Z(ez + oz * 1.2)], 0.03, netTint);
      if (k < n) {
        const fx = ax + (bx - ax) * ((k + 1) / n);
        const fz = az + (bz - az) * ((k + 1) / n);
        strut(s, "metal", [X(ex + ox * 1.2), top - 0.42, Z(ez + oz * 1.2)], [X(fx + ox * 1.2), top - 0.42, Z(fz + oz * 1.2)], 0.04, steel);
        strut(s, "metal", [X(ex + ox * 0.6), top - 0.26, Z(ez + oz * 0.6)], [X(fx + ox * 0.6), top - 0.26, Z(fz + oz * 0.6)], 0.02, netTint);
      }
    }
  }
  // red obstruction lights at the deck's corners and on the lounge's roof
  for (const [lx, lz, ly] of [
    [D.x0 + 0.3, D.z0 + 0.3, 0],
    [D.x1 - 0.3, D.z0 + 0.3, 0],
    [D.x1 - 0.3, D.z1 - 0.3, 0],
    [D.x0 + 0.3, D.z1 - 0.3, 0],
    [L.x0 + 0.2, L.z1, L.h + 0.6],
    [L.x1 - 0.2, L.z1, L.h + 0.6],
  ])
    part(s, "neon", X(lx), top + ly, Z(lz), 0.22, 0.22, 0.22);
}
