/**
 * Vancouver's streets around the ride (streetData.ts, generalized from OpenStreetMap) as a graph the city can ask
 * questions of: how far a point is from the nearest road and which road it is; every edge's centreline, width and
 * height along it (a deck where a road crosses the Grandview Cut, the bridges over False Creek and the First
 * Narrows); where a road is not drawn (under a landmark, a hero or a station's set, across the Expo's fenced
 * right-of-way where it runs at grade, over the water, into the side of a bridge's low deck); the signalled junctions
 * and their timing, which the signal heads and the cars share; and the land use under any point. Built once, on first
 * use, after the terrain has every modifier in.
 */
import { TRENCH } from "./constants";
import { BROADWAY_LINE, BROADWAY_PORTAL, cutAxis, inRailCut, MILL_LINE, profileAt } from "./rail";
import { onPeninsula } from "./buildings/eras";
import { HEROES } from "./buildings/heroes";
import { LANDUSE } from "./landuseData";
import { inSetZone } from "./sets/zones";
import { inHarbourfront, inHarbourGreen } from "./harbourfront";
import { lionsGateDeck } from "./lionsGate";
import { BRIDGES, deckOf, inLandmark, inSenakwGround, underLowDeck } from "./sites";
import { STREETS } from "./streetData";
import { WCE_HALF, wceDist } from "./wce";
import { demAt, groundAt, sdfAt } from "./terrain";
import { frameAt, LEN, lowAt, makeFrame } from "./track";

export type RoadClass = 0 | 1 | 2 | 3;
/** Half-width with the sidewalks, per class (motorway, arterial, collector, local), as the ride has always drawn them. */
export const HALF = [4.2, 3.44, 2.9, 2.41];
/**
 * On the downtown peninsula (downtown, the West End, Yaletown) the streets are drawn narrower, their sidewalks as wide
 * (a lane less on a two-way arterial): the blocks between them are bigger, and the city fills them in (city.ts). The
 * motorways and the bridges keep their width.
 */
export const HALF_PENINSULA = [4.2, 2.75, 2.3, 1.95];
/** Sidewalk width inside that half-width (none beside a motorway). */
export const WALK = [0, 0.85, 0.8, 0.7];

export type REdge = {
  a: number;
  b: number;
  cls: RoadClass;
  /** Half-width as drawn (and driven, walked and planted). */
  half: number;
  /**
   * Half-width the city was laid out against (HALF): its lots, its bus stops and its hidden stretches are where they
   * were before the peninsula's streets were drawn narrower, so none of them moved.
   */
  lay: number;
  /** 1 one-way from a to b, -1 from b to a, 0 both ways. */
  oneway: -1 | 0 | 1;
  median: boolean;
  bridge: boolean;
  /** Lanes each way (or in its one direction). */
  lanes: number;
  name: string;
  /** Centreline x, z pairs from a to b, cumulative length at each point, and the height of the road there. */
  pts: Float32Array;
  cum: Float32Array;
  y: Float32Array;
  len: number;
  /** Per segment: drawn (1) or hidden (0). */
  shown: Uint8Array;
  /** Over the cut on a deck, per segment. */
  deck: Uint8Array;
  /** Over the Broadway Subway: 0 not, 1 its distance along running west, 2 running east. */
  subway: 0 | 1 | 2;
  /**
   * Carried on a bridge's deck from end to end (False Creek's, the Lions Gate): drawn by the bridge, so none of it is
   * shown as a street, yet the cars drive it, on its deck.
   */
  span: boolean;
};
export type RNode = { x: number; z: number; edges: number[]; signal: boolean; deg: number };
export type Roads = { nodes: RNode[]; edges: REdge[]; ped: [number, number][] };

const decode = (s: string) => {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
const i16 = (s: string) => new Int16Array(decode(s).buffer);
const u16 = (s: string) => new Uint16Array(decode(s).buffer);

const sstep = (u: number) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};
/**
 * Commercial Drive as the ride draws it: on the map it runs half a block west of the Expo from the Grandview Cut south
 * past Broadway, which the ride's broad guideway would cover; so there it is moved west, clear of the guideway and the
 * station's columns, the streets crossing it stretched to meet it (a displacement, as a cartographer makes one).
 */
function displace(x: number, z: number): [number, number] {
  const cx = z < 362 ? 339.5 : 339.5 + Math.min(1, (z - 362) / 28) * 12.5;
  const band = 1 - sstep((Math.abs(x - cx) - 2.5) / 8);
  if (band <= 0) return [x, z];
  // it eases across north of the Grandview Cut (which spans z 261 to 280 here), so it crosses the cut straight
  const span = sstep((z - 226) / 24) * (1 - sstep((z - 395) / 15));
  return [x - 14 * band * span, z];
}

let built: Roads | null = null;
const H = 8;
const hash = new Map<number, number[]>();
const segEdge: number[] = [];
const segIdx: number[] = [];

/** The network, built on first use. */
export function roads(): Roads {
  if (built) return built;
  const N = i16(STREETS.nodes);
  const R = u16(STREETS.edges);
  const F = decode(STREETS.flags);
  const PT = i16(STREETS.points);
  const names = STREETS.names.split("\n");
  const nodes: RNode[] = [];
  for (let i = 0; i < N.length / 2; i++) {
    const [x, z] = displace(N[i * 2] / 10, N[i * 2 + 1] / 10);
    nodes.push({ x, z, edges: [], signal: false, deg: 0 });
  }
  const edges: REdge[] = [];
  for (let k = 0; k < F.length; k++) {
    const [a, b, p0, pn, ni] = [R[k * 5], R[k * 5 + 1], R[k * 5 + 2], R[k * 5 + 3], R[k * 5 + 4]];
    const f = F[k];
    const cls = (f & 3) as RoadClass;
    const ow = (f >> 2) & 3;
    const xs: number[] = [nodes[a].x, nodes[a].z];
    for (let i = 0; i < pn; i++) xs.push(...displace(PT[(p0 + i) * 2] / 10, PT[(p0 + i) * 2 + 1] / 10));
    xs.push(nodes[b].x, nodes[b].z);
    // no hairpins: an inner point the road doubles back at (the displacement or a merged junction moved its neighbour
    // past it) goes, until none is left
    for (let again = true; again && xs.length > 4; ) {
      again = false;
      for (let i = 1; i + 1 < xs.length / 2; i++) {
        const ax = xs[i * 2] - xs[i * 2 - 2];
        const az = xs[i * 2 + 1] - xs[i * 2 - 1];
        const bx = xs[i * 2 + 2] - xs[i * 2];
        const bz = xs[i * 2 + 3] - xs[i * 2 + 1];
        const la = Math.hypot(ax, az);
        const lb = Math.hypot(bx, bz);
        if (la < 0.3 || lb < 0.3 || (ax * bx + az * bz) / (la * lb) < -0.34) {
          xs.splice(i * 2, 2);
          again = true;
          break;
        }
      }
    }
    // within reach of a hero tower (larger than life, wider than a block), pieces at most 2.5 long, so only those
    // under its footprint go out of sight and the rest of the street stays drawn
    const nearHero = (x: number, z: number) => HEROES.some((h) => Math.abs(h.x - x) < h.r + 14 && Math.abs(h.z - z) < h.r + 14);
    for (let i = 0; i + 1 < xs.length / 2; i++) {
      const ax = xs[i * 2];
      const az = xs[i * 2 + 1];
      const bx = xs[i * 2 + 2];
      const bz = xs[i * 2 + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L <= 2.5 || !(nearHero(ax, az) || nearHero(bx, bz) || nearHero((ax + bx) / 2, (az + bz) / 2))) continue;
      const m = Math.ceil(L / 2.5);
      const add: number[] = [];
      for (let k = 1; k < m; k++) add.push(ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m);
      xs.splice(i * 2 + 2, 0, ...add);
      i += m - 1;
    }
    const pts = new Float32Array(xs);
    const n = pts.length / 2;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    const bridge = !!((f >> 5) & 1);
    // the peninsula's streets narrower, by where the street's middle is
    const mid = Math.max(0, cum.findIndex((c) => c >= cum[n - 1] / 2));
    const [mx, mz] = [pts[mid * 2], pts[mid * 2 + 1]];
    const half = !bridge && onPeninsula(mx, mz) ? HALF_PENINSULA[cls] : HALF[cls];
    edges.push({
      a,
      b,
      cls,
      half,
      lay: HALF[cls],
      oneway: ow === 1 ? 1 : ow === 2 ? -1 : 0,
      median: !!((f >> 4) & 1),
      bridge,
      // no more lanes than the drawn carriageway holds a car's width each (1.25)
      lanes: Math.max(1, Math.min(((f >> 6) & 3) + 1, Math.floor(((half - WALK[cls]) * (ow ? 2 : 1)) / 1.25))),
      name: names[ni] ?? "",
      pts,
      cum,
      y: new Float32Array(n),
      len: cum[n - 1],
      shown: new Uint8Array(n - 1).fill(1),
      deck: new Uint8Array(n - 1),
      subway: 0,
      span: false,
    });
    nodes[a].edges.push(k);
    nodes[b].edges.push(k);
  }
  for (const nd of nodes) nd.deg = nd.edges.length;
  for (const i of u16(STREETS.signals)) if (nodes[i]) nodes[i].signal = true;
  const P = i16(STREETS.ped);
  const ped: [number, number][] = [];
  for (let i = 0; i < P.length / 2; i++) ped.push(displace(P[i * 2] / 10, P[i * 2 + 1] / 10));

  // where a road is not drawn (by its laid-out width, so the stretches hidden stay as they were), and how high it runs
  buildFence();
  const hidden = (x: number, z: number, half: number) =>
    sdfAt(x, z) < 1 ||
    inLandmark(x, z, 0) ||
    inHarbourfront(x, z, half) ||
    inHarbourGreen(x, z, half) ||
    wceDist(x, z) < WCE_HALF + 1 + half ||
    inSetZone(x, z, 0) ||
    HEROES.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < (h.r - 1) ** 2) ||
    fenced(x, z, 9 + half) ||
    underLowDeck(x, z, half);
  // a long stretch whose ends and middle are ashore can still cross open water (the map's own Lions Gate Bridge, at
  // the water's level across the First Narrows)
  const overWater = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    for (let s = 3; s < L - 1; s += 3) if (sdfAt(ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L) < -1) return true;
    return false;
  };
  const underHero = (x: number, z: number, half: number) => HEROES.some((h) => Math.abs(h.x - x) < h.r - 1 + half - 0.4 && Math.abs(h.z - z) < h.r - 1 + half - 0.4);
  edges.forEach((e) => {
    const n = e.pts.length / 2;
    for (let i = 0; i < n; i++) e.y[i] = groundAt(e.pts[i * 2], e.pts[i * 2 + 1]);
    for (let i = 0; i + 1 < n; i++) {
      const mx = (e.pts[i * 2] + e.pts[i * 2 + 2]) / 2;
      const mz = (e.pts[i * 2 + 1] + e.pts[i * 2 + 3]) / 2;
      if (hidden(mx, mz, e.lay) || hidden(e.pts[i * 2], e.pts[i * 2 + 1], e.lay) || hidden(e.pts[i * 2 + 2], e.pts[i * 2 + 3], e.lay) || underHero(mx, mz, e.lay) || overWater(e.pts[i * 2], e.pts[i * 2 + 1], e.pts[i * 2 + 2], e.pts[i * 2 + 3])) e.shown[i] = 0;
    }
  });
  // over the Millennium's trench a road crosses on a bridge from one bank's lip to the other's, or ends at its rim
  const crossings = decideCrossings(nodes, edges);
  edges.forEach((e, k) => {
    bridgeTheCut(e, crossings.keep[k] ?? [], crossings.drop[k] ?? []);
  });
  // where decks meet at a node over the trench, one height for all of them (each edge found its banks on its own)
  nodes.forEach((nd, ni) => {
    const ends: [REdge, number][] = [];
    for (const k of nd.edges) {
      const e = edges[k];
      const m = e.pts.length / 2;
      if (e.a === ni && e.deck[0]) ends.push([e, 0]);
      if (e.b === ni && e.deck[m - 2]) ends.push([e, m - 1]);
    }
    if (ends.length < 2) return;
    const y = ends.reduce((acc, [e, j]) => acc + e.y[j], 0) / ends.length;
    for (const [e, j] of ends) e.y[j] = y;
  });
  tidyFragments(nodes, edges);
  addBridges(nodes, edges, hidden);
  // senákw's own ground (sites.ts) has no streets of its own drawn, and no traffic on them; after the network is laid,
  // so every edge keeps its place and the city its distances
  for (const e of edges) {
    if (e.span) continue;
    for (let i = 0; i + 1 < e.pts.length / 2; i++) if (inSenakwGround((e.pts[i * 2] + e.pts[i * 2 + 2]) / 2, (e.pts[i * 2 + 1] + e.pts[i * 2 + 3]) / 2, true)) e.shown[i] = 0;
  }
  // the segment hash, every segment in every cell its swept width (as laid out, the wider) touches
  edges.forEach((e, k) => {
    const n = e.pts.length / 2;
    for (let i = 0; i + 1 < n; i++) {
      const ax = e.pts[i * 2];
      const az = e.pts[i * 2 + 1];
      const bx = e.pts[i * 2 + 2];
      const bz = e.pts[i * 2 + 3];
      const s = segEdge.length;
      segEdge.push(k);
      segIdx.push(i);
      const pad = e.lay + 1;
      for (let ci = Math.floor((Math.min(ax, bx) - pad) / H); ci <= Math.floor((Math.max(ax, bx) + pad) / H); ci++) {
        for (let cj = Math.floor((Math.min(az, bz) - pad) / H); cj <= Math.floor((Math.max(az, bz) + pad) / H); cj++) {
          const key = ci * 100000 + cj;
          const c = hash.get(key);
          if (c) c.push(s);
          else hash.set(key, [s]);
        }
      }
    }
  });
  // Broadway over the subway's tunnel, from past its portal on toward UBC
  const tunnel: [number, number][] = [];
  for (let s = BROADWAY_PORTAL + 6; s <= BROADWAY_LINE.len; s += 4) {
    const p = BROADWAY_LINE.curve.getPointAt(s / BROADWAY_LINE.len);
    tunnel.push([p.x, p.z]);
  }
  for (const e of edges) {
    if (!/Broadway/.test(e.name)) continue;
    const [mx, mz] = pointAt(e, e.len / 2);
    if (tunnel.some(([x, z]) => (x - mx) ** 2 + (z - mz) ** 2 < 100)) e.subway = e.pts[e.pts.length - 2] < e.pts[0] ? 1 : 2;
  }
  built = { nodes, edges, ped };
  return built;
}

/**
 * The fenced right-of-way the streets end at: the Expo where it runs at grade on its bed, the Millennium and the
 * Broadway Extension where they run at grade (not in the cut, not up on a viaduct), as points every 2 units.
 */
const fence = new Map<number, [number, number][]>();
function buildFence(): void {
  const add = (x: number, z: number) => {
    const k = Math.floor(x / 16) * 100000 + Math.floor(z / 16);
    const c = fence.get(k);
    if (c) c.push([x, z]);
    else fence.set(k, [[x, z]]);
  };
  const f = makeFrame();
  for (let s = 0; s <= LEN; s += 2) {
    if (lowAt(s) < 0.4) continue;
    frameAt(s, f);
    add(f.p.x, f.p.z);
  }
  for (const [ln, end] of [
    [MILL_LINE, MILL_LINE.len],
    [BROADWAY_LINE, BROADWAY_PORTAL],
  ] as const) {
    for (let s = 0; s <= end; s += 2) {
      const p = ln.curve.getPointAt(s / ln.len);
      // at grade, or a deck too low over the ground for a street to pass under and too high for one to bridge
      const over = p.y - demAt(p.x, p.z);
      if (profileAt(ln, "low", s) - profileAt(ln, "cut", s) < 0.5 && (over > 4.5 || over < -3)) continue;
      add(p.x, p.z);
    }
  }
}
function fenced(x: number, z: number, r: number): boolean {
  const ci = Math.floor(x / 16);
  const cj = Math.floor(z / 16);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const c = fence.get((ci + di) * 100000 + (cj + dj));
      if (c && c.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < r * r)) return true;
    }
  }
  return false;
}

/** Where an edge runs over a rail trench and its walls: [from, to] distances along it, in 1-unit steps. */
function cutRuns(e: REdge): [number, number][] {
  const steps = Math.max(1, Math.ceil(e.len));
  let run0 = -1;
  const runs: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const s = (k / steps) * e.len;
    const [x, z] = pointAt(e, s);
    const over = inRailCut(x, z, TRENCH.wall);
    if (over && run0 < 0) run0 = s;
    if (!over && run0 >= 0) {
      runs.push([run0, s]);
      run0 = -1;
    }
  }
  if (run0 >= 0) runs.push([run0, e.len]);
  return runs;
}

/**
 * Which roads cross the cut on a bridge and which end at its rim. A street running along the trench rather than across
 * it (within about 50 degrees of its line) ends at the rim, as the real ones do; an arterial keeps its bridge whatever
 * its angle; none ends in a dead end over the trench. No bridge carries a junction: where roads meet over the trench, the straightest pair of the most important
 * roads carries on across and the others end at the rim.
 */
function decideCrossings(nodes: RNode[], edges: REdge[]): { keep: [number, number][][]; drop: [number, number][][] } {
  const keep: [number, number][][] = [];
  const drop: [number, number][][] = [];
  // the run's own heading against the trench's at its middle
  const along = (e: REdge, [s0, s1]: [number, number]) => {
    const [ax, az] = pointAt(e, s0);
    const [bx, bz] = pointAt(e, s1);
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 2) return false;
    const axis = cutAxis((ax + bx) / 2, (az + bz) / 2);
    return !!axis && Math.abs(((bx - ax) * axis[0] + (bz - az) * axis[1]) / L) > 0.64;
  };
  // the runs over a segment that is drawn (a run wholly over hidden road does not count)
  const drawn = (e: REdge, [s0, s1]: [number, number]) => {
    const n = e.pts.length / 2;
    for (let i = 0; i + 1 < n; i++) if (e.shown[i] && e.cum[i + 1] > s0 && e.cum[i] < s1) return true;
    return false;
  };
  // a run that ends in a dead end over the trench would be a bridge to nowhere
  const deadEnd = (e: REdge, [s0, s1]: [number, number]) => (s0 < 0.5 && nodes[e.a].deg === 1) || (s1 > e.len - 0.5 && nodes[e.b].deg === 1);
  edges.forEach((e, k) => {
    keep[k] = [];
    drop[k] = [];
    for (const r of cutRuns(e)) {
      if (!drawn(e, r)) continue;
      ((e.cls >= 2 && along(e, r)) || deadEnd(e, r) ? drop[k] : keep[k]).push(r);
    }
  });
  // the bearing of an edge where it leaves a node (the network is not built yet: approachAngle cannot be used)
  const leaving = (e: REdge, node: number) => {
    const n = e.pts.length / 2;
    const [x0, z0, x1, z1] = e.a === node ? [e.pts[0], e.pts[1], e.pts[2], e.pts[3]] : [e.pts[n * 2 - 2], e.pts[n * 2 - 1], e.pts[n * 2 - 4], e.pts[n * 2 - 3]];
    return Math.atan2(z1 - z0, x1 - x0);
  };
  // the junctions over the trench: each arm's kept run that reaches the node
  const touching = (k: number, node: number) => {
    const e = edges[k];
    if (e.a === node) return keep[k].find(([s0]) => s0 < 0.5);
    if (e.b === node) return keep[k].find(([, s1]) => s1 > e.len - 0.5);
    return undefined;
  };
  nodes.forEach((nd, ni) => {
    const arms = nd.edges.map((k) => ({ k, run: touching(k, ni) })).filter((a) => a.run);
    if (arms.length < 3) return;
    // the through pair: the most important roads, then the straightest
    let best: [number, number] = [0, 1];
    let score = -Infinity;
    for (let i = 0; i < arms.length; i++) {
      for (let j = i + 1; j < arms.length; j++) {
        const ei = edges[arms[i].k];
        const ej = edges[arms[j].k];
        const di = leaving(ei, ni);
        const dj = leaving(ej, ni);
        const straight = -Math.cos(di - dj);
        const sc = -(ei.cls + ej.cls) * 2 + straight + (ei.name && ei.name === ej.name ? 1 : 0);
        if (sc > score) {
          score = sc;
          best = [i, j];
        }
      }
    }
    arms.forEach((a, i) => {
      if (i === best[0] || i === best[1]) return;
      keep[a.k] = keep[a.k].filter((r) => r !== a.run);
      drop[a.k].push(a.run!);
    });
  });
  return { keep, drop };
}

/**
 * Carries a road over a rail trench (the Grandview Cut, the Broadway Extension's cutting) on a bridge: a straight deck
 * from the lip of one bank to the lip of the other (the highest ground just outside the trench), so a street crossing
 * the cut runs up onto its bridge and off the far side with no step; where it ends at the rim instead, the road stops
 * at the trench's edge. Its centreline gains a point at each end of each deck and of each dropped run; the road's
 * height along a deck is the deck's, or the ground's where that is higher.
 */
function bridgeTheCut(e: REdge, runs: [number, number][], dropped: [number, number][]): void {
  if (!runs.length && !dropped.length) return;
  // a point along the road, and past either end of the edge straight on (where the road carries on over a node in
  // the trench, its next edge goes the same way, and finds the same banks)
  const n0 = e.pts.length / 2;
  const at = (sv: number): [number, number] => {
    if (sv >= 0 && sv <= e.len) return pointAt(e, sv);
    const [i0, i1] = sv < 0 ? [1, 0] : [n0 - 2, n0 - 1];
    const ax = e.pts[i0 * 2];
    const az = e.pts[i0 * 2 + 1];
    const bx = e.pts[i1 * 2];
    const bz = e.pts[i1 * 2 + 1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const over = sv < 0 ? -sv : sv - e.len;
    return [bx + ((bx - ax) / L) * over, bz + ((bz - az) / L) * over];
  };
  const groundOn = (sv: number) => groundAt(...at(sv));
  // each bank's lip: out of the trench (beyond the edge's end if need be), then the highest ground a few units on
  const lip = (from: number, dir: -1 | 1): [number, number] => {
    let sv = from;
    for (let k = 0; k < 160 && inRailCut(...at(sv), TRENCH.wall); k++) sv += dir * 0.5;
    let best = sv;
    let by = groundOn(sv);
    for (let t = 0.5; t <= 5; t += 0.5) {
      const y = groundOn(sv + dir * t);
      if (y > by + 0.05) {
        by = y;
        best = sv + dir * t;
      }
    }
    return [best, by];
  };
  const spans = runs.map(([s0, s1]) => {
    const [a, ya] = lip(s0, -1);
    const [b, yb] = lip(s1, 1);
    return { a, b, ya, yb };
  });
  const deckAt = (sv: number): number | null => {
    for (const { a, b, ya, yb } of spans) if (sv >= a - 1e-3 && sv <= b + 1e-3) return ya + ((yb - ya) * (sv - a)) / Math.max(1e-3, b - a);
    return null;
  };
  // the centreline with a point at each end of each deck, keeping each new segment's hidden flag
  const n = e.pts.length / 2;
  const marks = [...spans.flatMap(({ a, b }) => [a, b]), ...dropped.flat()];
  const xs: number[] = [];
  const ss: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push(e.pts[i * 2], e.pts[i * 2 + 1]);
    ss.push(e.cum[i]);
    if (i + 1 < n) {
      for (const m of marks.filter((v) => v > e.cum[i] + 0.2 && v < e.cum[i + 1] - 0.2).sort((p, q) => p - q)) {
        const [x, z] = pointAt(e, m);
        xs.push(x, z);
        ss.push(m);
      }
    }
  }
  const pts = new Float32Array(xs);
  const m = pts.length / 2;
  const cum = new Float32Array(m);
  for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  const y = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const g = groundAt(pts[i * 2], pts[i * 2 + 1]);
    const d = deckAt(ss[i]);
    y[i] = d == null ? g : Math.max(g, d);
  }
  const shown = new Uint8Array(m - 1).fill(1);
  const deck = new Uint8Array(m - 1);
  for (let i = 0; i + 1 < m; i++) {
    const mid = (ss[i] + ss[i + 1]) / 2;
    deck[i] = deckAt(mid) != null ? 1 : 0;
    const old = e.cum.findIndex((c, j) => j + 1 < n && mid >= c && mid <= e.cum[j + 1]);
    if (old >= 0) shown[i] = e.shown[old];
    if (dropped.some(([s0, s1]) => mid > s0 && mid < s1)) shown[i] = 0;
  }
  e.pts = pts;
  e.cum = cum;
  e.y = y;
  e.shown = shown;
  e.deck = deck;
}

/**
 * What hiding roads (for sets, landmarks, the trench, the at-grade line) leaves behind is tidied away: a piece of road
 * left floating between hidden stretches, a stub a few units long poking out of a junction into a hidden stretch, and
 * any small island of road no longer joined to the network.
 */
function tidyFragments(nodes: RNode[], edges: REdge[]): void {
  type Run = { k: number; i0: number; i1: number; len: number; atA: boolean; atB: boolean };
  for (let pass = 0; pass < 3; pass++) {
    const runs: Run[] = [];
    edges.forEach((e, k) => {
      const n = e.pts.length / 2;
      let i0 = -1;
      for (let i = 0; i <= n - 1; i++) {
        const on = i < n - 1 && e.shown[i] === 1;
        if (on && i0 < 0) i0 = i;
        if (!on && i0 >= 0) {
          runs.push({ k, i0, i1: i, len: e.cum[i] - e.cum[i0], atA: i0 === 0, atB: i === n - 1 });
          i0 = -1;
        }
      }
    });
    // how many drawn roads leave each node
    const arms = new Map<number, number>();
    for (const r of runs) {
      const e = edges[r.k];
      if (r.atA) arms.set(e.a, (arms.get(e.a) ?? 0) + 1);
      if (r.atB) arms.set(e.b, (arms.get(e.b) ?? 0) + 1);
    }
    const hide = (r: Run) => {
      for (let i = r.i0; i < r.i1; i++) edges[r.k].shown[i] = 0;
    };
    // the islands: runs joined through the nodes they reach
    const parent = runs.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const byNode = new Map<number, number>();
    runs.forEach((r, i) => {
      const e = edges[r.k];
      for (const [at, node] of [
        [r.atA, e.a],
        [r.atB, e.b],
      ] as const) {
        if (!at) continue;
        const j = byNode.get(node);
        if (j == null) byNode.set(node, i);
        else parent[find(i)] = find(j);
      }
    });
    const size = new Map<number, number>();
    runs.forEach((r, i) => size.set(find(i), (size.get(find(i)) ?? 0) + r.len));
    let changed = false;
    runs.forEach((r, i) => {
      const e = edges[r.k];
      const ends = (r.atA ? 1 : 0) + (r.atB ? 1 : 0);
      const toJunction = (r.atA && (arms.get(e.a) ?? 0) >= 2) || (r.atB && (arms.get(e.b) ?? 0) >= 2);
      const floating = ends === 0 && r.len < 24;
      const stub = ends === 1 && r.len < 9 && toJunction && !(r.atA && r.atB);
      const island = (size.get(find(i)) ?? 0) < 26;
      // a short spur that hiding cut off (it ran on into a set, a landmark or a plaza, and the data has more road
      // beyond): it would end in nothing, so it goes back to its junction. The streets that end at the Grandview Cut's
      // rim stay: they end there as the real ones do; so do those that end at a hero tower's forecourt, which stands
      // across them as a superblock does
      const atHero = (x: number, z: number) => HEROES.some((h) => Math.abs(h.x - x) < h.r + 4 && Math.abs(h.z - z) < h.r + 4);
      const cutOff = (atNode: boolean, node: number, s: number) => {
        if (atNode) return nodes[node].deg >= 2 && (arms.get(node) ?? 0) === 1;
        const [px, pz] = pointAt(e, s);
        return !inRailCut(px, pz, TRENCH.wall + 4) && !atHero(px, pz);
      };
      const deadA = cutOff(r.atA, e.a, e.cum[r.i0]);
      const deadB = cutOff(r.atB, e.b, e.cum[r.i1]);
      const spur = r.len < 30 && ((deadA && r.atB && (arms.get(e.b) ?? 0) >= 2) || (deadB && r.atA && (arms.get(e.a) ?? 0) >= 2));
      if (floating || stub || island || spur) {
        hide(r);
        changed = true;
      }
    });
    if (!changed) break;
  }
}

/** How far under a deck's road the cars' deck height is given (traffic.ts lifts a car on a deck by 0.12). */
const RIDE = 0.1;
/** The causeway's missing links, one way each, from the map's node at the first point to the one at the second. */
const CAUSEWAY_MENDS: [[number, number], [number, number]][] = [
  [
    [-190.2, -136.8],
    [-200.2, -141.2],
  ],
  [
    [-195.3, -107.5],
    [-195.7, -101.7],
  ],
];
/**
 * The bridges, carried into the network:
 * - over False Creek, each from the end of the street it carries on at one end (sites.ts BRIDGES) to the other's, along
 *   its deck at the deck's height, two lanes each way where its markings put them;
 * - the Lions Gate, from the causeway (its junction nearest the deck's south end, short of it) up a stretch of new road
 *   through the park to where the deck comes down to the ground, then over the First Narrows to its north end on the
 *   North Shore, where the map ends (traffic.ts brings cars in from there and takes them off), one lane each way in
 *   its outer lanes.
 * A span is drawn by its bridge, not as a street; the causeway's new stretch is a street like any other.
 */
function addBridges(nodes: RNode[], edges: REdge[], hidden: (x: number, z: number, half: number) => boolean): void {
  const nodeAt = (x: number, z: number, r = 1.5) => {
    let best = -1;
    let bd = r;
    nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const add = (a: number, b: number, xs: number[], ys: number[], cls: RoadClass, half: number, lanes: number, name: string, span: boolean, oneway: -1 | 0 | 1 = 0) => {
    const pts = new Float32Array(xs);
    const n = pts.length / 2;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    const shown = new Uint8Array(n - 1);
    if (!span) for (let i = 0; i + 1 < n; i++) shown[i] = hidden((pts[i * 2] + pts[i * 2 + 2]) / 2, (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2, half) ? 0 : 1;
    const k = edges.length;
    edges.push({ a, b, cls, half, lay: half, oneway, median: false, bridge: !oneway, lanes, name, pts, cum, y: Float32Array.from(ys), len: cum[n - 1], shown, deck: new Uint8Array(n - 1).fill(span ? 1 : 0), subway: 0, span });
    for (const nd of [a, b]) {
      nodes[nd].edges.push(k);
      nodes[nd].deg++;
    }
  };
  for (const br of BRIDGES) {
    const a = nodeAt(...br.a);
    const b = nodeAt(...br.b);
    if (a < 0 || b < 0) continue;
    const d = deckOf(br);
    const xs: number[] = [];
    const ys: number[] = [];
    d.T.forEach((t, i) => {
      xs.push(...d.at(t, 0));
      ys.push(d.deck[i] + 0.04 - RIDE);
    });
    // its ends on the streets' ends exactly
    xs.splice(0, 2, nodes[a].x, nodes[a].z);
    xs.splice(xs.length - 2, 2, nodes[b].x, nodes[b].z);
    // an arterial, its lanes centred where the deck's markings put them (the lane offsets come in from the kerb's walk)
    add(a, b, xs, ys, 1, 0.93 * br.half + WALK[1], 2, br.name, true);
  }
  // the causeway's carriageways where the map lost their ends: the northbound one on into the junction the bridge's road
  // leaves from, the southbound one out onto Georgia Street (without them the causeway's south end is a pocket the cars
  // could drive into and never leave, and the park and the bridge beyond it are cut off from the city)
  for (const [[ax, az], [bx, bz]] of CAUSEWAY_MENDS) {
    const a = nodeAt(ax, az);
    const b = nodeAt(bx, bz);
    if (a < 0 || b < 0) continue;
    const m = Math.max(1, Math.ceil(Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z) / 2));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k <= m; k++) {
      const x = nodes[a].x + ((nodes[b].x - nodes[a].x) * k) / m;
      const z = nodes[a].z + ((nodes[b].z - nodes[a].z) * k) / m;
      xs.push(x, z);
      ys.push(groundAt(x, z));
    }
    add(a, b, xs, ys, 0, HALF[2], 1, "Stanley Park Causeway", false, 1);
  }
  const lg = lionsGateDeck();
  let join = -1;
  let jd = 90;
  nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - lg.X, n.z - lg.zEndS);
    if (d < jd && n.z > lg.zEndS + 20 && n.edges.some((k) => edges[k].name === "Stanley Park Causeway")) {
      jd = d;
      join = i;
    }
  });
  if (join < 0) return;
  const south = nodes.push({ x: lg.X, z: lg.zEndS, edges: [], signal: false, deg: 0 }) - 1;
  const north = nodes.push({ x: lg.X, z: lg.zEndN, edges: [], signal: false, deg: 0 }) - 1;
  // north out of the junction, well clear of the loop the causeway takes west, and swinging over to come onto the
  // deck straight
  const [jx, jz] = [nodes[join].x, nodes[join].z];
  const reach = (jz - lg.zEndS) * 0.4;
  const m = Math.ceil(jd / 4);
  const ax: number[] = [];
  const ay: number[] = [];
  for (let k = 0; k <= m; k++) {
    const u = k / m;
    const [b0, b1, b2, b3] = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3];
    const x = (b0 + b1) * jx + (b2 + b3) * lg.X;
    const z = b0 * jz + b1 * (jz - reach) + b2 * (lg.zEndS + reach) + b3 * lg.zEndS;
    ax.push(x, z);
    ay.push(groundAt(x, z));
  }
  add(join, south, ax, ay, 0, HALF[0], 1, "Stanley Park Causeway", false);
  const sx: number[] = [];
  const sy: number[] = [];
  for (let z = lg.zEndS; z > lg.zEndN; z -= 2) {
    sx.push(lg.X, z);
    sy.push(lg.deckAt(z) - RIDE);
  }
  sx.push(lg.X, lg.zEndN);
  sy.push(lg.deckAt(lg.zEndN) - RIDE);
  // one lane each way, in the outer lanes 2.4 either side of the middle
  add(south, north, sx, sy, 0, 4.8, 1, "Lions Gate Bridge", true);
}

/** Centreline point at distance s along an edge. */
export function pointAt(e: REdge, s: number): [number, number] {
  const n = e.pts.length / 2;
  if (s <= 0) return [e.pts[0], e.pts[1]];
  for (let i = 1; i < n; i++) {
    if (e.cum[i] >= s) {
      const u = (s - e.cum[i - 1]) / (e.cum[i] - e.cum[i - 1] || 1);
      return [e.pts[i * 2 - 2] + (e.pts[i * 2] - e.pts[i * 2 - 2]) * u, e.pts[i * 2 - 1] + (e.pts[i * 2 + 1] - e.pts[i * 2 - 1]) * u];
    }
  }
  return [e.pts[n * 2 - 2], e.pts[n * 2 - 1]];
}
/**
 * Where a junction's surface is: on a deck when one of its roads comes in on one (over the Grandview Cut), else null
 * (the drawn ground).
 */
export function nodeDeck(node: number): number | null {
  const { nodes, edges } = roads();
  let y: number | null = null;
  for (const k of nodes[node].edges) {
    const e = edges[k];
    const n = e.pts.length / 2;
    const atA = e.a === node;
    if (atA ? e.deck[0] : e.deck[n - 2]) y = Math.max(y ?? -1e9, atA ? e.y[0] : e.y[n - 1]);
  }
  return y;
}
/** Road height at distance s along an edge (the ground, or a deck over the cut). */
export function heightAt(e: REdge, s: number): number {
  const n = e.pts.length / 2;
  if (s <= 0) return e.y[0];
  for (let i = 1; i < n; i++) {
    if (e.cum[i] >= s) {
      const u = (s - e.cum[i - 1]) / (e.cum[i] - e.cum[i - 1] || 1);
      return e.y[i - 1] + (e.y[i] - e.y[i - 1]) * u;
    }
  }
  return e.y[n - 1];
}

export type Near = { edge: number; seg: number; t: number; d: number; s: number; side: number };
/**
 * The nearest road centreline within 14 units: edge, segment, parameter, distance, distance along, side (+1 right of
 * a→b); nearest by kerb, each road at its drawn width (or `laid`, its laid-out width).
 */
export function roadNear(x: number, z: number, out: Near, laid = false): Near | null {
  const { edges } = roads();
  const c = hash.get(Math.floor(x / H) * 100000 + Math.floor(z / H));
  if (!c) return null;
  let best = Infinity;
  for (const si of c) {
    const e = edges[segEdge[si]];
    const i = segIdx[si];
    const ax = e.pts[i * 2];
    const az = e.pts[i * 2 + 1];
    const ex = e.pts[i * 2 + 2] - ax;
    const ez = e.pts[i * 2 + 3] - az;
    const L2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
    const dx = x - ax - t * ex;
    const dz = z - az - t * ez;
    // measured from the road's edge, so a wide road counts as near as its kerb
    const d = Math.hypot(dx, dz) - (laid ? e.lay : e.half);
    if (d < best) {
      best = d;
      out.edge = segEdge[si];
      out.seg = i;
      out.t = t;
      out.d = Math.hypot(dx, dz);
      out.s = e.cum[i] + t * (e.cum[i + 1] - e.cum[i]);
      out.side = ex * dz - ez * dx > 0 ? 1 : -1;
    }
  }
  return best < Infinity ? out : null;
}
/** The direction of the nearest road centreline within r units (searching the neighbouring cells too), or null. */
export function nearestRoadDir(x: number, z: number, r: number): [number, number] | null {
  const { edges } = roads();
  let best = r;
  let dir: [number, number] | null = null;
  const R = Math.ceil(r / H);
  const ci = Math.floor(x / H);
  const cj = Math.floor(z / H);
  for (let di = -R; di <= R; di++) {
    for (let dj = -R; dj <= R; dj++) {
      for (const si of hash.get((ci + di) * 100000 + (cj + dj)) ?? []) {
        const e = edges[segEdge[si]];
        const i = segIdx[si];
        const ax = e.pts[i * 2];
        const az = e.pts[i * 2 + 1];
        const ex = e.pts[i * 2 + 2] - ax;
        const ez = e.pts[i * 2 + 3] - az;
        const L2 = ex * ex + ez * ez || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
        const d = Math.hypot(x - ax - t * ex, z - az - t * ez);
        if (d < best) {
          best = d;
          const L = Math.sqrt(L2);
          dir = [ex / L, ez / L];
        }
      }
    }
  }
  return dir;
}
const scratch: Near = { edge: 0, seg: 0, t: 0, d: 0, s: 0, side: 1 };
/** Distance from the nearest road's edge (negative on a road); 99 where none is near. */
export function roadDist(x: number, z: number): number {
  const n = roadNear(x, z, scratch);
  return n ? n.d - roads().edges[n.edge].half : 99;
}
/** As roadDist, each road at the width the city was laid out against (REdge.lay). */
export function layDist(x: number, z: number): number {
  const n = roadNear(x, z, scratch, true);
  return n ? n.d - roads().edges[n.edge].lay : 99;
}
export const isRoad = (x: number, z: number, pad = 0): boolean => roadDist(x, z) < pad;

/* ------------------------------------------------------------------ junctions */

export type Junction = { x: number; z: number; poly: [number, number][]; setback: Map<number, number> };

/**
 * A junction where three or more drawn roads meet: each road's kerbs run in to meet its neighbours' (the corner where
 * one road's left kerb crosses the next one's right), each road stops short of the junction by its corners' distance,
 * and the junction itself is one asphalt polygon through those points. `laid`: as the roads were laid out (REdge.lay).
 */
export function junction(node: number, laid = false): Junction | null {
  const { nodes, edges } = roads();
  const nd = nodes[node];
  const arms: { k: number; ux: number; uz: number; h: number; ang: number; len: number }[] = [];
  for (const k of nd.edges) {
    const e = edges[k];
    const n = e.pts.length / 2;
    const atA = e.a === node;
    // only the roads drawn up to this junction
    if (!(atA ? e.shown[0] : e.shown[n - 2])) continue;
    const [x0, z0, x1, z1] = atA ? [e.pts[0], e.pts[1], e.pts[2], e.pts[3]] : [e.pts[n * 2 - 2], e.pts[n * 2 - 1], e.pts[n * 2 - 4], e.pts[n * 2 - 3]];
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    arms.push({ k, ux: (x1 - x0) / L, uz: (z1 - z0) / L, h: laid ? e.lay : e.half, ang: Math.atan2(z1 - z0, x1 - x0), len: e.len });
  }
  if (arms.length < 3) return null;
  arms.sort((a, b) => a.ang - b.ang);
  const sb = arms.map(() => 0);
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i];
    const b = arms[(i + 1) % arms.length];
    // a's left kerb (toward b) against b's right kerb (toward a)
    const na = [-a.uz, a.ux];
    const nb = [-b.uz, b.ux];
    const rx = -nb[0] * b.h - na[0] * a.h;
    const rz = -nb[1] * b.h - na[1] * a.h;
    const det = a.ux * -b.uz - a.uz * -b.ux;
    let t = Math.max(a.h, b.h) * 0.8;
    let s = t;
    if (Math.abs(det) > 0.12) {
      t = (rx * -b.uz - rz * -b.ux) / det;
      s = (a.ux * rz - a.uz * rx) / det;
    }
    const cap = Math.max(a.h, b.h) * 2.4;
    sb[i] = Math.max(sb[i], Math.min(cap, Math.max(0.4, t)));
    const j = (i + 1) % arms.length;
    sb[j] = Math.max(sb[j], Math.min(cap, Math.max(0.4, s)));
  }
  const poly: [number, number][] = [];
  const setback = new Map<number, number>();
  arms.forEach((a, i) => {
    const d = Math.min(sb[i] + 0.2, a.len * 0.45);
    setback.set(a.k, d);
    const nx = -a.uz;
    const nz = a.ux;
    poly.push([nd.x + a.ux * d - nx * a.h, nd.z + a.uz * d - nz * a.h], [nd.x + a.ux * d + nx * a.h, nd.z + a.uz * d + nz * a.h]);
  });
  return { x: nd.x, z: nd.z, poly, setback };
}

/* ------------------------------------------------------------------ signals */

/** A junction's cycle in seconds: a minute where two arterials meet, 45 s elsewhere. */
export function signalCycle(node: number): number {
  const { nodes, edges } = roads();
  const major = nodes[node].edges.filter((k) => edges[k].cls <= 1).length;
  return major >= 2 ? 60 : 45;
}
/** The bearing (radians, mod π) of a junction's main road, from its highest-class edge. */
export function mainAxis(node: number): number {
  const { nodes, edges } = roads();
  let best = -1;
  let ang = 0;
  for (const k of nodes[node].edges) {
    const e = edges[k];
    const score = (4 - e.cls) * 1000 + e.len;
    if (score <= best) continue;
    best = score;
    ang = approachAngle(k, node);
  }
  return ang;
}
/** Bearing of an edge where it leaves a node. */
export function approachAngle(edge: number, node: number): number {
  const e = roads().edges[edge];
  const n = e.pts.length / 2;
  const fromA = e.a === node;
  const [x0, z0, x1, z1] = fromA ? [e.pts[0], e.pts[1], e.pts[2], e.pts[3]] : [e.pts[n * 2 - 2], e.pts[n * 2 - 1], e.pts[n * 2 - 4], e.pts[n * 2 - 3]];
  return Math.atan2(z1 - z0, x1 - x0);
}
/** Which of a junction's two signal phases an approach belongs to: 0 along the main road, 1 across it. */
export function approachAxis(edge: number, node: number): 0 | 1 {
  const d = Math.abs(approachAngle(edge, node) - mainAxis(node)) % Math.PI;
  return Math.min(d, Math.PI - d) < Math.PI / 4 ? 0 : 1;
}
/** A junction's place in its cycle (0–1), so neighbouring junctions do not change together. */
export const signalOffset = (n: number): number => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};
/** 0 green, 1 amber, 2 red, for phase `axis` of junction `node` at time t: each phase green, 3 s amber, 2 s all-red. */
export function signalState(node: number, axis: 0 | 1, t: number): 0 | 1 | 2 {
  const C = signalCycle(node);
  const u = (((t + signalOffset(node) * C) % C) + C) % C;
  const half = C / 2;
  const v = axis === 0 ? u : (u + half) % C;
  return v < half - 5 ? 0 : v < half - 2 ? 1 : 2;
}

/* ------------------------------------------------------------------ land use */

let lu: Uint8Array | null = null;
/** Land use under a point: 0 none, 1 single-family, 2 duplex, 3 apartments, 4 commercial, 5 towers, 6 historic, 7 industrial. */
export function landClass(x: number, z: number): number {
  if (!lu) {
    const rle = decode(LANDUSE.rle);
    lu = new Uint8Array(LANDUSE.nx * LANDUSE.nz);
    let k = 0;
    for (let i = 0; i + 1 < rle.length; i += 2) {
      lu.fill(rle[i], k, k + rle[i + 1]);
      k += rle[i + 1];
    }
  }
  const i = Math.round((x - LANDUSE.x0) / LANDUSE.step);
  const j = Math.round((z - LANDUSE.z0) / LANDUSE.step);
  if (i < 0 || j < 0 || i >= LANDUSE.nx || j >= LANDUSE.nz) return 0;
  return lu[j * LANDUSE.nx + i];
}
