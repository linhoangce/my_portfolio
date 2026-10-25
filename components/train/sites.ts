/**
 * Mapped sites: parks, landmarks (nudged out of the guideway corridor) and Trout Lake, with the terrain pads they need.
 * Registering the pads here, at import, keeps them ahead of the first groundAt call (which freezes the ground).
 */
import { PARK_DATA } from "./parkData";
import { CONVENTION, DOCK, HARBOUR_GREEN, inDock, QUAY_Y, RIM } from "./harbourfront";
import { lionsGateDeck } from "./lionsGate";
import { SEA } from "./constants";
import { addModifier, addUnbakedModifier, demAt, discPad, groundAt, inBasin, inWater, LAKE, lakeLevel, lerp, polySdf, sdfAt, SHORES, SW_POINT } from "./terrain";
import { samples } from "./track";

type XZ = [number, number];
/** A paved park path: a polyline (drawn as a smooth curve through its points) `w` units wide. */
export type ParkPath = { pts: XZ[]; w: number };
/**
 * A park: a disc, or a polygon (`poly`) with its paths. x, z, r are the centre and the radius that holds the whole
 * park (for quick rejects); `trees` is the share of open ground that is planted (0.55 if not given), `rows` the
 * spacing of a row of trees just inside its outline (none if not given).
 */
export type Park = { x: number; z: number; r: number; name: string; poly?: XZ[]; paths?: ParkPath[]; trees?: number; rows?: number; level?: boolean };

/** A park from its outline: centre and holding radius from the points; `level` false leaves its ground alone. */
function shaped(name: string, poly: XZ[], paths: ParkPath[] = [], trees?: number, level = true): Park {
  const x = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const z = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const r = Math.max(...poly.map((p) => Math.hypot(p[0] - x, p[1] - z)));
  return { x, z, r, name, poly, paths, trees, level };
}
const ring = (x: number, z: number, r: number, n = 14): XZ[] => Array.from({ length: n + 1 }, (_, k): XZ => [x + Math.cos((k / n) * Math.PI * 2) * r, z + Math.sin((k / n) * Math.PI * 2) * r]);
const arcPts = (x: number, z: number, r: number, a0: number, a1: number, n: number): XZ[] =>
  Array.from({ length: n + 1 }, (_, k): XZ => {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    return [x + Math.cos(a) * r, z + Math.sin(a) * r];
  });

/**
 * Thornton Park, the block north of Main Street–Science World station between Main and Station Streets, its south
 * edge along the guideway: a long walk up the middle through three roundels, paths fanning to the corners and one
 * across, under a full canopy of old trees (a row of them lines its edges).
 */
const THORNTON: Park = {
  ...shaped(
    "Thornton Park",
    [
      [103.5, 131.5],
      [119.6, 131.5],
      [119.6, 161.2],
      [103.5, 155.2],
    ],
    [
      { pts: [[111.5, 131.5], [111.5, 135.3]], w: 1.3 },
      { pts: [[111.5, 138.7], [111.5, 142.8]], w: 1.3 },
      { pts: [[111.5, 146.2], [111.5, 150.3]], w: 1.3 },
      { pts: [[111.5, 153.7], [111.5, 158.2]], w: 1.3 },
      { pts: ring(111.5, 137, 1.7), w: 1 },
      { pts: ring(111.5, 144.5, 1.7), w: 1 },
      { pts: ring(111.5, 152, 1.7), w: 1 },
      { pts: [[103.5, 131.5], [106.6, 133.2], [110.1, 136]], w: 1.1 },
      { pts: [[119.6, 131.5], [116.4, 133.2], [112.9, 136]], w: 1.1 },
      { pts: [[103.5, 144.5], [109.8, 144.5]], w: 1.1 },
      { pts: [[113.2, 144.5], [119.6, 144.5]], w: 1.1 },
      // down to the station at the south-west corner, and out to Station Street
      { pts: [[110.2, 153.1], [107, 154.4], [103.5, 155.2]], w: 1.3 },
      { pts: [[112.9, 153], [116.4, 154.6], [119.6, 155.6]], w: 1.1 },
    ],
    0.95,
  ),
  rows: 3.6,
};
/**
 * Creekside Park, between the head of the basin and the guideway: lawns falling to the water, the seawall walk along
 * the shore and a path curving from the station down to Science World; China Creek runs through it into the basin.
 */
const CREEKSIDE = shaped(
  "Creekside Park",
  [
    [70, 168],
    [68, 160],
    [70, 153],
    [74, 149],
    [80, 156],
    [86, 164],
    [88, 172],
    // down toward Science World, stopping where its fan begins
    [84, 178],
    [76, 181],
    [70, 180],
    [67, 177],
  ],
  [{ pts: [[84.5, 163], [79, 167], [75, 173], [72, 177.5], [70.5, 182]], w: 1.6 }],
  0.5,
);
/**
 * Northeast False Creek Park: the lawn between BC Place and its seawall, on the old viaduct lands (and on the
 * stadium's pad, so its ground is left alone).
 */
const NEFC = shaped("Northeast False Creek Park", [...arcPts(-14, 130, 45, 124, 36, 8), ...arcPts(-14, 130, 52.5, 36, 124, 8)], [], 0.35, false);
/** The Olympic Village's waterfront along the basin's south shore, Hinge Park at its west end. */
const HINGE = shaped(
  "Hinge Park",
  [
    [-60, 234],
    [-40, 242.5],
    [-10, 250.5],
    [20, 253.5],
    [50, 251.5],
    [66, 248],
    [66, 255],
    [50, 258.5],
    [20, 260.5],
    [-10, 257.5],
    [-40, 249.5],
    [-60, 241],
  ],
  [],
  0.45,
);
/**
 * The creek's north shore as one waterfront of lawns from the bay below Beach Avenue to BC Place's, the seawall walk
 * along their foot: George Wainborn Park, David Lam Park and Coopers' Park, each down to a unit short of the water and
 * its ground left as the bank has it, planted thickly with a row of trees along the streets it meets. George Wainborn
 * keeps the city's outline toward the streets and reaches west to the bay; David Lam runs from Pacific Street and
 * Pacific Boulevard to the seawall, west to George Wainborn and east under the Cambie Bridge; Coopers' Park lies where
 * it is, along the seawall east of the bridge, between the Roundhouse's blocks and the water (the city's outline of it
 * lies under BC Place here, which is larger than life).
 */
const GEORGE_WAINBORN: Park = {
  ...shaped(
    "George Wainborn Park",
    [
      [-128.6, 161.6],
      [-129.7, 160],
      [-131.4, 158.9],
      [-137.1, 159.4],
      [-140.3, 157.7],
      [-148, 157.5],
      [-150.7, 158],
      [-150.2, 164],
      [-149.4, 170],
      [-146, 173.1],
      [-142, 176.2],
      [-138, 177.4],
      [-134, 178.9],
      [-130, 181.3],
      [-127, 181.7],
      [-126.5, 171.1],
      [-128.7, 167.8],
    ],
    [],
    0.7,
    false,
  ),
  rows: 5,
};
const DAVID_LAM: Park = {
  ...shaped(
    "David Lam Park",
    [
      [-128.6, 161.6],
      [-124, 161.5],
      [-120, 162.5],
      [-114, 164.5],
      [-108.4, 163.5],
      [-101.1, 162],
      [-91, 158],
      [-82.2, 166.7],
      [-78.5, 170],
      [-78, 185],
      [-82, 185.7],
      [-90, 186.3],
      [-98, 186.4],
      [-106, 186.3],
      [-110, 186],
      [-114, 185.2],
      [-118, 183.7],
      [-122, 182.4],
      [-127, 181.7],
      [-126.5, 171.1],
      [-128.7, 167.8],
    ],
    [],
    0.7,
    false,
  ),
  rows: 5,
};
const COOPERS: Park = {
  ...shaped(
    "Coopers' Park",
    [
      [-75, 170],
      [-73, 174],
      [-48, 174],
      [-43.4, 173.5],
      [-45, 176.8],
      [-50, 176.8],
      [-54, 176.9],
      [-58, 177.6],
      [-62, 178.6],
      [-66, 179.8],
      [-70, 181.6],
      [-74, 183.4],
      [-76, 184.3],
    ],
    [],
    0.7,
    false,
  ),
  rows: 5,
};

/**
 * The four parks round False Creek's east basin keep the shapes the ride drew for them (mapped, then fitted round the
 * larger-than-life landmarks; Northeast False Creek Park is the city's planned park on the old viaduct lands, built by
 * 2100). Every other park is its real outline (parkData.ts: the City of Vancouver's, OpenStreetMap's in Burnaby),
 * except where one of those four already stands.
 */
/**
 * Harbour Green Park, round the bay west of the Convention Centre behind the seawall (harbourfront.ts): lawns under
 * rows of trees along the water and toward the towers, its cafés on decks facing the inlet. The city's own outline
 * of it lies under the Convention Centre and Jack Poole Plaza here, which stand on the line's side of the bay.
 */
const HARBOUR: Park = { ...shaped("Harbour Green Park", HARBOUR_GREEN, [], 0.18, false), rows: 4.4 };
/**
 * Creekside Slope: the bank where the ground rises from Science World's pad toward the blocks to the south-east, planted
 * and left its own shape (lawn and trees on the slope, nothing standing in it), between the pad and where the city's
 * lots begin.
 */
const SLOPE = shaped(
  "Creekside Slope",
  [
    [105.0, 212.4], [105.0, 215.7], [104.6, 219.0], [104.0, 222.2], [103.0, 225.3], [101.7, 228.4], [100.1, 231.3],
    [98.3, 234.0], [96.1, 236.5], [93.8, 238.8], [91.2, 240.9], [88.4, 242.6], [82.2, 231.8], [83.9, 230.7], [85.5, 229.4],
    [87.0, 228.0], [88.3, 226.4], [89.5, 224.7], [90.5, 222.9], [91.3, 221.0], [91.9, 219.1], [92.3, 217.1], [92.5, 215.0],
    [92.5, 213.0],
  ],
  [],
  0.6,
  false,
);
const DRAWN = [CREEKSIDE, NEFC, HINGE, THORNTON, HARBOUR, GEORGE_WAINBORN, DAVID_LAM, COOPERS];
const MAPPED: Park[] = PARK_DATA.flatMap(({ name, poly: enc }) => {
  const bin = atob(enc);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const q = new Int16Array(u8.buffer);
  const poly: XZ[] = [];
  // a ring repeats its first point at its end, and the simplifier can leave a point twice: polySdf needs every side
  // of non-zero length
  for (let i = 0; i < q.length; i += 2) {
    const p: XZ = [q[i] / 10, q[i + 1] / 10];
    const last = poly[poly.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.05) poly.push(p);
  }
  while (poly.length > 2 && Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]) < 0.05) poly.pop();
  if (poly.length < 3) return [];
  const x = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const z = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  if (DRAWN.some((d) => (d.poly && inPoly(d.poly, x, z)) || d.name === name)) return [];
  const r = Math.max(...poly.map(([px, pz]) => Math.hypot(px - x, pz - z))) + 0.5;
  return [{ x, z, r, name, poly }];
});
export const PARKS: Park[] = [
  ...DRAWN,
  ...MAPPED,
  // Burnaby's Central Park, should the map not have it
  ...(MAPPED.some((p) => p.name === "Central Park") ? [] : [{ x: 860, z: 790, r: 95, name: "Central Park" }]),
];
/**
 * Lawns drawn and planted that are not parks to the city (it reads PARKS for its neighbourhoods and lots, and this lies
 * where it keeps clear already): Science World's planted slope.
 */
export const PLANTED: Park[] = [SLOPE];
/** The parks by 32-unit cell, so the many point tests stay quick. */
const PARK_CELLS = new Map<number, Park[]>();
for (const p of PARKS) {
  for (let i = Math.floor((p.x - p.r) / 32); i <= Math.floor((p.x + p.r) / 32); i++) {
    for (let j = Math.floor((p.z - p.r) / 32); j <= Math.floor((p.z + p.r) / 32); j++) {
      const k = i * 100000 + j;
      const c = PARK_CELLS.get(k);
      if (c) c.push(p);
      else PARK_CELLS.set(k, [p]);
    }
  }
}
/** Even-odd test against a park's outline. */
export function inPoly(poly: XZ[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
  }
  return inside;
}
/** The park at (x, z), if any. */
// squared distances: these run for every test point of every lot, and Math.hypot is slow in V8
export const parkAt = (x: number, z: number): Park | undefined =>
  PARK_CELLS.get(Math.floor(x / 32) * 100000 + Math.floor(z / 32))?.find((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r && (!p.poly || inPoly(p.poly, x, z)));
export const inPark = (x: number, z: number): boolean => parkAt(x, z) !== undefined;
/** Distance to the nearest park path's or the seawall's edge (negative on it); far away is simply 99. */
export function parkPathDist(x: number, z: number): number {
  let best = seawallDist(x, z);
  for (const { path, box } of PATH_BOXES) {
    if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
    for (let i = 0; i < path.pts.length - 1; i++) {
      const [ax, az] = path.pts[i];
      const [bx, bz] = path.pts[i + 1];
      const ex = bx - ax;
      const ez = bz - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
      best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t) - path.w / 2);
    }
  }
  return best;
}

export type LandmarkKey = "harbourCentre" | "canadaPlace" | "convention" | "bcPlace" | "rogers" | "scienceWorld" | "waterfrontHub" | "gate" | "cauldron" | "orca" | "steamClock";
/** `yaw` turns the landmark about its centre (radians, as Object3D.rotation.y). */
export type LandmarkDef = { key: LandmarkKey; x: number; z: number; r: number; h: number; margin: number; lotR: number; yaw?: number };
/**
 * Science World's low wing fans out toward the plaza and the station (east-north-east): its yaw turns the local +x
 * axis, along which the wing is built, to that bearing.
 */
export const SW_FAN = (-20 * Math.PI) / 180;
/** Mapped positions (km × 110); lotR is the footprint radius lots keep clear of. */
export const LANDMARK_DEFS: LandmarkDef[] = [
  { key: "harbourCentre", x: 2.6, z: 18.4, r: 11, h: 56, margin: 6, lotR: 12 },
  // Canada Place out on its pier over the inlet, the Convention Centre on the shore to the west (they overlapped)
  { key: "canadaPlace", x: -40, z: -76, r: 26, h: 22, margin: 6, lotR: 30 },
  { key: "convention", x: CONVENTION.x, z: CONVENTION.z, r: 24, h: 11, margin: 6, lotR: 24, yaw: CONVENTION.yaw },
  { key: "bcPlace", x: -14, z: 130, r: 48, h: 64, margin: 6, lotR: 48 },
  // Rogers Arena east of BC Place, back from the north shore and long side to the guideway, so the water between
  // BC Place and Science World stays open; Science World on its point with its plaza and science park to the east
  { key: "rogers", x: 46, z: 140, r: 18, h: 11, margin: 7, lotR: 18, yaw: Math.PI / 2 },
  { key: "scienceWorld", x: SW_POINT.x, z: SW_POINT.z, r: 16, h: 28, margin: 8, lotR: 32, yaw: -SW_FAN },
  // the 2100 hub on a deck over the harbour east of the old CPR station, its gallery reaching out into the inlet
  { key: "waterfrontHub", x: 38, z: -30, r: 20, h: 62, margin: 4, lotR: 22 },
  // smaller monuments (Nominatim positions); the cauldron by the water in Jack Poole Plaza and the orca at the
  // Convention Centre's east end, both on the plaza's quay (harbourfront.ts), stand where they are put
  { key: "gate", x: 55.2, z: 67.4, r: 4.5, h: 9, margin: 10, lotR: 6 },
  { key: "cauldron", x: -58.5, z: -38.5, r: 4, h: 11, margin: 10, lotR: 4 },
  { key: "orca", x: -63, z: -37.5, r: 3, h: 6, margin: 10, lotR: 3 },
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
/** Small monuments placed by hand: on the plaza's quay, which `dryClear` (dry land only) would push off. */
const PINNED = new Set<LandmarkKey>(["cauldron", "orca"]);
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
  const [px, pz] = PINNED.has(l.key) ? [l.x, l.z] : SMALL.has(l.key) ? dryClear(l, LANDMARKS) : pushOut(l.x, l.z, l.r + l.margin + 0.5);
  const wet = inWater(px, pz);
  let padY = 0;
  // the Convention Centre and what stands in the dock stand on its decks
  if (l.key === "convention" || (SMALL.has(l.key) && inDock(px, pz))) padY = QUAY_Y;
  else if (!wet) {
    let s = 0;
    for (let k = 0; k < 9; k++) s += demAt(px + Math.cos(k * 0.7) * l.r * 0.6, pz + Math.sin(k * 0.7) * l.r * 0.6);
    padY = s / 9;
    // round the east basin the pad stops at the water: a seawall, not a filled-in shore
    const pad = discPad(px, pz, l.r + 4, 14, padY);
    if (!SMALL.has(l.key)) addModifier((x, z, h) => (inBasin(x, z) ? h : pad(x, z, h)));
    else padY = demAt(px, pz);
  }
  LANDMARKS.push({ ...l, px, pz, padY });
}

/**
 * The seawall walk along False Creek, 2.6 units in from the drawn shore, wherever that is dry land clear of the
 * landmarks (Science World's own deck carries it round the point). Paved like the park paths.
 */
export const SEAWALL: ParkPath[] = (() => {
  const runs: ParkPath[] = [];
  let run: XZ[] = [];
  const flush = () => {
    if (run.length > 3) runs.push({ pts: run, w: 2.2 });
    run = [];
  };
  for (const shore of SHORES) {
    const n = shore.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = shore[i];
      const [bx, bz] = shore[(i + 1) % n];
      const L = Math.hypot(bx - ax, bz - az);
      let nx = (bz - az) / L;
      let nz = -(bx - ax) / L;
      // the normal that points to land
      if (polySdf(shore, (ax + bx) / 2 + nx, (az + bz) / 2 + nz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      for (let t = 0; t < L; t += 2) {
        const x = ax + ((bx - ax) * t) / L + nx * 2.6;
        const z = az + ((bz - az) * t) / L + nz * 2.6;
        const prev = run[run.length - 1];
        const ok = sdfAt(x, z) > 1.2 && !LANDMARKS.some((l) => (x - l.px) ** 2 + (z - l.pz) ** 2 < (l.r + 3) ** 2);
        if (!ok || (prev && Math.hypot(prev[0] - x, prev[1] - z) > 5)) flush();
        if (ok) run.push([x, z]);
      }
    }
    flush();
  }
  return runs;
})();
// the seawall's segments in 8-unit cells, for the lot and tree tests
const WALL_CELL = 8;
const wallGrid = new Map<number, [number, number, number, number][]>();
for (const { pts } of SEAWALL) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    for (let gx = Math.floor((Math.min(ax, bx) - 3) / WALL_CELL); gx <= Math.floor((Math.max(ax, bx) + 3) / WALL_CELL); gx++) {
      for (let gz = Math.floor((Math.min(az, bz) - 3) / WALL_CELL); gz <= Math.floor((Math.max(az, bz) + 3) / WALL_CELL); gz++) {
        const k = gx * 4096 + gz;
        const cell = wallGrid.get(k);
        if (cell) cell.push([ax, az, bx, bz]);
        else wallGrid.set(k, [[ax, az, bx, bz]]);
      }
    }
  }
}
/** Distance to the seawall walk's edge (negative on it); more than a few units off is simply 99. */
export function seawallDist(x: number, z: number): number {
  const cell = wallGrid.get(Math.floor(x / WALL_CELL) * 4096 + Math.floor(z / WALL_CELL));
  if (!cell) return 99;
  let d2 = Infinity;
  for (const [ax, az, bx, bz] of cell) {
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    d2 = Math.min(d2, (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2);
  }
  return Math.sqrt(d2) - 1.1;
}
const PATH_BOXES = PARKS.flatMap((p) => p.paths ?? []).map((path) => ({
  path,
  box: [Math.min(...path.pts.map((q) => q[0])) - 4, Math.max(...path.pts.map((q) => q[0])) + 4, Math.min(...path.pts.map((q) => q[1])) - 4, Math.max(...path.pts.map((q) => q[1])) + 4],
}));

/**
 * The bridges over False Creek, centrelines end to end, their decks' half width and clearance over the water: Cambie,
 * a low concrete girder on twin columns, on its street west of BC Place; Granville, high on a steel deck truss over
 * Granville Island; Burrard, across the mouth, a steel through truss between concrete towers. Each end is where a
 * street the water cut short ends (the map's ends of them, roadNetwork.ts), and the bridge carries it on: Cambie from
 * Pacific Boulevard to 6th Avenue, Granville from Harwood Street to 6th Avenue by Granville Street, Burrard from Bute
 * Street to Cornwall Avenue. The street network takes the cars over them; lots and trees keep clear of them.
 */
export type Bridge = { name: string; a: XZ; b: XZ; half: number; clear: number; kind: "girder" | "deckTruss" | "throughTruss" };
export const BRIDGES: Bridge[] = [
  { name: "Cambie Bridge", a: [-73.7, 148.2], b: [-82.4, 247.7], half: 3.3, clear: 7, kind: "girder" },
  { name: "Granville Bridge", a: [-168.7, 88.1], b: [-190.7, 244.9], half: 4.2, clear: 12, kind: "deckTruss" },
  { name: "Burrard Bridge", a: [-199.2, 84.0], b: [-271.9, 168.0], half: 3.6, clear: 9, kind: "throughTruss" },
];
/**
 * A bridge's deck, sampled about every 2 units along its centreline (t from a): the unit way along it (ux, uz) and
 * to its right (rx, rz), whether each sample is over the water, the ground under it (its highest across the deck) and
 * the road's height. The deck rises from the street at each end to its clearance over the water (no steeper than a road
 * should be; Granville's a little gentler). The bridge (landmarkKit.ts) and the cars on it (roadNetwork.ts) both stand on it.
 */
export type BridgeDeck = { L: number; ux: number; uz: number; rx: number; rz: number; T: number[]; wet: boolean[]; ground: number[]; deck: number[]; at: (t: number, lat: number) => XZ };
export function bridgeDeck(br: Bridge): BridgeDeck {
  const [ax, az] = br.a;
  const [bx, bz] = br.b;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  // across the deck, to the right of a → b
  const rx = -uz;
  const rz = ux;
  const h = br.half;
  const n = Math.ceil(L / 2) + 1;
  const T = Array.from({ length: n }, (_, i) => (i * L) / (n - 1));
  const at = (t: number, lat: number): XZ => [ax + ux * t + rx * lat, az + uz * t + rz * lat];
  const wet = T.map((t) => sdfAt(...at(t, 0)) < 0);
  const i0 = wet.indexOf(true);
  const i1 = wet.lastIndexOf(true);
  const ground = T.map((t) => Math.max(...[-h, 0, h].map((l) => groundAt(...at(t, l)))));
  const raw = T.map((_, i) => (wet[i] ? SEA + br.clear * (0.88 + 0.12 * Math.sin((Math.PI * (i - i0)) / Math.max(1, i1 - i0))) : ground[i] + 0.05));
  // no steeper than the grade from any high point
  const grade = br.kind === "deckTruss" ? 0.11 : 0.13;
  const deck = T.map((t) => Math.max(...raw.map((r, j) => r - grade * Math.abs(t - T[j]))));
  return { L, ux, uz, rx, rz, T, wet, ground, deck, at };
}
const decks = new Map<Bridge, BridgeDeck>();
/** A bridge's deck, worked out once (after the ground is in: it reads the ground). */
export const deckOf = (br: Bridge): BridgeDeck => {
  let d = decks.get(br);
  if (!d) {
    d = bridgeDeck(br);
    decks.set(br, d);
  }
  return d;
};

/** How far apart a bridge's piers stand along its deck (landmarkKit.ts stands a pair every half that many samples). */
export const PIER_EVERY: Record<Bridge["kind"], number> = { deckTruss: 14, throughTruss: 11, girder: 9 };
/** A through truss's towers stand this share of its water span in from either end. */
export const TRUSS_TOWERS = 0.28;

/**
 * What of the bridges stands in the water, for the boats to keep clear of (harbourTraffic.ts): every pier pair's
 * columns where the deck is over the creek, and the through truss's towers, as discs a little wider than they are.
 */
export function wetPiers(): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const br of BRIDGES) {
    const { T, wet, at } = deckOf(br);
    const every = Math.round(PIER_EVERY[br.kind] / 2);
    for (let i = 0; i < T.length; i += every) {
      if (!wet[i]) continue;
      for (const s of [-1, 1]) {
        const [x, z] = at(T[i], s * (br.half - 0.9));
        out.push({ x, z, r: 1.1 });
      }
    }
    const i0 = wet.indexOf(true);
    const i1 = wet.lastIndexOf(true);
    if (br.kind !== "throughTruss" || i0 < 0) continue;
    for (const i of [i0 + Math.round((i1 - i0) * TRUSS_TOWERS), i1 - Math.round((i1 - i0) * TRUSS_TOWERS)]) {
      for (const s of [-1, 1]) {
        const [x, z] = at(T[i], s * (br.half + 1.5));
        out.push({ x, z, r: 1.8 });
      }
    }
  }
  return out;
}

/** Under a deck too low for a street to pass beneath: a street there would run into its side. */
const UNDER = 4.5;
/**
 * Where a street would run into a bridge deck: within `pad` of the deck (and its parapets), where the deck stands less
 * than UNDER over the ground, away from its ends (where the streets it carries on meet it).
 */
export function underLowDeck(x: number, z: number, pad: number): boolean {
  for (const br of BRIDGES) {
    const [ax, az] = br.a;
    const [bx, bz] = br.b;
    if (x < Math.min(ax, bx) - 20 || x > Math.max(ax, bx) + 20 || z < Math.min(az, bz) - 20 || z > Math.max(az, bz) + 20) continue;
    const d = deckOf(br);
    const t = (x - ax) * d.ux + (z - az) * d.uz;
    if (t < 6 || t > d.L - 6 || Math.abs((x - ax) * d.rx + (z - az) * d.rz) > br.half + 0.3 + pad) continue;
    const i = Math.round((t / d.L) * (d.T.length - 1));
    if (d.deck[i] - d.ground[i] < UNDER) return true;
  }
  return false;
}

/** The decks in plan, end to end with their half widths: the three over False Creek and the Lions Gate's. */
let plans: { a: XZ; b: XZ; half: number }[] | null = null;
/** Within `pad` of a bridge deck's edge (in plan), its ends too, where it meets its streets. */
export function nearBridge(x: number, z: number, pad: number): boolean {
  if (!plans) {
    const lg = lionsGateDeck();
    plans = [...BRIDGES, { a: [lg.X, lg.zEndS] as XZ, b: [lg.X, lg.zEndN] as XZ, half: 3.8 }];
  }
  for (const { a, b, half } of plans) {
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const t = Math.min(1, Math.max(0, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez)));
    if (Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t) < half + pad) return true;
  }
  return false;
}

/** Science World's base roof height, and the trees in the garden on its water side (world positions). */
export const SW_ROOF = 7.4;
/** Science World's promenade deck over the water (its radius, in its own frame) and its little pier: its angle and how far out. */
export const SW_DECK = { r: 18.5, pierA: 2.45, pierAt: 20.4 };
export function scienceWorldTrees(): { x: number; y: number; z: number; sp: "cherry" | "smaple" | "dogwood"; s: number }[] {
  const sw = LANDMARKS.find((l) => l.key === "scienceWorld");
  if (!sw) return [];
  const yaw = sw.yaw ?? 0;
  // local angle and radius on the roof (clear of the two tents), turned with the building
  return ([
    [2.4, 11.4, "cherry"],
    [2.78, 11.6, "smaple"],
    [4.32, 11.3, "dogwood"],
  ] as const).map(([a, r, sp]) => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return { x: sw.px + x * Math.cos(yaw) + z * Math.sin(yaw), y: sw.padY + SW_ROOF, z: sw.pz - x * Math.sin(yaw) + z * Math.cos(yaw), sp, s: 0.7 };
  });
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
  // it comes in under the guideway past the station and through Creekside Park into the inlet below Rogers Arena
  const pts: [number, number][] = [[248, 253], [226, 232], [204, 212], [178, 195], [150, 184], [124, 177], [100, 174], [86, 169], [74, 166.5], [64, 167], [57, 170]];
  const [ux, uz] = [pts[pts.length - 1][0] - pts[pts.length - 2][0], pts[pts.length - 1][1] - pts[pts.length - 2][1]];
  const ul = Math.hypot(ux, uz);
  for (let k = 0; k < 30 && !inWater(...pts[pts.length - 1]); k++) {
    const [x, z] = pts[pts.length - 1];
    pts.push([x + (ux / ul) * 4, z + (uz / ul) * 4]);
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
  const poly = p.poly;
  if (poly) {
    if (p.level === false) continue;
    const y = poly.reduce((s, q) => s + demAt(q[0], q[1]), 0) / poly.length;
    addModifier((x, z, h) => {
      if ((x - p.x) ** 2 + (z - p.z) ** 2 > (p.r + 6) ** 2 || inWater(x, z)) return h;
      const d = polySdf(poly, x, z);
      return d >= 5 ? h : lerp(h, y, 0.45 * (1 - Math.min(1, Math.max(0, d / 5))));
    });
    continue;
  }
  const y = demAt(p.x, p.z);
  addModifier((x, z, h) => {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    return d >= 1.2 || inWater(x, z) ? h : lerp(h, y, 0.45 * (1 - Math.min(1, Math.max(0, (d - 0.6) / 0.6))));
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
// the dock (harbourfront.ts): last, after the station pads that filled it, the seabed again (on what was dry land, a
// little under the sea), falling to it from the city's ground over the rim's band inside its landward edge; the city's
// lots and trees are laid out without it (they keep out of the dock)
addUnbakedModifier(
  (x, z, h) => {
    if (!inDock(x, z)) return h;
    const k = Math.min(1, -polySdf(DOCK, x, z) / RIM);
    const bed = Math.min(h, sdfAt(x, z) < 0 ? demAt(x, z) : SEA - 1.2);
    return lerp(h, bed, k * k * (3 - 2 * k));
  },
  [-119, 15, -74, -24.3],
);
