/**
 * Where the city is filled in, after every other lot stands (city.ts), on the ground still open:
 * - the downtown peninsula's blocks (downtown, the West End, Yaletown), bigger since its streets are drawn narrower
 *   (roadNetwork.ts): slender towers in the gaps a tower fits, low blocks in the rest, as its own district builds;
 * - the south shore of False Creek where the bridges come down, from Kitsilano Point past Burrard and Granville to
 *   Cambie and up to Broadway: towers by 2100, as the Broadway Plan began them, tallest by the bridgeheads and along
 *   Broadway. Granville Island stays low; the parks and Olympic Village are as they were.
 * Pure.
 */
import { BRIDGES } from "../sites";
import { hood, type Hood, onPeninsula, type Zone, ZONES } from "./eras";

/** The south bridgeheads (each bridge's south end) the towers gather round. */
const HEADS: [number, number][] = BRIDGES.map((b) => b.b);
/** West Broadway's line across Fairview and Kitsilano. */
const BROADWAY_Z = 275;
/** The south shore's towers: today's and 2100's, almost no old ones (the old stand already). */
const SOUTH_SHORE: Zone = { era: [0.04, 0.46, 0.5], h: [[6, 12], [34, 74], [42, 92]], split: 1, build: 1 };

/** What the infill builds at a point: the district's zone, its name, whether its towers' lists are the dense ones, and a height scale. */
export type Infill = { name: Hood; zone: Zone; dense: boolean; scale: number };

/** The two boxes the infill searches (x0, x1, z0, z1): the peninsula's blocks (Stanley Park and the harbour left out), and the south shore. */
export const INFILL_BOXES: [number, number, number, number][] = [
  [-300, 70, -70, 196],
  [-300, -50, 140, 300],
];

export function infillAt(x: number, z: number): Infill | null {
  if (onPeninsula(x, z)) {
    const name = hood(x, z);
    const zone = ZONES[name];
    return zone ? { name, zone, dense: true, scale: 1 } : null;
  }
  if (x < -300 || x > -50 || z < 140 || z > 300) return null;
  // Granville Island
  if (x > -216 && x < -158 && z > 180 && z < 233) return null;
  const name = hood(x, z);
  if (name !== "residential" && name !== "westend" && name !== "mountpleasant") return null;
  // tallest by the bridgeheads and along Broadway, falling away between
  const head = Math.min(...HEADS.map(([hx, hz]) => Math.hypot(x - hx, z - hz)));
  const k = Math.max(0, 1 - head / 120, 1 - Math.abs(z - BROADWAY_Z) / 45);
  return { name, zone: SOUTH_SHORE, dense: true, scale: 0.55 + 0.55 * k };
}
