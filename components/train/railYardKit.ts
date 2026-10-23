/**
 * The rail yard's geometry (railYard.ts lays it out), for the West Coast Express's own meshes:
 * - `painted`: the fill's gravel top and its seawall, each track's ballast and rails, the ladder, buffer stops, the
 *   parked trains of the Expo, Millennium and Canada lines and the freight, the shed over the outer tracks, the yard
 *   office and the light masts (their lamps and the buffer stops' lamps marked to glow after dark);
 * - `sleepers`, on the sleepers' texture;
 * - where the West Coast Express's own laid-up sets stand (for its instanced locomotives and coaches).
 */
import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Vector3 } from "three";

import { ribbon } from "./Guideway";
import { lit } from "./pavilion";
import { guideAt, wceAt, YARD, YARD_LADDER, YARD_TRACKS, yardInner, yardPoint, yardTrackSpan } from "./railYard";
import { paint } from "./shapes";
import { groundAt, surfaceAt } from "./terrain";
import { wceBedAt } from "./wce";
import { type Frame, UP } from "./track";

const GRAVEL = 0x5c5850;
const SEAWALL = 0xa7a29a;
const BALLAST = 0x3a3f46;
const RAIL = 0x7a6250;
const WHITE = 0xeef0f2;
const DARK = 0x1c2430;
const ROOF = 0x9aa0a6;
const BOGIE = 0x22252a;

/** The yard's top at s: the highest ground across it (true or as drawn), smoothed along it. */
let tops: number[] | null = null;
export function yardTop(s: number): number {
  if (!tops) {
    const raw: number[] = [];
    for (let q = YARD.s0 - 4; q <= YARD.s1 + 4; q += 2) {
      let m = -Infinity;
      const [ix, iz] = yardInner(q);
      const [ox, oz] = yardPoint(q, YARD.l1);
      for (let k = 0; k <= 12; k++) {
        const x = ix + ((ox - ix) * k) / 12;
        const z = iz + ((oz - iz) * k) / 12;
        m = Math.max(m, groundAt(x, z), surfaceAt(x, z, 2));
      }
      raw.push(m);
    }
    tops = raw.map((_, i) => {
      let sum = 0;
      let n = 0;
      let peak = -Infinity;
      for (let j = Math.max(0, i - 5); j <= Math.min(raw.length - 1, i + 5); j++) {
        sum += raw[j];
        n++;
        if (Math.abs(j - i) <= 1) peak = Math.max(peak, raw[j]);
      }
      return Math.max(sum / n, peak) + 0.15;
    });
  }
  const f = Math.min(tops.length - 1, Math.max(0, (s - (YARD.s0 - 4)) / 2));
  const i = Math.floor(f);
  const u = f - i;
  return tops[i] * (1 - u) + tops[Math.min(tops.length - 1, i + 1)] * u;
}

/** A frame on the yard: at (s, l), on its top, r pointing north (lateral +l), t along the guide. */
function frameAt(s: number, l: number, out?: Frame): Frame {
  const p = guideAt(s);
  const [x, z] = yardPoint(s, l);
  const f = out ?? { p: new Vector3(), t: new Vector3(), r: new Vector3() };
  f.p.set(x, yardTop(s), z);
  f.t.set(p.tx, 0, p.tz);
  f.r.set(p.nx, 0, p.nz);
  return f;
}
const framesAlong = (s0: number, s1: number, l: number, step: number): Frame[] => {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  return Array.from({ length: n + 1 }, (_, i) => frameAt(s0 + ((s1 - s0) * i) / n, l));
};

/** A box `along` long in the line's direction at (s, l), its foot `y` above the yard's top, painted (and lit). */
function box(out: BufferGeometry[], w: number, h: number, along: number, s: number, l: number, y: number, hex: number, glow = 0): void {
  const f = frameAt(s, l);
  const yaw = Math.atan2(f.t.x, f.t.z);
  const g = paint(new BoxGeometry(w, h, along).rotateY(yaw).translate(f.p.x, f.p.y + y + h / 2, f.p.z), hex);
  out.push(glow ? lit(g, glow) : g);
}

/** One car of a line's train, centred at s on track l: white, its line's stripe, a band of dark windows, a grey roof. */
function railCar(out: BufferGeometry[], s: number, l: number, len: number, stripe: number, cab: number): void {
  const y = 0.36;
  box(out, 2.5, 2.2, len, s, l, y + 0.45, WHITE);
  box(out, 2.52, 0.28, len + 0.02, s, l, y + 0.95, stripe);
  box(out, 2.54, 0.6, len - 0.9, s, l, y + 1.55, DARK);
  box(out, 2.2, 0.22, len - 0.4, s, l, y + 2.65, ROOF);
  for (const d of [-len / 2 + 1.4, len / 2 - 1.4]) box(out, 2.0, 0.5, 1.6, s + d, l, y, BOGIE);
  // a cab's dark windscreen at a train's end
  if (cab) box(out, 2.2, 0.8, 0.12, s + (cab * len) / 2, l, y + 1.4, DARK);
}

/** A train of n cars along track l from its head at s (cars running back toward smaller s). */
function train(out: BufferGeometry[], head: number, l: number, n: number, len: number, stripe: number): void {
  for (let k = 0; k < n; k++) railCar(out, head - len / 2 - k * (len + 0.3), l, len, stripe, k === 0 ? 1 : k === n - 1 ? -1 : 0);
}

/** Freight: a locomotive in red, then box cars, tank cars and flats with containers. */
function freight(out: BufferGeometry[], head: number, l: number): void {
  const y = 0.36;
  let s = head;
  box(out, 2.6, 2.6, 8.4, s - 4.2, l, y + 0.5, 0xb3261e);
  box(out, 2.62, 0.3, 8.42, s - 4.2, l, y + 1.4, 0xf2f0ea);
  box(out, 2.2, 1.0, 2.0, s - 1.4, l, y + 3.1, 0xb3261e);
  box(out, 2.24, 0.5, 1.2, s - 1.0, l, y + 3.3, DARK);
  s -= 8.7;
  const kinds = ["box", "tank", "flat", "box", "flat", "tank"] as const;
  const boxes = [0x8b3a2a, 0x2f5d8a, 0x6b4e2e];
  const cont = [0x1f6fb2, 0xc0392b, 0x2e8b57, 0xe0b020, 0xeef0f2, 0x5b2a86];
  kinds.forEach((k, i) => {
    const c = s - 4.2;
    box(out, 2.2, 0.35, 8.2, c, l, y + 0.45, BOGIE);
    if (k === "box") {
      box(out, 2.6, 2.6, 8.0, c, l, y + 0.8, boxes[i % boxes.length]);
      box(out, 2.64, 2.0, 1.6, c, l, y + 1.0, 0x4a4f57);
    } else if (k === "tank") {
      const f = frameAt(c, l);
      const yaw = Math.atan2(f.t.x, f.t.z);
      out.push(paint(new CylinderGeometry(1.25, 1.25, 7.6, 10).rotateX(Math.PI / 2).rotateY(yaw).translate(f.p.x, f.p.y + y + 2.1, f.p.z), i % 2 ? 0x1d1f22 : 0xd9dbdd));
    } else {
      box(out, 2.5, 2.4, 3.8, c - 2, l, y + 0.8, cont[(i * 2) % cont.length]);
      box(out, 2.5, 2.4, 3.8, c + 2, l, y + 0.8, cont[(i * 2 + 1) % cont.length]);
    }
    s -= 8.6;
  });
}

/** A buffer stop at s on track l, facing toward larger s: a concrete block, a red and white beam on posts, a red lamp. */
function bufferStop(out: BufferGeometry[], s: number, l: number): void {
  box(out, 3.6, 0.9, 1.4, s - 1.2, l, 0, 0xb9b4aa);
  for (const d of [-0.72, 0.72]) box(out, 0.16, 1.3, 0.16, s, l + d, 0.1, 0x3a3f46);
  for (let k = 0; k < 4; k++) box(out, 0.55, 0.36, 0.3, s, l - 0.825 + k * 0.55, 0.9, k % 2 ? WHITE : 0xc0392b);
  box(out, 0.22, 0.22, 0.22, s, l, 1.3, 0xe5302a, 1);
}

export type YardParts = {
  painted: BufferGeometry[];
  sleepers: BufferGeometry[];
  /** The West Coast Express's laid-up sets: the s of each one's head, on the yard's first track. */
  wceHeads: number[];
};

export function buildYard(lowEnd: boolean): YardParts {
  const painted: BufferGeometry[] = [];
  const sleepers: BufferGeometry[] = [];
  const step = lowEnd ? 4 : 2;
  // the fill: a gravel top from the line's bed out to its seawall (a strip between the two edges), the seawall down
  // into the water, its ends closed
  const deck = framesAlong(YARD.s0, YARD.s1, 0, step);
  {
    const pos: number[] = [];
    const edge = (s: number): [number, number, number, number, number] => {
      const [ix, iz] = yardInner(s);
      const [ox, oz] = yardPoint(s, YARD.l1);
      return [ix, iz, ox, oz, yardTop(s)];
    };
    const n = Math.ceil((YARD.s1 - YARD.s0) / step);
    for (let i = 0; i < n; i++) {
      const [ax, az, bx, bz, ya] = edge(YARD.s0 + ((YARD.s1 - YARD.s0) * i) / n);
      const [cx, cz, dx, dz, yc] = edge(YARD.s0 + ((YARD.s1 - YARD.s0) * (i + 1)) / n);
      pos.push(ax, ya, az, bx, ya, bz, cx, yc, cz, cx, yc, cz, bx, ya, bz, dx, yc, dz);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    painted.push(paint(g, GRAVEL));
    // the ends: from the line's bed out to the seawall, down into the water
    for (const s of [YARD.s0, YARD.s1]) {
      const [ix, iz, ox, oz, y] = edge(s);
      const w = Math.hypot(ox - ix, oz - iz);
      const yaw = Math.atan2(ox - ix, oz - iz);
      painted.push(paint(new BoxGeometry(0.4, 6, w).rotateY(yaw).translate((ix + ox) / 2, y - 3, (iz + oz) / 2), SEAWALL));
    }
  }
  painted.push(paint(ribbon([[YARD.l1 + 0.4, -6], [YARD.l1 + 0.4, -0.25], [YARD.l1, 0]], deck, false), SEAWALL));
  // the tracks: ballast, sleepers and two rails, a buffer stop at each one's west end
  const lay = (fr: Frame[]) => {
    painted.push(paint(ribbon([[1.8, 0], [1.3, 0.2], [-1.3, 0.2], [-1.8, 0]], fr, false), BALLAST));
    sleepers.push(ribbon([[1.3, 0.21], [-1.3, 0.21]], fr, false, 0.65));
    for (const x of [-0.72, 0.72]) painted.push(paint(ribbon([[x + 0.07, 0.21], [x - 0.07, 0.21], [x - 0.07, 0.36], [x + 0.07, 0.36]], fr, true), RAIL));
  };
  YARD_TRACKS.forEach((l, k) => {
    const [a, b] = yardTrackSpan(k);
    lay(framesAlong(a, b, l, step));
    bufferStop(painted, a, l);
  });
  // the ladder: straight from the line's north track out across the yard's tracks to the outermost
  {
    const L = YARD_TRACKS[YARD_TRACKS.length - 1];
    const a = frameAt(YARD_LADDER.sMain, 0);
    const m = wceAt(YARD_LADDER.sMain);
    a.p.set(m.x + m.nx * YARD_LADDER.l0, wceBedAt(YARD_LADDER.sMain, lowEnd), m.z + m.nz * YARD_LADDER.l0);
    const b = frameAt(YARD_LADDER.sYard, L);
    const dir = b.p.clone().sub(a.p).setY(0).normalize();
    const r = new Vector3().crossVectors(dir, UP).normalize();
    const n = Math.max(2, Math.ceil(a.p.distanceTo(b.p) / step));
    lay(Array.from({ length: n + 1 }, (_, i) => ({ p: a.p.clone().lerp(b.p, i / n), t: dir.clone(), r: r.clone() })));
  }
  // the trains laid up: the West Coast Express's (instanced, outside this), the Expo's, the Millennium's, the Canada
  // Line's and freight; under the shed, cars in for maintenance
  const span = (k: number) => yardTrackSpan(k);
  const EXPO = 0xa78bfa;
  const MILL = 0xfacc15;
  const CANADA = 0x1fb5c9;
  train(painted, span(1)[0] + 42, YARD_TRACKS[1], 4, 9.2, EXPO);
  train(painted, span(1)[0] + 84, YARD_TRACKS[1], 4, 9.2, EXPO);
  train(painted, span(2)[0] + 40, YARD_TRACKS[2], 4, 9.0, MILL);
  train(painted, span(2)[0] + 86, YARD_TRACKS[2], 4, 9.0, MILL);
  train(painted, span(3)[0] + 24, YARD_TRACKS[3], 2, 10, CANADA);
  train(painted, span(3)[0] + 52, YARD_TRACKS[3], 2, 10, CANADA);
  train(painted, span(3)[0] + 80, YARD_TRACKS[3], 2, 10, CANADA);
  freight(painted, span(4)[0] + 62, YARD_TRACKS[4]);
  train(painted, 158, YARD_TRACKS[5], 2, 9.2, EXPO);
  train(painted, 135, YARD_TRACKS[5], 1, 9.0, MILL);
  // the shed over the two outer tracks: a wall on the seaward side, columns on the inner, a roof with a glazed
  // lantern along it, its ends open
  const SH = { s0: 126, s1: 166, l0: 23.3, l1: 34.4, h: 7.2 };
  for (let s = SH.s0; s < SH.s1 - 0.1; s += 4) {
    const c = s + 2;
    // each piece as long as the segment is at its outer edge (the yard bends, so the outer side is the longer)
    const len = (l: number) => {
      const [ax, az] = yardPoint(s, l);
      const [bx, bz] = yardPoint(s + 4, l);
      return Math.hypot(bx - ax, bz - az) + 0.06;
    };
    const mid = (SH.l0 + SH.l1) / 2;
    box(painted, 0.4, SH.h, len(SH.l1), c, SH.l1, 0, 0xc9c4ba);
    box(painted, 0.44, 0.9, len(SH.l1), c, SH.l1, 4.6, 0x5d7f99);
    box(painted, SH.l1 - SH.l0 + 1.2, 0.35, len(SH.l1 + 0.6), c, mid, SH.h, ROOF);
    box(painted, 3.2, 1.0, len(mid + 1.6), c, mid, SH.h + 0.35, 0x8fb2c8);
    box(painted, 3.6, 0.15, len(mid + 1.8), c, mid, SH.h + 1.35, ROOF);
    box(painted, 0.45, SH.h, 0.45, s, SH.l0, 0, 0x7d8288);
  }
  box(painted, 0.45, SH.h, 0.45, SH.s1, SH.l0, 0, 0x7d8288);
  // the yard office at the west end, two storeys, its windows lit after dark
  box(painted, 6, 6, 8, YARD.s0 + 6, 31, 0, 0xd9d2c4);
  box(painted, 6.04, 0.8, 7.4, YARD.s0 + 6, 31, 1.4, 0x33414f, 0.6);
  box(painted, 6.04, 0.8, 7.4, YARD.s0 + 6, 31, 4.0, 0x33414f, 0.6);
  box(painted, 6.6, 0.3, 8.6, YARD.s0 + 6, 31, 6, ROOF);
  // the light masts between the tracks, a bar of lamps on each
  for (const s of [80, 104, 128, 152, 176]) {
    const l = (YARD_TRACKS[2] + YARD_TRACKS[3]) / 2;
    box(painted, 0.3, 16, 0.3, s, l, 0, 0x8a8f96);
    box(painted, 3.2, 0.25, 0.5, s, l, 16, 0x3a3f46);
    for (const d of [-1.2, -0.4, 0.4, 1.2]) box(painted, 0.5, 0.3, 0.6, s, l + d, 15.7, 0xfff1d0, 1.2);
  }
  return { painted, sleepers, wceHeads: [span(0)[0] + 50, span(0)[0] + 104] };
}
