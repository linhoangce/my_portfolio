/**
 * The Inlet Walk and the Inlet Stage: a glass footbridge straight across Burrard Inlet from the Waterfront plaza to the
 * North Shore, and beside its north landing an open-air stage afloat in the cove there, its audience on terraces
 * stepping down the shore to the water so the city across the inlet is the stage's backdrop. The layout as data (world
 * x, y, z), shared by the builder (inletWalkKit.ts), the boats (harbourTraffic.ts), the fliers (airspace.ts) and the
 * city, trees and sets, which keep off it. Pure: nothing here reads the ground (the heights where it meets the shore
 * were sampled from it), so any module may import it without freezing the ground or making a cycle.
 *
 * It keeps out of everyone's way:
 * - under every flier: its highest point (the lookout's canopy, 16.8) is 11 under the drones' lowest layer (28, and
 *   they rise only for what stands within 6 of their roof) and 14 under the floatplane's orbit where that crosses the
 *   walk (z ≈ −197; it never turns aside), and the air taxis fly at 54 and up;
 * - clear of every boat: no sailing crosses x −3 (the inlet's marinas are all east of x 98, and so is the SeaBus's
 *   crossing), but the navigation span keeps a channel SEA + 12 high under it all the same (the tallest mast is 8.75),
 *   and its piers, its deck where that is low near either shore, and the stage stand in the harbour as solids.
 */
import { SEA } from "./constants";
import type { Solid } from "./harbourNav";

/**
 * The walk's centreline (x), the walkway's half width, the edge beams' outer half width and depth (deeper over the
 * navigation span), and where it starts and ends (z): on the Waterfront plaza's edge, and on the terraces' crown. Its
 * foot passes between the restored CPR station's corner (x 0.7) and the canoe landing's carved post (x −8.6), clear of
 * the light line's mast (z −27) and the cruise ship's hull (x −15).
 */
export const WALK = { x: -3.5, half: 2.2, beam: 2.55, depth: 0.8, navDepth: 1, z0: -30, z1: -304 };

/**
 * The deck's height (walking surface) at knots along z, south to north, straight between them: level with the plaza
 * (sampled: 7.5) at the south end, rising at 1 in 26 with a level landing at each shelter to the crest over the
 * navigation span, then down at 1 in 12 or so to a landing by the stage and onto the crown.
 */
export const PROFILE: [number, number][] = [
  [-30, 7.5],
  [-92, 9.86],
  [-102, 9.86],
  [-148, 11.61],
  [-158, 11.61],
  [-205, 13.4],
  [-225, 13.4],
  [-264, 10.17],
  [-274, 10.17],
  [-304, 7.8],
];

/** The deck's height at z (held level past either end). */
export function deckY(z: number): number {
  const P = PROFILE;
  if (z >= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    const [za, ya] = P[i - 1];
    const [zb, yb] = P[i];
    if (z >= zb) return ya + ((yb - ya) * (z - za)) / (zb - za);
  }
  return P[P.length - 1][1];
}

/** The deck's grade (rise per unit run, as a magnitude) at z. */
export function gradeAt(z: number): number {
  return Math.abs(deckY(z - 0.5) - deckY(z + 0.5));
}

/**
 * The bays off the walk, each a landing's width along it (z0 > z1, north being −z) reaching `out` beyond the beam on
 * `side` (+1 east, −1 west): two glazed shelters (the first toward the hub and the SeaBus, the second toward Stanley
 * Park and the Lions Gate) and the balcony over the stage, under a glass canopy.
 */
export type Bay = { name: string; z0: number; z1: number; side: 1 | -1; out: number; kind: "shelter" | "balcony" };
export const BAYS: Bay[] = [
  { name: "Harbour Shelter", z0: -92, z1: -102, side: 1, out: 4.5, kind: "shelter" },
  { name: "Narrows Shelter", z0: -148, z1: -158, side: -1, out: 4.5, kind: "shelter" },
  { name: "Stage Balcony", z0: -264, z1: -274, side: 1, out: 4.5, kind: "balcony" },
];
/** A bay's extent (world x0 < x1, z0 > z1). */
export function bayBox(b: Bay): { x0: number; x1: number; z0: number; z1: number } {
  const edge = WALK.x + b.side * WALK.beam;
  const far = edge + b.side * b.out;
  return { x0: Math.min(edge, far), x1: Math.max(edge, far), z0: b.z0, z1: b.z1 };
}
/** The shelters' glass walls' height over their floor, and the balcony canopy's. */
export const SHELTER_H = 3.2;
export const BALCONY_H = 3;

/**
 * The lookout at the crest: a glass-floored half ellipse cantilevered off the west beam (centre z, reach west, half
 * length along the walk), under a glass canopy `canopy` over the deck.
 */
export const LOOKOUT = { z: -215, reach: 4.5, half: 8, canopy: 3.4 };

/**
 * The piers (z), each a white V on a pile cap in the water; their spacing a little under 20, wider at the landings,
 * and the navigation span between the two at its ends.
 */
export const PIERS = [-50, -71, -97, -118, -135, -153, -170, -186, -236, -252, -269, -286];
/** The navigation span: its piers' z and the clearance kept under it (over the sea). */
export const NAV = { zS: -186, zN: -236, clear: 12 };
/** The edge beams' depth at z (deeper over the navigation span). */
export const depthAt = (z: number): number => (z < NAV.zS && z > NAV.zN ? WALK.navDepth : WALK.depth);
/** The deck's underside at z. */
export const undersideY = (z: number): number => deckY(z) - depthAt(z);

/** The stage afloat in the cove: its pontoon (x0 < x1, z0 > z1), its deck's height, and its lighting ring over it. */
export const STAGE = { x0: 6, x1: 24, z0: -269, z1: -280, deck: SEA + 1.3, ring: { y: 10.5, rx: 9.5, rz: 6.5 } };
export const STAGE_AT = { x: (STAGE.x0 + STAGE.x1) / 2, z: (STAGE.z0 + STAGE.z1) / 2 };
/** The stage's highest point: the ring's masts' tips and the aviation light on them. */
export const STAGE_TOP = STAGE.ring.y + 1.1;

/**
 * The terraces: rows straight across (x0…x1) stepping up away from the stage, each `deep` deep and `rise` higher than
 * the one before, the first `front` (z) a gangway's span from the pontoon; their mass stands on the cove's floor, the
 * front half of it in the water.
 */
export const TERRACES = { x0: 0.6, x1: 25, front: -284.4, rows: 14, deep: 1.37, rise: 0.5, first: 1.3, base: SEA - 1 };
/** The row k's seat height and its front and back (z). */
export function terraceRow(k: number): { y: number; zf: number; zb: number } {
  const T = TERRACES;
  return { y: T.first + k * T.rise, zf: T.front - k * T.deep, zb: T.front - (k + 1) * T.deep };
}
/** The crown behind the top row: a plaza level with the walk's end, on the shore. */
export const CROWN = { x0: -7, x1: 25, z0: TERRACES.front - TERRACES.rows * TERRACES.deep, z1: -312, y: 7.8 };
/**
 * On the crown: the glass Stage House (box office, café and green room); the lift, a glass tower against the crown's
 * back from the shore to its head over the crown; and the stair down the back.
 */
export const STAGE_HOUSE = { x0: 9, x1: 19, z0: -306.4, z1: -311.2, h: 3.4 };
export const LIFT = { x0: 0.4, x1: 3, z0: CROWN.z1, z1: CROWN.z1 - 3, top: CROWN.y + 3.6 };
export const STAIR = { x0: 11, x1: 17, z0: CROWN.z1, z1: -318, foot: 4.3 };

/** Everything the walk and the stage put on the North Shore (x0, x1, z0, z1; z0 > z1). */
const NORTH = { x0: -7.5, x1: 25.6, z0: -282.6, z1: STAIR.z1 - 1.5 };

/**
 * What stands up into the air (x0, x1, z0, z1, top; z0 < z1, as airspace.ts's boxObstacle takes them): the deck in
 * stretches of about 20 (each to its highest balustrade), the bays and the lookout with their glass, the stage with its
 * ring, and the terraces, crown, Stage House and lift.
 */
export const INLET_AIR: [number, number, number, number, number][] = (() => {
  const out: [number, number, number, number, number][] = [];
  const x0 = WALK.x - WALK.beam;
  const x1 = WALK.x + WALK.beam;
  for (let z = WALK.z0; z > WALK.z1; z -= 20) {
    const zn = Math.max(WALK.z1, z - 20);
    out.push([x0, x1, zn, z, Math.max(deckY(z), deckY(zn), deckY((z + zn) / 2)) + 1]);
  }
  for (const b of BAYS) {
    const r = bayBox(b);
    out.push([r.x0, r.x1, r.z1, r.z0, deckY((b.z0 + b.z1) / 2) + (b.kind === "shelter" ? SHELTER_H : BALCONY_H) + 0.2]);
  }
  out.push([x0 - LOOKOUT.reach, x0, LOOKOUT.z - LOOKOUT.half, LOOKOUT.z + LOOKOUT.half, deckY(LOOKOUT.z) + LOOKOUT.canopy]);
  out.push([STAGE.x0 - 1.5, STAGE.x1 + 1.5, STAGE.z1 - 2, STAGE.z0 + 2, STAGE_TOP + 0.6]);
  out.push([NORTH.x0, NORTH.x1, NORTH.z1, NORTH.z0, Math.max(LIFT.top, CROWN.y + STAGE_HOUSE.h + 0.3)]);
  return out;
})();
/** The highest of them all. */
export const INLET_TOP = Math.max(...INLET_AIR.map((b) => b[4]));

/** An axis box (x0, x1, z0, z1; either order) as a solid, grown by `pad`. */
const boxSolid = (xa: number, xb: number, za: number, zb: number, pad: number): Solid => ({
  x: (xa + xb) / 2,
  z: (za + zb) / 2,
  hw: Math.abs(xb - xa) / 2 + pad,
  hl: Math.abs(zb - za) / 2 + pad,
  yaw: 0,
});
/** Where the deck's underside is under this over the sea, the boats keep from under it as if it were a wall. */
export const LOW_DECK = SEA + 10.5;

/**
 * What stands in the harbour, for the boats (harbourTraffic.ts): every pier's cap as a disc, the deck where its
 * underside is low (near either shore) and the bays there, the stage with its dolphins and gangways, and the front of
 * the terraces; `soft` with the room the ways keep, `hard` as they are. Long stretches are cut into pieces no longer
 * than 40, as the water grid only looks so far from a solid's centre (harbourNav.ts).
 */
export function inletSolids(): { soft: Solid[]; hard: Solid[] } {
  const soft: Solid[] = [];
  const hard: Solid[] = [];
  for (const z of PIERS) {
    soft.push({ x: WALK.x, z, r: 2.8 });
    hard.push({ x: WALK.x, z, r: 1.6 });
  }
  // the low deck: where its underside is under LOW_DECK, cut where that changes and every 40 or less
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let z = WALK.z0; z >= WALK.z1; z -= 1) {
    const low = undersideY(z) < LOW_DECK;
    if (low && start === null) start = z;
    if ((!low || z - 1 < WALK.z1) && start !== null) {
      runs.push([start, low ? z : z + 1]);
      start = null;
    }
  }
  const x0 = WALK.x - WALK.beam;
  const x1 = WALK.x + WALK.beam;
  for (const [za, zb] of runs) {
    const n = Math.ceil((za - zb) / 40);
    for (let k = 0; k < n; k++) {
      const a = za - ((za - zb) * k) / n;
      const b = za - ((za - zb) * (k + 1)) / n;
      soft.push(boxSolid(x0, x1, a, b, 1.5));
      hard.push(boxSolid(x0, x1, a, b, 0));
    }
  }
  for (const bay of BAYS) {
    if (undersideY((bay.z0 + bay.z1) / 2) >= LOW_DECK) continue;
    const r = bayBox(bay);
    soft.push(boxSolid(r.x0, r.x1, r.z0, r.z1, 1.5));
    hard.push(boxSolid(r.x0, r.x1, r.z0, r.z1, 0));
  }
  // the stage, its dolphins and gangways; the terraces' front over the water
  soft.push(boxSolid(STAGE.x0 - 1.5, STAGE.x1 + 1.5, STAGE.z0 + 2, TERRACES.front, 1.5));
  hard.push(boxSolid(STAGE.x0 - 1.5, STAGE.x1 + 1.5, STAGE.z0 + 2, TERRACES.front, 0));
  soft.push(boxSolid(TERRACES.x0, TERRACES.x1, TERRACES.front, CROWN.z0, 1.5));
  hard.push(boxSolid(TERRACES.x0, TERRACES.x1, TERRACES.front, CROWN.z0, 0));
  return { soft, hard };
}

/**
 * On the walk or the stage's ground, with a pad: the deck (from the plaza's edge to the crown), its bays and lookout,
 * the stage and everything on the North Shore round it. The city builds nothing here, trees are taken out, the
 * Waterfront plaza leaves its furniture off the walk's foot.
 */
export function onInletWalk(x: number, z: number, pad = 0): boolean {
  if (x < WALK.x - WALK.beam - LOOKOUT.reach - pad - 6 || x > NORTH.x1 + pad || z > WALK.z0 + pad || z < NORTH.z1 - pad) return false;
  if (Math.abs(x - WALK.x) < WALK.beam + pad && z < WALK.z0 + pad && z > WALK.z1 - pad) return true;
  for (const b of BAYS) {
    const r = bayBox(b);
    if (x > r.x0 - pad && x < r.x1 + pad && z < r.z0 + pad && z > r.z1 - pad) return true;
  }
  const lx = WALK.x - WALK.beam;
  if (x < lx + pad && ((x - lx) / (LOOKOUT.reach + pad)) ** 2 + ((z - LOOKOUT.z) / (LOOKOUT.half + pad)) ** 2 < 1) return true;
  return x > NORTH.x0 - pad && x < NORTH.x1 + pad && z < NORTH.z0 + pad && z > NORTH.z1 - pad;
}
