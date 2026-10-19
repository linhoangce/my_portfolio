import { buildCity, type CityGeometry } from "./buildings/city";
import { buildCars, buildPeople, type CarRun, type Person, Rng } from "./cityModel";
import { placeTrees, type TreeInst } from "./trees/placement";
import { SPECIES, SPECIES_INDEX } from "./trees/species";

export type LifeData = { cars: CarRun[]; people: Person[]; counts: number[] };

const cityCache = new Map<boolean, CityGeometry>();
const lifeCache = new Map<boolean, LifeData>();
const treeCache = new Map<boolean, TreeInst[]>();

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
    const cars = buildCars(new Rng(2), lowEnd ? 200 : 420);
    const { people, counts } = buildPeople(new Rng(3), lowEnd ? 220 : 460);
    data = { cars, people, counts };
    lifeCache.set(lowEnd, data);
  }
  return data;
}
