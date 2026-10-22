/**
 * The rail beside the ride (railData.ts, from OpenStreetMap): the Millennium Line from VCC–Clark east, down in the
 * Grandview Cut beside the freight tracks past Commercial–Broadway and up on its viaducts beyond, and the Broadway
 * Extension's approach from VCC–Clark to its tunnel portal. Their curves and deck profiles; the beds and trenches every
 * line that runs low shapes in the terrain (registered by track.ts after the Expo's station pads, so a pad never fills
 * a cut); and the cut raster the city reads (cutNear).
 */
import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

import { BALLAST, CUT_MILL, DECK_MILL, FREIGHT_OFFSET, FREIGHT_OFFSET_PLATFORM, TRENCH } from "./constants";
import { BROADWAY, FREIGHT, MILL, type RailLine, type RailStation } from "./railData";
import { addModifier, demAt, lerp } from "./terrain";
import { type Profile, solveProfile, type Structure } from "./trackProfile";

// the Millennium drops from VCC–Clark's viaduct straight into the cut, so its viaducts keep their height closer in
const MILL_STRUCTURE: Structure = { deck: DECK_MILL, ballast: BALLAST, cut: CUT_MILL, clear: 4.5, taper: 30 };

const sstep = (u: number) => {
  const t = MathUtils.clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
};

export type Line = {
  curve: CatmullRomCurve3;
  len: number;
  profile: Profile;
  /** Arc length of each station along the curve. */
  stationS: number[];
  stations: readonly RailStation[];
};

/**
 * A line's curve through its smoothed points at its solved deck heights, as track.ts builds the Expo's. A line that
 * carries on from another's end (`startY`) starts level with it and keeps that height until its own profile comes down
 * to it: the ground rising under it takes it from viaduct to embankment to cutting without a step at the join.
 */
function buildLine(src: RailLine, stations: readonly RailStation[], st: Structure, startY?: number): Line {
  const pts: [number, number][] = src.pts.map(([x, z]) => [x, z]);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 2; i < pts.length - 2; i++) pts[i] = [0, 1].map((k) => (pts[i - 2][k] + 2 * pts[i - 1][k] + 3 * pts[i][k] + 2 * pts[i + 1][k] + pts[i + 2][k]) / 9) as [number, number];
  }
  const near = (x: number, z: number) => pts.reduce((b, p, i) => ((p[0] - x) ** 2 + (p[1] - z) ** 2 < (pts[b][0] - x) ** 2 + (pts[b][1] - z) ** 2 ? i : b), 0);
  const idx = stations.map((s) => near(s.x, s.z));
  const profile = solveProfile(pts, idx, src.cls, st);
  if (startY !== undefined) for (let i = 0; i < profile.y.length && profile.y[i] > startY; i++) profile.y[i] = startY;
  const curve = new CatmullRomCurve3(
    pts.map(([x, z], i) => new Vector3(x, profile.y[i], z)),
    false,
    "centripetal",
    0.5,
  );
  curve.arcLengthDivisions = 3000;
  const len = curve.getLength();
  const total = profile.s[profile.s.length - 1];
  return { curve, len, profile, stationS: idx.map((i) => (profile.s[i] / total) * len), stations };
}

/**
 * The Millennium as the ride draws it. On the map it runs within a few metres of the Expo from VCC–Clark to
 * Commercial (the Expo along the cut's north rim, the Millennium on its floor), which the ride's larger-than-life
 * guideways would stack one over the other; so west of Commercial it runs well to the south-west, as clearly apart to
 * the eye as the real lines are (VCC–Clark a block from the Expo, the cut between), easing back to pass under the Expo
 * where it turns south over the cut. Through Commercial–Broadway it runs due east along its platform just north of
 * Broadway, beside the street as the real one is, and only then turns south-east, easing back onto the map's line by
 * Nanaimo. A displacement of the map, as a cartographer makes one.
 */
const PLATFORM_Z = 270.5;
const zAt = (pts: readonly (readonly [number, number])[], x: number): number => {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if ((ax - x) * (bx - x) <= 0 && ax !== bx) return az + ((bz - az) * (x - ax)) / (bx - ax);
  }
  return PLATFORM_Z;
};
const TURN_D = zAt(MILL.pts, 356) - PLATFORM_Z;
function drawMill([x, z]: readonly [number, number]): [number, number] {
  const apart = 1 - sstep((x - 285) / 48);
  const X = x - 12 * apart;
  let Z = z + 22 * apart;
  if (X <= 356) Z -= (Z - PLATFORM_Z) * sstep((X - 316) / 16);
  else Z -= TURN_D * (1 - sstep((X - 356) / 144));
  return [X, Z];
}
/** A point beside the Millennium (the freight tracks) moves as the Millennium beside it does, easing to nothing a cut's width away. */
function shiftNearMill([x, z]: readonly [number, number]): [number, number] {
  let bd = Infinity;
  let bi = 0;
  MILL.pts.forEach((p, i) => {
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  const w = 1 - sstep((Math.sqrt(bd) - 12) / 18);
  const m = MILL.pts[bi];
  const [mx, mz] = drawMill(m);
  return [x + (mx - m[0]) * w, z + (mz - m[1]) * w];
}
const MILL_DRAWN = {
  ...MILL,
  pts: MILL.pts.map(drawMill),
  // Commercial–Broadway's platform in the middle of the straight
  stations: MILL.stations.map((s) => {
    if (/Commercial/.test(s.name)) return { ...s, x: 344, z: PLATFORM_Z };
    const [x, z] = drawMill([s.x, s.z]);
    return { ...s, x, z };
  }),
};

export const MILL_LINE = buildLine(MILL_DRAWN, MILL_DRAWN.stations, MILL_STRUCTURE);

/**
 * The Broadway Extension as the ride draws it: on from the Millennium's end at VCC–Clark, west along its platform and
 * out on its viaduct, level as the ground rises to it (onto an embankment, then down through a short cutting into its
 * portal facing Broadway), then under Broadway (the map's own line from Main Street on) toward UBC. On the map its
 * approach runs north-west along the rail corridor before turning under the hill; drawn larger than life that pointed
 * it straight at Science World.
 */
const BROADWAY_DRAWN = (() => {
  const v = MILL_DRAWN.pts[0];
  // straight on from the Millennium's end, the way it was heading
  const t = MILL_LINE.curve.getTangentAt(0);
  const L = Math.hypot(t.x, t.z) || 1;
  const head: [number, number][] = [];
  const cls: string[] = [];
  // west out of the station, a long curve round to the south-west, then west again under Broadway
  const ctrl: [number, number][] = [
    [v[0], v[1]],
    [v[0] - (t.x / L) * 8, v[1] - (t.z / L) * 8],
    [v[0] - 22, v[1] - 3],
    [v[0] - 40, v[1] - 0.5],
    [v[0] - 54, v[1] + 9],
    [v[0] - 63, v[1] + 19],
    [v[0] - 74, v[1] + 24.5],
    [v[0] - 90, v[1] + 25.5],
  ];
  const curve = new CatmullRomCurve3(
    ctrl.map(([x, z]) => new Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const n = Math.round(curve.getLength() / 3.85);
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    head.push([p.x, p.z]);
    const u = i / n;
    cls.push(u < 0.38 ? "V" : u < 0.52 ? "G" : u < 0.66 ? "C" : "T");
  }
  // join the map's tunnel under Broadway where it runs west of the head's end
  const end = head[head.length - 1];
  const k = BROADWAY.pts.findIndex(([x, z]) => x < end[0] - 3.85 && z > 270);
  const tail = BROADWAY.pts.slice(k).map(([x, z]) => [x, z] as [number, number]);
  return { pts: [...head, ...tail], cls: cls.join("") + "T".repeat(tail.length) };
})();

export const BROADWAY_LINE = buildLine(BROADWAY_DRAWN, [], MILL_STRUCTURE, MILL_LINE.profile.y[0]);

/**
 * The freight tracks as drawn: within a few metres of the Millennium on the map, which the ride's broad tracks would
 * overlap, so where they share the cut they run FREIGHT_OFFSET to its north (left of its eastbound travel; further
 * past a platform), easing back onto their own line as they part. Moved with the Millennium first.
 */
export const FREIGHT_LINES = FREIGHT.map((f) => {
  const mp = MILL_DRAWN.pts;
  // only Commercial–Broadway's platform is down in the cut beside it (VCC–Clark's is up on the viaduct)
  const platforms = MILL_DRAWN.stations.filter((s) => /Commercial/.test(s.name)).map((s) => [s.x, s.z]);
  const moved = f.pts.map(shiftNearMill).map(([x, z]) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < mp.length; i++) {
      const d = (mp[i][0] - x) ** 2 + (mp[i][1] - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const d = Math.sqrt(bd);
    if (d > FREIGHT_OFFSET + 8) return [x, z] as [number, number];
    const a = mp[Math.max(0, bi - 1)];
    const b = mp[Math.min(mp.length - 1, bi + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // left of the Millennium's travel: (tz, -tx)
    const lx = (b[1] - a[1]) / L;
    const lz = -(b[0] - a[0]) / L;
    const w = sstep((FREIGHT_OFFSET + 8 - d) / 8);
    const plat = Math.max(...platforms.map(([px, pz]) => 1 - sstep((Math.hypot(px - mp[bi][0], pz - mp[bi][1]) - 14) / 14)));
    const off = FREIGHT_OFFSET + (FREIGHT_OFFSET_PLATFORM - FREIGHT_OFFSET) * plat;
    return [x + (mp[bi][0] + lx * off - x) * w, z + (mp[bi][1] + lz * off - z) * w] as [number, number];
  });
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < moved.length - 1; i++) moved[i] = [0, 1].map((k) => (moved[i - 1][k] + 2 * moved[i][k] + moved[i + 1][k]) / 4) as [number, number];
  }
  return { ...f, pts: moved };
});

/** Where the Broadway Extension runs into the hill under Broadway (arc length): its rails 4.5 under the ground there. */
export const BROADWAY_PORTAL = (() => {
  const p = new Vector3();
  for (let s = 0; s < BROADWAY_LINE.len; s += 1) {
    BROADWAY_LINE.curve.getPointAt(s / BROADWAY_LINE.len, p);
    if (demAt(p.x, p.z) - p.y > 4.5) return s;
  }
  return BROADWAY_LINE.len;
})();

/**
 * Within `pad` of the other rail's centrelines (the Millennium Line, the Broadway Extension to its portal, the freight
 * tracks): the city keeps its buildings and trees off them, as it does off the Expo's corridor.
 */
const railCells = new Map<number, [number, number][]>();
{
  const add = (x: number, z: number) => {
    const k = Math.floor(x / 12) * 100000 + Math.floor(z / 12);
    const c = railCells.get(k);
    if (c) c.push([x, z]);
    else railCells.set(k, [[x, z]]);
  };
  const p = new Vector3();
  for (const [ln, end] of [
    [MILL_LINE, MILL_LINE.len],
    [BROADWAY_LINE, BROADWAY_PORTAL],
  ] as const) {
    for (let s = 0; s <= end; s += 2) {
      ln.curve.getPointAt(s / ln.len, p);
      add(p.x, p.z);
    }
  }
  for (const f of FREIGHT_LINES) {
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const [ax, az] = f.pts[i];
      const [bx, bz] = f.pts[i + 1];
      for (let u = 0; u < 1; u += 0.5) add(ax + (bx - ax) * u, az + (bz - az) * u);
    }
  }
}
export function railNear(x: number, z: number, pad: number): boolean {
  const ci = Math.floor(x / 12);
  const cj = Math.floor(z / 12);
  const R = Math.ceil(pad / 12);
  for (let di = -R; di <= R; di++) {
    for (let dj = -R; dj <= R; dj++) {
      const c = railCells.get((ci + di) * 100000 + (cj + dj));
      if (c && c.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < pad * pad)) return true;
    }
  }
  return false;
}

type Profiled = { curve: CatmullRomCurve3; len: number; profile: Profile; stationS?: number[] };

/** A profile's value at arc length s along its curve (by the horizontal distances it was solved on). */
export function profileAt(line: Omit<Profiled, "curve">, key: "low" | "cut" | "y", s: number): number {
  const p = line.profile;
  const ps = p.s;
  const hs = (s / line.len) * ps[ps.length - 1];
  const k = ps.findIndex((v) => v >= hs);
  if (k <= 0) return p[key][Math.max(0, k)];
  const u = (hs - ps[k - 1]) / (ps[k] - ps[k - 1]);
  return p[key][k - 1] + (p[key][k] - p[key][k - 1]) * u;
}

/* ------------------------------------------------------------------ beds and trenches */

/**
 * A point along a line that runs low: its rail height, how much of it is at grade (bed) or in a trench (cut), and its
 * trench floor's half-width (wider beside a platform).
 */
/** A point on a line's bed: where, its rail height, how low it runs (bed, cut), its floor's half-width, its heading. */
export type BedPoint = { x: number; z: number; y: number; bed: number; cut: number; w: number; tx?: number; tz?: number };

const HASH = 24;
/**
 * Shape the terrain under a line where it comes down: at grade the ground is cut or filled to a ballast's depth under
 * the rails within 5 units, easing back by 16; in a cutting it is dug (never raised) to a level floor out to the bed
 * point's half-width, a steep bank rising TRENCH.bank above it within TRENCH.wall more, back to the ground within
 * TRENCH.fade. Where two trenches meet (the Millennium's and the freight's) the deeper dig wins.
 */
export function addRailBed(points: BedPoint[]): void {
  if (!points.length) return;
  const cells = new Map<number, BedPoint[]>();
  const R = Math.ceil((16 + TRENCH.wall + TRENCH.fade) / HASH);
  for (const p of points) {
    const ci = Math.floor(p.x / HASH);
    const cj = Math.floor(p.z / HASH);
    for (let di = -R; di <= R; di++) {
      for (let dj = -R; dj <= R; dj++) {
        const k = (ci + di) * 100000 + (cj + dj);
        const c = cells.get(k);
        if (c) c.push(p);
        else cells.set(k, [p]);
      }
    }
  }
  addModifier((x, z, h) => {
    const c = cells.get(Math.floor(x / HASH) * 100000 + Math.floor(z / HASH));
    if (!c) return h;
    let bd = 1e9;
    let bp = c[0];
    for (const p of c) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        bp = p;
      }
    }
    const lat = Math.sqrt(bd);
    if (lat > Math.max(16, 13 + TRENCH.wall + TRENCH.fade)) return h;
    const floor = bp.y - BALLAST;
    let out = h;
    if (bp.bed > 0.01 && lat < 16) out = lerp(h, lerp(floor, h, sstep((lat - 5) / 11)), bp.bed);
    // a trench: the deepest that any trench point near here digs
    let dug = out;
    for (const p of c) {
      if (p.cut < 0.01) continue;
      const l = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
      const reach = p.w + TRENCH.wall;
      if (l > reach + TRENCH.fade) continue;
      // only ever digs: where the line rides above the ground it simply stands on its piers
      const target = Math.min(out, p.y - BALLAST + TRENCH.bank * sstep((l - p.w) / TRENCH.wall));
      dug = Math.min(dug, lerp(out, target, p.cut * (1 - sstep((l - reach) / TRENCH.fade))));
    }
    return dug;
  });
}

/**
 * Bed points every few units along a line where its profile runs low, up to `until` (a subway's portal: beyond it the
 * line is under the ground, not in a trench); its trench is painted into the cut raster.
 */
export function bedPoints(line: Profiled, until = line.len): BedPoint[] {
  const out: BedPoint[] = [];
  const p = new Vector3();
  const t = new Vector3();
  const n = Math.ceil(line.len / 3);
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * line.len;
    if (s > until) break;
    const low = profileAt(line, "low", s);
    if (low < 0.01) continue;
    const cut = profileAt(line, "cut", s);
    line.curve.getPointAt(s / line.len, p);
    line.curve.getTangentAt(s / line.len, t).setY(0).normalize();
    // beside a platform the floor reaches out under it
    const plat = (line.stationS ?? []).reduce((m, ss) => Math.max(m, 1 - sstep((Math.abs(s - ss) - 12) / 6)), 0);
    out.push({ x: p.x, z: p.z, y: p.y, bed: low - cut, cut, w: TRENCH.floor + 6.5 * plat, tx: t.x, tz: t.z });
    paintCut(p.x, p.z, cut);
  }
  return out;
}

/**
 * The freight line's floor where it shares the cut: at the Millennium's level beside it (each point takes the nearest
 * Millennium bed point's), so one floor runs under both.
 */
function freightBed(mill: BedPoint[]): BedPoint[] {
  const out: BedPoint[] = [];
  for (const f of FREIGHT_LINES) {
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const [ax, az] = f.pts[i];
      const [bx, bz] = f.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < L; t += 3) {
        const x = ax + ((bx - ax) * t) / L;
        const z = az + ((bz - az) * t) / L;
        let best: BedPoint | null = null;
        let bd = 18 * 18;
        for (const m of mill) {
          const d = (m.x - x) ** 2 + (m.z - z) ** 2;
          if (d < bd && m.cut > 0.5) {
            bd = d;
            best = m;
          }
        }
        if (best) out.push({ x, z, y: best.y, bed: 0, cut: best.cut, w: 4.5, tx: (bx - ax) / L, tz: (bz - az) / L });
      }
    }
  }
  return out;
}

/** The trench floors' centrelines, hashed by 12-unit cell, for inRailCut. */
const floorCells = new Map<number, BedPoint[]>();
/** Registers the Millennium Line's and the Broadway Extension's beds and trenches; track.ts calls it after its pads. */
export function addRailTrenches(): void {
  const mill = bedPoints(MILL_LINE);
  const pts = [...mill, ...freightBed(mill), ...bedPoints(BROADWAY_LINE, BROADWAY_PORTAL + 3)];
  addRailBed(pts);
  for (const p of pts) {
    if (p.cut < 0.5) continue;
    const ci = Math.floor(p.x / 12);
    const cj = Math.floor(p.z / 12);
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        const k = (ci + di) * 100000 + (cj + dj);
        const c = floorCells.get(k);
        if (c) c.push(p);
        else floorCells.set(k, [p]);
      }
    }
  }
}

/** On the floor of the Millennium's trench (grown by pad): no pier or column of the Expo may stand there. */
export function inRailCut(x: number, z: number, pad = 0): boolean {
  const c = floorCells.get(Math.floor(x / 12) * 100000 + Math.floor(z / 12));
  if (!c) return false;
  return c.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < (p.w + pad) ** 2);
}

/** The heading of the trench at (x, z): its nearest floor point's (unit x, z), or null away from every trench. */
export function cutAxis(x: number, z: number): [number, number] | null {
  const c = floorCells.get(Math.floor(x / 12) * 100000 + Math.floor(z / 12));
  if (!c) return null;
  let best: BedPoint | null = null;
  let bd = Infinity;
  for (const p of c) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd && p.tx != null) {
      bd = d;
      best = p;
    }
  }
  return best ? [best.tx!, best.tz!] : null;
}

/* ------------------------------------------------------------------ the cut raster */

/**
 * How much of a rail cutting a ground point belongs to (0 outside, 1 on the floor and the banks out to 16 units, fading
 * by 28), from a 6-unit raster painted along every trench: the buildings and the trees use it.
 */
const CUT_CELL = 6;
const cutCells = new Map<number, number>();
export function paintCut(x: number, z: number, w: number): void {
  if (w < 0.02) return;
  const ci = Math.round(x / CUT_CELL);
  const cj = Math.round(z / CUT_CELL);
  for (let di = -5; di <= 5; di++) {
    for (let dj = -5; dj <= 5; dj++) {
      const d = Math.hypot((ci + di) * CUT_CELL - x, (cj + dj) * CUT_CELL - z);
      const v = w * (1 - sstep((d - 16) / 12));
      const k = (ci + di) * 100000 + (cj + dj);
      if (v > (cutCells.get(k) ?? 0)) cutCells.set(k, v);
    }
  }
}
export const cutNear = (x: number, z: number): number => cutCells.get(Math.round(x / CUT_CELL) * 100000 + Math.round(z / CUT_CELL)) ?? 0;
