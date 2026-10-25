/**
 * The 2100 city builder. Heroes first (their footprints reserved), then lots along every real street's frontage
 * (roads.ts), turned square to it and as deep as the block allows: what stands on each follows the City's zoning
 * (houses on the single-family streets, apartments, shopfronts on the commercial strips, old brick in the historic
 * areas, warehouses on industrial land, towers only where the zoning takes them) within a neighbourhood era mix, an
 * archetype re-rolled when a neighbour already has it, heights capped relative to the deck near the guideway (no
 * footprint within 17 units, low podiums within 30, full height by 72), buildings standing on the lowest ground under
 * them. Houses face their street. False Creek is left open water. Then, without moving any of that (the lots are laid out
 * against each street's laid-out width, roadNetwork.ts REdge.lay), the developments placed by hand (developments.ts),
 * the city filled in on the open ground of the downtown peninsula and round the south bridgeheads (infill.ts) against
 * the streets as drawn, and a podium under each tower there. Geometry merges into 256-unit chunks, a solid and a glass
 * mesh each, so frustum and shadow culling work. Pure apart from three.js geometry.
 */
import { busNetwork, nearBusStop } from "../buses";
import { inHarbourfront } from "../harbourfront";
import { nearWce } from "../wce";
import type { BufferGeometry } from "three";

import { Rng as CityRng, type Rng } from "../cityModel";
import { railNear } from "../rail";
import { landClass, layDist, nearestRoadDir, pointAt, roadDist, roads } from "../roadNetwork";
import { onFeature, placeAt } from "../commonsLayout";
import { inSetZone } from "../sets/zones";
import { inLandmark, inPark, inSenakwGround, LANDMARKS, nearBridge, seawallDist, streamDist } from "../sites";
import { asBaked, groundAt, inIslet, inWater, RASTER, sdfAt, surfaceAt } from "../terrain";
import { PATH_SAMPLES, STATION_XZ, trackDist, trackNearest } from "../track";
import type { SpeciesId } from "../trees/species";
import { ART, MURAL0 } from "../cultureArt";
import { type MuralKind, muralsOf } from "../muralArt";
import { BUILD, type Ctx, PAL } from "./archetypes";
import type { FamilyId } from "./facadeArray";
import { cap, fp, walls } from "./parts";
import { inYard } from "../railYard";
import { inSenakw, PAVILION, podiumLevels, PODIUMS, towerBase, towerPoly, TOWERS } from "./senakw";
import { ARCH_BY_ERA, ARCH_DENSE, ARCH_LOWRISE, type ArchId, hood, type Hood, HOUSE_MIX, TOWERISH, ZONES } from "./eras";
import { DEV_PIECES, DEVELOPMENTS, devLevels } from "./developments";
import { heroLevels, HEROES } from "./heroes";
import { INFILL_BOXES, infillAt } from "./infill";
import { hash01 as placeHash, VARIANTS, variantAt, type VariantId } from "./variants";
import { type HouseInst, type HouseKind } from "./houses";
import { GeoBuilder, type V3 } from "./meshBuilder";
import type { Sink } from "./parts";

/**
 * A built lot: its centre and its extent on the axes (w, d: the box the city's quick tests use), height and top; the
 * footprint itself is fw × fd turned by ry to face its street. `arch` names what stands on it, `round` the round banded
 * form it is (if it is one) and `look` its skin, glass and plan, for the debug probes.
 */
export type Lot = { x: number; z: number; w: number; d: number; h: number; top: number; arch?: ArchId | VariantId; ry?: number; fw?: number; fd?: number; round?: string; look?: string };
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

/**
 * The city is laid out on the ground as baked, Deadman's Island standing (terrain.ts carves it to water): every number
 * is drawn as before, and the island's lots go into the scratch sink with the rail yard's and senákw's.
 */
export function buildCity(rng: Rng, lowEnd: boolean): CityGeometry {
  return asBaked(() => layOut(rng, lowEnd));
}

function layOut(rng: Rng, lowEnd: boolean): CityGeometry {
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
  /**
   * The round towers in floor bands (and their kin), kept apart: none within ROUND_GAP of another. Where one would stand
   * too near, its numbers are drawn as before (into the scratch sink) and one of the other towers (variants.ts) stands
   * there instead; a point or downtown tower near one takes a square plan (`avoidRound`). The Cascadia Twins count.
   */
  const ROUND_ARCH = new Set<ArchId>(["curvedBands", "butterfly", "twins", "darkEllipse", "wave", "helix"]);
  const ROUND_GAP = 160;
  const rounds: { x: number; z: number; form: string }[] = HEROES.filter((h) => h.name === "Cascadia Twins").map((h) => ({ x: h.x, z: h.z, form: "twins" }));
  const roundNear = (x: number, z: number) => rounds.some((r) => (r.x - x) ** 2 + (r.z - z) ** 2 < ROUND_GAP * ROUND_GAP);
  /** Archetypes that keep under a low height limit by themselves. */
  const LOW_OK = new Set<ArchId>(["midrise", "colourPanels", "heritageBrick", "warehouse", "chinatownBlock", "salishHall"]);
  let buildMs = 0;
  const archMs: Record<string, number> = {};
  // the infill (`dense` given) builds no house, and takes its district's lists by `dense`
  const pickArch = (zone: NonNullable<(typeof ZONES)[Hood]>, name: Hood, big: boolean, cell: string, near: string[], dense?: boolean): { era: 0 | 1 | 2; arch: ArchId } => {
    let era: 0 | 1 | 2 = 0;
    let arch: ArchId = "heritageBrick";
    const infill = dense !== undefined;
    for (let tries = 0; tries < 6; tries++) {
      const r = rng.next();
      era = r < zone.era[0] ? 0 : r < zone.era[0] + zone.era[1] ? 1 : 2;
      if (zone.houses && era === 0 && !infill) arch = "house";
      else if (!zone.houses && !infill && rng.next() < (HOUSE_MIX[name] ?? 0)) arch = "house";
      else if (name === "chinatown" && era === 0) arch = rng.next() < 0.8 ? "chinatownBlock" : "heritageBrick";
      else if (name === "gastown" && era === 0) arch = rng.next() < 0.55 ? "heritageBrick" : "warehouse";
      else if (name === "yaletown" && era === 0) arch = rng.next() < 0.7 ? "warehouse" : "heritageBrick";
      else {
        const list = (era > 0 && zone.houses ? ARCH_LOWRISE[era as 1 | 2] : era > 0 && (dense ?? DENSE.has(name)) ? ARCH_DENSE[era as 1 | 2] : ARCH_BY_ERA[era]).filter(([a]) => big || !TOWERISH.has(a));
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

  /**
   * The infill's lots (`infill`): no house, no mural wall, a tower wherever one fits, its height scaled by `scale`, and
   * none at all if it would come out lower than `min`.
   */
  type LotOpts = { infill?: boolean; scale?: number; min?: number };
  const buildLot = (l: Plot, name: Hood, zone: NonNullable<(typeof ZONES)[Hood]>, lu: number, dense: boolean, o: LotOpts = {}) => {
    const { x, z, w, d, ry } = l;
    const pts = samplePts(l);
    const gs = pts.map(([px, pz]) => groundAt(px, pz));
    // too steep a lot by the true ground; its floor and foot by the ground as drawn (floorAt, footAt)
    if (Math.max(...gs) - Math.min(...gs) > 0.42 * Math.max(w, d)) return;
    const yb = Math.min(...pts.map(([px, pz]) => footAt(px, pz))) - 0.6;
    const yt = Math.max(...pts.map(([px, pz]) => floorAt(px, pz)));
    const dist = Math.min(...pts.map(([px, pz]) => cor.dist(px, pz)));
    const onSite = pts.some(([px, pz]) => inSenakw(px, pz) || inSenakwGround(px, pz) || inYard(px, pz) || inIslet(px, pz));
    // the turned footprint's extent on the axes, for the city's box tests
    const aw = Math.abs(w * Math.cos(ry)) + Math.abs(d * Math.sin(ry));
    const ad = Math.abs(w * Math.sin(ry)) + Math.abs(d * Math.cos(ry));
    const ci = Math.round(x / 9);
    const cj = Math.round(z / 9);
    const big = o.infill ? Math.min(w, d) >= 5 : dense ? Math.min(w, d) > 6.5 : w > 11 && d > 11;
    const picked = pickArch(zone, name, big, `${ci},${cj}`, [`${ci - 1},${cj}`, `${ci},${cj - 1}`, `${ci - 1},${cj - 1}`, `${ci + 1},${cj - 1}`], o.infill ? dense : undefined);
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
      // on the towers' podiums (senakw.ts) or senákw's ground (sites.ts): its numbers drawn, nothing built
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
    if (o.scale) H *= o.scale;
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
    if (H < 3 || (o.min && H < o.min)) return;
    // built square to the axes round the lot's centre, then turned to face its street with its terrace trees
    const sink = sinkAt(x, z);
    const builders = [sink.solid, sink.glass, sink.crownA, sink.crownB, sink.dome, sink.neon];
    const starts = builders.map((b) => b.vertices);
    const t0 = terrace.length;
    const p0 = pads.length;
    // what the tower turns out to be (archetypes report it): its look, and its form if it is a round banded one
    let round: string | undefined;
    let look: string | undefined;
    const report = (l: string, r?: string) => {
      look = l;
      round = r;
    };
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
      wall: o.infill ? undefined : (lx, lz, len, y0, y1, subject, front) => muralAt(x, z, ry, name, dist, lx, lz, len, y0, y1, subject, front),
      pad: (px, py, pz, r, parked) => pads.push({ x: px, y: py, z: pz, r, parked }),
      avoidRound: roundNear(x, z),
      report,
    };
    const tb = now();
    // some of today's and 2100's low and mid-rise blocks are halls after Coast Salish plank houses, chosen by place;
    // the block a hall stands for still draws its numbers (into a scratch sink), so the rest of the city is as it was
    if (onSite) {
      BUILD[chosen as Exclude<ArchId, "house">]({ ...ctx, sink: scratchSink(), terrace: () => undefined, wall: undefined, pad: undefined });
      return;
    }
    const hall = era > 0 && SALISH_FROM.has(chosen) && hash01(x * 0.73 + 5.1, z * 1.91 - 2.3) < (HALL_RATE[name] ?? 0);
    let built: ArchId | VariantId = chosen;
    if (hall) {
      BUILD[chosen as Exclude<ArchId, "house">]({ ...ctx, sink: scratchSink(), terrace: () => undefined, wall: undefined, pad: undefined });
      H = Math.min(H, 6 * 1.9 + 3.7);
      BUILD.salishHall({ ...ctx, H, rng: new CityRng(Math.floor(hash01(z, x) * 2 ** 31)) });
      built = "salishHall";
    } else if (ROUND_ARCH.has(chosen) && ctx.avoidRound) {
      // too near another round banded tower: its numbers drawn as it would have been, another tower built instead
      BUILD[chosen as Exclude<ArchId, "house">]({ ...ctx, sink: scratchSink(), terrace: () => undefined, wall: undefined, pad: undefined, report: undefined });
      built = variantAt(x, z);
      VARIANTS[built]({ ...ctx, rng: new CityRng(Math.floor(hash01(x * 1.31 - 7.7, z * 0.83 + 2.9) * 2 ** 31)), report: undefined });
    } else BUILD[chosen as Exclude<ArchId, "house">](ctx);
    if (round) rounds.push({ x, z, form: round });
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
    archMs[built] = (archMs[built] ?? 0) + dtb;
    buildMs += dtb;
    lots.push({ x, z, w: aw, d: ad, h: H + (yt - yb), top: yt + H + 3, arch: built, ry, fw: w, fd: d, round, look });
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
  /**
   * Clear of water, parks, landmarks, heroes, the guideway, the creek, the sets, the other rail and every road; the
   * bridges and the seawall walk, narrower than a lot, against its whole footprint. The streets and their bus stops as
   * laid out (roadNetwork.ts REdge.lay): the peninsula's, drawn narrower since, left every lot where it was.
   */
  const parcelClear = (l: Plot, clear: number) =>
    !samplePts(l).some(
      ([px, pz]) =>
        inWater(px, pz) || inPark(px, pz) || inLandmark(px, pz, 2) || inHarbourfront(px, pz, 1.5) || nearBusStop(px, pz, 0.8, true) || nearWce(px, pz, 0.5) || inHero(px, pz) || cor.dist(px, pz) < clear || streamDist(px, pz) < 9 || inSetZone(px, pz, 2) || railNear(px, pz, 8) || layDist(px, pz) < 0.35 || onFeature(px, pz, 1),
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
    const endPad = (n: number) => (nodes[n].deg >= 3 ? Math.max(...nodes[n].edges.map((o) => edges[o].lay)) + 1.2 : 0.6);
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
        const back = e.lay + (dense ? 0.3 : 0.7);
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
      if (occ[oj * onx + oi] || layDist(gx, gz) < 3.5) continue;
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
    // the drawn streets only (as laid out), by 16-unit cell
    const cells = new Map<number, number[][]>();
    for (const e of edges) {
      for (let k = 0; k + 3 < e.pts.length; k += 2) {
        if (!e.shown[k / 2]) continue;
        const sg = [e.pts[k], e.pts[k + 1], e.pts[k + 2], e.pts[k + 3], e.lay];
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
          inWater(px, pz) || inPark(px, pz) || inLandmark(px, pz, 2) || inHarbourfront(px, pz, 1.5) || nearBusStop(px, pz, 0.8, true) || nearWce(px, pz, 0.5) || inHero(px, pz) || cor.dist(px, pz) < clear || streamDist(px, pz) < 9 || inSetZone(px, pz, 2) || railNear(px, pz, 8) || shownDist(px, pz) < 0.6 || onFeature(px, pz, 1) || placeAt(px, pz) !== undefined || byStation(px, pz),
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
  mark("murals");

  // the developments placed by hand (developments.ts), each a lot of its own, on ground no lot took; a tower on a
  // podium stands on its roof; their painted panels join the murals. One whose ground a lot or a street has taken (the
  // city's lots fall where its draws put them, which any change to it can move) is left out, with what stands on it;
  // senákw's ground has no streets of its own (sites.ts).
  {
    const tops = new Map<string, number>();
    const taken = (b: (typeof DEVELOPMENTS)[number]) => {
      const c = Math.cos(b.ry);
      const sn = Math.sin(b.ry);
      const near = lots.filter((L) => Math.abs(L.x - b.x) < 30 && Math.abs(L.z - b.z) < 30);
      for (let u = -0.5; u <= 0.5; u += 0.125) {
        for (let v = -0.5; v <= 0.5; v += 0.125) {
          const x = b.x + u * b.w * c + v * b.d * sn;
          const z = b.z - u * b.w * sn + v * b.d * c;
          if (roadDist(x, z) < 0 && !inSenakwGround(x, z, true)) return true;
          for (const L of near) {
            const lc = Math.cos(L.ry ?? 0);
            const ls = Math.sin(L.ry ?? 0);
            const dx = x - L.x;
            const dz = z - L.z;
            if (Math.abs(dx * lc - dz * ls) < (L.fw ?? L.w) / 2 && Math.abs(dx * ls + dz * lc) < (L.fd ?? L.d) / 2) return true;
          }
        }
      }
      return false;
    };
    for (const b of DEVELOPMENTS) {
      if (b.on ? !tops.has(b.on) : taken(b)) continue;
      const lv = devLevels(b, lowEnd);
      const base = b.on ? tops.get(b.on) : undefined;
      const yb = base !== undefined ? base - 0.3 : lv.yb;
      const yt = base ?? lv.yt;
      const sink = sinkAt(b.x, b.z);
      const builders = [sink.solid, sink.glass, sink.crownA, sink.crownB, sink.dome, sink.neon];
      const starts = builders.map((g) => g.vertices);
      const t0 = terrace.length;
      const m0 = murals.length;
      const h = b.build({
        sink,
        x: b.x,
        z: b.z,
        yb,
        yt,
        rng: new CityRng(Math.floor(placeHash(b.x * 0.71 - 3.1, b.z * 1.37 + 0.9) * 2 ** 31)),
        terrace: addTerrace,
        art: (x, y, z, nx, nz, s, w, cell) => murals.push({ x, y, z, ry: Math.atan2(nx, nz), s, w, cell }),
      });
      // turned about its centre, with its trees and its panels
      builders.forEach((g, i) => g.rotateFrom(starts[i], b.x, b.z, b.ry));
      const c = Math.cos(b.ry);
      const sn = Math.sin(b.ry);
      for (const t of [...terrace.slice(t0), ...murals.slice(m0)]) {
        const dx = t.x - b.x;
        const dz = t.z - b.z;
        t.x = b.x + dx * c + dz * sn;
        t.z = b.z - dx * sn + dz * c;
      }
      for (const m of murals.slice(m0)) m.ry += b.ry;
      tops.set(b.name, yt + h);
      lots.push({ x: b.x, z: b.z, w: Math.abs(b.w * c) + Math.abs(b.d * sn), d: Math.abs(b.w * sn) + Math.abs(b.d * c), h: yt + h - yb, top: yt + h + 3, ry: b.ry, fw: b.w, fd: b.d, look: b.name });
    }
  }
  mark("developments");

  // then the city filled in (infill.ts): on the open ground of the peninsula's blocks, against its streets as drawn
  // (narrower than laid out), and round the south bridgeheads, lots as big as the room allows, the biggest first, each
  // square to its nearest street: a tower where one fits, a low block in a smaller gap; then towers over the low
  // blocks and podiums under the towers. Nothing before moves: every earlier lot keeps its ground and a gap round it,
  // the murals the ground in front of their walls.
  {
    const G = 0.5;
    const GAP = 0.3;
    const [X0, Z0] = [Math.min(...INFILL_BOXES.map((b) => b[0])), Math.min(...INFILL_BOXES.map((b) => b[2]))];
    const NX = Math.ceil((Math.max(...INFILL_BOXES.map((b) => b[1])) - X0) / G) + 1;
    const NZ = Math.ceil((Math.max(...INFILL_BOXES.map((b) => b[3])) - Z0) / G) + 1;
    // each cell: 0 not yet known, 1 open, 2 taken; and the lot whose ground (and the gap round it) took it, if one did
    const cell = new Uint8Array(NX * NZ);
    const own = new Int32Array(NX * NZ).fill(-1);
    /** Each cell inside a turned rectangle (grown by `grow`), as city.ts turns a lot. */
    const cellsIn = (x: number, z: number, w: number, d: number, ry: number, grow: number, f: (k: number, cx: number, cz: number) => boolean | void): boolean => {
      const c = Math.cos(ry);
      const sn = Math.sin(ry);
      const r = Math.hypot(w, d) / 2 + grow;
      const i0 = Math.max(0, Math.floor((x - r - X0) / G));
      const i1 = Math.min(NX - 1, Math.floor((x + r - X0) / G));
      const j0 = Math.max(0, Math.floor((z - r - Z0) / G));
      const j1 = Math.min(NZ - 1, Math.floor((z + r - Z0) / G));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = X0 + (i + 0.5) * G;
          const cz = Z0 + (j + 0.5) * G;
          const dx = cx - x;
          const dz = cz - z;
          if (Math.abs(dx * c - dz * sn) <= w / 2 + grow && Math.abs(dx * sn + dz * c) <= d / 2 + grow && f(j * NX + i, cx, cz)) return true;
        }
      }
      return false;
    };
    /** What took a cell that no lot did: a street's kerb and the step back from it. */
    const ROADSIDE = -2;
    const paint = (x: number, z: number, w: number, d: number, ry: number, grow: number, by = -1) =>
      cellsIn(x, z, w, d, ry, grow, (k) => {
        cell[k] = 2;
        if (by !== -1) own[k] = by;
      });
    lots.forEach((L, i) => paint(L.x, L.z, L.fw ?? L.w, L.fd ?? L.d, L.ry ?? 0, GAP, i));
    // the streets as drawn, a step back from their kerbs
    for (const e of edges) {
      for (let k = 0; k + 3 < e.pts.length; k += 2) {
        if (!e.shown[k / 2]) continue;
        const [ax, az, bx, bz] = [e.pts[k], e.pts[k + 1], e.pts[k + 2], e.pts[k + 3]];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-3) continue;
        paint((ax + bx) / 2, (az + bz) / 2, L, 2 * e.half, Math.atan2(-(bz - az) / L, (bx - ax) / L), 0.3, ROADSIDE);
      }
    }
    // the ground in front of each mural, as wide as it is, and the developments' art on the ground
    for (const m of murals) paint(m.x + Math.sin(m.ry) * 3.6, m.z + Math.cos(m.ry) * 3.6, (m.w ?? m.s) + 1, 7.2, m.ry, 0);
    for (const p of DEV_PIECES) paint(p.x, p.z, (p.w ?? 2.6) + 1, 3.2, p.ry, 0);
    const byStation = (x: number, z: number) => STATION_XZ.some(([sx, sz]) => (x - sx) ** 2 + (z - sz) ** 2 < 38 * 38) && trackDist(x, z) < 19;
    // the water and the districts known first on coarser grids (the shore and the districts' edges looked at closely):
    // a 4-unit cell whose middle is 3.5 or more from the shore is all water or all land
    const C4 = 4;
    const shore = new Map<number, number>();
    const sideOf = (x: number, z: number) => {
      const key = Math.floor(x / C4) * 8192 + Math.floor(z / C4);
      let v = shore.get(key);
      if (v === undefined) {
        const sd = sdfAt((Math.floor(x / C4) + 0.5) * C4, (Math.floor(z / C4) + 0.5) * C4);
        shore.set(key, (v = sd < -3.5 ? -1 : sd > 3.5 ? 1 : 0));
      }
      return v;
    };
    const zones = new Map<number, boolean>();
    const zoned = (x: number, z: number) => {
      const key = Math.floor(x / 2) * 8192 + Math.floor(z / 2);
      let v = zones.get(key);
      if (v === undefined) zones.set(key, (v = infillAt((Math.floor(x / 2) + 0.5) * 2, (Math.floor(z / 2) + 0.5) * 2) !== null));
      return v;
    };
    const stops = busNetwork().stops.filter((st) => INFILL_BOXES.some(([x0, x1, z0, z1]) => st.x > x0 - 8 && st.x < x1 + 8 && st.z > z0 - 8 && st.z < z1 + 8));
    const nearStop = (x: number, z: number) => stops.some((st) => (st.x - x) ** 2 + (st.z - z) ** 2 < ((st.exchange ? st.len / 2 + 0.3 : 1.8) + 0.8) ** 2);
    // what keeps ground open for good (the packing pass's tests, the streets and their stops as drawn), cheapest first,
    // known by the unit cell
    const clear = (x: number, z: number) =>
      cor.dist(x, z) >= DENSE_CLEAR &&
      sideOf(x, z) >= 0 &&
      roadDist(x, z) >= 0.05 &&
      !inHero(x, z) &&
      zoned(x, z) &&
      !inPark(x, z) &&
      (sideOf(x, z) > 0 || !inWater(x, z)) &&
      !inLandmark(x, z, 2) &&
      !inHarbourfront(x, z, 1.5) &&
      !nearWce(x, z, 0.5) &&
      streamDist(x, z) >= 9 &&
      !inSetZone(x, z, 2) &&
      !railNear(x, z, 8) &&
      !onFeature(x, z, 1) &&
      placeAt(x, z) === undefined &&
      !byStation(x, z) &&
      !nearBridge(x, z, 2) &&
      seawallDist(x, z) >= 0.8 &&
      !inSenakw(x, z) &&
      !inYard(x, z) &&
      !inIslet(x, z) &&
      !nearStop(x, z);
    const unit = new Map<number, boolean>();
    const clearHere = (x: number, z: number) => {
      const key = Math.floor(x) * 8192 + Math.floor(z);
      let c = unit.get(key);
      if (c === undefined) unit.set(key, (c = clear(Math.floor(x) + 0.5, Math.floor(z) + 0.5)));
      return c;
    };
    const open = (k: number, x: number, z: number) => {
      if (!cell[k]) cell[k] = clearHere(x, z) ? 1 : 2;
      return cell[k] === 1;
    };
    // its corners and middle first, the many plots that fail there failing quickly
    const fitsAt = (l: Plot, grow: number) => {
      const c = Math.cos(l.ry);
      const sn = Math.sin(l.ry);
      for (const [a, b] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const lx = a * (l.w + grow);
        const lz = b * (l.d + grow);
        const x = l.x + lx * c + lz * sn;
        const z = l.z - lx * sn + lz * c;
        const i = Math.floor((x - X0) / G);
        const j = Math.floor((z - Z0) / G);
        if (i < 0 || j < 0 || i >= NX || j >= NZ || !open(j * NX + i, X0 + (i + 0.5) * G, Z0 + (j + 0.5) * G)) return false;
      }
      return !cellsIn(l.x, l.z, l.w, l.d, l.ry, grow, (k, cx, cz) => !open(k, cx, cz));
    };
    // square to the nearest street, known by the 2-unit cell
    const dirs = new Map<number, number>();
    const turnAt = (x: number, z: number) => {
      const key = Math.round(x / 2) * 4096 + Math.round(z / 2);
      let ry = dirs.get(key);
      if (ry === undefined) {
        const dir = nearestRoadDir(x, z, 16) ?? nearestRoadDir(x, z, 40);
        ry = dir ? Math.atan2(-dir[1], dir[0]) : 0;
        dirs.set(key, ry);
      }
      return ry;
    };
    // frontage by depth and the step the ground is searched at: towers from five units wide, low blocks below
    const SIZES: [number, number, number][] = [
      [10, 9, 1],
      [9, 8, 1],
      [8, 7, 1],
      [7, 6, 1],
      [6, 5.5, 1],
      [5.4, 5, 1],
      ...(lowEnd
        ? []
        : ([
            [4.6, 4.2, 0.5],
            [4, 3.6, 0.5],
            [3.4, 3, 0.5],
          ] as [number, number, number][])),
    ];
    const plots: { l: Plot; tower: boolean }[] = [];
    for (const [w, d, step] of SIZES) {
      const tower = Math.min(w, d) >= 5;
      for (const [bx0, bx1, bz0, bz1] of INFILL_BOXES) {
        for (let z = bz0; z <= bz1; z += step) {
          for (let x = bx0; x <= bx1; x += step) {
            const k = Math.floor((z - Z0) / G) * NX + Math.floor((x - X0) / G);
            if (!open(k, X0 + (Math.floor((x - X0) / G) + 0.5) * G, Z0 + (Math.floor((z - Z0) / G) + 0.5) * G)) continue;
            // the disc a plot of this size holds at its middle, whichever way it turns, open first
            const m = Math.min(w, d) / 2 - 0.01;
            if (!fitsAt({ x, z, w: 2 * m, d: 0.01, ry: 0 }, 0) || !fitsAt({ x, z, w: 0.01, d: 2 * m, ry: 0 }, 0)) continue;
            const ry = turnAt(x, z);
            for (const [pw, pd] of [
              [w, d],
              [d, w],
            ]) {
              const l: Plot = { x, z, w: pw, d: pd, ry };
              // a tower keeps a little more room round it
              if (!fitsAt(l, tower ? 0.45 : 0)) continue;
              paint(x, z, pw, pd, ry, GAP);
              plots.push({ l, tower });
              break;
            }
          }
        }
      }
    }
    // the low blocks' own heights: shopfronts and walk-ups, a few old ones among them
    const LOW: NonNullable<(typeof ZONES)[Hood]> = { era: [0.3, 0.45, 0.25], h: [[5, 12], [6, 16], [8, 18]], split: 1, build: 1 };
    const before = lots.length;
    for (const { l, tower } of plots) {
      const at = infillAt(l.x, l.z);
      if (!at) continue;
      buildLot(l, at.name, tower ? at.zone : LOW, tower ? 5 : 4, at.dense, { infill: true, scale: tower ? at.scale : 1 });
    }
    // each new lot's ground its own
    for (let i = before; i < lots.length; i++) {
      const L = lots[i];
      paint(L.x, L.z, L.fw ?? L.w, L.fd ?? L.d, L.ry ?? 0, GAP, i);
    }
    mark("infill");

    // over most of today's and 2100's low blocks in these districts (chosen by place; never the old blocks, the
    // halls, the courtyards or the domes with their drone pads), a slender tower rising out of the block, set back from
    // its street, as Vancouver builds over its podiums: the block stands as it was round the tower's foot, and the
    // trees on its roof where the tower stands make way
    const RISE_FROM = new Set<string>(["midrise", "colourPanels", "metalLoft", "townhouses", "stacked"]);
    const RISE_SHARE = 0.7;
    const risen = lots.length;
    for (const L of lots.slice(0, before)) {
      if (!L.arch || !RISE_FROM.has(L.arch) || Math.min(L.fw ?? L.w, L.fd ?? L.d) < 5.6) continue;
      if (placeHash(L.x * 1.13 + 0.7, L.z * 0.77 - 1.9) > RISE_SHARE) continue;
      const at = infillAt(L.x, L.z);
      if (!at) continue;
      const fw = L.fw ?? L.w;
      const fd = L.fd ?? L.d;
      const ry = L.ry ?? 0;
      const tw = Math.max(4.4, fw * 0.6);
      const td = Math.max(4.4, fd * 0.6);
      // toward the back of its lot (local +z runs into the block)
      const back = ((fd - td) / 2) * 0.6;
      const tx = L.x + back * Math.sin(ry);
      const tz = L.z + back * Math.cos(ry);
      const n0 = lots.length;
      const t0 = terrace.length;
      buildLot({ x: tx, z: tz, w: tw, d: td, ry }, at.name, at.zone, 5, at.dense, { infill: true, scale: at.scale, min: L.h + 12 });
      if (lots.length === n0) continue;
      const c = Math.cos(ry);
      const sn = Math.sin(ry);
      for (let k = t0 - 1; k >= 0; k--) {
        const dx = terrace[k].x - tx;
        const dz = terrace[k].z - tz;
        if (Math.abs(dx) < 9 && Math.abs(dz) < 9 && terrace[k].y < L.top && Math.abs(dx * c - dz * sn) < tw / 2 + 0.6 && Math.abs(dx * sn + dz * c) < td / 2 + 0.6) terrace.splice(k, 1);
      }
    }
    mark("rise");

    // then a podium under each tower in these districts, as Vancouver builds them: its block's open ground taken up to
    // a step back from the kerbs and from its neighbours' podiums, two or three storeys of shopfronts and flats with a
    // garden or a roof on top, the tower rising out of it (its walls stand through the podium's roof)
    const PODIUM_FAM: [FamilyId, number[]][] = [
      ["rainscreen", [0xd8d2c4, 0xc9b49a, 0xb8c4c8, 0xe6dccb]],
      ["brick", [0xa94e3c, 0x8a5a44, 0xc08a6a]],
      ["glass", [0xcfe2ec, 0xd9b48a, 0xa7c8c0]],
      ["timber", [0xffffff, 0xe8d0b0]],
      ["stone", [0xe0d6c2, 0xd4cbb8]],
      ["metal", [0xb0b6bc, 0x7d8a86]],
      ["fins", [0xffffff]],
    ];
    const MAXGROW = 5;
    const STEP = 0.5;
    // the towers and the mid-rises (the old blocks, the halls and the low forms of their own stand as they are)
    const OWN_BASE = new Set<string>(["house", "heritageBrick", "edwardian", "warehouse", "chinatownBlock", "civic", "flatiron", "courtyard", "townhouses", "salishHall", "galleryStack", "brickArches"]);
    const towers = lots.map((L, i) => ({ L, i })).filter(({ L, i }) => i < risen && L.arch && !OWN_BASE.has(L.arch) && L.h > 14 && infillAt(L.x, L.z) !== null);
    for (const { L, i } of towers) {
      const ry = L.ry ?? 0;
      const c = Math.cos(ry);
      const sn = Math.sin(ry);
      const fw = L.fw ?? L.w;
      const fd = L.fd ?? L.d;
      // grown a step at a time on each side in turn (+x, -x, +z, -z), while the strip it would take is open or its own
      const ext = [0, 0, 0, 0];
      const done = [false, false, false, false];
      const okRect = (lx0: number, lx1: number, lz0: number, lz1: number) => {
        const lx = (lx0 + lx1) / 2;
        const lz = (lz0 + lz1) / 2;
        // up to the back of the sidewalk, and the gap round a neighbour
        return !cellsIn(L.x + lx * c + lz * sn, L.z - lx * sn + lz * c, lx1 - lx0, lz1 - lz0, ry, 0, (k, cx, cz) => own[k] !== i && !open(k, cx, cz) && !(own[k] === ROADSIDE && clearHere(cx, cz) && roadDist(cx, cz) >= 0.05));
      };
      for (let grew = true; grew; ) {
        grew = false;
        for (let sd = 0; sd < 4; sd++) {
          if (done[sd] || ext[sd] >= MAXGROW) continue;
          const [x0, x1, z0, z1] = [-fw / 2 - ext[1], fw / 2 + ext[0], -fd / 2 - ext[3], fd / 2 + ext[2]];
          const strip: [number, number, number, number] =
            sd === 0 ? [x1, x1 + STEP, z0, z1] : sd === 1 ? [x0 - STEP, x0, z0, z1] : sd === 2 ? [x0, x1, z1, z1 + STEP] : [x0, x1, z0 - STEP, z0];
          if (okRect(...strip)) {
            ext[sd] += STEP;
            grew = true;
          } else done[sd] = true;
        }
      }
      const pw = fw + ext[0] + ext[1];
      const pd = fd + ext[2] + ext[3];
      // too little room round it for one
      if (pw * pd < fw * fd * 1.15 || Math.max(...ext) < 0.5) continue;
      const lcx = (ext[0] - ext[1]) / 2;
      const lcz = (ext[2] - ext[3]) / 2;
      const px = L.x + lcx * c + lcz * sn;
      const pz = L.z - lcx * sn + lcz * c;
      const pts = samplePts({ x: px, z: pz, w: pw, d: pd, ry });
      const gs = pts.map(([qx, qz]) => groundAt(qx, qz));
      if (Math.max(...gs) - Math.min(...gs) > 0.3 * Math.max(pw, pd)) continue;
      const yb = Math.min(...pts.map(([qx, qz]) => footAt(qx, qz))) - 0.6;
      const yt = Math.max(...pts.map(([qx, qz]) => floorAt(qx, qz)));
      const r = new CityRng(Math.floor(placeHash(px * 0.37 + 1.7, pz * 0.91 - 4.2) * 2 ** 31));
      let ph = 2.4 + r.next() * 2.2;
      // under the deck by the guideway, as buildLot keeps a lot there
      if (Math.min(...pts.map(([qx, qz]) => cor.dist(qx, qz))) < DENSE_PODIUM) ph = Math.min(ph, Math.max(3, Math.min(10, cor.deck(px, pz) + 4 - yt - 7)));
      // well under the tower's top
      if (yt + ph > L.top - 3 - 8) continue;
      const sink = sinkAt(px, pz);
      const starts = [sink.solid.vertices, sink.glass.vertices];
      const t0 = terrace.length;
      const [fam, tints] = PODIUM_FAM[Math.floor(r.next() * PODIUM_FAM.length)];
      const ring = walls(sink, fam, fp.rect(pw, pd), px, pz, yb, yt + ph, { tint: toT(tints[Math.floor(r.next() * tints.length)]), yRef: yt });
      const garden = r.next() < 0.6;
      cap(sink, garden ? "garden" : "roof", ring);
      // on a garden, trees round its edge, clear of the tower
      if (garden) {
        for (let k = 0, n = Math.min(6, Math.floor((pw * pd - fw * fd) / 14)); k < n; k++) {
          const tx = (r.next() - 0.5) * (pw - 1.2);
          const tz = (r.next() - 0.5) * (pd - 1.2);
          // the tower's footprint about the podium's centre
          if (Math.abs(tx + lcx) < fw / 2 + 0.7 && Math.abs(tz + lcz) < fd / 2 + 0.7) continue;
          addTerrace(px + tx, yt + ph, pz + tz, 0.45 + r.next() * 0.25, (["smaple", "cherry", "cedar", "dogwood"] as const)[k % 4]);
        }
      }
      [sink.solid, sink.glass].forEach((b, k) => b.rotateFrom(starts[k], px, pz, ry));
      for (const tr of terrace.slice(t0)) {
        const dx = tr.x - px;
        const dz = tr.z - pz;
        tr.x = px + dx * c + dz * sn;
        tr.z = pz - dx * sn + dz * c;
      }
      lots.push({ x: px, z: pz, w: Math.abs(pw * c) + Math.abs(pd * sn), d: Math.abs(pw * sn) + Math.abs(pd * c), h: ph + (yt - yb), top: yt + ph + 3, ry, fw: pw, fd: pd, look: "podium" });
      paint(px, pz, pw, pd, ry, GAP, i);
    }
    mark("podiums");
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
