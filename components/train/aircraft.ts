/**
 * The air taxis of 2100 (airways.ts flies them, AirTaxis.tsx draws them): five bodies of one maker's line, built as
 * vehicles, not as aircraft or toys: no wings, no tail fins, no open rotors. Each is a sculpted hull, a cabin on a spine
 * between fan pods where a car's wheels would be, the fans in grilles flush with the pods' decks over and under, a dark
 * glasshouse, a light blade across the nose and a bar across the tail; each built nose along +x, its retracted feet on
 * y 0 (it stands on its pad):
 * - the coupé, low, its roof falling in a fastback;
 * - the saloon, longer, its cabin upright under a long roof, a notched tail;
 * - the utility, tall and square-shouldered, a dark lower body, roof rails;
 * - the shuttle, long and tall, its cabin full width between the pods, windows down its sides under a flat roof;
 * - the sport, a narrow canopy for two between wide pods, very low.
 * Their lights are lines (the delivery drones show points, vessels.ts): a line round the shoulder, rings round the fans.
 * Every vertex carries what the aircraft shader needs:
 * - its colour;
 * - aTint (1 where the paint takes the instance's livery);
 * - aGlow: 1 a lamp in its own colour, 2 a light in the livery's accent, 3 glass, 4 glass with the cabin's light
 *   behind it (warm after dark).
 */
import { type BufferGeometry, BoxGeometry, CircleGeometry, Float32BufferAttribute, BufferGeometry as Geo, PlaneGeometry, RingGeometry, Vector3 } from "three";

import { merge } from "./shapes";

/** A face's look: its colour, its glow (see above) and whether the livery tints it. */
type Look = readonly [hex: number, glow: number, tint: number];
const PAINT: Look = [0xffffff, 0, 1];
const GLASS: Look = [0x2c3a48, 3, 0];
const LIT: Look = [0x1c2630, 4, 0];
const ACCENT: Look = [0xffffff, 2, 0];
const HEAD: Look = [0xf2f8ff, 1, 0];
const TAIL: Look = [0xff2a1f, 1, 0];
const DARK: Look = [0x121417, 0, 0];
const BELLY: Look = [0x24282e, 0, 0];
const TRIM: Look = [0x9aa2ab, 0, 0];
const GRILLE: Look = [0x30353c, 0, 0];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: number) => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];

/** A part with the aircraft's attributes, all in one look. */
function part(g: BufferGeometry, look: Look): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  if (!ng.attributes.normal) ng.computeVertexNormals();
  for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "uv"].includes(k)) ng.deleteAttribute(k);
  const count = ng.attributes.position.count;
  if (!ng.attributes.uv) ng.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  const k = rgb(look[0]);
  const col = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) col.set(k, v * 3);
  ng.setAttribute("color", new Float32BufferAttribute(col, 3));
  ng.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(count).fill(look[1]), 1));
  ng.setAttribute("aTint", new Float32BufferAttribute(new Float32Array(count).fill(look[2]), 1));
  return ng;
}

/** A flat disc (or, r0 > 0, a ring) at (x, y, z), facing up or, `down`, down. */
const flat = (x: number, y: number, z: number, r1: number, r0 = 0, down = false, seg = 20) =>
  (r0 > 0 ? new RingGeometry(r0, r1, seg) : new CircleGeometry(r1, seg)).rotateX(down ? Math.PI / 2 : -Math.PI / 2).translate(x, y, z);

/* ------------------------------------------------------------------ hulls */

/**
 * A hull's station: at x, its half-widths (w at the shoulder, c at the glasshouse's foot or the spine's edge, r at the
 * roof's edge) and heights (yb its floor, yl its shoulder and the fan pods' decks, yt its roof).
 */
type St = [x: number, w: number, c: number, r: number, yb: number, yl: number, yt: number];

/** The bands round a hull's section, floor to roof: */
const UNDER = 0;
const SILL = 1;
const FLANK = 2;
const LINE = 3;
const DECK = 4;
const LOW = 5;
const HIGH = 6;
const ROOF = 7;

/** Monotone cubic interpolation through (xs, ys) (Fritsch–Carlson), so a hull never bulges past its stations. */
function monotone(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 * a * d[i]) / h;
      m[i + 1] = (3 * b * d[i]) / h;
    }
  }
  return (x: number) => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = Math.min(1, Math.max(0, (x - xs[i]) / h));
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/**
 * A hull through its stations, a section every `step` or so. Each section's ring, from the floor's centre round the
 * right side to the roof's centre, is the floor, the sill, the flank, a narrow chamfer at the shoulder (the line the
 * lights run in), the deck in from the shoulder to the glasshouse's foot (over the fan pods), the glasshouse in two
 * panes leaning in, and the roof; mirrored to the left. Each band is shaded smooth along the hull and sharp at its
 * edges, the creases a body's panels make; `look` paints each quad of a band by where it is (its centre, on the right
 * side). The nose and tail are closed flat, each face of them painted by `end` by its height over the floor's (0 the
 * floor, 1 the shoulder).
 */
function hull(stations: St[], step: number, look: (band: number, x: number, y: number, z: number) => Look, end: (front: boolean, h: number) => Look): BufferGeometry {
  const st = [...stations].sort((a, b) => a[0] - b[0]);
  const xs = st.map((s) => s[0]);
  const at = [1, 2, 3, 4, 5, 6].map((k) => monotone(xs, st.map((s) => s[k])));
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const N = Math.max(2, Math.ceil((x1 - x0) / step));
  const X: number[] = [];
  const rings: [z: number, y: number][][] = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    const [w, cw, r, yb, yl, yt] = at.map((f) => f(x));
    const hg = Math.max(0, yt - yl);
    const foot = Math.min(cw, w * 0.95);
    X.push(x);
    rings.push([
      [0, yb],
      [w * 0.84, yb],
      [w * 0.985, yb + (yl - yb) * 0.32],
      [w, yl - Math.min(0.05, (yl - yb) * 0.15)],
      [w * 0.975, yl],
      [foot, yl + Math.min(0.02, hg * 0.1)],
      [r + (foot - r) * 0.42, yl + hg * 0.6],
      [r, yt - Math.min(0.03, hg * 0.1)],
      [0, yt],
    ]);
  }
  const P = (i: number, j: number) => new Vector3(X[i], rings[i][j][1], rings[i][j][0]);
  const B = rings[0].length - 1;
  // each quad's normal (the sum of its triangles', which face out: A, D, B and D, C, B on the right)
  const fn: Vector3[][] = [];
  for (let i = 0; i < N; i++) {
    fn.push([]);
    for (let j = 0; j < B; j++) {
      const a = P(i, j);
      const b = P(i, j + 1);
      const c = P(i + 1, j + 1);
      const d = P(i + 1, j);
      const n = new Vector3().subVectors(d, a).cross(new Vector3().subVectors(b, a));
      n.add(new Vector3().subVectors(c, d).cross(new Vector3().subVectors(b, d)));
      fn[i].push(n.lengthSq() > 1e-12 ? n.normalize() : new Vector3(0, j < 2 ? -1 : 1, 0));
    }
  }
  const vn = (i: number, j: number) => new Vector3().addVectors(fn[Math.max(0, i - 1)][j], fn[Math.min(N - 1, i)][j]).normalize();
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const glow: number[] = [];
  const tint: number[] = [];
  const put = (p: Vector3, n: Vector3, l: Look, m: number) => {
    pos.push(p.x, p.y, p.z * m);
    nrm.push(n.x, n.y, n.z * m);
    col.push(...rgb(l[0]));
    glow.push(l[1]);
    tint.push(l[2]);
  };
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < B; j++) {
      const a = P(i, j);
      const b = P(i, j + 1);
      const c = P(i + 1, j + 1);
      const d = P(i + 1, j);
      const l = look(j, (X[i] + X[i + 1]) / 2, (a.y + b.y + c.y + d.y) / 4, (a.z + b.z + c.z + d.z) / 4);
      const ni = vn(i, j);
      const nj = vn(i + 1, j);
      for (const m of [1, -1]) {
        const tris: [Vector3, Vector3][] =
          m > 0
            ? [
                [a, ni],
                [d, nj],
                [b, ni],
                [d, nj],
                [c, nj],
                [b, ni],
              ]
            : [
                [a, ni],
                [b, ni],
                [d, nj],
                [d, nj],
                [b, ni],
                [c, nj],
              ];
        for (const [p, n] of tris) put(p, n, l, m);
      }
    }
  }
  // the ends, closed flat: fans from the middle of each end's ring, round the right side and back down the left
  for (const [i, s] of [
    [N, 1],
    [0, -1],
  ] as const) {
    const ring = [...rings[i].map(([z, y]) => [z, y]), ...rings[i].slice(1, -1).reverse().map(([z, y]) => [-z, y])];
    const cy = ring.reduce((t, q) => t + q[1], 0) / ring.length;
    const yb = rings[i][0][1];
    const yl = rings[i][4][1];
    const n = new Vector3(s, 0, 0);
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k];
      const q = ring[(k + 1) % ring.length];
      const l = end(s > 0, ((cy + p[1] + q[1]) / 3 - yb) / Math.max(0.01, yl - yb));
      const tri = s > 0 ? [[0, cy], q, p] : [[0, cy], p, q];
      for (const [z, y] of tri) put(new Vector3(X[i], y, z), n, l, 1);
    }
  }
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setAttribute("aGlow", new Float32BufferAttribute(glow, 1));
  g.setAttribute("aTint", new Float32BufferAttribute(tint, 1));
  return g;
}

/**
 * A fan in its pod's deck at height y, flush with it: a dark grille, its vanes and hub, a bright bezel and a ring of
 * light inside it; under the pod's floor (`under`) the grille and the ring of light only.
 */
function fan(x: number, y: number, z: number, r: number, under = false): BufferGeometry[] {
  if (under) return [part(flat(x, y - 0.006, z, r, 0, true), DARK), part(flat(x, y - 0.01, z, r - 0.03, r - 0.06, true), ACCENT)];
  return [
    part(flat(x, y + 0.006, z, r), DARK),
    ...[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((a) => part(new PlaneGeometry(2 * r - 0.06, 0.03).rotateX(-Math.PI / 2).rotateY(a).translate(x, y + 0.01, z), GRILLE)),
    part(flat(x, y + 0.012, z, 0.08, 0, false, 10), TRIM),
    part(flat(x, y + 0.008, z, r + 0.035, r, false), TRIM),
    part(flat(x, y + 0.011, z, r - 0.02, r - 0.045, false), ACCENT),
  ];
}

/** A landing pad under the floor at (x, z), up into it. */
const foot = (x: number, z: number, yb: number) => [part(new BoxGeometry(0.2, yb + 0.02, 0.14).translate(x, (yb + 0.02) / 2, z), DARK)];

/** A thin dark line down the flank at x (a door's shut line), on both sides, from the sill's crease to the shoulder's. */
function shut(at: (x: number) => St, x: number): BufferGeometry[] {
  const [, w, , , yb, yl] = at(x);
  const a = new Vector3(x, yb + (yl - yb) * 0.32, w * 0.985);
  const b = new Vector3(x, yl - Math.min(0.05, (yl - yb) * 0.15), w);
  const out = new Vector3(0, -(b.z - a.z), b.y - a.y).normalize().multiplyScalar(0.004);
  return [1, -1].map((s) => {
    const g = new PlaneGeometry(0.018, a.distanceTo(b));
    // stood along the flank's slope, facing out
    g.rotateY(s > 0 ? 0 : Math.PI).rotateX(s * Math.atan2(b.z - a.z, b.y - a.y));
    g.translate(x, (a.y + b.y) / 2 + out.y, s * ((a.z + b.z) / 2 + out.z));
    return part(g, DARK);
  });
}

/** A make: its stations, its glasshouse (from x to x, pillars at), how its bands are dressed, its fans' places. */
type Make = {
  st: St[];
  glass: [number, number];
  pillars: number[];
  /** The roof: painted, dark, or glass. */
  roof: "paint" | "dark" | "glass";
  /** The sill: painted, or a dark lower body. */
  sill: "paint" | "dark";
  /** The shoulder's line between the lamps: the accent lit, or bright trim. */
  line: "accent" | "trim";
  /** The fans' x along the pods (each one a pair, right and left). */
  fans: number[];
  /** The landing pads' x. */
  feet: number[];
  /** The doors' shut lines' x. */
  doors: number[];
  extra?: (at: (x: number) => St) => BufferGeometry[];
};

/** A make built: its hull dressed, its fans in the pods' decks and floors, its lamps across the nose and tail, its feet. */
function build(m: Make): BufferGeometry {
  const st = [...m.st].sort((a, b) => a[0] - b[0]);
  const xs = st.map((s) => s[0]);
  const f = [1, 2, 3, 4, 5, 6].map((k) => monotone(xs, st.map((s) => s[k])));
  const at = (x: number): St => [x, ...f.map((g) => g(x))] as St;
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const [g0, g1] = m.glass;
  const body = hull(
    st,
    0.12,
    (band, x) => {
      const glass = x > g0 && x < g1;
      switch (band) {
        case UNDER:
          return BELLY;
        case SILL:
          return m.sill === "dark" ? DARK : PAINT;
        case FLANK:
          return PAINT;
        case LINE:
          // the lamps wrap round the nose's and the tail's corners; the line between
          if (x > x1 - 0.32) return HEAD;
          if (x < x0 + 0.3) return TAIL;
          return m.line === "accent" ? ACCENT : TRIM;
        case DECK:
          return PAINT;
        case LOW:
        case HIGH:
          if (!glass) return PAINT;
          // the pillars black, so the roof floats; the lower pane lit from inside after dark
          if (m.pillars.some((p) => Math.abs(x - p) < 0.06)) return DARK;
          return band === LOW ? LIT : GLASS;
        case ROOF:
          return m.roof === "glass" && glass ? GLASS : m.roof === "dark" ? DARK : PAINT;
        default:
          return PAINT;
      }
    },
    // a dark intake low in the nose, the tail's diffuser dark under its lamp bar
    (front, h) => (front ? (h < 0.45 ? DARK : PAINT) : h < 0.62 ? DARK : PAINT),
  );
  const parts: BufferGeometry[] = [body];
  // the light blade across the nose and the bar across the tail, at the shoulder
  const n = at(x1);
  const t = at(x0);
  parts.push(part(new BoxGeometry(0.02, 0.045, n[1] * 1.7).translate(x1 + 0.008, n[5] - 0.03, 0), HEAD));
  parts.push(part(new BoxGeometry(0.02, 0.06, t[1] * 1.8).translate(x0 - 0.008, t[5] - 0.04, 0), TAIL));
  for (const fx of m.fans) {
    const [, w, c, , yb, yl] = at(fx);
    const z = (w * 0.975 + c) / 2;
    const r = Math.min((w * 0.975 - c) / 2 - 0.05, 0.4);
    const ru = Math.min(r, w * 0.84 - z - 0.03);
    for (const s of [1, -1]) parts.push(...fan(fx, yl, s * z, r), ...fan(fx, yb, s * z, ru, true));
  }
  for (const fx of m.feet) {
    const [, , c, , yb] = at(fx);
    for (const s of [1, -1]) parts.push(...foot(fx, s * c * 0.75, yb));
  }
  for (const x of m.doors) parts.push(...shut(at, x));
  // the side cameras where mirrors were, at the glasshouse's front foot
  const mx = g1 - 0.32;
  const [, , mc, , , myl] = at(mx);
  for (const s of [1, -1]) parts.push(part(new BoxGeometry(0.14, 0.05, 0.1).translate(mx, myl + 0.07, s * (Math.min(mc, at(mx)[1] * 0.95) + 0.05)), DARK));
  if (m.extra) parts.push(...m.extra(at));
  return merge(parts);
}

/* ------------------------------------------------------------------ the line */

// prettier-ignore
const COUPE: Make = {
  st: [
    [2.15, 0.36, 0.22, 0.18, 0.24, 0.52, 0.52],
    [2.0, 0.78, 0.3, 0.22, 0.17, 0.58, 0.58],
    [1.75, 1.06, 0.34, 0.26, 0.13, 0.63, 0.64],
    [1.35, 1.2, 0.38, 0.3, 0.11, 0.66, 0.7],
    [0.95, 1.12, 0.56, 0.4, 0.1, 0.68, 0.92],
    [0.5, 0.98, 0.66, 0.48, 0.1, 0.69, 1.12],
    [0.0, 0.95, 0.68, 0.5, 0.1, 0.7, 1.16],
    [-0.5, 1.0, 0.66, 0.47, 0.1, 0.71, 1.1],
    [-0.95, 1.13, 0.56, 0.38, 0.11, 0.72, 0.94],
    [-1.35, 1.2, 0.4, 0.3, 0.12, 0.73, 0.8],
    [-1.75, 1.1, 0.36, 0.28, 0.15, 0.73, 0.75],
    [-2.05, 0.9, 0.32, 0.26, 0.2, 0.72, 0.73],
    [-2.15, 0.82, 0.3, 0.25, 0.23, 0.71, 0.72],
  ],
  glass: [-1.2, 1.2],
  pillars: [],
  roof: "paint",
  sill: "paint",
  line: "accent",
  fans: [1.35, -1.35],
  feet: [1.35, -1.35],
  doors: [0.95, -0.55],
};

// prettier-ignore
const SALOON: Make = {
  st: [
    [2.35, 0.4, 0.26, 0.2, 0.24, 0.56, 0.56],
    [2.2, 0.82, 0.34, 0.26, 0.18, 0.62, 0.62],
    [1.95, 1.1, 0.4, 0.3, 0.14, 0.67, 0.68],
    [1.55, 1.2, 0.42, 0.32, 0.12, 0.7, 0.74],
    [1.1, 1.14, 0.66, 0.5, 0.11, 0.72, 1.02],
    [0.6, 1.04, 0.74, 0.58, 0.11, 0.73, 1.26],
    [0.0, 1.02, 0.76, 0.6, 0.11, 0.74, 1.3],
    [-0.6, 1.04, 0.75, 0.58, 0.11, 0.75, 1.27],
    [-1.05, 1.14, 0.66, 0.5, 0.12, 0.76, 1.12],
    [-1.4, 1.2, 0.48, 0.38, 0.13, 0.77, 0.86],
    [-1.75, 1.19, 0.42, 0.34, 0.15, 0.78, 0.8],
    [-2.2, 1.0, 0.4, 0.32, 0.19, 0.78, 0.79],
    [-2.35, 0.9, 0.38, 0.3, 0.22, 0.77, 0.78],
  ],
  glass: [-1.3, 1.35],
  pillars: [0.05, -0.8],
  roof: "paint",
  sill: "paint",
  line: "trim",
  fans: [1.55, -1.75],
  feet: [1.55, -1.75],
  doors: [1.05, 0.02, -0.95],
};

// prettier-ignore
const UTILITY: Make = {
  st: [
    [2.25, 0.5, 0.3, 0.25, 0.3, 0.66, 0.66],
    [2.1, 0.95, 0.4, 0.32, 0.22, 0.74, 0.74],
    [1.85, 1.2, 0.45, 0.36, 0.18, 0.8, 0.82],
    [1.45, 1.26, 0.5, 0.4, 0.16, 0.84, 0.9],
    [1.05, 1.2, 0.78, 0.66, 0.16, 0.86, 1.32],
    [0.6, 1.14, 0.84, 0.74, 0.16, 0.87, 1.52],
    [0.0, 1.14, 0.85, 0.75, 0.16, 0.88, 1.55],
    [-0.7, 1.15, 0.85, 0.75, 0.16, 0.89, 1.55],
    [-1.15, 1.2, 0.82, 0.72, 0.17, 0.9, 1.5],
    [-1.5, 1.26, 0.6, 0.5, 0.18, 0.91, 1.12],
    [-1.9, 1.22, 0.5, 0.42, 0.2, 0.91, 0.96],
    [-2.25, 1.05, 0.48, 0.4, 0.26, 0.9, 0.92],
  ],
  glass: [-1.55, 1.25],
  pillars: [0.1, -0.85],
  roof: "paint",
  sill: "dark",
  line: "trim",
  fans: [1.45, -1.55],
  feet: [1.45, -1.55],
  doors: [1.0, 0.08, -0.95],
  // roof rails
  extra: (at) => [1, -1].map((s) => part(new BoxGeometry(1.7, 0.035, 0.05).translate(-0.15, at(-0.15)[6] + 0.03, s * (at(-0.15)[3] - 0.1)), TRIM)),
};

// prettier-ignore
const SHUTTLE: Make = {
  st: [
    [2.45, 0.66, 0.42, 0.32, 0.3, 0.7, 0.72],
    [2.3, 1.04, 0.56, 0.44, 0.22, 0.76, 0.96],
    [2.05, 1.32, 0.66, 0.56, 0.18, 0.8, 1.3],
    [1.65, 1.42, 0.7, 0.62, 0.16, 0.82, 1.5],
    [1.15, 1.34, 0.9, 0.8, 0.16, 0.83, 1.56],
    [0.0, 1.22, 0.98, 0.86, 0.16, 0.83, 1.58],
    [-1.15, 1.34, 0.9, 0.8, 0.16, 0.83, 1.56],
    [-1.65, 1.42, 0.7, 0.62, 0.16, 0.83, 1.5],
    [-2.05, 1.34, 0.68, 0.58, 0.18, 0.83, 1.36],
    [-2.3, 1.12, 0.6, 0.5, 0.22, 0.82, 1.1],
    [-2.45, 0.84, 0.5, 0.4, 0.28, 0.8, 0.84],
  ],
  glass: [-2.15, 2.2],
  pillars: [1.25, 0.42, -0.42, -1.25],
  roof: "paint",
  sill: "dark",
  line: "accent",
  fans: [1.65, -1.65],
  feet: [1.65, -1.65],
  doors: [0.85, -0.05],
};

// prettier-ignore
const SPORT: Make = {
  st: [
    [2.05, 0.3, 0.16, 0.12, 0.2, 0.46, 0.46],
    [1.85, 0.8, 0.2, 0.14, 0.14, 0.52, 0.53],
    [1.5, 1.16, 0.24, 0.16, 0.1, 0.56, 0.6],
    [1.15, 1.18, 0.34, 0.2, 0.09, 0.58, 0.74],
    [0.7, 1.06, 0.5, 0.3, 0.08, 0.6, 0.94],
    [0.15, 1.0, 0.54, 0.32, 0.08, 0.61, 1.0],
    [-0.4, 1.02, 0.5, 0.3, 0.08, 0.62, 0.95],
    [-0.85, 1.08, 0.36, 0.2, 0.09, 0.63, 0.8],
    [-1.25, 1.2, 0.28, 0.18, 0.1, 0.64, 0.7],
    [-1.65, 1.14, 0.26, 0.17, 0.12, 0.64, 0.67],
    [-2.0, 0.92, 0.24, 0.16, 0.16, 0.63, 0.64],
    [-2.1, 0.84, 0.23, 0.16, 0.19, 0.62, 0.63],
  ],
  glass: [-0.8, 1.15],
  pillars: [],
  roof: "glass",
  sill: "paint",
  line: "accent",
  fans: [1.3, -1.3],
  feet: [1.3, -1.3],
  doors: [0.85],
};

/** The makes, in order: the coupé, the saloon, the utility, the shuttle and the sport. */
export function aircraft(): BufferGeometry[] {
  return [COUPE, SALOON, UTILITY, SHUTTLE, SPORT].map(build);
}
