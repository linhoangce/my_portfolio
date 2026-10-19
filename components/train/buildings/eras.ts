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
  downtown: { era: [0.1, 0.25, 0.65], h: [[8, 16], [30, 70], [48, 112]], split: 1, build: 0.95 },
  westend: { era: [0.2, 0.35, 0.45], h: [[8, 14], [24, 50], [30, 72]], split: 1, build: 0.85 },
  yaletown: { era: [0.25, 0.35, 0.4], h: [[8, 14], [24, 55], [36, 80]], split: 1, build: 0.9 },
  gastown: { era: [0.85, 0.1, 0.05], h: [[7, 13], [14, 22], [22, 36]], split: 2, build: 0.97 },
  chinatown: { era: [0.85, 0.1, 0.05], h: [[6, 10], [12, 20], [20, 34]], split: 2, build: 0.97 },
  strathcona: { era: [0.8, 0.12, 0.08], h: [[3, 5], [8, 14], [14, 28]], split: 3, build: 0.92, houses: true },
  flats: { era: [0.1, 0.3, 0.6], h: [[6, 10], [10, 24], [14, 48]], split: 1, build: 0.75 },
  olympic: { era: [0.05, 0.55, 0.4], h: [[6, 10], [12, 24], [18, 46]], split: 2, build: 0.9 },
  mountpleasant: { era: [0.4, 0.42, 0.18], h: [[3, 5], [8, 20], [16, 52]], split: 3, build: 0.92, houses: true },
  commercial: { era: [0.4, 0.45, 0.15], h: [[4, 8], [8, 16], [14, 32]], split: 2, build: 0.9 },
  joyce: { era: [0.05, 0.35, 0.6], h: [[3, 5], [14, 40], [24, 64]], split: 1, build: 0.85 },
  brentwood: { era: [0, 0.2, 0.8], h: [[4, 6], [30, 60], [40, 92]], split: 1, build: 0.9 },
  metrotown: { era: [0, 0.2, 0.8], h: [[4, 6], [30, 60], [40, 92]], split: 1, build: 0.9 },
  lonsdale: { era: [0.05, 0.45, 0.5], h: [[4, 6], [18, 40], [24, 60]], split: 1, build: 0.85 },
  northshore: { era: [0.75, 0.2, 0.05], h: [[3, 5], [6, 10], [10, 18]], split: 3, build: 0.6, houses: true },
  residential: { era: [0.72, 0.22, 0.06], h: [[3, 5], [6, 12], [10, 20]], split: 3, build: 0.85, houses: true },
};

export type ArchId =
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
  | "house";

export const ARCH_BY_ERA: Record<0 | 1 | 2, ArchId[]> = {
  0: ["heritageBrick", "heritageBrick", "warehouse", "chinatownBlock", "flatiron"],
  1: ["pointTower", "pointTower", "slab60s", "office", "colourPanels", "townhouses", "brickBaseTower"],
  2: ["helix", "needle", "stacked", "ziggurat", "vforest", "twins", "biodome", "wave"],
};

/** Archetypes that read as towers need a big enough lot and height. */
export const TOWERISH = new Set<ArchId>(["pointTower", "office", "brickBaseTower", "helix", "needle", "twins", "vforest", "wave"]);
