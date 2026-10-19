/**
 * Vancouver's trees as data: twelve species in a 4 × 3 atlas, each with a crown size, a bark colour, a seasonal
 * leaf palette and the rate its leaves turn and fall. Evergreens keep full cover all year; every deciduous species
 * reaches zero cover in winter, so bare crowns read as branches, never as brown or black blobs. No three.js here.
 */
import type { Season } from "../lookTypes";

export type SpeciesId =
  | "cedar"
  | "fir"
  | "hemlock"
  | "cherry"
  | "smaple"
  | "bigleaf"
  | "plane"
  | "alder"
  | "dogwood"
  | "fern"
  | "rhodo"
  | "arbutus";

export type Species = {
  id: SpeciesId;
  name: string;
  ever: boolean;
  /** Crown width and height in world units at scale 1. */
  size: [number, number];
  bark: number;
  /** Two leaf colours per season; instances mix between them. Evergreens use `all`. */
  leaves: Partial<Record<Season, [number, number]>> & { all?: [number, number] };
  /** How quickly leaves turn and fall relative to the others (alder first, plane last). */
  rate: number;
};

export const SPECIES: Species[] = [
  { id: "cedar", name: "Western red cedar", ever: true, size: [5.4, 10.5], bark: 0x7a5240, leaves: { all: [0x2f5b3b, 0x3f7046] }, rate: 1 },
  { id: "fir", name: "Douglas fir", ever: true, size: [4.4, 12.5], bark: 0x5e4a3c, leaves: { all: [0x264b35, 0x33603f] }, rate: 1 },
  { id: "hemlock", name: "Western hemlock", ever: true, size: [4.6, 11.5], bark: 0x6a5244, leaves: { all: [0x2c553c, 0x3a6847] }, rate: 1 },
  { id: "cherry", name: "Japanese flowering cherry", ever: false, size: [7.2, 6.2], bark: 0x7d655c, leaves: { spring: [0xf3c4d8, 0xe8a2c2], summer: [0x3f7a3a, 0x4b8a42], fall: [0xcf6f3a, 0xb84a30] }, rate: 1.3 },
  { id: "smaple", name: "Street maple", ever: false, size: [6.0, 7.6], bark: 0x7f776e, leaves: { spring: [0xb7df7a, 0x9ccf6a], summer: [0x4d9a45, 0x3f8a3c], fall: [0xd8402b, 0xe8742f] }, rate: 1 },
  { id: "bigleaf", name: "Bigleaf maple", ever: false, size: [8.2, 9.0], bark: 0x6f8247, leaves: { spring: [0xa9d36a, 0xc4e07c], summer: [0x2f6e30, 0x3c7d35], fall: [0xe2b43a, 0xd9982b] }, rate: 1.1 },
  { id: "plane", name: "London plane", ever: false, size: [6.6, 10.0], bark: 0xaaa290, leaves: { spring: [0x8cc364, 0x9fd06e], summer: [0x4a8f45, 0x3f7f3b], fall: [0xdcb83c, 0xc99a35] }, rate: 0.6 },
  { id: "alder", name: "Red alder", ever: false, size: [4.6, 9.4], bark: 0xbdbab2, leaves: { spring: [0x9ccf6a, 0xa8d673], summer: [0x3f8a3c, 0x4a9443], fall: [0xb0b444, 0x98a63c] }, rate: 1.5 },
  { id: "dogwood", name: "Pacific dogwood", ever: false, size: [5.6, 5.0], bark: 0x8a7a6e, leaves: { spring: [0xf6f2e8, 0xfbf8f0], summer: [0x3f8a3c, 0x468f40], fall: [0xbd3c31, 0xcc4a3b] }, rate: 0.9 },
  { id: "fern", name: "Sword fern", ever: true, size: [2.4, 1.5], bark: 0x3d5a32, leaves: { all: [0x3f7a3a, 0x4f8a40] }, rate: 1 },
  { id: "rhodo", name: "Rhododendron", ever: true, size: [3.4, 2.8], bark: 0x5a4a3e, leaves: { all: [0x2f5d36, 0x3c6c3e] }, rate: 1 },
  { id: "arbutus", name: "Arbutus", ever: true, size: [6.4, 7.2], bark: 0xa4502e, leaves: { all: [0x3f6f3a, 0x4d7d40] }, rate: 1 },
];
export const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.id, i])) as Record<SpeciesId, number>;

export const COVER: Record<Season, number> = { spring: 1, summer: 1, fall: 0.82, winter: 0 };

/** Leaf colours for a species in a season. */
export const leafColours = (sp: Species, season: Season): [number, number] => sp.leaves.all ?? sp.leaves[season] ?? sp.leaves.summer ?? [0x3f7a3a, 0x4b8a42];

/** Weighted pools by setting: street trees by district, parks, Stanley Park, the cut, the North Shore. */
export const POOLS: Record<string, [SpeciesId, number][]> = {
  streetDowntown: [["plane", 4], ["smaple", 3], ["cherry", 3]],
  streetHeritage: [["plane", 5], ["cherry", 3], ["smaple", 2]],
  streetResidential: [["cherry", 35], ["smaple", 25], ["dogwood", 10], ["plane", 10], ["bigleaf", 5], ["arbutus", 3]],
  streetFlats: [["alder", 3], ["bigleaf", 2], ["smaple", 3], ["cherry", 2]],
  park: [["bigleaf", 20], ["cedar", 20], ["fir", 20], ["hemlock", 10], ["alder", 10], ["cherry", 10], ["dogwood", 5], ["rhodo", 5]],
  forest: [["cedar", 30], ["fir", 30], ["hemlock", 25], ["bigleaf", 10], ["alder", 5]],
  cut: [["cedar", 25], ["fir", 20], ["alder", 25], ["bigleaf", 20], ["hemlock", 10]],
  northShore: [["fir", 35], ["cedar", 25], ["hemlock", 25], ["alder", 10], ["bigleaf", 5]],
  undergrowth: [["fern", 7], ["rhodo", 2], ["fern", 1]],
};
