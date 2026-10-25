"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BoxGeometry, type BufferGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

import { getCityData } from "./cityData";
import { FEATURES, type Feature } from "./commonsLayout";
import { SEA } from "./constants";
import { artMaterial, MURAL0, PLAQUE_ASPECT, plaqueRect } from "./cultureArt";
import { PIER_COUNT, PIER_R, pierAt } from "./Guideway";
import { muralsOf } from "./muralArt";
import { makeFrame } from "./track";
import { DEV_PIECES } from "./buildings/developments";
import { SCULPTURES, towerFace, TOWERS } from "./buildings/senakw";
import { A, banner, bigHouse, canoeHull, carvedPost, fireCircle, flagPole, moonGate, muralWall, P, plaque, reconciliationMonument, spindleWhorl, taikoStage, towerForm, welcomeFigure } from "./cultureKit";
import { drapeDisc } from "./drape";
import { junction, roads, WALK } from "./roadNetwork";
import { FORECOURT_DECK, QUAY_Y, standY } from "./harbourfront";
import { inLandmark, inPark, LANDMARKS } from "./sites";
import { merge } from "./shapes";
import { inWater, polySdf, surfaceAt } from "./terrain";
import { ART_LIGHTS, placeLight, type Pool, poolOf, uplight } from "./uplight";
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

/**
 * The canoe landing (its feature: centre, width across, length toward the water; its ry points it down to the water):
 * broad timber steps from the forecourt deck's water edge down to the harbour, on piles, to a float where two journey
 * canoes are drawn up, bows to the land.
 */
function canoeLanding(f: Feature): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const w = f.w ?? 15;
  const len = f.d ?? 19;
  const ry = f.ry ?? 0;
  // local (u across, v down to the water) → world
  const dx = Math.sin(ry);
  const dz = Math.cos(ry);
  const W = (u: number, v: number): [number, number] => [f.x + u * dz + v * dx, f.z - u * dx + v * dz];
  const box = (geo: BufferGeometry, u: number, y: number, v: number, hex: number) => {
    const [x, z] = W(u, v);
    out.push(P(geo.rotateY(ry), hex).translate(x, y, z));
  };
  // where the deck ends down the middle
  let vWater = len / 2;
  for (let v = -len / 2; v <= len / 2; v += 0.25) {
    if (polySdf(FORECOURT_DECK, ...W(0, v)) > 0) {
      vWater = v;
      break;
    }
  }
  const n = 7;
  const run = 0.9;
  for (let k = 0; k < n; k++) {
    const v0 = vWater + k * run;
    const top = QUAY_Y - ((QUAY_Y - SEA - 0.35) * (k + 1)) / n;
    const bottom = SEA - 1.2;
    box(new BoxGeometry(w, top - bottom, run + 0.02), 0, (top + bottom) / 2, v0 + run / 2, k % 2 ? 0x8b6440 : 0x9a7048);
    box(new BoxGeometry(w, 0.06, 0.18), 0, top + 0.03, v0 + 0.09, 0xc9b48f);
  }
  const vWaterEnd = vWater + n * run;
  // the float on its piles, and the canoes drawn up to it, bows to the land
  const fv = vWaterEnd + 2.2;
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
function partsOf(f: Feature, lowEnd: boolean): BufferGeometry[] {
  switch (f.kind) {
    case "welcome":
      return welcomeFigure(f.quarter ?? 0);
    case "plaque":
      return f.quarter === undefined ? plaque(f.cell ?? 0, undefined, f.w ?? 1.4, f.w ?? 1.4) : plaque(f.cell ?? 0, plaqueRect(f.quarter), f.w ?? 1.4, (f.w ?? 1.4) / PLAQUE_ASPECT);
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
    case "monument":
      return reconciliationMonument(lowEnd);
    case "post":
      return carvedPost();
    case "fire":
      return fireCircle();
    default:
      return [];
  }
}

/** The pools of light round the lit pieces, merged per 240-unit tile so each tile culls by its own bounds. */
const POOL_TILE = 240;
/** The pools' warm light, at full strength at their centres. */
const POOL_RGB: [number, number, number] = [0.5, 0.33, 0.16];

/**
 * The city's culture in public (commonsLayout.ts lists the sites, cultureKit.ts builds their pieces, cultureArt.ts
 * paints their art), with every mural on the city's side walls (city.ts picks the walls) and the Pride crosswalks: a
 * few thousand triangles in all, so one mesh on the art atlas's one material, one draw wherever the camera is.
 *
 * After dark the public art is lit from fixtures on the ground (uplight.ts), and each lit piece, here, in the Commons
 * and on the harbourfront, stands in a warm pool of light: the pools are drawn additively, a tile at a time, and only
 * at night.
 */
export function Culture() {
  const world = useWorld();
  const { lowEnd } = world;
  const built = useMemo(() => {
    const stride = lowEnd ? 2 : 1;
    const parts: BufferGeometry[] = [];
    const pools: Pool[] = [];
    // a lit piece: its fixtures on the ground (or on its own step), their light baked into its parts, its pool
    const light = (kind: string, piece: BufferGeometry[], x: number, y: number, z: number, ry: number, lift: number) => {
      const spec = ART_LIGHTS[kind];
      if (!spec) return;
      const { spots, parts: fixtures } = placeLight(spec, x, y, z, ry, (px, pz) => surfaceAt(px, pz, stride) + lift, P);
      uplight(piece, spots, spec.gain);
      parts.push(...fixtures);
      const pool = poolOf(spec, x, z, ry);
      if (pool) pools.push(pool);
    };
    for (const f of FEATURES) {
      if (!f.site) continue;
      if (f.kind === "landing") {
        parts.push(...canoeLanding(f));
        continue;
      }
      // on the forecourt, a piece stands on its deck or on the rim behind it (harbourfront.ts)
      const forecourt = f.site === "forecourt";
      const lift = forecourt ? 0.13 : ON_PAVING.has(f.site) ? 0.12 : 0.02;
      const y = forecourt ? standY(f.x, f.z) + 0.02 : surfaceAt(f.x, f.z, stride) + lift;
      const piece = partsOf(f, lowEnd).map((g) => g.rotateY(f.ry ?? 0).translate(f.x, y, f.z));
      light(f.kind, piece, f.x, y, f.z, f.ry ?? 0, lift);
      parts.push(...piece);
    }
    // the art at the developments placed by hand (developments.ts): senákw's welcome figures and spindle whorl, the
    // basket tower's carved post, Chinatown's moon gate
    for (const d of DEV_PIECES) {
      const y = surfaceAt(d.x, d.z, stride) + 0.02;
      const piece = partsOf({ kind: d.kind, x: d.x, z: d.z, ry: d.ry, quarter: d.quarter, w: d.w }, lowEnd).map((g) => g.rotateY(d.ry).translate(d.x, y, d.z));
      light(d.kind, piece, d.x, y, d.z, d.ry, 0.02);
      parts.push(...piece);
    }
    // the sculpted forms on the towers after senákw, standing out from their faces, each lit from two fixtures held
    // out from the face below it
    for (const sc of SCULPTURES) {
      const f = towerFace(TOWERS[sc.tower], sc.face, sc.at, lowEnd);
      const out = 0.12;
      const ry = Math.atan2(f.nx, f.nz);
      const form = [towerForm(sc.white, sc.flip).rotateY(ry).translate(f.x + f.nx * out, f.y, f.z + f.nz * out)];
      light("form", form, f.x, f.y, f.z, ry, 0);
      parts.push(...form);
    }
    // the Commons' sculptures and the harbourfront's (lit where they are drawn) stand in their pools too
    for (const f of FEATURES) {
      const spec = !f.site ? ART_LIGHTS[f.kind] : undefined;
      const pool = spec && poolOf(spec, f.x, f.z, f.ry ?? 0);
      if (pool) pools.push(pool);
    }
    for (const l of LANDMARKS) {
      const spec = l.key === "orca" || l.key === "cauldron" ? ART_LIGHTS[l.key] : undefined;
      const pool = spec && poolOf(spec, l.px, l.pz, l.yaw ?? 0);
      if (pool) pools.push(pool);
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
    const m = new Mesh(merge(parts), artMaterial(lowEnd, world));
    m.name = "culture";
    m.receiveShadow = true;
    m.castShadow = !lowEnd;
    // the pools: a disc draped on the drawn ground under each lit piece, its light fading to its rim, a mesh per tile
    const poolMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false, toneMapped: false });
    const tiles = new Map<string, BufferGeometry[]>();
    for (const p of pools) {
      const key = `${Math.floor(p.x / POOL_TILE)},${Math.floor(p.z / POOL_TILE)}`;
      const disc = drapeDisc(p.x, p.z, p.r, 0.18, stride, POOL_RGB, lowEnd ? 3 : 4, lowEnd ? 14 : 20);
      tiles.set(key, [...(tiles.get(key) ?? []), disc]);
    }
    const group = new Group();
    group.name = "artPools";
    for (const geos of tiles.values()) {
      const tile = new Mesh(merge(geos), poolMat);
      tile.renderOrder = 2;
      group.add(tile);
    }
    group.visible = false;
    return { mesh: m, pools: group, poolMat };
  }, [lowEnd, world]);

  // after dark only, as bright as the shops' lights
  useFrame(() => {
    const v = world.shopGlow.value;
    built.pools.visible = v > 0.03;
    built.poolMat.opacity = Math.min(1, v);
  });

  // low or flat on walls: none of it shows in the water at the distance it would
  useEffect(() => skipInMirror(built.mesh, built.pools), [built]);
  useEffect(
    () => () => {
      built.mesh.geometry.dispose();
      built.pools.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      built.poolMat.dispose();
    },
    [built],
  );

  return (
    <>
      <primitive object={built.mesh} />
      <primitive object={built.pools} />
    </>
  );
}
