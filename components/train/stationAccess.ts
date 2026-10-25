/**
 * How people get up to each Expo platform (transit is free in 2100: no fare gates). Every side platform has its own way
 * in:
 * - an entrance at the ground under the platform's end, paved, by the line's lit totem;
 * - a stair from there up under the platform, coming out through a stairwell in the platform's floor;
 * - a glass lift beside the stairwell's head.
 *
 * Where the platform stands only a step above the ground (29th Avenue's, in its cutting), a short flight of steps at
 * the platform's end leads down to the entrance instead.
 *
 * Each platform takes the direction (stair rising toward one end or the other) whose footprint keeps clear of the drawn
 * streets, the rail cut and every other line's bed (the West Coast Express's, the Millennium's, the freight's), the
 * water, the bus bays, and what stands on the ground of the sets and the open places.
 * Commercial–Broadway's interchange has its own (Hub.tsx).
 *
 * Built in the station's frame: x left of travel, z ahead, y up from the deck. Pure layout.
 */
import { stations } from "@/data";

import { nearBusStop } from "./buses";
import { onFeature } from "./commonsLayout";
import { PLATFORM_LEN } from "./constants";
import { inRailCut, railNear } from "./rail";
import { roads } from "./roadNetwork";
import { onSquareFixture, SQUARES, squareTrees } from "./sets/squares";
import { COURTS, GYM, PERGOLA } from "./sets/wellness";
import { SET_SIDE, toStation } from "./sets/zones";
import { LANDMARKS } from "./sites";
import { groundAt, sdfAt } from "./terrain";
import { frameAt, makeFrame, stationS } from "./track";
import { nearWce } from "./wce";

/** The stair's slope (rise over run), its width and its centre's distance out from the track; the lift beside it. */
export const STAIR = { slope: 0.7, w: 2.2, x: 8.1 };
export const LIFT = { w: 2.0, x: 8.4 };
/** The entrance line (where the gates stood before transit was free): its inner and outer ends across the platform. */
export const GATES = { x0: 6.9, x1: 11.4 };
/** A stair-and-lift tower beside the platform: its centre's distance out, its width (x) and length (z). */
export const TOWER = { x: 13.4, w: 3.2, d: 4.4 };

export type Access = {
  /** Station index and platform side (+1 left of travel, -1 right). */
  i: number;
  side: 1 | -1;
  /**
   * "under": the stair rises under the platform; "end": steps down from the platform's end; "tower": a glass tower of
   * stairs and a lift beside the platform (centred at zTop), joined to it by a landing, the entrance at its far end.
   */
  kind: "under" | "end" | "tower";
  /** Which way the stair rises (+1 toward +z); for a tower, which end its entrance is at (0: outward, beside it). */
  dir: 1 | -1 | 0;
  /** Where the stair arrives at the platform (z), where its foot is (z) and the ground there (local y). */
  zTop: number;
  zFoot: number;
  yFoot: number;
  /** The entrance line (z) and the ground there; the lift's centre (z). */
  zGates: number;
  yGates: number;
  zLift: number;
  /** A tower's centre out from the track (TOWER.x unless it stands across a street, reached by a skybridge). */
  tx?: number;
};

const f = makeFrame();
const STATION_NEAR: [number, number][] = stationS.map((s) => {
  frameAt(s, f);
  return [f.p.x, f.p.z];
});
/** Station i's local (x, z) in the world. */
export function stationPoint(i: number, x: number, z: number): [number, number] {
  frameAt(stationS[i], f);
  const tx = f.t.x;
  const tz = f.t.z;
  const L = Math.hypot(tx, tz) || 1;
  return [f.p.x - f.r.x * x + (tx / L) * z, f.p.z - f.r.z * x + (tz / L) * z];
}

/**
 * Where a set's bridge lands on its platform (station, the platform's side, the stretch along it it needs clear):
 * Stadium–Chinatown's terrace bridge, Joyce–Collingwood's skybridge into the gallery.
 */
const BRIDGES: { i: number; z0: number; z1: number }[] = [
  { i: 3, z0: -3.4, z1: 3.4 },
  { i: 8, z0: -8, z1: -4.9 },
];
/** Station i's set bridges: the platform each lands on (`side` as an Access's) and the stretch along it. */
export const setBridges = (i: number): { side: 1 | -1; z0: number; z1: number }[] => BRIDGES.filter((b) => b.i === i).map((b) => ({ side: -SET_SIDE[i] as 1 | -1, z0: b.z0, z1: b.z1 }));

/** A building's footprint, as the city lays them out (buildings/city.ts Lot). */
type Footprint = { x: number; z: number; w: number; d: number; ry?: number; fw?: number; fd?: number };
const cache = new Map<boolean, Access[]>();
/** What blocks a world point (for the layout checks): "" where nothing does. */
export let debugWhy: (x: number, z: number) => string = () => "";

/**
 * Every platform's way in, round the city's buildings at this budget (`lots`; the low-end city packs differently).
 */
export function stationAccess(lowEnd: boolean, lots: Footprint[]): Access[] {
  const hit = cache.get(lowEnd);
  if (hit) return hit;
  // the buildings near the stations, by 16-unit cell
  const near = new Map<number, Footprint[]>();
  for (const l of lots) {
    if (!STATION_NEAR.some(([sx, sz]) => (l.x - sx) ** 2 + (l.z - sz) ** 2 < 80 * 80)) continue;
    const r = Math.hypot(l.fw ?? l.w, l.fd ?? l.d) / 2 + 1;
    for (let a = Math.floor((l.x - r) / 16); a <= Math.floor((l.x + r) / 16); a++) {
      for (let b = Math.floor((l.z - r) / 16); b <= Math.floor((l.z + r) / 16); b++) {
        const key = a * 100000 + b;
        const c = near.get(key);
        if (c) c.push(l);
        else near.set(key, [l]);
      }
    }
  }
  const inLot = (x: number, z: number) =>
    (near.get(Math.floor(x / 16) * 100000 + Math.floor(z / 16)) ?? []).some((l) => {
      const ry = l.ry ?? 0;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const dx = x - l.x;
      const dz = z - l.z;
      return Math.abs(dx * c - dz * s) < (l.fw ?? l.w) / 2 + 0.5 && Math.abs(dx * s + dz * c) < (l.fd ?? l.d) / 2 + 0.5;
    });
  // the drawn streets' segments in 16-unit cells, for the distance to the nearest one's kerb
  const cells = new Map<number, number[][]>();
  for (const e of roads().edges) {
    for (let k = 0; k + 3 < e.pts.length; k += 2) {
      if (!e.shown[k / 2]) continue;
      const s = [e.pts[k], e.pts[k + 1], e.pts[k + 2], e.pts[k + 3], e.half];
      for (let a = Math.floor((Math.min(s[0], s[2]) - 6) / 16); a <= Math.floor((Math.max(s[0], s[2]) + 6) / 16); a++) {
        for (let b = Math.floor((Math.min(s[1], s[3]) - 6) / 16); b <= Math.floor((Math.max(s[1], s[3]) + 6) / 16); b++) {
          const key = a * 100000 + b;
          const c = cells.get(key);
          if (c) c.push(s);
          else cells.set(key, [s]);
        }
      }
    }
  }
  const onStreet = (x: number, z: number) =>
    (cells.get(Math.floor(x / 16) * 100000 + Math.floor(z / 16)) ?? []).some(([ax, az, bx, bz, h]) => {
      const ex = bx - ax;
      const ez = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
      return Math.hypot(x - ax - ex * t, z - az - ez * t) < h + 0.4;
    });
  const trees = squareTrees();
  const big = LANDMARKS.filter((l) => l.r > 5);
  const blocked = (x: number, z: number) => blockedWhy(x, z) !== "";
  const blockedWhy = (x: number, z: number): string => {
    if (sdfAt(x, z) < 0.5) return "~";
    if (inLot(x, z)) return "#";
    if (inRailCut(x, z, 1)) return "C";
    if (nearWce(x, z, 0.5) || railNear(x, z, 1.2)) return "R";
    if (onStreet(x, z)) return "S";
    if (nearBusStop(x, z, 0.2)) return "B";
    if (onFeature(x, z, 0.4)) return "F";
    if (big.some((l) => (x - l.px) ** 2 + (z - l.pz) ** 2 < (l.r * 0.85) ** 2)) return "L";
    if (trees.some((t) => (t.x - x) ** 2 + (z - t.z) ** 2 < 1)) return "T";
    for (const sq of SQUARES) {
      const [a, l] = toStation(sq.i, x, z);
      if (Math.abs(a) < 80 && onSquareFixture(sq, a, l, 0.6)) return "Q";
    }
    // Patterson's park
    const [pa, pl] = toStation(9, x, z);
    return [...COURTS, PERGOLA, GYM].some((b) => pa > b.a0 - 0.6 && pa < b.a1 + 0.6 && pl > b.l0 - 0.6 && pl < b.l1 + 0.6) ? "P" : "";
  };
  debugWhy = blockedWhy;
  const out: Access[] = [];
  const half = PLATFORM_LEN / 2;
  stations.forEach((_, i) => {
    // Commercial–Broadway's interchange has its own lifts and stairs (Hub.tsx)
    if (i === 5) return;
    frameAt(stationS[i], f);
    const deck = f.p.y;
    const ground = (x: number, z: number) => groundAt(...stationPoint(i, x, z)) - deck;
    for (const side of [1, -1] as const) {
      const xs = [GATES.x0, (GATES.x0 + GATES.x1) / 2, GATES.x1].map((x) => x * side);
      const clear = (z0: number, z1: number) => {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 0.01; z += 1) for (const x of xs) if (blocked(...stationPoint(i, x, z))) return false;
        return true;
      };
      const tries: Access[] = [];
      const low = 1.4 - Math.min(ground(8.9 * side, -half), ground(8.9 * side, half)) < 4;
      // under the platform: the stair's head anywhere along it, rising either way (the left platform's toward +z first,
      // the right's toward -z, so their gates are at opposite ends)
      if (!low) {
        for (const dir of side > 0 ? ([1, -1] as const) : ([-1, 1] as const)) {
          for (const zTop of [4, 8, 12, 0, -4, -8].map((z) => z * dir)) {
            const zLift = zTop + dir * 1.6;
            if (Math.abs(zLift) + 1.2 > half || Math.abs(zTop - dir * 3.2) > half) continue;
            let run = (1.4 - ground(STAIR.x * side, zTop - dir * 15)) / STAIR.slope;
            run = (1.4 - ground(STAIR.x * side, zTop - dir * run)) / STAIR.slope;
            const zFoot = zTop - dir * run;
            const zGates = zFoot - dir * 2.4;
            tries.push({ i, side, kind: "under", dir, zTop, zFoot, yFoot: ground(STAIR.x * side, zFoot), zGates, yGates: ground(9.15 * side, zGates), zLift });
          }
        }
      }
      // down off the platform's end, rising toward it (the only way where the platform is a step above the ground)
      for (const e of side > 0 ? ([-1, 1] as const) : ([1, -1] as const)) {
        const zTop = e * half;
        const dir = -e as 1 | -1;
        let run = Math.max(1, (1.4 - ground(STAIR.x * side, zTop + e * 12)) / STAIR.slope);
        run = Math.max(1, (1.4 - ground(STAIR.x * side, zTop + e * run)) / STAIR.slope);
        const zFoot = zTop + e * run;
        const zGates = zFoot + e * (low ? 1.6 : 2.4);
        tries.push({ i, side, kind: "end", dir, zTop, zFoot, yFoot: ground(STAIR.x * side, zFoot), zGates, yGates: ground(9.15 * side, zGates), zLift: zTop + e * 1.4 });
      }
      // the platform's own stretch a set's bridge lands on (the sets stand on the right of travel when SET_SIDE is 1,
      // which is this frame's -x) stays clear of stairwells and lifts
      const keep = BRIDGES.filter((b) => b.i === i && side === -SET_SIDE[i]);
      const onPlatform = (z0: number, z1: number) => keep.some((b) => Math.max(z0, z1) > b.z0 - 0.6 && Math.min(z0, z1) < b.z1 + 0.6);
      const usable = (t: Access) => t.kind !== "under" || !onPlatform(t.zTop - t.dir * 3.4, t.zLift + t.dir * 1.2);
      let ok = tries.find((t) => usable(t) && (t.kind === "under" ? clear(t.zLift + t.dir * 1.2, t.zGates - t.dir * 1.6) : clear(t.zTop, t.zGates - t.dir * -1.6)));
      // last, a tower beside the platform where the street runs under it
      if (!ok && !low) {
        const fitsIn = (x0: number, x1: number, z0: number, z1: number) => {
          for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 0.01; z += 1) for (let x = x0; x <= x1 + 0.01; x += 1.2) if (blocked(...stationPoint(i, x * side, z))) return false;
          return true;
        };
        const zts: number[] = [];
        for (let k = 0; k <= 28; k++) zts.push(k * 0.5);
        // beside the platform, or (where a street runs along under it) across the street, a skybridge over to it
        search: for (const tx of [TOWER.x, 17, 18.5, 20, 21.5, 23]) {
          const tx0 = tx === TOWER.x ? 11.6 : tx - TOWER.w / 2 - 0.3;
          const tx1 = tx + TOWER.w / 2 + 0.3;
          for (const zt of zts) {
            for (const zTop of [-zt, zt]) {
              if (onPlatform(zTop - TOWER.d / 2, zTop + TOWER.d / 2)) continue;
              const dir = (zTop < 0 ? 1 : -1) as 1 | -1;
              const zEnd = zTop - dir * (TOWER.d / 2);
              // the gates beyond the tower's end, or (outward) beside it
              if (fitsIn(tx0, tx1, zTop + dir * (TOWER.d / 2 + 0.3), zEnd - dir * 2.8)) {
                ok = { i, side, kind: "tower", dir, zTop, zFoot: zTop, yFoot: ground(tx * side, zTop), zGates: zEnd - dir * 1.3, yGates: ground(tx * side, zEnd - dir * 1.3), zLift: zTop, tx };
                break search;
              }
              if (fitsIn(tx0, tx1 + 3.2, zTop - TOWER.d / 2 - 0.3, zTop + TOWER.d / 2 + 0.3)) {
                ok = { i, side, kind: "tower", dir: 0, zTop, zFoot: zTop, yFoot: ground(tx * side, zTop), zGates: zTop, yGates: ground((tx1 + 1.4) * side, zTop), zLift: zTop, tx };
                break search;
              }
            }
          }
        }
      }
      if (ok) out.push(ok);
    }
  });
  cache.set(lowEnd, out);
  return out;
}

/** People about each entrance: a couple outside the gates (world positions). */
export function accessPeople(lowEnd: boolean, lots: Footprint[]): { x: number; y: number; z: number }[] {
  return stationAccess(lowEnd, lots).flatMap((e) =>
    [0.25, 0.75].map((u) => {
      const [x, z] =
        e.kind !== "tower"
          ? [(GATES.x0 + (GATES.x1 - GATES.x0) * u) * e.side, e.zGates - e.dir * (1.4 + u)]
          : e.dir === 0
            ? [((e.tx ?? TOWER.x) + TOWER.w / 2 + 2.4 + u) * e.side, e.zTop + (u - 0.5) * 2]
            : [((e.tx ?? TOWER.x) + (u - 0.5) * 2) * e.side, e.zGates - e.dir * 1.8];
      const [wx, wz] = stationPoint(e.i, x, z);
      return { x: wx, y: groundAt(wx, wz) + 0.1, z: wz };
    }),
  );
}
