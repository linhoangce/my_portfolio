/**
 * Neighbourhoods and their era mix for Vancouver, 2100: heritage pockets (Gastown, Chinatown, Strathcona, the
 * Victorian and Craftsman streets), today's icons and towers, and the 2100 skyline. Each zone sets the share of
 * heritage / current / 2100 buildings, their height ranges (units above the street), how blocks split into lots and
 * whether heritage lots are houses. Pure.
 */
import { inPark } from "../sites";
import { sdfAt } from "../terrain";
import { cutNear } from "../track";

export type Hood =
  | "forest"
  | "park"
  | "cut"
  | "northshore"
  | "lonsdale"
  | "gastown"
  | "chinatown"
  | "strathcona"
  | "downtown"
  | "westend"
  | "yaletown"
  | "olympic"
  | "mainst"
  | "flats"
  | "mountpleasant"
  | "commercial"
  | "joyce"
  | "brentwood"
  | "metrotown"
  | "residential";

export function hood(x: number, z: number): Hood {
  if (x > -470 && x < -150 && z > -420 && z < -40) return "forest";
  if (inPark(x, z)) return "park";
  if (z < -150 && sdfAt(x, z) > 0) return Math.hypot(x - 235, z + 310) < 55 ? "lonsdale" : "northshore";
  if (x > 8 && x < 100 && z > -40 && z < 58) return "gastown";
  if (x > 28 && x < 104 && z >= 58 && z < 100) return "chinatown";
  if (x >= 100 && x < 250 && z > -40 && z < 112) return "strathcona";
  if (Math.hypot(x + 40, z - 50) < 120) return "downtown";
  if (x < -120 && z < 140) return "westend";
  if (x > -140 && x < 30 && z >= 92 && z < 150) return "yaletown";
  if (x > -90 && x < 90 && z > 190 && z < 250) return "olympic";
  // round Main Street–Science World: the towers along Main and Quebec, Terminal and the head of the creek
  if (Math.hypot(x - 112, z - 172) < 62 && z > 112) return "mainst";
  if (cutNear(x, z) > 0.3) return "cut";
  if (x > 95 && x < 250 && z >= 112 && z < 225) return "flats";
  if (x > 15 && x < 250 && z >= 225 && z < 340) return "mountpleasant";
  if (Math.hypot(x - 344, z - 298) < 70) return "commercial";
  if (Math.hypot(x - 643, z - 585) < 60) return "joyce";
  if (Math.hypot(x - 885, z - 242) < 60) return "brentwood";
  if (Math.hypot(x - 860, z - 728) < 65) return "metrotown";
  return "residential";
}

export type Zone = {
  /** Share of heritage, current and 2100 buildings. */
  era: [number, number, number];
  /** Height ranges per era, units above the street. */
  h: [[number, number], [number, number], [number, number]];
  /** 1: big lots (1 or 2 per side), 2: 2 × 2, 3: house lots (2 × 3). */
  split: 1 | 2 | 3;
  build: number;
  /** Heritage lots in this zone are houses (instanced templates). */
  houses?: boolean;
};

export const ZONES: Partial<Record<Hood, Zone>> = {
  downtown: { era: [0.2, 0.42, 0.38], h: [[10, 34], [40, 100], [48, 128]], split: 1, build: 0.98 },
  westend: { era: [0.2, 0.5, 0.3], h: [[8, 22], [30, 72], [36, 86]], split: 1, build: 0.92 },
  yaletown: { era: [0.3, 0.42, 0.28], h: [[8, 16], [34, 80], [40, 96]], split: 1, build: 0.95 },
  gastown: { era: [0.85, 0.1, 0.05], h: [[7, 13], [14, 22], [22, 36]], split: 2, build: 0.97 },
  chinatown: { era: [0.85, 0.1, 0.05], h: [[6, 10], [12, 20], [20, 34]], split: 2, build: 0.97 },
  strathcona: { era: [0.8, 0.12, 0.08], h: [[3, 5], [8, 14], [14, 28]], split: 3, build: 0.92, houses: true },
  flats: { era: [0.15, 0.45, 0.4], h: [[6, 10], [10, 24], [14, 48]], split: 1, build: 0.75 },
  olympic: { era: [0.08, 0.62, 0.3], h: [[6, 10], [12, 24], [18, 46]], split: 2, build: 0.9 },
  mainst: { era: [0.05, 0.5, 0.45], h: [[6, 10], [28, 66], [34, 86]], split: 1, build: 0.95 },
  mountpleasant: { era: [0.4, 0.42, 0.18], h: [[3, 5], [8, 20], [16, 52]], split: 3, build: 0.92, houses: true },
  commercial: { era: [0.4, 0.45, 0.15], h: [[4, 8], [8, 16], [14, 32]], split: 2, build: 0.9 },
  joyce: { era: [0.05, 0.5, 0.45], h: [[3, 5], [14, 40], [24, 64]], split: 1, build: 0.85 },
  brentwood: { era: [0, 0.2, 0.8], h: [[4, 6], [30, 60], [40, 92]], split: 1, build: 0.9 },
  metrotown: { era: [0, 0.2, 0.8], h: [[4, 6], [30, 60], [40, 92]], split: 1, build: 0.9 },
  lonsdale: { era: [0.05, 0.45, 0.5], h: [[4, 6], [18, 40], [24, 60]], split: 1, build: 0.85 },
  northshore: { era: [0.75, 0.2, 0.05], h: [[3, 5], [6, 10], [10, 18]], split: 3, build: 0.6, houses: true },
  residential: { era: [0.72, 0.22, 0.06], h: [[3, 5], [6, 12], [10, 20]], split: 3, build: 0.85, houses: true },
};

export type ArchId =
  | "salishHall"
  | "heritageBrick"
  | "warehouse"
  | "chinatownBlock"
  | "flatiron"
  | "pointTower"
  | "slab60s"
  | "office"
  | "colourPanels"
  | "townhouses"
  | "brickBaseTower"
  | "helix"
  | "needle"
  | "stacked"
  | "ziggurat"
  | "vforest"
  | "twins"
  | "biodome"
  | "wave"
  | "edwardian"
  | "decoTower"
  | "civic"
  | "timberTerraces"
  | "pixelTwist"
  | "midrise"
  | "courtyard"
  | "officeMullion"
  | "brutalist"
  | "curvedBands"
  | "metalLoft"
  | "dtTower"
  | "latticeTower"
  | "boxTower"
  | "cantilever"
  | "slabStack"
  | "butterfly"
  | "darkEllipse"
  | "galleryStack"
  | "house";

/**
 * Archetypes per era with weights. Vancouver is mostly point towers, slabs and old blocks, so those carry the most
 * weight; the sculptural 2100 forms are spread thin so no one of them repeats down a street.
 */
export const ARCH_BY_ERA: Record<0 | 1 | 2, [ArchId, number][]> = {
  0: [
    ["heritageBrick", 1.2],
    ["warehouse", 0.7],
    ["chinatownBlock", 0.3],
    ["flatiron", 0.3],
    ["edwardian", 1.5],
    ["decoTower", 0.6],
    ["civic", 0.35],
    ["brutalist", 0.5],
  ],
  1: [
    ["pointTower", 2.0],
    ["midrise", 1.6],
    ["slab60s", 0.7],
    ["office", 0.5],
    ["officeMullion", 0.8],
    ["colourPanels", 0.5],
    ["townhouses", 0.5],
    ["brickBaseTower", 0.7],
    ["courtyard", 0.6],
    ["metalLoft", 0.4],
    ["brutalist", 0.3],
  ],
  2: [
    ["timberTerraces", 0.25],
    ["curvedBands", 0.7],
    ["pixelTwist", 0.6],
    ["helix", 0.5],
    ["vforest", 0.3],
    ["twins", 0.4],
    ["biodome", 0.5],
    ["wave", 0.5],
    ["courtyard", 0.4],
    ["latticeTower", 0.3],
    ["boxTower", 0.35],
    ["slabStack", 0.3],
    ["cantilever", 0.2],
    ["ziggurat", 0.25],
    ["stacked", 0.3],
    ["needle", 0.2],
  ],
};

/**
 * The towers' districts (downtown, the West End, Yaletown) are mostly the downtown tower, which varies itself, with
 * the other current and 2100 forms among them as the exceptions they are.
 */
export const ARCH_DENSE: Record<1 | 2, [ArchId, number][]> = {
  1: [
    ["dtTower", 6],
    ["darkEllipse", 0.7],
    ["butterfly", 0.4],
    ["pointTower", 1],
    ["midrise", 0.8],
    ["officeMullion", 0.5],
    ["brickBaseTower", 0.5],
    ["slab60s", 0.3],
    ["brutalist", 0.3],
    ["curvedBands", 0.3],
  ],
  2: [
    ["dtTower", 3],
    ["latticeTower", 0.8],
    ["boxTower", 0.8],
    ["slabStack", 0.7],
    ["cantilever", 0.6],
    ["butterfly", 0.4],
    ["curvedBands", 0.5],
    ["pixelTwist", 0.35],
    ["twins", 0.3],
    ["helix", 0.3],
    ["wave", 0.25],
    ["timberTerraces", 0.2],
    ["vforest", 0.12],
    ["biodome", 0.1],
    ["needle", 0.08],
  ],
};

/**
 * Where houses are the rule, the buildings among them are low: the mixed-use block, townhouses and courtyards, the
 * odd loft or small 2100 piece, never a tower.
 */
export const ARCH_LOWRISE: Record<1 | 2, [ArchId, number][]> = {
  1: [
    ["midrise", 2.4],
    ["townhouses", 1.6],
    ["colourPanels", 0.7],
    ["metalLoft", 0.6],
    ["courtyard", 0.5],
    ["slab60s", 0.25],
  ],
  2: [
    ["timberTerraces", 0.3],
    ["courtyard", 0.5],
    ["biodome", 0.35],
    ["stacked", 0.25],
    ["ziggurat", 0.2],
    ["midrise", 0.6],
  ],
};

/**
 * Where towers are the rule, old houses still stand among them (Vancouver keeps its heritage houses in the West End,
 * along the Drive and by the stations): the share of lots that are houses.
 */
export const HOUSE_MIX: Partial<Record<Hood, number>> = {
  downtown: 0.03,
  westend: 0.14,
  yaletown: 0.03,
  flats: 0.08,
  olympic: 0.05,
  commercial: 0.22,
  joyce: 0.18,
  brentwood: 0.06,
  metrotown: 0.05,
  lonsdale: 0.14,
};

/** Archetypes that read as towers need a big enough lot and height. */
export const TOWERISH = new Set<ArchId>(["dtTower", "latticeTower", "boxTower", "cantilever", "slabStack", "butterfly", "darkEllipse", "pointTower", "office", "brickBaseTower", "helix", "needle", "twins", "vforest", "wave", "decoTower", "pixelTwist", "officeMullion", "brutalist", "curvedBands"]);
