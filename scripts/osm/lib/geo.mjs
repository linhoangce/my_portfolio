/**
 * The world projection and the plane geometry the map bakes share. The projection mirrors components/train/geo.ts
 * exactly: x east, z south, K units per kilometre, origin at the Waterfront station node of the OSM alignment.
 */
export const ORIGIN_LAT = 49.2861789;
export const ORIGIN_LON = -123.112219;
export const KM_LAT = 111.2;
export const KM_LON = 111.32 * Math.cos((ORIGIN_LAT * Math.PI) / 180);
export const K = 110;
export const llToXZ = (lat, lon) => [(lon - ORIGIN_LON) * KM_LON * K, (ORIGIN_LAT - lat) * KM_LAT * K];
export const xzToLL = (x, z) => [ORIGIN_LAT - z / K / KM_LAT, ORIGIN_LON + x / K / KM_LON];
/** The near world (the terrain raster): what the bakes keep. */
export const NEAR = { x0: -520, x1: 998, z0: -450, z1: 858 };
/** Overpass bbox string "s,w,n,e" for a world box, with a margin in units. */
export const bboxOf = (b, m = 0) => {
  const [n, w] = xzToLL(b.x0 - m, b.z0 - m);
  const [s, e] = xzToLL(b.x1 + m, b.z1 + m);
  return `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
};

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const length = (pts) => pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0);

/** Distance from p to segment ab, with the parameter of the nearest point. */
export function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz), t };
}

/** Distance from p to a polyline, with the segment index and parameter of the nearest point. */
export function lineDist(p, pts) {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const r = segDist(p, pts[i], pts[i + 1]);
    if (r.d < best.d) best = { d: r.d, i, t: r.t };
  }
  return best;
}

/** Where segments ab and cd cross (parameters on each), or null. */
export function segCross(a, b, c, d) {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u, x: a[0] + t * rx, z: a[1] + t * rz } : null;
}

/** Resamples a polyline every `step` units along its length (keeping both ends). */
export function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = dist(a, b);
    let s = step - carry;
    while (s <= L) {
      out.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L]);
      s += step;
    }
    carry = L - (s - step);
  }
  if (dist(out[out.length - 1], pts[pts.length - 1]) > step * 0.3) out.push(pts[pts.length - 1]);
  return out;
}

/** Douglas–Peucker simplification; `keep(i)` pins points that must survive. */
export function simplify(pts, eps, keep = () => false) {
  if (pts.length < 3) return pts.slice();
  const mark = new Uint8Array(pts.length);
  mark[0] = mark[pts.length - 1] = 1;
  for (let i = 0; i < pts.length; i++) if (keep(i)) mark[i] = 1;
  const stack = [];
  let a = 0;
  for (let i = 1; i < pts.length; i++) {
    if (!mark[i]) continue;
    stack.push([a, i]);
    a = i;
  }
  while (stack.length) {
    const [i0, i1] = stack.pop();
    let m = -1;
    let md = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const d = segDist(pts[i], pts[i0], pts[i1]).d;
      if (d > md) {
        md = d;
        m = i;
      }
    }
    if (m >= 0) {
      mark[m] = 1;
      stack.push([i0, m], [m, i1]);
    }
  }
  return pts.filter((_, i) => mark[i]);
}

/** Point in polygon (even-odd). */
export function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed area (positive counter-clockwise in x-right, z-down screen terms is clockwise on the map). */
export const area = (poly) => poly.reduce((s, p, i) => s + (poly[(i + 1) % poly.length][0] - p[0]) * (poly[(i + 1) % poly.length][1] + p[1]), 0) / 2;

/** Chains OSM ways (with `nodes` and `geometry`) into the longest end-to-end path, starting at the end nearest `from`. */
export function chainWays(ways, from) {
  const ends = new Map();
  ways.forEach((w, k) => {
    for (const n of [w.nodes[0], w.nodes[w.nodes.length - 1]]) {
      if (!ends.has(n)) ends.set(n, []);
      ends.get(n).push(k);
    }
  });
  const pt = (g) => llToXZ(g.lat, g.lon);
  // start at the free end nearest `from`
  let start = null;
  let bd = Infinity;
  ways.forEach((w, k) => {
    for (const [n, g] of [
      [w.nodes[0], w.geometry[0]],
      [w.nodes[w.nodes.length - 1], w.geometry[w.geometry.length - 1]],
    ]) {
      const d = dist(pt(g), from);
      if (d < bd) {
        bd = d;
        start = { k, n };
      }
    }
  });
  const used = new Set();
  const out = [];
  let cur = start;
  let heading = null;
  while (cur) {
    const w = ways[cur.k];
    used.add(cur.k);
    const fwd = w.nodes[0] === cur.n;
    const geo = (fwd ? w.geometry : w.geometry.slice().reverse()).map(pt);
    const tags = w.tags ?? {};
    for (const p of out.length ? geo.slice(1) : geo) out.push({ p, tags });
    const end = fwd ? w.nodes[w.nodes.length - 1] : w.nodes[0];
    const a = out[out.length - 2]?.p ?? out[0].p;
    const b = out[out.length - 1].p;
    heading = [b[0] - a[0], b[1] - a[1]];
    // carry on along the way that turns least
    let next = null;
    let bestCos = -2;
    for (const k of ends.get(end) ?? []) {
      if (used.has(k)) continue;
      const v = ways[k];
      const g = (v.nodes[0] === end ? v.geometry : v.geometry.slice().reverse()).map(pt);
      const h = [g[Math.min(1, g.length - 1)][0] - g[0][0], g[Math.min(1, g.length - 1)][1] - g[0][1]];
      const c = (h[0] * heading[0] + h[1] * heading[1]) / ((Math.hypot(...h) * Math.hypot(...heading)) || 1);
      if (c > bestCos && c > 0.2) {
        bestCos = c;
        next = { k, n: end };
      }
    }
    cur = next;
  }
  return out;
}

/**
 * The shortest path along a set of OSM ways (joined wherever they share a node, not only at their ends) from the node
 * nearest `from` to the node nearest `to`, or, when `to` is a function, to the reachable node it scores highest (the
 * far end of the same track). Points carry the tags of the way each step runs along.
 */
export function pathWays(ways, from, to) {
  const pos = new Map();
  const adj = new Map();
  for (const w of ways) {
    w.nodes.forEach((n, i) => pos.set(n, llToXZ(w.geometry[i].lat, w.geometry[i].lon)));
    for (let i = 0; i + 1 < w.nodes.length; i++) {
      const [a, b] = [w.nodes[i], w.nodes[i + 1]];
      const L = dist(pos.get(a), pos.get(b));
      for (const [u, v] of [
        [a, b],
        [b, a],
      ]) {
        if (!adj.has(u)) adj.set(u, []);
        adj.get(u).push({ v, L, tags: w.tags ?? {} });
      }
    }
  }
  const nearest = (p) => [...pos.keys()].reduce((b, n) => (dist(pos.get(n), p) < dist(pos.get(b), p) ? n : b));
  const s = nearest(from);
  let t = typeof to === "function" ? null : nearest(to);
  // Dijkstra over a small graph: a sorted frontier is plenty
  const best = new Map([[s, 0]]);
  const prev = new Map();
  const done = new Set();
  const front = [[0, s]];
  while (front.length) {
    front.sort((a, b) => b[0] - a[0]);
    const [d, u] = front.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === t) break;
    for (const e of adj.get(u) ?? []) {
      const nd = d + e.L;
      if (nd < (best.get(e.v) ?? Infinity)) {
        best.set(e.v, nd);
        prev.set(e.v, { u, tags: e.tags });
        front.push([nd, e.v]);
      }
    }
  }
  if (t === null) t = [...done].reduce((b, n) => (to(pos.get(n)) > to(pos.get(b)) ? n : b), s);
  if (!prev.has(t) && s !== t) return [];
  const out = [];
  for (let n = t; n !== undefined; n = prev.get(n)?.u) out.push({ p: pos.get(n), tags: prev.get(n)?.tags ?? {} });
  out.reverse();
  // each point carries the tags of the step that leads away from it
  for (let i = 0; i + 1 < out.length; i++) out[i].tags = out[i + 1].tags;
  return out;
}
