"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, TubeGeometry, Vector3 } from "three";

import { BALLAST, GAP, LANE, PLATFORM_LEN, SLIM, TRENCH } from "./constants";
import { GAUGE, mirror, ribbon, SLEEPER, slimRibbon } from "./Guideway";
import { acrossStation, bendAlong, bendGeometry } from "./slim";
import { MILLENNIUM } from "./liveries";
import { bedProfile, clearHeights, resample } from "./bedLift";
import { merged, type Part } from "./merge";
import { tunnelPortal } from "./portal";
import { BROADWAY_LINE, BROADWAY_PORTAL, FREIGHT_LINES, inRailCut, type Line, MILL_LINE, profileAt } from "./rail";
import { isRoad, roadDist } from "./roadNetwork";
import { BROADWAY_STATIONS } from "./railData";
import { paint } from "./shapes";
import { STATION_FRAMES } from "./sets/zones";
import { rib, vault } from "./Stations";
import { type Frame, groundAt, makeFrame, UP } from "./track";
import { bogieSpacing, carGeometry } from "./trainGeometry";
import { useWorld } from "./world";

/** Frames every `step` along a line between two arc lengths. */
function framesOf(line: Line, s0: number, s1: number, step: number): Frame[] {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const out: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const f = makeFrame();
    const u = Math.min(1, Math.max(0, (s0 + ((s1 - s0) * i) / n) / line.len));
    line.curve.getPointAt(u, f.p);
    line.curve.getTangentAt(u, f.t).normalize();
    f.r.crossVectors(f.t, UP).normalize();
    out.push(f);
  }
  return out;
}

/** The freight track's bed's half-width. */
const FREIGHT_HALF = 1.9;

/**
 * Frames along a polyline laid on the ground (the freight tracks), every 2.5 units, `lift` over a bed that clears the
 * ground as drawn across it (bedLift.ts).
 */
function groundFrames(line: readonly (readonly [number, number])[], lift: number, lowEnd: boolean): Frame[] {
  const pts = resample(line, 2.5);
  const ys = clearHeights(pts, FREIGHT_HALF, lift, lowEnd);
  return pts.map(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const f = makeFrame();
    f.p.set(x, ys[i], z);
    f.t.set(b[0] - a[0], 0, b[1] - a[1]).normalize();
    f.r.crossVectors(f.t, UP).normalize();
    return f;
  });
}

const SOFFIT: [number, number][] = [
  [-3, -1.9],
  [3, -1.9],
  [5.1, -1.4],
  [6.1, -0.55],
  [6.3, 0.9],
  [6.3, 0.95],
  [-6.3, 0.95],
  [-6.3, 0.9],
  [-6.1, -0.55],
  [-5.1, -1.4],
];
const PARAPET: [number, number][] = [
  [6.02, 0.95],
  [6.3, 0.95],
  [6.3, 1.75],
  [6.02, 1.75],
];
const LED: [number, number][] = [
  [6.13, -0.62],
  [6.21, -0.62],
  [6.21, -0.48],
  [6.13, -0.48],
];

const at = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

/** A strip of quads between successive rows of points (each row a polyline across the strip), with its normals. */
function strip(rows: Vector3[][]): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const m = rows[0]?.length ?? 0;
  rows.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let j = 0; j + 1 < m; j++) {
      const a = i * m + j;
      idx.push(a, a + m, a + 1, a + 1, a + m, a + m + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The Grandview Cut's walls: on each side of the floor (the Millennium's, and the freight line's beside it) a concrete
 * retaining wall from the floor to the ground above, its top a planted ledge back over the bank, wherever the
 * Millennium runs in the cut and the wall stands a unit or more. Returns the faces (concrete) and the ledges (planted).
 */
function cutWalls(step: number): { faces: BufferGeometry[]; ledges: BufferGeometry[] } {
  const faces: BufferGeometry[] = [];
  const ledges: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    let face: Vector3[][] = [];
    let ledge: Vector3[][] = [];
    const flush = () => {
      if (face.length > 1) {
        faces.push(strip(face));
        ledges.push(strip(ledge));
      }
      face = [];
      ledge = [];
    };
    for (let s = 0; s <= MILL_LINE.len; s += step) {
      const cut = profileAt(MILL_LINE, "cut", s);
      const f = framesOf(MILL_LINE, s, s + 0.5, 1)[0];
      const foot = f.p.y - BALLAST - 0.3;
      const o = (d: number) => f.p.clone().addScaledVector(f.r, side * d);
      // the floor's edge on this side: out past the freight line where it shares the cut, past a platform
      let W = TRENCH.floor;
      for (let d = TRENCH.floor; d < 30; d += 0.5) {
        const e = o(d);
        if (!inRailCut(e.x, e.z)) break;
        W = d;
      }
      W += 0.2;
      const back = W + TRENCH.wall + 1;
      const q = o(back);
      const top = groundAt(q.x, q.z);
      if (cut < 0.5 || top - foot < 1) {
        flush();
        continue;
      }
      const a = o(W);
      // the face leans back a little, as the cut's walls do
      const b = o(W + 0.6);
      face.push(side > 0 ? [a.setY(foot), b.setY(top + 0.15)] : [b.setY(top + 0.15), a.setY(foot)]);
      const c = o(W + 0.6).setY(top + 0.15);
      const d = q.clone().setY(top + 0.1);
      ledge.push(side > 0 ? [c, d] : [d, c]);
    }
    flush();
  }
  return { faces, ledges };
}
const MILL_YELLOW = 0xfacc15;
/** A Millennium car's length: the pair of them stands whole at the line's 24-unit platforms. */
const CAR = 11.4;
/** Half the distance between a car's bogies (trainGeometry.ts bogieSpacing). */
const BOGIE = bogieSpacing(CAR);

/**
 * The other rail beside the ride, from OpenStreetMap (rail.ts): the Millennium Line on its own guideway, its LEDs in
 * the line's yellow, up at VCC–Clark a block south-west of the Expo, down in the Grandview Cut with the CN and BNSF
 * freight tracks, under the Expo's viaduct to its platform below Commercial–Broadway's (a glass lift joins the two; the
 * interchange itself is Hub.tsx), and up on its viaducts
 * east past Renfrew, Rupert and Gilmore to Brentwood and Holdom; its stations; two of its trains, in the line's own
 * design after Anna's hummingbird (liveries.ts), shuttling the line; a slow freight in the cut; and the Broadway
 * Extension (the line's subway, open in 2027 and, by 2100, on to UBC) from VCC–Clark round to its tunnel portal facing
 * Broadway, with an entrance pavilion at each of its stations along it.
 */
export function Millennium() {
  const world = useWorld();
  const { mats, lowEnd } = world;

  const built = useMemo(() => {
    const led = new MeshStandardMaterial({ color: 0x2a2410, emissive: MILL_YELLOW, emissiveIntensity: 0.9 });
    const line = new MeshStandardMaterial({ color: 0x2a2410, emissive: MILL_YELLOW, emissiveIntensity: 1 });
    const roundel = new MeshStandardMaterial({ color: 0x1d4ed8, emissive: 0x1d4ed8, emissiveIntensity: 0.35, roughness: 0.4 });
    const mouth = new MeshStandardMaterial({ color: 0x050608, roughness: 1 });
    const freightMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.2 });
    const step = lowEnd ? 4 : 2;

    // ------------------------------------------------------------------ guideways
    const girder: BufferGeometry[] = [];
    const bed: BufferGeometry[] = [];
    const sleepers: BufferGeometry[] = [];
    const leds: BufferGeometry[] = [];
    const rails: BufferGeometry[] = [];
    const piers: Matrix4[] = [];
    const m4 = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const sc = new Vector3();
    const lay = (ln: Line, s0: number, s1: number, stops: number[]) => {
      const all = framesOf(ln, s0, s1, step);
      const sOf = (i: number) => s0 + ((s1 - s0) * i) / (all.length - 1);
      // the stretches up on a girder: down on the trench floor or at grade the line lies on its bed, with no girder or
      // parapet (one there would run straight across the freight tracks where they cross under it)
      const raised = (s: number) => profileAt(ln, "cut", s) < 0.3 && profileAt(ln, "low", s) < 0.3;
      const runsOf = (keep: (s: number) => boolean) => {
        const out: Frame[][] = [];
        let run: Frame[] = [];
        all.forEach((f, i) => {
          if (!keep(sOf(i))) {
            if (run.length > 1) out.push(run);
            run = [];
          } else run.push(f);
        });
        if (run.length > 1) out.push(run);
        return out;
      };
      // the parapets give way to the platforms' own edges
      const runs = runsOf((s) => raised(s) && !stops.some((ss) => Math.abs(s - ss) < 13.5));
      const decks = runsOf(raised);
      girder.push(...decks.map((r) => slimRibbon(SOFFIT, r)), ...runs.flatMap((r) => [slimRibbon(PARAPET, r), slimRibbon(mirror(PARAPET), r)]));
      bed.push(slimRibbon([[6.02, 0.955], [-6.02, 0.955]], all, false));
      for (const lane of [-LANE, LANE]) sleepers.push(ribbon([[lane + SLEEPER, 0.96], [lane - SLEEPER, 0.96]], all, false, 0.65));
      leds.push(...decks.flatMap((r) => [slimRibbon(LED, r), slimRibbon(mirror(LED), r)]));
      for (const lane of [-LANE, LANE]) {
        for (const side of [-1, 1]) {
          const pts = all.map((f) => f.p.clone().addScaledVector(f.r, lane + side * GAUGE).addScaledVector(UP, 0.98));
          rails.push(new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), all.length * 2, 0.07, 4, false));
        }
      }
      // a column under the soffit every 24 units wherever the deck stands clear of the ground
      const f = makeFrame();
      for (let s = s0 + 12; s < s1; s += 24) {
        const u = s / ln.len;
        ln.curve.getPointAt(u, f.p);
        const gy = groundAt(f.p.x, f.p.z);
        const h = f.p.y - 1.9 - gy;
        if (h < 1 || isRoad(f.p.x, f.p.z, 1)) continue;
        m4.compose(p.set(f.p.x, gy - 0.3, f.p.z), q.identity(), sc.set(1, h + 0.3, 1));
        piers.push(m4.clone());
      }
    };
    lay(MILL_LINE, 0, MILL_LINE.len, MILL_LINE.stationS);
    // the Broadway Extension out of VCC–Clark, to where it runs into the hill under Broadway
    const portal = BROADWAY_PORTAL;
    lay(BROADWAY_LINE, 0, portal, [-MILL_LINE.stationS[0]]);

    // ------------------------------------------------------------------ stations
    const white: Part[] = [];
    const plat: Part[] = [];
    const pane: Part[] = [];
    const yellow: Part[] = [];
    const canopy: Part[] = [];
    const ribs: Part[] = [];
    const dark: Part[] = [];
    const blue: Part[] = [];
    // the Millennium's frame at arc length s
    const onMill = (s: number, out: Frame) => {
      const u = Math.min(1, Math.max(0, s / MILL_LINE.len));
      MILL_LINE.curve.getPointAt(u, out.p);
      MILL_LINE.curve.getTangentAt(u, out.t).normalize();
      out.r.crossVectors(out.t, UP).normalize();
    };
    MILL_LINE.stationS.forEach((ss, k) => {
      const st = MILL_LINE.stations[k];
      const fr = framesOf(MILL_LINE, ss, ss + 0.5, 1)[0];
      const tH = fr.t.clone().setY(0).normalize();
      // the station's frame bent along the track (slim.ts), so on a curve its platforms keep their distance from the rails
      const bend = bendAlong(onMill, ss, 24);
      // world point of local (x left of travel, y up from the deck, z ahead)
      const W = (x: number, y: number, z: number) => {
        const [wx, wz] = bend.point(x, z);
        return new Vector3(wx, fr.p.y + y, wz);
      };
      const put = (list: Part[], geo: BufferGeometry, x: number, y: number, z: number) => list.push({ geo: bendGeometry(geo.translate(x, y, z), bend, fr.p.y) });
      const drop = (x: number, z: number) => {
        const w = W(x, 0, z);
        return fr.p.y - groundAt(w.x, w.z);
      };
      const grand = /VCC|Commercial/.test(st.name);
      // a box from x0 to x1 across (the station's first numbers), drawn across as the Expo's stations are (slim.ts)
      const across = (list: Part[], x0: number, x1: number, h: number, len: number, y: number, z: number) => {
        const [a, b] = [acrossStation(x0), acrossStation(x1)];
        put(list, new BoxGeometry(Math.abs(b - a), h, len), (a + b) / 2, y, z);
      };
      for (const side of [1, -1]) {
        across(plat, side * 6.3, side * 11.5, 0.9, 24, 0.95, 0);
        across(yellow, side * 6.3, side * 6.46, 0.05, 23.4, 1.42, 0);
        for (const z of [-8, 8]) {
          const x = acrossStation(side * 10);
          const d = drop(x, z);
          if (d > 1.2) put(white, new CylinderGeometry(0.35, 0.5, d + 0.5, 10), x, (0.5 - d) / 2, z);
        }
        if (!grand) {
          // a plain roof over each platform on two rows of slim columns
          across(canopy, side * 5.9, side * 12.3, 0.25, 24, 5.6, 0);
          for (const z of [-9, 0, 9]) across(white, side * 10.99, side * 11.21, 4.2, 0.22, 3.5, z);
          across(pane, side * 11.375, side * 11.425, 2.2, 23, 2.5, 0);
        }
      }
      // at Commercial–Broadway the Expo's platforms reach out over the Millennium's right-hand platform in the cut: a
      // glass lift rises from it straight up through the floor of each Expo platform crossing it with room for one
      // (the one: the other crosses only the platform's very end), its cab a storey over it as the Expo's own lifts
      // (accessKit.ts), squared to the Expo's platform
      const ex = STATION_FRAMES[5];
      const LIFT_W = 2.6;
      const lifts: Vector3[] = [];
      // the vault's ends, short of a lift
      let z0 = -12.5;
      let z1 = 12.5;
      // along this platform, how far across the Expo (right of its travel) a step takes it
      const run = tH.x * ex.rx + tH.z * ex.rz;
      if (/Commercial/.test(st.name) && Math.abs(run) > 0.3) {
        // the lift's half-extent along this platform, turned to the Expo
        const half = (LIFT_W / 2) * (Math.abs(tH.x * ex.tx + tH.z * ex.tz) + Math.abs(run));
        for (const side of [1, -1]) {
          const mid = W(side * 8.9, 1.4, 0);
          const l0 = (mid.x - ex.x) * ex.rx + (mid.z - ex.z) * ex.rz;
          for (const l of [8.9, -8.9]) {
            // where the two platforms' middles cross, if there is room for the lift on both
            const z = (l - l0) / run;
            const p = W(side * 8.9, 1.4, z);
            const a = (p.x - ex.x) * ex.tx + (p.z - ex.z) * ex.tz;
            if (Math.abs(z) + half > 11.6 || Math.abs(a) + LIFT_W / 2 > PLATFORM_LEN / 2 - 0.4) continue;
            lifts.push(p);
            if (z < 0) z0 = Math.max(z0, z + half + 0.5);
            else z1 = Math.min(z1, z - half - 0.5);
          }
        }
      }
      if (grand && z1 - z0 > 4) {
        // VCC–Clark and the platform in the cut: a glass vault on white ribs over both tracks, as the Expo's stations
        // (at Commercial–Broadway stopping short of the lift, where the Expo's platform overhead roofs the one under it)
        put(pane, vault(23, 7, z1 - z0, 1.4), 0, 0, (z0 + z1) / 2);
        const n = Math.max(1, Math.round((z1 - z0 - 1) / 2.4));
        for (let j = 0; j <= n; j++) put(ribs, rib(23, 7, 1.42, 0, 0.14), 0, 0, z0 + 0.5 + ((z1 - z0 - 1) * j) / n);
      }
      for (const p of lifts) {
        const top = ex.y + 1.4;
        const h = top + 2.6 - p.y;
        const ry = Math.atan2(ex.tx, ex.tz);
        // a point on the lift's plan, squared to the Expo
        const on = (dl: number, da: number): [number, number] => [p.x + ex.rx * dl + ex.tx * da, p.z + ex.rz * dl + ex.tz * da];
        pane.push({ geo: new BoxGeometry(LIFT_W, h, LIFT_W).rotateY(ry), position: at(p.x, p.y + h / 2, p.z) });
        for (const [dl, da] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          const [x, z] = on((dl * LIFT_W) / 2, (da * LIFT_W) / 2);
          canopy.push({ geo: new BoxGeometry(0.12, h, 0.12).rotateY(ry), position: at(x, p.y + h / 2, z) });
        }
        white.push({ geo: new BoxGeometry(LIFT_W + 0.3, 0.25, LIFT_W + 0.3).rotateY(ry), position: at(p.x, top + 2.72, p.z) });
        // the car, part way up
        plat.push({ geo: new BoxGeometry(LIFT_W - 0.3, 2.2, LIFT_W - 0.3).rotateY(ry), position: at(p.x, p.y + (top - p.y) * 0.4 + 1.1, p.z) });
      }
      // a lift down to the street on the outside of the right-hand platform
      const d = drop(-13.4, 9);
      if (d > 1) put(pane, new BoxGeometry(3, d + 1.4, 3), -13.4, 1.4 - (d + 1.4) / 2, 9);
      // the station name's roundel at each platform end
      for (const z of [-12, 12]) {
        put(white, new CylinderGeometry(0.06, 0.06, 3.2, 6), -11.4, 3.0, z);
        const disc = new CylinderGeometry(0.75, 0.75, 0.08, 20).rotateX(Math.PI / 2);
        put(blue, disc, -11.4, 4.4, z);
      }
    });

    // ------------------------------------------------------------------ the Broadway Subway: portal and pavilions
    // the line's trench runs on to the portal, so the hill there is cut away: the portal stands in a planted berm over
    // the tunnel's first stretch, which meets the hill rising behind it (its parts join the cut's planted ledges)
    const bermParts: BufferGeometry[] = [];
    {
      const fr = framesOf(BROADWAY_LINE, portal + 1, Math.min(BROADWAY_LINE.len, portal + 17), 2);
      // the ground climbs inside the mouth: its dark back stands near, where the ground is still low
      const mouth = tunnelPortal(fr, { mouthW: 12, mouthH: 6, below: 0.8, half: 12, crest: 7.5, drop: 3, trees: lowEnd ? 6 : 12, shrubs: true, depth: 3.5 });
      for (const g of mouth.berm) {
        g.deleteAttribute("uv");
        bermParts.push(g);
      }
      white.push(...mouth.wall.map((geo) => ({ geo })));
      yellow.push(...mouth.band.map((geo) => ({ geo })));
      dark.push(...mouth.mouth.map((geo) => ({ geo })));
    }
    // each station's pavilion over the line as drawn (the first, Great Northern Way, moved with the line's approach),
    // on the corner beside the street rather than in it
    const tunnelPts: Vector3[] = [];
    // (past the berm over the portal)
    for (let s = portal + 20; s <= BROADWAY_LINE.len; s += 3) tunnelPts.push(BROADWAY_LINE.curve.getPointAt(s / BROADWAY_LINE.len));
    for (const st of BROADWAY_STATIONS) {
      if (st.x < -512) continue;
      const on = tunnelPts.reduce((b, p) => ((p.x - st.x) ** 2 + (p.z - st.z) ** 2 < (b.x - st.x) ** 2 + (b.z - st.z) ** 2 ? p : b), tunnelPts[0]);
      let sx = on.x;
      let sz = on.z;
      search: for (let r = 0; r <= 14; r += 1) {
        for (const [dx, dz] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          const x = on.x + dx * r;
          const z = on.z + dz * r;
          if (roadDist(x, z) > 4.6) {
            sx = x;
            sz = z;
            break search;
          }
        }
      }
      const gy = groundAt(sx, sz);
      // a glass pavilion over the stair, under a thin roof, and the roundel on a mast
      pane.push({ geo: new BoxGeometry(7, 3.4, 4.4), position: at(sx, gy + 1.7, sz) });
      canopy.push({ geo: new BoxGeometry(9, 0.3, 6.2), position: at(sx, gy + 3.55, sz) });
      for (const [dx, dz] of [
        [-3.4, -2.1],
        [3.4, -2.1],
        [-3.4, 2.1],
        [3.4, 2.1],
      ]) white.push({ geo: new BoxGeometry(0.2, 3.4, 0.2), position: at(sx + dx, gy + 1.7, sz + dz) });
      white.push({ geo: new CylinderGeometry(0.08, 0.08, 5.6, 6), position: at(sx + 5.6, gy + 2.8, sz) });
      blue.push({ geo: new CylinderGeometry(0.9, 0.9, 0.1, 20).rotateX(Math.PI / 2), position: at(sx + 5.6, gy + 5.2, sz) });
      yellow.push({ geo: new BoxGeometry(6.6, 0.12, 0.1), position: at(sx, gy + 3.25, sz - 2.25) });
    }

    // ------------------------------------------------------------------ the cut's walls
    const walls = cutWalls(lowEnd ? 4 : 2);
    walls.ledges.push(...bermParts);
    // the line's east end, past Holdom: into a tunnel under a wooded hill (the line carries on beyond the map), painted
    // into a mesh of its own, so the line's shared meshes keep their bounds (and stay out of views that cannot see it)
    const hill = (() => {
      const last = MILL_LINE.stationS[MILL_LINE.stationS.length - 1];
      const fr = framesOf(MILL_LINE, Math.min(MILL_LINE.len - 20, last + 30), MILL_LINE.len, 3);
      const gy = groundAt(fr[0].p.x, fr[0].p.z);
      // the dark lining runs nearly the hill's length: the trains wait inside it
      const depth = fr[0].p.distanceTo(fr[fr.length - 1].p) - 2;
      const h = tunnelPortal(fr, { mouthW: 10, mouthH: 6.5, below: 2.4, half: 26, crest: 10, drop: fr[0].p.y - gy + 2, trees: lowEnd ? 16 : 34, shrubs: false, depth });
      return merged([
        ...h.berm.map((g) => ({ geo: paint(g, 0x3f6b35) })),
        ...h.wall.map((g) => ({ geo: paint(g, 0xc9c4ba) })),
        ...h.band.map((g) => ({ geo: paint(g, MILL_YELLOW) })),
        ...h.mouth.map((g) => ({ geo: paint(g, 0x050608) })),
      ]);
    })();
    const hillMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

    // ------------------------------------------------------------------ freight in the cut
    const ballast: BufferGeometry[] = [];
    for (const fl of FREIGHT_LINES) {
      const fr = groundFrames(fl.pts, 0.12, lowEnd);
      // the bed, its shoulders falling into the ground either side
      ballast.push(ribbon(bedProfile(FREIGHT_HALF, 2), fr, false));
      sleepers.push(ribbon([[1.3, 0.06], [-1.3, 0.06]], fr, false, 0.65));
      for (const side of [-1, 1]) {
        const pts = fr.map((g) => g.p.clone().addScaledVector(g.r, side * 0.72).addScaledVector(UP, 0.14));
        rails.push(new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), pts.length * 2, 0.07, 4, false));
      }
    }

    // ------------------------------------------------------------------ trains
    // two cars in the line's own design (liveries.ts), each over a dark skirt
    const skirt = new MeshStandardMaterial({ color: 0x14201c, roughness: 0.6, metalness: 0.4 });
    const trains = [0, 1].map((k) => {
      const g = new Group();
      const cars: Group[] = [];
      for (const end of [0, 1]) {
        const geo = carGeometry(CAR, true, false, lowEnd ? 14 : 22, MILLENNIUM);
        const car = new Group();
        const body = new Mesh(geo.body, mats.millBody);
        body.castShadow = !lowEnd;
        const under = new Mesh(new BoxGeometry(2.3, 0.62, CAR - 1.2), skirt);
        under.position.y = 0.42;
        car.add(body, new Mesh(geo.glass, mats.window), new Mesh(geo.line, line), under);
        // the second car is the first turned round, so both ends wear a nose
        const inner = new Group();
        inner.rotation.y = end ? Math.PI : 0;
        inner.add(car);
        const holder = new Group();
        holder.add(inner);
        // drawn at SLIM across and up, as the Expo's trains are
        holder.scale.set(SLIM, SLIM, 1);
        cars.push(holder);
        g.add(holder);
      }
      return { g, cars, phase: k * 0.5 };
    });
    // a freight: a locomotive and a string of boxcars and tanks, on the CN line through the cut (full detail only)
    const freightCars = lowEnd ? null : new InstancedMesh(new BoxGeometry(1.7, 2.1, 7).translate(0, 1.35, 0), freightMat, 10);
    if (freightCars) {
      const cols = [0x1f3a5f, 0x8a3b26, 0x6b4a2b, 0x8a3b26, 0x3d4a3d, 0xb0b5ba, 0x8a3b26, 0x6b4a2b, 0x2f2f33, 0x8a3b26];
      cols.forEach((c, i) => freightCars.setColorAt(i, new Color(c)));
    }

    return {
      girder: merged(girder.map((geo) => ({ geo }))),
      bed: merged(bed.map((geo) => ({ geo }))),
      sleepers: merged(sleepers.map((geo) => ({ geo }))),
      leds: merged(leds.map((geo) => ({ geo }))),
      rails: merged(rails.map((geo) => ({ geo }))),
      ballast: merged(ballast.map((geo) => ({ geo }))),
      faces: merged(walls.faces.map((geo) => ({ geo }))),
      ledges: merged(walls.ledges.map((geo) => ({ geo }))),
      concrete: new MeshStandardMaterial({ color: 0xb9b4aa, roughness: 0.95, side: 2 }),
      piers: (() => {
        const im = new InstancedMesh(new CylinderGeometry(0.7, 1.0, 1, lowEnd ? 8 : 12).translate(0, 0.5, 0), mats.girder, Math.max(1, piers.length));
        piers.forEach((m, i) => im.setMatrixAt(i, m));
        im.count = piers.length;
        im.castShadow = !lowEnd;
        return im;
      })(),
      white: merged(white),
      plat: merged(plat),
      pane: merged(pane),
      yellow: merged(yellow),
      canopy: merged(canopy),
      ribs: merged(ribs),
      dark: merged(dark),
      blue: merged(blue),
      hill,
      hillMat,
      led,
      line,
      skirt,
      roundel,
      mouth,
      freightMat,
      trains,
      freightCars,
    };
  }, [mats, lowEnd]);

  useEffect(
    () => () => {
      for (const g of [built.girder, built.bed, built.sleepers, built.leds, built.rails, built.ballast, built.faces, built.ledges, built.white, built.plat, built.pane, built.yellow, built.canopy, built.ribs, built.dark, built.blue]) g.dispose();
      for (const m of [built.led, built.line, built.skirt, built.roundel, built.mouth, built.freightMat, built.concrete, built.hillMat]) m.dispose();
      built.hill.dispose();
      built.piers.geometry.dispose();
      built.piers.dispose();
      if (built.freightCars) {
        built.freightCars.geometry.dispose();
        built.freightCars.dispose();
      }
      for (const t of built.trains) t.g.traverse((o) => (o as Mesh).isMesh && (o as Mesh).geometry.dispose());
    },
    [built],
  );

  // two trains run the line from tunnel to tunnel, stopping at every station, each on the right-hand track for its
  // direction of travel: out of the Broadway Subway's portal (the line runs on west under Broadway), through VCC–Clark
  // and east to Holdom, into the tunnel under the hill past it, and back. Along the route, u < 0 is the Broadway
  // line's s = -u (from VCC–Clark west), u ≥ 0 the line's s = u. At each end a train waits out of sight.
  const stops = [-(BROADWAY_PORTAL + 34), ...MILL_LINE.stationS, MILL_LINE.len - 10];
  const legs = stops.slice(1).map((s, i) => s - stops[i]);
  const V = 22;
  const DWELL = 6;
  const legT = legs.map((d) => d / V + 2.5);
  const oneWay = legT.reduce((a, b) => a + b, 0) + DWELL * (stops.length - 1);
  const where = (t: number): { s: number; dir: 1 | -1 } => {
    const T = t % (2 * oneWay);
    const back = T >= oneWay;
    let u = back ? T - oneWay : T;
    for (let i = 0; i < legs.length; i++) {
      // outbound leg i runs stops[i] → stops[i + 1]; the trip back takes the same legs in reverse order
      const leg = back ? legs.length - 1 - i : i;
      if (u < DWELL) return back ? { s: stops[leg + 1], dir: -1 } : { s: stops[leg], dir: 1 };
      u -= DWELL;
      if (u < legT[leg]) {
        const e = u / legT[leg];
        const k = e * e * (3 - 2 * e);
        return back ? { s: stops[leg + 1] - legs[leg] * k, dir: -1 } : { s: stops[leg] + legs[leg] * k, dir: 1 };
      }
      u -= legT[leg];
    }
    return back ? { s: stops[0], dir: -1 } : { s: stops[stops.length - 1], dir: 1 };
  };
  const fa = makeFrame();
  const fb = makeFrame();
  const fc = makeFrame();
  const look = new Vector3();
  const fm4 = new Matrix4();
  const fq = new Quaternion();
  const fp = new Vector3();
  const fs = new Vector3(1, 1, 1);
  const Z = new Vector3(0, 0, 1);
  const cn = FREIGHT_LINES[0];
  const cnFrames = useMemo(() => (cn ? groundFrames(cn.pts, 0.2, lowEnd) : []), [cn, lowEnd]);
  const cnStep = cnFrames.length > 1 ? cnFrames[0].p.distanceTo(cnFrames[cnFrames.length - 1].p) / (cnFrames.length - 1) : 1;
  const onLine = (x: number, out: Frame) => {
    if (x < 0) {
      // west of VCC–Clark, on the Broadway line, heading the way u grows (back toward VCC–Clark)
      const v = Math.min(1, -x / BROADWAY_LINE.len);
      BROADWAY_LINE.curve.getPointAt(v, out.p);
      BROADWAY_LINE.curve.getTangentAt(v, out.t).normalize().negate();
    } else {
      const u = Math.min(1, x / MILL_LINE.len);
      MILL_LINE.curve.getPointAt(u, out.p);
      MILL_LINE.curve.getTangentAt(u, out.t).normalize();
    }
    out.r.crossVectors(out.t, UP).normalize();
    return out;
  };
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const tr of built.trains) {
      const { s, dir } = where(t + tr.phase * oneWay * 2);
      tr.cars.forEach((car, k) => {
        // each car on its two bogies, as the Expo's cars ride: the body midway between them, along their chord
        const sc = s - dir * (k - 0.5) * (CAR + GAP);
        onLine(sc + BOGIE * dir, fa);
        onLine(sc - BOGIE * dir, fb);
        onLine(sc, fc);
        car.position.copy(fa.p).add(fb.p).multiplyScalar(0.5).addScaledVector(fc.r, dir * LANE).addScaledVector(UP, 0.98);
        look.copy(fa.p).sub(fb.p).normalize();
        car.lookAt(fp.copy(car.position).add(look));
      });
    }
    if (built.freightCars && cnFrames.length > 1) {
      // 5 units a second eastbound, round again after a gap
      const L = cnFrames.length - 1;
      const head = ((t * 5) / cnStep) % (L + 120 / cnStep);
      for (let i = 0; i < 10; i++) {
        const k = head - (i * 7.6) / cnStep;
        if (k < 0 || k > L) {
          fm4.makeScale(0, 0, 0);
          built.freightCars.setMatrixAt(i, fm4);
          continue;
        }
        const j = Math.floor(k);
        const a = cnFrames[j];
        const b = cnFrames[Math.min(L, j + 1)];
        fp.copy(a.p).lerp(b.p, k - j);
        fq.setFromUnitVectors(Z, look.copy(b.p).sub(a.p).setY(0).normalize());
        fm4.compose(fp, fq, fs);
        built.freightCars.setMatrixAt(i, fm4);
      }
      built.freightCars.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh geometry={built.girder} material={mats.girder} castShadow={!lowEnd} receiveShadow />
      <mesh geometry={built.bed} material={mats.bed} receiveShadow />
      <mesh geometry={built.sleepers} material={mats.sleepers} receiveShadow />
      <mesh geometry={built.leds} material={built.led} />
      <mesh geometry={built.rails} material={mats.rail} />
      <mesh geometry={built.ballast} material={mats.bed} receiveShadow />
      <mesh geometry={built.faces} material={built.concrete} receiveShadow castShadow={!lowEnd} />
      <mesh geometry={built.ledges} material={mats.hedge} receiveShadow />
      <primitive object={built.piers} />
      <mesh geometry={built.white} material={mats.girder} castShadow={!lowEnd} receiveShadow />
      <mesh geometry={built.plat} material={mats.plat} receiveShadow />
      <mesh geometry={built.pane} material={mats.pane} />
      <mesh geometry={built.yellow} material={built.led} />
      <mesh geometry={built.canopy} material={mats.canopy} castShadow={!lowEnd} />
      <mesh geometry={built.ribs} material={mats.girder} />
      <mesh geometry={built.dark} material={built.mouth} />
      <mesh geometry={built.blue} material={built.roundel} />
      <mesh geometry={built.hill} material={built.hillMat} receiveShadow />
      {built.trains.map((t, i) => (
        <primitive key={i} object={t.g} />
      ))}
      {built.freightCars && <primitive object={built.freightCars} />}
    </>
  );
}

