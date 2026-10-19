"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from "three";

import { getCityData, getStreetMask } from "./cityData";
import { district } from "./cityModel";
import { PARKS } from "./sites";
import { groundAt, inWater, sdfAt, terrainRaster } from "./terrain";
import { useWorld } from "./world";

/**
 * The city ground: the frozen terrain raster as one mesh, indexed on the same triangles groundAt interpolates
 * (each cell split along b–c), with a hillshade in the vertex colours so slopes read, sand at the shore and an
 * 8-unit skirt that hides the seam against the far terrain. UVs keep the street tile's original anchor; a `street`
 * weight per vertex says where the tile shows at all (see getStreetMask).
 */
let streetMs = 0;

function buildGround(stride: number, streets: (x: number, z: number) => number): BufferGeometry {
  const { grid: g0, hf: hf0 } = terrainRaster();
  // the low-end budget draws every other raster vertex (a quarter of the triangles)
  const g = { ...g0, step: g0.step * stride, nx: Math.floor((g0.nx - 1) / stride) + 1, nz: Math.floor((g0.nz - 1) / stride) + 1 };
  const hf = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) hf[j * g.nx + i] = hf0[j * stride * g0.nx + i * stride];
  const n = g.nx * g.nz;
  const ring = 2 * (g.nx + g.nz) - 4;
  const pos = new Float32Array((n + ring) * 3);
  const uv = new Float32Array((n + ring) * 2);
  const col = new Float32Array((n + ring) * 3);
  const idx: number[] = [];
  const put = (k: number, x: number, y: number, z: number) => {
    pos[k * 3] = x;
    pos[k * 3 + 1] = y;
    pos[k * 3 + 2] = z;
    uv[k * 2] = (x + 1000) / 2860;
    uv[k * 2 + 1] = (1360 - z) / 2420;
  };
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) put(j * g.nx + i, g.x0 + i * g.step, hf[j * g.nx + i], g.z0 + j * g.step);
  for (let j = 0; j < g.nz - 1; j++) {
    for (let i = 0; i < g.nx - 1; i++) {
      const a = j * g.nx + i;
      const b = a + 1;
      const c = a + g.nx;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // skirt: the boundary loop again, dropped 8 units, stitched to the edge
  const edge: number[] = [];
  for (let i = 0; i < g.nx; i++) edge.push(i);
  for (let j = 1; j < g.nz; j++) edge.push(j * g.nx + g.nx - 1);
  for (let i = g.nx - 2; i >= 0; i--) edge.push((g.nz - 1) * g.nx + i);
  for (let j = g.nz - 2; j > 0; j--) edge.push(j * g.nx);
  edge.forEach((k, e) => put(n + e, pos[k * 3], pos[k * 3 + 1] - 8, pos[k * 3 + 2]));
  for (let e = 0; e < edge.length; e++) {
    const a = edge[e];
    const b = edge[(e + 1) % edge.length];
    const a2 = n + e;
    const b2 = n + ((e + 1) % edge.length);
    idx.push(a, b, a2, b, b2, a2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as BufferAttribute;
  for (let k = 0; k < n + ring; k++) {
    const x = pos[k * 3];
    const y = pos[k * 3 + 1];
    const z = pos[k * 3 + 2];
    const slope = 1 - nrm.getY(k);
    const shade = Math.min(1, Math.max(0.68, 1 - slope * 1.7)) * (0.96 + 0.05 * Math.min(1, Math.max(0, y / 40)));
    const sd = sdfAt(x, z);
    const sand = sd > -1 && sd < 4 ? 1 - Math.abs(sd - 1.5) / 2.5 : 0;
    col[k * 3] = shade * (1 - 0.06 * sand);
    col[k * 3 + 1] = shade * (1 - 0.1 * sand);
    col[k * 3 + 2] = shade * (1 - 0.2 * sand);
  }
  geo.setAttribute("color", new BufferAttribute(col, 3));
  // where the street tile shows (the material blends it into plain ground elsewhere); the skirt gets none
  const st = new Float32Array(n + ring);
  const t0 = performance.now();
  for (let k = 0; k < n; k++) st[k] = streets(pos[k * 3], pos[k * 3 + 2]);
  streetMs = performance.now() - t0;
  geo.setAttribute("street", new BufferAttribute(st, 1));
  return geo;
}

/** A polar grid lawn that follows the ground, with any water (Trout Lake) cut out. */
function lawn(px: number, pz: number, r: number): BufferGeometry {
  const rings = 7;
  const segs = 48;
  const pos: number[] = [px, groundAt(px, pz) + 0.06, pz];
  const wet: boolean[] = [inWater(px, pz)];
  for (let ri = 1; ri <= rings; ri++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = px + Math.cos(a) * (ri / rings) * r;
      const z = pz + Math.sin(a) * (ri / rings) * r;
      pos.push(x, groundAt(x, z) + 0.06, z);
      wet.push(inWater(x, z));
    }
  }
  const idx: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    if (!wet[a] && !wet[b] && !wet[c]) idx.push(a, b, c);
  };
  for (let s = 0; s < segs; s++) tri(0, 1 + ((s + 1) % segs), 1 + s);
  for (let ri = 1; ri < rings; ri++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + (ri - 1) * segs + s;
      const b = 1 + (ri - 1) * segs + ((s + 1) % segs);
      tri(a, b, a + segs);
      tri(b, b + segs, a + segs);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Stanley Park's forest floor: an 8-unit grid over the park's land, following the ground, so no street shows through. */
function forestFloor(): BufferGeometry {
  const x0 = -470;
  const z0 = -420;
  const step = 8;
  const nx = 41;
  const nz = 48;
  const pos: number[] = [];
  const on: boolean[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      pos.push(x, groundAt(x, z) + 0.08, z);
      on.push(!inWater(x, z) && district(x, z) === "forest");
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (on[a] && on[b] && on[c]) idx.push(a, c, b);
      if (on[b] && on[c] && on[d]) idx.push(b, c, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function Ground() {
  const { mats, lowEnd } = useWorld();
  const geo = useMemo(() => {
    const g = buildGround(lowEnd ? 2 : 1, getStreetMask(lowEnd));
    // reported with the city's build phases
    getCityData(lowEnd).phases.streets = Math.round(streetMs);
    return g;
  }, [lowEnd]);
  const lawns = useMemo(() => PARKS.map((p) => lawn(p.x, p.z, p.r)), []);
  const forest = useMemo(() => forestFloor(), []);
  useEffect(
    () => () => {
      geo.dispose();
      for (const l of lawns) l.dispose();
      forest.dispose();
    },
    [geo, lawns, forest],
  );
  return (
    <>
      <mesh geometry={geo} material={mats.ground} receiveShadow />
      <mesh geometry={forest} material={mats.forestFloor} receiveShadow />
      {lawns.map((l, i) => (
        <mesh key={PARKS[i].name} geometry={l} material={mats.park} receiveShadow />
      ))}
    </>
  );
}
