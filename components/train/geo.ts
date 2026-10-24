/**
 * The world projection: x east, z south, K units per kilometre, origin at the Waterfront station node that the
 * OpenStreetMap alignment was resampled from (so `data/index.ts` station km values and the bake agree exactly).
 */
export const ORIGIN_LAT = 49.2861789;
export const ORIGIN_LON = -123.112219;
export const KM_LAT = 111.2;
export const KM_LON = 111.32 * Math.cos((ORIGIN_LAT * Math.PI) / 180);
export const K = 110;

export const llToXZ = (lat: number, lon: number): [number, number] => [(lon - ORIGIN_LON) * KM_LON * K, (ORIGIN_LAT - lat) * KM_LAT * K];
export const xzToLL = (x: number, z: number): [number, number] => [ORIGIN_LAT - z / K / KM_LAT, ORIGIN_LON + x / K / KM_LON];
