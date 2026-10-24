/**
 * The rail yard on the waterfront east of Waterfront station, where the CPR's yard and the port stand: fill laid out
 * into the inlet north of the West Coast Express's line (wce.ts), its tracks parallel to the line, a ladder of
 * switches joining them to it at the east end, buffer stops at the west. The trains of every line lie up there (the
 * West Coast Express's, the Expo's, the Millennium's, the Canada Line's and freight), a shed over the outer tracks.
 * The city keeps its lots, trees and boats off it. A drone port on the shed's roof (its docks: droneDocks). Pure
 * layout: WestCoastExpress.tsx builds it.
 */
import { groundAt, surfaceAt } from "./terrain";
import { WCE_PTS, WCE_S } from "./wce";

/**
 * The yard along the line (its arc length s); its fill from the line's bed (l0 north of the line) out to l1 north of
 * its guide (below), along which its tracks run.
 */
export const YARD = { s0: 58, s1: 198, l0: 3.6, l1: 35 };
/** The yard's tracks' centres (lateral, north of the line). */
export const YARD_TRACKS = [7.5, 12, 16.5, 21, 25.5, 30];
/** The ladder: from the line's north track (2.1 north of the line) at sMain to the outermost yard track at sYard. */
export const YARD_LADDER = { sMain: 194, sYard: 160, l0: 2.1 };
/** Where each yard track runs: from its buffer stop (west) to where it meets the ladder (east). */
export const yardTrackSpan = (k: number): [number, number] => {
  const l = YARD_TRACKS[k];
  const L = YARD_TRACKS[YARD_TRACKS.length - 1];
  const s1 = YARD_LADDER.sMain - ((l - YARD_LADDER.l0) / (L - YARD_LADDER.l0)) * (YARD_LADDER.sMain - YARD_LADDER.sYard);
  return [YARD.s0 + 5 + k * 1.5, s1];
};

/** The line's point at arc length s, its heading and its north normal. */
export function wceAt(s: number): { x: number; z: number; tx: number; tz: number; nx: number; nz: number } {
  let i = 1;
  while (i < WCE_S.length - 1 && WCE_S[i] < s) i++;
  const u = Math.min(1, Math.max(0, (s - WCE_S[i - 1]) / (WCE_S[i] - WCE_S[i - 1] || 1)));
  const [ax, az] = WCE_PTS[i - 1];
  const [bx, bz] = WCE_PTS[i];
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const tx = (bx - ax) / L;
  const tz = (bz - az) / L;
  // the normal toward the inlet: the one pointing north
  let nx = tz;
  let nz = -tx;
  if (nz > 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, tx, tz, nx, nz };
}

/**
 * The yard's guide: the line smoothed broadly (its small bends would fold the outer tracks, 30 out from it) and moved
 * north just enough that the line never crosses it; sampled every 2 along the line's s. Each sample: point, heading
 * and north normal.
 */
const GUIDE: { s: number; x: number; z: number; tx: number; tz: number; nx: number; nz: number }[] = (() => {
  if (WCE_PTS.length < 4) return [];
  const raw: { s: number; x: number; z: number }[] = [];
  for (let s = YARD.s0 - 40; s <= YARD.s1 + 40; s += 2) {
    const p = wceAt(s);
    raw.push({ s, x: p.x, z: p.z });
  }
  const W = 14;
  const smooth = raw.map((_, i) => {
    let x = 0;
    let z = 0;
    let n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(raw.length - 1, i + W); j++) {
      x += raw[j].x;
      z += raw[j].z;
      n++;
    }
    return { s: raw[i].s, x: x / n, z: z / n };
  });
  const out = smooth.map((p, i) => {
    const a = smooth[Math.max(0, i - 1)];
    const b = smooth[Math.min(smooth.length - 1, i + 1)];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / L;
    const tz = (b.z - a.z) / L;
    let nx = tz;
    let nz = -tx;
    if (nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    return { s: p.s, x: p.x, z: p.z, tx, tz, nx, nz };
  });
  // how far north of the guide the line strays over the yard: the guide moves north by that much
  let shift = 0;
  for (const g of out) {
    if (g.s < YARD.s0 - 4 || g.s > YARD.s1 + 4) continue;
    const p = wceAt(g.s);
    shift = Math.max(shift, (p.x - g.x) * g.nx + (p.z - g.z) * g.nz);
  }
  return out.map((g) => ({ ...g, x: g.x + g.nx * shift, z: g.z + g.nz * shift }));
})();

/** The guide at s: its point, heading and north normal. */
export function guideAt(s: number): { x: number; z: number; tx: number; tz: number; nx: number; nz: number } {
  const f = Math.min(GUIDE.length - 1, Math.max(0, (s - GUIDE[0].s) / 2));
  const i = Math.min(GUIDE.length - 2, Math.floor(f));
  const u = f - i;
  const a = GUIDE[i];
  const b = GUIDE[i + 1];
  const mix = (p: number, q: number) => p + (q - p) * u;
  const tx = mix(a.tx, b.tx);
  const tz = mix(a.tz, b.tz);
  const nx = mix(a.nx, b.nx);
  const nz = mix(a.nz, b.nz);
  const lt = Math.hypot(tx, tz) || 1;
  const ln = Math.hypot(nx, nz) || 1;
  return { x: mix(a.x, b.x), z: mix(a.z, b.z), tx: tx / lt, tz: tz / lt, nx: nx / ln, nz: nz / ln };
}

/** A point of the yard: s along the line, l north of the guide (the yard's tracks run along it). */
export function yardPoint(s: number, l: number): [number, number] {
  const g = guideAt(s);
  return [g.x + g.nx * l, g.z + g.nz * l];
}

/** The yard's inner edge at s: the line's bed's north edge. */
export function yardInner(s: number): [number, number] {
  const p = wceAt(s);
  return [p.x + p.nx * YARD.l0, p.z + p.nz * YARD.l0];
}

/** The yard's outline, with a margin, for the city to keep off. */
const OUTLINE: [number, number][] = (() => {
  if (WCE_PTS.length < 4) return [];
  const pad = 1.5;
  const out: [number, number][] = [];
  for (let s = YARD.s0 - pad; s <= YARD.s1 + pad; s += 4) {
    const p = wceAt(s);
    out.push([p.x + p.nx * (YARD.l0 - 0.5), p.z + p.nz * (YARD.l0 - 0.5)]);
  }
  for (let s = YARD.s1 + pad; s >= YARD.s0 - pad; s -= 4) out.push(yardPoint(s, YARD.l1 + pad));
  return out;
})();
const BOX = OUTLINE.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [Infinity, -Infinity, Infinity, -Infinity]);

/** On the yard (its fill, with a margin). */
export function inYard(x: number, z: number): boolean {
  if (x < BOX[0] || x > BOX[1] || z < BOX[2] || z > BOX[3]) return false;
  let inside = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, zi] = OUTLINE[i];
    const [xj, zj] = OUTLINE[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** The yard's extent (x0, x1, z0, z1), for the boats to keep clear of. */
export const YARD_BOX = BOX as [number, number, number, number];

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

/** The shed over the yard's two outer tracks: along the line (s), across it (l, its seaward wall at l1), its height. */
export const YARD_SHED = { s0: 126, s1: 166, l0: 23.3, l1: 34.4, h: 7.2 };
/** The shed's roof over the yard's top; its drone docks' line on the roof seaward of the lantern (l), their places along it. */
export const SHED_ROOF = YARD_SHED.h + 0.35;
export const DOCK_L = 33;
export const DOCK_S = Array.from({ length: 12 }, (_, k) => 127.3 + k * 3.4);

/** The rail yard's drone port: its docks' tops, in a row along the shed's roof (the delivery drones' home, droneways.ts). */
export function droneDocks(): { x: number; y: number; z: number }[] {
  return DOCK_S.map((s) => {
    const [x, z] = yardPoint(s, DOCK_L);
    return { x, y: yardTop(s) + SHED_ROOF + 0.12, z };
  });
}
