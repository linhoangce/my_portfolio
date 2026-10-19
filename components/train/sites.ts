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
  { x: 248, z: 253, r: 13, name: "China Creek Park" },
];
// squared distances: these run for every test point of every lot, and Math.hypot is slow in V8
export const inPark = (x: number, z: number): boolean => PARKS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r);

export type LandmarkKey = "harbourCentre" | "canadaPlace" | "convention" | "bcPlace" | "rogers" | "scienceWorld" | "gate" | "cauldron" | "orca" | "steamClock";
export type LandmarkDef = { key: LandmarkKey; x: number; z: number; r: number; h: number; margin: number; lotR: number };
/** Mapped positions (km × 110); lotR is the footprint radius lots keep clear of. */
export const LANDMARK_DEFS: LandmarkDef[] = [
  { key: "harbourCentre", x: 2.6, z: 18.4, r: 11, h: 56, margin: 6, lotR: 12 },
  // Canada Place out on its pier over the inlet, the Convention Centre on the shore to the west (they overlapped)
  { key: "canadaPlace", x: -40, z: -76, r: 26, h: 22, margin: 6, lotR: 30 },
  { key: "convention", x: -88, z: -46, r: 20, h: 11, margin: 6, lotR: 20 },
  { key: "bcPlace", x: -6, z: 122, r: 38, h: 26, margin: 6, lotR: 38 },
  { key: "rogers", x: 52, z: 134, r: 19, h: 12, margin: 7, lotR: 19 },
  { key: "scienceWorld", x: 68.3, z: 155.7, r: 12, h: 24, margin: 8, lotR: 13 },
  // smaller monuments (Nominatim positions); the cauldron and the orca stand beside the Convention Centre
  { key: "gate", x: 55.2, z: 67.4, r: 4.5, h: 9, margin: 10, lotR: 6 },
  { key: "cauldron", x: -43.5, z: -38.9, r: 4, h: 11, margin: 10, lotR: 6 },
  { key: "orca", x: -35.9, z: -44.5, r: 4, h: 6, margin: 10, lotR: 5 },
  { key: "steamClock", x: 26.6, z: 22, r: 1.5, h: 6, margin: 10, lotR: 3 },
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
const SMALL = new Set<LandmarkKey>(["gate", "cauldron", "orca", "steamClock"]);
/** The nearest spot to (x, z) on dry land, clear of the track and of the big landmarks already placed. */
function dryClear(l: LandmarkDef, placed: PlacedLandmark[]): [number, number] {
  for (let r = 0; r < 80; r += 3) {
    for (let a = 0; a < Math.PI * 2; a += r ? 3 / r : 7) {
      const x = l.x + Math.cos(a) * r;
      const z = l.z + Math.sin(a) * r;
      const [px, pz] = pushOut(x, z, l.r + l.margin + 0.5);
      if (Math.hypot(px - x, pz - z) > 0.1) continue;
      if (inWater(px, pz) || inWater(px + l.r, pz) || inWater(px - l.r, pz) || inWater(px, pz + l.r) || inWater(px, pz - l.r)) continue;
      if (placed.some((o) => Math.hypot(px - o.px, pz - o.pz) < o.lotR + l.lotR + 2)) continue;
      return [px, pz];
    }
  }
  return pushOut(l.x, l.z, l.r + l.margin + 0.5);
}
/** Landmarks standing in the water (the Canada Place pier, the Convention Centre) keep a deck just above the sea. */
export const LANDMARKS: PlacedLandmark[] = [];
for (const l of LANDMARK_DEFS) {
  const [px, pz] = SMALL.has(l.key) ? dryClear(l, LANDMARKS) : pushOut(l.x, l.z, l.r + l.margin + 0.5);
  const wet = inWater(px, pz);
  let padY = 0;
  if (!wet) {
    let s = 0;
    for (let k = 0; k < 9; k++) s += demAt(px + Math.cos(k * 0.7) * l.r * 0.6, pz + Math.sin(k * 0.7) * l.r * 0.6);
    padY = s / 9;
    if (!SMALL.has(l.key)) addModifier(discPad(px, pz, l.r + 4, 14, padY));
    else padY = demAt(px, pz);
  }
  LANDMARKS.push({ ...l, px, pz, padY });
}

export type Blocker = { x: number; z: number; r: number; h: number; top: number };
/** The camera steers around these; `top` is absolute (pad height plus the landmark's height). */
export const BLOCKERS: Blocker[] = LANDMARKS.map((l) => ({ x: l.px, z: l.pz, r: l.r, h: l.h, top: l.padY + l.h }));
export const inLandmark = (x: number, z: number, pad: number): boolean =>
  LANDMARKS.some((l) => (x - l.px) ** 2 + (z - l.pz) ** 2 < (l.lotR + pad) ** 2);

/**
 * China Creek, daylighted: from China Creek Park down through the False Creek Flats to the head of False Creek, in a
 * swale 16 units wide and 1.4 deep. The last point is extended until it reaches the water.
 */
export const STREAM: [number, number][] = (() => {
  const pts: [number, number][] = [[248, 253], [226, 232], [204, 212], [178, 195], [150, 184], [124, 177], [100, 174], [80, 172], [64, 170]];
  for (let k = 0; k < 30 && !inWater(...pts[pts.length - 1]); k++) {
    const [x, z] = pts[pts.length - 1];
    pts.push([x - 4, z - 0.6]);
  }
  return pts;
})();
const STREAM_BOX = STREAM.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
export function streamDist(x: number, z: number): number {
  // anything well outside the creek's box is simply far (callers only ask about the nearest few dozen units)
  if (x < STREAM_BOX[0] - 60 || x > STREAM_BOX[1] + 60 || z < STREAM_BOX[2] - 60 || z > STREAM_BOX[3] + 60) return 99;
  let d2 = 1e18;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i];
    const [bx, bz] = STREAM[i + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    d2 = Math.min(d2, (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2);
  }
  return Math.sqrt(d2);
}
addModifier((x, z, h) => {
  if (x < 40 || x > 270 || z < 150 || z > 270) return h;
  const d = streamDist(x, z);
  if (d >= 9) return h;
  const t = Math.min(1, Math.max(0, (d - 2.2) / 6.8));
  return h - 1.4 * (1 - t * t * (3 - 2 * t));
});

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
