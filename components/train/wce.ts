/**
 * The West Coast Express's line along the south shore of Burrard Inlet (railData.ts WCE, from OpenStreetMap), as the
 * ride draws it: moved north off the streets beside it, on the strip between them and the water, from its platform by
 * Waterfront out past the port (under the Expo's viaduct there, which leaves out any column on it). Pure; the roads,
 * lots and trees keep off it.
 */
import { clearHeights } from "./bedLift";
import { WCE } from "./railData";
import { sdfAt } from "./terrain";

/** Where the drawn line runs: moved this far north of the map's, and never nearer the water than SHORE_IN. */
const SHIFT = 9;
const SHORE_IN = 5;
/** The track bed's half-width (two tracks). */
export const WCE_HALF = 4.2;
/** The platform: its first stretch, from the line's west end. */
export const WCE_PLATFORM: [number, number] = [6, 42];

export const WCE_PTS: [number, number][] = (() => {
  const src = WCE.filter(([x]) => x > 24 && x < 430).map(([x, z]): [number, number] => [x, z]);
  if (src.length < 4) return [];
  // moved bodily north, parallel to itself, clear of the streets beside it (Powell runs within a few units), and back
  // inland wherever that would take it within SHORE_IN of the water
  const moved = src.map(([x, z], i): [number, number] => {
    const [ax, az] = src[Math.max(0, i - 2)];
    const [bx, bz] = src[Math.min(src.length - 1, i + 2)];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    let nx = (bz - az) / L;
    let nz = -(bx - ax) / L;
    if (nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    let off = SHIFT;
    while (off > 0 && sdfAt(x + nx * off, z + nz * off) < SHORE_IN) off -= 0.5;
    const px = x + nx * off;
    const pz = z + nz * off;
    return [px, pz];
  });
  // smoothed, then every 2 units (it runs under the Expo's viaduct by Waterfront, which leaves out any column on it)
  const smooth = (q: [number, number][]) => q.map((p, i): [number, number] => (i === 0 || i === q.length - 1 ? p : [(q[i - 1][0] + 2 * p[0] + q[i + 1][0]) / 4, (q[i - 1][1] + 2 * p[1] + q[i + 1][1]) / 4]));
  let pts = moved;
  for (let pass = 0; pass < 8; pass++) pts = smooth(pts);
  const out: [number, number][] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    let t = 2 - carry;
    while (t <= L) {
      out.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]);
      t += 2;
    }
    carry = L - (t - 2);
  }
  return out;
})();

/** Cumulative length along the drawn line at each point. */
export const WCE_S: number[] = WCE_PTS.reduce<number[]>((acc, p, i) => {
  acc.push(i ? acc[i - 1] + Math.hypot(p[0] - WCE_PTS[i - 1][0], p[1] - WCE_PTS[i - 1][1]) : 0);
  return acc;
}, []);
export const WCE_LEN = WCE_S[WCE_S.length - 1] ?? 0;

const cells = new Map<number, number[]>();
WCE_PTS.forEach(([x, z], i) => {
  const k = Math.floor(x / 16) * 100000 + Math.floor(z / 16);
  const c = cells.get(k);
  if (c) c.push(i);
  else cells.set(k, [i]);
});
/** Distance to the line's centre (99 where none is near). */
export function wceDist(x: number, z: number): number {
  let best = 99;
  const ci = Math.floor(x / 16);
  const cj = Math.floor(z / 16);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (const i of cells.get((ci + di) * 100000 + (cj + dj)) ?? []) best = Math.min(best, Math.hypot(WCE_PTS[i][0] - x, WCE_PTS[i][1] - z));
    }
  }
  return best;
}
/** The bed's top at each of the line's points, clear of the ground as drawn across it (bedLift.ts), by device. */
const beds = new Map<boolean, number[]>();
export function wceBed(lowEnd: boolean): number[] {
  let b = beds.get(lowEnd);
  if (!b) beds.set(lowEnd, (b = clearHeights(WCE_PTS, WCE_HALF, 0.15, lowEnd)));
  return b;
}
/** The bed's top at distance s along the line. */
export function wceBedAt(s: number, lowEnd: boolean): number {
  const b = wceBed(lowEnd);
  let i = 1;
  while (i < WCE_S.length - 1 && WCE_S[i] < s) i++;
  const u = Math.min(1, Math.max(0, (s - WCE_S[i - 1]) / (WCE_S[i] - WCE_S[i - 1] || 1)));
  return b[i - 1] + (b[i] - b[i - 1]) * u;
}

/** On the line's bed or its platform, with a pad. */
export const nearWce = (x: number, z: number, pad = 0): boolean => wceDist(x, z) < WCE_HALF + 4 + pad;
