/**
 * The air taxis of 2100: a public service between vertiports on the transit interchanges (vertiports.ts), on routes
 * kept over the water first, then over rail land and the arterials, never along the Expo and never down a street of
 * homes (airspace.ts makes the flights):
 * - the trunk along Burrard Inlet, from out past Stanley Park through the First Narrows and up the inlet, well north
 *   of Canada Place;
 * - the North Shore crossing, Harbour to Lonsdale straight over the water;
 * - the Skyport spur, east along the inlet off the port, then down Victoria Drive to Commercial–Broadway;
 * - the regional routes from the Clark Park Vertiport at Commercial–Broadway, east over Trout Lake to the Grandview
 *   Cut: to Coquitlam along the Millennium Line (the line that goes there), to Surrey along Grandview Highway and the
 *   Trans-Canada toward the Port Mann; both fly off the map's east edge.
 * Each way of each route has its own flight level; the two ways of a route keep 16 apart side by side over the water
 * and stack 16 apart over the street (the regional routes' ways both: their eastbound lane crosses the westbound where
 * the Coquitlam route turns off). Taxis shuttle between their service's pads and dwell at each; the trunk's
 * services and its through traffic fly off the map at its ends. Every service's round takes a whole divisor of one
 * period, its taxis spaced about evenly round it, each nudged a few seconds so that no two taxis come within 15 of
 * each other (7 within a vertiport's own airspace) and no pad takes two at once. Where each taxi is is a function of
 * the time alone.
 */
import { type Airspace, airspaceFor, type End, fly, type Flight, holdClash, holds, type Make, offsetLine, type Pose, round, type Round, roundPose, Timetable, track, type Track } from "./airspace";
import { skyportAt } from "./buildings/heroes";
import { vertiportPads } from "./sets/squares";
import { HARBOUR, LONSDALE, type Spot } from "./vertiports";

/** Where the trunk leaves the map: out past Stanley Park toward English Bay, and up the inlet. */
const WEST_EXIT: [number, number] = [-520, -200];
const EAST_EXIT: [number, number] = [920, -110];
/** The trunk's centreline, west to east: round Stanley Park, through the First Narrows, up the inlet. */
const TRUNK: [number, number][] = [
  WEST_EXIT,
  [-470, -262],
  [-420, -318],
  [-350, -368],
  [-280, -390],
  [-218, -376],
  [-165, -338],
  [-120, -300],
  [-60, -262],
  [0, -235],
  [60, -212],
  [120, -195],
  [180, -182],
  [240, -170],
  [300, -158],
  [360, -148],
  [420, -138],
  [480, -128],
  [540, -118],
  [600, -113],
  [680, -112],
  [760, -112],
  [840, -111],
  EAST_EXIT,
];
/** The North Shore crossing's centreline, Harbour to Lonsdale. */
const CROSSING: [number, number][] = [
  [104, -98],
  [244, -242],
];
/**
 * The Skyport spur's centreline: off the Harbour Vertiport east along the inlet (south of the crossing, north of the
 * rail yard), ashore over the port, down Victoria Drive.
 */
const SPUR: [number, number][] = [
  [124, -80],
  [200, -84],
  [280, -82],
  [334, -68],
  [362, -40],
  [371, -6],
  [372, 40],
  [372, 110],
  [371, 180],
  [371, 240],
  [370, 276],
];

/**
 * The regional routes' centrelines, out of the Clark Park Vertiport: east over Commercial Drive and the Expo, over
 * Trout Lake, to the Grandview Cut at Renfrew (both routes); on from there to Coquitlam over the Millennium Line by
 * Rupert, Gilmore, Brentwood and Holdom, and to Surrey along Grandview Highway and the Trans-Canada. Each ends at the
 * map's edge.
 */
const REGIONAL: [number, number][] = [
  [309, 354],
  [330, 356],
  [352, 360],
  [380, 366],
  [407, 369],
  [440, 361],
  [470, 351],
  [520, 343],
];
const COQUITLAM: [number, number][] = [
  ...REGIONAL,
  [546, 331],
  [580, 325],
  [618, 316],
  [650, 303],
  [672, 293],
  [700, 290],
  [758, 291],
  [772, 284],
  [782, 266],
  [800, 249],
  [830, 241],
  [883, 242],
  [920, 244],
  [950, 255],
  [980, 260],
  [1040, 262],
  [1080, 275],
];
/** The regional routes' levels: eastbound, westbound. */
const REGIONAL_LEVELS: [number, number] = [64, 80];
const SURREY: [number, number][] = [...REGIONAL, [585, 343], [641, 342], [708, 343], [742, 340], [769, 346], [800, 348], [870, 347], [948, 347], [1030, 349]];

/** The taxis' make: levels by route are set per leg; 12 clear of every roof, 7 units a second (about 230 km/h) at cruise. */
const TAXI: Omit<Make, "level"> = { clear: 12, grade: 0.45, cruise: 7, vert: 2.5, acc: 1.0, turn: 1.6, bank: 0.4, step: 2 };
/** The least dwell at a pad, and the gap a pad keeps between one taxi's climbing away and the next's coming down. */
const DWELL = 14;
const PAD_GAP = 12;
/** How far a taxi's offset may be nudged from its even place round its service's cycle. */
const NUDGE = 9;

/**
 * A service's end: its pads (`tall`, on a roof in the city, where a taxi climbs straight up to its level and comes
 * straight down from it, over the roofs round it) or the map's edge.
 */
type Stop = { pads: Spot[]; tall?: boolean } | { exit: true };
type Def = { name: string; n: [number, number]; a: Stop; b: Stop; out: [number, number][]; back: [number, number][]; levels: [number, number] };

const rev = (line: [number, number][]) => [...line].reverse();
const nearest = (l: [number, number][], [x, z]: [number, number]) => l.reduce((b, q, i) => (Math.hypot(q[0] - x, q[1] - z) < Math.hypot(l[b][0] - x, l[b][1] - z) ? i : b), 0);
/** The part of a lane from the point nearest p to its end, or from its start up to it. */
const from = (l: [number, number][], p: [number, number]) => l.slice(nearest(l, p));
const upTo = (l: [number, number][], p: [number, number]) => l.slice(0, nearest(l, p) + 1);
/** A line's points every `step` along it. */
function dense(line: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const k = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let j = 1; j <= k; j++) out.push([ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k]);
  }
  return out;
}

/**
 * The services: how many taxis (full, lite), their ends, the way out and back, the level each way. The trunk's two
 * services join and leave it on links from their pads that keep apart from each other and from the crossing.
 */
function services(lowEnd: boolean): Def[] {
  const trunkE = offsetLine(dense(TRUNK, 10), 8);
  const trunkW = offsetLine(rev(dense(TRUNK, 10)), 8);
  const cross = dense(CROSSING, 10);
  const spur = dense(SPUR, 10);
  // the spur's two ways 16 apart over the inlet, closing to 6 (one over the other) as it comes ashore over the street
  const spurSide = (x: number, z: number) => (z > -30 ? 3 : x < 320 ? 8 : 8 - (5 * (x - 320)) / 50);
  const H = HARBOUR.pads;
  const V = vertiportPads();
  // the regional routes' ways 16 apart side by side, eastbound to the south, and stacked 16 apart (they cross where the
  // Coquitlam route turns off the Surrey route's)
  const coq = dense(COQUITLAM, 10);
  const sur = dense(SURREY, 10);
  return [
    { name: "trunk", n: [12, 5], a: { exit: true }, b: { exit: true }, out: trunkE, back: trunkW, levels: [60, 68] },
    { name: "harbour–lonsdale", n: [6, 3], a: { pads: [H[2], H[3]] }, b: { pads: LONSDALE.pads }, out: offsetLine(cross, 8), back: offsetLine(rev(cross), 8), levels: [54, 62] },
    {
      name: "harbour–west",
      n: [5, 2],
      a: { pads: [H[0]] },
      b: { exit: true },
      out: [[48, -110], [10, -165], [-30, -222], ...from(trunkW, [-52, -258])],
      back: [...upTo(trunkE, [28, -214]), [50, -168], [66, -125]],
      levels: [68, 60],
    },
    {
      name: "harbour–east",
      n: [5, 2],
      a: { pads: [H[1]] },
      b: { exit: true },
      out: [[100, -115], [124, -160], ...from(trunkE, [150, -183])],
      back: [...upTo(trunkW, [95, -210]), [90, -165], [82, -120]],
      levels: [60, 68],
    },
    { name: "harbour–skyport", n: [8, 4], a: { pads: [H[4], H[5]] }, b: { pads: skyportAt(lowEnd).pads, tall: true }, out: offsetLine(spur, spurSide), back: offsetLine(rev(spur), (x, z) => spurSide(x, z)), levels: [72, 88] },
    { name: "clark–coquitlam", n: [6, 3], a: { pads: [V[0], V[1]], tall: true }, b: { exit: true }, out: offsetLine(coq, 8), back: offsetLine(rev(coq), 8), levels: REGIONAL_LEVELS },
    { name: "clark–surrey", n: [6, 3], a: { pads: [V[2], V[3]], tall: true }, b: { exit: true }, out: offsetLine(sur, 8), back: offsetLine(rev(sur), 8), levels: REGIONAL_LEVELS },
  ];
}

/**
 * A leg from one stop over a line to the other: from a pad its taxi rises 12 straight up before it leaves; at an exit
 * it comes in or goes out at its level where its lane meets the map's edge (the line's own end).
 */
function leg(a: Stop, line: [number, number][], b: Stop, k: number, level: number, air: Airspace): Flight {
  const n = line.length;
  // off a pad over the water a taxi climbs straight up 24 before it leaves (over the taxis coming in, which come
  // down the last 12 straight); off a roof in the city it climbs straight to its level, and comes straight down from it
  const at = (s: { pads: Spot[]; tall?: boolean }, lift: number): End => {
    const p = s.pads[k % s.pads.length];
    return { ...p, lift: s.tall ? Math.max(12, level - p.y) : lift };
  };
  const A: End = "pads" in a ? at(a, 24) : { x: line[0][0], y: 0, z: line[0][1], lift: 0, air: true };
  const B: End = "pads" in b ? at(b, 12) : { x: line[n - 1][0], y: 0, z: line[n - 1][1], lift: 0, air: true };
  return fly(A, line.slice("pads" in a ? 0 : 1, "pads" in b ? n : n - 1), B, { ...TAXI, level }, air);
}

/** The fewest turns between two taxis landing on the same one of `pads` pads when n taxis take them in order. */
function padTurns(n: number, pads: number): number {
  let m = n;
  for (let q = 0; q < Math.min(pads, n); q++) {
    const users: number[] = [];
    for (let j = q; j < n; j += pads) users.push(j);
    for (let i = 0; i < users.length; i++) m = Math.min(m, (users[(i + 1) % users.length] - users[i] + n) % n || n);
  }
  return m;
}

/** A service as flown: its rounds (one per pair of pads its taxis alternate between), its cycle and taxis' offsets. */
export type Service = { name: string; n: number; c: number; rounds: Round[]; tracks: Track[]; offsets: number[]; pads: [Spot[], Spot[]] };
export type Taxi = Pose & { service: number; j: number; shown: boolean; phase: number };
export type AirTaxis = { period: number; services: Service[]; taxis: Taxi[]; timetable: Timetable; holds: Holds; report: string[] };

/** The period every taxi's round divides, so the whole timetable repeats: 5040 s, rich in divisors. */
export const PERIOD = 5040;
const DIVISORS = Array.from({ length: PERIOD }, (_, i) => i + 1).filter((d) => PERIOD % d === 0);

/**
 * The taxis in the timetable, and the distance they keep (a little over): 15 apart, 7 where both are in a vertiport's
 * own airspace.
 */
const TAXI_KIND = 0;
const separation = (_a: number, _b: number, nearA: number, nearB: number): number => (nearA && nearB ? 7.5 : 15.5);

/** Every pad and dock in the air: who holds it when (round time spans), so no two hold one at once. */
export class Holds {
  private list: { at: { x: number; z: number }; c: number; span: [number, number]; o: number }[] = [];
  private memo = new Map<string, { g: number; bad: Uint8Array } | null>();
  /** How many holds already made one of these (a round's at offset o) would overlap, `gap` seconds kept between. */
  count(hs: { at: { x: number; z: number }; span: [number, number] }[], c: number, o: number, gap: number): number {
    let n = 0;
    for (const h of hs) {
      for (const q of this.list) {
        if (Math.hypot(q.at.x - h.at.x, q.at.z - h.at.z) > 0.5) continue;
        const k = `${c}:${h.span[0]}:${h.span[1]}|${q.c}:${q.span[0]}:${q.span[1]}|${gap}`;
        let cf = this.memo.get(k);
        if (cf === undefined) this.memo.set(k, (cf = holdClash(c, h.span, q.c, q.span, gap)));
        if (cf && cf.bad[(((o - q.o) % cf.g) + cf.g) % cf.g]) n++;
      }
    }
    return n;
  }
  add(hs: { at: { x: number; z: number }; span: [number, number] }[], c: number, o: number): void {
    for (const h of hs) this.list.push({ at: h.at, c, span: [Math.round(h.span[0]), Math.round(h.span[1])], o });
  }
  get size(): number {
    return this.list.length;
  }
  truncate(n: number): void {
    this.list.length = n;
  }
}

/**
 * A cycle's dwells at either end, or null where the cycle cannot keep each pad's turns apart: at a pad end at least
 * DWELL, the time the cycle has over its flights shared between the ends as each pad has room for it; at the map's
 * edge (hidden) whatever is over.
 */
function dwells(c: number, n: number, na: number, nb: number, o: Flight, b: Flight): [number, number] | null {
  const spare = c - o.dur - b.dur - 2 * DWELL;
  if (spare < 0) return null;
  // how much longer than DWELL each end's pads let a taxi stay: its turn round them, less its descent and climb and the gap
  const room = (pads: number, held: number) => (pads ? (padTurns(n, pads) * c) / n - held - DWELL - PAD_GAP : Infinity);
  const ra = room(na, b.dur - b.down + o.up);
  const rb = room(nb, o.dur - o.down + b.up);
  if (ra < 0 || rb < 0 || spare > ra + rb) return null;
  if (!na && !nb) return [DWELL + spare / 2, DWELL + spare / 2];
  if (!na) return [DWELL + spare, DWELL];
  if (!nb) return [DWELL, DWELL + spare];
  const ea = (spare * ra) / (ra + rb);
  return [DWELL + ea, DWELL + spare - ea];
}

/**
 * A service's offsets against the taxis placed: its n taxis about evenly round its cycle, each nudged a few seconds,
 * the whole set turned until no two taxis ever come too close and no pad is ever held twice. The best found, and how
 * many conflicts it leaves; nothing is placed.
 */
function schedule(timetable: Timetable, pads: Holds, c: number, n: number, rounds: Round[], tracks: Track[]): { offs: number[]; bad: number } {
  const spacing = c / n;
  const hs = rounds.map(holds);
  let best: { offs: number[]; bad: number } = { offs: [], bad: Infinity };
  for (let phi = 0; phi < Math.ceil(spacing) && best.bad > 0; phi++) {
    const t0 = timetable.placed.length;
    const h0 = pads.size;
    const offs: number[] = [];
    let bad = 0;
    for (let j = 0; j < n; j++) {
      const k = j % rounds.length;
      let pick = { o: 0, bad: Infinity };
      for (let q = 0; q <= 2 * NUDGE && pick.bad > 0; q++) {
        const nudge = q % 2 ? (q + 1) / 2 : -q / 2;
        const o = (((phi + Math.round(j * spacing) + nudge) % c) + c) % c;
        const b = timetable.count(tracks[k], o, TAXI_KIND) + pads.count(hs[k], c, o, PAD_GAP);
        if (b < pick.bad) pick = { o, bad: b };
      }
      offs.push(pick.o);
      bad += pick.bad;
      timetable.place(tracks[k], pick.o, TAXI_KIND);
      pads.add(hs[k], c, pick.o);
    }
    if (bad < best.bad) best = { offs, bad };
    timetable.placed.length = t0;
    pads.truncate(h0);
  }
  return best;
}

/**
 * Within a vertiport's own airspace: within 26 of its pads and below 36 over them; at the Clark Park Vertiport, whose
 * taxis climb straight up from the park to their routes' levels and come straight down, up to those levels.
 */
function nearPort(lowEnd: boolean): (x: number, y: number, z: number) => boolean {
  const pads = [...HARBOUR.pads, ...LONSDALE.pads, ...skyportAt(lowEnd).pads].map((p) => ({ ...p, top: p.y + 36 }));
  for (const p of vertiportPads()) pads.push({ ...p, top: REGIONAL_LEVELS[1] + 2 });
  return (x, y, z) => pads.some((p) => Math.hypot(x - p.x, z - p.z) < 26 && y < p.top);
}

const built = new Map<boolean, AirTaxis>();

/** The air taxis for a budget (full: 48, lite: 22), their services' rounds and timetables. */
export function airTaxis(lowEnd: boolean): AirTaxis {
  const known = built.get(lowEnd);
  if (known) return known;
  const air = airspaceFor(lowEnd);
  const near = nearPort(lowEnd);
  const report: string[] = [];
  const out: Service[] = [];
  const timetable = new Timetable(separation);
  const pads = new Holds();
  for (const d of services(lowEnd)) {
    const n = d.n[lowEnd ? 1 : 0];
    const A = "pads" in d.a ? d.a.pads : [];
    const B = "pads" in d.b ? d.b.pads : [];
    const legs: [Flight, Flight][] = [];
    for (let k = 0; k < Math.max(1, A.length, B.length); k++) legs.push([leg(d.a, d.out, d.b, k, d.levels[0], air), leg(d.b, d.back, d.a, k, d.levels[1], air)]);
    // the cycles it could keep: long enough for both flights and a dwell at each end, each pad's turns kept apart (a
    // taxi comes down only once the last has climbed well away), whole divisors of the period; each tried in turn
    const lo = Math.max(...legs.map(([o, b]) => o.dur + b.dur + 2 * DWELL));
    const fits = DIVISORS.filter((c) => c >= lo && c < lo * 1.6 && legs.every(([o, b]) => dwells(c, n, A.length, B.length, o, b) !== null)).slice(0, 5);
    if (!fits.length) report.push(`${d.name}: no cycle keeps its pads' turns apart`);
    let best: { c: number; rounds: Round[]; tracks: Track[]; offs: number[]; bad: number } | null = null;
    for (const c of fits.length ? fits : [DIVISORS.find((v) => v >= lo) ?? PERIOD]) {
      const rounds = legs.map(([o, b], k) => {
        const [dA, dB] = dwells(c, n, A.length, B.length, o, b) ?? [DWELL, c - o.dur - b.dur - DWELL];
        const pa = A[k % Math.max(1, A.length)];
        const pb = B[k % Math.max(1, B.length)];
        return round(c, [pa ? { stay: dA, ...pa } : { stay: dA, hidden: true }, o, pb ? { stay: dB, ...pb } : { stay: dB, hidden: true }, b]);
      });
      const tracks = rounds.map((r) => track(r, near));
      const placed = schedule(timetable, pads, c, n, rounds, tracks);
      if (!best || placed.bad < best.bad) best = { c, rounds, tracks, ...placed };
      if (best.bad === 0) break;
    }
    if (!best) continue;
    if (best.bad > 0) report.push(`${d.name}: ${best.bad} conflicts left`);
    const s: Service = { name: d.name, n, c: best.c, rounds: best.rounds, tracks: best.tracks, offsets: best.offs, pads: [A, B] };
    s.offsets.forEach((o, j) => {
      timetable.place(s.tracks[j % s.rounds.length], o, TAXI_KIND);
      pads.add(holds(s.rounds[j % s.rounds.length]), s.c, o);
    });
    out.push(s);
  }
  const taxis: Taxi[] = [];
  out.forEach((s, si) => s.offsets.forEach((_, j) => taxis.push({ service: si, j, shown: false, phase: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vh: 0 })));
  const result: AirTaxis = { period: PERIOD, services: out, taxis, timetable, holds: pads, report };
  built.set(lowEnd, result);
  return result;
}

/** Pose every taxi at time t (seconds on the scene's clock): shown, where, which way, pitch and bank. */
export function flyTaxis(a: AirTaxis, t: number): void {
  for (const taxi of a.taxis) {
    const s = a.services[taxi.service];
    const tau = (((t + s.offsets[taxi.j]) % s.c) + s.c) % s.c;
    taxi.phase = tau / s.c;
    taxi.shown = roundPose(s.rounds[taxi.j % s.rounds.length], tau, taxi);
  }
}

/** The floatplane's orbit over the harbour: clear of both vertiports by more than 70, under every taxi's level by more than 15. */
export const FLOATPLANE = { x: 30, z: -300, r: 150, squash: 0.7, y: 34, bob: 3, w: 0.12 };
/** Where the floatplane is at time t, and its heading (Life.tsx flies it). */
export function floatplaneAt(t: number): { x: number; y: number; z: number; ry: number } {
  const a = t * FLOATPLANE.w;
  return {
    x: FLOATPLANE.x + Math.cos(a) * FLOATPLANE.r,
    y: FLOATPLANE.y + Math.sin(a * 2.1) * FLOATPLANE.bob,
    z: FLOATPLANE.z + Math.sin(a) * FLOATPLANE.r * FLOATPLANE.squash,
    ry: -a - Math.PI / 2 + 0.3,
  };
}
