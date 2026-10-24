/**
 * The 2100 car body as three geometries sharing one superellipse cross-section: the pearl body (roof and lower
 * sides), the panoramic glass band between them, and the slim light line along its lower edge. The end cars taper
 * into a long glass nose. Each section is swept along z with more rings near the ends, where the nose curves.
 */
import { BufferGeometry, Float32BufferAttribute } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Half-width, half-height and centre height of the cross-section; NP > 2 squares it off. */
const A = 1.5;
const B = 1.62;
const CY = 2.25;
const NP = 3.4;
export const NOSE = 3.8;

const se = (th: number): [number, number] => {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [A * Math.sign(c) * Math.pow(Math.abs(c), 2 / NP), B * Math.sign(s) * Math.pow(Math.abs(s), 2 / NP)];
};

/** The cross-section as n points round (x, y), centred on the section's middle; the gangway bellows follow it. */
export function sectionRing(n: number, scale: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = se((i / n) * Math.PI * 2);
    out.push([x * scale, y * scale]);
  }
  return out;
}
/** Height of the section's middle above the rail head. */
export const SECTION_CY = CY;

export type CarGeometry = { body: BufferGeometry; glass: BufferGeometry; line: BufferGeometry };

export function carGeometry(len: number, noseFront: boolean, noseBack: boolean, rings = 30): CarGeometry {
  const zs: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const u = k / rings;
    zs.push(-len / 2 + len * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)));
  }
  const shape = (z: number) => {
    let u = 0;
    if (noseFront && z > len / 2 - NOSE) u = (z - (len / 2 - NOSE)) / NOSE;
    if (noseBack && z < -len / 2 + NOSE) u = (-len / 2 + NOSE - z) / NOSE;
    return { sx: 1 - 0.78 * Math.pow(u, 2.3), sy: 1 - 0.5 * Math.pow(u, 1.7), dy: -0.62 * Math.pow(u, 1.4) };
  };
  // the glass band runs between these angles on each side
  const g1 = Math.asin(Math.pow(0.1, NP / 2));
  const g2 = Math.asin(Math.pow(0.86, NP / 2));
  const band = (t0: number, t1: number, nt: number, scale = 1, glassUv = false): BufferGeometry => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    zs.forEach((z) => {
      const s = shape(z);
      for (let i = 0; i <= nt; i++) {
        const [x, y] = se(t0 + ((t1 - t0) * i) / nt);
        pos.push(x * s.sx * scale, CY + y * s.sy * scale + s.dy, z);
        // glass: the interior strip repeats 2.2 times along a car; elsewhere a plain wrap
        uv.push(glassUv ? (z / len + 0.5) * 2.2 : i / nt, glassUv ? i / nt : z / len);
      }
    });
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < nt; i++) {
        const a = j * (nt + 1) + i;
        const b = a + 1;
        const c = a + nt + 1;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // a flat fan closing each end (the nose tip, or the gangway end behind the bellows), facing outward
  const cap = (z: number, out: 1 | -1): BufferGeometry => {
    const s = shape(z);
    const n = 32;
    const pos: number[] = [0, CY + s.dy, z];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const [x, y] = se((i / n) * Math.PI * 2);
      pos.push(x * s.sx, CY + y * s.sy + s.dy, z);
      if (i < n) idx.push(...(out > 0 ? [0, i + 1, i + 2] : [0, i + 2, i + 1]));
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(new Array(((pos.length / 3) | 0) * 2).fill(0), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const merge = (gs: BufferGeometry[]) => {
    const out = mergeGeometries(gs, false);
    for (const g of gs) g.dispose();
    return out;
  };
  return {
    body: merge([band(Math.PI - g1, 2 * Math.PI + g1, 22), band(g2, Math.PI - g2, 10), cap(len / 2, 1), cap(-len / 2, -1)]),
    glass: merge([band(g1, g2, 8, 1.004, true), band(Math.PI - g2, Math.PI - g1, 8, 1.004, true)]),
    line: merge([band(g1 - 0.05, g1 + 0.012, 1, 1.012), band(Math.PI - g1 - 0.012, Math.PI - g1 + 0.05, 1, 1.012)]),
  };
}
