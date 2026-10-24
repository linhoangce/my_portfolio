/**
 * The harbourfront west of Canada Place, laid out as the city's front porch it is:
 * - the Convention Centre West, long and low along the shore under its living roof;
 * - Jack Poole Plaza between its east end and the Canada Place pier (the Olympic Cauldron and the Digital Orca stand
 *   in it);
 * - Harbour Green Park, the lawns behind the seawall round the bay west of it, with its cafés, and the floatplane dock
 *   out in the bay;
 * - the seawall promenade along the water from Coal Harbour to the pier, with lamps, railings, benches and trees,
 *   people strolling it.
 *
 * Pure layout. The Convention Centre's landmark (sites.ts), Harbourfront.tsx, the ground's walks, the parks, the
 * roads, lots, trees and walkers all read it.
 */
import { SEA } from "./constants";
import { polySdf, sdfAt } from "./terrain";
import type { SpeciesId } from "./trees/species";

type XZ = [number, number];

/**
 * The Convention Centre West: centre, length along the shore, depth, its turn (as Object3D.rotation.y), height. It stands
 * on the shoreline, its seaward third out over the water on piles.
 */
export const CONVENTION = { x: -92, z: -50, w: 44, d: 13, yaw: -0.173, h: 7.5 };
/** The deck over the water that carries the promenade along its seaward side: its height. */
export const DECK_Y = SEA + 1.7;

/** World point of the building's local (x along it, z across it, -z to the water). */
const fromConvention = (lx: number, lz: number): XZ => {
  const c = Math.cos(CONVENTION.yaw);
  const s = Math.sin(CONVENTION.yaw);
  return [CONVENTION.x + lx * c + lz * s, CONVENTION.z - lx * s + lz * c];
};
/** The z of the building's seaward face at x, or null beyond its ends. */
const seawardZ = (x: number): number | null => {
  const [ax, az] = fromConvention(-CONVENTION.w / 2, -CONVENTION.d / 2);
  const [bx, bz] = fromConvention(CONVENTION.w / 2, -CONVENTION.d / 2);
  if (x < Math.min(ax, bx) - 2 || x > Math.max(ax, bx) + 2) return null;
  return az + ((bz - az) * (x - ax)) / (bx - ax);
};

/** Where the land meets the water going north from the city at x (the islands in the inlet beyond are not the shore). */
const shoreAt = (x: number): number => {
  let z = -24;
  while (z > -110 && sdfAt(x, z - 0.5) >= 0) z -= 0.5;
  return z;
};

/**
 * Round Harbour Green, the seawall's line 2.8 in from the shore: west along the peninsula's north shore, south down its
 * east shore past the floatplane dock, and round the bay's head to the Convention Centre (the shore here turns back on
 * itself, so it is drawn rather than found).
 */
const GREEN_LINE: XZ[] = [
  [-158, -87],
  [-152, -82],
  [-145, -81.3],
  [-138, -81.6],
  [-132.5, -80.8],
  [-130.4, -78],
  [-130, -71],
  [-129.4, -66.4],
  [-127.4, -62.6],
  [-125.6, -60.2],
];

/** The seawall promenade: 2.8 in from the shore, from Coal Harbour to the foot of the Canada Place pier, smoothed. */
export const PROMENADE: XZ[] = (() => {
  // round Harbour Green, a point every 2 or so along each of its lines
  const west: XZ[] = [];
  for (let i = 1; i < GREEN_LINE.length; i++) {
    const [ax, az] = GREEN_LINE[i - 1];
    const [bx, bz] = GREEN_LINE[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2));
    for (let k = 0; k < n; k++) west.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const raw: XZ[] = [];
  // along the shore, and past the Convention Centre on its deck over the water, just off its seaward face
  for (let x = -124; x <= -50; x += 2) {
    const face = seawardZ(x);
    raw.push([x, face === null ? shoreAt(x) + 2.8 : Math.min(shoreAt(x) + 2.8, face - 2.6)]);
  }
  const east = raw.map(([x], i): XZ => {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(raw.length - 1, i + 2); j++) {
      s += raw[j][1];
      k++;
    }
    return [x, s / k];
  });
  return [...west, ...east];
})();
export const PROMENADE_W = 3.2;

/** The promenade's z at x (by its points; round Harbour Green it turns back, so this holds east of there). */
const promZ = (x: number): number => {
  for (let i = 1; i < PROMENADE.length; i++) {
    const [ax, az] = PROMENADE[i - 1];
    const [bx, bz] = PROMENADE[i];
    if (x <= bx) return az + ((bz - az) * (x - ax)) / Math.max(1e-6, bx - ax);
  }
  return PROMENADE[PROMENADE.length - 1][1];
};

/**
 * Jack Poole Plaza: from the Convention Centre's east end to the pier's west side, the promenade along its water edge,
 * kept 10 clear of the guideway to the south.
 */
export const PLAZA_X: [number, number] = [-67, -50];
export const PLAZA_SOUTH = -32;
export const PLAZA: XZ[] = (() => {
  const north: XZ[] = [];
  for (let x = PLAZA_X[0]; x <= PLAZA_X[1] + 1e-6; x += 1) north.push([x, promZ(x) - PROMENADE_W / 2]);
  return [[PLAZA_X[0], PLAZA_SOUTH], ...north, [PLAZA_X[1], PLAZA_SOUTH]];
})();

/**
 * Harbour Green Park: the lawns from the seawall's inland edge to the towers, round the bay west of the Convention
 * Centre and along the peninsula's north shore.
 */
export const HARBOUR_GREEN: XZ[] = (() => {
  const sea = PROMENADE.filter(([x]) => x < -116.5).map(([x, z], i, pts): XZ => {
    // the inland normal: away from the water
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [qx, qz] = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(qx - px, qz - pz) || 1;
    let nx = -(qz - pz) / L;
    let nz = (qx - px) / L;
    if (sdfAt(x + nx * 3, z + nz * 3) < sdfAt(x - nx * 3, z - nz * 3)) {
      nx = -nx;
      nz = -nz;
    }
    return [x + nx * (PROMENADE_W / 2 + 0.3), z + nz * (PROMENADE_W / 2 + 0.3)];
  });
  // the towers' side, short of West Georgia and Nicola Streets
  const land: XZ[] = [
    [-116, -50.5],
    [-124, -52.5],
    [-138, -60],
    [-141, -67.5],
    [-152, -68.5],
    [-160, -75],
  ];
  return [...sea, ...land];
})();
export const inHarbourGreen = (x: number, z: number, pad = 0): boolean => x > -165 && x < -112 && z > -92 && z < -46 && polySdf(HARBOUR_GREEN, x, z) < pad;

/**
 * The floatplane dock in the bay off Harbour Green (the real Harbour Flight Centre stands here): a gangway out from the
 * seawall to a long float, fingers out from it with a floatplane at each, and the little terminal at its north end.
 */
export const FLOAT_DOCK = {
  gangway: [-128.6, -121.3] as [number, number],
  gangwayZ: -71.5,
  floatX: -120.2,
  float: [-82, -63.5] as [number, number],
  fingers: [-78.5, -72.5, -66.5],
  fingerTo: -112.5,
  /** Each plane: where it lies and its heading (as rotation.y, nose along +z). */
  planes: [
    [-116, -81.4, -Math.PI / 2],
    [-116, -75.4, -Math.PI / 2],
    [-116, -69.4, -Math.PI / 2],
  ] as [number, number, number][],
  terminal: { x: -122.6, z: -79.6 },
};

/** Cafés in Harbour Green Park, on decks toward the water: glass box centre, width, depth, the way it faces (x, z). */
export const GREEN_CAFES: { x: number; z: number; w: number; d: number; face: [number, number]; umbrella: number; roof: "dark" | "green" | "timber" }[] = [
  { x: -146, z: -73.6, w: 8, d: 5, face: [0, -1], umbrella: 0xe8663a, roof: "dark" },
  { x: -138.6, z: -70, w: 7, d: 5, face: [1, 0], umbrella: 0xf2b632, roof: "green" },
];

/**
 * The forecourt at the foot of the Canada Place pier, between the Harbour Market and the Waterfront set: the pier's
 * deck, paved like Jack Poole Plaza (only where the pier stands, the market and the set pave their own), a row of
 * trees in planters and benches under them.
 */
export const FORECOURT = { x0: -28.4, x1: -4, z0: -53, z1: -30 };
export const FORECOURT_TREES: [number, number][] = [
  [-26.5, -44],
  [-26.5, -36.5],
];

/** On one of Harbour Green's cafés or its deck, with a pad. */
export function onGreenCafe(x: number, z: number, pad = 0): boolean {
  return GREEN_CAFES.some((c) => {
    // along the way it faces, and across it; the deck reaches 0.8 behind and 3.4 before the glass
    const along = (x - c.x) * c.face[0] + (z - c.z) * c.face[1];
    const across = -(x - c.x) * c.face[1] + (z - c.z) * c.face[0];
    return Math.abs(across) < c.w / 2 + 0.8 + pad && along > -c.d / 2 - 0.8 - pad && along < c.d / 2 + 3.4 + pad;
  });
}

/** In the Convention Centre's footprint (local axes), with a pad. */
export function inConvention(x: number, z: number, pad = 0): boolean {
  const dx = x - CONVENTION.x;
  const dz = z - CONVENTION.z;
  const c = Math.cos(CONVENTION.yaw);
  const s = Math.sin(CONVENTION.yaw);
  // world to local for rotation.y = yaw
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < CONVENTION.w / 2 + pad && Math.abs(lz) < CONVENTION.d / 2 + pad;
}

/** Distance from the promenade's centreline. */
export function promenadeDist(x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < PROMENADE.length; i++) {
    const [ax, az] = PROMENADE[i - 1];
    const [bx, bz] = PROMENADE[i];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best;
}

/** On the harbourfront: the building, the plaza or the promenade (with a pad). Nothing else stands or runs here. */
export function inHarbourfront(x: number, z: number, pad = 0): boolean {
  if (x < -165 || x > -44 || z < -92 || z > -22) return false;
  return inConvention(x, z, pad) || polySdf(PLAZA, x, z) < pad || promenadeDist(x, z) < PROMENADE_W / 2 + pad;
}

/** Benches along the promenade's inland edge and round the plaza: position and facing (radians, as rotation.y). */
export function harbourfrontBenches(): { x: number; z: number; ry: number }[] {
  const out: { x: number; z: number; ry: number }[] = [];
  for (let i = 3; i < PROMENADE.length - 1; i += 4) {
    const [ax, az] = PROMENADE[i - 1];
    const [bx, bz] = PROMENADE[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    // the inland side is south of the water: the normal (-t.z, t.x) of an eastward tangent points there
    const nx = -(bz - az) / L;
    const nz = (bx - ax) / L;
    const [x, z] = PROMENADE[i];
    const off = PROMENADE_W / 2 + 0.6;
    if (inConvention(x + nx * off, z + nz * off, 0.8)) continue;
    // a bench's front is its local +z: turned to face the water (-n)
    out.push({ x: x + nx * off, z: z + nz * off, ry: Math.atan2(-nx, -nz) });
  }
  return out;
}

/**
 * Trees: a row in planters along the plaza's south and west edges and a few in its middle (Harbour Green's are its
 * park's). Foot height is the caller's (ground).
 */
export function harbourfrontTrees(): { x: number; z: number; sp: SpeciesId; s: number }[] {
  const out: { x: number; z: number; sp: SpeciesId; s: number }[] = [];
  const SP: SpeciesId[] = ["smaple", "cherry", "hornbeam", "magnolia"];
  let k = 0;
  for (let x = PLAZA_X[0] + 2; x <= PLAZA_X[1] - 1.5; x += 3.4) out.push({ x, z: PLAZA_SOUTH - 1.4, sp: SP[k++ % SP.length], s: 0.62 + (k % 3) * 0.06 });
  for (let z = PLAZA_SOUTH - 4.6; z > promZ(PLAZA_X[0]) + 3; z -= 3.6) out.push({ x: PLAZA_X[0] + 1.4, z, sp: "cherry", s: 0.6 });
  for (const [x, z] of FORECOURT_TREES) out.push({ x, z, sp: SP[k++ % SP.length], s: 0.66 });
  return out;
}

/** People on the promenade: each paces a straight stretch of it (start, direction, length). */
export function promenadeStretches(): { ox: number; oz: number; ux: number; uz: number; L: number }[] {
  const out: { ox: number; oz: number; ux: number; uz: number; L: number }[] = [];
  for (let i = 0; i + 3 < PROMENADE.length; i += 3) {
    const [ax, az] = PROMENADE[i];
    const [bx, bz] = PROMENADE[i + 3];
    const L = Math.hypot(bx - ax, bz - az);
    out.push({ ox: ax, oz: az, ux: (bx - ax) / L, uz: (bz - az) / L, L });
  }
  return out;
}
