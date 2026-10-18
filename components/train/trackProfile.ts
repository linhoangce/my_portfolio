/**
 * Deck heights along the alignment: the low-passed ground plus the deck height, never closer than CLEAR_DECK to the
 * ground beside the track, raise-only grade limiting, level platforms and the Grandview Cut where the deck rides low.
 * Pure: reads the coast-clamped DEM only, before any pad or carve exists.
 */
import { CLEAR_DECK, CUT, DECK, GRADE_CAP, GRADE_CAP_RAMP, PLATFORM_FLAT } from "./constants";
import { demAt } from "./terrain";

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type Profile = {
  /** Deck height per control point. */
  y: number[];
  /** Cumulative horizontal distance per control point. */
  s: number[];
  /** Grandview Cut weight per control point (0 outside, 1 in the trench). */
  cut: number[];
  /** Deck height above the original ground through the held part of the cut (reported by the debug handle). */
  cutOffset: number;
  /** Ground beside the track and the clearance floor per control point (for the debug handle). */
  ground: number[];
  lower: number[];
};

export function solveProfile(pts: [number, number][], stationIdx: number[], cutFrom: number, cutTo: number): Profile {
  const n = pts.length;
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const step = s[n - 1] / (n - 1);

  // ground under and beside the track
  const g = pts.map(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const L = Math.hypot(tx, tz) || 1;
    const rx = -tz / L;
    const rz = tx / L;
    return Math.max(demAt(x, z), demAt(x + rx * 8, z + rz * 8), demAt(x - rx * 8, z - rz * 8));
  });
  const cut = s.map((si) => (cutTo > cutFrom ? sstep(cutFrom, cutFrom + CUT.rampIn, si) * (1 - sstep(cutTo - CUT.rampOut, cutTo, si)) : 0));
  const ramp = s.map((si) => cutTo > cutFrom && si > cutFrom - 10 && si < cutTo + 10);

  // low-passed ground (σ ≈ 60 units) plus the deck height, and the clearance floor
  const sig = 60 / step;
  const span = Math.ceil(sig * 3);
  const lp = g.map((_, i) => {
    let acc = 0;
    let w = 0;
    for (let k = -span; k <= span; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      const ww = Math.exp(-(k * k) / (2 * sig * sig));
      acc += g[j] * ww;
      w += ww;
    }
    return acc / w;
  });
  const env = g.map((_, i) => {
    let m = -1e9;
    const r = Math.ceil(10 / step);
    for (let k = -r; k <= r; k++) m = Math.max(m, g[Math.min(n - 1, Math.max(0, i + k))]);
    return m;
  });
  const lower = env.map((e, i) => e + CLEAR_DECK + (1.5 - CLEAR_DECK) * cut[i]);
  let y = lp.map((v, i) => Math.max(v + DECK + (CUT.offset - DECK) * cut[i], lower[i]));

  const limit = () => {
    for (let i = 1; i < n; i++) y[i] = Math.max(y[i], y[i - 1] - (ramp[i] ? GRADE_CAP_RAMP : GRADE_CAP) * (s[i] - s[i - 1]));
    for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - (ramp[i] ? GRADE_CAP_RAMP : GRADE_CAP) * (s[i + 1] - s[i]));
  };
  const flatten = () => {
    for (const si of stationIdx) {
      let m = -1e9;
      const idx: number[] = [];
      for (let i = 0; i < n; i++) if (Math.abs(s[i] - s[si]) <= PLATFORM_FLAT + 6) idx.push(i);
      for (const i of idx) m = Math.max(m, y[i]);
      for (const i of idx) y[i] = m;
    }
  };
  limit();
  for (let pass = 0; pass < 2; pass++) {
    y = y.map((v, i) => {
      const at = (k: number) => y[Math.min(n - 1, Math.max(0, i + k))];
      return (at(-2) + 2 * at(-1) + 3 * v + 2 * at(1) + at(2)) / 9;
    });
    for (let i = 0; i < n; i++) y[i] = Math.max(y[i], lower[i]);
  }
  // level platforms and the grade cap both hold once this settles (each step only raises)
  for (let k = 0; k < 4; k++) {
    flatten();
    limit();
  }

  let off = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) if (cut[i] > 0.98) { off += y[i] - g[i]; cnt++; }
  return { y, s, cut, cutOffset: cnt ? off / cnt : 0, ground: g, lower };
}
