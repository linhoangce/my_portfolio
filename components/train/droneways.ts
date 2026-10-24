/**
 * The delivery drones of 2100: a network from the drone ports (the rail yard's, on its shed's roof: railYard.ts; the
 * Skyport's drone deck: vertiports.ts) to the rooftop pads on the city's buildings (the biodomes': city.ts pads), and,
 * where a port has fewer than six of those within 260, to the vertiports' drone docks and the Waterfront hub's roof
 * gardens (airspace.ts makes the flights):
 * - its corridors over rail land and the arterials, never along the Expo: the waterfront rail (6 seaward of the West
 *   Coast Express's line), Main Street, East Broadway west of Commercial and Victoria Drive;
 * - routes, each from one of a port's docks to one drop: a trip off the dock 8 straight up, along the corridors to the
 *   point nearest the drop, a straight hop there over the roofs, straight down onto the pad, 4 s to set the parcel
 *   down, back up, back the same way, down onto the dock and a charge (8 s, longer on a port's shorter routes, so all
 *   its routes keep one cycle);
 * - each route its own lane, a lateral offset right of travel and a level in the drones' layer (28–40, back 3 over
 *   out), raised over every roof by 6 and over the Expo by 25 (a raised lane keeps its place in the stack), so no two
 *   routes' streams overlap; its drones spaced evenly round its cycle, as many as leave its dock and its drop clear
 *   between them, the port's routes staggered between each other.
 * Where each drone is is a function of the time alone.
 */
import { airspaceFor, type Flight, fly, type Make, offsetLine, type Pose, round, type Round, roundPose, smoothLine } from "./airspace";
import { skyportAt } from "./buildings/heroes";
import { getCityData } from "./cityData";
import { droneDocks, wceAt } from "./railYard";
import { HARBOUR_DOCKS, LONSDALE_DOCKS, type Spot } from "./vertiports";
import { hubDrops } from "./waterfrontHub";
import { WCE_LEN } from "./wce";

/** The drones' make: 6 clear of every roof, 4 units a second (about 130 km/h) along the corridors. */
const DRONE: Omit<Make, "level"> = { clear: 6, grade: 0.6, cruise: 4, vert: 2, acc: 1.5, turn: 2.5, bank: 0.3, step: 2 };
/** The drones' layer's floor; set down at the drop, the charge at the dock. */
const LAYER = 28;
const DROP = 4;
const CHARGE = 8;
/** The time a dock or a drop keeps between one drone's leaving it and the next's coming down onto it. */
const GAP = 12;

/** Main Street from the waterfront to Broadway, East Broadway west from Commercial, Victoria Drive from Broadway to the port. */
const MAIN: [number, number][] = [
  [99, 10],
  [100, 40],
  [99, 106],
  [99, 136],
  [97, 165],
  [93, 190],
  [91, 220],
  [91, 255],
  [90, 285],
];
const BROADWAY: [number, number][] = [
  [90, 285],
  [138, 289],
  [216, 290],
  [269, 290],
  [325, 292],
  [370, 292],
];
const VICTORIA: [number, number][] = [
  [370, 292],
  [371, 247],
  [371, 172],
  [372, 108],
  [372, 61],
  [373, 17],
  [374, -24],
];

/** The corridors as one graph of points about 6 apart: each corridor's run, joined where corridors meet. */
type Graph = { pts: [number, number][]; next: number[][] };
function corridors(): Graph {
  const water: [number, number][] = [];
  for (let s = 0; s <= WCE_LEN; s += 6) {
    const p = wceAt(s);
    water.push([p.x + p.nx * 6, p.z + p.nz * 6]);
  }
  const pts: [number, number][] = [];
  const next: number[][] = [];
  const runs = [water, MAIN, BROADWAY, VICTORIA].map((line) => {
    const ids = smoothLine(line, 1, 6).map((q) => {
      pts.push(q);
      next.push([]);
      return pts.length - 1;
    });
    for (let i = 1; i < ids.length; i++) {
      next[ids[i - 1]].push(ids[i]);
      next[ids[i]].push(ids[i - 1]);
    }
    return ids;
  });
  // each run's ends to the nearest point of any other run, where they meet
  for (const ids of runs) {
    for (const e of [ids[0], ids[ids.length - 1]]) {
      let best = -1;
      let bd = 16;
      pts.forEach((q, i) => {
        if (ids.includes(i)) return;
        const d = Math.hypot(q[0] - pts[e][0], q[1] - pts[e][1]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) {
        next[e].push(best);
        next[best].push(e);
      }
    }
  }
  return { pts, next };
}

/** The shortest ways over the graph from point `from`: each point's distance and the point before it. */
function ways(g: Graph, from: number): { dist: Float64Array; prev: Int32Array } {
  const n = g.pts.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const v of g.next[u]) {
      const d = dist[u] + Math.hypot(g.pts[v][0] - g.pts[u][0], g.pts[v][1] - g.pts[u][1]);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  return { dist, prev };
}

/** A route: its port, its dock and drop, how many drones fly it. */
type RouteDef = { port: number; dock: Spot; drop: Spot; n: number };
/** A route as flown: its cycle, its round, its drones' offsets. */
export type Route = { port: number; c: number; round: Round; offsets: number[] };
export type Drone = Pose & { route: number; j: number; shown: boolean };
export type DroneNet = { routes: Route[]; drones: Drone[]; ports: { name: string; docks: number; dests: number; drones: number }[] };

/**
 * Drones per route (full, lite): the yard's five routes are short and their docks and drops turn two round; the
 * Skyport's two to Lonsdale are long; its last, to the yard, shares the yard's end with the yard's own.
 */
const PER_ROUTE: [number, number][] = [
  [2, 2],
  [2, 2],
  [2, 2],
  [2, 2],
  [2, 2],
  [7, 6],
  [7, 6],
  [2, 2],
];
/**
 * The docks the routes keep: every other one at the yard (the last left for the Skyport's drones to bring parcels to),
 * so that no two routes' drones climb off side by side; the Skyport's back row, away from its taxi pads.
 */
const ROUTE_DOCKS = [
  [0, 2, 4, 6, 8],
  [1, 3, 5],
];
/**
 * Each route's lane: its level out (back 3 over it) and its offset right of travel. The yard's drones fly west from
 * it, the Skyport's north of it and east of the yard (each of its routes a level of its own), so no two streams
 * overlap, and no two routes to one cluster of drops (the Harbour docks, the hub's roofs, Lonsdale's) share a level
 * going the same way.
 */
const LANES: [number, number][] = [
  [28, 2],
  [28, 5],
  [31, 2],
  [31, 5],
  [34, 5],
  [28, 2],
  [31, 2],
  [34, 2],
];
/**
 * The Skyport's drones leave its deck to the south (each from its dock, over no other) and the east, and go north a
 * block before they turn onto Victoria Drive, clear of the taxis coming down onto its pads over the drive.
 */
const skyGate = (dock: Spot): [number, number][] => [
  [dock.x, dock.z + 6],
  [393, dock.z + 6],
  [393, 252],
  [372, 247],
];

const built = new Map<boolean, DroneNet>();

/**
 * The delivery drones for a budget: lite 24; full 26, as many as the routes' docks and drops (the busy few the city
 * has) turn round while every check holds.
 */
export function deliveryDrones(lowEnd: boolean): DroneNet {
  const known = built.get(lowEnd);
  if (known) return known;
  const air = airspaceFor(lowEnd);
  const g = corridors();
  const nearestPt = (x: number, z: number) => g.pts.reduce((b, q, i) => (Math.hypot(q[0] - x, q[1] - z) < Math.hypot(g.pts[b][0] - x, g.pts[b][1] - z) ? i : b), 0);
  const yard = droneDocks();
  const sky = skyportAt(lowEnd).docks;
  const pads = getCityData(lowEnd).pads.filter((p) => !p.parked);
  // each port's drops: the free rooftop pads within 260 of it; too few, and the vertiports' docks and the hub's roof
  // gardens, shared out between the ports
  const hub = hubDrops();
  const H = HARBOUR_DOCKS;
  const L = LONSDALE_DOCKS;
  // the yard's to the Harbour docks (its south row, so that neither approach passes over the other's) and the hub's
  // roofs; the Skyport's to Lonsdale's docks (their near row) and to the yard's last dock
  const fallback = [H[2], H[5], hub[0], hub[2], hub[4], L[1], L[3], yard[yard.length - 1]];
  const near = (docks: Spot[]) => {
    const cx = docks.reduce((s, d) => s + d.x, 0) / docks.length;
    const cz = docks.reduce((s, d) => s + d.z, 0) / docks.length;
    return pads.filter((q) => Math.hypot(q.x - cx, q.z - cz) < 260);
  };
  const portDocks = [yard, sky];
  const defs: RouteDef[] = [];
  portDocks.forEach((docks, pi) => {
    const own = near(docks);
    ROUTE_DOCKS[pi].forEach((di, r) => {
      const at = defs.length;
      const drop = own.length >= 6 ? own[r % own.length] : fallback[at % fallback.length];
      if (drop && docks[di]) defs.push({ port: pi, dock: docks[di], drop, n: PER_ROUTE[at][lowEnd ? 1 : 0] });
    });
  });
  const gates = [nearestPt(yard.reduce((s, q) => s + q.x, 0) / yard.length, yard.reduce((s, q) => s + q.z, 0) / yard.length), nearestPt(372, 247)];
  const tree = gates.map((gate) => ways(g, gate));
  // the way from a port to a drop: along the corridors to the point that makes it shortest, the hop over the city counted dear
  const wayTo = (pi: number, d: Spot): [number, number][] => {
    const { dist, prev } = tree[pi];
    let best = gates[pi];
    let cost = Infinity;
    g.pts.forEach((q, i) => {
      const c = dist[i] + 1.6 * Math.hypot(q[0] - d.x, q[1] - d.z);
      if (c < cost) {
        cost = c;
        best = i;
      }
    });
    const path: [number, number][] = [];
    for (let v = best; v >= 0; v = prev[v]) path.unshift(g.pts[v]);
    return path;
  };
  const legs = defs.map((def, r): [Flight, Flight] => {
    // its lane: its level and side; back 3 over its way out, so its drones pass each other a level apart on the hops
    const [level, side] = LANES[r % LANES.length];
    // the whole way kept to its side, from the dock (and the Skyport's way round its pads) to over the drop, the hop
    // too; straight down onto the drop and straight up off it
    const way: [number, number][] = [[def.dock.x, def.dock.z], ...(def.port === 1 ? skyGate(def.dock) : []), ...wayTo(def.port, def.drop), [def.drop.x, def.drop.z]];
    const outVia = offsetLine(way, side).slice(1, -1);
    const backVia = offsetLine([...way].reverse(), side).slice(1, -1);
    return [
      fly({ ...def.dock, lift: 8 }, outVia, { ...def.drop, lift: 0, full: true }, { ...DRONE, level, above: level - LAYER }, air),
      fly({ ...def.drop, lift: 0, full: true }, backVia, { ...def.dock, lift: 8 }, { ...DRONE, level: level + 3, above: level + 3 - LAYER }, air),
    ];
  });
  // each port's one cycle: its longest trip and its stops, in whole seconds (the shorter trips charge longer); its
  // drones evenly round it, the routes' turns interleaved
  const cycles = [0, 1].map((pi) => Math.ceil(Math.max(0, ...legs.filter((_, r) => defs[r].port === pi).map(([o, b]) => o.dur + b.dur + DROP + CHARGE))));
  const routes: Route[] = defs.map((def, r) => {
    const [o, b] = legs[r];
    const c = cycles[def.port];
    // as many drones as leave the dock and the drop clear for a while before the next comes down onto them
    const held = Math.max(c - (o.dur - o.up) - DROP - b.down, o.dur - o.down + DROP + b.up);
    const n = Math.max(1, Math.min(def.n, Math.floor(c / (held + GAP))));
    return { port: def.port, c, round: round(c, [{ stay: c - o.dur - b.dur - DROP, ...def.dock }, o, { stay: DROP, ...def.drop }, b]), offsets: new Array<number>(n).fill(0) };
  });
  for (const pi of [0, 1]) {
    // each route's drones evenly round the cycle, the port's routes staggered between them
    const mine = routes.filter((rt) => rt.port === pi);
    const most = Math.max(1, ...mine.map((rt) => rt.offsets.length));
    mine.forEach((rt, i) => rt.offsets.forEach((_, j) => (rt.offsets[j] = (i * cycles[pi]) / (mine.length * most) + (j * cycles[pi]) / rt.offsets.length)));
  }
  const drones: Drone[] = [];
  routes.forEach((rt, r) => rt.offsets.forEach((_, j) => drones.push({ route: r, j, shown: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vh: 0 })));
  const net: DroneNet = {
    routes,
    drones,
    ports: ["rail yard", "Skyport"].map((name, pi) => ({ name, docks: portDocks[pi].length, dests: defs.filter((d) => d.port === pi).length, drones: drones.filter((d) => routes[d.route].port === pi).length })),
  };
  built.set(lowEnd, net);
  return net;
}

/** Pose every drone at time t (seconds on the scene's clock). */
export function flyDrones(net: DroneNet, t: number): void {
  for (const d of net.drones) {
    const rt = net.routes[d.route];
    const tau = (((t + rt.offsets[d.j]) % rt.c) + rt.c) % rt.c;
    d.shown = roundPose(rt.round, tau, d);
  }
}
