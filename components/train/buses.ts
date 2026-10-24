/**
 * The buses' routes and stops (traffic.ts drives them, Life.tsx draws them, BusStops.tsx builds the stops). Each route
 * follows a real corridor near the line (the 99 B-Line on Broadway, the 19 on Kingsway, the 20 on Commercial and
 * Victoria and others), found as the quickest way over the drivable streets between waypoints on them, out and back
 * as one loop. A route stops at every station it passes, on the kerb of the street nearest the station (at
 * Waterfront, Commercial–Broadway, Joyce and Patterson an exchange: a long canopy over the bays), and every ~60 units
 * between. Pure apart from the network.
 */
import { stations } from "@/data";

import { junction, pointAt, type REdge, roadDist, roads } from "./roadNetwork";
import { STATION_XZ } from "./track";

export type BusRoute = {
  /** Its number and corridor, for the stops' boards and the buses' signs. */
  name: string;
  /** The loop: each step an edge and the way along it. */
  path: [number, 1 | -1][];
  /** For each step, where it stops along the edge (distance in the way of travel), in order. */
  stops: number[][];
  len: number;
};
/** A stop: where, facing, its route and station; at a station a bus bay under a canopy (its length) where one fits. */
export type BusStop = { x: number; z: number; ry: number; route: string; station: number | null; exchange: boolean; len: number };
/** A station's stop on a route that passes within this distance of it. */
const STATION_REACH = 60;
/** Stops between stations, about this far apart along a route. */
const SPACING = 62;

type Spec = { name: string; via: [string | null, number, number][] };
const SPECS: Spec[] = [
  { name: "99 B-Line · Broadway", via: [["East Broadway", 220, 290], ["East Broadway", 344, 292], ["East Broadway", 600, 295]] },
  { name: "20 Commercial–Victoria", via: [["Commercial Drive", 340, 90], ["Commercial Drive", 325, 292], ["Victoria Drive", 377, 461]] },
  { name: "3 Main", via: [["Georgia Viaduct", 60, 110], ["Main Street", 99, 106], ["Main Street", 98, 135]] },
  { name: "22 Terminal", via: [["Terminal Avenue", 98, 164], ["Terminal Avenue", 221, 192]] },
  { name: "7 Nanaimo", via: [["Nanaimo Street", 444, 230], ["Nanaimo Street", 444, 414]] },
  { name: "26 29th Avenue", via: [["Euclid Avenue", 511, 537], [null, 572, 509], ["Joyce Street", 640, 589]] },
  { name: "16 Nanaimo Station", via: [["Penticton Street", 479, 462], ["Slocan Street", 500, 447]] },
  { name: "41 Joyce", via: [["Joyce Street", 600, 576], ["Boundary Road", 708, 700]] },
  { name: "19 Kingsway", via: [["Kingsway", 481, 576], ["Kingsway", 774, 652]] },
  { name: "49 Patterson", via: [["Patterson Avenue", 791, 560], ["Patterson Avenue", 788, 650]] },
  { name: "130 Metrotown", via: [["Beresford Street", 799, 697], ["Beresford Street", 1000, 815]] },
  { name: "R4 Downtown", via: [[null, 4, 42], [null, -62, 14], [null, -31, 50], ["Dunsmuir Street", 18, 83]] },
];

/** An edge a bus may drive: every stretch of it drawn (as traffic.ts canDrive). */
const drivable = (e: REdge) => e.len > 0.2 && e.shown.every((v) => v === 1);

/**
 * The quickest way from node a to node b over the drivable streets, as steps, or null: a route keeps to its corridor's
 * streets (the others cost several times their length, the smaller the more), and takes a one-way street against its
 * way only where nothing else will do.
 */
function route(a: number, b: number, corridor: Set<string>): [number, 1 | -1][] | null {
  const { nodes, edges } = roads();
  const cost = (e: REdge, dir: 1 | -1) =>
    e.len * (corridor.has(e.name) ? 1 : e.cls <= 1 ? 2.5 : e.cls === 2 ? 4 : 7) * (e.oneway === 0 || e.oneway === dir ? 1 : 12);
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const back = new Int32Array(nodes.length).fill(-1);
  const backDir = new Int8Array(nodes.length);
  dist[a] = 0;
  // a binary heap of [distance, node]
  const heap: [number, number][] = [[0, a]];
  const push = (d: number, n: number) => {
    heap.push([d, n]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [du, u] = pop();
    if (du > dist[u]) continue;
    if (u === b) break;
    for (const k of nodes[u].edges) {
      const e = edges[k];
      if (!drivable(e)) continue;
      const dir: 1 | -1 = e.a === u ? 1 : -1;
      const v = dir > 0 ? e.b : e.a;
      const dv = du + cost(e, dir);
      if (dv < dist[v]) {
        dist[v] = dv;
        back[v] = k;
        backDir[v] = dir;
        push(dv, v);
      }
    }
  }
  if (a !== b && back[b] < 0) return null;
  const steps: [number, 1 | -1][] = [];
  for (let v = b; v !== a; ) {
    const k = back[v];
    const dir = backDir[v] as 1 | -1;
    steps.unshift([k, dir]);
    v = dir > 0 ? edges[k].a : edges[k].b;
  }
  return steps;
}

/** The node nearest (x, z) on a drivable edge of that name (any name if null). */
function nodeNear(name: string | null, x: number, z: number): number {
  const { nodes, edges } = roads();
  let best = -1;
  let bd = Infinity;
  nodes.forEach((nd, i) => {
    if (!nd.edges.some((k) => drivable(edges[k]) && (name === null || edges[k].name === name))) return;
    const d = (nd.x - x) ** 2 + (nd.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Where a stop may stand on a step: clear of the junction box at each end and its crosswalk. */
function stopRange(k: number, dir: 1 | -1): [number, number] {
  const e = roads().edges[k];
  const sb = (node: number) => junction(node)?.setback.get(k) ?? 0;
  const enter = dir > 0 ? e.a : e.b;
  const leave = dir > 0 ? e.b : e.a;
  return [sb(enter) + 3, e.len - sb(leave) - 5];
}

/** A point of a step at distance t along it in its way of travel: x, z and the heading. */
function along(k: number, dir: 1 | -1, t: number): [number, number, number, number] {
  const e = roads().edges[k];
  const s = dir > 0 ? t : e.len - t;
  const [x, z] = pointAt(e, s);
  const [x1, z1] = pointAt(e, Math.min(e.len, s + 0.5));
  const [x0, z0] = pointAt(e, Math.max(0, s - 0.5));
  const L = Math.hypot(x1 - x0, z1 - z0) || 1;
  return [x, z, ((x1 - x0) / L) * dir, ((z1 - z0) / L) * dir];
}

let built: { routes: BusRoute[]; stops: BusStop[] } | null = null;

/** The routes and their stops, built on first use. */
export function busNetwork(): { routes: BusRoute[]; stops: BusStop[] } {
  if (built) return built;
  const { edges } = roads();
  const routes: BusRoute[] = [];
  const stops: BusStop[] = [];
  for (const spec of SPECS) {
    const ids = spec.via.map(([name, x, z]) => nodeNear(name, x, z));
    if (ids.some((i) => i < 0)) continue;
    const path: [number, 1 | -1][] = [];
    let ok = true;
    // out through the waypoints, and back the same way (one-way streets permitting)
    const legs = [...ids.slice(1).map((b, i) => [ids[i], b]), ...ids.slice(0, -1).map((_, i) => [ids[ids.length - 1 - i], ids[ids.length - 2 - i]])];
    const corridor = new Set(spec.via.map(([name]) => name).filter((n): n is string => !!n));
    for (const [a, b] of legs) {
      const r = route(a, b, corridor);
      if (!r) {
        ok = false;
        break;
      }
      path.push(...r);
    }
    if (!ok || path.length < 2) continue;
    const r: BusRoute = { name: spec.name, path, stops: path.map(() => []), len: path.reduce((s, [k]) => s + edges[k].len, 0) };
    // where a stop's shelter goes at distance t along step pi: set back from the kerb, as long as fits (null: none does)
    const spot = (pi: number, t: number, station: number | null) => {
      const [k, dir] = path[pi];
      const e = edges[k];
      const [x, z, hx, hz] = along(k, dir, t);
      // the shelter on the kerb's far side, right of travel (-h.z, h.x), its open front to the road; set back until its
      // whole footprint is clear of every road (an exchange's long canopy that cannot be gets a plain shelter)
      const fits = (off: number, L: number) => {
        for (let u = -L / 2; u <= L / 2 + 1e-6; u += 0.8) {
          for (const w of [-0.7, 0.7]) {
            const px = x + hx * u - hz * (off - w);
            const pz = z + hz * u + hx * (off - w);
            if (roadDist(px, pz) < 0.15) return false;
          }
        }
        return true;
      };
      // every station's stop is a bus bay: the long canopy, or a shorter one where the streets are tight
      let off = -1;
      let len = 2.6;
      for (const L of station !== null ? [8.6, 5.4, 2.6] : [2.6]) {
        for (let o = e.half + 0.8; o <= e.half + (L > 3 ? 5 : 3); o += 0.5) {
          if (fits(o, L)) {
            off = o;
            break;
          }
        }
        len = L;
        if (off >= 0) break;
      }
      if (off < 0) return { x: x - hz * (e.half + 0.8), z: z + hx * (e.half + 0.8), ry: Math.atan2(hz, -hx), len: 2.6, fit: false };
      return { x: x - hz * off, z: z + hx * off, ry: Math.atan2(hz, -hx), len, fit: true };
    };
    const place = (pi: number, t: number, station: number | null) => {
      r.stops[pi].push(t);
      r.stops[pi].sort((p, q) => p - q);
      const { x, z, ry, len } = spot(pi, t, station);
      stops.push({ x, z, ry, route: spec.name, station, exchange: len > 3, len });
    };
    // a stop at each station the route passes, at the nearest clear spot, once each time it passes
    STATION_XZ.forEach(([sx, sz], si) => {
      let best: { pi: number; t: number; d: number } | null = null;
      let cands: { pi: number; t: number; d: number }[] = [];
      // the nearest spot where a bus bay fits, if one is not much farther than the nearest spot of all
      const flush = () => {
        if (best) {
          const b = best;
          const bay = cands
            .filter((c) => c.d < b.d + 25)
            .sort((p, q) => p.d - q.d)
            .find((c) => spot(c.pi, c.t, si).len > 3);
          const pick = bay ?? b;
          place(pick.pi, pick.t, si);
        }
        best = null;
        cands = [];
      };
      let lastNear = -99;
      path.forEach(([k, dir], pi) => {
        // a step none of whose points comes near the station is passed over at once
        const e = edges[k];
        let near = Infinity;
        for (let j = 0; j < e.pts.length; j += 2) near = Math.min(near, Math.hypot(e.pts[j] - sx, e.pts[j + 1] - sz));
        if (near > STATION_REACH + 12) return;
        const [t0, t1] = stopRange(k, dir);
        if (t1 - t0 < 1) return;
        let found = false;
        for (let t = t0; t <= t1; t += 1) {
          const [x, z] = along(k, dir, t);
          const d = Math.hypot(x - sx, z - sz);
          if (d > STATION_REACH) continue;
          found = true;
          if (pi - lastNear > 6) flush();
          lastNear = pi;
          if (!best || d < best.d) best = { pi, t, d };
          if (Math.round(t) % 3 === 0) cands.push({ pi, t, d });
        }
        void found;
      });
      flush();
    });
    // and between, every SPACING or so, none close to another of this route's
    let run = 0;
    path.forEach(([k, dir], pi) => {
      const e = edges[k];
      const [t0, t1] = stopRange(k, dir);
      if (run + e.len >= SPACING && t1 - t0 >= 1 && !r.stops[pi].length) {
        const t = Math.min(t1, Math.max(t0, SPACING - run));
        place(pi, t, null);
        run = e.len - t;
      } else run += e.len;
      if (r.stops[pi].length) run = Math.min(run, e.len - r.stops[pi][r.stops[pi].length - 1]);
    });
    routes.push(r);
  }
  built = { routes, stops };
  return built;
}

/** Near a bus stop's shelter (or an exchange's canopy), with a pad. */
export function nearBusStop(x: number, z: number, pad = 0): boolean {
  return busNetwork().stops.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < ((s.exchange ? s.len / 2 + 0.3 : 1.8) + pad) ** 2);
}

/** The station's name a stop serves, for its board. */
export const stopStation = (s: BusStop): string => (s.station === null ? "" : stations[s.station].name);
