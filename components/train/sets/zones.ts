/**
 * Where each station's set piece stands: the side of the line it opens onto and a rectangle in the station frame
 * (along the track, lateral toward that side) that the city generator and the tree planter keep clear. Main Street's
 * set stands toward Science World, so its side follows the landmark. No three.js beyond the track frames.
 */
import { LANDMARKS } from "../sites";
import { frameAt, makeFrame, stationS } from "../track";

/** along [a0, a1], lateral toward the set side [l0, l1]; null where the set lives inside the corridor. */
type Rect = [number, number, number, number] | null;

const f = makeFrame();
const frames = stationS.map((s) => {
  frameAt(s, f);
  const n = Math.hypot(f.t.x, f.t.z) || 1;
  const m = Math.hypot(f.r.x, f.r.z) || 1;
  return { x: f.p.x, z: f.p.z, y: f.p.y, tx: f.t.x / n, tz: f.t.z / n, rx: f.r.x / m, rz: f.r.z / m };
});

/** The station frame on the ground plane: centre, unit tangent, unit right (of travel). */
export const STATION_FRAMES = frames;

const sw = LANDMARKS.find((l) => l.key === "scienceWorld");
const swSide = (() => {
  const fr = frames[4];
  if (!sw || !fr) return 1;
  return (sw.px - fr.x) * fr.rx + (sw.pz - fr.z) * fr.rz >= 0 ? 1 : -1;
})();

/**
 * The open side of each stop (1 right of travel, -1 left), where its set stands and its shot looks back from.
 * Burrard's is the outside of the bend: the line turns back toward Granville on the inside.
 */
export const SET_SIDE: (1 | -1)[] = [1, 1, 1, -1, swSide as 1 | -1, -1, 1, -1, 1, -1];

export const SET_RECT: Rect[] = [
  [-24, 24, 13, 46],
  [-22, 22, 13, 44],
  null,
  [-20, 20, 13, 38],
  [-20, 20, 13, 40],
  [-20, 20, 13, 40],
  [-24, 24, 13, 42],
  [-20, 20, 13, 40],
  [-24, 24, 13, 40],
  [-22, 22, 13, 44],
];

/** Station-frame coordinates of a world point for stop i: along, lateral toward the set side. */
export function toStation(i: number, x: number, z: number): [number, number] {
  const fr = frames[i];
  const dx = x - fr.x;
  const dz = z - fr.z;
  return [dx * fr.tx + dz * fr.tz, (dx * fr.rx + dz * fr.rz) * SET_SIDE[i]];
}

/** Inside any set's clear zone, grown by `pad`. */
export function inSetZone(x: number, z: number, pad = 0): boolean {
  for (let i = 0; i < frames.length; i++) {
    const r = SET_RECT[i];
    if (!r) continue;
    const fr = frames[i];
    if (Math.abs(x - fr.x) > 90 || Math.abs(z - fr.z) > 90) continue;
    const [a, l] = toStation(i, x, z);
    if (a > r[0] - pad && a < r[1] + pad && l > r[2] - pad && l < r[3] + pad) return true;
  }
  return false;
}

/** World ground position of a point in stop i's station frame (along the track, lateral toward the set side). */
export function fromStation(i: number, a: number, l: number): [number, number] {
  const fr = frames[i];
  return [fr.x + fr.tx * a + fr.rx * l * SET_SIDE[i], fr.z + fr.tz * a + fr.rz * l * SET_SIDE[i]];
}

/**
 * Trees a set stands among, built in three dimensions by the set (the shot comes close): Contact's lookout sits in a
 * stand of cedar, fir and hemlock at the edge of Central Park. Heights are in world units.
 */
export const SET_TREES: { i: number; a: number; l: number; h: number; sp: "cedar" | "fir" | "hemlock" }[] = [
  { i: 9, a: -13, l: 20, h: 24, sp: "cedar" },
  { i: 9, a: -17, l: 31, h: 28, sp: "fir" },
  { i: 9, a: 13, l: 21, h: 26, sp: "fir" },
  { i: 9, a: 12, l: 31, h: 30, sp: "cedar" },
  { i: 9, a: -6, l: 15, h: 21, sp: "hemlock" },
  { i: 9, a: 7, l: 14, h: 19, sp: "fir" },
  { i: 9, a: -20, l: 26, h: 22, sp: "hemlock" },
  { i: 9, a: 20, l: 27, h: 23, sp: "cedar" },
];
