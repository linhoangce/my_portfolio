/**
 * Mapped sites: parks, landmarks (nudged out of the guideway corridor) and Trout Lake, with the terrain pads they need.
 * Registering the pads here, at import, keeps them ahead of the first groundAt call (which freezes the ground).
 */
import { addModifier, demAt, discPad, inWater, LAKE, lakeLevel, lerp } from "./terrain";
import { samples } from "./track";

export type Park = { x: number; z: number; r: number; name: string };
export const PARKS: Park[] = [
  { x: 400, z: 374, r: 44, name: "John Hendry Park" },
  { x: 318, z: 356, r: 16, name: "Clark Park" },
  { x: 517, z: 520, r: 20, name: "Slocan Park" },
  { x: 648, z: 613, r: 14, name: "Gaston Park" },
  { x: 333, z: 155, r: 13, name: "Grandview Park" },
  { x: 860, z: 790, r: 95, name: "Central Park" },
];
export const inPark = (x: number, z: number): boolean => PARKS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r);

export type LandmarkKey = "harbourCentre" | "canadaPlace" | "convention" | "bcPlace" | "rogers" | "scienceWorld";
export type LandmarkDef = { key: LandmarkKey; x: number; z: number; r: number; h: number; margin: number; lotR: number };
/** Mapped positions (km × 110); lotR is the footprint radius lots keep clear of. */
export const LANDMARK_DEFS: LandmarkDef[] = [
  { key: "harbourCentre", x: 2.6, z: 18.4, r: 11, h: 56, margin: 6, lotR: 12 },
  { key: "canadaPlace", x: -36, z: -40, r: 16, h: 26, margin: 6, lotR: 16 },
  { key: "convention", x: -30, z: -34, r: 36, h: 11, margin: 6, lotR: 36 },
  { key: "bcPlace", x: -6, z: 122, r: 38, h: 26, margin: 6, lotR: 38 },
  { key: "rogers", x: 52, z: 134, r: 19, h: 12, margin: 7, lotR: 19 },
  { key: "scienceWorld", x: 68.3, z: 155.7, r: 12, h: 24, margin: 8, lotR: 13 },
];

/** Move a point out to at least `need` units from every curve sample, along the line from the nearest one. */
export function pushOut(x: number, z: number, need: number): [number, number] {
  let best = samples[0];
  let bd = 1e9;
  for (const f of samples) {
    const d = (f.p.x - x) ** 2 + (f.p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  const d = Math.sqrt(bd);
  if (d >= need) return [x, z];
  const k = need / Math.max(d, 0.01);
  return [best.p.x + (x - best.p.x) * k, best.p.z + (z - best.p.z) * k];
}

export type PlacedLandmark = LandmarkDef & { px: number; pz: number; padY: number };
/** Landmarks standing in the water (the Canada Place pier, the Convention Centre) keep a deck just above the sea. */
export const LANDMARKS: PlacedLandmark[] = LANDMARK_DEFS.map((l) => {
  const [px, pz] = pushOut(l.x, l.z, l.r + l.margin + 0.5);
  const wet = inWater(px, pz);
  let padY = 0;
  if (!wet) {
    let s = 0;
    for (let k = 0; k < 9; k++) s += demAt(px + Math.cos(k * 0.7) * l.r * 0.6, pz + Math.sin(k * 0.7) * l.r * 0.6);
    padY = s / 9;
    addModifier(discPad(px, pz, l.r + 4, 14, padY));
  }
  return { ...l, px, pz, padY };
});

export type Blocker = { x: number; z: number; r: number; h: number; top: number };
/** The camera steers around these; `top` is absolute (pad height plus the landmark's height). */
export const BLOCKERS: Blocker[] = LANDMARKS.map((l) => ({ x: l.px, z: l.pz, r: l.r, h: l.h, top: l.padY + l.h }));
export const inLandmark = (x: number, z: number, pad: number): boolean =>
  LANDMARKS.some((l) => Math.hypot(x - l.px, z - l.pz) < l.lotR + pad);

// parks are gently flattened toward their mean height; Trout Lake becomes a bowl below its surface with a flat shore
for (const p of PARKS) {
  const y = demAt(p.x, p.z);
  addModifier((x, z, h) => {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    return d >= 1.2 ? h : lerp(h, y, 0.45 * (1 - Math.min(1, Math.max(0, (d - 0.6) / 0.6))));
  });
}
{
  const level = lakeLevel();
  addModifier((x, z, h) => {
    const r = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    if (r > 1.9) return h;
    if (r < 1) return level - 1.5;
    return lerp(level + 0.25, h, Math.min(1, Math.max(0, (r - 1.15) / 0.75)));
  });
}
