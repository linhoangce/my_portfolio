/**
 * Typed-array accumulators for the merged city meshes: position, normal, uv, façade layer and tint per vertex. One
 * builder per chunk and material class; `addGeo` folds in any three.js geometry (domes, cylinders, boxes).
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, type Matrix4 } from "three";

export type V3 = [number, number, number];
export type Tint = [number, number, number];

class Grow {
  a: Float32Array;
  n = 0;
  constructor(size: number) {
    this.a = new Float32Array(size);
  }
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) this.grow();
    this.a[this.n++] = x;
    this.a[this.n++] = y;
    this.a[this.n++] = z;
  }
  push2(x: number, y: number) {
    if (this.n + 2 > this.a.length) this.grow();
    this.a[this.n++] = x;
    this.a[this.n++] = y;
  }
  push1(x: number) {
    if (this.n + 1 > this.a.length) this.grow();
    this.a[this.n++] = x;
  }
  private grow() {
    const b = new Float32Array(this.a.length * 2);
    b.set(this.a);
    this.a = b;
  }
  view() {
    return this.a.subarray(0, this.n);
  }
}

export class GeoBuilder {
  private pos = new Grow(3 * 4096);
  private nrm = new Grow(3 * 4096);
  private uv = new Grow(2 * 4096);
  private layer = new Grow(4096);
  private tint = new Grow(3 * 4096);
  get vertices(): number {
    return this.pos.n / 3;
  }

  /** One triangle; the normal is the face normal unless given. */
  tri(a: V3, b: V3, c: V3, ua: [number, number], ub: [number, number], uc: [number, number], layer: number, tint: Tint, n?: V3): void {
    let nx: number;
    let ny: number;
    let nz: number;
    if (n) [nx, ny, nz] = n;
    else {
      const e1x = b[0] - a[0];
      const e1y = b[1] - a[1];
      const e1z = b[2] - a[2];
      const e2x = c[0] - a[0];
      const e2y = c[1] - a[1];
      const e2z = c[2] - a[2];
      nx = e1y * e2z - e1z * e2y;
      ny = e1z * e2x - e1x * e2z;
      nz = e1x * e2y - e1y * e2x;
      const L = Math.hypot(nx, ny, nz) || 1;
      nx /= L;
      ny /= L;
      nz /= L;
    }
    for (const [p, u] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ] as const) {
      this.pos.push3(p[0], p[1], p[2]);
      this.nrm.push3(nx, ny, nz);
      this.uv.push2(u[0], u[1]);
      this.layer.push1(layer);
      this.tint.push3(tint[0], tint[1], tint[2]);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number], layer: number, tint: Tint): void {
    this.tri(a, b, c, ua, ub, uc, layer, tint);
    this.tri(a, c, d, ua, uc, ud, layer, tint);
  }

  /** Fold in a three.js geometry under a transform, with one layer and tint (its own uvs are kept). */
  addGeo(geo: BufferGeometry, m: Matrix4, layer: number, tint: Tint, uvScale = 1): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position as BufferAttribute;
    const n = g.attributes.normal as BufferAttribute;
    const uv = g.attributes.uv as BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      this.pos.push3(p.getX(i), p.getY(i), p.getZ(i));
      this.nrm.push3(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push2(uv ? uv.getX(i) * uvScale : 0.5, uv ? uv.getY(i) * uvScale : 0.5);
      this.layer.push1(layer);
      this.tint.push3(tint[0], tint[1], tint[2]);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos.view().slice(), 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nrm.view().slice(), 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv.view().slice(), 2));
    g.setAttribute("aLayer", new Float32BufferAttribute(this.layer.view().slice(), 1));
    g.setAttribute("aTint", new Float32BufferAttribute(this.tint.view().slice(), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
