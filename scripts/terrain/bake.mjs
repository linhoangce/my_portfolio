#!/usr/bin/env node
/**
 * Bakes the ride's terrain from AWS Terrain Tiles (Terrarium encoding, elevation = R·256 + G + B/256 − 32768)
 * into two generated modules: `components/train/terrainData.ts` (the city grid and a water signed-distance field,
 * imported synchronously by the track) and `components/train/terrainFar.ts` (the North Shore, Burnaby Mountain and the
 * suburbs, loaded lazily by the backdrop). Water in Terrarium is flattened to exactly 0 m, so the coastline comes from
 * the tiles themselves. Tiles are cached in scripts/terrain/.cache. Run with `npm run bake:terrain`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CACHE = path.join(HERE, ".cache");
fs.mkdirSync(CACHE, { recursive: true });

// projection, mirrored from components/train/geo.ts
const ORIGIN_LAT = 49.2861789;
const ORIGIN_LON = -123.112219;
const KM_LAT = 111.2;
const KM_LON = 111.32 * Math.cos((ORIGIN_LAT * Math.PI) / 180);
const K = 110;
const xzToLL = (x, z) => [ORIGIN_LAT - z / K / KM_LAT, ORIGIN_LON + x / K / KM_LON];

const CITY = { x0: -520, z0: -450, step: 8, nx: 191, nz: 165 };
const FAR = { x0: -1500, z0: -2100, step: 25, nx: 169, nz: 153 };
const LAKE = { x: 400, z: 374, rx: 20, rz: 13 }; // Trout Lake: its surface is above sea level, so the tiles cannot mark it

const lonToTX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const latToTY = (lat, z) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

async function loadTile(z, x, y) {
  const file = path.join(CACHE, `${z}_${x}_${y}.png`);
  if (!fs.existsSync(file)) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const png = PNG.sync.read(fs.readFileSync(file));
  return png.data;
}

/** Loads every tile covering a world box at zoom z; returns bilinear and nearest elevation samplers (metres). */
async function sampler(box, z) {
  const corners = [
    xzToLL(box.x0, box.z0),
    xzToLL(box.x0 + box.step * (box.nx - 1), box.z0 + box.step * (box.nz - 1)),
  ];
  const tx = corners.map(([, lon]) => lonToTX(lon, z));
  const ty = corners.map(([lat]) => latToTY(lat, z));
  const tiles = new Map();
  for (let x = Math.floor(Math.min(...tx)) - 1; x <= Math.floor(Math.max(...tx)) + 1; x++) {
    for (let y = Math.floor(Math.min(...ty)) - 1; y <= Math.floor(Math.max(...ty)) + 1; y++) tiles.set(`${x},${y}`, await loadTile(z, x, y));
  }
  console.log(`zoom ${z}: ${tiles.size} tiles`);
  const px = (gx, gy) => {
    const t = tiles.get(`${Math.floor(gx / 256)},${Math.floor(gy / 256)}`);
    const i = ((((gy % 256) + 256) % 256) * 256 + (((gx % 256) + 256) % 256)) * 4;
    return t[i] * 256 + t[i + 1] + t[i + 2] / 256 - 32768;
  };
  const at = (lat, lon) => {
    const fx = lonToTX(lon, z) * 256 - 0.5;
    const fy = latToTY(lat, z) * 256 - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const u = fx - ix;
    const v = fy - iy;
    return (px(ix, iy) * (1 - u) + px(ix + 1, iy) * u) * (1 - v) + (px(ix, iy + 1) * (1 - u) + px(ix + 1, iy + 1) * u) * v;
  };
  const nearest = (lat, lon) => px(Math.floor(lonToTX(lon, z) * 256), Math.floor(latToTY(lat, z) * 256));
  return { at, nearest };
}

function gridFrom(box, sub, elev) {
  const out = new Float32Array(box.nx * box.nz);
  for (let j = 0; j < box.nz; j++) {
    for (let i = 0; i < box.nx; i++) {
      const x = box.x0 + i * box.step;
      const z = box.z0 + j * box.step;
      let s = 0;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) s += elev(...xzToLL(x + ((a + 0.5) / sub - 0.5) * box.step, z + ((b + 0.5) / sub - 0.5) * box.step));
      out[j * box.nx + i] = s / (sub * sub);
    }
  }
  return out;
}

function blur(grid, nx, nz) {
  const out = new Float32Array(grid.length);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let acc = 0;
      let w = 0;
      for (const [dj, wj] of [[-1, 1], [0, 2], [1, 1]]) {
        for (const [di, wi] of [[-1, 1], [0, 2], [1, 1]]) {
          const jj = Math.min(nz - 1, Math.max(0, j + dj));
          const ii = Math.min(nx - 1, Math.max(0, i + di));
          acc += grid[jj * nx + ii] * wi * wj;
          w += wi * wj;
        }
      }
      out[j * nx + i] = acc / w;
    }
  }
  return out;
}

/** Two-pass chamfer distance (3-4 weights) from every cell to the nearest cell where `mask` is true, in cells. */
function chamfer(mask, nx, nz) {
  const INF = 1e9;
  const d = new Float32Array(nx * nz).map((_, k) => (mask[k] ? 0 : INF));
  const pass = (j0, j1, dj, i0, i1, di, nb) => {
    for (let j = j0; j !== j1; j += dj) {
      for (let i = i0; i !== i1; i += di) {
        let best = d[j * nx + i];
        for (const [ox, oz, w] of nb) {
          const ii = i + ox;
          const jj = j + oz;
          if (ii >= 0 && ii < nx && jj >= 0 && jj < nz) best = Math.min(best, d[jj * nx + ii] + w);
        }
        d[j * nx + i] = best;
      }
    }
  };
  pass(0, nz, 1, 0, nx, 1, [[-1, 0, 3], [0, -1, 3], [-1, -1, 4], [1, -1, 4]]);
  pass(nz - 1, -1, -1, nx - 1, -1, -1, [[1, 0, 3], [0, 1, 3], [1, 1, 4], [-1, 1, 4]]);
  return d.map((v) => v / 3);
}

const b64u16 = (arr) => Buffer.from(new Uint16Array(arr).buffer).toString("base64");
const b64i8 = (arr) => Buffer.from(new Int8Array(arr).buffer).toString("base64");
const enc = (m) => Math.max(0, Math.min(65535, Math.round((m + 50) * 8)));

// ------------------------------------------------------------------ the city grid
const cityS = await sampler(CITY, 13);
const city = blur(gridFrom(CITY, 5, cityS.at), CITY.nx, CITY.nz);

// water mask at 2 units (raw pixels at exactly 0 m are water), plus Trout Lake, then a signed distance field
const W = { x0: CITY.x0, z0: CITY.z0, step: 2, nx: Math.round(((CITY.nx - 1) * CITY.step) / 2) + 1, nz: Math.round(((CITY.nz - 1) * CITY.step) / 2) + 1 };
const water = new Uint8Array(W.nx * W.nz);
for (let j = 0; j < W.nz; j++) {
  for (let i = 0; i < W.nx; i++) {
    const x = W.x0 + i * W.step;
    const z = W.z0 + j * W.step;
    const lake = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 1;
    water[j * W.nx + i] = lake || cityS.nearest(...xzToLL(x, z)) <= 0.1 ? 1 : 0;
  }
}
const toWater = chamfer(water, W.nx, W.nz);
const toLand = chamfer(water.map((v) => 1 - v), W.nx, W.nz);
const sdfFine = (x, z) => {
  const i = Math.round((x - W.x0) / W.step);
  const j = Math.round((z - W.z0) / W.step);
  const k = Math.min(W.nz - 1, Math.max(0, j)) * W.nx + Math.min(W.nx - 1, Math.max(0, i));
  return (water[k] ? -toLand[k] : toWater[k]) * W.step;
};
const sdf = new Int8Array(CITY.nx * CITY.nz);
for (let j = 0; j < CITY.nz; j++) {
  for (let i = 0; i < CITY.nx; i++) sdf[j * CITY.nx + i] = Math.max(-127, Math.min(127, Math.round(sdfFine(CITY.x0 + i * CITY.step, CITY.z0 + j * CITY.step) * 10)));
}

// ------------------------------------------------------------------ the far grid (mountains and suburbs)
const farS = await sampler(FAR, 11);
const far = gridFrom(FAR, 3, farS.at);

// ------------------------------------------------------------------ calibration and the grade report
const at = (x, z) => {
  const fx = Math.min(CITY.nx - 1.001, Math.max(0, (x - CITY.x0) / CITY.step));
  const fz = Math.min(CITY.nz - 1.001, Math.max(0, (z - CITY.z0) / CITY.step));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const g = (a, b) => city[b * CITY.nx + a];
  return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
};
const data = fs.readFileSync(path.join(ROOT, "data/index.ts"), "utf8");
const stations = [...data.matchAll(/name: "([^"]+)",\s*section: "[^"]+",\s*km: \[(-?[\d.]+), (-?[\d.]+)\]/g)].map((m) => ({ name: m[1], x: +m[2] * K, z: +m[3] * K }));
console.log("\nstation           DEM (m)   sdf (units)");
for (const s of stations) console.log(`${s.name.padEnd(28)} ${at(s.x, s.z).toFixed(1).padStart(6)}   ${sdfFine(s.x, s.z).toFixed(1).padStart(6)}`);
const probes = [["inlet off Gastown", 40, -70], ["False Creek, Cambie", -20, 175], ["Stanley Park", -330, -220], ["Burnaby (Patterson)", 790, 690], ["Trout Lake", 400, 374]];
for (const [n, x, z] of probes) console.log(`${n.padEnd(28)} ${at(x, z).toFixed(1).padStart(6)}   ${sdfFine(x, z).toFixed(1).padStart(6)}  ${sdfFine(x, z) < 0 ? "water" : "land"}`);
const farAt = (lat, lon) => farS.at(lat, lon);
console.log(`Grouse ${farAt(49.3803, -123.0816).toFixed(0)} m, Seymour ${farAt(49.3667, -122.9431).toFixed(0)} m, Burnaby Mtn ${farAt(49.2781, -122.9199).toFixed(0)} m`);

const track = [...fs.readFileSync(path.join(ROOT, "components/train/trackData.ts"), "utf8").matchAll(/\[(-?[\d.]+), (-?[\d.]+)\]/g)].map((m) => [+m[1], +m[2]]);
for (let pass = 0; pass < 3; pass++) {
  for (let i = 2; i < track.length - 2; i++) track[i] = [0, 1].map((k) => (track[i - 2][k] + 2 * track[i - 1][k] + 3 * track[i][k] + 2 * track[i + 1][k] + track[i + 2][k]) / 9);
}
const g = track.map(([x, z]) => at(x, z));
const sig = 60 / 3.85;
const lp = g.map((_, i) => {
  let s = 0;
  let w = 0;
  for (let k = -45; k <= 45; k++) {
    const j = Math.min(g.length - 1, Math.max(0, i + k));
    const ww = Math.exp(-(k * k) / (2 * sig * sig));
    s += g[j] * ww;
    w += ww;
  }
  return s / w;
});
const nearestIdx = (x, z) => track.reduce((b, p, i) => ((p[0] - x) ** 2 + (p[1] - z) ** 2 < (track[b][0] - x) ** 2 + (track[b][1] - z) ** 2 ? i : b), 0);
const iMain = nearestIdx(stations.find((s) => s.name.startsWith("Main")).x, stations.find((s) => s.name.startsWith("Main")).z);
const iComm = nearestIdx(stations.find((s) => s.name.startsWith("Commercial")).x, stations.find((s) => s.name.startsWith("Commercial")).z);
console.log("\nV (units/m)  max low-passed grade   Main → Commercial average");
for (const V of [0.3, 0.4, 0.45]) {
  let mx = 0;
  for (let i = 1; i < lp.length; i++) mx = Math.max(mx, (Math.abs(lp[i] - lp[i - 1]) * V) / 3.85);
  const avg = ((lp[iComm] - lp[iMain]) * V) / ((iComm - iMain) * 3.85);
  console.log(`${V.toFixed(2).padStart(10)}  ${(mx * 100).toFixed(1).padStart(18)} %  ${(avg * 100).toFixed(1).padStart(18)} %`);
}

// ------------------------------------------------------------------ write the modules
const header = (what) => `/**\n * ${what}\n * Generated by scripts/terrain/bake.mjs from AWS Terrain Tiles (Terrarium); do not edit by hand.\n * Heights: metres = value / scale − bias. Grid origin (x0, z0), spacing step, nx × nz, row-major by z.\n */\n`;
fs.writeFileSync(
  path.join(ROOT, "components/train/terrainData.ts"),
  `${header("The city grid (8 units ≈ 73 m) and a water signed-distance field in tenths of a unit, positive on land.")}export const DEM_CITY = ${JSON.stringify({ ...CITY, scale: 8, bias: 50 })} as const;\nexport const DEM_CITY_DATA =\n  "${b64u16(Array.from(city, enc))}";\nexport const SDF_CITY = ${JSON.stringify({ ...CITY, scale: 10 })} as const;\nexport const SDF_CITY_DATA =\n  "${b64i8(sdf)}";\n`,
);
fs.writeFileSync(
  path.join(ROOT, "components/train/terrainFar.ts"),
  `${header("The far grid (25 units ≈ 230 m): North Vancouver and the North Shore mountains, Burnaby Mountain, the suburbs.")}export const DEM_FAR = ${JSON.stringify({ ...FAR, scale: 8, bias: 50 })} as const;\nexport const DEM_FAR_DATA =\n  "${b64u16(Array.from(far, enc))}";\n`,
);
console.log("\nwrote components/train/terrainData.ts and components/train/terrainFar.ts");
