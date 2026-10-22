"use client";

import { useEffect, useMemo, useRef } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  type Group,
  LinearFilter,
  MeshStandardMaterial,
  RedFormat,
  type Texture,
  Vector3,
  type Vector4,
} from "three";

import { getCityData } from "./cityData";
import { commonsGround, commonsLawn } from "./commonsGround";
import { landClass } from "./roadNetwork";
import { district } from "./cityModel";
import { SEA } from "./constants";
import { drape } from "./drape";
import { merged, type Part } from "./merge";
import { cutNear } from "./rail";
import { inHarbourfront, PROMENADE, PROMENADE_W } from "./harbourfront";
import { type ParkPath, PARKS, SEAWALL, STREAM } from "./sites";
import { groundAt, inWater, LAKE, polySdf, sdfAt, SHORE_BOX, SHORES, surfaceAt, terrainRaster } from "./terrain";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/**
 * The city ground: the frozen terrain raster as one mesh, indexed on the same triangles groundAt interpolates
 * (each cell split along b–c), with a hillshade in the vertex colours so slopes read, sand at the shore and an
 * 8-unit skirt that hides the seam against the far terrain. UVs keep the street tile's original anchor; the material
 * shows the tile only on the city's land (the land-use raster, roads.ts landClass).
 */
function buildGround(stride: number): BufferGeometry {
  const { grid: g0, hf: hf0 } = terrainRaster();
  // the low-end budget draws every other raster vertex (a quarter of the triangles)
  const g = { ...g0, step: g0.step * stride, nx: Math.floor((g0.nx - 1) / stride) + 1, nz: Math.floor((g0.nz - 1) / stride) + 1 };
  const hf = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      let h = hf0[j * stride * g0.nx + i * stride];
      // a rail trench is narrower than the coarse cells: there each vertex takes the lowest raster point around it, so
      // the cut stays open to its floor and nothing laid on the floor is buried
      if (stride > 1 && cutNear(g.x0 + i * g.step, g.z0 + j * g.step) > 0.2) {
        for (let dj = -stride + 1; dj < stride; dj++) {
          for (let di = -stride + 1; di < stride; di++) {
            const jj = j * stride + dj;
            const ii = i * stride + di;
            if (jj >= 0 && jj < g0.nz && ii >= 0 && ii < g0.nx) h = Math.min(h, hf0[jj * g0.nx + ii]);
          }
        }
      }
      hf[j * g.nx + i] = h;
    }
  }
  const n = g.nx * g.nz;
  const ring = 2 * (g.nx + g.nz) - 4;
  const pos = new Float32Array((n + ring) * 3);
  const uv = new Float32Array((n + ring) * 2);
  const col = new Float32Array((n + ring) * 3);
  const shore = new Float32Array(n + ring);
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
    shore[k] = sd;
    // False Creek has a seawall, not a beach
    const walled = x > SHORE_BOX.x0 && x < SHORE_BOX.x1 && z > SHORE_BOX.z0 && z < SHORE_BOX.z1;
    const sand = !walled && sd > -1 && sd < 4 ? 1 - Math.abs(sd - 1.5) / 2.5 : 0;
    col[k * 3] = shade * (1 - 0.06 * sand);
    col[k * 3 + 1] = shade * (1 - 0.1 * sand);
    col[k * 3 + 2] = shade * (1 - 0.2 * sand);
  }
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.setAttribute("aShore", new BufferAttribute(shore, 1));
  return geo;
}

/**
 * The sea, which a lawn stops at. Trout Lake is not: a lawn runs on down into its bowl under the water, so the shore
 * is where the grass meets the water rather than a stepped hole in the lawn showing the bowl's bare side.
 */
const sea = (x: number, z: number) => inWater(x, z) && Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) > 1.6;

/** A polar grid lawn that follows the ground, with the sea cut out. */
function lawn(px: number, pz: number, r: number): BufferGeometry {
  const rings = 7;
  const segs = 48;
  const pos: number[] = [px, groundAt(px, pz) + 0.06, pz];
  const wet: boolean[] = [sea(px, pz)];
  for (let ri = 1; ri <= rings; ri++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = px + Math.cos(a) * (ri / rings) * r;
      const z = pz + Math.sin(a) * (ri / rings) * r;
      pos.push(x, groundAt(x, z) + 0.06, z);
      wet.push(sea(x, z));
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

/** The nearest point on a closed outline. */
function nearestOn(poly: [number, number][], x: number, z: number): [number, number] {
  let best: [number, number] = poly[0];
  let bd = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    const px = ax + ex * t;
    const pz = az + ez * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) {
      bd = d;
      best = [px, pz];
    }
  }
  return best;
}

/**
 * A lawn over a park's outline: a 2-unit grid inside it, following the drawn ground, with each vertex just outside
 * snapped onto the outline so the edge runs clean along the streets rather than in steps. The sea stays open.
 */
function polyLawn(poly: [number, number][], stride: number): BufferGeometry {
  const step = 2;
  const x0 = Math.min(...poly.map((p) => p[0])) - step;
  const z0 = Math.min(...poly.map((p) => p[1])) - step;
  const nx = Math.ceil((Math.max(...poly.map((p) => p[0])) + step - x0) / step) + 1;
  const nz = Math.ceil((Math.max(...poly.map((p) => p[1])) + step - z0) / step) + 1;
  const state = new Uint8Array(nx * nz);
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      state[j * nx + i] = polySdf(poly, x, z) <= 0 && !sea(x, z) && !inHarbourfront(x, z) ? 1 : 0;
      pos.set([x, 0, z], (j * nx + i) * 3);
    }
  }
  // 2: outside but beside an inside vertex, moved onto the outline
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (state[k]) continue;
      let near = false;
      for (let b = -1; b <= 1 && !near; b++) for (let a = -1; a <= 1 && !near; a++) near = state[Math.min(nz - 1, Math.max(0, j + b)) * nx + Math.min(nx - 1, Math.max(0, i + a))] === 1;
      if (!near) continue;
      const [sx, sz] = nearestOn(poly, pos[k * 3], pos[k * 3 + 2]);
      if (sea(sx, sz)) continue;
      pos[k * 3] = sx;
      pos[k * 3 + 2] = sz;
      state[k] = 2;
    }
  }
  for (let k = 0; k < nx * nz; k++) pos[k * 3 + 1] = surfaceAt(pos[k * 3], pos[k * 3 + 2], stride) + 0.06;
  const idx: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    if (state[a] && state[b] && state[c] && (state[a] === 1 || state[b] === 1 || state[c] === 1)) idx.push(a, b, c);
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      tri(a, a + nx, a + 1);
      tri(a + 1, a + nx, a + nx + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Where segment a-b crosses segment c-d (as a fraction along a-b), or null. */
function crossAt(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): number | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** The parks' paved paths and the seawall as one draped mesh, and a timber footbridge wherever one crosses China Creek. */
function parkPaths(all: ParkPath[], stride: number): { paths: BufferGeometry | null; bridges: BufferGeometry | null } {
  const paths: Part[] = [];
  const bridges: Part[] = [];
  for (const path of all) {
    let len = 0;
    for (let i = 0; i < path.pts.length - 1; i++) len += Math.hypot(path.pts[i + 1][0] - path.pts[i][0], path.pts[i + 1][1] - path.pts[i][1]);
    paths.push({ geo: drape(path.pts.map(([x, z]) => new Vector3(x, 0, z)), path.w / 2, 0.11, stride, 0, Math.max(4, Math.ceil(len / 0.7))) });
    for (let i = 0; i < path.pts.length - 1; i++) {
      for (let k = 0; k < STREAM.length - 1; k++) {
        const t = crossAt(path.pts[i], path.pts[i + 1], STREAM[k], STREAM[k + 1]);
        if (t === null) continue;
        const [ax, az] = path.pts[i];
        const [bx, bz] = path.pts[i + 1];
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (inWater(x, z)) continue;
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const ux = (bx - ax) / L;
        const uz = (bz - az) / L;
        const bank = Math.max(surfaceAt(x - ux * 4, z - uz * 4, stride), surfaceAt(x + ux * 4, z + uz * 4, stride));
        bridges.push({ geo: new BoxGeometry(path.w + 0.8, 0.3, 8), position: [x, bank + 0.12, z], rotation: [0, Math.atan2(ux, uz), 0] });
      }
    }
  }
  return { paths: paths.length ? merged(paths) : null, bridges: bridges.length ? merged(bridges) : null };
}

/**
 * False Creek's water as a mask over its box (255 on water, soft across the shore so the cut follows the curve), for
 * the ground shader to cut the ground away at the shore.
 */
function basinMask(): { tex: DataTexture; box: [number, number, number, number] } {
  const { x0, x1, z0, z1 } = SHORE_BOX;
  const step = 0.75;
  const nx = Math.round((x1 - x0) / step);
  const nz = Math.round((z1 - z0) / step);
  const data = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const sd = sdfAt(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
      data[j * nx + i] = Math.round(Math.min(1, Math.max(0, 0.5 - sd)) * 255);
    }
  }
  const tex = new DataTexture(data, nx, nz, RedFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return { tex, box: [x0, z0, x1 - x0, z1 - z0] };
}

/**
 * False Creek's seawall: a concrete face along the drawn shores from the ground's own height down below the water,
 * wherever there is land behind it (not where a drawn shore runs through the bake's own water).
 */
function seawall(stride: number): BufferGeometry {
  const pos: number[] = [];
  const pts: [number, number, number][] = [];
  const flush = () => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay, az] = pts[k];
      const [bx, by, bz] = pts[k + 1];
      const lo = SEA - 2;
      pos.push(ax, ay, az, ax, lo, az, bx, lo, bz, ax, ay, az, bx, lo, bz, bx, by, bz);
    }
    pts.length = 0;
  };
  for (const shore of SHORES) {
    const n = shore.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = shore[i];
      const [bx, bz] = shore[(i + 1) % n];
      const L = Math.hypot(bx - ax, bz - az);
      let nx = (bz - az) / L;
      let nz = -(bx - ax) / L;
      if (polySdf(shore, (ax + bx) / 2 + nx, (az + bz) / 2 + nz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      for (let t = 0; t <= L; t += 1.5) {
        const x = ax + ((bx - ax) * t) / L;
        const z = az + ((bz - az) * t) / L;
        // land behind and the shore really here (another drawn shore or the bake may have water on both sides)
        const land = sdfAt(x + nx * 1.5, z + nz * 1.5) > 0 && sdfAt(x - nx * 1.5, z - nz * 1.5) < 0;
        if (!land) {
          flush();
          continue;
        }
        pts.push([x, Math.max(SEA + 0.4, surfaceAt(x, z, stride)), z]);
      }
    }
    flush();
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
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

const pavingMat = new MeshStandardMaterial({ color: 0xcdc8bb, roughness: 0.95 });
const wallMat = new MeshStandardMaterial({ color: 0xaaa59b, roughness: 0.9, side: 2 });
const boardMat = new MeshStandardMaterial({ color: 0xb08a5e, roughness: 0.75 });

export function Ground() {
  const { mats, lowEnd } = useWorld();
  const geo = useMemo(() => buildGround(lowEnd ? 2 : 1), [lowEnd]);
  // the city's land, one texel per 6-unit cell of the land-use raster, for the ground shader: yards and gardens there,
  // plain ground elsewhere
  const zone = useMemo(() => {
    const { grid } = terrainRaster();
    const data = new Uint8Array(grid.nx * grid.nz);
    for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) data[j * grid.nx + i] = landClass(grid.x0 + i * grid.step, grid.z0 + j * grid.step) > 0 ? 255 : 0;
    const tex = new DataTexture(data, grid.nx, grid.nz, RedFormat);
    tex.magFilter = tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    return { tex, box: [grid.x0 - grid.step / 2, grid.z0 - grid.step / 2, grid.nx * grid.step, grid.nz * grid.step] as const };
  }, []);
  const basin = useMemo(() => basinMask(), []);
  useEffect(() => {
    const u = mats.ground.userData as { zone: { value: Texture }; zoneBox: { value: Vector4 }; basin: { value: Texture }; basinBox: { value: Vector4 } };
    u.zone.value = zone.tex;
    u.zoneBox.value.set(...zone.box);
    u.basin.value = basin.tex;
    u.basinBox.value.set(...basin.box);
    return () => {
      zone.tex.dispose();
      basin.tex.dispose();
    };
  }, [mats, zone, basin]);
  const wall = useMemo(() => seawall(lowEnd ? 2 : 1), [lowEnd]);
  // the lawns merged by 240-unit tile of their parks' centres: a few draw calls, each tile still culled when out of view
  const lawns = useMemo(() => {
    const tiles = new Map<number, BufferGeometry[]>();
    for (const p of PARKS) {
      const g = p.poly ? polyLawn(p.poly, lowEnd ? 2 : 1) : lawn(p.x, p.z, p.r);
      // the same attributes for every one, so they merge
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
      if (!n.attributes.normal) n.computeVertexNormals();
      const key = Math.floor(p.x / 240) * 1000 + Math.floor(p.z / 240);
      const list = tiles.get(key);
      if (list) list.push(n);
      else tiles.set(key, [n]);
    }
    // downtown's open places (commonsGround.ts) in the tile of the city's middle
    const commons = commonsLawn(commonsGround(getCityData(lowEnd), lowEnd), (x, z) => surfaceAt(x, z, lowEnd ? 2 : 1)).toNonIndexed();
    const mid = tiles.get(0) ?? [];
    mid.push(commons);
    tiles.set(0, mid);
    return [...tiles.values()].map((list) => {
      const one = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      return one;
    });
  }, [lowEnd]);
  const walks = useMemo(() => {
    // the promenade where it runs on land; over the water it is the harbourfront's own deck
    const onLand: ParkPath[] = [];
    let run: [number, number][] = [];
    for (const p of PROMENADE) {
      if (sdfAt(p[0], p[1]) > 0.6) run.push(p);
      else {
        if (run.length > 1) onLand.push({ pts: run, w: PROMENADE_W });
        run = [];
      }
    }
    if (run.length > 1) onLand.push({ pts: run, w: PROMENADE_W });
    return parkPaths([...PARKS.flatMap((p) => p.paths ?? []), ...SEAWALL, ...onLand], lowEnd ? 2 : 1);
  }, [lowEnd]);
  const forest = useMemo(() => forestFloor(), []);
  // the ground, forest floor and lawns lie flat: the water mirrors what stands on them
  const flat = useRef<Group>(null);
  useEffect(() => skipInMirror(flat.current), []);
  useEffect(
    () => () => {
      geo.dispose();
      for (const l of lawns) l.dispose();
      walks.paths?.dispose();
      walks.bridges?.dispose();
      wall.dispose();
      forest.dispose();
    },
    [geo, lawns, walks, wall, forest],
  );
  return (
    <>
      <group ref={flat}>
        <mesh geometry={geo} material={mats.ground} receiveShadow />
        <mesh geometry={forest} material={mats.forestFloor} receiveShadow />
        {lawns.map((l, i) => (
          <mesh key={i} geometry={l} material={mats.park} receiveShadow />
        ))}
        {walks.paths && <mesh geometry={walks.paths} material={pavingMat} receiveShadow />}
        {walks.bridges && <mesh geometry={walks.bridges} material={boardMat} castShadow receiveShadow />}
      </group>
      {/* the seawall stands up out of the water, so the mirror shows it */}
      <mesh geometry={wall} material={wallMat} receiveShadow />
    </>
  );
}
