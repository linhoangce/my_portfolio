/**
 * The Waterfront hub of 2100, after a Perkins&Will concept for the rail lands at Waterfront Station: glass towers
 * stepping up from the harbour in a white diagonal lattice, trees on every step, a glass space-frame canopy over a
 * timber lattice spanning the concourse, all on a deck over the water beside the old CPR station, and a long glazed
 * gallery reaching out into the inlet. The layout as data (relative to the landmark's placed centre), shared by the
 * builder, the tree planter and the boats. Pure.
 */
import { SEA } from "./constants";
import { LANDMARKS } from "./sites";
import type { SpeciesId } from "./trees/species";

const HUB = LANDMARKS.find((l) => l.key === "waterfrontHub");
/** The hub's centre in the world (where its landmark stands). */
export const HUB_AT = { x: HUB?.px ?? 38, z: HUB?.pz ?? -30 };
/** The deck's top, a little above the sea. */
export const HUB_DECK = SEA + 2.8;

/** A tower block: its extent (local x, z) and height above the deck. */
export type HubBlock = { x0: number; x1: number; z0: number; z1: number; h: number };
/** One stepped cluster, tallest toward the harbour, falling toward the city and the station. */
export const HUB_BLOCKS: HubBlock[] = [
  { x0: -4, x1: 8, z0: -16, z1: -4, h: 50 },
  { x0: 2, x1: 11, z0: -8, z1: 4, h: 40 },
  { x0: -12, x1: -2, z0: -14, z1: -4, h: 33 },
  { x0: -6, x1: 4, z0: -4, z1: 6, h: 27 },
  { x0: 6, x1: 11, z0: -18, z1: -10, h: 22 },
  { x0: -16, x1: -8, z0: -4, z1: 6, h: 21 },
  { x0: -16, x1: -10, z0: -14, z1: -4, h: 15 },
];
/** The deck under it all (local extent). */
export const HUB_DECK_BOX = { x0: -18, x1: 16, z0: -22, z1: 20 };
/** The canopy over the concourse on the city side of the towers, and its height above the deck. */
export const HUB_CANOPY = { x0: -18, x1: 16, z0: 6, z1: 20, h: 9 };
/** The gallery out into the inlet: its centreline x, half width, and how far north it reaches (local z). */
export const HUB_GALLERY = { x: 4, half: 3.4, z0: -22, z1: -64 };

const SP: SpeciesId[] = ["cherry", "smaple", "dogwood", "cedar", "magnolia"];
/** Trees on the towers' steps and roofs, and a grove along the deck's east edge: world positions. */
export function hubTrees(): { x: number; y: number; z: number; sp: SpeciesId; s: number }[] {
  const out: { x: number; y: number; z: number; sp: SpeciesId; s: number }[] = [];
  let k = 0;
  for (const b of HUB_BLOCKS) {
    // round the edge of the block's roof, wherever no taller block stands on it, three at most and spaced apart
    const cand: [number, number][] = [];
    for (let u = 0.2; u < 0.85; u += 0.3) {
      cand.push([b.x0 + (b.x1 - b.x0) * u, b.z0 + 1.4], [b.x0 + (b.x1 - b.x0) * u, b.z1 - 1.4], [b.x0 + 1.4, b.z0 + (b.z1 - b.z0) * u], [b.x1 - 1.4, b.z0 + (b.z1 - b.z0) * u]);
    }
    const open = cand.filter(([x, z]) => !HUB_BLOCKS.some((c) => c.h > b.h && x > c.x0 - 0.8 && x < c.x1 + 0.8 && z > c.z0 - 0.8 && z < c.z1 + 0.8));
    const kept: [number, number][] = [];
    for (const p of open) if (kept.length < 3 && kept.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 3.2)) kept.push(p);
    for (const [x, z] of kept) out.push({ x: HUB_AT.x + x, y: HUB_DECK + b.h, z: HUB_AT.z + z, sp: SP[k++ % SP.length], s: 0.55 + ((k * 37) % 10) / 40 });
  }
  for (let z = HUB_DECK_BOX.z0 + 3; z < HUB_CANOPY.z0; z += 4.2) out.push({ x: HUB_AT.x + HUB_DECK_BOX.x1 - 2, y: HUB_DECK, z: HUB_AT.z + z, sp: SP[k++ % 3], s: 0.75 });
  return out;
}

/**
 * Water the boats keep out of (world boxes x0, x1, z0, z1):
 * - the hub's deck and gallery;
 * - the Canada Place pier with the cruise ship alongside it;
 * - the Convention Centre's seaward side;
 * - the bay off Harbour Green with its floatplane dock (harbourfront.ts).
 */
export const NO_SAIL: [number, number, number, number][] = [
  [-66, -6, -129, -30],
  [-120, -66, -68, -40],
  [-132, -104, -92, -58],
  [HUB_AT.x + HUB_DECK_BOX.x0 - 6, HUB_AT.x + HUB_DECK_BOX.x1 + 6, HUB_AT.z + HUB_DECK_BOX.z0 - 6, HUB_AT.z + HUB_DECK_BOX.z1 + 6],
  [HUB_AT.x + HUB_GALLERY.x - 14, HUB_AT.x + HUB_GALLERY.x + 14, HUB_AT.z + HUB_GALLERY.z1 - 8, HUB_AT.z + HUB_GALLERY.z0],
];
export const inNoSail = (x: number, z: number): boolean => NO_SAIL.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
