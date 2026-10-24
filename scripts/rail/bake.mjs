#!/usr/bin/env node
/**
 * Bakes the rail geometry beside the ride from OpenStreetMap into `components/train/railData.ts`: the Expo Line's
 * structure along the existing alignment (viaduct, grade, cutting or tunnel per TRACK_RAW point; the alignment and
 * the stations do not move), the Millennium Line from VCC–Clark east, the CN and BNSF freight tracks through the
 * Grandview Cut, the Broadway Extension (the Millennium Line's subway west from VCC–Clark) and the stations on them,
 * and where they cross the Expo. Run with `npm run bake:rail`; `--check-track` also reports how far a fresh chain of
 * the Expo's ways lies from TRACK_RAW.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { overpass } from "../osm/lib/fetch.mjs";
import { bboxOf, chainWays, dist, lineDist, llToXZ, NEAR, pathWays, resample, segCross } from "../osm/lib/geo.mjs";
import { header, r1, writeModule } from "../osm/lib/pack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const STEP = 3.85; // 35 m, as the Expo alignment was resampled
const X_END = 1100; // the far end of what the ride can see

// ------------------------------------------------------------------ fetch
const box = bboxOf(NEAR, 120);
const lines = await overpass(`[out:json][timeout:180];way["railway"~"^(subway|light_rail|construction)$"](${box});out geom;`, "rapid transit ways");
const freightBox = bboxOf({ x0: 150, x1: X_END, z0: 150, z1: 420 });
const freight = await overpass(`[out:json][timeout:180];way["railway"="rail"](${freightBox});out geom;`, "freight ways");
// the main line along the south shore of Burrard Inlet, east from Waterfront: the West Coast Express runs on it
const shoreBox = bboxOf({ x0: -20, x1: 700, z0: -80, z1: 80 });
const shore = await overpass(`[out:json][timeout:180];way["railway"="rail"](${shoreBox});out geom;`, "waterfront rail ways");
const stationNodes = await overpass(
  `[out:json][timeout:120];(node["railway"~"^(station|stop|halt|construction)$"](${box});node["public_transport"~"^(station|stop_position)$"](${box});node["construction"~"station"](${box}););out;`,
  "stations",
);

const named = (re) => lines.elements.filter((w) => re.test(w.tags?.name ?? "") && !w.tags?.service && w.tags?.railway !== "platform" && w.geometry?.length > 1);
const expoWays = named(/Expo Line/);
const millWays = named(/Millennium Line/);
const bwayWays = named(/Broadway (Extension|Subway)/);
console.log(`ways: Expo ${expoWays.length}, Millennium ${millWays.length}, Broadway ${bwayWays.length}`);

/** A way's structure class: V viaduct or bridge, T tunnel, C cutting, G grade (or embankment). */
const clsOf = (t = {}) => (t.tunnel && t.tunnel !== "no" ? "T" : t.bridge && t.bridge !== "no" ? "V" : t.cutting && t.cutting !== "no" ? "C" : "G");
const wayPts = (w) => w.geometry.map((g) => llToXZ(g.lat, g.lon));

// ------------------------------------------------------------------ the Expo's structure along TRACK_RAW
const TRACK = [...fs.readFileSync(path.join(ROOT, "components/train/trackData.ts"), "utf8").matchAll(/\[(-?[\d.]+), (-?[\d.]+)\]/g)].map((m) => [+m[1], +m[2]]);
const data = fs.readFileSync(path.join(ROOT, "data/index.ts"), "utf8");
const stations = [...data.matchAll(/id: "([^"]+)",\s*code: "[^"]*",\s*name: "([^"]+)",\s*section: "[^"]+",\s*km: \[(-?[\d.]+), (-?[\d.]+)\]/g)].map((m) => ({ id: m[1], name: m[2], x: +m[3] * 110, z: +m[4] * 110 }));
if (stations.length !== 10) throw new Error(`expected 10 stations in data/index.ts, found ${stations.length}`);
const nearestIdx = (x, z) => TRACK.reduce((b, p, i) => (dist(p, [x, z]) < dist(TRACK[b], [x, z]) ? i : b), 0);
const iMain = nearestIdx(stations[4].x, stations[4].z);
const expoSegs = expoWays.map((w) => ({ pts: wayPts(w), cls: clsOf(w.tags) }));
let cls = TRACK.map((p, i) => {
  // downtown stays elevated as the ride has always shown it (in reality a tunnel from Waterfront to Stadium), and the
  // short covered stretch at Main Street rides over its lid
  if (i <= iMain + 6) return "V";
  let best = { d: Infinity, c: "G" };
  for (const s of expoSegs) {
    const d = lineDist(p, s.pts).d;
    if (d < best.d) best = { d, c: s.cls };
  }
  return best.d < 6 ? best.c : null;
});
for (let i = 0; i < cls.length; i++) if (cls[i] === null) cls[i] = cls[i - 1] ?? "V";
// one-point flickers (a bridge over a lane, a gap between ways) take their neighbours' class; cuttings and tunnels stay
for (let pass = 0; pass < 2; pass++) {
  cls = cls.map((c, i) => (i > 0 && i < cls.length - 1 && cls[i - 1] === cls[i + 1] && c !== cls[i - 1] && c !== "C" && c !== "T" ? cls[i - 1] : c));
}
const runs = [];
cls.forEach((c, i) => {
  if (runs.length && runs[runs.length - 1][2] === c) runs[runs.length - 1][1] = i;
  else runs.push([i, i, c]);
});
console.log("Expo structure runs:");
for (const [a, b, c] of runs) console.log(`  ${c} ${String(a).padStart(4)}–${String(b).padEnd(4)} (${TRACK[a].map(Math.round)} → ${TRACK[b].map(Math.round)})`);

if (process.argv.includes("--check-track")) {
  const chain = chainWays(expoWays, [0, 0]).map((c) => c.p);
  let worst = 0;
  for (const p of TRACK) worst = Math.max(worst, lineDist(p, chain).d);
  console.log(`--check-track: TRACK_RAW lies within ${worst.toFixed(2)} units of a fresh Expo chain (${chain.length} points)`);
}

// ------------------------------------------------------------------ freight through the Grandview Cut
const freightWays = freight.elements.filter((w) => w.geometry?.length > 1 && !w.tags?.service && /main|branch|industrial/.test(w.tags?.usage ?? "main"));
/** One track of a line, from its node nearest `from` to its node furthest toward `toward` (by x, east or west). */
const chainFrom = (ways, from, toward) => pathWays(ways, from, (p) => (toward[0] > from[0] ? p[0] : -p[0]));
const VCC = [260, 243];
const cuttings = freightWays.filter((w) => w.tags?.cutting && w.tags.cutting !== "no").map(wayPts);
const inCutting = (p, pad) => cuttings.some((c) => lineDist(p, c).d < pad);
const freightLines = [];
for (const re of [/New Westminster|Canadian National/, /BNSF/]) {
  const ways = freightWays.filter((w) => re.test(`${w.tags?.name ?? ""} ${w.tags?.operator ?? ""}`));
  if (!ways.length) continue;
  const ch = chainFrom(ways, VCC, [X_END, 300]).filter(({ p }) => p[0] > 180 && p[0] < X_END);
  if (ch.length < 10) continue;
  const pts = resample(ch.map((c) => c.p), STEP);
  freightLines.push({ name: re.source.split("|")[0].replace(/\\/g, ""), pts, cut: pts.map((p) => (inCutting(p, 2) ? "C" : "G")).join("") });
}
console.log(`freight: ${freightLines.map((f) => `${f.name} ${f.pts.length} pts, ${f.cut.split("C").length - 1} in cutting`).join("; ")}`);

// ------------------------------------------------------------------ the West Coast Express along the waterfront
// from its platform beside Waterfront station east along the shore, on the main line (sidings and yard tracks left out)
const shoreWays = shore.elements.filter((w) => w.geometry?.length > 1 && !w.tags?.service && /main|branch/.test(w.tags?.usage ?? "main"));
const WATERFRONT = [8, -2];
const wceCh = shoreWays.length ? pathWays(shoreWays, WATERFRONT, (p) => p[0]).filter(({ p }) => p[0] > -10 && p[0] < 680) : [];
const wce = wceCh.length > 4 ? resample(wceCh.map((c) => c.p), STEP) : [];
console.log(`west coast express: ${wce.length} pts, ${shoreWays.length} ways, from (${wce[0]?.map(Math.round)}) to (${wce[wce.length - 1]?.map(Math.round)})`);

// ------------------------------------------------------------------ the Millennium Line from VCC–Clark east
const resampleWithClass = (ch, step, extra = () => null) => {
  const pts = resample(ch.map((c) => c.p), step);
  const src = ch.map((c) => c.p);
  const k = pts.map((p) => {
    const { i, t } = lineDist(p, src);
    const own = clsOf((t < 0.5 ? ch[i] : ch[i + 1]).tags);
    return (own !== "V" && extra(p)) || own;
  });
  return { pts, cls: k.join("") };
};
const millChain = chainFrom(millWays, VCC, [X_END, 300]).filter(({ p }) => p[0] < X_END);
// the Millennium runs at grade on the cut's floor beside the freight tracks, which carry the cutting tags (where it is on
// its own bridge, at VCC–Clark, it stays up)
const mill = resampleWithClass(millChain, STEP, (p) => (inCutting(p, 9) ? "C" : null));
// a short bridge inside the cut (over the freight tracks where they change sides) keeps the cut's floor
mill.cls = mill.cls.replace(/C(V{1,7})C/g, (m, v) => `C${"C".repeat(v.length)}C`);
console.log(`Millennium: ${mill.pts.length} pts from (${mill.pts[0].map(Math.round)}) to (${mill.pts[mill.pts.length - 1].map(Math.round)}); ${mill.cls.replace(/(.)\1*/g, (m) => m[0] + m.length + " ")}`);

// ------------------------------------------------------------------ the Broadway Extension west from VCC–Clark
const bwayChain = chainFrom(bwayWays, VCC, [-600, 290]);
const bway = resampleWithClass(bwayChain, STEP);
console.log(`Broadway Extension: ${bway.pts.length} pts from (${bway.pts[0].map(Math.round)}) to (${bway.pts[bway.pts.length - 1].map(Math.round)}); ${bway.cls.replace(/(.)\1*/g, (m) => m[0] + m.length + " ")}`);

// ------------------------------------------------------------------ stations
const nodes = stationNodes.elements.filter((n) => n.tags?.name).map((n) => ({ name: n.tags.name, p: llToXZ(n.lat, n.lon), tags: n.tags }));
const millStations = [];
for (const n of nodes) {
  if (lineDist(n.p, mill.pts).d > 7 || millStations.some((s) => s.name === n.name)) continue;
  millStations.push({ name: n.name, x: r1(n.p[0]), z: r1(n.p[1]) });
}
// Commercial–Broadway has a node per line: the Millennium's is the one in the cut, north of Broadway
const cb = nodes.filter((n) => /Commercial/.test(n.name)).sort((a, b) => lineDist(a.p, mill.pts).d - lineDist(b.p, mill.pts).d)[0];
if (cb) {
  const k = millStations.findIndex((s) => /Commercial/.test(s.name));
  const s = { name: cb.name, x: r1(cb.p[0]), z: r1(cb.p[1]) };
  if (k >= 0) millStations[k] = s;
  else millStations.push(s);
}
millStations.sort((a, b) => lineDist([a.x, a.z], mill.pts).i - lineDist([b.x, b.z], mill.pts).i);
console.log(`Millennium stations: ${millStations.map((s) => `${s.name} (${Math.round(s.x)},${Math.round(s.z)})`).join(", ")}`);

// the Broadway Subway's stations: from OSM where tagged, else their published intersections (src: manual)
const BROADWAY_STATIONS = [
  ["Great Northern Way–Emily Carr", /Great Northern|Emily Carr/, 49.2665, -123.0905],
  ["Mount Pleasant", /Mount Pleasant/, 49.2631, -123.1008],
  ["Broadway–City Hall", /City Hall/, 49.2629, -123.1146],
  ["Oak–VGH", /Oak|VGH/, 49.2632, -123.127],
  ["South Granville", /South Granville/, 49.2634, -123.1386],
  ["Arbutus", /^Arbutus/, 49.2639, -123.1528],
  // 2100: on toward UBC
  ["Macdonald", null, 49.2645, -123.1679],
  ["Alma", null, 49.2648, -123.1859],
  ["UBC", null, 49.2659, -123.2468],
];
const bwayStations = BROADWAY_STATIONS.map(([name, re, lat, lon], k) => {
  const hit = re && nodes.find((n) => re.test(n.name) && dist(n.p, llToXZ(lat, lon)) < 25);
  const p = hit ? hit.p : llToXZ(lat, lon);
  return { name, x: r1(p[0]), z: r1(p[1]), src: hit ? "osm" : "manual", year: k < 6 ? 2027 : 2100 };
});
console.log(`Broadway stations: ${bwayStations.map((s) => `${s.name} ${s.src}`).join(", ")}`);

// ------------------------------------------------------------------ crossings with the Expo
const crossings = [];
for (const [line, pts] of [["mill", mill.pts], ["broadway", bway.pts], ...freightLines.map((f) => ["freight", f.pts])]) {
  for (let i = 0; i + 1 < TRACK.length; i++) {
    for (let k = 0; k + 1 < pts.length; k++) {
      const c = segCross(TRACK[i], TRACK[i + 1], pts[k], pts[k + 1]);
      if (c && !crossings.some((o) => o.line === line && Math.hypot(o.x - c.x, o.z - c.z) < 8)) crossings.push({ line, x: r1(c.x), z: r1(c.z), i: i + c.t, k: k + c.u });
    }
  }
}
console.log(`crossings: ${crossings.map((c) => `${c.line} at (${Math.round(c.x)},${Math.round(c.z)})`).join(", ") || "none"}`);

// ------------------------------------------------------------------ write
const pts = (a) => `[${a.map(([x, z]) => `[${r1(x)}, ${r1(z)}]`).join(", ")}]`;
const out = `${header(
  "Rail beside the ride, in world units: the Expo's structure along TRACK_RAW, the Millennium Line, the freight tracks\n * through the Grandview Cut, the Broadway Extension and their stations, and where they cross the Expo.\n * Classes: V viaduct or bridge, G grade, C cutting, T tunnel.",
  "scripts/rail/bake.mjs",
  "OpenStreetMap (© OpenStreetMap contributors, ODbL)",
)}export type RailClass = "V" | "G" | "C" | "T";
export type RailLine = { pts: readonly (readonly [number, number])[]; cls: string };
export type RailStation = { name: string; x: number; z: number };

/** Runs [first, last, class] over TRACK_RAW indices. Downtown is kept elevated as the ride shows it (in reality a tunnel). */
export const EXPO_STRUCT: readonly (readonly [number, number, RailClass])[] = ${JSON.stringify(runs)};
/** The Millennium Line from VCC–Clark east (one track's centreline, every 35 m); \`cls\` per point. */
export const MILL: RailLine & { stations: readonly RailStation[] } = { pts: ${pts(mill.pts)}, cls: "${mill.cls}", stations: ${JSON.stringify(millStations)} };
/** Freight tracks through the Grandview Cut; \`cls\` is C where OSM tags the cutting. */
export const FREIGHT: readonly (RailLine & { name: string })[] = [${freightLines.map((f) => `{ name: "${f.name}", pts: ${pts(f.pts)}, cls: "${f.cut}" }`).join(", ")}];
/** The main line the West Coast Express runs on, from beside Waterfront station east along the shore. */
export const WCE: readonly (readonly [number, number])[] = ${pts(wce)};
/** The Broadway Extension from VCC–Clark west (bridge, grade, cutting, then tunnel under Broadway). */
export const BROADWAY: RailLine = { pts: ${pts(bway.pts)}, cls: "${bway.cls}" };
/** Broadway Subway stations: those opening in 2027, then the 2100 extension toward UBC. */
export const BROADWAY_STATIONS: readonly (RailStation & { src: "osm" | "manual"; year: number })[] = ${JSON.stringify(bwayStations)};
/** Plan-view crossings with the Expo: \`i\` is the fractional TRACK_RAW index, \`k\` the other line's. */
export const CROSSINGS: readonly { line: "mill" | "broadway" | "freight"; x: number; z: number; i: number; k: number }[] = ${JSON.stringify(crossings.map((c) => ({ ...c, i: r1(c.i), k: r1(c.k) })))};
`;
writeModule(path.join(ROOT, "components/train/railData.ts"), out);
