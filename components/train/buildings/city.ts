/**
 * The 2100 city builder. Heroes first (their footprints reserved), then lots along every real street's frontage
 * (roads.ts), turned square to it and as deep as the block allows: what stands on each follows the City's zoning
 * (houses on the single-family streets, apartments, shopfronts on the commercial strips, old brick in the historic
 * areas, warehouses on industrial land, towers only where the zoning takes them) within a neighbourhood era mix, an
 * archetype re-rolled when a neighbour already has it, heights capped relative to the deck near the guideway (no
 * footprint within 17 units, low podiums within 30, full height by 72), buildings standing on the lowest ground under
 * them. Houses face their street. False Creek is left open water. Geometry merges into 256-unit chunks, a solid and a
 * glass mesh each, so frustum and shadow culling work. Pure apart from three.js geometry.
 */
import { nearBusStop } from "../buses";
import { inHarbourfront } from "../harbourfront";
import { nearWce } from "../wce";
import type { BufferGeometry } from "three";

import { Rng as CityRng, type Rng } from "../cityModel";
import { railNear } from "../rail";
import { landClass, nearestRoadDir, pointAt, roadDist, roads } from "../roadNetwork";
import { onFeature, placeAt } from "../commonsLayout";
import { inSetZone } from "../sets/zones";
import { inLandmark, inPark, LANDMARKS, nearBridge, seawallDist, streamDist } from "../sites";
import { groundAt, inWater, RASTER, surfaceAt } from "../terrain";
import { PATH_SAMPLES, STATION_XZ, trackDist, trackNearest } from "../track";
import type { SpeciesId } from "../trees/species";
import { ART, MURAL0 } from "../cultureArt";
import { type MuralKind, muralsOf } from "../muralArt";
import { BUILD, type Ctx, PAL } from "./archetypes";
import { cap, fp, walls } from "./parts";
import { inYard } from "../railYard";
import { inSenakw, PAVILION, podiumLevels, PODIUMS, towerBase, towerPoly, TOWERS } from "./senakw";
import { ARCH_BY_ERA, ARCH_DENSE, ARCH_LOWRISE, type ArchId, hood, type Hood, HOUSE_MIX, TOWERISH, ZONES } from "./eras";
import { heroLevels, HEROES } from "./heroes";
import { type HouseInst, type HouseKind } from "./houses";
import { GeoBuilder, type V3 } from "./meshBuilder";
import type { Sink } from "./parts";

/**
 * A built lot: its centre and its extent on the axes (w, d: the box the city's quick tests use), height and top; the
 * footprint itself is fw × fd turned by ry to face its street. `arch` names what stands on it, for the debug probes.
 */
export type Lot = { x: number; z: number; w: number; d: number; h: number; top: number; arch?: ArchId; ry?: number; fw?: number; fd?: number };
/** A mural on a building's blank side wall: its centre, the turn that faces its plane out, its size, the atlas cell. */
export type Mural = { x: number; y: number; z: number; ry: number; s: number; cell: number; w?: number };

/** A mural's subject: one of the city's murals of a kind (muralArt.ts), or one of the community's (cultureArt.ts). */
type Subject = MuralKind | "hogan" | "faces" | "hands" | "dragon" | "rangoli" | "japantown";
/**
 * Where the murals are and what they show, each wall a mural of its own (no two the same): Hogan's Alley's faces at Main
 * and Union, the Powell Street banner by Oppenheimer Park, the Mural Festival's portraits and colour murals round Main
 * Street and Mount Pleasant, Chinatown's dragon, weavings and formline in Gastown and by Science World, the rangoli and
 * raised hands on Commercial Drive, rainbow hands toward Davie. A place's murals take its biggest walls within sight of
 * the line, the nearest first.
 */
const MURAL_PLAN: [Hood | { x: number; z: number; r: number }, Subject[]][] = [
  [{ x: 98, z: 101, r: 50 }, ["hogan", "faces"]],
  [{ x: 143, z: 43, r: 60 }, ["japantown"]],
  ["mountpleasant", ["portrait", "abstract", "weave", "portrait", "formline", "portrait"]],
  ["mainst", ["portrait", "weave", "formline"]],
  ["strathcona", ["weave", "portrait"]],
  ["chinatown", ["dragon", "formline"]],
  ["gastown", ["formline", "weave", "abstract"]],
  ["flats", ["weave", "formline"]],
  ["commercial", ["portrait", "rangoli", "hands", "abstract"]],
  ["westend", ["hands", "portrait"]],
  ["downtown", ["formline", "abstract"]],
  ["yaletown", ["abstract"]],
  ["olympic", ["weave"]],
  ["joyce", ["faces", "portrait"]],
];
const COMMUNITY: Partial<Record<Subject, number>> = { hogan: ART.hogan, faces: ART.faces, hands: ART.hands, dragon: ART.dragon, rangoli: ART.rangoli, japantown: ART.japantown };
/**
 * Where Coast Salish–inspired halls stand among the city's blocks, and how often a block there is one: round Main
 * Street, Mount Pleasant and the flats by Science World, East Hastings and Strathcona, Commercial Drive, a few on the
 * North Shore. Elsewhere none.
 */
const HALL_RATE: Partial<Record<Hood, number>> = { mountpleasant: 0.05, mainst: 0.08, flats: 0.15, strathcona: 0.1, commercial: 0.1, northshore: 0.012 };
/** Inside a lot's turned footprint (city.ts turns a lot's local (lx, lz) to (lx c + lz s, -lx s + lz c)). */
function inFootprint(L: Lot, x: number, z: number): boolean {
  const c = Math.cos(L.ry ?? 0);
  const s = Math.sin(L.ry ?? 0);
  const dx = x - L.x;
  const dz = z - L.z;
  return Math.abs(dx * c - dz * s) < (L.fw ?? L.w) / 2 && Math.abs(dx * s + dz * c) < (L.fd ?? L.d) / 2;
}
/** A hash of a point to [0, 1): the murals are chosen by place, so the city's own draws are untouched. */
const hash01 = (x: number, z: number) => {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
/** A lot being laid out: centre, frontage width, depth into the block, and its turn (local +z points into the block). */
type Plot = { x: number; z: number; w: number; d: number; ry: number };
/** What a frontage holds, by land use: house, apartments, shopfronts, a tower, industry, historic brick. */
type LotKind = "house" | "apt" | "shop" | "tower" | "ind" | "hist";
/** Frontage width range and depth for each kind of lot. */
const LOT: Record<LotKind, [number, number, number]> = {
  house: [7, 8.5, 10],
  apt: [10, 14, 12],
  shop: [9, 12, 11],
  tower: [12, 17, 15],
  ind: [13, 19, 15],
  hist: [8, 11, 10],
};
const DENSE_LOT: [number, number, number] = [9, 14, 12];
const lotKind = (lu: number, name: Hood, dense: boolean, houses: boolean): LotKind =>
  lu === 1 || lu === 2 ? "house" : lu === 3 ? "apt" : lu === 4 ? "shop" : lu === 5 ? (dense || name === "joyce" || name === "commercial" ? "tower" : "apt") : lu === 6 ? "hist" : lu === 7 ? "ind" : houses ? "house" : dense ? "tower" : "apt";
export type TerraceTree = { x: number; y: number; z: number; s: number; sp: SpeciesId };
/** A rooftop drone pad: its centre on its deck's top, its radius, and whether a drone stands parked on it. */
export type RoofPad = { x: number; y: number; z: number; r: number; parked: boolean };
export type CityGeometry = {
  chunks: { key: string; solid: BufferGeometry; glass: BufferGeometry }[];
  crownA: BufferGeometry;
  crownB: BufferGeometry;
  dome: BufferGeometry;
  neon: BufferGeometry;
  houses: HouseInst[];
  lots: Lot[];
  murals: Mural[];
  terrace: TerraceTree[];
  /** The biodomes' rooftop drone pads, where the delivery drones land (droneways.ts). */
  pads: RoofPad[];
  ms: number;
  /** Milliseconds per phase, for the budget checks. */
  phases: Record<string, number>;
};

/** Nothing above a podium within this distance of the guideway. */
export const CORRIDOR = 30;
/** No building footprint within this distance of the guideway. */
export const CLEAR = 17;
/**
 * In the towers' districts the city closes in round the line, as it does round the real one: footprints from this
 * close, podiums kept under the deck out to DENSE_PODIUM, then full height by DENSE_FULL.
 */
const DENSE_CLEAR = 10;
const DENSE_PODIUM = 16;
const DENSE_FULL = 40;

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance to the guideway and the deck height there, on the terrain raster (bilinear), computed once. */
function corridorRaster() {
  const g = RASTER;
  const d = new Float32Array(g.nx * g.nz).fill(Infinity);
  const y = new Float32Array(g.nx * g.nz);
  // near the line and its turning loops (where the clearance and height rules bite): each track sample paints the cells within 100
  const R = 100;
  const rc = Math.ceil(R / g.step);
  for (let s = 0; s < PATH_SAMPLES.length; s += 3) {
    const p = PATH_SAMPLES[s].p;
    const ci = Math.round((p.x - g.x0) / g.step);
    const cj = Math.round((p.z - g.z0) / g.step);
    for (let j = Math.max(0, cj - rc); j <= Math.min(g.nz - 1, cj + rc); j++) {
      for (let i = Math.max(0, ci - rc); i <= Math.min(g.nx - 1, ci + rc); i++) {
        const k = j * g.nx + i;
        const dd = Math.hypot(g.x0 + i * g.step - p.x, g.z0 + j * g.step - p.z);
        if (dd < d[k]) {
          d[k] = dd;
          y[k] = p.y;
        }
      }
    }
  }
  // beyond (only house detail and thinning care): the full search on a grid four times coarser, interpolated
  const S = 4;
  const cx = Math.ceil((g.nx - 1) / S) + 1;
  const cz = Math.ceil((g.nz - 1) / S) + 1;
  const far = new Float32Array(cx * cz);
  for (let j = 0; j < cz; j++) {
    for (let i = 0; i < cx; i++) {
      const x = g.x0 + i * S * g.step;
      const z = g.z0 + j * S * g.step;
      const f = trackNearest(x, z);
      far[j * cx + i] = Math.hypot(f.p.x - x, f.p.z - z);
    }
  }
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      if (d[k] !== Infinity) continue;
      const fi = Math.min(cx - 1.001, i / S);
      const fj = Math.min(cz - 1.001, j / S);
      const i0 = Math.floor(fi);
      const j0 = Math.floor(fj);
      const u = fi - i0;
      const v = fj - j0;
      const q = j0 * cx + i0;
      d[k] = Math.max(R, (far[q] * (1 - u) + far[q + 1] * u) * (1 - v) + (far[q + cx] * (1 - u) + far[q + cx + 1] * u) * v);
    }
  }
  const at = (arr: Float32Array, x: number, z: number) => {
    const fx = Math.min(g.nx - 1.001, Math.max(0, (x - g.x0) / g.step));
    const fz = Math.min(g.nz - 1.001, Math.max(0, (z - g.z0) / g.step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * g.nx + i;
    return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + g.nx] * (1 - u) + arr[k + g.nx + 1] * u) * v;
  };
  return { dist: (x: number, z: number) => at(d, x, z), deck: (x: number, z: number) => at(y, x, z) };
}

export function buildCity(rng: Rng, lowEnd: boolean): CityGeometry {
  const now = () => (typeof performance !== "undefined" ? performance.now() : 0);
  const t0 = now();
  const phases: Record<string, number> = {};
  let tp = t0;
  const mark = (k: string) => {
    const t = now();
    phases[k] = Math.round(t - tp);
    tp = t;
  };
  const cor = corridorRaster();
  mark("corridor");
  const chunks = new Map<string, Sink>();
  const shared = { crownA: new GeoBuilder(), crownB: new GeoBuilder(), dome: new GeoBuilder(), neon: new GeoBuilder() };
  const sinkAt = (x: number, z: number): Sink => {
    const key = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    let s = chunks.get(key);
    if (!s) {
      s = { solid: new GeoBuilder(), glass: new GeoBuilder(), ...shared };
      chunks.set(key, s);
    }
    return s;
  };
  const lots: Lot[] = [];
  const houses: HouseInst[] = [];
  const terrace: TerraceTree[] = [];
  const addTerrace = (x: number, y: number, z: number, s: number, sp: SpeciesId) => terrace.push({ x, y, z, s, sp });
  const pads: RoofPad[] = [];
  // the blank walls a mural could take, within sight of the line, as big as the wall allows: the murals are chosen from
  // them once every lot stands (none on a wall facing a neighbour's)
  type Blank = Mural & { hood: Hood; dist: number; subject?: number; front: boolean; lot: string };
  const blanks: Blank[] = [];
  /** The low and mid-rise blocks a Coast Salish–inspired hall may stand for. */
  const SALISH_FROM = new Set<ArchId>(["midrise", "courtyard", "townhouses", "timberTerraces", "colourPanels", "metalLoft", "stacked", "ziggurat", "biodome"]);
  // one scratch sink for them all (a builder sets aside room for thousands of vertices): what goes in is never drawn
  let scratch: Sink | null = null;
  const scratchSink = (): Sink => (scratch ??= { solid: new GeoBuilder(), glass: new GeoBuilder(), crownA: new GeoBuilder(), crownB: new GeoBuilder(), dome: new GeoBuilder(), neon: new GeoBuilder() });
  // a building's own paintings (subject given): -1 a Coast Salish–inspired hall's, its front a painted house front and
  // its sides formline or weaving; a cell, that cell (a carved post's face); a front's are as wide as the wall allows
  const muralAt = (x: number, z: number, ry: number, name: Hood, dist: number, lx: number, lz: number, len: number, y0: number, y1: number, subject?: number, front = false) => {
    const own = subject !== undefined;
    if (dist > (own ? 260 : 150)) return;
    const s = front ? Math.min(y1 - y0, 8) : Math.min(len, y1 - y0, 8);
    if (s < (front ? 1.2 : 2.4)) return;
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    // the wall's face, a little out from it, and its outward normal: the side walls face along local x, the front -z
    const side = front ? 0 : Math.sign(lx);
    const ox = lx + side * 0.05;
    const oz = front ? lz - 0.05 : lz;
    const wx = x + ox * c + oz * sn;
    const wz = z - ox * sn + oz * c;
    const [nx, nz] = front ? [-sn, -c] : [side * c, -side * sn];
    const w = front ? Math.min(len, 2 * s) : undefined;
    blanks.push({ x: wx, y: y0 + Math.min(0.4, (y1 - y0 - s) / 2) + s / 2, z: wz, ry: Math.atan2(nx, nz), s, cell: subject ?? -1, w, hood: name, dist, subject, front, lot: `${x},${z}` });
  };
  // the ground drawn on low-end devices is coarser (12-unit cells), so on a slope it can stand above the true ground:
  // floors stand on whichever is higher and walls reach down to whichever is lower, so the land never covers a wall
  const floorAt = (x: number, z: number) => (lowEnd ? Math.max(groundAt(x, z), surfaceAt(x, z, 2)) : groundAt(x, z));
  const footAt = (x: number, z: number) => (lowEnd ? Math.min(groundAt(x, z), surfaceAt(x, z, 2)) : groundAt(x, z));

  // heroes, with their footprints reserved (seated by heroLevels, which the Skyport's pads are found by too)
  for (const h of HEROES) {
    const { yb, yt } = heroLevels(h, lowEnd);
    h.build(sinkAt(h.x, h.z), h.x, h.z, yb, yt, rng, addTerrace);
    lots.push({ x: h.x, z: h.z, w: h.r * 2, d: h.r * 2, h: h.h, top: yt + h.h + 3 });
  }
  const inHero = (x: number, z: number) => HEROES.some((h) => (x - h.x) ** 2 + (z - h.z) ** 2 < (h.r + 1) ** 2);
  mark("heroes");

  // the lots, block by block
  const last = new Map<string, string>();
  /** The districts of towers, whose blocks are packed and whose smaller lots may carry slender towers. */
  const DENSE = new Set<Hood>(["downtown", "westend", "yaletown", "mainst"]);
  /** Downtown's highest ground for towers, round Burrard and Georgia. */
  const CORE = { x: -55, z: 25 };
  /** Archetypes that keep under a low height limit by themselves. */
  const LOW_OK = new Set<ArchId>(["midrise", "colourPanels", "heritageBrick", "warehouse", "chinatownBlock", "salishHall"]);
  let buildMs = 0;
  const archMs: Record<string, number> = {};
  const pickArch = (zone: NonNullable<(typeof ZONES)[Hood]>, name: Hood, big: boolean, cell: string, near: string[]): { era: 0 | 1 | 2; arch: ArchId } => {
    let era: 0 | 1 | 2 = 0;
    let arch: ArchId = "heritageBrick";
    for (let tries = 0; tries < 6; tries++) {
      const r = rng.next();
      era = r < zone.era[0] ? 0 : r < zone.era[0] + zone.era[1] ? 1 : 2;
      if (zone.houses && era === 0) arch = "house";
      else if (!zone.houses && rng.next() < (HOUSE_MIX[name] ?? 0)) arch = "house";
      else if (name === "chinatown" && era === 0) arch = rng.next() < 0.8 ? "chinatownBlock" : "heritageBrick";
      else if (name === "gastown" && era === 0) arch = rng.next() < 0.55 ? "heritageBrick" : "warehouse";
      else if (name === "yaletown" && era === 0) arch = rng.next() < 0.7 ? "warehouse" : "heritageBrick";
      else {
        const list = (era > 0 && zone.houses ? ARCH_LOWRISE[era as 1 | 2] : era > 0 && DENSE.has(name) ? ARCH_DENSE[era as 1 | 2] : ARCH_BY_ERA[era]).filter(([a]) => big || !TOWERISH.has(a));
        const total = list.reduce((t, [, wt]) => t + wt, 0);
        let roll = rng.next() * total;
        arch = list.find(([, wt]) => (roll -= wt) < 0)?.[0] ?? "townhouses";
      }
      const key = `${arch}${era}`;
      // never the same as the lot to the left, above or on either upper diagonal (the downtown tower varies itself)
      if (arch === "house" || arch === "dtTower" || near.every((n) => last.get(n) !== key)) {
        last.set(cell, key);
        break;
      }
    }
    return { era, arch };
  };

  /**
   * What the zoning allows on a lot (landuseData.ts): on the single-family and duplex streets houses among townhouses
   * and low blocks (the multiplexes Vancouver allowed from 2023, grown in by 2100), no towers; apartments; shopfronts
   * on the commercial strips; old brick in the historic areas; warehouses on industrial land; towers only where the
   * zoning takes them (comprehensive development, downtown).
   */
  const pickOf = <T,>(list: T[]) => list[Math.floor(rng.next() * list.length)];
  const byLand = (arch: ArchId, era: 0 | 1 | 2, lu: number, name: Hood): ArchId => {
    if (lu === 1 || lu === 2) return TOWERISH.has(arch) ? pickOf<ArchId>(["townhouses", "colourPanels", "timberTerraces", "midrise"]) : arch;
    if (lu === 3) return arch === "house" || TOWERISH.has(arch) ? pickOf<ArchId>(["midrise", "courtyard", "colourPanels", "timberTerraces", "townhouses"]) : arch;
    if (lu === 4) return arch === "house" || TOWERISH.has(arch) ? (era === 0 ? "heritageBrick" : pickOf<ArchId>(["midrise", "colourPanels", "officeMullion"])) : arch;
    if (lu === 6) return era === 0 ? (name === "chinatown" ? "chinatownBlock" : "heritageBrick") : arch === "house" || TOWERISH.has(arch) ? "midrise" : arch;
    if (lu === 7) return era === 2 ? pickOf<ArchId>(["metalLoft", "warehouse"]) : "warehouse";
    if (lu === 5) return arch === "house" ? "midrise" : arch;
    return arch;
  };
  /** Height limits by land use: duplex streets, apartments, commercial strips, historic areas, industry. */
  const CAP: Record<number, number> = { 1: 9, 2: 10, 3: 15, 4: 17, 6: 12, 7: 11 };
  // round Main Street–Science World the flats' apartments, shops and works have given way to towers, as the real
  // ones have: their land builds as the towers' land
  const towerLand = (name: Hood, lu: number) => (name === "mainst" && (lu === 0 || lu === 3 || lu === 4 || lu === 7) ? 5 : lu);
  const toT = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

  const buildLot = (l: Plot, name: Hood, zone: NonNullable<(typeof ZONES)[Hood]>, lu: number, dense: boolean) => {
    const { x, z, w, d, ry } = l;
    const pts = samplePts(l);
    const gs = pts.map(([px, pz]) => groundAt(px, pz));
    // too steep a lot by the true ground; its floor and foot by the ground as drawn (floorAt, footAt)
    if (Math.max(...gs) - Math.min(...gs) > 0.42 * Math.max(w, d)) return;
    const yb = Math.min(...pts.map(([px, pz]) => footAt(px, pz))) - 0.6;
    const yt = Math.max(...pts.map(([px, pz]) => floorAt(px, pz)));
    const dist = Math.min(...pts.map(([px, pz]) => cor.dist(px, pz)));
    const onSite = pts.some(([px, pz]) => inSenakw(px, pz) || inYard(px, pz));
    // the turned footprint's extent on the axes, for the city's box tests
    const aw = Math.abs(w * Math.cos(ry)) + Math.abs(d * Math.sin(ry));
    const ad = Math.abs(w * Math.sin(ry)) + Math.abs(d * Math.cos(ry));
    const ci = Math.round(x / 9);
    const cj = Math.round(z / 9);
    const picked = pickArch(zone, name, dense ? Math.min(w, d) > 6.5 : w > 11 && d > 11, `${ci},${cj}`, [`${ci - 1},${cj}`, `${ci},${cj - 1}`, `${ci - 1},${cj - 1}`, `${ci + 1},${cj - 1}`]);
    const era = picked.era;
    const arch = byLand(picked.arch, era, lu, name);
    if (arch === "house") {
      // the far suburbs are thinned
      if (dist > 320 && rng.next() < (lowEnd ? 0.6 : 0.35)) return;
      // detailed templates near the line, the plain one beyond; old and new side by side; each faces its street
      const far = dist > (lowEnd ? 90 : 150);
      const roll = rng.next();
      const kind: HouseKind = far ? "simple" : roll < 0.34 ? "victorian" : roll < 0.56 ? "craftsman" : roll < 0.72 ? "special" : roll < 0.88 ? "modern" : "duplex";
      const palette = kind === "modern" ? [0x3a3d42, 0xf2f0ea, 0x6b7a6f, 0x2e3034, 0xb8bcc2, 0x9a5634] : kind === "duplex" ? [0x2f3b4c, 0x4a4d52, 0xe9e4da, 0x7f9a6a, 0x8f3b3b, 0xd9c08a] : PAL.wood;
      const wall = palette[Math.floor(rng.next() * palette.length)];
      const roof = [0x4a4f58, 0x5a4a42, 0x3e4651, 0x6b5a4a, 0x7a3b32, 0x445a4a][Math.floor(rng.next() * 6)];
      // on the towers' podiums (senakw.ts): its numbers drawn, nothing built
      if (onSite) return;
      houses.push({ kind, x, y: yt, z, ry, sx: Math.min(1.1, Math.max(0.7, w / 7)), sz: Math.min(1.1, Math.max(0.7, d / 9)), wall: toT(wall), roof: toT(roof) });
      lots.push({ x, z, w: aw, d: ad, h: 6, top: yt + 7, ry, fw: w, fd: d });
      return;
    }
    // most lots short of the zone's limit, a few standing out above it; the towers' districts the other way round, and
    // downtown rising to a crown round its core; no tower more than six times as tall as its lot is wide (nine in the
    // towers' districts, whose real blocks are small)
    let H = zone.h[era][0] + Math.pow(rng.next(), dense ? 0.85 : 1.7) * (zone.h[era][1] - zone.h[era][0]);
    if (TOWERISH.has(arch) && rng.next() < 0.07) H *= 1.3;
    if (name === "downtown") H *= 0.75 + 0.5 * (1 - Math.min(1, Math.hypot(x - CORE.x, z - CORE.z) / 140));
    H = Math.min(H, (dense ? 9 : 6) * Math.min(w, d), CAP[lu] ?? Infinity);
    // near the guideway: tops stay a few units above the deck, opening up to full height by 72
    const deckTop = cor.deck(x, z) + 4 - yt;
    const allow = dense
      ? dist < DENSE_PODIUM
        ? Math.max(3, Math.min(10, deckTop - 7))
        : Math.max(5.5, deckTop) + 400 * sstep(DENSE_PODIUM, DENSE_FULL, dist)
      : dist < CORRIDOR
        ? Math.max(3, Math.min(5.5, deckTop))
        : Math.max(5.5, deckTop) + 400 * sstep(CORRIDOR, 72, dist);
    let chosen = arch;
    if (H > allow) {
      H = allow;
      // what stays low by the guideway: the shop-front block, painted panels, a low timber terrace, old brick
      if (H < 9 && !LOW_OK.has(arch)) {
        const low: Exclude<ArchId, "house">[] = era === 2 ? ["midrise", "colourPanels", "timberTerraces"] : era === 1 ? ["midrise", "colourPanels"] : name === "chinatown" ? ["chinatownBlock"] : ["heritageBrick", "warehouse"];
        chosen = low[Math.floor(rng.next() * low.length)];
      }
    }
    if (H < 3) return;
    // built square to the axes round the lot's centre, then turned to face its street with its terrace trees
    const sink = sinkAt(x, z);
    const builders = [sink.solid, sink.glass, sink.crownA, sink.crownB, sink.dome, sink.neon];
    const starts = builders.map((b) => b.vertices);
    const t0 = terrace.length;
    const p0 = pads.length;
    const ctx: Ctx = {
      rng,
      sink,
      x,
      z,
      w,
      d,
      yb,
      yt,
      H,
      hood: name,
      terrace: addTerrace,
      wall: (lx, lz, len, y0, y1, subject, front) => muralAt(x, z, ry, name, dist, lx, lz, len, y0, y1, subject, front),
      pad: (px, py, pz, r, parked) => pads.push({ x: px, y: py, z: pz, r, parked }),
    };
    const tb = now();
    // some of today's and 2100's low and mid-rise blocks are halls after Coast Salish plank houses, chosen by place;
    // the block a hall stands for still draws its numbers (into a scratch sink), so the rest of the city is as it was
    if (onSite) {
      BUILD[chosen as Exclude<ArchId, "house">]({ ...ctx, sink: scratchSink(), terrace: () => undefined, wall: undefined, pad: undefined });
      return;
    }
    const hall = era > 0 && SALISH_FROM.has(chosen) && hash01(x * 0.73 + 5.1, z * 1.91 - 2.3) < (HALL_RATE[name] ?? 0);
    if (hall) {
      BUILD[chosen as Exclude<ArchId, "house">]({ ...ctx, sink: scratchSink(), terrace: () => undefined, wall: undefined, pad: undefined });
      H = Math.min(H, 6 * 1.9 + 3.7);
      BUILD.salishHall({ ...ctx, H, rng: new CityRng(Math.floor(hash01(z, x) * 2 ** 31)) });
      chosen = "salishHall";
    } else BUILD[chosen as Exclude<ArchId, "house">](ctx);
    builders.forEach((b, i) => b.rotateFrom(starts[i], x, z, ry));
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (const tr of [...terrace.slice(t0), ...pads.slice(p0)]) {
      const dx = tr.x - x;
      const dz = tr.z - z;
      tr.x = x + dx * c + dz * s;
      tr.z = z - dx * s + dz * c;
    }
    const dtb = now() - tb;
    archMs[chosen] = (archMs[chosen] ?? 0) + dtb;
    buildMs += dtb;
    lots.push({ x, z, w: aw, d: ad, h: H + (yt - yb), top: yt + H + 3, arch: chosen, ry, fw: w, fd: d });
  };

  // the points a lot is tested at: corners, mid-sides and centre of its turned footprint
  const samplePts = (l: Plot): [number, number][] => {
    const out: [number, number][] = [];
    const c = Math.cos(l.ry);
    const s = Math.sin(l.ry);
    for (const [a, b] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
      [0, 0],
      [0, -0.5],
      [0, 0.5],
      [-0.5, 0],
      [0.5, 0],
    ]) {
      const lx = a * l.w;
      const lz = b * l.d;
      out.push([l.x + lx * c + lz * s, l.z - lx * s + lz * c]);
    }
    return out;
  };
  /** Clear of water, parks, landmarks, heroes, the guideway, the creek, the sets, the other rail and every road; the bridges and the seawall walk, narrower than a lot, against its whole footprint. */
  const parcelClear = (l: Plot, clear: number) =>
    !samplePts(l).some(
      ([px, pz]) =>
        inWater(px, pz) || inPark(px, pz) || inLandmark(px, pz, 2) || inHarbourfront(px, pz, 1.5) || nearBusStop(px, pz, 0.8) || nearWce(px, pz, 0.5) || inHero(px, pz) || cor.dist(px, pz) < clear || streamDist(px, pz) < 9 || inSetZone(px, pz, 2) || railNear(px, pz, 8) || roadDist(px, pz) < 0.35 || onFeature(px, pz, 1),
    ) &&
    !nearBridge(l.x, l.z, 2 + Math.hypot(l.w, l.d) / 2) &&
    seawallDist(l.x, l.z) >= Math.min(l.w, l.d) / 2 + 0.8;

  // what has been built, on a 2-unit grid, so no two lots overlap
  const OCC = 2;
  const ox0 = RASTER.x0;
  const oz0 = RASTER.z0;
  const onx = Math.ceil((RASTER.nx * RASTER.step) / OCC);
  const onz = Math.ceil((RASTER.nz * RASTER.step) / OCC);
  const occ = new Uint8Array(onx * onz);
  const cellsOf = (l: Plot, grow: number, f: (k: number) => boolean | void): boolean => {
    const c = Math.cos(l.ry);
    const s = Math.sin(l.ry);
    const r = Math.hypot(l.w, l.d) / 2 + grow;
    const i0 = Math.max(0, Math.floor((l.x - r - ox0) / OCC));
    const i1 = Math.min(onx - 1, Math.floor((l.x + r - ox0) / OCC));
    const j0 = Math.max(0, Math.floor((l.z - r - oz0) / OCC));
    const j1 = Math.min(onz - 1, Math.floor((l.z + r - oz0) / OCC));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = ox0 + (i + 0.5) * OCC - l.x;
        const dz = oz0 + (j + 0.5) * OCC - l.z;
        // into the lot's own axes
        const a = dx * c - dz * s;
        const b = dx * s + dz * c;
        if (Math.abs(a) <= l.w / 2 + grow && Math.abs(b) <= l.d / 2 + grow && f(j * onx + i)) return true;
      }
    }
    return false;
  };
  const free = (l: Plot) => !cellsOf(l, -0.4, (k) => occ[k] === 1);
  const take = (l: Plot) => cellsOf(l, 0.3, (k) => void (occ[k] = 1));

  // the heroes' footprints are taken first
  for (const h of HEROES) take({ x: h.x, z: h.z, w: h.r * 2, d: h.r * 2, ry: 0 });

  /** Parcels the passes took and left empty (the zone's share of open lots), for the last pass to build on. */
  const vacant: { l: Plot; name: Hood; lu: number }[] = [];

  // lots along every street's frontage, the arterials' first (their shops and towers take the corners), each turned
  // square to its street and as deep as the block allows
  const { edges, nodes } = roads();
  const order = edges.map((_, k) => k).sort((a, b) => edges[a].cls - edges[b].cls || edges[b].len - edges[a].len);
  for (const k of order) {
    const e = edges[k];
    // short of each junction by the width of the road crossing there
    const endPad = (n: number) => (nodes[n].deg >= 3 ? Math.max(...nodes[n].edges.map((o) => edges[o].half)) + 1.2 : 0.6);
    const s0 = endPad(e.a);
    const s1 = e.len - endPad(e.b);
    for (const side of [1, -1]) {
      let s = s0;
      while (s < s1 - 4) {
        const [mx, mz] = pointAt(e, s + 3);
        const name = hood(mx, mz);
        const zone = ZONES[name];
        const lu = towerLand(name, landClass(mx, mz));
        const dense = DENSE.has(name);
        const kind = lotKind(lu, name, dense, zone?.houses ?? false);
        // the towers' districts have the smallest real blocks: their lots are smaller, their towers slimmer
        const [w0, w1, depth] = dense && kind === "tower" ? DENSE_LOT : LOT[kind];
        const w = Math.min(w0 + rng.next() * (w1 - w0), s1 - s);
        if (!zone || w < 5) {
          s += 6;
          continue;
        }
        // the frontage's direction at its middle, and the way into the block
        const [ax, az] = pointAt(e, s);
        const [bx, bz] = pointAt(e, s + w);
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const tx = (bx - ax) / L;
        const tz = (bz - az) / L;
        // the left of a → b is (tz, -tx); side 1 builds there
        const nx = side * tz;
        const nz = side * -tx;
        const back = e.half + (dense ? 0.3 : 0.7);
        let placed: Plot | null = null;
        for (const f of [1, 0.8, 0.62, 0.48]) {
          const d = depth * f;
          const cx = (ax + bx) / 2 + nx * (back + d / 2);
          const cz = (az + bz) / 2 + nz * (back + d / 2);
          // local +z points into the block, local +x along the frontage
          const l: Plot = { x: cx, z: cz, w: L - (dense ? 0.3 : 0.8), d: d - 0.4, ry: Math.atan2(nx, nz) };
          if (l.w < 4.5 || l.d < 4.5) break;
          if (cx < RASTER.x0 + 10 || cz < RASTER.z0 + 10) break;
          if (free(l) && parcelClear(l, dense ? DENSE_CLEAR : CLEAR)) {
            placed = l;
            break;
          }
        }
        s += w;
        if (!placed || !zone) continue;
        take(placed);
        // the low-end budget thins the city away from the line
        if (lowEnd && kind !== "tower" && cor.dist(placed.x, placed.z) > 120 && rng.next() < 0.3) continue;
        if (rng.next() > zone.build) {
          vacant.push({ l: placed, name, lu });
          continue;
        }
        buildLot(placed, name, zone, lu, dense);
      }
    }
  }
  // then the blocks' insides (a big block, an industrial yard): wherever a lot still fits clear of every road and
  // every other lot, turned square to the nearest road
  for (let gz = RASTER.z0 + 14; gz < RASTER.z0 + (RASTER.nz - 1) * RASTER.step - 14; gz += 8) {
    for (let gx = RASTER.x0 + 14; gx < RASTER.x0 + (RASTER.nx - 1) * RASTER.step - 14; gx += 8) {
      const oi = Math.floor((gx - ox0) / OCC);
      const oj = Math.floor((gz - oz0) / OCC);
      if (occ[oj * onx + oi] || roadDist(gx, gz) < 3.5) continue;
      const name = hood(gx, gz);
      const zone = ZONES[name];
      if (!zone) continue;
      const lu = towerLand(name, landClass(gx, gz));
      const dense = DENSE.has(name);
      const kind = lotKind(lu, name, dense, zone.houses ?? false);
      const [, w1, depth] = dense && kind === "tower" ? DENSE_LOT : LOT[kind];
      const dir = nearestRoadDir(gx, gz, 40);
      // local +x along the nearest road, +z away from it (or square to the axes, with none near)
      const ry = dir ? Math.atan2(-dir[1], dir[0]) : 0;
      for (const f of [1, 0.75, 0.55]) {
        const l: Plot = { x: gx, z: gz, w: w1 * f, d: depth * f, ry };
        if (l.w < 4.5 || l.d < 4.5) break;
        if (!free(l) || !parcelClear(l, dense ? DENSE_CLEAR : CLEAR)) continue;
        take(l);
        if (lowEnd && kind !== "tower" && cor.dist(gx, gz) > 120 && rng.next() < 0.3) break;
        if (rng.next() > zone.build) {
          vacant.push({ l, name, lu });
          break;
        }
        buildLot(l, name, zone, lu, dense);
        break;
      }
    }
  }

  // last, the city packed tight where it should be: downtown and its neighbours, and the ground round Science World
  // seen from the basin. Only adds: the open parcels in those districts are built, and every gap a lot still fits is
  // filled, smaller lots where the room is smaller. A street drawn nowhere (under a set, a landmark, the guideway's
  // clearance) no longer holds a lot back, since each of those keeps its own ground; the open places, the stations'
  // ways in and the parks keep theirs.
  {
    const SW = LANDMARKS.find((l) => l.key === "scienceWorld");
    const PACKED = new Set<Hood>(["downtown", "westend", "yaletown", "gastown", "chinatown", "mainst", "olympic", "flats"]);
    const packed = (x: number, z: number, name: Hood) => PACKED.has(name) || (SW !== undefined && Math.hypot(x - SW.px, z - SW.pz) < 230 && name !== "park" && name !== "cut");
    // the drawn streets only, by 16-unit cell
    const cells = new Map<number, number[][]>();
    for (const e of edges) {
      for (let k = 0; k + 3 < e.pts.length; k += 2) {
        if (!e.shown[k / 2]) continue;
        const sg = [e.pts[k], e.pts[k + 1], e.pts[k + 2], e.pts[k + 3], e.half];
        for (let a = Math.floor((Math.min(sg[0], sg[2]) - 6) / 16); a <= Math.floor((Math.max(sg[0], sg[2]) + 6) / 16); a++) {
          for (let b = Math.floor((Math.min(sg[1], sg[3]) - 6) / 16); b <= Math.floor((Math.max(sg[1], sg[3]) + 6) / 16); b++) {
            const key = a * 100000 + b;
            const c = cells.get(key);
            if (c) c.push(sg);
            else cells.set(key, [sg]);
          }
        }
      }
    }
    const shownDist = (x: number, z: number) => {
      let best = 99;
      for (const [ax, az, bx, bz, h] of cells.get(Math.floor(x / 16) * 100000 + Math.floor(z / 16)) ?? []) {
        const ex = bx - ax;
        const ez = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
        best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t) - h);
      }
      return best;
    };
    // the ground beside each station stays for its ways in (stationAccess.ts plans them round the city's lots): the
    // strip along the track there, out to its stair towers
    const byStation = (x: number, z: number) => STATION_XZ.some(([sx, sz]) => (x - sx) ** 2 + (z - sz) ** 2 < 38 * 38) && trackDist(x, z) < 19;
    const fits = (l: Plot, clear: number) =>
      !samplePts(l).some(
        ([px, pz]) =>
          inWater(px, pz) || inPark(px, pz) || inLandmark(px, pz, 2) || inHarbourfront(px, pz, 1.5) || nearBusStop(px, pz, 0.8) || nearWce(px, pz, 0.5) || inHero(px, pz) || cor.dist(px, pz) < clear || streamDist(px, pz) < 9 || inSetZone(px, pz, 2) || railNear(px, pz, 8) || shownDist(px, pz) < 0.6 || onFeature(px, pz, 1) || placeAt(px, pz) !== undefined || byStation(px, pz),
      ) &&
      !nearBridge(l.x, l.z, 2 + Math.hypot(l.w, l.d) / 2) &&
      seawallDist(l.x, l.z) >= Math.min(l.w, l.d) / 2 + 0.8;
    for (const v of vacant) {
      const zone = ZONES[v.name];
      if (!zone || !packed(v.l.x, v.l.z, v.name) || byStation(v.l.x, v.l.z)) continue;
      buildLot(v.l, v.name, zone, v.lu, DENSE.has(v.name));
    }
    const STEP = lowEnd ? 4 : 3;
    const SIZES: [number, number][] = [
      [14, 12],
      [12, 10],
      [10, 9],
      [8.5, 8],
      [6.5, 6.5],
      [5.2, 5.2],
    ];
    for (let gz = -120; gz < 420; gz += STEP) {
      for (let gx = -260; gx < 360; gx += STEP) {
        const oi = Math.floor((gx - ox0) / OCC);
        const oj = Math.floor((gz - oz0) / OCC);
        if (occ[oj * onx + oi] || shownDist(gx, gz) < 1.5) continue;
        const name = hood(gx, gz);
        const zone = ZONES[name];
        if (!zone || !packed(gx, gz, name)) continue;
        const lu = towerLand(name, landClass(gx, gz));
        const dense = DENSE.has(name);
        const dir = nearestRoadDir(gx, gz, 40);
        const ry = dir ? Math.atan2(-dir[1], dir[0]) : 0;
        for (const [w, d] of SIZES) {
          const l: Plot = { x: gx, z: gz, w, d, ry };
          // closer to the guideway than the other passes let a lot come (the height rule keeps these low under its deck)
          if (!free(l) || !fits(l, dense ? 7.5 : CLEAR)) continue;
          take(l);
          buildLot(l, name, zone, lu, dense);
          break;
        }
      }
    }
  }

  // the towers after senákw (senakw.ts): planted podiums over the rise behind Science World, faceted towers on them, all
  // in the first podium's chunk (the tallest tower would lift the next chunk's bounds into the opening view)
  const senakw = sinkAt(PODIUMS[0].x0, PODIUMS[0].z0);
  for (const pd of PODIUMS) {
    const { yb, yt } = podiumLevels(pd, lowEnd);
    const cx = (pd.x0 + pd.x1) / 2;
    const cz = (pd.z0 + pd.z1) / 2;
    const w = pd.x1 - pd.x0;
    const d = pd.z1 - pd.z0;
    const sink = senakw;
    walls(sink, "dark", fp.rect(w, d), cx, cz, yb, yt + 0.5, { yRef: yt });
    const ring = walls(sink, "glass", fp.rect(w - 0.4, d - 0.4), cx, cz, yt + 0.5, yt + pd.h, { yRef: yt, tint: [0.75, 0.82, 0.88] });
    walls(sink, "concrete", fp.rect(w + 0.3, d + 0.3), cx, cz, yt + pd.h, yt + pd.h + 0.4, { tint: [0.93, 0.93, 0.9] });
    cap(sink, "garden", ring.map(([a, , b]) => [a, yt + pd.h + 0.35, b]));
    for (let k = 0; k < 7; k++) addTerrace(pd.x0 + 1.5 + ((w - 3) * k) / 6, yt + pd.h + 0.4, k % 2 ? pd.z0 + 1.2 : pd.z1 - 1.2, 0.6 + (k % 3) * 0.12, (["cedar", "smaple", "cherry"] as const)[k % 3]);
    lots.push({ x: cx, z: cz, w, d, h: yt + pd.h - yb, top: yt + pd.h + 3 });
  }
  {
    const pv = PAVILION;
    const pd = PODIUMS[pv.podium];
    const base = podiumLevels(pd, lowEnd).yt + pd.h;
    const sink = senakw;
    const seg = lowEnd ? 14 : 22;
    const ring = walls(sink, "glass", fp.ellipse(pv.r * 2, pv.r * 2, seg), pv.x, pv.z, base, base + pv.h, { tint: [0.8, 0.9, 0.95], yRef: base });
    walls(sink, "concrete", fp.ellipse(pv.r * 2 + 0.7, pv.r * 2 + 0.7, seg), pv.x, pv.z, base + pv.h, base + pv.h + 0.4, { tint: [0.95, 0.95, 0.92] });
    cap(sink, "garden", ring.map(([a, , b]) => [a, base + pv.h + 0.35, b]));
    for (let k = 0; k < 3; k++) addTerrace(pv.x + Math.cos(k * 2.1) * 1.2, base + pv.h + 0.4, pv.z + Math.sin(k * 2.1) * 1.2, 0.55, k ? "smaple" : "cherry");
  }
  for (const t of TOWERS) {
    const sink = senakw;
    const base = towerBase(t, lowEnd);
    const poly = towerPoly(t);
    // dark navy glass, each tower a shade of its own
    const tint: [number, number, number] = t.podium ? [0.4, 0.5, 0.66] : t.rot < 0 ? [0.44, 0.52, 0.66] : [0.38, 0.47, 0.62];
    let top: V3[] = [];
    for (const [f0, f1, s0, s1, r0, r1] of t.prisms) top = walls(sink, "senakw", poly, t.x, t.z, base + t.h * f0, base + t.h * f1, { s0, s1, r0, r1, tint, yRef: base });
    cap(sink, "garden", top);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + t.rot;
      addTerrace(t.x + Math.cos(a) * t.r * 0.45, base + t.h, t.z + Math.sin(a) * t.r * 0.45, 0.7, k % 2 ? "cedar" : "smaple");
    }
    lots.push({ x: t.x, z: t.z, w: t.r * 2.3, d: t.r * 2.3, h: base + t.h - (base - PODIUMS[t.podium].h), top: base + t.h + 3 });
  }

  mark("lots");
  // a mural only where the ground in front of its wall is open: none painted into a neighbour's wall
  const open = blanks.filter((m) => {
    const nx = Math.sin(m.ry);
    const nz = Math.cos(m.ry);
    return [1.2, 3, 6].every((d) => {
      const x = m.x + nx * d;
      const z = m.z + nz * d;
      return !lots.some((L) => Math.abs(L.x - x) < 20 && Math.abs(L.z - z) < 20 && inFootprint(L, x, z));
    });
  });
  // the murals of each kind in turn, so none repeats until all of its kind are up
  const pools = new Map<MuralKind, { cells: number[]; next: number }>();
  const nextOf = (kind: MuralKind): number => {
    let p = pools.get(kind);
    if (!p) pools.set(kind, (p = { cells: muralsOf(kind), next: 0 }));
    return MURAL0 + p.cells[p.next++ % p.cells.length];
  };
  const murals: Mural[] = [];
  const keep = ({ x, y, z, ry, s, w }: Blank, cell: number) => murals.push({ x, y, z, ry, s, cell, w });
  // each neighbourhood's murals on its biggest walls, the nearest the line first, none within 24 of another
  const street = open.filter((m) => m.subject === undefined && m.dist <= 150);
  const score = (m: Blank) => (m.s * (m.w ?? m.s)) / (1 + m.dist / 50);
  for (const [where, subjects] of MURAL_PLAN) {
    const here = street.filter((m) => (typeof where === "string" ? m.hood === where : Math.hypot(m.x - where.x, m.z - where.z) < where.r)).sort((a, b) => score(b) - score(a));
    let k = 0;
    for (const m of here) {
      if (k >= subjects.length) break;
      if (murals.some((o) => Math.hypot(o.x - m.x, o.z - m.z) < 24)) continue;
      const sub = subjects[k++];
      keep(m, COMMUNITY[sub] ?? nextOf(sub as MuralKind));
    }
  }
  // each hall its own front, and its own weaving or formline on both sides; a carved post keeps its face
  const halls = new Map<string, number>();
  for (const m of open) {
    if (m.subject === undefined) continue;
    if (m.subject >= 0) keep(m, m.subject);
    else if (m.front) keep(m, nextOf("front"));
    else {
      if (!halls.has(m.lot)) halls.set(m.lot, nextOf(halls.size % 2 ? "formline" : "weave"));
      keep(m, halls.get(m.lot) ?? MURAL0);
    }
  }
  phases.lotGeometry = Math.round(buildMs);
  for (const [k, v] of Object.entries(archMs)) if (v > 20) phases[`arch:${k}`] = Math.round(v);
  const out: CityGeometry = {
    chunks: [...chunks.entries()].map(([key, s]) => ({ key, solid: s.solid.build(), glass: s.glass.build() })),
    crownA: shared.crownA.build(),
    crownB: shared.crownB.build(),
    dome: shared.dome.build(),
    neon: shared.neon.build(),
    houses,
    lots,
    murals,
    terrace,
    pads,
    ms: 0,
    phases,
  };
  mark("buffers");
  out.ms = now() - t0;
  return out;
}
