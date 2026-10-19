/**
 * Where the trees go: street trees along every block face (one species per face, as Vancouver plants them), parks,
 * Stanley Park, the Grandview Cut, a rainforest corridor along the guideway through the flats, the North Shore
 * slopes, and sword-fern undergrowth. Never in water, in a lot, on a landmark, on a steep slope or within 12 units of
 * the track; near the guideway the crowns stay below the deck. Pure.
 */
import { arterialX, arterialZ, BI0, BI1, BJ0, BJ1, district, type Rng, streetX, streetZ } from "../cityModel";
import { inLandmark, inPark } from "../sites";
import { groundAt, inWater, sdfAt, slopeAt } from "../terrain";
import { trackDist, trackNearest } from "../track";
import { POOLS, SPECIES, SPECIES_INDEX, type SpeciesId } from "./species";

export type TreeInst = { x: number; y: number; z: number; sp: number; s: number };
type LotBox = { x: number; z: number; w: number; d: number };

const pick = (rng: Rng, pool: [SpeciesId, number][]): SpeciesId => {
  let tot = 0;
  for (const [, w] of pool) tot += w;
  let r = rng.next() * tot;
  for (const [id, w] of pool) {
    r -= w;
    if (r <= 0) return id;
  }
  return pool[0][0];
};

const streetPool = (name: string) =>
  name === "downtown" || name === "westend" ? POOLS.streetDowntown : name === "gastown" ? POOLS.streetHeritage : name === "flats" ? POOLS.streetFlats : POOLS.streetResidential;

export function placeTrees(rng: Rng, lowEnd: boolean, lots: LotBox[]): TreeInst[] {
  const cap = lowEnd ? 9000 : 16000;
  // street trees may use 45 % of the budget; the woods (parks, Stanley Park, the cut, the North Shore) keep the rest
  const streetCap = cap * 0.45;
  const out: TreeInst[] = [];
  const grid = new Map<string, LotBox[]>();
  for (const l of lots) {
    for (let gx = Math.floor((l.x - l.w / 2) / 8); gx <= Math.floor((l.x + l.w / 2) / 8); gx++) {
      for (let gz = Math.floor((l.z - l.d / 2) / 8); gz <= Math.floor((l.z + l.d / 2) / 8); gz++) {
        const k = `${gx},${gz}`;
        const cell = grid.get(k);
        if (cell) cell.push(l);
        else grid.set(k, [l]);
      }
    }
  }
  const inLot = (x: number, z: number) => (grid.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? []).some((l) => Math.abs(x - l.x) < l.w / 2 + 0.4 && Math.abs(z - l.z) < l.d / 2 + 0.4);
  // cheapest tests first: the track distance scans the alignment
  const ok = (x: number, z: number) => !inWater(x, z) && !inLot(x, z) && !inLandmark(x, z, 1) && slopeAt(x, z) < 0.45 && trackDist(x, z) >= 12;
  const add = (x: number, z: number, id: SpeciesId, s: number) => {
    const sp = SPECIES_INDEX[id];
    const gy = groundAt(x, z);
    let scale = s;
    // within 20 of the guideway a crown never rises above the deck plus 6
    if (trackDist(x, z) < 20) scale = Math.min(scale, Math.max(0.35, (trackNearest(x, z).p.y + 6 - gy) / SPECIES[sp].size[1]));
    out.push({ x, y: gy - 0.2, z, sp, s: scale });
  };

  // street trees on the inner edge of every sidewalk, one species per block face
  for (let i = BI0; i <= BI1 && out.length < streetCap; i++) {
    for (let j = BJ0; j <= BJ1 && out.length < streetCap; j++) {
      const name = district(streetX(i) + 11, streetZ(j) + 11);
      if (name === "forest" || name === "park" || name === "cut") continue;
      // denser along the line, sparser in the far neighbourhoods
      const near = trackDist(streetX(i) + 11, streetZ(j) + 11) < 260 ? 1 : 0.5;
      const p = (name === "downtown" || name === "gastown" ? 0.38 : name === "flats" ? 0.3 : 0.55) * near * (lowEnd ? 0.6 : 1);
      const pool = streetPool(name);
      const face = [pick(rng, pool), pick(rng, pool), pick(rng, pool), pick(rng, pool)];
      const ox = (arterialX(i) ? 4.1 : 3.0) - 0.9;
      const oz = (arterialZ(j) ? 4.1 : 3.0) - 0.9;
      for (let t = 2.5; t < 20; t += 5.5) {
        for (const side of [-1, 1]) {
          const x1 = streetX(i) + side * ox;
          const z1 = streetZ(j) + t;
          if (rng.next() < p && ok(x1, z1) && !inPark(x1, z1)) add(x1, z1, face[side < 0 ? 0 : 1], 0.7 + rng.next() * 0.4);
          const x2 = streetX(i) + t;
          const z2 = streetZ(j) + side * oz;
          if (rng.next() < p && ok(x2, z2) && !inPark(x2, z2)) add(x2, z2, face[side < 0 ? 2 : 3], 0.7 + rng.next() * 0.4);
        }
      }
    }
  }
  // woods: parks, Stanley Park, the cut, the corridor through the flats and the North Shore, with fern undergrowth
  const STEP = 6;
  for (let gx = -500; gx < 960 && out.length < cap; gx += STEP) {
    for (let gz = -440; gz < 840 && out.length < cap; gz += STEP) {
      const x = gx + rng.next() * STEP;
      const z = gz + rng.next() * STEP;
      const name = district(x, z);
      const northShore = z < -150 && sdfAt(x, z) > 2;
      if (!northShore && name !== "forest" && name !== "park" && name !== "cut" && name !== "flats") continue;
      if (!ok(x, z)) continue;
      const td = trackDist(x, z);
      let p = 0;
      let pool = POOLS.park;
      if (name === "forest") {
        p = 0.9;
        pool = POOLS.forest;
      } else if (northShore) {
        p = 0.42;
        pool = POOLS.northShore;
      } else if (name === "park") p = 0.55;
      else if (name === "cut") {
        p = 0.6;
        pool = POOLS.cut;
      } else if (name === "flats" && td < 40) {
        p = 0.22;
        pool = POOLS.cut;
      }
      if (p === 0 || rng.next() > p * (lowEnd ? 0.75 : 1)) continue;
      const id = pick(rng, pool);
      const conifer = id === "cedar" || id === "fir" || id === "hemlock";
      add(x, z, id, name === "forest" && conifer ? 1.0 + rng.next() * 1.3 : 0.8 + rng.next() * (conifer ? 0.8 : 0.45));
      if ((name === "forest" || name === "cut" || name === "park") && rng.next() < (lowEnd ? 0.25 : 0.5)) {
        const fx = x + rng.next() * 4 - 2;
        const fz = z + rng.next() * 4 - 2;
        if (ok(fx, fz)) add(fx, fz, pick(rng, POOLS.undergrowth), 0.7 + rng.next() * 0.6);
      }
    }
  }
  return out;
}
