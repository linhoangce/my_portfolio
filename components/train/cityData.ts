import { buildCity, type CityGeometry } from "./buildings/city";
import { buildPeople, type Person, Rng } from "./cityModel";
import { commonsGround } from "./commonsGround";
import { harbourfrontTrees } from "./harbourfront";
import { squareTrees } from "./sets/squares";
import { scienceWorldTrees } from "./sites";
import { groundAt } from "./terrain";
import { placeTrees, type TreeInst } from "./trees/placement";
import { SPECIES, SPECIES_INDEX } from "./trees/species";
import { Traffic } from "./traffic";
import { hubTrees } from "./waterfrontHub";

export type LifeData = { traffic: Traffic; people: Person[]; counts: number[] };

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
    const harbour = [...harbourfrontTrees(), ...squareTrees(), ...commonsGround(city, lowEnd).trees].map((t) => ({ ...t, y: groundAt(t.x, t.z) }));
    for (const t of [...city.terrace, ...hubTrees(), ...scienceWorldTrees(), ...harbour]) data.push({ x: t.x, y: t.y - 0.05, z: t.z, sp: SPECIES_INDEX[t.sp], s: (t.s * 6) / SPECIES[SPECIES_INDEX[t.sp]].size[1] });
    treeCache.set(lowEnd, data);
  }
  return data;
}

export function getLifeData(lowEnd: boolean): LifeData {
  let data = lifeCache.get(lowEnd);
  if (!data) {
    const t0 = performance.now();
    const traffic = new Traffic(lowEnd ? 420 : 900, new Rng(2), (i) => new Rng(1000 + i), lowEnd ? 12 : 28);
    const { people, counts } = buildPeople(new Rng(3), lowEnd ? 340 : 620, commonsGround(getCityData(lowEnd), lowEnd).covered);
    data = { traffic, people, counts };
    getCityData(lowEnd).phases.life = Math.round(performance.now() - t0);
    lifeCache.set(lowEnd, data);
  }
  return data;
}
