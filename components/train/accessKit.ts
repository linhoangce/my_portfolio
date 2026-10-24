/**
 * The geometry of a platform's way in (stationAccess.ts): its entrance, stairs, lifts and towers, in the station's
 * frame (x left of travel, z ahead, y up from the deck), as parts for the station's own meshes:
 * - painted solid parts (one vertex-coloured material);
 * - glass;
 * - steel;
 * - what glows in the line's violet (the entrance totem).
 */
import { BoxGeometry } from "three";

import type { Part } from "./merge";
import { paint } from "./shapes";
import { type Access, GATES, LIFT, STAIR, TOWER } from "./stationAccess";

export type AccessParts = { painted: Part[]; glass: Part[]; steel: Part[]; glow: Part[] };

const CONCRETE = 0xb9b4aa;
const STONE = 0xcfc8bb;
const WELL = 0x1d2228;
const WHITE = 0xe9ebee;

/**
 * One platform's way in. `ground(x, z)` is the ground's height under a point, in the frame.
 */
export function accessParts(e: Access, ground: (x: number, z: number) => number): AccessParts {
  const out: AccessParts = { painted: [], glass: [], steel: [], glow: [] };
  const s = e.side;
  const box = (list: Part[], w: number, h: number, d: number, x: number, y: number, z: number, hex?: number) =>
    list.push({ geo: hex === undefined ? new BoxGeometry(w, h, d) : paint(new BoxGeometry(w, h, d), hex), position: [x, y, z] });
  const P = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => box(out.painted, w, h, d, x, y, z, hex);

  /**
   * A straight flight of steps `w` wide centred at x, from (z0, y0) up to (z1, y1), with sloped stringers, glass
   * balustrades and a steel rail on both sides.
   */
  const flight = (x: number, w: number, z0: number, y0: number, z1: number, y1: number, rails = true) => {
    const rise = y1 - y0;
    const n = Math.max(1, Math.round(rise / 0.3));
    const run = z1 - z0;
    for (let k = 0; k < n; k++) {
      const yt = y0 + (rise * (k + 1)) / n;
      const zc = z0 + (run * (k + 0.5)) / n;
      P(w, rise / n + 0.05, Math.abs(run) / n + 0.04, x, yt - rise / n / 2, zc, CONCRETE);
    }
    const L = Math.hypot(run, rise);
    // turned about x so the end it rises toward is up, whichever way that is
    const tilt = -Math.atan(rise / run);
    const zm = (z0 + z1) / 2;
    const ym = (y0 + y1) / 2;
    for (const dx of [-w / 2, w / 2]) {
      out.painted.push({ geo: paint(new BoxGeometry(0.16, 0.5, L), 0x8e95a3), position: [x + dx, ym - 0.2, zm], rotation: [tilt, 0, 0] });
      if (!rails) continue;
      out.glass.push({ geo: new BoxGeometry(0.04, 1.0, L), position: [x + dx, ym + 0.55, zm], rotation: [tilt, 0, 0] });
      out.steel.push({ geo: new BoxGeometry(0.07, 0.07, L), position: [x + dx, ym + 1.08, zm], rotation: [tilt, 0, 0] });
    }
  };

  /** A glass lift `w` square at (x, z) from the ground to `top` and its cab a storey over it, on steel corners. */
  const lift = (x: number, z: number, w: number, top: number) => {
    const g = ground(x, z);
    const h = top + 2.6 - g;
    box(out.glass, w, h, w, x, g + h / 2, z);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      box(out.steel, 0.12, h, 0.12, x + (dx * w) / 2, g + h / 2, z + (dz * w) / 2);
    P(w + 0.3, 0.25, w + 0.3, x, top + 2.72, z, WHITE);
    P(w + 0.4, 0.2, w + 0.4, x, g + 0.1, z, STONE);
    // the car, part way up
    P(w - 0.3, 2.2, w - 0.3, x, g + (top - g) * 0.4 + 1.1, z, 0xd6dbe0);
  };

  /**
   * The entrance, open (transit is free): the paving across the way in (`xs` its extent, along z when `acrossX`, else
   * x) and the line's lit totem out on the incoming side.
   */
  const entrance = (xs: number[], z: number, acrossX: boolean, toward: number) => {
    const g = Math.min(...xs.map((x) => (acrossX ? ground(x, z) : ground(z, x))));
    const span = Math.max(...xs) - Math.min(...xs);
    const mid = (Math.max(...xs) + Math.min(...xs)) / 2;
    if (acrossX) P(span + 1.2, 0.14, 3.4, mid, g + 0.05, z, STONE);
    else P(3.4, 0.14, span + 1.2, z, g + 0.05, mid, STONE);
    const [px, pz] = acrossX ? [xs[0] + s * 0.2, z + toward * 2.4] : [z + toward * 2.4, xs[xs.length - 1] - 0.2];
    box(out.steel, 0.12, 3.4, 0.12, px, g + 1.7, pz);
    box(out.glow, 0.14, 1.3, 0.7, px, g + 2.8, pz);
  };

  if (e.kind === "under") {
    // the stair under the platform, its head through a stairwell in the floor, the lift beside the head
    const x = STAIR.x * s;
    flight(x, STAIR.w, e.zFoot, e.yFoot, e.zTop, 1.4);
    // a column under the stair's middle
    const zm = (e.zFoot + e.zTop) / 2;
    const ym = (e.yFoot + 1.4) / 2;
    const gm = ground(x, zm);
    if (ym - 0.6 - gm > 0.5) box(out.steel, 0.24, ym - 0.6 - gm, 0.24, x, gm + (ym - 0.6 - gm) / 2, zm);
    // the stairwell: a dark opening in the platform's floor, glass round it
    const z0 = e.zTop - e.dir * 3.2;
    P(STAIR.w, 0.02, 3.2, x, 1.415, (z0 + e.zTop) / 2, WELL);
    for (const dx of [-1, 1]) {
      box(out.glass, 0.04, 1.1, 3.2, x + (dx * STAIR.w) / 2, 1.95, (z0 + e.zTop) / 2);
      box(out.steel, 0.07, 0.07, 3.2, x + (dx * STAIR.w) / 2, 2.52, (z0 + e.zTop) / 2);
    }
    box(out.glass, STAIR.w, 1.1, 0.04, x, 1.95, z0);
    lift(LIFT.x * s, e.zLift, LIFT.w, 1.4);
    const gx: number[] = [];
    for (let k = 0; k <= 4; k++) gx.push((GATES.x0 + ((GATES.x1 - GATES.x0) * k) / 4) * s);
    entrance(gx, e.zGates, true, -e.dir);
  } else if (e.kind === "end") {
    // steps down off the platform's end, a lift beside them where the climb is a storey or more
    const x = 8.9 * s;
    flight(x, 3.0, e.zFoot, e.yFoot, e.zTop, 1.4);
    const out1 = -e.dir;
    if (1.4 - e.yFoot > 4) lift(11.4 * s, e.zTop + out1 * 1.2, 1.8, 1.4);
    const gx: number[] = [];
    for (let k = 0; k <= 4; k++) gx.push((GATES.x0 + ((GATES.x1 - GATES.x0) * k) / 4) * s);
    entrance(gx, e.zGates, true, out1);
  } else {
    // a glass tower of stairs and a lift beside the platform, a landing across to it
    const TX = e.tx ?? TOWER.x;
    const tx = TX * s;
    const g = e.yFoot;
    const top = 1.4;
    const h = top + 2.8 - g;
    const x0 = TX - TOWER.w / 2;
    const zA = e.zTop - TOWER.d / 2;
    const zB = e.zTop + TOWER.d / 2;
    // glass walls on steel corners and floor bands, a white roof, the paving under it
    for (const [w, d, x, z] of [
      [0.05, TOWER.d, x0, e.zTop],
      [0.05, TOWER.d, x0 + TOWER.w, e.zTop],
      [TOWER.w, 0.05, TX, zA],
      [TOWER.w, 0.05, TX, zB],
    ])
      box(out.glass, w, h, d, x * s, g + h / 2, z);
    for (const [cx, cz] of [
      [x0, zA],
      [x0 + TOWER.w, zA],
      [x0, zB],
      [x0 + TOWER.w, zB],
    ])
      box(out.steel, 0.16, h, 0.16, cx * s, g + h / 2, cz);
    for (let y = g + 2.6; y < top + 2.6; y += 2.6) {
      box(out.steel, 0.08, 0.12, TOWER.d, x0 * s, y, e.zTop);
      box(out.steel, 0.08, 0.12, TOWER.d, (x0 + TOWER.w) * s, y, e.zTop);
    }
    P(TOWER.w + 0.4, 0.3, TOWER.d + 0.4, tx, top + 2.95, e.zTop, WHITE);
    P(TOWER.w + 0.6, 0.14, TOWER.d + 0.6, tx, g + 0.05, e.zTop, STONE);
    // inside: flights doubling back along z in two lanes, landings at the ends; the lift in the outer lane
    const n = Math.max(2, Math.ceil((top - g) / 2.4));
    const lanes = [x0 + 0.55, x0 + 1.55];
    const za = zA + 0.7;
    const zb = zB - 0.7;
    for (let k = 0; k < n; k++) {
      const y0 = g + ((top - g) * k) / n;
      const y1 = g + ((top - g) * (k + 1)) / n;
      const up = k % 2 === 0;
      flight(lanes[k % 2] * s, 0.95, up ? za : zb, y0, up ? zb : za, y1, false);
      P(2.0, 0.14, 0.7, (x0 + 1.05) * s, y1 - 0.07, up ? zB - 0.35 : zA + 0.35, CONCRETE);
    }
    const lx = (x0 + 2.55) * s;
    box(out.glass, 1.1, h - 0.4, 1.4, lx, g + (h - 0.4) / 2, e.zTop);
    P(0.9, 2.1, 1.1, lx, g + (top - g) * 0.55 + 1.05, e.zTop, 0xd6dbe0);
    // the landing from the platform's edge into the tower, where the top flight arrives; across a street, a glazed
    // skybridge with a roof
    const zLand = (n - 1) % 2 === 0 ? zB - 1.1 : zA + 1.1;
    const span = x0 - 11.4 + 0.3;
    P(span, 0.3, 2.2, ((11.4 + x0) / 2) * s, top - 0.15, zLand, STONE);
    if (span > 2) {
      for (const dz of [-1.08, 1.08]) {
        box(out.glass, span, 2.3, 0.05, ((11.4 + x0) / 2) * s, top + 1.15, zLand + dz);
        box(out.steel, span, 0.1, 0.1, ((11.4 + x0) / 2) * s, top + 2.3, zLand + dz);
      }
      P(span, 0.14, 2.5, ((11.4 + x0) / 2) * s, top + 2.4, zLand, WHITE);
      // its steel truss underneath, a chord each side
      for (const dz of [-1.0, 1.0]) box(out.steel, span, 0.16, 0.12, ((11.4 + x0) / 2) * s, top - 0.45, zLand + dz);
    }
    // the entrance: beyond the tower's end, or beside it on its outer face
    if (e.dir !== 0) {
      const gx = [0, 1, 2, 3].map((k) => (x0 + 0.1 + (k * (TOWER.w - 0.2)) / 3) * s);
      entrance(gx, e.zGates, true, -e.dir);
    } else {
      const gz = [0, 1, 2, 3].map((k) => zA + 0.3 + (k * (TOWER.d - 0.6)) / 3);
      entrance(gz, (x0 + TOWER.w + 1.4) * s, false, s);
    }
  }
  return out;
}
