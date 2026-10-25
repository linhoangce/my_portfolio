/**
 * Finding a way over the water for the boats (harbourTraffic.ts): a grid of how far each cell lies from the shore or
 * from anything standing in the water, the cheapest way across it that keeps a hull clear (A*, dearer near the shore
 * and the floats so the way keeps to mid-channel), pulled taut, its corners rounded into arcs a hull can turn on, and
 * sampled about a unit apart with the speed a hull can take at each point. Pure (no three.js, no DOM).
 */
import { sdfAt } from "./terrain";

export type XZ = [number, number];

/** A turned rectangle (half sizes along and across its yaw) or a disc: what stands in the water. */
export type Solid = { x: number; z: number; r: number } | { x: number; z: number; hw: number; hl: number; yaw: number };

/** Inside a solid, grown by `pad`. */
export function inSolid(o: Solid, x: number, z: number, pad = 0): boolean {
  const dx = x - o.x;
  const dz = z - o.z;
  if ("r" in o) return dx * dx + dz * dz < (o.r + pad) ** 2;
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  // along the yaw (sin, cos) and across it
  const along = dx * s + dz * c;
  const across = dx * c - dz * s;
  return Math.abs(along) < o.hl + pad && Math.abs(across) < o.hw + pad;
}

/** The 5×5 chamfer's steps (dx, dz) and their lengths in cells: within about 2% of the true distance. */
const CHAMFER: [number, number, number][] = [
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [2, 1, Math.sqrt(5)],
  [1, 2, Math.sqrt(5)],
  [-1, 2, Math.sqrt(5)],
  [-2, 1, Math.sqrt(5)],
];

/**
 * The water over a box, a cell every `step`: each cell's clearance, how far it lies from the shore (the water's own
 * distance field) or from the nearest solid (a chamfer distance over the cells), whichever is nearer; 0 on land or in
 * a solid. Outside the box counts as land.
 */
export class WaterGrid {
  readonly nx: number;
  readonly nz: number;
  readonly clear: Float32Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number,
    readonly step: number,
    solids: Solid[],
  ) {
    const nx = (this.nx = Math.ceil((x1 - x0) / step) + 1);
    const nz = (this.nz = Math.ceil((z1 - z0) / step) + 1);
    const n = nx * nz;
    const shore = new Float32Array(n);
    const dist = new Float32Array(n).fill(1e9);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step;
        const z = z0 + j * step;
        const k = j * nx + i;
        shore[k] = Math.max(0, -sdfAt(x, z));
        if (solids.some((o) => Math.abs(x - o.x) < 80 && Math.abs(z - o.z) < 80 && inSolid(o, x, z))) dist[k] = 0;
      }
    }
    // two passes of the chamfer, forward and back
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let d = dist[k];
        for (const [di, dj, w] of CHAMFER) {
          const a = i - di;
          const b = j - dj;
          if (a >= 0 && a < nx && b >= 0) d = Math.min(d, dist[b * nx + a] + w * step);
        }
        dist[k] = d;
      }
    }
    for (let j = nz - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        let d = dist[k];
        for (const [di, dj, w] of CHAMFER) {
          const a = i + di;
          const b = j + dj;
          if (a >= 0 && a < nx && b < nz) d = Math.min(d, dist[b * nx + a] + w * step);
        }
        dist[k] = d;
      }
    }
    this.clear = new Float32Array(n);
    for (let k = 0; k < n; k++) this.clear[k] = Math.min(shore[k], dist[k]);
  }

  /** The clearance at a point, between the cells round it (0 outside the box). */
  clearAt(x: number, z: number): number {
    const fx = (x - this.x0) / this.step;
    const fz = (z - this.z0) / this.step;
    if (fx < 0 || fz < 0 || fx > this.nx - 1.001 || fz > this.nz - 1.001) return 0;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * this.nx + i;
    const c = this.clear;
    return (c[k] * (1 - u) + c[k + 1] * u) * (1 - v) + (c[k + this.nx] * (1 - u) + c[k + this.nx + 1] * u) * v;
  }

  /** Whether the straight line from a to b keeps `r` clear all along. */
  sees(a: XZ, b: XZ, r: number): boolean {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / (this.step * 0.5)));
    for (let k = 0; k <= n; k++) if (this.clearAt(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n) < r) return false;
    return true;
  }

  private cellOf(p: XZ): number {
    const i = Math.round((p[0] - this.x0) / this.step);
    const j = Math.round((p[1] - this.z0) / this.step);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  /** The open cell (`r` clear) nearest p, ring by ring out to `reach` cells; -1 if none. */
  private openNear(p: XZ, r: number, reach = 8): number {
    const i0 = Math.round((p[0] - this.x0) / this.step);
    const j0 = Math.round((p[1] - this.z0) / this.step);
    for (let ring = 0; ring <= reach; ring++) {
      let best = -1;
      let bd = Infinity;
      for (let j = j0 - ring; j <= j0 + ring; j++) {
        for (let i = i0 - ring; i <= i0 + ring; i++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== ring || i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const k = j * this.nx + i;
          if (this.clear[k] < r) continue;
          const d = (i - i0) ** 2 + (j - j0) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /**
   * The cheapest way from a to b keeping `r` clear, as cell centres between the two points themselves: each step
   * costs its length, more where the clearance is under `pref` (up to four times as much at `r`), so the way keeps
   * off the shore and the floats where the water allows. Null where none is found.
   */
  findWay(a: XZ, b: XZ, r: number, pref: number): XZ[] | null {
    const s = this.openNear(a, r);
    const g = this.openNear(b, r);
    if (s < 0 || g < 0) return null;
    const { nx, nz, step, clear } = this;
    const n = nx * nz;
    const cost = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    // a binary heap of (estimate, cell)
    const hf: number[] = [];
    const hk: number[] = [];
    const push = (f: number, k: number) => {
      let i = hf.length;
      hf.push(f);
      hk.push(k);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hf[p] <= f) break;
        hf[i] = hf[p];
        hk[i] = hk[p];
        i = p;
      }
      hf[i] = f;
      hk[i] = k;
    };
    const pop = (): number => {
      const top = hk[0];
      const lf = hf.pop() as number;
      const lk = hk.pop() as number;
      if (hf.length) {
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          if (l >= hf.length) break;
          const c = l + 1 < hf.length && hf[l + 1] < hf[l] ? l + 1 : l;
          if (hf[c] >= lf) break;
          hf[i] = hf[c];
          hk[i] = hk[c];
          i = c;
        }
        hf[i] = lf;
        hk[i] = lk;
      }
      return top;
    };
    const gi = g % nx;
    const gj = Math.floor(g / nx);
    const h = (k: number) => {
      const di = Math.abs((k % nx) - gi);
      const dj = Math.abs(Math.floor(k / nx) - gj);
      return step * (Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj));
    };
    const span = Math.max(0.01, pref - r);
    cost[s] = 0;
    push(h(s), s);
    while (hf.length) {
      const k = pop();
      if (done[k]) continue;
      if (k === g) break;
      done[k] = 1;
      const i = k % nx;
      const j = Math.floor(k / nx);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const a2 = i + di;
          const b2 = j + dj;
          if (a2 < 0 || b2 < 0 || a2 >= nx || b2 >= nz) continue;
          const m = b2 * nx + a2;
          if (done[m] || clear[m] < r) continue;
          // no squeezing diagonally between two closed cells
          if (di && dj && (clear[j * nx + a2] < r || clear[b2 * nx + i] < r)) continue;
          const pen = Math.max(0, Math.min(1, (pref - clear[m]) / span));
          const c = cost[k] + step * (di && dj ? Math.SQRT2 : 1) * (1 + 3 * pen * pen);
          if (c < cost[m]) {
            cost[m] = c;
            from[m] = k;
            push(c + h(m), m);
          }
        }
      }
    }
    if (from[g] < 0 && g !== s) return null;
    const cells: XZ[] = [];
    for (let k = g; k >= 0; k = from[k]) cells.push([this.x0 + (k % nx) * step, this.z0 + Math.floor(k / nx) * step]);
    cells.reverse();
    cells[0] = [a[0], a[1]];
    cells[cells.length - 1] = [b[0], b[1]];
    return cells;
  }

  /** A way pulled taut: each point straight on to the farthest after it still in sight (`r` clear), twice over. */
  taut(pts: XZ[], r: number): XZ[] {
    if (pts.length < 3) return pts.slice();
    const out: XZ[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      while (j + 1 < pts.length && this.sees(pts[i], pts[j + 1], r)) j++;
      out.push(pts[j]);
      i = j;
    }
    // and any corner the first pass kept that its neighbours see past
    for (let k = 1; k < out.length - 1; ) {
      if (this.sees(out[k - 1], out[k + 1], r)) out.splice(k, 1);
      else k++;
    }
    return out;
  }
}

/**
 * A taut way kept to starboard, so boats meeting on it pass port to port: a point every `every` along it and at each
 * corner, each moved `d` to the right of the way there, eased in from either end over `ramp`, and less (or not at all)
 * where that would bring it within `r` of the shore or a solid, or out of sight of its neighbours.
 */
export function keepRight(pts: XZ[], grid: WaterGrid, r: number, d: number, every = 12, ramp = 18): XZ[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const S = cum[cum.length - 1];
  if (S < 2 * ramp + every) return pts;
  // where along it: every so often, and its corners
  const at = new Set<number>(cum.slice(1, -1).filter((s) => s > ramp * 0.5 && s < S - ramp * 0.5));
  for (let s = ramp; s < S - ramp; s += every) at.add(s);
  const marks = [...at].sort((a, b) => a - b);
  const base: XZ[] = [];
  const right: XZ[] = [];
  for (const s of marks) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const u = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    let tx = bx - ax;
    let tz = bz - az;
    // at a corner, the right of the way in and the way out together
    if (Math.abs(s - cum[i]) < 1e-6 && i + 1 < pts.length) {
      const l1 = Math.hypot(tx, tz);
      const l2 = Math.hypot(pts[i + 1][0] - bx, pts[i + 1][1] - bz);
      tx = tx / l1 + (pts[i + 1][0] - bx) / l2;
      tz = tz / l1 + (pts[i + 1][1] - bz) / l2;
    }
    const tl = Math.hypot(tx, tz) || 1;
    // the right of a heading (as rotation.y) is (−cos, sin): of (tx, tz), (−tz, tx)
    const nx = -tz / tl;
    const nz = tx / tl;
    const px = ax + (bx - ax) * u;
    const pz = az + (bz - az) * u;
    let a = d * Math.min(1, s / ramp, (S - s) / ramp);
    while (a > 0.5 && grid.clearAt(px + nx * a, pz + nz * a) < r) a *= 0.5;
    if (a <= 0.5) a = 0;
    base.push([px, pz]);
    right.push([px + nx * a, pz + nz * a]);
  }
  // where a stretch is out of sight, both its ends go back onto the way (which is in sight of itself)
  const out = (): XZ[] => [pts[0], ...right, pts[pts.length - 1]];
  for (let pass = 0; pass < 6; pass++) {
    const w = out();
    let ok = true;
    for (let k = 1; k < w.length; k++) {
      if (grid.sees(w[k - 1], w[k], r)) continue;
      ok = false;
      if (k - 2 >= 0 && k - 2 < right.length) right[k - 2] = base[k - 2];
      if (k - 1 < right.length) right[k - 1] = base[k - 1];
    }
    if (ok) return out();
  }
  return pts;
}

/** A way sampled about a unit apart: position, heading (as rotation.y, the bow along +z), curvature, distance along. */
export type Way = { x: number[]; z: number[]; yaw: number[]; curv: number[]; s: number[] };

const emptyWay = (): Way => ({ x: [], z: [], yaw: [], curv: [], s: [] });

/** Append a point to a way, its distance along counted from the last. */
function put(w: Way, x: number, z: number, yaw: number, curv: number): void {
  const n = w.x.length;
  const s = n ? w.s[n - 1] + Math.hypot(x - w.x[n - 1], z - w.z[n - 1]) : 0;
  if (n && s - w.s[n - 1] < 1e-4) return;
  w.x.push(x);
  w.z.push(z);
  w.yaw.push(yaw);
  w.curv.push(curv);
  w.s.push(s);
}

/** A straight run sampled into a way. */
function line(w: Way, ax: number, az: number, bx: number, bz: number): void {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 1e-4) return;
  const yaw = Math.atan2(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(L));
  for (let k = 0; k <= n; k++) put(w, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, yaw, 0);
}

/**
 * Round a polyline's corners into arcs and sample it: each corner's arc as wide as `rMax` allows, no wider than half
 * of either side (all of the first, which starts from rest, and of the last all but `keepEnd`, the straight run in to a
 * berth), and no wider than lets it cut inside the corner by more than the grid's clearance there over `r`.
 */
export function rounded(pts: XZ[], grid: WaterGrid | null, r: number, rMax: number, keepEnd: number): Way {
  const p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.05);
  const w = emptyWay();
  if (p.length < 2) {
    if (p.length) put(w, p[0][0], p[0][1], 0, 0);
    return w;
  }
  const last = p.length - 1;
  const len = (i: number) => Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
  let cx = p[0][0];
  let cz = p[0][1];
  for (let i = 1; i < last; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    const [qx, qz] = p[i + 1];
    const l1 = len(i - 1);
    const l2 = len(i);
    const d1x = (bx - ax) / l1;
    const d1z = (bz - az) / l1;
    const d2x = (qx - bx) / l2;
    const d2z = (qz - bz) / l2;
    // the change of heading (as rotation.y: positive from +z toward +x)
    const turn = Math.atan2(d1z * d2x - d1x * d2z, d1x * d2x + d1z * d2z);
    const th = Math.abs(turn);
    if (th < 0.01) continue;
    const room = Math.min(i - 1 === 0 ? l1 : l1 / 2, i + 1 === last ? Math.max(0, l2 - keepEnd) : l2 / 2);
    const tan = Math.tan(th / 2);
    let R = Math.min(rMax, room / tan);
    if (grid) {
      const spare = grid.clearAt(bx, bz) - r;
      const cut = 1 / Math.cos(th / 2) - 1;
      if (cut > 1e-6) R = Math.min(R, Math.max(0, spare) / cut);
    }
    R = Math.max(R, 0.6);
    const t = Math.min(R * tan, room);
    R = t / tan;
    if (t < 0.05) continue;
    const t1x = bx - d1x * t;
    const t1z = bz - d1z * t;
    line(w, cx, cz, t1x, t1z);
    // the centre lies on the side the way turns to
    const side = turn > 0 ? 1 : -1;
    const nxv = d1z * side;
    const nzv = -d1x * side;
    const ox = t1x + nxv * R;
    const oz = t1z + nzv * R;
    const a0 = Math.atan2(t1x - ox, t1z - oz);
    const n = Math.max(2, Math.ceil(th * R));
    const yaw0 = Math.atan2(d1x, d1z);
    for (let k = 1; k <= n; k++) {
      const a = a0 + (turn * k) / n;
      put(w, ox + Math.sin(a) * R, oz + Math.cos(a) * R, yaw0 + (turn * k) / n, 1 / R);
    }
    cx = bx + d2x * t;
    cz = bz + d2z * t;
  }
  line(w, cx, cz, p[last][0], p[last][1]);
  // headings on the straight runs come from the runs; the first point takes the first run's
  if (w.x.length > 1 && w.curv[0] === 0) w.yaw[0] = Math.atan2(w.x[1] - w.x[0], w.z[1] - w.z[0]);
  return w;
}

/**
 * The speed at each point of a way, from rest to rest: up to `v`, `acc` to gather way and `dec` to lose it, no faster
 * round a bend than `lat` across it allows, nor than `cap` says at that point.
 */
export function speeds(w: Way, v: number, acc: number, dec: number, lat: number, cap?: (i: number) => number): number[] {
  const n = w.x.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(v, w.curv[i] > 1e-6 ? Math.sqrt(lat / w.curv[i]) : v, cap ? cap(i) : v);
  out[0] = 0;
  out[n - 1] = 0;
  for (let i = 1; i < n; i++) out[i] = Math.min(out[i], Math.sqrt(out[i - 1] ** 2 + 2 * acc * (w.s[i] - w.s[i - 1])));
  for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i], Math.sqrt(out[i + 1] ** 2 + 2 * dec * (w.s[i + 1] - w.s[i])));
  return out;
}

/** The time at each point of a way at those speeds, from 0. */
export function times(w: Way, v: number[]): number[] {
  const t = [0];
  for (let i = 1; i < w.x.length; i++) t.push(t[i - 1] + (w.s[i] - w.s[i - 1]) / Math.max(0.05, (v[i - 1] + v[i]) / 2));
  return t;
}
