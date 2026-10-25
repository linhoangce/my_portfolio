"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Box3, type InstancedMesh, type Mesh, type MeshStandardMaterial, type Object3D, Raycaster, Vector3 } from "three";

import { stations } from "@/data";

import type { EventId, Season, Weather } from "./lookTypes";
import { type Round, track, type Track } from "./airspace";
import { airTaxis } from "./airways";
import { deliveryDrones } from "./droneways";
import { skipToHold } from "./scene/director";
import { orbitBy, zoomBy } from "./scene/view";
import type { MonumentKey } from "./monumentData";
import { useTrain } from "./store";
import { BLOCKERS } from "./cityModel";
import { getCityData, getTreeData } from "./cityData";
import { type BoatPose, Harbour } from "./harbourTraffic";
import { standY } from "./harbourfront";
import { inSolid } from "./harbourNav";
import { ABUTMENT, deckY as walkDeckY, gradeAt, INLET_AIR, INLET_TOP, inletSolids, NAV, onInletWalk, PIERS, undersideY, WALK } from "./inletWalk";
import { floatplaneAt } from "./airways";
import { roadDist } from "./roadNetwork";
import { SEABUS_LEN, seabusAt, type SeaBusPose } from "./seabusLine";
import { SEA } from "./constants";
import { sdfAt } from "./terrain";
import { CROSSOVERS, deckY, groundAt, LEN, LOOPS, lowAt, profile, SAMPLES, samples, STATION_XZ, stationS } from "./track";
import { useWorld } from "./world";

export type TrainDebug = {
  ready: boolean;
  frames: number;
  calls: number;
  triangles: number;
  /** Debug camera: fixed position and look target until unview(). */
  view: (pos: [number, number, number], look: [number, number, number]) => void;
  unview: () => void;
  ground: (x: number, z: number) => number;
  /** Where something standing at (x, z) stands: the dock's rim or quay there, else the ground (harbourfront.ts standY). */
  stand: (x: number, z: number) => number;
  /** Triangles per object (instanced meshes multiplied by their count), largest first. */
  budget: () => [string, number][];
  /** The next frame's draw calls by source (nearest named ancestor, else material and vertex count). */
  /** The next frames' draw calls by source: calls and triangles. */
  draws: () => Promise<[string, number, number][]>;
  profile: () => { s: number[]; y: number[]; low: number[]; cut: number[]; mode: string; ground: number[]; lower: number[] };
  /** Terrain and deck checks: max grade, platform flatness, clearance, cut offset. */
  terrain: () => { maxGrade: number; maxGradeAt: number; platformSpread: number[]; minClearance: number; minClearanceAt: number; cutOffset: number; lowRange: [number, number] };
  stations: string[];
  stationS: number[];
  /** Orbit the current view (yaw, pitch in radians) and zoom (log). */
  orbit: (yaw: number, pitch: number, zoom?: number) => void;
  monument: (key: MonumentKey | null) => void;
  /** Show a scene's copy all at once. */
  skip: () => void;
  /** Kept for the headless checks: the page opens on the first stop's scene, so there is no card to drop. */
  dismiss: () => void;
  /** Where the camera is and what it looks at, this frame. */
  cam: () => { pos: number[]; dir: number[] };
  crossovers: number[];
  LEN: number;
  driveTo: (i: number) => void;
  jump: (i: number) => void;
  look: (season?: Season, weather?: Weather, event?: EventId | null) => void;
  warp: (k: number) => void;
  /** Current eased scene background as a hex string (theme and weather checks). */
  bg: () => string;
  /** The air taxis (airways.ts): x, y, z, service and phase round its cycle (0–1) of each. */
  hover: () => number[][];
  /** The delivery drones (droneways.ts): x, y, z of each. */
  drones: () => number[][];
  /**
   * The air network against what stands still: every taxi's and drone's round, a step a second, ray-tested along its
   * centre line and `pad` to either side and below against the scene's meshes (not the instanced and batched ones,
   * which move or are trees); each hit, by flier kind, round, round time, where, and what it hit. Its stays' spots
   * (the pads and docks it stands on) are left out.
   */
  air: (pad?: number) => { kind: string; round: number; t: number; at: number[]; hit: string }[];
  state: () => Record<string, unknown>;
  /** The water's signed distance at a point (negative on water), for the shore checks. */
  sdf: (x: number, z: number) => number;
  /**
   * Fingerprints of what is generated, for the determinism checks: the air taxis' tracks and timetable, the drones'
   * rounds, a fresh harbour's sailings over its first 900 s (every boat's pose every 5 s), and the lots, houses and
   * trees outside `box` (x0, x1, z0, z1; by default the Inlet Walk's corridor) with the counts inside it.
   */
  digest: (box?: [number, number, number, number]) => Record<string, string | number>;
  /**
   * The Inlet Walk's clearances (inletWalk.ts): its highest point, the navigation span's least clearance over the sea,
   * its steepest grade, the shore distance at its piers; how near the floatplane, the taxis and the drones come over
   * it (least height over its tops, among samples within 6, 12 and 6 of them); how near any boat over 900 s, or the
   * SeaBus round its timetable, comes to what it stands in the water (negative: inside); the nearest street to its
   * ground; the lots, houses and trees on it; and, past its abutment, its underside's least height over the dock's rim,
   * the quay or the ground.
   */
  inlet: () => Record<string, number>;
  /** Static geometry for the headless checks: track samples, footprints, blockers, station points. */
  geometry: () => {
    samples: [number, number, number, number, number, number, number][];
    /** The turning loops' centrelines (x, z), for clearance checks against every track. */
    loops: [number, number][];
    lots: { x: number; z: number; w: number; d: number; h: number }[];
    houses: { x: number; z: number; w: number; d: number }[];
    blockers: { x: number; z: number; r: number; h: number }[];
    stationXZ: [number, number][];
    stationPts: [number, number][];
  };
};

declare global {
  interface Window {
    __train?: TrainDebug;
  }
}

/** A running FNV-1a hash of numbers to a thousandth, for `digest`. */
function digester() {
  let h = 0x811c9dc5;
  const one = (v: number) => {
    const n = Number.isFinite(v) ? Math.round(v * 1000) : Number.isNaN(v) ? 0x7fffffff : 0x7ffffffe;
    h = Math.imul(h ^ (n & 0xffff), 0x01000193);
    h = Math.imul(h ^ ((n >>> 16) & 0xffff), 0x01000193);
  };
  return {
    add: (...v: number[]) => v.forEach(one),
    adds: (...arrs: ArrayLike<number>[]) => {
      for (const a of arrs) for (let i = 0; i < a.length; i++) one(a[i]);
    },
    hex: () => (h >>> 0).toString(16).padStart(8, "0"),
  };
}

/** `window.__train`: a debug handle for the headless checks (frames, draw calls, simulation state, jumps). */
export function Debug() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const world = useWorld();

  useEffect(() => {
    gl.info.autoReset = false;
    const st = useTrain.getState;
    const handle: TrainDebug = {
      ready: true,
      frames: 0,
      calls: 0,
      triangles: 0,
      view: (pos, look) => {
        st().sim.freeCam = { pos, look };
      },
      unview: () => {
        st().sim.freeCam = null;
      },
      ground: (x, z) => groundAt(x, z),
      stand: (x, z) => standY(x, z),
      budget: () => {
        const out: [string, number][] = [];
        world.scene.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh || !m.geometry) return;
          const g = m.geometry;
          const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
          const n = (m as InstancedMesh).isInstancedMesh ? (m as InstancedMesh).count : 1;
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          out.push([`${(m as InstancedMesh).isInstancedMesh ? "inst " : ""}${mat.type}${mat.name ? " " + mat.name : ""} ${tris.toFixed(0)}x${n}`, Math.round(tris * n)]);
        });
        return out.sort((a, b) => b[1] - a[1]).slice(0, 25);
      },
      draws: () =>
        new Promise((done) => {
          // the next frame's draw calls, each by the nearest named ancestor (or its material and size), most first
          const orig = gl.renderBufferDirect.bind(gl);
          const seen = new Map<string, number>();
          const tris = new Map<string, number>();
          gl.renderBufferDirect = (cam, scene, geo, mat, obj, group) => {
            let o: Object3D | null = obj;
            while (o && !o.name) o = o.parent;
            const m = mat as MeshStandardMaterial;
            const key = `${o?.name ?? "?"} ${obj.type} ${mat.type}${m.color ? " #" + m.color.getHexString() : ""}${m.vertexColors ? " vc" : ""} ${geo.attributes.position?.count ?? 0}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
            const n = (geo.index?.count ?? geo.attributes.position?.count ?? 0) / 3;
            tris.set(key, (tris.get(key) ?? 0) + n * ((obj as { count?: number }).count ?? 1));
            orig(cam, scene, geo, mat, obj, group);
          };
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              gl.renderBufferDirect = orig;
              done([...seen].map(([k, c]): [string, number, number] => [k, c, Math.round(tris.get(k) ?? 0)]).sort((x, y) => y[1] - x[1]));
            }),
          );
        }),
      profile: () => ({ s: profile.s, y: profile.y, low: profile.low, cut: profile.cut, mode: profile.mode.join(""), ground: profile.ground, lower: profile.lower }),
      terrain: () => {
        let maxGrade = 0;
        let maxGradeAt = 0;
        let minClearance = 1e9;
        let minClearanceAt = 0;
        const lowRange: [number, number] = [1e9, -1e9];
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1].p;
          const b = samples[i].p;
          const gr = Math.abs(b.y - a.y) / Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
          if (gr > maxGrade) {
            maxGrade = gr;
            maxGradeAt = (i / SAMPLES) * LEN;
          }
          // the girder's clearance over the ground beside it, where the line is up on its viaduct; where it has come
          // down, how far its rails sit over the ground under them (a ballast's depth, by the bed it shapes)
          const f = samples[i];
          const s = (i / SAMPLES) * LEN;
          if (lowAt(s) > 0.98) {
            const d = f.p.y - groundAt(f.p.x, f.p.z);
            lowRange[0] = Math.min(lowRange[0], d);
            lowRange[1] = Math.max(lowRange[1], d);
            continue;
          }
          if (lowAt(s) > 0.02) continue;
          let g = -1e9;
          for (let lat = -7; lat <= 7; lat += 3.5) g = Math.max(g, groundAt(f.p.x + f.r.x * lat, f.p.z + f.r.z * lat));
          const c = f.p.y - 1.1 - g;
          if (c < minClearance) {
            minClearance = c;
            minClearanceAt = s;
          }
        }
        const platformSpread = stationS.map((s0) => {
          let lo = 1e9;
          let hi = -1e9;
          for (let s = s0 - 18; s <= s0 + 18; s += 2) {
            const y = deckY(s);
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
          }
          return hi - lo;
        });
        return { maxGrade, maxGradeAt, platformSpread, minClearance, minClearanceAt, cutOffset: profile.cutOffset, lowRange };
      },
      stations: stations.map((s) => s.id),
      stationS,
      crossovers: CROSSOVERS,
      LEN,
      orbit: (yaw, pitch, zoom = 0) => {
        orbitBy(st(), yaw, pitch);
        if (zoom) zoomBy(st(), zoom);
      },
      monument: (key) => (key ? st().openMonument(key) : st().closeMonument()),
      skip: () => skipToHold(st()),
      dismiss: () => st().dismissIntro(),
      cam: () => {
        const d = camera.getWorldDirection(new Vector3());
        return { pos: camera.position.toArray(), dir: d.toArray() };
      },
      driveTo: (i) => st().driveTo(i),
      jump: (i) => st().jump(i),
      look: (season, weather, event) => st().setLook({ season, weather, event, auto: false }),
      warp: (k) => {
        st().sim.warp = Math.max(0.1, Math.min(40, k));
      },
      bg: () => world.scene.background.getHexString(),
      hover: () => airTaxis(st().env.lowEnd).taxis.map((c) => [c.x, c.y, c.z, c.service, c.phase]),
      drones: () => deliveryDrones(st().env.lowEnd).drones.map((d) => [d.x, d.y, d.z]),
      air: (pad = 0) => {
        const lowEnd = st().env.lowEnd;
        world.scene.updateMatrixWorld(true);
        const meshes: Mesh[] = [];
        world.scene.traverseVisible((o) => {
          const m = o as Mesh;
          if (!m.isMesh || (m as InstancedMesh).isInstancedMesh || (o as { isBatchedMesh?: boolean }).isBatchedMesh || m.geometry === world.sky.mesh.geometry) return;
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          if (mat.transparent && mat.opacity < 0.5) return;
          meshes.push(m);
        });
        const boxes = meshes.map((m) => {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          return new Box3().copy(m.geometry.boundingBox as Box3).applyMatrix4(m.matrixWorld);
        });
        const name = (o: Object3D) => {
          let p: Object3D | null = o;
          while (p && !p.name) p = p.parent;
          const m = o as Mesh;
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          return `${p?.name ?? "?"} ${mat.type}${(mat as MeshStandardMaterial).color ? " #" + (mat as MeshStandardMaterial).color.getHexString() : ""} ${m.geometry.attributes.position.count}`;
        };
        const rays: { kind: string; round: Round; tr: Track }[] = [];
        for (const s of airTaxis(lowEnd).services) s.rounds.forEach((r, k) => rays.push({ kind: `taxi ${s.name}`, round: r, tr: s.tracks[k] }));
        for (const r of deliveryDrones(lowEnd).routes) rays.push({ kind: `drone port ${r.port}`, round: r.round, tr: track(r.round, () => false) });
        const out: { kind: string; round: number; t: number; at: number[]; hit: string }[] = [];
        const rc = new Raycaster();
        const a = new Vector3();
        const b = new Vector3();
        const d = new Vector3();
        const seg = new Box3();
        const offsets = pad ? [[0, 0], [pad, 0], [-pad, 0], [0, -pad]] : [[0, 0]];
        rays.forEach(({ kind, round, tr }, ri) => {
          const spots = round.legs.flatMap((l) => (l.spot ? [l.spot] : []));
          for (let u = 0; u < tr.c; u++) {
            const w = (u + 1) % tr.c;
            if (Number.isNaN(tr.x[u]) || Number.isNaN(tr.x[w])) continue;
            a.set(tr.x[u], tr.y[u], tr.z[u]);
            b.set(tr.x[w], tr.y[w], tr.z[w]);
            const L = d.subVectors(b, a).length();
            if (L < 0.05 || spots.some((p) => Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z) < 1.5 || Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < 1.5)) continue;
            d.divideScalar(L);
            // to the side of travel (right, over the ground) and below
            const side = new Vector3(-d.z, 0, d.x).normalize();
            for (const [sx, sy] of offsets) {
              const o = a.clone().addScaledVector(side, sx).add(new Vector3(0, sy, 0));
              seg.setFromPoints([o, o.clone().addScaledVector(d, L)]).expandByScalar(0.1);
              rc.set(o, d);
              rc.far = L;
              let hit: { o: Object3D; p: Vector3 } | null = null;
              meshes.forEach((m, k) => {
                if (hit || !boxes[k].intersectsBox(seg)) return;
                const h = rc.intersectObject(m, false)[0];
                if (h) hit = { o: h.object, p: h.point };
              });
              if (hit) {
                const h = hit as { o: Object3D; p: Vector3 };
                out.push({ kind, round: ri, t: u, at: [h.p.x, h.p.y, h.p.z].map((v) => Math.round(v * 10) / 10), hit: name(h.o) });
                break;
              }
            }
          }
        });
        return out;
      },
      sdf: (x, z) => sdfAt(x, z),
      digest: (box = [-14, 34, -330, -16]) => {
        const lowEnd = st().env.lowEnd;
        const inBox = (x: number, z: number) => x > box[0] && x < box[1] && z > box[2] && z < box[3];
        const taxis = digester();
        for (const s of airTaxis(lowEnd).services) {
          taxis.add(s.n, s.c, ...s.offsets);
          for (const tr of s.tracks) taxis.adds(tr.x, tr.y, tr.z);
        }
        const drones = digester();
        for (const r of deliveryDrones(lowEnd).routes) {
          const tr = track(r.round, () => false);
          drones.add(r.port, r.c, ...r.offsets);
          drones.adds(tr.x, tr.y, tr.z);
        }
        const boats = digester();
        const harbour = new Harbour(lowEnd);
        const pose: BoatPose = { x: 0, z: 0, yaw: 0, v: 0 };
        for (let t = 0; t <= 900; t++) {
          harbour.update(t, 1e9);
          if (t % 5) continue;
          for (let i = 0; i < harbour.hulls.length; i++) {
            harbour.pose(i, t, pose);
            boats.add(pose.x, pose.z, pose.yaw);
          }
        }
        const city = getCityData(lowEnd);
        const lots = digester();
        let lotsIn = 0;
        for (const l of city.lots) {
          if (inBox(l.x, l.z)) lotsIn++;
          else lots.add(l.x, l.z, l.w, l.d, l.top);
        }
        let housesIn = 0;
        for (const h of city.houses) {
          if (inBox(h.x, h.z)) housesIn++;
          else lots.add(h.x, h.y, h.z, h.ry);
        }
        const trees = digester();
        let treesIn = 0;
        for (const t of getTreeData(lowEnd)) {
          if (inBox(t.x, t.z)) treesIn++;
          else trees.add(t.x, t.y, t.z, t.sp, t.s);
        }
        return { lowEnd: lowEnd ? 1 : 0, taxis: taxis.hex(), drones: drones.hex(), boats: boats.hex(), boatsN: harbour.hulls.length, lots: lots.hex(), lotsN: city.lots.length, lotsIn, housesIn, trees: trees.hex(), treesN: getTreeData(lowEnd).length, treesIn };
      },
      inlet: () => {
        const lowEnd = st().env.lowEnd;
        // how high something at (x, y, z) passes over the walk's boxes within `pad` of it (Infinity if none is near)
        const over = (x: number, y: number, z: number, pad: number) => {
          let best = Infinity;
          for (const [x0, x1, z0, z1, top] of INLET_AIR) if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) best = Math.min(best, y - top);
          return best;
        };
        let navClear = Infinity;
        for (let z = NAV.zS - 1.5; z > NAV.zN + 1.5; z -= 0.5) navClear = Math.min(navClear, undersideY(z) - SEA);
        let maxGrade = 0;
        for (let z = WALK.z0; z > WALK.z1; z -= 0.5) maxGrade = Math.max(maxGrade, gradeAt(z));
        let floatplane = Infinity;
        for (let t = 0; t < (Math.PI * 2) / 0.12; t += 0.1) {
          const f = floatplaneAt(t);
          floatplane = Math.min(floatplane, over(f.x, f.y, f.z, 6));
        }
        let taxis = Infinity;
        for (const sv of airTaxis(lowEnd).services) for (const tr of sv.tracks) for (let i = 0; i < tr.c; i++) if (!Number.isNaN(tr.x[i])) taxis = Math.min(taxis, over(tr.x[i], tr.y[i], tr.z[i], 12));
        let drones = Infinity;
        for (const r of deliveryDrones(lowEnd).routes) {
          const tr = track(r.round, () => false);
          for (let i = 0; i < tr.c; i++) if (!Number.isNaN(tr.x[i])) drones = Math.min(drones, over(tr.x[i], tr.y[i], tr.z[i], 6));
        }
        // the boats against what the walk stands in the water: the least margin left, less half a beam
        const { hard } = inletSolids();
        const margin = (x: number, z: number, half: number) => {
          let m = Infinity;
          for (const o of hard) {
            if (inSolid(o, x, z, half)) {
              let lo = 0;
              for (let k = 0; k < 20 && inSolid(o, x, z, half - lo); k++) lo += 0.5;
              m = Math.min(m, -lo);
            } else {
              let hi = 0;
              while (hi < 60 && !inSolid(o, x, z, half + hi + 1)) hi += 1;
              m = Math.min(m, hi);
            }
          }
          return m;
        };
        const harbour = new Harbour(lowEnd);
        const bp: BoatPose = { x: 0, z: 0, yaw: 0, v: 0 };
        let boats = Infinity;
        for (let t = 0; t <= 900; t++) {
          harbour.update(t, 1e9);
          harbour.hulls.forEach((h, i) => {
            harbour.pose(i, t, bp);
            if (bp.x > -60 && bp.x < 60 && bp.z < -20) boats = Math.min(boats, margin(bp.x, bp.z, h.beam / 2));
          });
        }
        const sp: SeaBusPose = { x: 0, z: 0, yaw: 0, v: 0 };
        let seabus = Infinity;
        for (let t = 0; t < 124; t += 0.5) for (const k of [0, 1]) {
          seabusAt(t, k, sp);
          seabus = Math.min(seabus, margin(sp.x, sp.z, SEABUS_LEN / 2));
        }
        // past the abutment, how far the deck's underside stands over whatever it passes (the rim, the quay, the ground)
        let footClear = Infinity;
        for (let z = ABUTMENT.z1; z > ABUTMENT.z1 - 40; z -= 0.5) for (let x = WALK.x - WALK.beam; x <= WALK.x + WALK.beam; x += 0.5) footClear = Math.min(footClear, undersideY(z) - standY(x, z));
        let pierShore = -Infinity;
        for (const z of PIERS) pierShore = Math.max(pierShore, sdfAt(WALK.x, z));
        let road = Infinity;
        for (let x = -12; x <= 28; x += 1) for (let z = WALK.z0 + 4; z >= -322; z -= 1) if (onInletWalk(x, z, 0) && sdfAt(x, z) > 0) road = Math.min(road, roadDist(x, z));
        const city = getCityData(lowEnd);
        return {
          top: INLET_TOP,
          navClear,
          maxGrade,
          pierShore,
          floatplane,
          taxis,
          drones,
          boats,
          seabus,
          road,
          lots: city.lots.filter((l) => onInletWalk(l.x, l.z, 0)).length,
          houses: city.houses.filter((h) => onInletWalk(h.x, h.z, 0)).length,
          trees: getTreeData(lowEnd).filter((t) => onInletWalk(t.x, t.z, 0)).length,
          footGround: groundAt(WALK.x, WALK.z0) - walkDeckY(WALK.z0),
          footClear,
        };
      },
      geometry: () => {
        const city = getCityData(st().env.lowEnd);
        return {
          samples: samples.map((f) => [f.p.x, f.p.y, f.p.z, f.t.x, f.t.z, f.r.x, f.r.z]),
          loops: [...LOOPS.near.samples, ...LOOPS.far.samples].map((f) => [f.p.x, f.p.z]),
          lots: city.lots,
          houses: city.houses.map((h) => ({ x: h.x, z: h.z, w: 7 * h.sx, d: 9 * h.sz })),
          blockers: BLOCKERS,
          stationXZ: STATION_XZ,
          stationPts: stationS.map((s) => {
            const i = Math.round((s / LEN) * (samples.length - 1));
            return [samples[i].p.x, samples[i].p.z];
          }),
        };
      },
      state: () => {
        const s = st();
        return {
          s: s.sim.s,
          v: s.sim.v,
          target: s.sim.target,
          travelDir: s.sim.travelDir,
          laneFrom: s.sim.laneFrom,
          laneTo: s.sim.laneTo,
          crossStart: s.sim.crossStart,
          dockedIdx: s.dockedIdx,
          overlay: s.overlay,
          phase: s.scenePhase,
          sceneIdx: s.sceneIdx,
          stage: s.sceneStage,
          monument: s.monument,
          filmOn: s.filmOn,
          season: s.season,
          weather: s.weather,
          event: s.event,
          autoLook: s.autoLook,
          cab: s.cab,
          introDone: s.introDone,
          lowEnd: s.env.lowEnd,
          reduced: s.env.reduced,
          phone: s.env.phone,
          warp: s.sim.warp,
          quality: s.quality,
          cityMs: getCityData(s.env.lowEnd).ms,
          cityPhases: getCityData(s.env.lowEnd).phases,
          lots: getCityData(s.env.lowEnd).lots.length,
          houses: getCityData(s.env.lowEnd).houses.length,
        };
      },
    };
    window.__train = handle;
    useTrain.getState().setReady(true);
    return () => {
      delete window.__train;
      useTrain.getState().setReady(false);
    };
  }, [gl, world, camera]);

  // first every frame: read last frame's draw-call total, then reset the counter
  useFrame(() => {
    const h = window.__train;
    if (!h) return;
    h.frames++;
    h.calls = gl.info.render.calls;
    h.triangles = gl.info.render.triangles;
    gl.info.reset();
  }, -1000);

  return null;
}
