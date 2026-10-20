import { buildCity, type CityGeometry } from "./buildings/city";
import { buildCars, buildPeople, type CarRun, type Person, Rng } from "./cityModel";
import { GRID } from "./constants";
import { fromStation, inSetZone, SET_TREES } from "./sets/zones";
import { inLandmark, inPark } from "./sites";
import { groundAt, inWater, slopeAt } from "./terrain";
import { trackDist } from "./track";
import { placeTrees, type TreeInst } from "./trees/placement";
import { SPECIES, SPECIES_INDEX } from "./trees/species";

export type LifeData = { cars: CarRun[]; people: Person[]; counts: number[] };

const cityCache = new Map<boolean, CityGeometry>();
const lifeCache = new Map<boolean, LifeData>();
const treeCache = new Map<boolean, TreeInst[]>();
const zoneCache = new Map<boolean, Zoning>();

/**
 * Which blocks of the grid are city: one byte per 44 × 22 cell, 255 for city. A street shows wherever it borders a
 * city block, so streets stop at the road round a park rather than fading out, and `shown` answers the same question
 * for the cars and walkers.
 */
export type Zoning = { data: Uint8Array; i0: number; j0: number; ni: number; nj: number; shown: (x: number, z: number, pad?: number) => boolean };

/**
 * A block is city if a lot stands in it and it is not mostly park, a station's set or a monument's grounds; or if it
 * lies along the guideway next to city blocks, so the streets carry on underneath. Woods, slopes and water stay open.
 */
export function getZoning(lowEnd: boolean): Zoning {
  let z = zoneCache.get(lowEnd);
  if (z) return z;
  const { x0, z0, cw, ch, artHalf, locHalf } = GRID;
  const i0 = Math.floor((-520 - x0) / cw) - 1;
  const j0 = Math.floor((-450 - z0) / ch) - 1;
  const ni = Math.floor((1000 - x0) / cw) + 2 - i0;
  const nj = Math.floor((860 - z0) / ch) + 2 - j0;
  const city = getCityData(lowEnd);
  const t0 = performance.now();
  const has = new Uint8Array(ni * nj);
  for (const l of city.lots) {
    const ia = Math.floor((l.x - l.w / 2 + 0.5 - x0) / cw) - i0;
    const ib = Math.floor((l.x + l.w / 2 - 0.5 - x0) / cw) - i0;
    const ja = Math.floor((l.z - l.d / 2 + 0.5 - z0) / ch) - j0;
    const jb = Math.floor((l.z + l.d / 2 - 0.5 - z0) / ch) - j0;
    for (let i = Math.max(0, ia); i <= Math.min(ni - 1, ib); i++) for (let j = Math.max(0, ja); j <= Math.min(nj - 1, jb); j++) has[j * ni + i] = 1;
  }
  const data = new Uint8Array(ni * nj);
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const cx = x0 + (i0 + i + 0.5) * cw;
      const cz = z0 + (j0 + j + 0.5) * ch;
      let kept = 0;
      let open = 0;
      for (const dx of [-14, 0, 14]) {
        for (const dz of [-7, 0, 7]) {
          const x = cx + dx;
          const y = cz + dz;
          if (inPark(x, y) || inLandmark(x, y, 1) || inSetZone(x, y, 2)) kept++;
          else if (inWater(x, y) || slopeAt(x, y) > 0.32) open++;
        }
      }
      let city = false;
      if (has[j * ni + i]) city = kept <= 4;
      else if (kept + open <= 3 && trackDist(cx, cz) < 26) {
        for (let a = -1; a <= 1 && !city; a++) for (let b = -1; b <= 1 && !city; b++) city = !!has[Math.min(nj - 1, Math.max(0, j + b)) * ni + Math.min(ni - 1, Math.max(0, i + a))];
      }
      data[j * ni + i] = city ? 255 : 0;
    }
  }
  const at = (i: number, j: number) => {
    const a = i - i0;
    const b = j - j0;
    return a >= 0 && b >= 0 && a < ni && b < nj && data[b * ni + a] > 0;
  };
  const shown = (x: number, zz: number, pad = 0) => {
    const ci = Math.floor((x - x0) / cw);
    const cj = Math.floor((zz - z0) / ch);
    const fx = x - x0 - ci * cw;
    const fz = zz - z0 - cj * ch;
    // the lower edge of an odd row is an arterial, the upper edge of an even one
    const odd = ((cj % 2) + 2) % 2 === 1;
    const lo = (odd ? artHalf : locHalf) + pad;
    const hi = (odd ? locHalf : artHalf) + pad;
    const nx = fx < artHalf + pad ? -1 : fx > cw - artHalf - pad ? 1 : 0;
    const nz = fz < lo ? -1 : fz > ch - hi ? 1 : 0;
    return at(ci, cj) || (nx !== 0 && at(ci + nx, cj)) || (nz !== 0 && at(ci, cj + nz)) || (nx !== 0 && nz !== 0 && at(ci + nx, cj + nz));
  };
  z = { data, i0, j0, ni, nj, shown };
  city.phases.zoning = Math.round(performance.now() - t0);
  zoneCache.set(lowEnd, z);
  return z;
}

/** The city is built once per budget and shared by the building, house, tree and camera code. */
export function getCityData(lowEnd: boolean): CityGeometry {
  let data = cityCache.get(lowEnd);
  if (!data) {
    data = buildCity(new Rng(1), lowEnd);
    cityCache.set(lowEnd, data);
  }
  return data;
}

/** Trees are placed after the city so they keep out of every lot; terrace trees ride on the 2100 buildings. */
export function getTreeData(lowEnd: boolean): TreeInst[] {
  let data = treeCache.get(lowEnd);
  if (!data) {
    const city = getCityData(lowEnd);
    data = placeTrees(new Rng(4), lowEnd, city.lots);
    for (const t of city.terrace) data.push({ x: t.x, y: t.y - 0.05, z: t.z, sp: SPECIES_INDEX[t.sp], s: (t.s * 6) / SPECIES[SPECIES_INDEX[t.sp]].size[1] });
    for (const t of SET_TREES) {
      const [x, z] = fromStation(t.i, t.a, t.l);
      const sp = SPECIES_INDEX[t.sp];
      data.push({ x, y: groundAt(x, z) - 0.2, z, sp, s: t.h / SPECIES[sp].size[1] });
    }
    treeCache.set(lowEnd, data);
  }
  return data;
}

export function getLifeData(lowEnd: boolean): LifeData {
  let data = lifeCache.get(lowEnd);
  if (!data) {
    const t0 = performance.now();
    const { shown } = getZoning(lowEnd);
    const cars = buildCars(new Rng(2), lowEnd ? 200 : 420, shown);
    const { people, counts } = buildPeople(new Rng(3), lowEnd ? 220 : 460, shown);
    data = { cars, people, counts };
    getCityData(lowEnd).phases.life = Math.round(performance.now() - t0);
    lifeCache.set(lowEnd, data);
  }
  return data;
}
