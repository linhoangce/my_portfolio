/**
 * Deck heights along an alignment from its structure (OSM's viaduct, grade, cutting and tunnel runs): on a viaduct the
 * low-passed ground plus the deck height, never closer than the clearance to the ground beside the track; at grade a
 * ballast's depth over the smoothed ground; in a cutting or a covered trench below it. Raise-only grade limiting (a
 * little steeper on the ramps between structures), level platforms and vertical curves. Pure: reads the coast-clamped
 * DEM only, before any pad or carve exists.
 */
import { BALLAST, CLEAR_DECK, CUT_EXPO, DECK, GRADE_CAP, GRADE_CAP_RAMP, PLATFORM_FLAT } from "./constants";
import type { RailClass } from "./railData";
import { demAt } from "./terrain";

/**
 * A line's structure heights: deck over the ground on a viaduct, ballast at grade, depth in a trench, clearance floor,
 * and how far before and after a stretch at grade or in a cutting its viaduct starts to come down.
 */
export type Structure = { deck: number; ballast: number; cut: number; clear: number; taper: number };
export const EXPO_STRUCTURE: Structure = { deck: DECK, ballast: BALLAST, cut: CUT_EXPO, clear: CLEAR_DECK, taper: 160 };

export type Profile = {
  /** Deck height per control point. */
  y: number[];
  /** Cumulative horizontal distance per control point. */
  s: number[];
  /** How far the track has come down per control point: 0 on a viaduct, 1 at grade, in a cutting or a trench. */
  low: number[];
  /** Of that, the trench's share (cutting or tunnel), where the ground is dug down to the track. */
  cut: number[];
  /** The structure each control point is in. */
  mode: RailClass[];
  /** Mean deck height above the original ground where the track runs low (reported by the debug handle). */
  cutOffset: number;
  /** Ground beside the track and the clearance floor per control point (for the debug handle). */
  ground: number[];
  lower: number[];
};

/** `cls` holds one structure class per point. */
export function solveProfile(pts: [number, number][], stationIdx: number[], cls: string, st: Structure = EXPO_STRUCTURE): Profile {
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
  // where the track runs low the ground is shaped to it, so only the centreline counts there
  const gc = pts.map(([x, z]) => demAt(x, z));
  const mode = [...cls] as RailClass[];
  // each structure's share, eased over about ±40 units so the deck ramps between them
  const share = (want: (c: RailClass) => boolean) => {
    const sig = 20 / step;
    const span = Math.ceil(sig * 2.5);
    return s.map((_, i) => {
      let acc = 0;
      let w = 0;
      for (let k = -span; k <= span; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        const ww = Math.exp(-(k * k) / (2 * sig * sig));
        acc += (want(mode[j]) ? 1 : 0) * ww;
        w += ww;
      }
      return acc / w;
    });
  };
  const low = share((c) => c !== "V");
  const cut = share((c) => c === "C" || c === "T");
  // a viaduct settles toward the ground as it nears a stretch where the line comes down (as the real approach viaducts
  // do), so the ramp between them stays within the grade cap: full height st.taper away, a low 3 units at the stretch
  const near = s.map((si) => {
    let m = 0;
    for (let j = 0; j < n; j++) if (mode[j] !== "V") m = Math.max(m, 1 - Math.abs(s[j] - si) / st.taper);
    return m * m * (3 - 2 * m);
  });
  const deck = near.map((v) => st.deck - (st.deck - 3) * v);
  const clear = near.map((v) => st.clear - (st.clear - 1.5) * v);
  const ramp = near.map((v) => v > 0.01);

  // low-passed ground (σ ≈ 60 units under a viaduct, 20 where the track comes down to it), and the clearance floor
  const lowPassBy = (src: number[], sigma: number) => {
    const sig = sigma / step;
    const span = Math.ceil(sig * 3);
    return src.map((_, i) => {
      let acc = 0;
      let w = 0;
      for (let k = -span; k <= span; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        const ww = Math.exp(-(k * k) / (2 * sig * sig));
        acc += src[j] * ww;
        w += ww;
      }
      return acc / w;
    });
  };
  const lowPass = (src: number[]) => lowPassBy(src, 60);
  const envelope = (src: number[]) =>
    src.map((_, i) => {
      let m = -1e9;
      const r = Math.ceil(10 / step);
      for (let k = -r; k <= r; k++) m = Math.max(m, src[Math.min(n - 1, Math.max(0, i + k))]);
      return m;
    });
  const lp = lowPass(g);
  const lpc = lowPassBy(gc, 20);
  const env = envelope(g);
  const lower = env.map((e, i) => (e + clear[i]) * (1 - low[i]) + (lpc[i] - st.cut - 1) * low[i]);
  // the trench's floor sits st.cut under the ground; at grade the track rides a ballast's depth over it
  let y = lp.map((v, i) => Math.max((v + deck[i]) * (1 - low[i]) + (lpc[i] + st.ballast) * (low[i] - cut[i]) + (lpc[i] - st.cut) * cut[i], lower[i]));

  const limit = () => {
    for (let i = 1; i < n; i++) y[i] = Math.max(y[i], y[i - 1] - (ramp[i] ? GRADE_CAP_RAMP : GRADE_CAP) * (s[i] - s[i - 1]));
    for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - (ramp[i] ? GRADE_CAP_RAMP : GRADE_CAP) * (s[i + 1] - s[i]));
  };
  // a platform levels at its highest point: up on a viaduct it must clear the ground everywhere, and down at grade or
  // in a cutting the station's pad shapes the ground to it
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
  // vertical curves: the grade may change by at most 0.02 per 10 units, so sags are raised and crests lowered (never
  // below the clearance floor) until it does; the limiter leaves sharp V-shaped sags at the cap otherwise, which the
  // curve through the points overshoots. Platform windows (with their 6-unit level run-outs) stay as flatten() set them.
  const fixed = new Array<boolean>(n).fill(false);
  for (const si of stationIdx) for (let i = 0; i < n; i++) if (Math.abs(s[i] - s[si]) <= PLATFORM_FLAT + 6) fixed[i] = true;
  const round = () => {
    for (let sweep = 0; sweep < 800; sweep++) {
      let moved = 0;
      for (let i = 1; i < n - 1; i++) {
        const ds = 0.5 * (s[i + 1] - s[i - 1]);
        const tol = 0.5 * 0.002 * ds * ds;
        if (fixed[i]) {
          // at a platform end the level run cannot move: bend the free neighbour instead, so the vertical curve
          // starts outside the platform rather than leaving a kink at its end
          for (const [j, k] of [
            [i - 1, i + 1],
            [i + 1, i - 1],
          ]) {
            if (fixed[j] || !fixed[k]) continue;
            const lo = Math.max(lower[j], 2 * y[i] - y[k] - 2 * tol);
            const hi = 2 * y[i] - y[k] + 2 * tol;
            const v = Math.min(Math.max(y[j], lo), Math.max(hi, lo));
            moved = Math.max(moved, Math.abs(v - y[j]));
            y[j] = v;
          }
          continue;
        }
        const avg = 0.5 * (y[i - 1] + y[i + 1]);
        let v = y[i];
        if (v < avg - tol) v = avg - tol;
        else if (v > avg + tol) v = avg + tol;
        v = Math.max(v, lower[i]);
        moved = Math.max(moved, Math.abs(v - y[i]));
        y[i] = v;
      }
      if (moved < 1e-4) break;
    }
  };
  // level platforms, the grade cap and the vertical curves all hold once this settles
  for (let k = 0; k < 16; k++) {
    flatten();
    limit();
    round();
  }
  flatten();
  limit();

  let off = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) if (low[i] > 0.98) { off += y[i] - gc[i]; cnt++; }
  return { y, s, low, cut, mode, cutOffset: cnt ? off / cnt : 0, ground: g, lower };
}
