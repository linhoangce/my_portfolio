/**
 * The Fairmont Waterfront, the hotel across Canada Place Way from the pier's root. Its real corner is the forecourt's
 * and the Waterfront set's here, so it stands in the pocket the line's loop leaves at Burrard, facing the pier: a slab
 * of sea-green glass, its harbour face folded into angled bays, its top floors stepping back, on a stone podium whose
 * roof is the hotel's garden, where the About stop's cedar grows (sets/build.ts).
 *
 * Laid out in Burrard's set frame (sets/zones.ts: a along the line, l out toward the harbour). The hero building
 * (buildings/heroes.ts) builds it, the set plants the garden, the Harbour Market's crowds keep out of it. Pure.
 */
import { fromStation, STATION_FRAMES } from "./sets/zones";

type Poly = [number, number][];

export const FAIRMONT = {
  /** The tower: its centre (a, l), length along a, depth along l, its height over the podium's roof. */
  tower: { a: 9, l: 17.75, w: 16, d: 7.5, h: 30 },
  /** The podium: its centre, length, depth (out toward the harbour past the tower, for the garden), height. */
  podium: { a: 8.5, l: 20, w: 19, d: 14, h: 4.2 },
  /** The garden's cedar on the podium's roof, north of the tower, and its height. */
  cedar: { a: 3.5, l: 24, h: 15 },
};

/** The footprints' turn (as parts.ts walls' r0): their local x runs along the set's a, their local -z toward the harbour. */
export const FAIRMONT_TURN = Math.atan2(STATION_FRAMES[1].tz, STATION_FRAMES[1].tx);

/** The tower's plan about its centre: square to the city, its harbour face (-z) folded into three angled bays. */
export const FAIRMONT_PLAN: Poly = (() => {
  const { w, d } = FAIRMONT.tower;
  const face: Poly = [];
  for (let k = 0; k <= 6; k++) face.push([w / 2 - (w * k) / 6, k % 2 ? -d / 2 : -d / 2 + 1.25]);
  return [[-w / 2, d / 2], [w / 2, d / 2], ...face];
})();

/** World point of a spot in the set's frame. */
export const fairmontXZ = (a: number, l: number): [number, number] => fromStation(1, a, l);

/** In the podium's footprint (or the tower's), with a pad: the crowds and the market keep out. */
export function inFairmont(x: number, z: number, pad = 0): boolean {
  const { podium: P } = FAIRMONT;
  const [cx, cz] = fairmontXZ(P.a, P.l);
  const c = Math.cos(FAIRMONT_TURN);
  const s = Math.sin(FAIRMONT_TURN);
  const dx = x - cx;
  const dz = z - cz;
  // world to the footprint's own axes (the inverse of walls' turn)
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  return Math.abs(lx) < P.w / 2 + pad && Math.abs(lz) < P.d / 2 + pad;
}
