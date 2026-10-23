/**
 * Small geometry kit for the hand-built pieces (vessels, monuments, the station buildings): walls round a closed
 * outline with uvs for a repeating façade texture, caps, painted solids, and a merge that normalises attributes so
 * any mix of them can share one mesh. Client only (the textures need a canvas).
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type P2 = [number, number];

/** Paint a canvas and wrap it as a repeating sRGB texture. */
export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) paint(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const centroid = (ring: P2[]): P2 => {
  let x = 0;
  let z = 0;
  for (const [a, b] of ring) {
    x += a;
    z += b;
  }
  return [x / ring.length, z / ring.length];
};

/**
 * Vertical walls round a closed ring of (x, z) points from y0 to y1, facing outward. u runs along the perimeter in
 * units of `uPer`, v up in units of `vPer` from `vFrom`. `smooth` averages normals at the corners (hulls, round
 * towers); otherwise each face is flat (buildings).
 */
export function walls(ring: P2[], y0: number, y1: number, opts: { uPer?: number; vPer?: number; vFrom?: number; smooth?: boolean } = {}): BufferGeometry {
  const { uPer = 1, vPer = 1, vFrom = y0, smooth = false } = opts;
  const n = ring.length;
  // which way the ring runs (its signed area): the outside is to the right of a counter-clockwise ring's edges, so
  // every face, concave ones too (a crescent's inner curve), faces out
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % n];
    area += ax * bz - bx * az;
  }
  const sgn = area >= 0 ? 1 : -1;
  const en: P2[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % n];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    en.push([(sgn * (bz - az)) / L, (-sgn * (bx - ax)) / L]);
  }
  const vn = (i: number): P2 => {
    const a = en[(i - 1 + n) % n];
    const b = en[i % n];
    const x = a[0] + b[0];
    const z = a[1] + b[1];
    const L = Math.hypot(x, z) || 1;
    return [x / L, z / L];
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  let u = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % n];
    const du = Math.hypot(bx - ax, bz - az) / uPer;
    const na = smooth ? vn(i) : en[i];
    const nb = smooth ? vn(i + 1) : en[i];
    const v0 = (y0 - vFrom) / vPer;
    const v1 = (y1 - vFrom) / vPer;
    // two triangles, wound so the face normal points along the outward normal
    const quad: [number, number, number, number, number, P2][] = [
      [ax, y0, az, u, v0, na],
      [bx, y0, bz, u + du, v0, nb],
      [bx, y1, bz, u + du, v1, nb],
      [ax, y1, az, u, v1, na],
    ];
    // triangle (a0, b0, b1) has normal ∝ (−ez, 0, ex); keep that order when it points outward, else reverse it
    const ex = bx - ax;
    const ez = bz - az;
    const fwd = -ez * en[i][0] + ex * en[i][1] > 0;
    const order = fwd ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) {
      const [x, y, z, uu, vv, nn] = quad[k];
      pos.push(x, y, z);
      nor.push(nn[0], 0, nn[1]);
      uv.push(uu, vv);
    }
    u += du;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

/** A flat cap over a (star-shaped) ring at height y, facing up (or down), fanned from the centroid. */
export function cap(ring: P2[], y: number, up = true, uvAt: P2 = [0.5, 0.5]): BufferGeometry {
  const [cx, cz] = centroid(ring);
  const pos: number[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % n];
    // (centre, a, b) faces up when (a − c) × (b − c) has a positive y; pick the order that faces the asked way
    const cy = (az - cz) * (bx - cx) - (ax - cx) * (bz - cz);
    const faceUp = cy > 0;
    const tri = faceUp === up ? [cx, cz, ax, az, bx, bz] : [cx, cz, bx, bz, ax, az];
    pos.push(tri[0], y, tri[1], tri[2], y, tri[3], tri[4], y, tri[5]);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = up ? 1 : -1;
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0).map((_, i) => uvAt[i % 2]), 2));
  return g;
}

/** A rounded rectangle ring (w × d, corner radius r) centred on the origin. */
export function roundRect(w: number, d: number, r: number, seg = 4): P2[] {
  const out: P2[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, d / 2 - r, 0],
    [-w / 2 + r, d / 2 - r, Math.PI / 2],
    [-w / 2 + r, -d / 2 + r, Math.PI],
    [w / 2 - r, -d / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [x, z, a0] of corners) for (let k = 0; k <= seg; k++) {
    const a = a0 + (k / seg) * (Math.PI / 2);
    out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return out;
}

/** Give a geometry one vertex colour (hex) and the normalised attribute set, so it merges with anything else. */
export function paint(g: BufferGeometry, hex: number): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  const n = ng.attributes.position.count;
  if (!ng.attributes.normal) ng.computeVertexNormals();
  if (!ng.attributes.uv) ng.setAttribute("uv", new Float32BufferAttribute(new Float32Array(n * 2), 2));
  const r = ((hex >> 16) & 255) / 255;
  const gg = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  // stored linear, as three expects of vertex colours
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([lin(r), lin(gg), lin(b)], i * 3);
  ng.setAttribute("color", new BufferAttribute(col, 3));
  for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) ng.deleteAttribute(k);
  return ng;
}

/** Where some of the parts to merge glow (aGlow, pavilion.ts lit), the rest get a glow of none, so all merge. */
export function unlit(gs: BufferGeometry[]): void {
  if (!gs.some((g) => g.attributes.aGlow)) return;
  for (const g of gs) if (!g.attributes.aGlow) g.setAttribute("aGlow", new Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
}

/** Merge geometries with the same attribute set (use paint() or keep them all textured), disposing the parts. */
export function merge(gs: BufferGeometry[]): BufferGeometry {
  const flat = gs.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    if (!ng.attributes.uv) ng.setAttribute("uv", new Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  });
  unlit(flat);
  const out = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  return out;
}
