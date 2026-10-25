/**
 * The harbour's boats, run the way a harbour runs them. Every boat lies at a berth (a slip in a marina, a ferry's
 * float, the canoe club's) and, when it sails, backs out of it astern and swings round, takes a way over the water
 * planned round everything standing in it (harbourNav.ts), and comes in bow first to a free berth elsewhere, slowing
 * to a stop with its bow at the float. Before it casts off it books the berth and its passage: the whole passage,
 * moment by moment, is checked against every other boat's (and against the SeaBus's timetable, seabusLine.ts), and it
 * waits at its berth, or goes slower, until the way is clear, so no two hulls ever meet.
 *
 * Two waters, each with its own grid: Burrard Inlet, where sailboats and motor yachts sail between marinas on both
 * shores built to their size, and False Creek, where the little ferries call at their floats in turn, the marinas'
 * boats come and go and two journey canoes paddle between the canoe club and Granville Island. The boats moored for
 * good and those at anchor are here too, as what the others keep clear of. Pure: Life.tsx paints the docks from
 * `boxes` and draws each boat where `pose` says it is.
 */
import { Rng } from "./cityModel";
import { SEA } from "./constants";
import { inSolid, keepRight, rounded, type Solid, speeds, times, WaterGrid, type Way, type XZ } from "./harbourNav";
import { inletSolids } from "./inletWalk";
import { YARD_BOX } from "./railYard";
import { SEABUS_A, SEABUS_B, SEABUS_BEAM, SEABUS_LEN, SEABUS_STOP_A, SEABUS_STOP_B, SEABUS_YAW, seabusAt, type SeaBusPose } from "./seabusLine";
import { LANDMARKS, SW_DECK, wetPiers } from "./sites";
import { sdfAt } from "./terrain";
import { NO_SAIL } from "./waterfrontHub";

/* ------------------------------------------------------------------ hulls and how they handle */

/**
 * A hull: which of Life.tsx's meshes draws it (0 the SeaBus's, a little False Creek ferry when scaled down; 1
 * sailboat; 2 motor yacht; 3 journey canoe), at what scale, and at that scale how far it reaches ahead of its origin
 * (`front`, to the stem) and behind (`back`), and its beam.
 */
export type Hull = { kind: number; s: number; front: number; back: number; beam: number };
/** As built (vessels.ts, vehicles.ts): stem, stern and beam of each kind at scale 1. */
const HULLS: [number, number, number][] = [
  [9.3, 9.3, 5.8],
  [3.5, 3.4, 2.5],
  [5.5, 5, 3.8],
  [3.6, 3.4, 1.6],
];
const hull = (kind: number, s: number): Hull => ({ kind, s, front: HULLS[kind][0] * s, back: HULLS[kind][1] * s, beam: HULLS[kind][2] * s });

/**
 * How a boat handles: its cruising speed, how fast it gathers and loses way, how hard it leans into a bend, and its
 * speed in to a berth and going astern.
 */
type Handling = { v: number; acc: number; dec: number; lat: number; app: number; astern: number };

/** Where a boat is and which way its bow points (as rotation.y, the bow along +z), and how fast it is going. */
export type BoatPose = { x: number; z: number; yaw: number; v: number };

/* ------------------------------------------------------------------ the docks */

/** A box Life.tsx paints for the docks: centre, size (w across, h high, l along its yaw), yaw and colour. */
export type DockBox = { x: number; y: number; z: number; w: number; h: number; l: number; yaw: number; hex: number };

/** Who may berth: the inlet's boats, the creek's marina boats, its ferries, its canoes. */
type Use = "inlet" | "creek" | "ferry" | "canoe";

/**
 * A berth: the point on the float's edge (or the canoe club's) its bow comes in to and the way out from there to open
 * water, how far its slip's fingers reach out past that point (0 off a plain float), and who lies there or has booked
 * it (-1 nobody).
 */
type Slot = { dock: number; ex: number; ez: number; nx: number; nz: number; depth: number; owner: number };
type Dock = { name: string; water: number; use: Use; slots: number[] };

/** Between the stem and the float when a boat lies at its berth. */
const GAP = 0.25;
const FLOAT = 0xd6d2c9;
const GANGWAY = 0x9aa3ad;

/** Where a hull lies at a berth: bow in to the float, `GAP` off it. */
function berthPose(sl: Slot, h: Hull, out: BoatPose): BoatPose {
  const d = GAP + h.front;
  out.x = sl.ex + sl.nx * d;
  out.z = sl.ez + sl.nz * d;
  out.yaw = Math.atan2(-sl.nx, -sl.nz);
  out.v = 0;
  return out;
}

class Layout {
  readonly boxes: DockBox[] = [];
  readonly docks: Dock[] = [];
  readonly slots: Slot[] = [];
  /** Per water (0 the inlet, 1 the creek): the water its ways keep off besides the shore (the docks' water among it). */
  readonly solids: Solid[][] = [[], []];
  /** And what really stands in it, which a hull keeps off all the way. */
  readonly hard: Solid[][] = [[], []];

  box(w: number, h: number, l: number, x: number, y: number, z: number, yaw: number, hex: number): void {
    this.boxes.push({ x, y, z, w, h, l, yaw, hex });
  }

  /** A straight run from a to b, `w` wide, its top `top` above the sea. */
  run(ax: number, az: number, bx: number, bz: number, w: number, top: number, hex: number): void {
    this.box(w, 0.4, Math.hypot(bx - ax, bz - az), (ax + bx) / 2, SEA + top - 0.2, (az + bz) / 2, Math.atan2(bx - ax, bz - az), hex);
  }

  dock(name: string, water: number, use: Use): number {
    this.docks.push({ name, water, use, slots: [] });
    return this.docks.length - 1;
  }

  slot(dock: number, ex: number, ez: number, nx: number, nz: number, depth: number): void {
    this.docks[dock].slots.push(this.slots.length);
    this.slots.push({ dock, ex, ez, nx, nz, depth, owner: -1 });
  }

  /** Keep the boats' ways off a stretch along s from (x, z), reaching `out0` to `out1` along n. */
  keepOff(water: number, x: number, z: number, sx: number, sz: number, L: number, nx: number, nz: number, out0: number, out1: number): void {
    const mid = (out0 + out1) / 2;
    this.solids[water].push({ x: x + sx * (L / 2) + nx * mid, z: z + sz * (L / 2) + nz * mid, hl: L / 2 + 1, hw: (out1 - out0) / 2, yaw: Math.atan2(sx, sz) });
  }
}

const wet = (x: number, z: number) => sdfAt(x, z) < -0.6;

/** The unit way out from the shore at a and b (along a to b) toward the water. */
function seaward(ax: number, az: number, bx: number, bz: number): [number, number, number, number, number] {
  const L = Math.hypot(bx - ax, bz - az);
  const sx = (bx - ax) / L;
  const sz = (bz - az) / L;
  let nx = -sz;
  let nz = sx;
  if (sdfAt((ax + bx) / 2 + nx * 5, (az + bz) / 2 + nz * 5) > sdfAt((ax + bx) / 2 - nx * 5, (az + bz) / 2 - nz * 5)) {
    nx = -nx;
    nz = -nz;
  }
  return [L, sx, sz, nx, nz];
}

/**
 * A marina along the shore from a to b, `k` times the size of False Creek's: its float `4.5k` out, fingers every
 * `5.2k` reaching `5k` out from it toward the water, a gangway from the seawall, and a berth in each slip between two
 * fingers. Nothing is built on land.
 */
function marina(L0: Layout, name: string, water: number, use: Use, ax: number, az: number, bx: number, bz: number, k: number): number {
  const [L, sx, sz, nx, nz] = seaward(ax, az, bx, bz);
  const ox = ax + nx * 4.5 * k;
  const oz = az + nz * 4.5 * k;
  if (!wet(ox, oz) || !wet(ox + sx * L, oz + sz * L)) return -1;
  const d = L0.dock(name, water, use);
  const half = 0.6 * k;
  L0.run(ox, oz, ox + sx * L, oz + sz * L, 2 * half, 0.35, FLOAT);
  const fingers: number[] = [];
  for (let t = k; t < L; t += 5.2 * k) {
    if (!wet(ox + sx * t + nx * 5 * k, oz + sz * t + nz * 5 * k)) continue;
    L0.run(ox + sx * t, oz + sz * t, ox + sx * t + nx * 5 * k, oz + sz * t + nz * 5 * k, 0.7 * k, 0.32, FLOAT);
    fingers.push(t);
  }
  L0.run(ox + sx * L * 0.45 - nx * 4.4 * k, oz + sz * L * 0.45 - nz * 4.4 * k, ox + sx * L * 0.45, oz + sz * L * 0.45, k, 0.9, GANGWAY);
  // a berth wherever a finger stands either side
  for (const t of fingers) {
    const m = t + 2.6 * k;
    if (!fingers.some((f) => Math.abs(f - (t + 5.2 * k)) < 0.01)) continue;
    const ex = ox + sx * m + nx * half;
    const ez = oz + sz * m + nz * half;
    if (wet(ex + nx * 3 * k, ez + nz * 3 * k)) L0.slot(d, ex, ez, nx, nz, 5 * k - half);
  }
  // the water from the shore to just past the fingers' ends (a boat backing out is clear of it once its stem is)
  L0.keepOff(water, ox, oz, sx, sz, L, nx, nz, -4.5 * k, 5 * k + 1.6);
  return d;
}

/**
 * A landing float off the shore, centred off p along the shore's line toward q: 12 long, parallel to the shore `out`
 * from it, a gangway in, and two berths side by side on its open face, far enough apart for a boat to come in beside
 * the other; a ferry's float has a shelter under the ferries' blue roof at one end.
 */
function landing(L0: Layout, name: string, use: Use, px: number, pz: number, qx: number, qz: number, out = 3.2): number {
  const [, sx, sz, nx, nz] = seaward(px, pz, qx, qz);
  const L = 12;
  const ox = px + nx * out - sx * (L / 2);
  const oz = pz + nz * out - sz * (L / 2);
  const d = L0.dock(name, 1, use);
  L0.run(ox, oz, ox + sx * L, oz + sz * L, 1.6, 0.4, FLOAT);
  L0.run(ox + sx * L * 0.5 - nx * (out + 1), oz + sz * L * 0.5 - nz * (out + 1), ox + sx * L * 0.5, oz + sz * L * 0.5, 1, 0.9, GANGWAY);
  if (use === "ferry") {
    const yaw = Math.atan2(sx, sz);
    const cx = ox + sx * (L - 1.2);
    const cz = oz + sz * (L - 1.2);
    L0.box(0.9, 1.6, 1.8, cx, SEA + 0.4 + 0.8, cz, yaw, 0xeef0f2);
    L0.box(1.3, 0.14, 2.2, cx, SEA + 0.4 + 1.65, cz, yaw, 0x2d6cb0);
  }
  for (const t of [2.6, 7.2]) L0.slot(d, ox + sx * t + nx * 0.8, oz + sz * t + nz * 0.8, nx, nz, 0);
  L0.keepOff(1, ox, oz, sx, sz, L, nx, nz, -out, 1.4);
  return d;
}

/* ------------------------------------------------------------------ the boats */

type Plan = { t0: number; t1: number; to: number; end: BoatPose; tr: Track };

/**
 * A boat: its hull, how it handles (null for one moored for good or at anchor), the water it is on and the berths it
 * uses, where it lies (its berth, -1 at anchor, and its pose there), its passage booked and when it next sails; how
 * long it lies at a berth; a ferry's calls in order, the one it made last and which way it is working along them.
 */
type Boat = {
  hull: Hull;
  hd: Handling | null;
  water: number;
  use: Use;
  slot: number;
  rest: BoatPose;
  plan: Plan | null;
  next: number;
  dwell: [number, number];
  calls?: number[];
  call?: number;
  dir?: 1 | -1;
  bob: number;
};

/** A passage sampled every DT seconds: pose and speed, and a circle round each CHUNK of samples (for a quick miss). */
type Track = { n: number; x: Float32Array; z: Float32Array; yaw: Float32Array; v: Float32Array; cx: Float32Array; cz: Float32Array; cr: Float32Array; dur: number };
const DT = 0.25;
const CHUNK = 16;
/**
 * A boat's way astern and ahead from berth to berth, before it is timed, where the approach speed holds from, and
 * whether it keeps clear of the boats moored for good and at anchor (once found).
 */
type Passage = { astern: Way; ahead: Way; appFrom: number; fixed?: boolean };
/** The speeds a passage may be booked at, as shares of the cruising speed, fastest first. */
const PACES = [1, 0.8, 0.62];
/** Seconds a boat lies stopped between going astern and going ahead. */
const PAUSE = 1;
/** How long a boat may wait at its berth for its way to clear before it tries another berth (or later). */
const WAIT = 60;

/** The clear water two hulls keep between them, wider the faster they go. */
const room = (v1: number, v2: number) => 1.2 + 0.35 * (v1 + v2);

/** The shortest way between two angles, from a to b. */
const turnTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** The distance between segments p1p2 and q1q2 (in plan). */
function segDist(p1x: number, p1z: number, p2x: number, p2z: number, q1x: number, q1z: number, q2x: number, q2z: number): number {
  const ux = p2x - p1x;
  const uz = p2z - p1z;
  const vx = q2x - q1x;
  const vz = q2z - q1z;
  const wx = p1x - q1x;
  const wz = p1z - q1z;
  const a = ux * ux + uz * uz;
  const b = ux * vx + uz * vz;
  const c = vx * vx + vz * vz;
  const d = ux * wx + uz * wz;
  const e = vx * wx + vz * wz;
  const D = a * c - b * b;
  let sN: number;
  let sD = D;
  let tN: number;
  let tD = D;
  if (D < 1e-9) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0;
    else if (-d + b > a) sN = sD;
    else {
      sN = -d + b;
      sD = a;
    }
  }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  return Math.hypot(wx + sc * ux - tc * vx, wz + sc * uz - tc * vz);
}

/**
 * The clear water between two hulls, each taken as a capsule its beam wide down its centreline from stem to stern (so
 * round the corners of the bluntest, the ferries' square ends); negative where they overlap.
 */
function between(h1: Hull, x1: number, z1: number, y1: number, h2: Hull, x2: number, z2: number, y2: number): number {
  const a1 = (h1.front + h1.back) / 2;
  const c1 = (h1.front - h1.back) / 2;
  const a2 = (h2.front + h2.back) / 2;
  const c2 = (h2.front - h2.back) / 2;
  const s1 = Math.sin(y1);
  const k1 = Math.cos(y1);
  const s2 = Math.sin(y2);
  const k2 = Math.cos(y2);
  const m1x = x1 + s1 * c1;
  const m1z = z1 + k1 * c1;
  const m2x = x2 + s2 * c2;
  const m2z = z2 + k2 * c2;
  const d = segDist(m1x - s1 * a1, m1z - k1 * a1, m1x + s1 * a1, m1z + k1 * a1, m2x - s2 * a2, m2z - k2 * a2, m2x + s2 * a2, m2z + k2 * a2);
  return d - h1.beam / 2 - h2.beam / 2;
}

const SEABUS_HULL: Hull = { kind: 0, s: 1, front: SEABUS_LEN / 2, back: SEABUS_LEN / 2, beam: SEABUS_BEAM };
/** The SeaBus's fastest (its crossing eases from rest to about one and a half times its mean speed and back). */
const SEABUS_TOP = 9;
/** How far a hull reaches from its origin. */
const reach = (h: Hull) => Math.max(h.front, h.back);
/** Whether (dx, dz) is within d (two hulls whose origins are farther apart than their reaches and room cannot touch). */
const near2 = (dx: number, dz: number, d: number) => dx * dx + dz * dz < d * d;

/* ------------------------------------------------------------------ the waters */

/**
 * How far to starboard of the channel each kind of boat keeps, so those meeting pass port to port: the canoes further
 * over than the rest, so a ferry or a launch can pass them.
 */
const LANE: Record<Use, number> = { inlet: 7, creek: 3.5, ferry: 3.5, canoe: 9 };

/** Burrard Inlet and False Creek: the box each grid covers, its cell, and the clearance its ways keep and seek. */
const WATERS = [
  { box: [-200, 400, -345, -15], step: 2, pref: 14 },
  { box: [-300, 90, 40, 270], step: 1.5, pref: 7 },
] as const;

/** The whole harbour: its docks and boats and their bookings, and the grids their ways are found on. */
export class Harbour {
  /** What Life.tsx draws: each boat's hull (kind and scale). */
  readonly hulls: Hull[];
  /** The docks to paint. */
  readonly boxes: DockBox[];
  private readonly L: Layout;
  private readonly boats: Boat[];
  private readonly grids: WaterGrid[];
  private readonly rng = new Rng(17);
  private readonly ways = new Map<string, Passage | null>();
  private readonly tracks = new Map<Passage, Track[]>();
  private started = false;
  private last = 0;
  /** The sailing being booked, when its search runs on from one call of `update` to the next. */
  private search: Generator<void, void> | null = null;
  private readonly sb: SeaBusPose = { x: 0, z: 0, yaw: 0, v: 0 };
  private readonly tmp: BoatPose = { x: 0, z: 0, yaw: 0, v: 0 };

  constructor(lowEnd: boolean) {
    const L = (this.L = new Layout());
    const rng = new Rng(5);
    const boats: Boat[] = (this.boats = []);
    const moored = (sl: number, h: Hull) => {
      const { water, use } = L.docks[L.slots[sl].dock];
      const rest = berthPose(L.slots[sl], h, { x: 0, z: 0, yaw: 0, v: 0 });
      const b: Boat = { hull: h, hd: null, water, use, slot: sl, rest, plan: null, next: Infinity, dwell: [0, 0], bob: rng.next() * 6 };
      L.slots[sl].owner = boats.length;
      boats.push(b);
      return b;
    };
    const sailing = (sl: number, h: Hull, hd: Handling, dwell: [number, number]) => {
      const b = moored(sl, h);
      b.hd = hd;
      b.dwell = dwell;
      return b;
    };

    // ---- False Creek: its marinas below BC Place, off Yaletown below David Lam Park (Quayside), off the Fairview shore
    // (Spruce Harbour, on the shore itself, so a channel runs between the two), on Granville Island's north side and off
    // the Olympic Village; their boats in most slips, some of them coming and going
    const creekMarinas = [
      marina(L, "BC Place", 1, "creek", -47.6, 180.3, -27.9, 187, 1),
      marina(L, "Quayside", 1, "creek", -86, 187.2, -112, 186.6, 1),
      marina(L, "Spruce Harbour", 1, "creek", -96, 223.9, -128, 218.9, 1),
      marina(L, "Granville Island", 1, "creek", -200, 168, -170, 169.5, 1),
      marina(L, "Olympic Village", 1, "creek", -14, 250.2, 14, 251.4, 1),
    ].filter((d) => d >= 0);
    // and in Coal Harbour, off Harbour Green's north shore: a little marina of the same kind, its boats moored for good
    const coal = marina(L, "Coal Harbour", 0, "creek", -143, -84.2, -155.5, -87.4, 1);
    const creekSail: Handling = { v: 2.4, acc: 0.35, dec: 0.45, lat: 0.5, app: 0.8, astern: 0.6 };
    const creekMotor: Handling = { v: 3.4, acc: 0.5, dec: 0.6, lat: 0.6, app: 0.9, astern: 0.7 };
    const nActive = lowEnd ? 2 : 4;
    let active = 0;
    for (const d of [...creekMarinas, coal]) {
      for (const sl of L.docks[d].slots) {
        const r = rng.next();
        const kind = rng.next() < 0.5 ? 1 : 2;
        const h = hull(kind, kind === 2 ? 0.45 : 0.55);
        // a slip in four or so left empty for the boats under way to come in to
        if (r < 0.22) continue;
        if (d !== coal && active < nActive && r > 0.78) {
          sailing(sl, h, kind === 2 ? creekMotor : creekSail, [20, 55]);
          active++;
        } else moored(sl, h);
      }
    }
    // the dragon boat club beside Science World: a float with four boathouses, three dragon boats alongside on its
    // south side, a gangway to Science World's pier, and the journey canoes' berths on its north side
    const [cax, caz, cbx, cbz] = [44, 232.5, 56, 230.5];
    L.run(cax, caz, cbx, cbz, 1.8, 0.35, FLOAT);
    const cL = Math.hypot(cbx - cax, cbz - caz);
    const ux = (cbx - cax) / cL;
    const uz = (cbz - caz) / cL;
    const along = Math.atan2(ux, uz);
    for (const t of [1.6, 4.4, 7.2, 10]) {
      L.box(1.5, 1.3, 2.1, cax + ux * t, SEA + 0.35 + 0.65, caz + uz * t, along, 0xf2f1ec);
      L.box(1.7, 0.18, 2.3, cax + ux * t, SEA + 1.4, caz + uz * t, along, 0x2f5f8f);
    }
    ([0xc0392b, 0xe0b020, 0x2d6cb0] as const).forEach((hex, k) => L.box(0.75, 0.35, 5.6, cax + ux * (3 + k * 3.3) - uz * 1.5, SEA + 0.1, caz + uz * (3 + k * 3.3) + ux * 1.5, along, hex));
    L.run(cbx, cbz, 60, 231.2, 1, 0.75, FLOAT);
    const club = L.dock("canoe club", 1, "canoe");
    for (const t of [3, 9]) L.slot(club, cax + ux * t + uz * 0.9, caz + uz * t - ux * 0.9, uz, -ux, 0);
    L.keepOff(1, cax, caz, ux, uz, cL + 4, uz, -ux, -2.6, 1.2);
    // the canoes' landing on Granville Island's east shore, clear of the way round the island's corner to the west
    const isle = landing(L, "Granville Island landing", "canoe", -147, 203, -147, 209);
    // the ferries' floats, east to west: the Village by Science World, Yaletown, Stamps Landing, Granville Island and
    // Hornby Street
    const calls = [
      landing(L, "Village", "ferry", 26.5, 249.5, 31, 249.4),
      landing(L, "Yaletown", "ferry", -62, 177.4, -58, 177.6),
      landing(L, "Stamps Landing", "ferry", -62, 235.2, -58, 236),
      landing(L, "Granville Island", "ferry", -212.5, 167.5, -208.5, 167.2),
      landing(L, "Hornby", "ferry", -192.5, 113.1, -189, 115.6),
    ];
    const ferryHd: Handling = { v: 3.6, acc: 0.6, dec: 0.7, lat: 0.7, app: 0.9, astern: 0.7 };
    const ferryHull = hull(0, 0.32);
    (lowEnd ? [0, 3] : [0, 2, 4]).forEach((c, k) => {
      const b = sailing(L.docks[calls[c]].slots[k % 2], ferryHull, ferryHd, [9, 14]);
      b.calls = calls;
      b.call = c;
      b.dir = k % 2 ? -1 : 1;
    });
    const canoeHd: Handling = { v: 2, acc: 0.4, dec: 0.5, lat: 0.5, app: 0.7, astern: 0.5 };
    for (let k = 0; k < (lowEnd ? 1 : 2); k++) sailing(L.docks[k ? isle : club].slots[0], hull(3, 1), canoeHd, [25, 45]);
    // at anchor, swung to the tide
    for (const [x, z] of [
      [24, 218],
      [-4, 230],
      [-30, 220],
      [-104, 196],
      [-150, 168],
      [-198, 126],
      [-224, 106],
    ] as const) {
      const kind = rng.next() < 0.6 ? 1 : 2;
      const h = hull(kind, kind === 2 ? 0.5 : 0.6);
      // swinging clear of the shore and of the docks' water
      if (sdfAt(x, z) > -6 || L.solids[1].some((o) => inSolid(o, x, z, reach(h) + 8))) continue;
      boats.push({ hull: h, hd: null, water: 1, use: "creek", slot: -1, rest: { x, z, yaw: rng.next() * Math.PI * 2, v: 0 }, plan: null, next: Infinity, dwell: [0, 0], bob: rng.next() * 6 });
      L.solids[1].push({ x, z, r: reach(h) + 1 });
    }
    // what else stands in the creek: the bridges' piers, and Science World's deck on its piles with its little pier
    for (const p of wetPiers()) L.solids[1].push(p);
    L.hard[1].push(...wetPiers());
    const sw = LANDMARKS.find((l) => l.key === "scienceWorld");
    if (sw) {
      const yaw = sw.yaw ?? 0;
      const lx = Math.cos(SW_DECK.pierA) * SW_DECK.pierAt;
      const lz = Math.sin(SW_DECK.pierA) * SW_DECK.pierAt;
      const px = sw.px + lx * Math.cos(yaw) + lz * Math.sin(yaw);
      const pz = sw.pz - lx * Math.sin(yaw) + lz * Math.cos(yaw);
      L.solids[1].push({ x: sw.px, z: sw.pz, r: SW_DECK.r + 1 }, { x: px, z: pz, r: 3.2 });
      L.hard[1].push({ x: sw.px, z: sw.pz, r: SW_DECK.r + 0.3 }, { x: px, z: pz, r: 3 });
    }

    // ---- Burrard Inlet: marinas twice the creek's size for its boats, off the rail yard's seawall east of the Harbour
    // Vertiport (Waterfront), east of the yard on the south shore (Portside), past the Lonsdale Vertiport (the
    // Shipyards), on the point west of Lonsdale Quay and off Mosquito Creek
    const inletDocks = [
      marina(L, "Waterfront", 0, "inlet", 130, YARD_BOX[2], 176, YARD_BOX[2], 2),
      marina(L, "Portside", 0, "inlet", 248, -37.5, 296, -38.5, 2),
      marina(L, "Shipyards", 0, "inlet", 296, -257, 330, -237.5, 2),
      marina(L, "Lonsdale West", 0, "inlet", 200, -321, 219, -290, 2),
      marina(L, "Mosquito Creek", 0, "inlet", 98, -328.5, 150, -328.5, 2),
    ].filter((d) => d >= 0);
    const inletSail: Handling = { v: 3, acc: 0.4, dec: 0.5, lat: 0.6, app: 1, astern: 0.7 };
    const inletMotor: Handling = { v: 5, acc: 0.6, dec: 0.7, lat: 0.8, app: 1.1, astern: 0.8 };
    const kinds = lowEnd ? [1, 2, 1, 2, 2] : [1, 2, 1, 2, 2, 1, 1, 2];
    // spread over the marinas a slip at a time, and one moored for good in the last slip of each with four
    const order: number[] = [];
    for (let k = 0; k < 8; k++) for (const d of inletDocks) if (k < L.docks[d].slots.length) order.push(L.docks[d].slots[k]);
    kinds.forEach((kind, k) => {
      if (k < order.length) sailing(order[k], hull(kind, 1), kind === 2 ? inletMotor : { ...inletSail, v: 2.6 + rng.next() * 0.8 }, [18, 45]);
    });
    for (const d of inletDocks) {
      const sl = L.docks[d].slots[L.docks[d].slots.length - 1];
      if (L.docks[d].slots.length >= 4 && L.slots[sl].owner < 0) moored(sl, hull(rng.next() < 0.5 ? 1 : 2, 1));
    }
    // what stands in the inlet: the hub, the piers and the yard (waterfrontHub.ts NO_SAIL), the SeaBus's floats and
    // where the boats lie at them, the water each crossing sweeps near its berths, and the Inlet Walk and its stage
    for (const [x0, x1, z0, z1] of NO_SAIL) {
      const o: Solid = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hl: (z1 - z0) / 2, yaw: 0 };
      L.solids[0].push(o);
      L.hard[0].push(o);
    }
    L.solids[0].push({ x: SEABUS_A[0], z: SEABUS_A[1], hw: 7.6, hl: 4.6, yaw: SEABUS_YAW }, { x: SEABUS_B[0], z: SEABUS_B[1], hw: 5, hl: 3, yaw: SEABUS_YAW });
    L.hard[0].push({ x: SEABUS_A[0], z: SEABUS_A[1], hw: 7.3, hl: 4.3, yaw: SEABUS_YAW }, { x: SEABUS_B[0], z: SEABUS_B[1], hw: 4.7, hl: 2.7, yaw: SEABUS_YAW });
    for (const [x, z] of [SEABUS_STOP_A, SEABUS_STOP_B]) L.solids[0].push({ x, z, hw: SEABUS_BEAM / 2 + 3, hl: SEABUS_LEN / 2 + 4, yaw: SEABUS_YAW });
    // the Inlet Walk's piers, its deck where it is low near either shore, and the stage with its terraces' front
    const inlet = inletSolids();
    L.solids[0].push(...inlet.soft);
    L.hard[0].push(...inlet.hard);
    // the docks' floats, fingers and gangways
    for (const d of L.boxes) {
      const w = WATERS.findIndex(({ box }) => d.x > box[0] && d.x < box[1] && d.z > box[2] && d.z < box[3]);
      if (w >= 0) L.hard[w].push({ x: d.x, z: d.z, hw: d.w / 2, hl: d.l / 2, yaw: d.yaw });
    }

    this.boxes = L.boxes;
    this.hulls = boats.map((b) => b.hull);
    this.grids = WATERS.map((w, i) => new WaterGrid(w.box[0], w.box[2], w.box[1], w.box[3], w.step, L.solids[i]));
  }

  /* ---------------------------------------------------------------- where each boat is */

  /** Where boat i is at time t (between its samples when under way). */
  pose(i: number, t: number, out: BoatPose): BoatPose {
    const b = this.boats[i];
    const p = b.plan;
    if (!p || t <= p.t0) return Object.assign(out, b.rest);
    if (t >= p.t1) return Object.assign(out, p.end);
    const tr = p.tr;
    const f = Math.min(tr.n - 1.0001, (t - p.t0) / DT);
    const k = Math.floor(f);
    const u = f - k;
    out.x = tr.x[k] + (tr.x[k + 1] - tr.x[k]) * u;
    out.z = tr.z[k] + (tr.z[k + 1] - tr.z[k]) * u;
    out.yaw = tr.yaw[k] + turnTo(tr.yaw[k], tr.yaw[k + 1]) * u;
    out.v = tr.v[k] + (tr.v[k + 1] - tr.v[k]) * u;
    return out;
  }

  /** The bob of boat i on the water: a phase of its own. */
  bob(i: number): number {
    return this.boats[i].bob;
  }

  /** Boat i's pose at time t to the nearest sample (for the bookings). */
  private near(b: Boat, t: number, out: BoatPose): BoatPose {
    const p = b.plan;
    if (!p || t <= p.t0) return Object.assign(out, b.rest);
    if (t >= p.t1) return Object.assign(out, p.end);
    const k = Math.min(p.tr.n - 1, Math.round((t - p.t0) / DT));
    out.x = p.tr.x[k];
    out.z = p.tr.z[k];
    out.yaw = p.tr.yaw[k];
    out.v = p.tr.v[k];
    return out;
  }

  /* ---------------------------------------------------------------- the day's sailings */

  /**
   * Bring the harbour to time t: every boat due to sail by then books its passage, in the order they are due, for no
   * more than about `budget` milliseconds a call (a search left over runs on in the next, and those due after it wait
   * their turn). The first call starts the day a hundred seconds back, so the water is busy from the start; a long gap
   * (a hidden tab) brings every boat in to the berth it was making for and starts afresh.
   */
  update(t: number, budget = 6): void {
    if (!this.started) {
      this.started = true;
      this.boats.forEach((b) => {
        if (b.hd) b.next = t - 100 + this.rng.next() * 110;
      });
    } else if (t - this.last > 120) {
      this.search = null;
      for (const b of this.boats) {
        if (!b.hd) continue;
        this.arrive(b);
        b.next = t + this.rng.next() * 30;
      }
    }
    this.last = t;
    const start = performance.now();
    while (performance.now() - start < budget) {
      if (!this.search) {
        let due = -1;
        let at = t;
        this.boats.forEach((b, i) => {
          if (b.hd && b.next <= at) {
            at = b.next;
            due = i;
          }
        });
        if (due < 0) break;
        this.search = this.sail(due, at);
      }
      if (this.search.next().done) this.search = null;
    }
  }

  /** A boat's passage done: it lies at the berth it made for. */
  private arrive(b: Boat): void {
    if (!b.plan) return;
    b.rest = b.plan.end;
    b.slot = b.plan.to;
    b.plan = null;
  }

  /**
   * Boat i sails at time t: it books the first berth (of the free ones it may use) it can reach clear, or waits. A
   * search, stepped a few bookings' checks at a time so that `update` can spread it over frames.
   */
  private *sail(i: number, t: number): Generator<void, void> {
    const b = this.boats[i];
    this.arrive(b);
    for (const to of this.choices(b)) {
      const plan = yield* this.book(i, to, t);
      if (!plan) continue;
      this.L.slots[b.slot].owner = -1;
      this.L.slots[to].owner = i;
      if (b.calls && b.call !== undefined) b.call = b.calls.indexOf(this.L.slots[to].dock);
      b.plan = plan;
      b.next = plan.t1 + b.dwell[0] + this.rng.next() * (b.dwell[1] - b.dwell[0]);
      return;
    }
    // nowhere to go yet (every berth taken, or no clear way): try again shortly
    b.next = t + 4 + this.rng.next() * 3;
  }

  /** The free berths a boat may sail for, in the order it would like them: a ferry's next call, else any other dock's. */
  private choices(b: Boat): number[] {
    const { docks, slots } = this.L;
    const here = slots[b.slot].dock;
    if (b.calls && b.call !== undefined && b.dir) {
      let next = b.call + b.dir;
      if (next < 0 || next >= b.calls.length) {
        b.dir = b.dir > 0 ? -1 : 1;
        next = b.call + b.dir;
      }
      return docks[b.calls[next]].slots.filter((s) => slots[s].owner < 0);
    }
    const out: number[] = [];
    docks.forEach((d, k) => {
      if (k === here || d.use !== b.use || d.water !== b.water) return;
      for (const s of d.slots) if (slots[s].owner < 0) out.push(s);
    });
    // shuffled, and no more than three tried
    for (let k = out.length - 1; k > 0; k--) {
      const j = Math.floor(this.rng.next() * (k + 1));
      [out[k], out[j]] = [out[j], out[k]];
    }
    return out.slice(0, 3);
  }

  /**
   * Book boat i from its berth to berth `to`, leaving at t or as soon after as the way is clear; null if it cannot.
   * What lies still is checked once, whenever it sails: the boats moored for good and at anchor (once for each way,
   * for good) and those lying at their berths with nothing booked (they check against this passage when they sail).
   * Then the boats with passages booked, and the SeaBus, at each moment, leaving later and going slower until clear.
   */
  private *book(i: number, to: number, t: number): Generator<void, Plan | null> {
    const b = this.boats[i];
    const end = berthPose(this.L.slots[to], b.hull, { x: 0, z: 0, yaw: 0, v: 0 });
    for (const pass of this.passages(b, to)) {
      yield;
      if (!pass) continue;
      const trs = this.timed(pass, b);
      // the fastest pace's speeds ask the most room, so its samples stand for all of them
      if (pass.fixed === undefined) pass.fixed = this.still(i, trs[0], (ob) => !ob.hd);
      if (!pass.fixed || !this.still(i, trs[0], (ob) => !!ob.hd && !ob.plan)) continue;
      for (let wait = 0; wait <= WAIT; wait += wait < 20 ? 1 : 2) {
        for (const tr of trs) {
          if (this.clear(i, tr, t + wait, end)) return { t0: t + wait, t1: t + wait + tr.dur, to, end, tr };
        }
        if (wait % 4 === 3) yield;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- the ways */

  /**
   * The ways from boat b's berth to berth `to`, the better first: it backs straight out of its slip until its stem is
   * clear of the fingers, then astern round a quarter turn (its stern swinging to one side or the other, its bow coming
   * round toward where it is going), stops, and goes ahead along the way found to the berth's approach, a straight run
   * in to its float. Found one at a time, as the bookings ask for them; cached by berth, side and hull (null where there
   * is no way).
   */
  private *passages(b: Boat, to: number): Generator<Passage | null> {
    const from = this.L.slots[b.slot];
    const dest = this.L.slots[to];
    const q = berthPose(dest, b.hull, { x: 0, z: 0, yaw: 0, v: 0 });
    const app = dest.depth + 2.25 + Math.max(b.hull.front + b.hull.back, 4);
    const ax = q.x + dest.nx * app;
    const az = q.z + dest.nz * app;
    // the side whose turn leaves the bow toward the approach first
    const p0 = berthPose(from, b.hull, { x: 0, z: 0, yaw: 0, v: 0 });
    const sideOf = (sd: number): [number, number] => [-from.nz * sd, from.nx * sd];
    const pref = (sd: number) => {
      const [wx, wz] = sideOf(sd);
      return -wx * (ax - p0.x) - wz * (az - p0.z);
    };
    for (const sd of pref(1) >= pref(-1) ? [1, -1] : [-1, 1]) {
      const key = `${b.slot}:${sd}:${to}:${b.hull.kind}:${b.hull.s}`;
      let pass = this.ways.get(key);
      if (pass === undefined) {
        pass = this.passage(b, from, sideOf(sd), [ax, az], q, app, dest.depth);
        this.ways.set(key, pass);
      }
      yield pass;
    }
  }

  private passage(b: Boat, from: Slot, [wx, wz]: [number, number], [ax, az]: XZ, q: BoatPose, app: number, depth: number): Passage | null {
    const h = b.hull;
    const grid = this.grids[b.water];
    // the clearance its way keeps: its beam's or, as a long hull's ends swing out on a bend, half its reach's, and more
    const r = Math.max(h.beam, reach(h)) / 2 + (b.water === 0 ? 1.4 : 1);
    const p0 = berthPose(from, h, { x: 0, z: 0, yaw: 0, v: 0 });
    // astern: straight out until the stem clears the fingers, then round a quarter turn, the stern swinging to w
    const { nx, nz } = from;
    const back = from.depth + 1.75;
    const R = Math.max(3, 0.7 * (h.front + h.back));
    const astern: Way = { x: [], z: [], yaw: [], curv: [], s: [] };
    const put = (x: number, z: number, yaw: number, curv: number) => {
      const n = astern.x.length;
      astern.s.push(n ? astern.s[n - 1] + Math.hypot(x - astern.x[n - 1], z - astern.z[n - 1]) : 0);
      astern.x.push(x);
      astern.z.push(z);
      astern.yaw.push(yaw);
      astern.curv.push(curv);
    };
    const nb = Math.max(2, Math.ceil(back));
    for (let k = 0; k <= nb; k++) put(p0.x + (nx * back * k) / nb, p0.z + (nz * back * k) / nb, p0.yaw, 0);
    const bx = p0.x + nx * back;
    const bz = p0.z + nz * back;
    const na = Math.max(4, Math.ceil((R * Math.PI) / 2));
    for (let k = 1; k <= na; k++) {
      const a = ((Math.PI / 2) * k) / na;
      // the stern leads (moving along w sin a + n cos a); the bow points the other way
      put(bx + wx * R * (1 - Math.cos(a)) + nx * R * Math.sin(a), bz + wz * R * (1 - Math.cos(a)) + nz * R * Math.sin(a), Math.atan2(-(wx * Math.sin(a) + nx * Math.cos(a)), -(wz * Math.sin(a) + nz * Math.cos(a))), 1 / R);
    }
    const ex = bx + (wx + nx) * R;
    const ez = bz + (wz + nz) * R;
    // the water it swings through must be open, stem to stern (the boats it passes are the bookings' to check)
    if (!openWater(grid, this.L.hard[b.water], h, astern, nb, astern.x.length)) return null;
    // ahead: on from where it stopped, bow along -w, to the approach, then straight in
    const lead = Math.max(2, (h.front + h.back) * 0.5);
    const lx = ex - wx * lead;
    const lz = ez - wz * lead;
    const found = grid.findWay([lx, lz], [ax, az], r, WATERS[b.water].pref);
    if (!found) return null;
    const core = keepRight(grid.taut(found, r + 0.5), grid, r + 0.5, LANE[b.use]);
    const ahead = rounded([[ex, ez], ...core, [q.x, q.z]], grid, r, b.water === 0 ? 22 : 10, depth + 2.25);
    if (ahead.x.length < 2) return null;
    const total = ahead.s[ahead.s.length - 1];
    // and so must all its way ahead, but for the run in to the berth (the dock's own water, between its fingers)
    let inTo = ahead.s.findIndex((s) => s > total - app);
    if (inTo < 0) inTo = ahead.x.length;
    if (!openWater(grid, this.L.hard[b.water], h, ahead, 0, inTo)) return null;
    return { astern, ahead, appFrom: total - app - 2 };
  }

  /** A passage timed at each of the paces, sampled for the bookings. Cached. */
  private timed(pass: Passage, b: Boat): Track[] {
    let trs = this.tracks.get(pass);
    if (trs) return trs;
    const hd = b.hd as Handling;
    const va = speeds(pass.astern, hd.astern, 0.4, 0.5, 0.4);
    const ta = times(pass.astern, va);
    trs = PACES.map((f) => {
      const vb = speeds(pass.ahead, hd.v * f, hd.acc, hd.dec, hd.lat, (i) => (pass.ahead.s[i] >= pass.appFrom ? hd.app : Infinity));
      const tb = times(pass.ahead, vb);
      return sampled(pass, va, ta, vb, tb);
    });
    this.tracks.set(pass, trs);
    return trs;
  }

  /* ---------------------------------------------------------------- the bookings */

  /** Whether passage `tr` of boat i (its berth at the end its last sample) keeps its room from the still boats `which` picks. */
  private still(i: number, tr: Track, which: (ob: Boat) => boolean): boolean {
    const me = this.boats[i];
    const h = me.hull;
    for (let j = 0; j < this.boats.length; j++) {
      const ob = this.boats[j];
      if (j === i || ob.water !== me.water || !which(ob)) continue;
      const far = reach(h) + reach(ob.hull) + room(6, 0);
      const { x, z, yaw } = ob.rest;
      for (let c = 0; c < tr.cx.length; c++) {
        if (Math.hypot(tr.cx[c] - x, tr.cz[c] - z) > tr.cr[c] + far) continue;
        for (let k = c * CHUNK; k <= Math.min(tr.n - 1, (c + 1) * CHUNK); k++) {
          if (near2(tr.x[k] - x, tr.z[k] - z, reach(h) + reach(ob.hull) + room(tr.v[k], 0)) && between(h, tr.x[k], tr.z[k], tr.yaw[k], ob.hull, x, z, yaw) < room(tr.v[k], 0)) return false;
        }
      }
    }
    return true;
  }

  /**
   * Whether boat i can make passage `tr` leaving at t0 and lie at `end` after: at every sample the room `room` asks
   * from every boat with a passage booked, wherever that one is then (at its berth, under way or arrived), and from
   * both SeaBuses on the inlet (more, for its size); and, once it lies at its berth, from every passage booked past
   * then.
   */
  private clear(i: number, tr: Track, t0: number, end: BoatPose): boolean {
    const me = this.boats[i];
    const h = me.hull;
    const t1 = t0 + tr.dur;
    const o = this.tmp;
    const nC = Math.ceil(tr.n / CHUNK);
    for (let j = 0; j < this.boats.length; j++) {
      const ob = this.boats[j];
      if (j === i || ob.water !== me.water || !ob.plan) continue;
      const far = reach(h) + reach(ob.hull) + room(6, 6);
      for (let c = 0; c < nC; c++) {
        const k0 = c * CHUNK;
        const k1 = Math.min(tr.n - 1, k0 + CHUNK);
        const ta = t0 + k0 * DT;
        const tb = t0 + k1 * DT;
        // where the other is over the chunk, roughly: a circle round it
        const [ox, oz, orr] = this.span(ob, ta, tb);
        if (Math.hypot(tr.cx[c] - ox, tr.cz[c] - oz) > tr.cr[c] + orr + far) continue;
        for (let k = k0; k <= k1; k++) {
          this.near(ob, t0 + k * DT, o);
          const need = room(tr.v[k], o.v);
          if (near2(tr.x[k] - o.x, tr.z[k] - o.z, reach(h) + reach(ob.hull) + need) && between(h, tr.x[k], tr.z[k], tr.yaw[k], ob.hull, o.x, o.z, o.yaw) < need) return false;
        }
      }
      // lying at its new berth, against the other's passage booked past our arrival
      const p = ob.plan;
      if (p && p.t1 > t1) {
        const k0 = Math.max(0, Math.floor((t1 - p.t0) / DT));
        for (let c = Math.floor(k0 / CHUNK); c * CHUNK < p.tr.n; c++) {
          if (Math.hypot(p.tr.cx[c] - end.x, p.tr.cz[c] - end.z) > p.tr.cr[c] + far) continue;
          for (let k = Math.max(k0, c * CHUNK); k <= Math.min(p.tr.n - 1, (c + 1) * CHUNK); k++) {
            const need = room(0, p.tr.v[k]);
            if (near2(end.x - p.tr.x[k], end.z - p.tr.z[k], reach(h) + reach(ob.hull) + need) && between(h, end.x, end.z, end.yaw, ob.hull, p.tr.x[k], p.tr.z[k], p.tr.yaw[k]) < need) return false;
          }
        }
      }
    }
    if (me.water === 0) {
      const sb = this.sb;
      const far = reach(h) + SEABUS_LEN / 2 + room(6, SEABUS_TOP) + 2 + SEABUS_TOP * CHUNK * DT;
      for (let c = 0; c < nC; c++) {
        const k0 = c * CHUNK;
        const k1 = Math.min(tr.n - 1, k0 + CHUNK);
        for (let s = 0; s < 2; s++) {
          seabusAt(t0 + ((k0 + k1) / 2) * DT, s, sb);
          if (Math.hypot(tr.cx[c] - sb.x, tr.cz[c] - sb.z) > tr.cr[c] + far) continue;
          for (let k = k0; k <= k1; k++) {
            seabusAt(t0 + k * DT, s, sb);
            const need = room(tr.v[k], sb.v) + 2;
            if (near2(tr.x[k] - sb.x, tr.z[k] - sb.z, reach(h) + SEABUS_LEN / 2 + need) && between(h, tr.x[k], tr.z[k], tr.yaw[k], SEABUS_HULL, sb.x, sb.z, sb.yaw) < need) return false;
          }
        }
      }
    }
    return true;
  }

  /** A circle round where boat b is from ta to tb. */
  private span(b: Boat, ta: number, tb: number): [number, number, number] {
    const p = b.plan;
    if (!p || tb <= p.t0) return [b.rest.x, b.rest.z, 0];
    if (ta >= p.t1) return [p.end.x, p.end.z, 0];
    const c0 = Math.max(0, Math.floor((ta - p.t0) / DT / CHUNK));
    const c1 = Math.min(p.tr.cx.length - 1, Math.floor((tb - p.t0) / DT / CHUNK));
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    const add = (x: number, z: number, r: number) => {
      x0 = Math.min(x0, x - r);
      x1 = Math.max(x1, x + r);
      z0 = Math.min(z0, z - r);
      z1 = Math.max(z1, z + r);
    };
    for (let c = c0; c <= c1; c++) add(p.tr.cx[c], p.tr.cz[c], p.tr.cr[c]);
    if (ta < p.t0) add(b.rest.x, b.rest.z, 0);
    if (tb > p.t1) add(p.end.x, p.end.z, 0);
    return [(x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2];
  }
}

/**
 * Whether a hull at the points of way w from k0 to k1 keeps off the shore (the water's own distance field) and off
 * what stands in the water (`hard`, as it is): stem, stern and both sides at each point near any of it (by the grid),
 * with a little to spare.
 */
function openWater(grid: WaterGrid, hard: Solid[], h: Hull, w: Way, k0: number, k1: number): boolean {
  if (k1 <= k0) return true;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let k = k0; k < k1; k++) {
    x0 = Math.min(x0, w.x[k]);
    x1 = Math.max(x1, w.x[k]);
    z0 = Math.min(z0, w.z[k]);
    z1 = Math.max(z1, w.z[k]);
  }
  // what stands near enough to matter
  const pad = reach(h) + 1;
  const near = hard.filter((o) => {
    const e = "r" in o ? o.r : Math.max(o.hw, o.hl);
    return o.x + e > x0 - pad && o.x - e < x1 + pad && o.z + e > z0 - pad && o.z - e < z1 + pad;
  });
  const half = h.beam / 2;
  for (let k = k0; k < k1; k++) {
    // well out in open water (the grid keeps off all of it and more), nothing to look at
    if (grid.clearAt(w.x[k], w.z[k]) > reach(h) + 2) continue;
    const sx = Math.sin(w.yaw[k]);
    const sz = Math.cos(w.yaw[k]);
    for (const [a, c] of [
      [h.front, 0],
      [-h.back, 0],
      [h.front * 0.6, half],
      [h.front * 0.6, -half],
      [0, half],
      [0, -half],
      [-h.back * 0.8, half],
      [-h.back * 0.8, -half],
    ]) {
      // along the bow (sin, cos) and across it to starboard (−cos, sin)
      const x = w.x[k] + sx * a - sz * c;
      const z = w.z[k] + sz * a + sx * c;
      if (sdfAt(x, z) > -0.5 || near.some((o) => inSolid(o, x, z, 0.3))) return false;
    }
  }
  return true;
}

/** A passage's two ways and its pause, timed, resampled every DT, with a circle round each chunk of samples. */
function sampled(pass: Passage, va: number[], ta: number[], vb: number[], tb: number[]): Track {
  const A = ta[ta.length - 1];
  const B = tb[tb.length - 1];
  const dur = A + PAUSE + B;
  const n = Math.floor(dur / DT) + 2;
  const tr: Track = {
    n,
    x: new Float32Array(n),
    z: new Float32Array(n),
    yaw: new Float32Array(n),
    v: new Float32Array(n),
    cx: new Float32Array(Math.ceil(n / CHUNK)),
    cz: new Float32Array(Math.ceil(n / CHUNK)),
    cr: new Float32Array(Math.ceil(n / CHUNK)),
    dur: (n - 1) * DT,
  };
  let ia = 0;
  let ib = 0;
  const at = (w: Way, ts: number[], vs: number[], i: number, t: number, k: number) => {
    const j = Math.min(ts.length - 2, i);
    const u = Math.max(0, Math.min(1, (t - ts[j]) / Math.max(1e-6, ts[j + 1] - ts[j])));
    tr.x[k] = w.x[j] + (w.x[j + 1] - w.x[j]) * u;
    tr.z[k] = w.z[j] + (w.z[j + 1] - w.z[j]) * u;
    tr.yaw[k] = w.yaw[j] + turnTo(w.yaw[j], w.yaw[j + 1]) * u;
    tr.v[k] = vs[j] + (vs[j + 1] - vs[j]) * u;
  };
  for (let k = 0; k < n; k++) {
    const t = k * DT;
    if (t <= A) {
      while (ia < ta.length - 2 && ta[ia + 1] < t) ia++;
      at(pass.astern, ta, va, ia, t, k);
    } else if (t <= A + PAUSE) {
      at(pass.astern, ta, va, ta.length - 2, A, k);
      tr.v[k] = 0;
    } else {
      const tt = Math.min(B, t - A - PAUSE);
      while (ib < tb.length - 2 && tb[ib + 1] < tt) ib++;
      at(pass.ahead, tb, vb, ib, tt, k);
    }
  }
  for (let c = 0; c < tr.cx.length; c++) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let k = c * CHUNK; k <= Math.min(n - 1, (c + 1) * CHUNK); k++) {
      x0 = Math.min(x0, tr.x[k]);
      x1 = Math.max(x1, tr.x[k]);
      z0 = Math.min(z0, tr.z[k]);
      z1 = Math.max(z1, tr.z[k]);
    }
    tr.cx[c] = (x0 + x1) / 2;
    tr.cz[c] = (z0 + z1) / 2;
    tr.cr[c] = Math.hypot(x1 - x0, z1 - z0) / 2;
  }
  return tr;
}
