#!/usr/bin/env node
/**
 * Bakes Vancouver's streets around the ride into three generated modules:
 * - `components/train/streetData.ts`: the road network, generalized from OpenStreetMap. Every motorway, arterial and
 *   collector at its true position; local streets thinned to about every second one (the ride draws its buildings and
 *   cars four to eight times map scale, so the real ~110 m blocks would not hold them); dual carriageways merged onto
 *   one centreline; the traffic signals (OSM and the City of Vancouver's own list) on the kept roads.
 * - `components/train/parkData.ts`: park outlines (City of Vancouver; OSM in Burnaby).
 * - `components/train/landuseData.ts`: a 6-unit land-use raster from the City's zoning districts (OSM land use in
 *   Burnaby), which decides where houses, apartments, shops, towers and industry stand.
 * Everything fetched is cached in scripts/osm/.cache. Run with `npm run bake:streets`; counts land in report.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { overpass, vancouver } from "../osm/lib/fetch.mjs";
import { area, bboxOf, dist, inPoly, llToXZ, NEAR, segDist, simplify } from "../osm/lib/geo.mjs";
import { b64, header, q10, writeModule } from "../osm/lib/pack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SOURCES = "OpenStreetMap (© OpenStreetMap contributors, ODbL) and City of Vancouver Open Data (Open Government Licence – Vancouver)";
// the least distance between kept parallel streets (secondary arterials, collectors, local streets alike): about every
// second real block, so a block drawn larger than life still holds its buildings, as the ride's objects are
const SPACING = { 1: 18, 2: 18, 3: 18 };
// a street that competes for its place: a secondary arterial, a collector or a local street (the primaries and the
// motorways always stay)
const thinnable = (e) => e.cls >= 2 || (e.cls === 1 && /^secondary/.test(e.hw));
const report = {};

// ------------------------------------------------------------------ the water field, from the terrain bake
const terrain = fs.readFileSync(path.join(ROOT, "components/train/terrainData.ts"), "utf8");
const SDF = JSON.parse(terrain.match(/export const SDF_CITY = (\{[^}]+\})/)[1]);
const sdfData = new Int8Array(Buffer.from(terrain.match(/SDF_CITY_DATA =\s*"([^"]+)"/)[1], "base64"));
const sdfAt = (x, z) => {
  const fx = Math.min(SDF.nx - 1.001, Math.max(0, (x - SDF.x0) / SDF.step));
  const fz = Math.min(SDF.nz - 1.001, Math.max(0, (z - SDF.z0) / SDF.step));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const g = (a, b) => sdfData[b * SDF.nx + a] / SDF.scale;
  return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
};
// the three bridges the ride builds as landmarks (sites.ts BRIDGES): their road is the landmark's own deck
const sites = fs.readFileSync(path.join(ROOT, "components/train/sites.ts"), "utf8");
const LANDMARK_BRIDGES = [...sites.matchAll(/name: "([^"]+ Bridge)", a: \[(-?[\d.]+), (-?[\d.]+)\], b: \[(-?[\d.]+), (-?[\d.]+)\], half: ([\d.]+)/g)].map((m) => ({ name: m[1], a: [+m[2], +m[3]], b: [+m[4], +m[5]], half: +m[6] }));
if (LANDMARK_BRIDGES.length !== 3) throw new Error(`expected 3 landmark bridges in sites.ts, found ${LANDMARK_BRIDGES.length}`);

// ------------------------------------------------------------------ fetch
const ROADS = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";
const ways = new Map();
const signalNodes = new Map();
const TX = 3;
const TZ = 3;
for (let ti = 0; ti < TX; ti++) {
  for (let tj = 0; tj < TZ; tj++) {
    const b = {
      x0: NEAR.x0 + ((NEAR.x1 - NEAR.x0) * ti) / TX,
      x1: NEAR.x0 + ((NEAR.x1 - NEAR.x0) * (ti + 1)) / TX,
      z0: NEAR.z0 + ((NEAR.z1 - NEAR.z0) * tj) / TZ,
      z1: NEAR.z0 + ((NEAR.z1 - NEAR.z0) * (tj + 1)) / TZ,
    };
    const box = bboxOf(b, 12);
    const r = await overpass(`[out:json][timeout:180];(way["highway"~"^(${ROADS})$"](${box});node["highway"="traffic_signals"](${box});node["crossing"="traffic_signals"](${box}););out geom;`, `streets ${ti},${tj}`);
    for (const e of r.elements) {
      if (e.type === "way" && e.geometry?.length > 1) ways.set(e.id, e);
      else if (e.type === "node") signalNodes.set(e.id, e);
    }
  }
}
// parks and Burnaby's land use come in two smaller queries; either may be skipped if Overpass is down (the City's parks
// cover Vancouver, and Burnaby then has no land use)
const optional = async (q, label) => {
  try {
    return await overpass(q, label);
  } catch (e) {
    console.log(`  ${label}: skipped (${e.message})`);
    report[`skipped ${label}`] = true;
    return { elements: [] };
  }
};
const parksOsm = await optional(`[out:json][timeout:120];way["leisure"~"^(park|nature_reserve)$"](${bboxOf({ x0: 690, x1: NEAR.x1, z0: NEAR.z0, z1: NEAR.z1 }, 20)});out geom;`, "Burnaby parks");
const landOsm = await optional(`[out:json][timeout:120];way["landuse"~"^(residential|commercial|retail|industrial)$"](${bboxOf({ x0: 690, x1: NEAR.x1, z0: NEAR.z0, z1: NEAR.z1 }, 20)});out geom;`, "Burnaby land use");
const extras = { elements: [...parksOsm.elements, ...landOsm.elements] };
const vanSignals = await vancouver("traffic-signals");
const vanParks = await vancouver("parks-polygon-representation");
const vanZoning = await vancouver("zoning-districts-and-labels");
report.osmWays = ways.size;
report.osmSignals = signalNodes.size;
report.cityofVancouverSignals = vanSignals.features.length;

// ------------------------------------------------------------------ classify
const CLASS = (h) => (/^(motorway|trunk)/.test(h) ? 0 : /^(primary|secondary)/.test(h) ? 1 : /^tertiary/.test(h) ? 2 : 3);
const pos = new Map(); // node id → [x, z]
for (const w of ways.values()) w.nodes.forEach((n, i) => pos.set(n, llToXZ(w.geometry[i].lat, w.geometry[i].lon)));
const R = [];
for (const w of ways.values()) {
  const t = w.tags ?? {};
  if (t.tunnel && t.tunnel !== "no") continue;
  if (t.area === "yes" || t.access === "private") continue;
  const cls = CLASS(t.highway);
  const ow = t.oneway === "yes" || t.oneway === "1" || t.oneway === "true" ? 1 : t.oneway === "-1" ? -1 : t.junction === "roundabout" || /^motorway/.test(t.highway) ? 1 : 0;
  // lanes each way: OSM counts both directions of a two-way road
  const total = Number(t.lanes) || (cls <= 1 ? 4 : 2);
  const each = ow ? total : Math.max(1, Math.round(total / 2));
  R.push({ id: w.id, nodes: w.nodes.slice(), cls, hw: t.highway, oneway: ow, name: t.name ?? "", bridge: !!(t.bridge && t.bridge !== "no"), lanes: Math.max(1, Math.min(4, each)), median: false, drop: false });
}
const P = (n) => pos.get(n);
const polyOf = (r) => r.nodes.map(P);

// ------------------------------------------------------------------ dual carriageways onto one centreline
{
  const byName = new Map();
  for (const r of R) if (r.oneway && r.name && r.cls <= 2) (byName.get(r.name) ?? byName.set(r.name, []).get(r.name)).push(r);
  let merged = 0;
  for (const list of byName.values()) {
    for (const a of list) {
      if (a.drop) continue;
      const pa = polyOf(a);
      for (const b of list) {
        if (b === a || b.drop) continue;
        const pb = polyOf(b);
        // most of b runs beside a, the other way
        let near = 0;
        let opposite = 0;
        for (let i = 0; i < pb.length; i++) {
          let best = { d: Infinity, t: 0, k: 0 };
          for (let k = 0; k + 1 < pa.length; k++) {
            const s = segDist(pb[i], pa[k], pa[k + 1]);
            if (s.d < best.d) best = { ...s, k };
          }
          if (best.d < 3.6) {
            near++;
            const j = Math.min(pb.length - 1, i + 1);
            const i0 = Math.max(0, j - 1);
            const db = [pb[j][0] - pb[i0][0], pb[j][1] - pb[i0][1]];
            const da = [pa[best.k + 1][0] - pa[best.k][0], pa[best.k + 1][1] - pa[best.k][1]];
            if ((db[0] * da[0] + db[1] * da[1]) * a.oneway * b.oneway < 0) opposite++;
          }
        }
        if (near < pb.length * 0.6 || opposite < near * 0.6) continue;
        // a moves halfway toward b and carries both directions; b goes
        a.nodes.forEach((n) => {
          const p = P(n);
          let best = { d: Infinity, x: 0, z: 0 };
          for (let k = 0; k + 1 < pb.length; k++) {
            const s = segDist(p, pb[k], pb[k + 1]);
            if (s.d < best.d) best = { d: s.d, x: pb[k][0] + (pb[k + 1][0] - pb[k][0]) * s.t, z: pb[k][1] + (pb[k + 1][1] - pb[k][1]) * s.t };
          }
          if (best.d < 3.6) pos.set(n, [(p[0] + best.x) / 2, (p[1] + best.z) / 2]);
        });
        a.oneway = 0;
        a.median = true;
        b.drop = true;
        merged++;
      }
    }
  }
  report.dualCarriagewaysMerged = merged;
}

// ------------------------------------------------------------------ what the ride does not draw
const nearLandmarkBridge = (p) => LANDMARK_BRIDGES.some((b) => segDist(p, b.a, b.b).d < b.half + 5);
const inside = (p, m = 0) => p[0] > NEAR.x0 + m && p[0] < NEAR.x1 - m && p[1] > NEAR.z0 + m && p[1] < NEAR.z1 - m;
for (const r of R) {
  if (r.drop) continue;
  const pts = polyOf(r);
  const mid = pts[pts.length >> 1];
  if (!pts.some((p) => inside(p, 2))) r.drop = true;
  else if (pts.every((p) => sdfAt(...p) < -1.5)) r.drop = true;
  else if (nearLandmarkBridge(mid)) r.drop = true;
}

// ------------------------------------------------------------------ edges between junctions
// a cross street that met a dropped carriageway is carried on to the centreline that replaced it
const kept = R.filter((r) => !r.drop);
{
  const use = new Map();
  for (const r of kept) for (const n of r.nodes) use.set(n, (use.get(n) ?? 0) + 1);
  for (const r of kept) {
    for (const end of [0, r.nodes.length - 1]) {
      const n = r.nodes[end];
      if (use.get(n) > 1) continue;
      const p = P(n);
      let best = null;
      for (const o of kept) {
        if (o === r || o.cls > r.cls + 1) continue;
        const po = polyOf(o);
        for (let k = 0; k + 1 < po.length; k++) {
          const s = segDist(p, po[k], po[k + 1]);
          if (s.d < 3 && (!best || s.d < best.d)) best = { d: s.d, o, k, t: s.t };
        }
      }
      if (!best) continue;
      const po = polyOf(best.o);
      const q = [po[best.k][0] + (po[best.k + 1][0] - po[best.k][0]) * best.t, po[best.k][1] + (po[best.k + 1][1] - po[best.k][1]) * best.t];
      pos.set(n, q);
      best.o.nodes.splice(best.k + 1, 0, n);
      use.set(n, 2);
    }
  }
}
const deg = new Map();
for (const r of kept) {
  r.nodes.forEach((n, i) => deg.set(n, (deg.get(n) ?? 0) + (i === 0 || i === r.nodes.length - 1 ? 1 : 2)));
}
const junction = (n) => deg.get(n) !== 2;
let edges = [];
for (const r of kept) {
  let start = 0;
  for (let i = 1; i < r.nodes.length; i++) {
    if (i === r.nodes.length - 1 || junction(r.nodes[i])) {
      edges.push({ nodes: r.nodes.slice(start, i + 1), cls: r.cls, hw: r.hw, oneway: r.oneway, name: r.name, bridge: r.bridge, lanes: r.lanes, median: r.median, way: r.id });
      start = i;
    }
  }
}
report.edgesBeforeThinning = edges.length;

// ------------------------------------------------------------------ thin the local streets
const len = (pts) => pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0);
const sampleAlong = (pts, every) => {
  const out = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = dist(a, b);
    let s = carry;
    while (s < L) {
      out.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L, Math.atan2(b[1] - a[1], b[0] - a[0])]);
      s += every;
    }
    carry = s - L;
  }
  return out;
};
const HC = 10;
const refs = new Map();
const addRefs = (samples) => {
  for (const s of samples) {
    const k = Math.floor(s[0] / HC) * 100000 + Math.floor(s[1] / HC);
    (refs.get(k) ?? refs.set(k, []).get(k)).push(s);
  }
};
const parallel = (a, b) => {
  const d = Math.abs(((a - b) % Math.PI) + Math.PI) % Math.PI;
  return Math.min(d, Math.PI - d) < (25 * Math.PI) / 180;
};
// every motorway and primary arterial is kept, and keeps its neighbours at a distance
for (const e of edges) if (!thinnable(e)) addRefs(sampleAlong(e.nodes.map(P), 4));
// secondary arterials, then collectors, then local streets, go by named chain (a street's blocks, joined at its own
// junctions), longest first
const locals = edges.filter(thinnable);
const chains = [];
{
  const seen = new Set();
  const byNode = new Map();
  locals.forEach((e, k) => {
    for (const n of [e.nodes[0], e.nodes[e.nodes.length - 1]]) (byNode.get(n) ?? byNode.set(n, []).get(n)).push(k);
  });
  locals.forEach((e, k) => {
    if (seen.has(k)) return;
    const chain = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const c = stack.pop();
      chain.push(c);
      if (!locals[c].name) continue;
      for (const n of [locals[c].nodes[0], locals[c].nodes[locals[c].nodes.length - 1]]) {
        for (const o of byNode.get(n) ?? []) {
          if (seen.has(o) || locals[o].name !== locals[c].name || locals[o].cls !== locals[c].cls) continue;
          seen.add(o);
          stack.push(o);
        }
      }
    }
    chains.push(chain);
  });
}
const chainLen = (c) => c.reduce((s, k) => s + len(locals[k].nodes.map(P)), 0);
chains.sort((a, b) => locals[a[0]].cls - locals[b[0]].cls || chainLen(b) - chainLen(a));
const keepLocal = new Set();
const endDeg = new Map();
for (const e of edges) for (const n of [e.nodes[0], e.nodes[e.nodes.length - 1]]) endDeg.set(n, (endDeg.get(n) ?? 0) + 1);
for (const c of chains) {
  const L = chainLen(c);
  const samples = c.flatMap((k) => sampleAlong(locals[k].nodes.map(P), 4));
  if (!samples.length) continue;
  // a short dead end (a cul-de-sac, a stub at a park) is dropped
  const deadEnds = c.filter((k) => [locals[k].nodes[0], locals[k].nodes[locals[k].nodes.length - 1]].some((n) => endDeg.get(n) === 1)).length;
  if (L < 15 && deadEnds) continue;
  const near = [];
  for (const s of samples) {
    let best = Infinity;
    const ci = Math.floor(s[0] / HC);
    const cj = Math.floor(s[1] / HC);
    for (let di = -3; di <= 3; di++) {
      for (let dj = -3; dj <= 3; dj++) {
        for (const r of refs.get((ci + di) * 100000 + (cj + dj)) ?? []) {
          if (!parallel(s[2], r[2])) continue;
          const d = Math.hypot(r[0] - s[0], r[1] - s[1]);
          if (d < best) best = d;
        }
      }
    }
    if (best < 30) near.push(best);
  }
  near.sort((a, b) => a - b);
  const first = locals[c[0]];
  const spacing = SPACING[first.cls];
  if (near.length > samples.length * 0.4 && near[near.length >> 1] < spacing) continue;
  for (const k of c) keepLocal.add(k);
  addRefs(samples);
}
edges = edges.filter((e) => !thinnable(e) || keepLocal.has(locals.indexOf(e)));
report.localChains = chains.length;
report.localChainsKept = new Set([...keepLocal].map((k) => chains.findIndex((c) => c.includes(k)))).size;

// ------------------------------------------------------------------ one junction per crossing
// a cross street meets a merged dual carriageway (or a slip lane meets its road) at a knot of junctions a few units
// apart, joined by stubs: each would raise its own signal masts and run its own cycle, and cars would turn on the
// stubs. Junctions joined by a stub shorter than STUB become one junction at their middle (a knot never spans more
// than KNOT), its stubs and slip lanes go, a short dead end left at a junction goes, and a road left doubled between
// two junctions keeps its major line. Repeated until nothing changes, since each pass can leave a new knot.
{
  const STUB = 7;
  const KNOT = 14;
  let knots = 0;
  let stubs = 0;
  for (let pass = 0; pass < 5; pass++) {
    const ends = new Map();
    for (const e of edges) for (const n of [e.nodes[0], e.nodes[e.nodes.length - 1]]) ends.set(n, (ends.get(n) ?? 0) + 1);
    const knot = new Map();
    const members = new Map();
    const root = (n) => knot.get(n) ?? n;
    for (const e of edges) {
      const a = root(e.nodes[0]);
      const b = root(e.nodes[e.nodes.length - 1]);
      if (a === b || len(e.nodes.map(P)) >= STUB) continue;
      if ((ends.get(e.nodes[0]) ?? 0) < 3 || (ends.get(e.nodes[e.nodes.length - 1]) ?? 0) < 3) continue;
      const ma = members.get(a) ?? [a];
      const mb = members.get(b) ?? [b];
      if (ma.some((p) => mb.some((q) => dist(P(p), P(q)) > KNOT))) continue;
      const all = [...ma, ...mb];
      for (const n of all) knot.set(n, a);
      members.set(a, all);
      members.delete(b);
    }
    // each knot's junction at the middle of its members
    const middle = new Map();
    for (const [r, list] of members) middle.set(r, [list.reduce((s, n) => s + P(n)[0], 0) / list.length, list.reduce((s, n) => s + P(n)[1], 0) / list.length]);
    const before = edges.length;
    const pairs = new Map();
    edges = edges.filter((e) => {
      const a = root(e.nodes[0]);
      const b = root(e.nodes[e.nodes.length - 1]);
      const L = len(e.nodes.map(P));
      if (a === b && (members.has(a) || L < STUB) && L < 3 * STUB) return false;
      // a stub left dangling off a junction
      if (L < STUB && ((ends.get(e.nodes[0]) === 1 && (ends.get(e.nodes[e.nodes.length - 1]) ?? 0) >= 3) || (ends.get(e.nodes[e.nodes.length - 1]) === 1 && (ends.get(e.nodes[0]) ?? 0) >= 3))) return false;
      e.nodes[0] = a;
      e.nodes[e.nodes.length - 1] = b;
      // two roads between the same pair of junctions along the same line: the major one stays
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const twin = pairs.get(key);
      if (twin) {
        const mid = (x) => x.nodes[x.nodes.length >> 1];
        if (dist(P(mid(twin)), P(mid(e))) < 6) {
          if (e.cls < twin.cls || (e.cls === twin.cls && L > len(twin.nodes.map(P)))) Object.assign(twin, e);
          return false;
        }
      }
      pairs.set(key, e);
      return true;
    });
    for (const [r, p] of middle) pos.set(r, p);
    // a road into a merged junction loses the points it had inside the knot: kept, they double back from the moved
    // junction to where its old node was, a hairpin
    for (const e of edges) {
      for (const atStart of [true, false]) {
        const end = atStart ? e.nodes[0] : e.nodes[e.nodes.length - 1];
        const c = middle.get(end);
        if (!c) continue;
        while (e.nodes.length > 2) {
          const inner = atStart ? e.nodes[1] : e.nodes[e.nodes.length - 2];
          if (dist(P(inner), c) > KNOT * 0.6) break;
          if (atStart) e.nodes.splice(1, 1);
          else e.nodes.splice(e.nodes.length - 2, 1);
        }
      }
    }
    knots += members.size;
    stubs += before - edges.length;
    if (!members.size && before === edges.length) break;
  }
  report.junctionKnotsMerged = knots;
  report.stubsDropped = stubs;
}

// ------------------------------------------------------------------ join edges through the junctions thinning undid
{
  const at = new Map();
  edges.forEach((e, k) => {
    for (const n of [e.nodes[0], e.nodes[e.nodes.length - 1]]) (at.get(n) ?? at.set(n, []).get(n)).push(k);
  });
  const gone = new Set();
  for (const [n, list] of at) {
    const live = list.filter((k) => !gone.has(k));
    if (live.length !== 2) continue;
    const [a, b] = live.map((k) => edges[k]);
    if (a === b || a.cls !== b.cls || a.name !== b.name || a.median !== b.median || a.bridge !== b.bridge || !!a.oneway !== !!b.oneway) continue;
    // orient both to run through n: a ends at n, b starts there
    const aEnds = a.nodes[a.nodes.length - 1] === n;
    const bStarts = b.nodes[0] === n;
    const an = aEnds ? a.nodes : a.nodes.slice().reverse();
    const bn = bStarts ? b.nodes : b.nodes.slice().reverse();
    const aw = aEnds ? a.oneway : -a.oneway;
    const bw = bStarts ? b.oneway : -b.oneway;
    if (aw !== bw) continue;
    const kb = live[1];
    a.nodes = [...an, ...bn.slice(1)];
    a.oneway = aw;
    gone.add(kb);
    // b's far end now belongs to a
    const far = bn[bn.length - 1];
    at.set(far, (at.get(far) ?? []).map((k) => (k === kb ? live[0] : k)));
  }
  edges = edges.filter((_, k) => !gone.has(k));
}

// ------------------------------------------------------------------ nodes, geometry, signals
const nodeIdx = new Map();
const NODES = [];
const nodeOf = (n) => {
  if (!nodeIdx.has(n)) {
    nodeIdx.set(n, NODES.length);
    NODES.push(P(n));
  }
  return nodeIdx.get(n);
};
const E = edges.map((e) => {
  const pts = simplify(e.nodes.map(P), 0.25);
  return { a: nodeOf(e.nodes[0]), b: nodeOf(e.nodes[e.nodes.length - 1]), inner: pts.slice(1, -1), cls: e.cls, oneway: e.oneway, name: e.name, bridge: e.bridge, lanes: e.lanes, median: e.median };
});
const degree = new Array(NODES.length).fill(0);
for (const e of E) {
  degree[e.a]++;
  degree[e.b]++;
}
// signals: OSM's and the City's, one per junction (a merged carriageway's two collapse to one)
const sigPts = [...signalNodes.values()].map((n) => llToXZ(n.lat, n.lon));
for (const f of vanSignals.features) {
  const c = f.geometry?.coordinates;
  if (c) sigPts.push(llToXZ(c[1], c[0]));
}
const nodeSig = new Set();
const ped = [];
const segs = [];
E.forEach((e, k) => {
  const pts = [NODES[e.a], ...e.inner, NODES[e.b]];
  for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: pts[i], b: pts[i + 1], k });
});
const NH = 12;
const nodeHash = new Map();
NODES.forEach((p, i) => {
  if (degree[i] < 3) return;
  const key = Math.floor(p[0] / NH) * 100000 + Math.floor(p[1] / NH);
  (nodeHash.get(key) ?? nodeHash.set(key, []).get(key)).push(i);
});
const segHash = new Map();
segs.forEach((s, i) => {
  const key = Math.floor((s.a[0] + s.b[0]) / 2 / NH) * 100000 + Math.floor((s.a[1] + s.b[1]) / 2 / NH);
  (segHash.get(key) ?? segHash.set(key, []).get(key)).push(i);
});
const around = (hash, p, f) => {
  const ci = Math.floor(p[0] / NH);
  const cj = Math.floor(p[1] / NH);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const v of hash.get((ci + di) * 100000 + (cj + dj)) ?? []) f(v);
};
for (const p of sigPts) {
  if (!inside(p)) continue;
  let bn = -1;
  let bd = 3.2;
  around(nodeHash, p, (i) => {
    const d = dist(NODES[i], p);
    if (d < bd) {
      bd = d;
      bn = i;
    }
  });
  // a signal a little off its junction (one of a knot's, before the knot became one junction) is still that junction's
  if (bn < 0) {
    bd = 7;
    around(nodeHash, p, (i) => {
      const d = dist(NODES[i], p);
      if (d < bd) {
        bd = d;
        bn = i;
      }
    });
  }
  if (bn >= 0) {
    nodeSig.add(bn);
    continue;
  }
  // a signal mid-block (a pedestrian crossing) stays on its road
  let onRoad = false;
  around(segHash, p, (i) => {
    if (segDist(p, segs[i].a, segs[i].b).d < 1.6) onRoad = true;
  });
  if (onRoad && !ped.some((q) => dist(q, p) < 4)) ped.push(p);
}
report.signalsAtJunctions = nodeSig.size;
report.pedestrianSignals = ped.length;

// ------------------------------------------------------------------ parks
const rings = (geom) => {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates[0]];
  if (geom.type === "MultiPolygon") return geom.coordinates.map((p) => p[0]);
  return [];
};
const parks = [];
for (const f of vanParks.features) {
  const name = f.properties?.park_name ?? f.properties?.name ?? "";
  if (/Stanley Park/.test(name)) continue; // the ride's own forest
  for (const ring of rings(f.geometry)) {
    const poly = simplify(ring.map(([lon, lat]) => llToXZ(lat, lon)), 0.4);
    if (poly.length < 4 || !poly.some((p) => inside(p))) continue;
    if (Math.abs(area(poly)) < 6) continue;
    parks.push({ name, poly });
  }
}
for (const e of extras.elements) {
  if (e.type !== "way" || !/park|nature_reserve|garden/.test(e.tags?.leisure ?? "") || !e.geometry) continue;
  const poly = simplify(e.geometry.map((g) => llToXZ(g.lat, g.lon)), 0.4);
  if (poly.length < 4 || Math.abs(area(poly)) < 6) continue;
  const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
  // OSM's parks only where the City's list does not reach (Burnaby), and none twice
  if (c[0] < 700 || parks.some((q) => inPoly(c[0], c[1], q.poly))) continue;
  parks.push({ name: e.tags?.name ?? "", poly });
}
report.parks = parks.length;

// ------------------------------------------------------------------ land use
const LU = { x0: NEAR.x0, z0: NEAR.z0, step: 6, nx: 254, nz: 219 };
const ZCLASS = (cat, cls) => {
  // the comprehensive-development and downtown districts (incl. False Creek North's FCCDD) take towers; mixed commercial
  // (MC) is a shopping street, not industry
  if (/^(CD|DD|CWD|BCPED|FCCDD|FSD|DEOD)/.test(cat)) return 5;
  if (/^MC/.test(cat)) return 4;
  if (/^(RS|R1)/.test(cat)) return 1;
  if (/^RT/.test(cat)) return 2;
  if (/^(RM|FM|RR)/.test(cat) || /Rental/.test(cls)) return 3;
  if (/^(C|FC)/.test(cat) && cat !== "CD" && cat !== "CWD") return 4;
  if (/^(CD|DD|CWD|BCPED)/.test(cat)) return 5;
  if (/^HA/.test(cat)) return 6;
  if (/^(I|M)/.test(cat)) return 7;
  if (/Residential/.test(cls)) return 1;
  if (/Commercial/.test(cls)) return 4;
  if (/Industrial/.test(cls)) return 7;
  if (/Comprehensive/.test(cls)) return 5;
  if (/Historical/.test(cls)) return 6;
  return 0;
};
const lu = new Uint8Array(LU.nx * LU.nz);
const paint = (poly, v) => {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - LU.x0) / LU.step));
  const i1 = Math.min(LU.nx - 1, Math.ceil((Math.max(...xs) - LU.x0) / LU.step));
  const j0 = Math.max(0, Math.floor((Math.min(...zs) - LU.z0) / LU.step));
  const j1 = Math.min(LU.nz - 1, Math.ceil((Math.max(...zs) - LU.z0) / LU.step));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inPoly(LU.x0 + i * LU.step, LU.z0 + j * LU.step, poly)) lu[j * LU.nx + i] = v;
};
const cats = {};
for (const f of vanZoning.features) {
  const cat = f.properties?.zoning_category ?? "";
  const v = ZCLASS(cat, f.properties?.zoning_classification ?? "");
  cats[cat] = v;
  for (const ring of rings(f.geometry)) paint(ring.map(([lon, lat]) => llToXZ(lat, lon)), v);
}
for (const e of extras.elements) {
  const t = e.tags?.landuse;
  if (e.type !== "way" || !t || !e.geometry) continue;
  const v = t === "residential" ? 1 : t === "industrial" ? 7 : 4;
  const poly = e.geometry.map((g) => llToXZ(g.lat, g.lon));
  if (poly.every((p) => p[0] < 700)) continue;
  paint(poly, v);
}
report.zoningCategories = cats;
const counts = new Array(10).fill(0);
for (const v of lu) counts[v]++;
report.landUseCells = counts;
const rle = [];
for (let k = 0; k < lu.length; ) {
  let n = 1;
  while (k + n < lu.length && lu[k + n] === lu[k] && n < 255) n++;
  rle.push(lu[k], n);
  k += n;
}

// ------------------------------------------------------------------ pack and write
const classCount = [0, 0, 0, 0];
for (const e of E) classCount[e.cls]++;
report.nodes = NODES.length;
report.edges = E.length;
report.edgesByClass = { motorway: classCount[0], arterial: classCount[1], collector: classCount[2], local: classCount[3] };
const names = [...new Set(E.map((e) => e.name))];
const ptsFlat = [];
const edgeRec = [];
const edgeFlags = [];
for (const e of E) {
  edgeRec.push(e.a, e.b, ptsFlat.length / 2, e.inner.length, names.indexOf(e.name));
  for (const p of e.inner) ptsFlat.push(q10(p[0]), q10(p[1]));
  // class (2 bits), one-way (2: none, with, against), median, bridge, lanes per direction − 1 (2 bits)
  const ow = e.oneway === 1 ? 1 : e.oneway === -1 ? 2 : 0;
  const lanes = Math.max(1, Math.min(4, e.oneway ? e.lanes : Math.round(e.lanes / 2)));
  edgeFlags.push(e.cls | (ow << 2) | ((e.median ? 1 : 0) << 4) | ((e.bridge ? 1 : 0) << 5) | ((lanes - 1) << 6));
}
const nodesFlat = NODES.flatMap(([x, z]) => [q10(x), q10(z)]);
const out = `${header(
  "Vancouver's streets around the ride, generalized: nodes (int16 tenths of a unit), edges [a, b, first inner point,\n * inner point count, name] (uint16), edge flags (class | one-way << 2 | median << 4 | bridge << 5 | lanes − 1 << 6),\n * inner points, the street names, the signalled junctions (node indices) and the signals mid-block (points).",
  "scripts/streets/bake.mjs",
  SOURCES,
)}export const STREETS = {
  nodes: "${b64(new Int16Array(nodesFlat))}",
  edges: "${b64(new Uint16Array(edgeRec))}",
  flags: "${b64(new Uint8Array(edgeFlags))}",
  points: "${b64(new Int16Array(ptsFlat))}",
  names: ${JSON.stringify(names.join("\n"))},
  signals: "${b64(new Uint16Array([...nodeSig].sort((a, b) => a - b)))}",
  ped: "${b64(new Int16Array(ped.flatMap(([x, z]) => [q10(x), q10(z)])))}",
} as const;
`;
writeModule(path.join(ROOT, "components/train/streetData.ts"), out);

const parkOut = `${header("Park outlines around the ride (world units, tenths): each park's name and its outline as int16 pairs.", "scripts/streets/bake.mjs", SOURCES)}export const PARK_DATA: readonly { name: string; poly: string }[] = [
${parks.map((p) => `  { name: ${JSON.stringify(p.name)}, poly: "${b64(new Int16Array(p.poly.flatMap(([x, z]) => [q10(x), q10(z)])))}" },`).join("\n")}
];
`;
writeModule(path.join(ROOT, "components/train/parkData.ts"), parkOut);

const luOut = `${header(
  "Land use on the terrain raster's 6-unit grid, run-length encoded as (value, run) bytes, row-major by z. Values: 0 none,\n * 1 single-family, 2 duplex and low-rise, 3 apartments, 4 commercial, 5 towers (comprehensive development, downtown),\n * 6 historic area, 7 industrial.",
  "scripts/streets/bake.mjs",
  SOURCES,
)}export const LANDUSE = { x0: ${LU.x0}, z0: ${LU.z0}, step: ${LU.step}, nx: ${LU.nx}, nz: ${LU.nz}, rle: "${b64(new Uint8Array(rle))}" } as const;
`;
writeModule(path.join(ROOT, "components/train/landuseData.ts"), luOut);
fs.writeFileSync(path.join(HERE, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
