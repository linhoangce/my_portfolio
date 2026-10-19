import { buildCity, type CityGeometry, type Lot } from "./buildings/city";
import { buildCars, buildPeople, type CarRun, type Person, Rng } from "./cityModel";
import { inSetZone } from "./sets/zones";
import { inLandmark, inPark } from "./sites";
import { inWater, slopeAt } from "./terrain";
import { placeTrees, type TreeInst } from "./trees/placement";
import { SPECIES, SPECIES_INDEX } from "./trees/species";

export type LifeData = { cars: CarRun[]; people: Person[]; counts: number[] };

const cityCache = new Map<boolean, CityGeometry>();
const lifeCache = new Map<boolean, LifeData>();
const treeCache = new Map<boolean, TreeInst[]>();
const maskCache = new Map<boolean, (x: number, z: number) => number>();

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Where the streets are, 0 to 1: among the city's lots (and so under the guideway between them), but not in parks or
 * the woods, under a station's set piece, on a monument's grounds or up a steep slope. The ground paints its street
 * tile only there; cars and pedestrians keep to it.
 */
export function getStreetMask(lowEnd: boolean): (x: number, z: number) => number {
  let mask = maskCache.get(lowEnd);
  if (!mask) {
    const CELL = 16;
    const grid = new Map<number, Lot[]>();
    const key = (i: number, j: number) => i * 8192 + j;
    for (const l of getCityData(lowEnd).lots) {
      for (let i = Math.floor((l.x - l.w / 2) / CELL); i <= Math.floor((l.x + l.w / 2) / CELL); i++) {
        for (let j = Math.floor((l.z - l.d / 2) / CELL); j <= Math.floor((l.z + l.d / 2) / CELL); j++) {
          const list = grid.get(key(i, j));
          if (list) list.push(l);
          else grid.set(key(i, j), [l]);
        }
      }
    }
    const R = 30;
    mask = (x, z) => {
      if (inWater(x, z) || inPark(x, z) || inLandmark(x, z, 1) || inSetZone(x, z, 3)) return 0;
      const flat = 1 - sstep(0.22, 0.34, slopeAt(x, z));
      if (flat <= 0) return 0;
      let d = Infinity;
      const ci = Math.floor(x / CELL);
      const cj = Math.floor(z / CELL);
      const r = Math.ceil(R / CELL);
      for (let i = ci - r; i <= ci + r; i++) {
        for (let j = cj - r; j <= cj + r; j++) {
          for (const l of grid.get(key(i, j)) ?? []) {
            const dx = Math.max(Math.abs(x - l.x) - l.w / 2, 0);
            const dz = Math.max(Math.abs(z - l.z) - l.d / 2, 0);
            d = Math.min(d, Math.hypot(dx, dz));
          }
        }
      }
      return flat * (1 - sstep(18, R, d));
    };
    maskCache.set(lowEnd, mask);
  }
  return mask;
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
    treeCache.set(lowEnd, data);
  }
  return data;
}

export function getLifeData(lowEnd: boolean): LifeData {
  let data = lifeCache.get(lowEnd);
  if (!data) {
    const t0 = performance.now();
    const mask = getStreetMask(lowEnd);
    const cars = buildCars(new Rng(2), lowEnd ? 200 : 420, mask);
    const { people, counts } = buildPeople(new Rng(3), lowEnd ? 220 : 460, mask);
    data = { cars, people, counts };
    getCityData(lowEnd).phases.life = Math.round(performance.now() - t0);
    lifeCache.set(lowEnd, data);
  }
  return data;
}
