"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, type BufferGeometry, CylinderGeometry, Mesh, PlaneGeometry } from "three";

import { getCityData } from "./cityData";
import { FEATURES, type Feature } from "./commonsLayout";
import { SEA } from "./constants";
import { artMaterial, MURAL0 } from "./cultureArt";
import { PIER_COUNT, PIER_R, pierAt } from "./Guideway";
import { muralsOf } from "./muralArt";
import { makeFrame } from "./track";
import { SCULPTURES, towerFace, TOWERS } from "./buildings/senakw";
import { A, banner, bigHouse, canoeHull, carvedPost, fireCircle, flagPole, longhouse, moonGate, muralWall, P, plaque, spindleWhorl, taikoStage, towerForm, welcomeFigure } from "./cultureKit";
import { junction, roads, WALK } from "./roadNetwork";
import { inLandmark, inPark } from "./sites";
import { merge } from "./shapes";
import { groundAt, inWater, sdfAt, surfaceAt } from "./terrain";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/**
 * The Progress Pride crosswalks, there all year: on every road into the junction nearest Davie & Bute (the Davie
 * Village's own), Main Street–Science World, Commercial–Broadway and Burrard stations. Each is the chevron's colours
 * (black, brown, light blue, pink, white) then the rainbow's, band by band away from the junction over the zebra.
 */
const PRIDE_AT: [number, number][] = [
  [-171, 59],
  [100, 150],
  [338, 292],
  [-61, 12],
];
const PRIDE_BANDS = [0x000000, 0x613915, 0x5bcefa, 0xf5a9b8, 0xffffff, 0xe40303, 0xff8c00, 0xffed00, 0x008026, 0x004dff, 0x750787];

function prideCrossings(stride: number): BufferGeometry[] {
  const { nodes, edges } = roads();
  const onStreet = (x: number, z: number) => !inPark(x, z) && !inWater(x, z) && !inLandmark(x, z, 2);
  const out: BufferGeometry[] = [];
  const used = new Set<number>();
  for (const [tx, tz] of PRIDE_AT) {
    let ni = -1;
    let bd = 1e9;
    nodes.forEach((nd, i) => {
      if (nd.deg < 3 || !onStreet(nd.x, nd.z)) return;
      const d = Math.hypot(nd.x - tx, nd.z - tz);
      if (d < bd && junction(i)) {
        bd = d;
        ni = i;
      }
    });
    const j = ni >= 0 && !used.has(ni) ? junction(ni) : null;
    if (!j) continue;
    used.add(ni);
    for (const [k, setback] of j.setback) {
      const e = edges[k];
      // only where the road is drawn there
      if (!e.shown.every((v) => v === 1)) continue;
      const n = e.pts.length / 2;
      const [x0, z0, x1, z1] = e.a === ni ? [e.pts[0], e.pts[1], e.pts[2], e.pts[3]] : [e.pts[n * 2 - 2], e.pts[n * 2 - 1], e.pts[n * 2 - 4], e.pts[n * 2 - 3]];
      const L = Math.hypot(x1 - x0, z1 - z0) || 1;
      const ux = (x1 - x0) / L;
      const uz = (z1 - z0) / L;
      const across = 2 * (e.half - WALK[e.cls]);
      const w = 0.2;
      PRIDE_BANDS.forEach((hex, b) => {
        const d = setback + 0.25 + w * (b + 0.5);
        const x = j.x + ux * d;
        const z = j.z + uz * d;
        // laid flat, its length across the road (along its normal (-u.z, u.x))
        out.push(P(new PlaneGeometry(across, w).rotateX(-Math.PI / 2).rotateY(Math.atan2(-ux, -uz)).translate(x, surfaceAt(x, z, stride) + 0.12, z), hex));
      });
    }
  }
  return out;
}

/** The highest ground (true or as drawn) over a box of half-sizes hx, hz about (x, z). */
function highest(x: number, z: number, hx: number, hz: number, lowEnd: boolean): number {
  let top = -Infinity;
  for (let u = -1; u <= 1.001; u += 0.5) {
    for (let v = -1; v <= 1.001; v += 0.5) {
      const px = x + u * hx;
      const pz = z + v * hz;
      top = Math.max(top, groundAt(px, pz), lowEnd ? surfaceAt(px, pz, 2) : -Infinity);
    }
  }
  return top;
}

/**
 * The canoe landing (its feature: centre, width across, length down the slope; its ry points it down to the water):
 * broad timber steps laid down the slope, each on the highest ground under it and reaching below the lowest, to a
 * float on piles in the water where two journey canoes are drawn up, bows to the land.
 */
function canoeLanding(f: Feature, lowEnd: boolean): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const w = f.w ?? 15;
  const len = f.d ?? 19;
  const ry = f.ry ?? 0;
  // local (u across, v down the slope) → world
  const dx = Math.sin(ry);
  const dz = Math.cos(ry);
  const W = (u: number, v: number): [number, number] => [f.x + u * dz + v * dx, f.z - u * dx + v * dz];
  const box = (geo: BufferGeometry, u: number, y: number, v: number, hex: number) => {
    const [x, z] = W(u, v);
    out.push(P(geo.rotateY(ry), hex).translate(x, y, z));
  };
  // where the water starts down the middle
  let vWater = len / 2;
  for (let v = -len / 2; v <= len / 2 + 6; v += 0.5) {
    const [x, z] = W(0, v);
    if (sdfAt(x, z) < 0 && surfaceAt(x, z, lowEnd ? 2 : 1) < SEA + 0.4) {
      vWater = v;
      break;
    }
  }
  const n = 9;
  const run = (vWater + len / 2) / n;
  let prev = Infinity;
  for (let k = 0; k < n; k++) {
    const v0 = -len / 2 + k * run;
    let hi = -Infinity;
    let lo = Infinity;
    for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 6) {
      for (const v of [v0, v0 + run / 2, v0 + run]) {
        const [x, z] = W(u, v);
        const g = groundAt(x, z);
        const s = lowEnd ? surfaceAt(x, z, 2) : g;
        hi = Math.max(hi, g, s);
        lo = Math.min(lo, g, s);
      }
    }
    const top = Math.max(SEA + 0.35, Math.min(prev - 0.25, hi + 0.18));
    prev = top;
    const bottom = Math.min(lo, top) - 1.2;
    box(new BoxGeometry(w, top - bottom, run + 0.02), 0, (top + bottom) / 2, v0 + run / 2, k % 2 ? 0x8b6440 : 0x9a7048);
    box(new BoxGeometry(w, 0.06, 0.18), 0, top + 0.03, v0 + 0.09, 0xc9b48f);
  }
  // the float on its piles, and the canoes drawn up to it, bows to the land
  const fv = vWater + 2.2;
  box(new BoxGeometry(w + 2, 0.5, 4.4), 0, SEA + 0.2, fv, 0x7d6650);
  for (const u of [-w / 2 - 0.6, w / 2 + 0.6]) for (const v of [fv - 1.9, fv + 1.9]) box(new CylinderGeometry(0.22, 0.22, 3, 6), u, SEA - 0.6, v, 0x5a4636);
  for (const u of [-3.2, 3.2]) {
    const [x, z] = W(u, fv + 1.2);
    for (const g of canoeHull()) out.push(g.rotateY(ry + Math.PI).translate(x, SEA + 0.12, z));
  }
  return out;
}

/** The columns in woven sleeves: those nearest Main Street–Science World station (data/index.ts, km × 110), up to n. */
const SLEEVES = { x: 94, z: 159, r: 110, n: 5 };

/** The sites laid on a set's paving, which stands a little over the ground (sets/build.ts paveSquare). */
const ON_PAVING = new Set(["waterfront", "harbour", "commercial"]);

/** A culture piece's parts, about its own origin. */
function partsOf(f: Feature): BufferGeometry[] {
  switch (f.kind) {
    case "welcome":
      return welcomeFigure(f.quarter ?? 0);
    case "plaque":
      return plaque(f.cell ?? 0, f.quarter === undefined ? undefined : [(f.quarter % 2) * 0.5, Math.floor(f.quarter / 2) * 0.5, (f.quarter % 2) * 0.5 + 0.5, Math.floor(f.quarter / 2) * 0.5 + 0.5], f.w ?? 1.4, f.w ?? 1.4);
    case "flag":
      return flagPole(f.cell ?? 0);
    case "whorl":
      return spindleWhorl();
    case "bighouse":
      return bigHouse(f.w, f.d);
    case "moongate":
      return moonGate(f.w);
    case "taiko":
      return taikoStage();
    case "banner":
      return banner(f.cell ?? 0);
    case "mural":
      return muralWall(f.cell ?? 0, f.w);
    case "longhouse":
      return longhouse(f.w, f.d);
    case "post":
      return carvedPost();
    case "fire":
      return fireCircle();
    default:
      return [];
  }
}

/**
 * The city's culture in public (commonsLayout.ts lists the sites, cultureKit.ts builds their pieces, cultureArt.ts
 * paints their art), with every mural on the city's side walls (city.ts picks the walls) and the Pride crosswalks: a
 * few thousand triangles in all, so one mesh on the art atlas's one material, one draw wherever the camera is.
 */
export function Culture() {
  const world = useWorld();
  const { lowEnd } = world;
  const mesh = useMemo(() => {
    const stride = lowEnd ? 2 : 1;
    const parts: BufferGeometry[] = [];
    for (const f of FEATURES) {
      if (!f.site) continue;
      if (f.kind === "landing") {
        parts.push(...canoeLanding(f, lowEnd));
        continue;
      }
      // on a slope (the forecourt's), a piece stands on the highest ground under it: its platform reaches down
      const y = f.site === "forecourt" ? highest(f.x, f.z, (f.w ?? 2) / 2 + 0.6, (f.d ?? 2) / 2 + 0.6, lowEnd) + 0.05 : surfaceAt(f.x, f.z, stride) + (ON_PAVING.has(f.site) ? 0.12 : 0.02);
      for (const g of partsOf(f)) parts.push(g.rotateY(f.ry ?? 0).translate(f.x, y, f.z));
    }
    // the sculpted forms on the towers after senákw, standing out from their faces
    for (const sc of SCULPTURES) {
      const f = towerFace(TOWERS[sc.tower], sc.face, sc.at, lowEnd);
      const out = 0.12;
      parts.push(towerForm(sc.white, sc.flip).rotateY(Math.atan2(f.nx, f.nz)).translate(f.x + f.nx * out, f.y, f.z + f.nz * out));
    }
    // the Expo Line's columns round Main Street–Science World station painted in weavings, after the Musqueam weavers
    // who paint the city's columns: each its own blanket (the last of the weavings, the city's walls take the first)
    const f = makeFrame();
    const near: { d: number; gy: number; top: number; x: number; z: number }[] = [];
    for (let i = 0; i < PIER_COUNT; i++) {
      const p = pierAt(i, f);
      const d = Math.hypot(f.p.x - SLEEVES.x, f.p.z - SLEEVES.z);
      if (p.show && d < SLEEVES.r && p.colTop - p.gy > 4) near.push({ d, gy: p.gy, top: p.colTop, x: f.p.x, z: f.p.z });
    }
    const weaves = muralsOf("weave").reverse();
    near
      .sort((a, b) => a.d - b.d)
      .slice(0, SLEEVES.n)
      .forEach((c, k) => {
        const y0 = c.gy + 0.2;
        const y1 = c.gy + Math.min(9, c.top - c.gy - 0.6);
        const r = (y: number) => PIER_R[0] + ((PIER_R[1] - PIER_R[0]) * (y - c.gy + 0.3)) / (c.top - c.gy + 0.3) + 0.04;
        const sleeve = new CylinderGeometry(r(y1), r(y0), y1 - y0, 16, 1, true).translate(c.x, (y0 + y1) / 2, c.z);
        parts.push(A(sleeve, MURAL0 + weaves[k % weaves.length]));
      });
    // the murals, square, each facing out from its wall, and the Pride crosswalks
    for (const m of getCityData(lowEnd).murals) parts.push(A(new PlaneGeometry(m.w ?? m.s, m.s), m.cell).rotateY(m.ry).translate(m.x, m.y, m.z));
    parts.push(...prideCrossings(stride));
    const m = new Mesh(merge(parts), artMaterial(lowEnd));
    m.name = "culture";
    m.receiveShadow = true;
    m.castShadow = !lowEnd;
    return m;
  }, [lowEnd]);

  // low or flat on walls: none of it shows in the water at the distance it would
  useEffect(() => skipInMirror(mesh), [mesh]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);

  return <primitive object={mesh} />;
}
