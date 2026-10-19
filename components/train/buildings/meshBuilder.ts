/**
 * Typed-array accumulators for the merged city meshes: position, normal, uv, façade layer and tint per vertex. One
 * builder per chunk and material class; `addGeo` folds in any three.js geometry (domes, cylinders, boxes).
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix3, type Matrix4 } from "three";

export type V3 = [number, number, number];
export type Tint = [number, number, number];

const nm = new Matrix3();

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
    this.vert(a, ua, nx, ny, nz, layer, tint);
    this.vert(b, ub, nx, ny, nz, layer, tint);
    this.vert(c, uc, nx, ny, nz, layer, tint);
  }

  private vert(p: V3, u: [number, number], nx: number, ny: number, nz: number, layer: number, tint: Tint): void {
    this.pos.push3(p[0], p[1], p[2]);
    this.nrm.push3(nx, ny, nz);
    this.uv.push2(u[0], u[1]);
    this.layer.push1(layer);
    this.tint.push3(tint[0], tint[1], tint[2]);
  }

  quad(a: V3, b: V3, c: V3, d: V3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number], layer: number, tint: Tint): void {
    this.tri(a, b, c, ua, ub, uc, layer, tint);
    this.tri(a, c, d, ua, uc, ud, layer, tint);
  }

  /**
   * Fold in a three.js geometry under a transform, with one layer and tint (its own uvs are kept). Reads the index
   * and transforms each vertex directly, without cloning; `keep` leaves a shared template undisposed.
   */
  addGeo(geo: BufferGeometry, m: Matrix4, layer: number, tint: Tint, uvScale = 1, keep = false): void {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const p = geo.attributes.position as BufferAttribute;
    const n = geo.attributes.normal as BufferAttribute;
    const uv = geo.attributes.uv as BufferAttribute | undefined;
    const idx = geo.index;
    const e = m.elements;
    nm.getNormalMatrix(m);
    const f = nm.elements;
    const count = idx ? idx.count : p.count;
    for (let k = 0; k < count; k++) {
      const i = idx ? idx.getX(k) : k;
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      this.pos.push3(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const a = n.getX(i);
      const b = n.getY(i);
      const c = n.getZ(i);
      let nx = f[0] * a + f[3] * b + f[6] * c;
      let ny = f[1] * a + f[4] * b + f[7] * c;
      let nz = f[2] * a + f[5] * b + f[8] * c;
      const L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= L;
      ny /= L;
      nz /= L;
      this.nrm.push3(nx, ny, nz);
      this.uv.push2(uv ? uv.getX(i) * uvScale : 0.5, uv ? uv.getY(i) * uvScale : 0.5);
      this.layer.push1(layer);
      this.tint.push3(tint[0], tint[1], tint[2]);
    }
    if (!keep) geo.dispose();
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
