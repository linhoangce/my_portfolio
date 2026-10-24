/**
 * The delivery drones of 2100: a network from the drone ports (the rail yard's, on its shed's roof: railYard.ts; the
 * Skyport's drone deck: vertiports.ts) to the rooftop pads on the city's buildings (the biodomes': city.ts pads), and,
 * where a port has fewer than six of those within 260, to the vertiports' drone docks and the Waterfront hub's roof
 * gardens (airspace.ts makes the flights):
 * - its corridors over rail land and the arterials, never along the Expo: the waterfront rail (6 seaward of the West
 *   Coast Express's line), Main Street, East Broadway west of Commercial and Victoria Drive;
 * - each port's drones in two streams along them, out and back, each stream its own level in the drones' layer
 *   (28–40) and kept to the right; over every roof by 6 and over the Expo by 25, a stream raised keeps its place in the
 *   stack;
 * - a trip: off the dock 8 straight up, along the corridors to the point nearest the drop, a straight hop there over the
 *   roofs, down onto the pad, 4 s to set the parcel down, back up, back the same way, down onto the dock and a charge;
 *   as many trips as fit the network's drone cycle (a divisor of the taxis' period), each to the next drop in turn;
 * - each drone's offset round the cycle chosen so that it joins and leaves its streams at least 2 s from any other
 *   drone of them (so none comes within 3 of another along them), no pad or dock is ever held by two, and no taxi
 *   comes within 6.
 * Where each drone is is a function of the time alone.
 */
import { airspaceFor, chunks, closest, type Flight, fly, holds, type Make, offsetLine, type Pose, round, type Round, roundPose, RUN, smoothLine, track, type Track } from "./airspace";
import { airTaxis, DIVISORS, DRONE_KIND, nearPort, separation } from "./airways";
import { skyportAt } from "./buildings/heroes";
import { getCityData } from "./cityData";
import { droneDocks, wceAt } from "./railYard";
import { HARBOUR_DOCKS, LONSDALE_DOCKS, type Spot } from "./vertiports";
import { hubDrops } from "./waterfrontHub";
import { WCE_LEN } from "./wce";

/** The drones' make: 6 clear of every roof, 4 units a second (about 130 km/h) along the corridors. */
const DRONE: Omit<Make, "level"> = { clear: 6, grade: 0.6, cruise: 4, vert: 2, acc: 1.5, turn: 2.5, bank: 0.3, step: 2 };
/** The drones' layer's floor, and each port's two streams' levels in it (out, back). */
const LAYER = 28.5;
const STREAMS: [number, number][] = [
  [28.5, 32],
  [35.5, 39],
];
/** How far right of the corridor a stream keeps. */
const SIDE = 2;
/** Set down at the drop, the least charge at the dock between trips, the gap a pad or dock keeps between two drones' turns, the gap between two drones joining or leaving a stream. */
const DROP = 4;
const CHARGE = 8;
const GAP = 3;
const SPACING = 1.5;
/** Drone to drone (a little over 3). */
const APART = separation(DRONE_KIND, DRONE_KIND, 0, 0);

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

/**
 * The drones placed so far, all on one cycle: whether a new one at offset o would come within 3 of any of them, their
 * tracks compared second by second at the offset between them, a run of 16 seconds at a time where their bounds come
 * that close.
 */
class Swarm {
  private list: { tr: Track; o: number }[] = [];
  constructor(private c: number) {}

  clash(tr: Track, o: number): boolean {
    const c = this.c;
    const A = chunks(tr);
    for (const p of this.list) {
      const B = chunks(p.tr);
      const d = (((p.o - o) % c) + c) % c;
      const b = p.tr;
      for (let i = 0; i < A.n; i++) {
        const u0 = i * RUN;
        const u1 = Math.min(c, u0 + RUN);
        let near = false;
        for (const k of [Math.floor(((u0 + d) % c) / RUN), Math.floor(((u1 + d) % c) / RUN)]) {
          if (A.x0[i] - APART > B.x1[k] || B.x0[k] - APART > A.x1[i] || A.z0[i] - APART > B.z1[k] || B.z0[k] - APART > A.z1[i] || A.y0[i] - APART > B.y1[k] || B.y0[k] - APART > A.y1[i]) continue;
          near = true;
          break;
        }
        if (!near) continue;
        for (let u = u0; u < u1; u++) {
          const ua = (u + 1) % c;
          const w = (u + d) % c;
          const wb = (w + 1) % c;
          if (closest(tr.x[u], tr.y[u], tr.z[u], tr.x[ua], tr.y[ua], tr.z[ua], b.x[w], b.y[w], b.z[w], b.x[wb], b.y[wb], b.z[wb]) < APART) return true;
        }
      }
    }
    return false;
  }

  place(tr: Track, o: number): void {
    this.list.push({ tr, o });
  }
}

/** Seconds round the cycle taken by something (a stream's joins and leaves, a spot's holds). */
class Booked {
  private map = new Map<string, Uint8Array>();
  constructor(private c: number) {}
  private of(k: string): Uint8Array {
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = new Uint8Array(this.c)));
    return a;
  }
  /** Whether any second from a to b (round time, at offset o) is taken. */
  taken(k: string, a: number, b: number, o: number): boolean {
    const m = this.map.get(k);
    if (!m) return false;
    for (let s = Math.floor(a); s <= Math.ceil(b); s++) if (m[(((s - o) % this.c) + this.c) % this.c]) return true;
    return false;
  }
  take(k: string, a: number, b: number, o: number): void {
    const m = this.of(k);
    for (let s = Math.floor(a); s <= Math.ceil(b); s++) m[(((s - o) % this.c) + this.c) % this.c] = 1;
  }
}

/**
 * The trips (by drop) that fill `room` seconds best, each taking dur(k): the most time used, then the fewest repeats,
 * by whole seconds (a knapsack); in an order that spreads them, from the drop after `from`.
 */
function fill(room: number, dur: (k: number) => number, n: number, from: number): number[] {
  const R = Math.max(0, Math.floor(room));
  const best = new Float64Array(R + 1).fill(-1);
  const pick = new Int32Array(R + 1).fill(-1);
  best[0] = 0;
  const d = Array.from({ length: n }, (_, k) => Math.ceil(dur(k)));
  for (let s = 1; s <= R; s++) {
    for (let q = 0; q < n; q++) {
      const k = (from + 1 + q) % n;
      if (d[k] <= s && best[s - d[k]] >= 0 && best[s - d[k]] + d[k] > best[s]) {
        best[s] = best[s - d[k]] + d[k];
        pick[s] = k;
      }
    }
  }
  let s = 0;
  for (let q = R; q >= 0; q--) if (best[q] > best[s]) s = q;
  const out: number[] = [];
  while (s > 0 && pick[s] >= 0) {
    out.push(pick[s]);
    s -= d[pick[s]];
  }
  return out.sort((a, b) => ((a - from + n) % n) - ((b - from + n) % n));
}

/** A drone port: its docks, where it meets the corridors, and its drops. */
type Port = { name: string; docks: Spot[]; gate: number; dests: Spot[] };
const spotKey = (s: Spot) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`;
export type Drone = Pose & { port: number; r: Round; o: number; c: number; shown: boolean };
export type DroneNet = { cycle: number; drones: Drone[]; ports: { name: string; docks: number; dests: number; drones: number; trips: number }[]; report: string[] };

const built = new Map<boolean, DroneNet>();

/** The delivery drones for a budget (full: 60, lite: 24), shared between the ports by their docks. */
export function deliveryDrones(lowEnd: boolean): DroneNet {
  const known = built.get(lowEnd);
  if (known) return known;
  const air = airspaceFor(lowEnd);
  const taxis = airTaxis(lowEnd);
  const near = nearPort(lowEnd);
  const g = corridors();
  const nearestPt = (x: number, z: number) => g.pts.reduce((b, q, i) => (Math.hypot(q[0] - x, q[1] - z) < Math.hypot(g.pts[b][0] - x, g.pts[b][1] - z) ? i : b), 0);
  const pads = getCityData(lowEnd).pads.filter((p) => !p.parked);
  const sky = skyportAt(lowEnd).docks;
  const ports: Port[] = [
    { name: "rail yard", docks: droneDocks(), gate: 0, dests: [] },
    { name: "Skyport", docks: sky, gate: 0, dests: [] },
  ];
  for (const p of ports) {
    const cx = p.docks.reduce((s, d) => s + d.x, 0) / Math.max(1, p.docks.length);
    const cz = p.docks.reduce((s, d) => s + d.z, 0) / Math.max(1, p.docks.length);
    p.gate = nearestPt(cx, cz);
    p.dests = pads.filter((q) => Math.hypot(q.x - cx, q.z - cz) < 260);
    // too few rooftop pads near: the vertiports' docks (the Skyport's, for the yard's drones) and the hub's roof gardens
    if (p.dests.length < 6) p.dests.push(...HARBOUR_DOCKS, ...LONSDALE_DOCKS, ...(p.docks === sky ? [] : sky), ...hubDrops());
  }
  // each port's way to each of its drops: along the corridors to the point that makes the way shortest, the hop over
  // the city counted dear
  const reach = ports.map((port) => {
    const { dist, prev } = ways(g, port.gate);
    return port.dests.map((d) => {
      let best = port.gate;
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
    });
  });
  // a trip from a dock to a drop and back in the port's two streams: its flights, its time from leaving the dock to
  // landing back, when it holds the drop (from its descent onto it to its climb off it), when it has left the dock's
  // airspace and when it is back in it, and where it is each second of it (its track, off the map when it is not)
  type Trip = { out: Flight; back: Flight; dur: number; drop: [number, number]; up: number; down: number; tr: Track; dock: string; at: string };
  const trips = new Map<string, Trip>();
  let c = 0;
  const trip = (pi: number, di: number, k: number): Trip => {
    const key = `${pi}:${di}:${k}`;
    let t = trips.get(key);
    if (t) return t;
    const dock = ports[pi].docks[di];
    const lane = reach[pi][k];
    const dest = ports[pi].dests[k];
    const [lo, hi] = STREAMS[pi];
    const outVia = lane.length > 1 ? offsetLine(lane, SIDE) : lane;
    const backVia = lane.length > 1 ? offsetLine([...lane].reverse(), SIDE) : lane;
    const out = fly({ ...dock, lift: 8 }, outVia, { ...dest, lift: 6 }, { ...DRONE, level: lo, above: lo - LAYER }, air);
    const back = fly({ ...dest, lift: 6 }, backVia, { ...dock, lift: 8 }, { ...DRONE, level: hi, above: hi - LAYER }, air);
    const dur = out.dur + DROP + back.dur;
    t = { out, back, dur, drop: [out.down, out.dur + DROP + back.up], up: out.up, down: out.dur + DROP + back.down, tr: { c: 0, x: new Float32Array(0), y: new Float32Array(0), z: new Float32Array(0), spot: new Uint8Array(0) }, dock: spotKey(dock), at: spotKey(dest) };
    trips.set(key, t);
    return t;
  };
  /** A trip's track round the cycle, from leaving its dock (second 0) to landing back. */
  const tripTrack = (t: Trip): Track => {
    if (t.tr.c === c) return t.tr;
    const parts: Parameters<typeof round>[1] = [t.out, { stay: DROP, ...{ x: t.out.p[(t.out.n - 1) * 3], y: t.out.p[(t.out.n - 1) * 3 + 1], z: t.out.p[(t.out.n - 1) * 3 + 2] } }, t.back, { stay: c - t.dur, hidden: true }];
    t.tr = track(round(c, parts), near);
    return t.tr;
  };
  // the drone cycle: the longest single trip from either port and a charge fit it with room over
  let longest = 0;
  ports.forEach((p, pi) => p.dests.forEach((_, k) => (longest = Math.max(longest, trip(pi, 0, k).dur + CHARGE))));
  c = DIVISORS.find((v) => v >= longest * 1.15) ?? DIVISORS[DIVISORS.length - 1];
  const booked = new Booked(c);
  const swarm = new Swarm(c);
  const report: string[] = [];
  const total = lowEnd ? 24 : 60;
  const dockCount = ports.reduce((s, p) => s + p.docks.length, 0);
  const drones: Drone[] = [];
  const counts: number[] = [];
  /** Whether a trip leaving at time d (on the scene's clock, round the cycle) keeps clear of everything placed. */
  const why = [0, 0, 0, 0, 0];
  const clear = (t: Trip, d: number) => {
    const o = (((-d) % c) + c) % c;
    if (booked.taken(t.at, d + t.drop[0] - GAP, d + t.drop[1] + GAP, 0)) {
      why[0]++;
      return false;
    }
    const tr = tripTrack(t);
    if (swarm.clash(tr, o)) {
      why[1]++;
      return false;
    }
    if (taxis.timetable.count(tr, o, DRONE_KIND)) {
      why[2]++;
      return false;
    }
    return true;
  };
  ports.forEach((port, pi) => {
    const n = pi === ports.length - 1 ? total - drones.length : Math.round((total * port.docks.length) / dockCount);
    const nd = port.dests.length;
    for (let j = 0; j < n; j++) {
      const di = j % port.docks.length;
      // its first drop in turn, then the next ones round the list that still fit the cycle, each once, leaving some
      // room to wait for a clear slot
      const first = (j * 7) % nd;
      const picks: number[] = [];
      let used = 0;
      for (let q = 0; q < nd; q++) {
        const k = (first + q * 5) % nd;
        const need = trip(pi, di, k).dur + CHARGE;
        if (picks.includes(k) || used + need > c * 0.85) continue;
        picks.push(k);
        used += need;
      }
      const plan = picks.map((k) => trip(pi, di, k));
      const dockKey = plan[0].dock;
      let times: number[] | null = null;
      // the first trip's start tried round the cycle; each next trip as soon after the last as it is clear, its dock
      // held from the last one's descent onto it to its own climb off it; the last's return clear of the first's leaving
      const o0 = Math.round(((j * 0.618034 + pi * 0.31) % 1) * c);
      for (let q = 0; q < c && !times; q += 2) {
        const d1 = o0 + q;
        if (!clear(plan[0], d1)) continue;
        const ts = [d1];
        let ok = true;
        for (let i = 1; i < plan.length && ok; i++) {
          const prev = ts[i - 1] + plan[i - 1].dur;
          const last = d1 + c - plan.slice(i).reduce((s, t) => s + t.dur + CHARGE, 0);
          let found = -1;
          for (let d = Math.ceil(prev + CHARGE); d <= last && found < 0; d++) {
            if (booked.taken(dockKey, ts[i - 1] + plan[i - 1].down - GAP, d + plan[i].up + GAP, 0)) {
              why[3]++;
              break;
            }
            if (clear(plan[i], d)) found = d;
          }
          if (found < 0) ok = false;
          else ts.push(found);
        }
        if (!ok) continue;
        const k = plan.length - 1;
        if (booked.taken(dockKey, ts[k] + plan[k].down - GAP, d1 + c + plan[0].up + GAP, 0)) {
          why[4]++;
          continue;
        }
        times = ts;
      }
      if (!times) {
        report.push(`${port.name} drone ${j}: no clear slot ${why.join("/")} plan ${plan.map((t) => `${t.at}:${t.dur.toFixed(0)}`).join(" ")}; left out`);
        why.fill(0);
        continue;
      }
      why.fill(0);
      // placed: its trips' tracks and holds taken, its round laid out from the charge before its first trip
      const ts = times;
      plan.forEach((t, i) => {
        swarm.place(tripTrack(t), (((-ts[i]) % c) + c) % c);
        booked.take(t.at, ts[i] + t.drop[0], ts[i] + t.drop[1], 0);
        const next = i + 1 < plan.length ? ts[i + 1] + plan[i + 1].up : ts[0] + c + plan[0].up;
        booked.take(dockKey, ts[i] + t.down, next, 0);
      });
      const end = ts[ts.length - 1] + plan[plan.length - 1].dur;
      const parts: Parameters<typeof round>[1] = [];
      plan.forEach((t, i) => {
        const wait = i === 0 ? ts[0] + c - end : ts[i] - (ts[i - 1] + plan[i - 1].dur);
        parts.push({ stay: wait, ...port.docks[di] }, t.out, { stay: DROP, x: t.out.p[(t.out.n - 1) * 3], y: t.out.p[(t.out.n - 1) * 3 + 1], z: t.out.p[(t.out.n - 1) * 3 + 2] }, t.back);
      });
      // round time 0 is its landing from its last trip, at end − c on the scene's clock
      drones.push({ port: pi, r: round(c, parts), o: (((c - end) % c) + c) % c, c, shown: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vh: 0, dbg: plan.map((t, i) => ({ d: ts[i], tr: tripTrack(t) })) } as Drone);
      counts.push(plan.length);
    }
  });
  const net: DroneNet = {
    cycle: c,
    drones,
    ports: ports.map((p, pi) => ({ name: p.name, docks: p.docks.length, dests: p.dests.length, drones: drones.filter((d) => d.port === pi).length, trips: drones.reduce((s, d, i) => s + (d.port === pi ? counts[i] : 0), 0) })),
    report,
  };
  built.set(lowEnd, net);
  return net;
}

/** Pose every drone at time t (seconds on the scene's clock). */
export function flyDrones(net: DroneNet, t: number): void {
  for (const d of net.drones) {
    const tau = (((t + d.o) % d.c) + d.c) % d.c;
    d.shown = roundPose(d.r, tau, d);
  }
}
