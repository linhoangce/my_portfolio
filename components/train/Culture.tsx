"use client";

import { useEffect, useMemo } from "react";
import { type BufferGeometry, Mesh, PlaneGeometry } from "three";

import { getCityData } from "./cityData";
import { FEATURES, type Feature } from "./commonsLayout";
import { artMaterial } from "./cultureArt";
import { A, banner, bigHouse, flagPole, moonGate, muralWall, P, plaque, spindleWhorl, taikoStage, welcomeFigure } from "./cultureKit";
import { junction, roads, WALK } from "./roadNetwork";
import { inLandmark, inPark } from "./sites";
import { merge } from "./shapes";
import { inWater, surfaceAt } from "./terrain";
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
      const y = surfaceAt(f.x, f.z, stride) + (ON_PAVING.has(f.site) ? 0.12 : 0.02);
      for (const g of partsOf(f)) parts.push(g.rotateY(f.ry ?? 0).translate(f.x, y, f.z));
    }
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
