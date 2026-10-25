/**
 * Traffic on Vancouver's streets (roadNetwork.ts): cars on the drawn roads, keeping right in their lane, choosing their
 * way at each junction (mostly straight on, preferring the bigger roads, turning round only at a dead end), following
 * the car ahead and stopping at the line while their signal shows amber or red (the same timing the signal heads
 * show, roadNetwork.ts signalState), so queues form at the lights and clear on green. A car waits short of a junction
 * while another crosses its path there (two going straight on from opposite sides pass together), and never enters
 * one without room on the street it turns onto, so no two cars meet in a junction. The buses (buses.ts) are cars that
 * keep to their route, in the kerb lane, and pull in at each stop for a few seconds; each is articulated, its rear
 * section following the path its front has taken. A fixed-step simulation the scene advances each frame; each car's
 * pose for the instanced bodies. Pure apart from the network.
 */
import { busNetwork, type BusRoute } from "./buses";
import type { Rng } from "./cityModel";
import { approachAxis, junction, type REdge, roads, signalState, WALK } from "./roadNetwork";
import { groundAt } from "./terrain";
import { trackDist } from "./track";

export type Car = {
  /** Edge, direction along it (1 from a to b), distance travelled along it in that direction, speed, desired speed. */
  e: number;
  dir: 1 | -1;
  t: number;
  v: number;
  v0: number;
  lane: number;
  /** The edge it turns onto next (chosen as it nears the junction), and the one it just left (for the turn's curve). */
  next: number;
  nextDir: 1 | -1;
  prev: number;
  prevDir: 1 | -1;
  /** Its heading as it comes into the junction ahead, and whether it goes straight on there; the same for the junction it is leaving. */
  inX: number;
  inZ: number;
  straight: boolean;
  outX: number;
  outZ: number;
  outStraight: boolean;
  /** Seconds it has stood still other than at a red light: a car caught in gridlock goes and comes back elsewhere. */
  stall: number;
  /** In a junction's box this step. */
  inBox: boolean;
  /** Its length bumper to bumper (its kind's, or an articulated bus's). */
  len: number;
  /** Which of CAR_KINDS it is (a bus: -1). */
  kind: number;
  /** A commuter's bridge (its span's edge), which it keeps crossing and coming back to; -1 for the rest. */
  home: number;
  /** A bus: its route, the step of it it is on, the stops on that step it has served, time at the current stop. */
  bus?: BusState;
  rng: Rng;
  /** Pose: world position, the yaw that turns the body (built nose along +x) to its heading, nose-up pitch on a deck's grade, braking. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  brake: boolean;
};

/**
 * The city's cars in 2100 (vehicles.ts builds them), nose to tail, how briskly each drives against the street's
 * speed, and its share of the traffic.
 */
export const CAR_KINDS = [
  { name: "sedan", len: 2.5, speed: 1.05, share: 32 },
  { name: "pod", len: 1.8, speed: 0.9, share: 22 },
  { name: "crossover", len: 2.7, speed: 1.0, share: 22 },
  { name: "van", len: 3.0, speed: 0.9, share: 14 },
  { name: "truck", len: 2.9, speed: 1.0, share: 10 },
] as const;
const SHARES = CAR_KINDS.reduce((s, k) => s + k.share, 0);
/** A kind for a draw in [0, 1), by share. */
function kindAt(u: number): number {
  let r = u * SHARES;
  for (let k = 0; k < CAR_KINDS.length; k++) {
    r -= CAR_KINDS[k].share;
    if (r < 0) return k;
  }
  return 0;
}
/** An articulated bus: two sections of BUS_SECTION about the joint, bumper to bumper. */
export const BUS_SECTION = 3;
const LEN_BUS = 2 * BUS_SECTION + 0.4;
/** Seconds at each stop. */
const DWELL = 7;
const V_BUS = 6.5;

export type BusState = {
  r: number;
  pi: number;
  served: number;
  dwell: number;
  /** Where the joint has been (x, z, newest first), for the rear section; each section's pose. */
  trail: number[];
  fx: number;
  fz: number;
  fyaw: number;
  rx: number;
  rz: number;
  ryaw: number;
};
const ACC = 6;
const DEC = 9;
const GAP0 = 1.3;
const HEADWAY = 0.9;
/** Desired speed by road class: motorway, arterial, collector, local (units a second). */
const V0 = [13, 10, 8, 6];
const TURN = 3;
/** Seconds stood still (not at a red light) before a car caught in gridlock is taken off and comes back elsewhere. */
const GRIDLOCK = 90;
const GRIDLOCK_BOX = 20;

let drivable: Uint8Array | null = null;
const lanesOf = (e: REdge) => Math.max(1, Math.min(3, e.lanes));
/** Where a car stops for its signal: short of the junction's crossing by the stop line's place, or null. */
const stopLine = new Map<number, number | null>();
function stopAt(k: number, dir: 1 | -1): number | null {
  const key = k * 2 + (dir > 0 ? 0 : 1);
  if (stopLine.has(key)) return stopLine.get(key) ?? null;
  const { nodes, edges } = roads();
  const e = edges[k];
  const end = dir > 0 ? e.b : e.a;
  let v: number | null = null;
  if (nodes[end].signal) {
    const j = junction(end);
    const sb = j?.setback.get(k);
    if (sb != null) v = e.len - sb - 1.7;
  }
  stopLine.set(key, v);
  return v;
}

/** How far a junction's box reaches back along an edge from its end (dir 1: the b end), 0 where the end is no junction. */
const boxAt = new Map<number, number>();
function boxSetback(k: number, end: number): number {
  const key = k * 100000 + end;
  let v = boxAt.get(key);
  if (v == null) {
    v = junction(end)?.setback.get(k) ?? 0;
    boxAt.set(key, v);
  }
  return v;
}

/** An edge a car may drive: every stretch of it drawn, or a bridge's span. */
function canDrive(k: number): boolean {
  if (!drivable) {
    const { edges } = roads();
    drivable = new Uint8Array(edges.length);
    edges.forEach((e, i) => {
      drivable![i] = (e.span || e.shown.every((v) => v === 1)) && e.len > 0.2 ? 1 : 0;
    });
  }
  return drivable[k] === 1;
}
const allowed = (e: REdge, dir: 1 | -1) => e.oneway === 0 || e.oneway === dir;

/**
 * How far each node is from a bridge's ends along the drivable streets, out to REACH (Infinity beyond): the way home
 * for the cars that cross it (Traffic's commuters), which take the ways that bring it nearer the more readily.
 */
const REACH = 400;
/** How much more readily a commuter takes a way toward its bridge. */
const HOMING = 10;
/** The share of the cars coming back in that come over a bridge from off the map. */
const GATEWAY = 0.12;
const homeDist = new Map<number, Float32Array>();
function bridgeDist(span: number, node: number): number {
  let d = homeDist.get(span);
  if (!d) {
    const { nodes, edges } = roads();
    const dist = new Float32Array(nodes.length).fill(Infinity);
    const open = [edges[span].a, edges[span].b];
    for (const n of open) dist[n] = 0;
    // a small Dijkstra (the reach is a few blocks; a sorted pick is plenty)
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const n = open.splice(bi, 1)[0];
      for (const k of nodes[n].edges) {
        const e = edges[k];
        if (e.span || !canDrive(k)) continue;
        const o = e.a === n ? e.b : e.a;
        const v = dist[n] + e.len;
        if (v < dist[o] && v < REACH) {
          if (dist[o] === Infinity) open.push(o);
          dist[o] = v;
        }
      }
    }
    d = dist;
    homeDist.set(span, d);
  }
  return d[node];
}

/** Point and unit tangent (a → b) at distance S from a, the deck's height there (or NaN) and its grade (a → b). */
function frameOn(e: REdge, S: number, out: number[]): void {
  const n = e.pts.length / 2;
  let i = 0;
  while (i < n - 2 && e.cum[i + 1] < S) i++;
  const L = e.cum[i + 1] - e.cum[i] || 1;
  const u = Math.min(1, Math.max(0, (S - e.cum[i]) / L));
  const ax = e.pts[i * 2];
  const az = e.pts[i * 2 + 1];
  const dx = e.pts[i * 2 + 2] - ax;
  const dz = e.pts[i * 2 + 3] - az;
  const d = Math.hypot(dx, dz) || 1;
  out[0] = ax + dx * u;
  out[1] = az + dz * u;
  out[2] = dx / d;
  out[3] = dz / d;
  out[4] = e.deck[i] ? e.y[i] + (e.y[i + 1] - e.y[i]) * u + 0.12 : NaN;
  out[5] = e.deck[i] ? (e.y[i + 1] - e.y[i]) / L : 0;
}
/** Lateral offset of a lane, right of travel: the right half of a two-way road, the whole of a one-way. */
function laneOffset(e: REdge, lane: number): number {
  const c = e.half - WALK[e.cls];
  const L = lanesOf(e);
  if (e.oneway) return -c + (2 * c * (lane + 0.5)) / L;
  return (c * (lane + 0.5)) / L + (e.median ? 0.3 : 0);
}

const F = [0, 0, 0, 0, 0, 0];
const G = [0, 0, 0, 0, 0, 0];
/** A car's position on its edge, `ahead` past its travelled distance, in its lane: x, z, heading x, z, deck height, grade ahead. */
function placeOn(c: { e: number; dir: 1 | -1; lane: number }, t: number, out: number[]): void {
  const e = roads().edges[c.e];
  const S = c.dir > 0 ? t : e.len - t;
  frameOn(e, S, F);
  const hx = F[2] * c.dir;
  const hz = F[3] * c.dir;
  // right of travel is (-h.z, h.x)
  const off = laneOffset(e, Math.min(c.lane, lanesOf(e) - 1));
  out[0] = F[0] - hz * off;
  out[1] = F[1] + hx * off;
  out[2] = hx;
  out[3] = hz;
  out[4] = F[4];
  out[5] = F[5] * c.dir;
}

export class Traffic {
  /** The cars and the buses (drawn apart), and all of them for the simulation. */
  readonly cars: Car[] = [];
  readonly buses: Car[] = [];
  private all: Car[] = [];
  private routes: BusRoute[] = [];
  private byLane = new Map<number, Car[]>();
  private acc = 0;
  /** The signals' clock: it starts 10 s before the scene's, which the settling steps below bring level. */
  time = -10;
  /** The bridges that run off the map (the Lions Gate), which cars come in over and go off by. */
  private portals: number[] = [];
  /** The streets the cars keep to (within sight of the line), weighted by length and class, and the far ones. */
  private pool: number[] = [];
  private weight: number[] = [];
  private total = 0;
  private far: Uint8Array;

  constructor(n: number, rng: Rng, seedRng: (i: number) => Rng, nBus = 0) {
    const { edges } = roads();
    // the cars keep to the streets the ride can see (the arterials most), where they are seen: one that drives off
    // past them comes back in on one of them. The bridges are seen from all over: a car keeps on over one however far
    // it reaches (the Lions Gate's to the North Shore)
    this.far = new Uint8Array(edges.length);
    this.portals = edges.map((_, k) => k).filter((k) => this.portal(k));
    edges.forEach((e, k) => {
      const n = e.pts.length / 2;
      const d = trackDist(e.pts[(n >> 1) * 2], e.pts[(n >> 1) * 2 + 1]);
      this.far[k] = d > 300 && !e.span ? 1 : 0;
      if (!canDrive(k) || this.far[k]) return;
      const w = e.len * (e.cls <= 1 ? 2 : 1) * (d < 200 ? 1 : 0.3);
      this.total += w;
      this.pool.push(k);
      this.weight.push(w);
    });
    // the last of them are the commuters over the bridges within the map, a share for each, spread over it to start
    // with (the Lions Gate's traffic comes and goes by the North Shore: respawn)
    const homes: number[] = [];
    edges.forEach((e, k) => {
      if (e.span && !this.portal(k)) for (let j = Math.round(n / 90); j > 0; j--) homes.push(k);
    });
    const commuters = n - homes.length;
    for (let i = 0; i < n && this.pool.length; i++) {
      // its kind (from its own seed, so the spots below are the ones they always were); a clear spot: none on another car
      const kind = kindAt(seedRng(i).next());
      const len = CAR_KINDS[kind].len;
      let k = 0;
      let dir: 1 | -1 = 1;
      let t = 0;
      let lane = 0;
      const home = i >= commuters ? homes[i - commuters] : -1;
      if (home >= 0) {
        const j = i - commuters - homes.indexOf(home);
        const per = homes.lastIndexOf(home) - homes.indexOf(home) + 1;
        k = home;
        dir = j % 2 ? -1 : 1;
        t = ((j + 0.5) / per) * edges[k].len;
        lane = Math.floor(j / 2) % lanesOf(edges[k]);
      }
      for (let tries = 0; tries < 8 && home < 0; tries++) {
        k = this.pick(rng);
        const o = edges[k];
        dir = o.oneway ? (o.oneway as 1 | -1) : rng.next() < 0.5 ? 1 : -1;
        t = rng.next() * o.len;
        lane = Math.floor(rng.next() * lanesOf(o));
        if (this.clear(k, dir, lane, t, len)) break;
      }
      const e = edges[k];
      const car: Car = {
        e: k,
        dir,
        t,
        v: 0,
        v0: V0[e.cls] * (0.85 + rng.next() * 0.3) * CAR_KINDS[kind].speed,
        lane,
        next: -1,
        nextDir: 1,
        prev: -1,
        prevDir: 1,
        inX: 1,
        inZ: 0,
        straight: true,
        outX: 1,
        outZ: 0,
        outStraight: true,
        stall: 0,
        inBox: false,
        len,
        kind,
        home,
        rng: seedRng(i),
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        brake: false,
      };
      this.cars.push(car);
      this.enter(car);
    }
    // the buses, shared among the routes by length, spread evenly along each
    this.routes = busNetwork().routes;
    const total = this.routes.reduce((s, r) => s + r.len, 0);
    let made = 0;
    this.routes.forEach((r, ri) => {
      const count = Math.max(1, Math.round((nBus * r.len) / Math.max(1, total)));
      for (let j = 0; j < count && made < nBus + this.routes.length; j++, made++) {
        // a place along the route, a step and a distance on it
        let at = ((j + 0.5) / count) * r.len;
        let pi = 0;
        while (pi < r.path.length - 1 && at > edges[r.path[pi][0]].len) {
          at -= edges[r.path[pi][0]].len;
          pi++;
        }
        const [k, dir] = r.path[pi];
        const e = edges[k];
        const bus: Car = {
          e: k,
          dir,
          t: Math.min(e.len * 0.9, Math.max(0, at)),
          v: 0,
          v0: V_BUS,
          lane: lanesOf(e) - 1,
          next: -1,
          nextDir: 1,
          prev: -1,
          prevDir: 1,
          inX: 1,
          inZ: 0,
          straight: true,
          outX: 1,
          outZ: 0,
          outStraight: true,
          stall: 0,
          inBox: false,
          len: LEN_BUS,
          kind: -1,
          home: -1,
          bus: { r: ri, pi, served: 0, dwell: 0, trail: [], fx: 0, fz: 0, fyaw: 0, rx: 0, rz: 0, ryaw: 0 },
          rng: seedRng(5000 + made),
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          brake: false,
        };
        this.buses.push(bus);
        this.enter(bus);
      }
    });
    this.all = [...this.cars, ...this.buses];
    // settle the queues before the first frame is seen
    for (let i = 0; i < 300; i++) this.tick(1 / 30);
    this.poses();
  }

  private pick(rng: Rng): number {
    let r = rng.next() * this.total;
    for (let q = 0; q < this.pool.length; q++) {
      r -= this.weight[q];
      if (r <= 0) return this.pool[q];
    }
    return this.pool[0];
  }

  private key = (c: { e: number; dir: 1 | -1 }) => c.e * 2 + (c.dir > 0 ? 0 : 1);
  /** No car within half of each one's length, and the gap, of t on this edge, direction and lane. */
  private clear(k: number, dir: 1 | -1, lane: number, t: number, len: number): boolean {
    return !(this.byLane.get(k * 2 + (dir > 0 ? 0 : 1)) ?? []).some((o) => o.lane === lane && Math.abs(o.t - t) < (o.len + len) / 2 + GAP0 + 0.5);
  }
  /** Who is in each junction's box: the way each came in, its heading then, and whether it goes straight on. */
  private box = new Map<number, { from: number; x: number; z: number; straight: boolean }[]>();
  /** The room the cars in a junction will take on each street they are bound for (edge and direction): lengths and gaps. */
  private bound = new Map<number, number>();
  /** How far along an edge from its start a car is still in the junction it came out of. */
  private boxOut(k: number, dir: 1 | -1): number {
    const e = roads().edges[k];
    return Math.max(TURN, boxSetback(k, dir > 0 ? e.a : e.b) + 0.6);
  }
  /** A car's wish speed on its street: the street's, a driver's own, its kind's. */
  private pace(c: Car): number {
    return V0[roads().edges[c.e].cls] * (0.85 + c.rng.next() * 0.3) * CAR_KINDS[c.kind].speed;
  }
  /** Which way into the map a bridge that runs off it is driven (1 from a, -1 from b), or 0 for one within it. */
  private portal(k: number): 0 | 1 | -1 {
    const { nodes, edges } = roads();
    const e = edges[k];
    return !e.span ? 0 : nodes[e.b].deg === 1 ? -1 : nodes[e.a].deg === 1 ? 1 : 0;
  }
  /**
   * Back in on one of the line's streets, on a clear spot, standing; a commuter on its bridge; and now and then over a
   * bridge from off the map (the Lions Gate from the North Shore), from its far end, out of sight.
   */
  private respawn(c: Car): void {
    const { edges } = roads();
    const gate = c.home < 0 && c.rng.next() < GATEWAY ? this.portals[Math.floor(c.rng.next() * this.portals.length)] : undefined;
    for (let tries = 0; tries < 8; tries++) {
      c.e = c.home >= 0 ? c.home : (gate ?? this.pick(c.rng));
      const o = edges[c.e];
      const portal = gate == null ? 0 : this.portal(c.e);
      c.dir = portal || (o.oneway ? (o.oneway as 1 | -1) : c.rng.next() < 0.5 ? 1 : -1);
      c.t = portal ? tries * 6 : c.rng.next() * o.len * 0.5;
      if (this.clear(c.e, c.dir, Math.min(c.lane, lanesOf(o) - 1), c.t, c.len)) break;
    }
    c.v = 0;
    c.prev = -1;
    c.next = -1;
    c.stall = 0;
  }
  /** A bus caught in gridlock starts again at the start of another step of its route. */
  private respawnBus(c: Car): void {
    const r = this.routes[c.bus!.r];
    const pi = Math.floor(c.rng.next() * r.path.length);
    const [k, dir] = r.path[pi];
    c.e = k;
    c.dir = dir;
    c.t = 0;
    c.v = 0;
    c.prev = -1;
    c.next = -1;
    c.stall = 0;
    c.lane = lanesOf(roads().edges[k]) - 1;
    c.bus!.pi = pi;
    c.bus!.served = 0;
    c.bus!.dwell = 0;
    c.bus!.trail.length = 0;
  }
  /** Where a car on edge e waits for its junction: short of the box (and of its crossing). */
  private holdAt(c: Car, e: REdge): number {
    const end = c.dir > 0 ? e.b : e.a;
    return e.len - Math.max(Math.min(TURN, e.len * 0.4) + 0.3, boxSetback(c.e, end) + 1.2);
  }
  private enter(c: Car) {
    const k = this.key(c);
    const l = this.byLane.get(k);
    if (l) l.push(c);
    else this.byLane.set(k, [c]);
  }
  private leave(c: Car) {
    const l = this.byLane.get(this.key(c));
    if (l) l.splice(l.indexOf(c), 1);
  }

  /** The way on from the end of a car's edge: straight on, the bigger roads, a U-turn only at a dead end. */
  private choose(c: Car): void {
    const { nodes, edges } = roads();
    const e = edges[c.e];
    const node = c.dir > 0 ? e.b : e.a;
    placeOn(c, e.len - 0.01, G);
    const hx = G[2];
    const hz = G[3];
    if (c.bus) {
      // the next step of its route
      const r = this.routes[c.bus.r];
      const [k, dir] = r.path[(c.bus.pi + 1) % r.path.length];
      const o = edges[k];
      frameOn(o, dir > 0 ? 0.01 : o.len - 0.01, F);
      c.inX = hx;
      c.inZ = hz;
      c.next = k;
      c.nextDir = dir;
      c.straight = F[2] * dir * hx + F[3] * dir * hz > 0.8 && k !== c.e;
      return;
    }
    let total = 0;
    const opts: [number, 1 | -1, number, number][] = [];
    for (const k of nodes[node].edges) {
      // (a commuter keeps to its own bridge: another's is as good as closed to it)
      if (k === c.e || !canDrive(k) || (c.home >= 0 && edges[k].span && k !== c.home)) continue;
      const o = edges[k];
      const dir: 1 | -1 = o.a === node ? 1 : -1;
      if (!allowed(o, dir)) continue;
      frameOn(o, dir > 0 ? 0.01 : o.len - 0.01, F);
      const cos = F[2] * dir * hx + F[3] * dir * hz;
      // a commuter takes the way back toward its bridge (or onto it) the more readily
      const far = o.a === node ? o.b : o.a;
      const home = c.home >= 0 && (k === c.home || bridgeDist(c.home, far) < bridgeDist(c.home, node) - 1) ? HOMING : 1;
      const w = (cos + 1.3) ** 2 * (o.cls <= 1 ? 3 : o.cls === 2 ? 2 : 1) * home;
      total += w;
      opts.push([k, dir, w, cos]);
    }
    c.inX = hx;
    c.inZ = hz;
    if (!opts.length) {
      // a dead end: back the way it came, if it may
      c.next = c.e;
      c.nextDir = allowed(e, -c.dir as 1 | -1) ? (-c.dir as 1 | -1) : c.dir;
      c.straight = false;
      return;
    }
    let r = c.rng.next() * total;
    let pick = opts[0];
    for (const o of opts) {
      r -= o[2];
      pick = o;
      if (r <= 0) break;
    }
    [c.next, c.nextDir] = [pick[0], pick[1]];
    c.straight = pick[3] > 0.8;
  }

  /** Advance the simulation by dt (in fixed 30 Hz steps) to the scene's time `now`, then set every car's pose. */
  advance(dt: number, now: number): void {
    this.acc += Math.min(dt, 0.25);
    // the signal heads read the scene's clock: so do the cars
    this.time = now - this.acc;
    while (this.acc >= 1 / 30) {
      this.tick(1 / 30);
      this.acc -= 1 / 30;
    }
    this.poses();
  }

  private tick(h: number): void {
    const { nodes, edges } = roads();
    this.time += h;
    // who is in each junction's box: past the place it would wait, or not yet clear of the box on the way out
    const box = this.box;
    box.clear();
    const into = (node: number, o: { from: number; x: number; z: number; straight: boolean }) => {
      const list = box.get(node);
      if (list) list.push(o);
      else box.set(node, [o]);
    };
    // and the room the cars already in a junction will take on the street each turns onto
    const bound = this.bound;
    bound.clear();
    for (const c of this.all) {
      const e = edges[c.e];
      const end = c.dir > 0 ? e.b : e.a;
      const start = c.dir > 0 ? e.a : e.b;
      c.inBox = false;
      if (c.next >= 0 && nodes[end].deg >= 3 && c.t > this.holdAt(c, e)) {
        into(end, { from: this.key(c), x: c.inX, z: c.inZ, straight: c.straight });
        const k = c.next * 2 + (c.nextDir > 0 ? 0 : 1);
        bound.set(k, (bound.get(k) ?? 0) + c.len + GAP0);
        c.inBox = true;
      } else if (c.prev >= 0 && nodes[start].deg >= 3 && c.t < this.boxOut(c.e, c.dir)) {
        into(start, { from: c.prev * 2 + (c.prevDir > 0 ? 0 : 1), x: c.outX, z: c.outZ, straight: c.outStraight });
        c.inBox = true;
      }
    }
    for (const c of this.all) {
      const e = edges[c.e];
      if (c.next < 0 && c.t > e.len - 12) this.choose(c);
      // the car ahead in this lane, or the first on the edge it turns onto
      let gap = Infinity;
      let lv = 0;
      for (const o of this.byLane.get(this.key(c)) ?? []) {
        if (o === c || o.lane !== c.lane || o.t <= c.t) continue;
        const g = o.t - c.t - (o.len + c.len) / 2;
        if (g < gap) {
          gap = g;
          lv = o.v;
        }
      }
      if (gap === Infinity && c.next >= 0) {
        for (const o of this.byLane.get(c.next * 2 + (c.nextDir > 0 ? 0 : 1)) ?? []) {
          if (o === c) continue;
          const g = e.len - c.t + o.t - (o.len + c.len) / 2;
          if (g < gap) {
            gap = g;
            lv = o.v;
          }
        }
      }
      // the signal at the end of this edge: a stationary car at the stop line while it shows amber or red, unless
      // the car is too close to stop
      const sl = stopAt(c.e, c.dir);
      let v0 = c.v0;
      let red = false;
      if (sl != null) {
        const node = c.dir > 0 ? e.b : e.a;
        const state = signalState(node, approachAxis(c.e, node), this.time);
        const d = sl - c.t;
        red = state > 0;
        if (state > 0 && d > -0.3 && (state === 2 || d > (c.v * c.v) / (2 * DEC))) {
          if (d < gap) {
            gap = Math.max(0, d);
            lv = 0;
          }
        }
      } else {
        // an unsignalled junction: slow through it
        const node = c.dir > 0 ? e.b : e.a;
        if (nodes[node].deg >= 3 && e.len - c.t < 5) v0 *= 0.6;
      }
      // wait short of the junction while a car crosses its path in it, or while the street it turns onto has no room
      const end = c.dir > 0 ? e.b : e.a;
      if (c.next >= 0 && c.next !== c.e && nodes[end].deg >= 3) {
        const d = this.holdAt(c, e) - c.t;
        if (d > -0.3 && d < gap) {
          const me = this.key(c);
          const crossed = (box.get(end) ?? []).some((o) => o.from !== me && !(o.straight && c.straight && o.x * c.inX + o.z * c.inZ < -0.8));
          const ne = edges[c.next];
          const lane = Math.min(c.lane, lanesOf(ne) - 1);
          // room for the whole car past the junction's far side
          const nk = c.next * 2 + (c.nextDir > 0 ? 0 : 1);
          const room = this.boxOut(c.next, c.nextDir) + c.len + GAP0 + (bound.get(nk) ?? 0);
          const full = (this.byLane.get(nk) ?? []).some((o) => o.lane === lane && o.t < room);
          if (crossed || full) {
            gap = Math.max(0, d);
            lv = 0;
          }
        }
      }
      // a bus pulls in at the next stop on this step of its route and waits there
      let waiting = false;
      if (c.bus) {
        const st = this.routes[c.bus.r].stops[c.bus.pi];
        while (c.bus.served < st.length && st[c.bus.served] < c.t - 0.6) c.bus.served++;
        if (c.bus.served < st.length) {
          const d = st[c.bus.served] - c.t;
          // the stop as an obstacle a standstill gap beyond it, so the bus halts at the stop itself
          if (d + GAP0 < gap) {
            gap = Math.max(0, d + GAP0);
            lv = 0;
          }
          if (d < 0.6 && c.v < 0.3) {
            waiting = true;
            c.bus.dwell += h;
            if (c.bus.dwell > DWELL) {
              c.bus.served++;
              c.bus.dwell = 0;
            }
          }
        }
      }
      // a simplified Intelligent Driver Model
      const dv = c.v - lv;
      const sStar = GAP0 + c.v * HEADWAY + (c.v * dv) / (2 * Math.sqrt(ACC * DEC));
      let a = ACC * (1 - (c.v / v0) ** 4);
      if (gap < Infinity) a -= ACC * (Math.max(0, sStar) / Math.max(0.1, gap)) ** 2;
      a = Math.max(-DEC * 1.5, a);
      c.brake = a < -1.5;
      c.v = Math.max(0, c.v + a * h);
      // never into the car or the line ahead, even where a short stretch hid the queue until too late to brake
      let step = c.v * h;
      if (step > gap) {
        step = Math.max(0, gap);
        c.v = Math.min(c.v, lv);
        c.brake = true;
      }
      c.t += step;
      c.stall = c.v < 0.2 && !red && !waiting ? c.stall + h : 0;
      // one stuck in a junction holds up every way through it, so it goes sooner
      if (c.stall > (c.inBox ? GRIDLOCK_BOX : GRIDLOCK)) {
        this.leave(c);
        if (c.bus) this.respawnBus(c);
        else {
          this.respawn(c);
          c.v0 = this.pace(c);
        }
        c.lane = Math.min(c.lane, lanesOf(edges[c.e]) - 1);
        this.enter(c);
        continue;
      }
      // on to the next edge; off the map past a bridge's far end, and back in elsewhere
      if (c.t >= e.len && this.portal(c.e) === -c.dir && !c.bus) {
        this.leave(c);
        this.respawn(c);
        c.v0 = this.pace(c);
        c.lane = Math.min(c.lane, lanesOf(edges[c.e]) - 1);
        this.enter(c);
        continue;
      }
      if (c.t >= e.len) {
        if (c.next < 0) this.choose(c);
        const over = c.t - e.len;
        this.leave(c);
        c.prev = c.e;
        c.prevDir = c.dir;
        c.outX = c.inX;
        c.outZ = c.inZ;
        c.outStraight = c.straight;
        c.e = c.next;
        c.dir = c.nextDir;
        c.t = Math.min(over, edges[c.e].len * 0.5);
        c.next = -1;
        const ne = edges[c.e];
        if (c.bus) {
          // on along its route, in the kerb lane
          c.bus.pi = (c.bus.pi + 1) % this.routes[c.bus.r].path.length;
          c.bus.served = 0;
          c.bus.dwell = 0;
          c.lane = lanesOf(ne) - 1;
        } else {
          // out of sight of the line: back in on one of its streets
          if (this.far[c.e]) this.respawn(c);
          c.v0 = this.pace(c);
          c.lane = Math.min(c.lane, lanesOf(edges[c.e]) - 1);
        }
        this.enter(c);
      }
    }
  }

  /** Each car's pose: on its edge in its lane, curving through a junction from the edge it left onto the next. */
  private poses(): void {
    const { edges } = roads();
    const A = [0, 0, 0, 0, 0, 0];
    const B = [0, 0, 0, 0, 0, 0];
    for (const c of this.all) {
      const e = edges[c.e];
      const R = Math.min(TURN, e.len * 0.4);
      let x: number;
      let z: number;
      let hx: number;
      let hz: number;
      let deck: number;
      let grade = 0;
      const turnIn = c.next >= 0 && c.next !== c.e && c.t > e.len - R;
      const turnOut = c.prev >= 0 && c.prev !== c.e && c.t < R;
      if (turnIn || turnOut) {
        // a quadratic through the junction: from R short of it on the edge in, to R along the edge out
        const pin = turnIn ? { e: c.e, dir: c.dir, lane: c.lane } : { e: c.prev, dir: c.prevDir, lane: c.lane };
        const pout = turnIn ? { e: c.next, dir: c.nextDir, lane: c.lane } : { e: c.e, dir: c.dir, lane: c.lane };
        const ein = edges[pin.e];
        const eout = edges[pout.e];
        const Rin = Math.min(TURN, ein.len * 0.4);
        const Rout = Math.min(TURN, eout.len * 0.4);
        placeOn(pin, ein.len - Rin, A);
        placeOn(pout, Rout, B);
        const w = turnIn ? (c.t - (e.len - R)) / (2 * R) : 0.5 + c.t / (2 * R);
        // the control point: where the two lanes' lines meet (their ends, midway, if they barely turn)
        const cx = A[0] + A[2] * Rin;
        const cz = A[1] + A[3] * Rin;
        const u = Math.min(1, Math.max(0, w));
        x = (1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * cx + u * u * B[0];
        z = (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * cz + u * u * B[1];
        hx = 2 * (1 - u) * (cx - A[0]) + 2 * u * (B[0] - cx);
        hz = 2 * (1 - u) * (cz - A[1]) + 2 * u * (B[1] - cz);
        deck = NaN;
      } else {
        placeOn(c, c.t, A);
        [x, z, hx, hz, deck, grade] = A;
      }
      c.x = x;
      c.z = z;
      c.y = Number.isNaN(deck) ? groundAt(x, z) : deck;
      c.yaw = Math.atan2(-hz, hx);
      c.pitch = Math.atan(grade);
    }
    // each bus's two sections: the front one ahead of the joint along its heading, the rear one along the path the
    // joint has come by
    for (const c of this.buses) {
      const b = c.bus!;
      const tr = b.trail;
      if (!tr.length || Math.hypot(tr[0] - c.x, tr[1] - c.z) > 0.35) {
        tr.unshift(c.x, c.z);
        if (tr.length > 60) tr.length = 60;
      }
      const hx = Math.cos(-c.yaw);
      const hz = Math.sin(-c.yaw);
      b.fx = c.x + hx * (BUS_SECTION / 2 + 0.2);
      b.fz = c.z + hz * (BUS_SECTION / 2 + 0.2);
      b.fyaw = c.yaw;
      // the point d back along the trail
      const back = (d: number): [number, number] => {
        let px = c.x;
        let pz = c.z;
        for (let i = 0; i + 1 < tr.length; i += 2) {
          const L = Math.hypot(tr[i] - px, tr[i + 1] - pz);
          if (L >= d) return [px + ((tr[i] - px) * d) / L, pz + ((tr[i + 1] - pz) * d) / L];
          d -= L;
          px = tr[i];
          pz = tr[i + 1];
        }
        return [px - hx * d, pz - hz * d];
      };
      const [ex, ez] = back(BUS_SECTION + 0.4);
      const [mx, mz] = back(BUS_SECTION / 2 + 0.2);
      b.rx = mx;
      b.rz = mz;
      b.ryaw = Math.atan2(-(c.z - ez), c.x - ex);
    }
  }
}
