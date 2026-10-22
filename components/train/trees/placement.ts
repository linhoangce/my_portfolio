/**
 * Where the trees go: a planted verge on both sides of the guideway, street trees along every street's sidewalks (one
 * species per street, as Vancouver plants them), parks, Stanley Park, the Grandview Cut, a rainforest corridor along
 * the guideway through the flats, the North Shore slopes, and sword-fern undergrowth. Never in water, in a lot, on a
 * landmark, on a carriageway, on a steep slope or within 12 units of the track; near the guideway the crowns stay below
 * the deck. Pure.
 */
import { district, type Rng } from "../cityModel";
import { nearBusStop } from "../buses";
import { inHarbourfront, onGreenCafe } from "../harbourfront";
import { nearWce } from "../wce";
import { railNear } from "../rail";
import { junction, type Near, pointAt, roadDist, roadNear, roads, WALK } from "../roadNetwork";
import { onFeature } from "../commonsLayout";
import { inSetZone } from "../sets/zones";
import { inLandmark, inPark, nearBridge, parkAt, parkPathDist, PARKS, streamDist } from "../sites";
import { groundAt, inWater, sdfAt, slopeAt } from "../terrain";
import { LEN, nearestStation, SAMPLES, samples, stationS, trackDist, trackNearest } from "../track";
import { POOLS, SPECIES, SPECIES_INDEX, type SpeciesId } from "./species";

export type TreeInst = { x: number; y: number; z: number; sp: number; s: number };
type LotBox = { x: number; z: number; w: number; d: number; ry?: number; fw?: number; fd?: number };

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

/** Parks that are forest: Burnaby's Central Park, a stand of tall firs, cedars and hemlocks, is drawn as dense as it is. */
const FOREST_PARKS = /^(Central Park|Everett Crowley Park|Renfrew Ravine Park|Still Creek)/;
/** Downtown's parks and squares are small and full of trees: planted twice as thick, with a row round the edge. */
const downtownPark = (x: number, z: number) => Math.hypot(x + 20, z - 40) < 115 || (x < -100 && z < 140 && z > -60);
/** The verge along the guideway: a planted strip each side, densest east of Commercial–Broadway where the line runs through the residential east side. */
const VERGE = {
  /** Distance out from the guideway, and how full that row is. */
  rows: [
    [13, 1],
    [16.5, 1],
    [20, 0.85],
    [24, 0.65],
    [28, 0.45],
  ],
  step: 3.4,
  east: 0.95,
  middle: 0.7,
  downtown: 0.4,
};

export function placeTrees(rng: Rng, lowEnd: boolean, lots: LotBox[]): TreeInst[] {
  const cap = lowEnd ? 16000 : 44000;
  // the verge and street trees may use 65 % of the budget; the woods (parks, Stanley Park, the cut, the North Shore) keep the rest
  const streetCap = cap * 0.65;
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
  // a turned lot by its own footprint, not its box on the axes (on downtown's diagonal grid that box takes the sidewalks)
  const inLot = (x: number, z: number) =>
    (grid.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? []).some((l) => {
      const dx = x - l.x;
      const dz = z - l.z;
      if (l.ry == null || l.fw == null || l.fd == null) return Math.abs(dx) < l.w / 2 + 0.4 && Math.abs(dz) < l.d / 2 + 0.4;
      const c = Math.cos(l.ry);
      const s = Math.sin(l.ry);
      return Math.abs(dx * c - dz * s) < l.fw / 2 + 0.4 && Math.abs(dx * s + dz * c) < l.fd / 2 + 0.4;
    });
  // cheapest tests first: the track distance scans the alignment
  const clear = (x: number, z: number, steep = 0.45) => !inWater(x, z) && !inLot(x, z) && !inLandmark(x, z, 1) && !inHarbourfront(x, z, 0.8) && !onGreenCafe(x, z, 1) && !onFeature(x, z, 1.2) && !nearBusStop(x, z, 1.2) && !nearWce(x, z) && !inSetZone(x, z) && !nearBridge(x, z, 1.5) && slopeAt(x, z) < steep && trackDist(x, z) >= 12 && !railNear(x, z, 9);
  const ok = (x: number, z: number, steep = 0.45) => clear(x, z, steep) && roadDist(x, z) > 0.3;
  // a street tree stands on its own street's sidewalk, which counts as road: it only has to keep off every other road's
  const near: Near = { edge: 0, seg: 0, t: 0, d: 0, s: 0, side: 1 };
  const onSidewalk = (x: number, z: number, edge: number) => {
    if (!clear(x, z)) return false;
    const n = roadNear(x, z, near);
    if (!n || n.edge === edge) return true;
    const o = roads().edges[n.edge];
    return n.d > o.half - WALK[o.cls] + 0.3;
  };
  const add = (x: number, z: number, id: SpeciesId, s: number) => {
    const sp = SPECIES_INDEX[id];
    const gy = groundAt(x, z);
    let scale = s;
    // within 20 of the guideway a crown never rises above the deck plus 6
    if (trackDist(x, z) < 20) scale = Math.min(scale, Math.max(0.35, (trackNearest(x, z).p.y + 6 - gy) / SPECIES[sp].size[1]));
    out.push({ x, y: gy - 0.2, z, sp, s: scale });
  };

  // the verge: rows of trees in the strip each side of the guideway that the city keeps clear, on the banks of its
  // cuttings too, in short stands with gaps; kept off each station's lift and stairs and the interchange's halls
  const sEast = stationS[5] - 30;
  for (let i = 0; i <= SAMPLES; i += Math.max(1, Math.round((VERGE.step / LEN) * SAMPLES))) {
    const f = samples[i];
    const s = (i / SAMPLES) * LEN;
    const base = s > sEast ? VERGE.east : s > stationS[4] - 20 ? VERGE.middle : VERGE.downtown;
    const k = nearestStation(s);
    const da = Math.abs(s - stationS[k]);
    const keepOut = k === 5 ? (da < 34 ? 32 : 0) : da < 18 ? 20 : 0;
    for (const side of [-1, 1]) {
      // stands and clearings along each side, so the verge reads as planted, not as a hedge
      const stand = 0.5 + 0.5 * Math.sin(s * 0.055 + side * 1.7) * Math.sin(s * 0.021 + side);
      for (const [row, full] of VERGE.rows) {
        const lat = side * (row + rng.next() * 2.4 - 1.2);
        const x = f.p.x + f.r.x * lat + rng.next() * 1.6 - 0.8;
        const z = f.p.z + f.r.z * lat + rng.next() * 1.6 - 0.8;
        const p = base * (0.45 + 0.75 * stand) * full * (lowEnd ? 0.8 : 1);
        if (rng.next() >= p || row < keepOut || !ok(x, z, 0.85) || inPark(x, z)) continue;
        const id = pick(rng, s > sEast ? POOLS.verge : POOLS.streetResidential);
        const conifer = id === "cedar" || id === "fir" || id === "hemlock";
        add(x, z, id, 0.8 + rng.next() * (conifer ? 0.7 : 0.45));
      }
    }
  }
  const verge = out.length;
  // street trees on every drawn street's sidewalk, by the kerb: one species and one planting age per street (a few mix
  // two), so a street of young hornbeams runs into one of old planes; none beside a motorway, none on a bridge, none at
  // a junction's corner. Gathered over the whole city, then thinned evenly to the budget (a budget that ran out
  // mid-loop left the east with none)
  const streets: { x: number; z: number; id: SpeciesId; s: number; near: boolean }[] = [];
  const { edges, nodes } = roads();
  const setbacks = new Map<number, Map<number, number>>();
  const setback = (node: number, k: number) => {
    let m = setbacks.get(node);
    if (!m) {
      m = junction(node)?.setback ?? new Map<number, number>();
      setbacks.set(node, m);
    }
    return m.get(k) ?? 0;
  };
  edges.forEach((e, k) => {
    if (e.cls === 0) return;
    const [mx, mz] = pointAt(e, e.len / 2);
    const name = district(mx, mz);
    if (name === "forest" || name === "park" || name === "cut") return;
    // every street the ride passes planted, the far neighbourhoods sparser; downtown's streets as full as the east's
    const td = trackDist(mx, mz);
    const near = td < 220 ? 1 : td < 320 ? 0.7 : 0.45;
    const core = name === "downtown" || name === "gastown" || name === "westend";
    const p = (core ? 0.95 : name === "flats" ? 0.6 : 0.92) * near * (lowEnd ? 0.75 : 1);
    const pool = streetPool(name);
    const a = pick(rng, pool);
    const b = rng.next() < 0.25 ? pick(rng, pool) : null;
    const age = 0.55 + rng.next() ** 1.3 * 0.95;
    const off = e.half - WALK[e.cls] + 0.3;
    // clear of each junction's corner and crosswalk, and of its signal pole where it has one; a street that simply
    // runs on into its next stretch is planted right through
    const clearOf = (node: number) => {
      const nd = nodes[node];
      if (nd.deg <= 2) return nd.deg === 2 ? 1.2 : 3;
      return setback(node, k) + (nd.signal ? 2.4 : 1.5);
    };
    const s0 = clearOf(e.a);
    const s1 = e.len - clearOf(e.b);
    let n = 0;
    // downtown's sidewalks planted closest, crown to crown
    const gap = core ? 3.8 : e.cls <= 1 ? 4.2 : 4.8;
    for (let s = s0 + rng.next() * 2; s < s1; s += gap) {
      n++;
      const seg = e.cum.findIndex((c) => c >= s) - 1;
      if (seg >= 0 && (!e.shown[seg] || e.deck[seg])) continue;
      const [x0, z0] = pointAt(e, s - 0.5);
      const [x1, z1] = pointAt(e, s + 0.5);
      const L = Math.hypot(x1 - x0, z1 - z0) || 1;
      for (const side of [-1, 1]) {
        const x = (x0 + x1) / 2 + ((z1 - z0) / L) * side * off;
        const z = (z0 + z1) / 2 - ((x1 - x0) / L) * side * off;
        if (rng.next() >= p || !onSidewalk(x, z, k) || inPark(x, z)) continue;
        streets.push({ x, z, id: b && n % 2 ? b : a, s: age * (0.82 + rng.next() * 0.36), near: td < 320 });
      }
    }
  });
  // thinned to the budget: the streets in sight of the line first, the far ones with what is left
  const room = Math.max(0, streetCap - verge);
  const nNear = streets.filter((t) => t.near).length;
  const keepNear = Math.min(1, room / Math.max(1, nNear));
  const keepFar = Math.min(1, Math.max(0, room - nNear * keepNear) / Math.max(1, streets.length - nNear));
  for (const t of streets) if (rng.next() < (t.near ? keepNear : keepFar)) add(t.x, t.z, t.id, t.s);
  // downtown's plazas and courtyards: the open ground between its towers, back from the sidewalks, planted in groves
  for (let gx = -200; gx < 110; gx += 4.5) {
    for (let gz = -80; gz < 150; gz += 4.5) {
      const x = gx + rng.next() * 4.5;
      const z = gz + rng.next() * 4.5;
      const name = district(x, z);
      if (name !== "downtown" && name !== "gastown" && name !== "westend") continue;
      const grove = 0.5 + 0.5 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09);
      if (rng.next() >= (0.15 + 0.45 * grove) * (lowEnd ? 0.75 : 1) || roadDist(x, z) < 1.4 || !ok(x, z)) continue;
      add(x, z, pick(rng, POOLS.plaza), 0.8 + rng.next() * 0.4);
    }
  }
  // rows of trees just inside the outline of the parks that have them, and of every downtown park
  for (const park of PARKS) {
    const poly = park.poly;
    const rows = park.rows ?? (downtownPark(park.x, park.z) ? 4.2 : 0);
    if (!poly || !rows) continue;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % poly.length];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = rows / 2; t < L; t += rows) {
        const px = ax + ((bx - ax) * t) / L;
        const pz = az + ((bz - az) * t) / L;
        // 1.6 in toward the middle
        const k = 1.6 / Math.max(1, Math.hypot(park.x - px, park.z - pz));
        const x = px + (park.x - px) * k;
        const z = pz + (park.z - pz) * k;
        if (ok(x, z) && parkPathDist(x, z) > 1.2) add(x, z, pick(rng, POOLS.park), 0.95 + rng.next() * 0.35);
      }
    }
  }
  // woods: parks, Stanley Park, the cut, the corridor through the flats and the North Shore, with fern undergrowth;
  // gathered, then thinned to what the budget has left (the far North Shore first)
  const woods: { x: number; z: number; id: SpeciesId; s: number; far: boolean }[] = [];
  const STEP = 6;
  for (let gx = -500; gx < 1000; gx += STEP) {
    for (let gz = -440; gz < 856; gz += STEP) {
      // a forest park is planted three times as thick, a downtown park twice
      const firstX = gx + rng.next() * STEP;
      const firstZ = gz + rng.next() * STEP;
      const park = parkAt(firstX, firstZ);
      const reps = park && FOREST_PARKS.test(park.name) ? 3 : park && downtownPark(firstX, firstZ) ? 2 : 1;
      for (let rep = 0; rep < reps; rep++) {
        const x = rep ? gx + rng.next() * STEP : firstX;
        const z = rep ? gz + rng.next() * STEP : firstZ;
        const name = district(x, z);
        const northShore = z < -150 && sdfAt(x, z) > 2;
        const bank = x > 40 && x < 270 && z > 150 && z < 270 ? streamDist(x, z) : 99;
        if (!northShore && bank > 15 && name !== "forest" && name !== "park" && name !== "cut" && name !== "flats") continue;
        if (bank < 3.2) continue;
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
        } else if (bank < 15) {
          p = 0.45;
          pool = POOLS.stream;
        } else if (name === "park") {
          // each park its own canopy, and nothing on its paths; a forest park its conifers
          if (parkPathDist(x, z) < 1.4) continue;
          const pk = parkAt(x, z);
          if (pk && FOREST_PARKS.test(pk.name)) {
            p = 0.95;
            pool = POOLS.forest;
          } else p = pk?.trees ?? (downtownPark(x, z) ? 0.8 : 0.55);
        } else if (name === "cut") {
          p = 0.6;
          pool = POOLS.cut;
        } else if (name === "flats" && td < 40) {
          p = 0.22;
          pool = POOLS.cut;
        }
        if (p === 0 || rng.next() > p * (lowEnd ? 0.75 : 1)) continue;
        const id = pick(rng, pool);
        const conifer = id === "cedar" || id === "fir" || id === "hemlock";
        const tall = (name === "forest" || pool === POOLS.forest) && conifer;
        woods.push({ x, z, id, s: tall ? 1.0 + rng.next() * 1.3 : 0.8 + rng.next() * (conifer ? 0.8 : 0.45), far: northShore });
        if ((name === "forest" || name === "cut" || name === "park" || bank < 15) && rng.next() < (lowEnd ? 0.25 : 0.5)) {
          const fx = x + rng.next() * 4 - 2;
          const fz = z + rng.next() * 4 - 2;
          if (ok(fx, fz)) woods.push({ x: fx, z: fz, id: pick(rng, POOLS.undergrowth), s: 0.7 + rng.next() * 0.6, far: northShore });
        }
      }
    }
  }
  const roomW = Math.max(0, cap - out.length);
  const nNearW = woods.filter((w) => !w.far).length;
  const keepNearW = Math.min(1, roomW / Math.max(1, nNearW));
  const keepFarW = Math.min(1, Math.max(0, roomW - nNearW * keepNearW) / Math.max(1, woods.length - nNearW));
  for (const w of woods) if (rng.next() < (w.far ? keepFarW : keepNearW)) add(w.x, w.z, w.id, w.s);
  return out;
}
