import { buildCars, buildCity, buildPeople, type CarRun, type CityData, type Person, Rng } from "./cityModel";

export type LifeData = { cars: CarRun[]; people: Person[]; counts: number[] };

const cityCache = new Map<boolean, CityData>();
const lifeCache = new Map<boolean, LifeData>();

/** The city is built once per budget and shared by the building, house and tree meshes. */
export function getCityData(lowEnd: boolean): CityData {
  let data = cityCache.get(lowEnd);
  if (!data) {
    data = buildCity(new Rng(1), lowEnd);
    cityCache.set(lowEnd, data);
  }
  return data;
}

export function getLifeData(lowEnd: boolean): LifeData {
  let data = lifeCache.get(lowEnd);
  if (!data) {
    const cars = buildCars(new Rng(2), lowEnd ? 260 : 560);
    const { people, counts } = buildPeople(new Rng(3), lowEnd ? 220 : 460);
    data = { cars, people, counts };
    lifeCache.set(lowEnd, data);
  }
  return data;
}
