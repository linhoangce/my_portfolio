"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from "three";

import { Rng } from "./cityModel";
import { PEOPLE_WIDTH, WALK_CELLS } from "./constants";
import { bayBox, BAYS, CROWN, deckY, LOOKOUT, STAGE, STAGE_HOUSE, terraceRow, TERRACES, WALK } from "./inletWalk";
import { buildInletStage, buildInletWalk } from "./inletWalkKit";
import { addReflections, reflectRegistry, removeReflections } from "./reflectionSources";
import { UP } from "./track";
import { useDispose } from "./useDispose";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/**
 * The Inlet Walk across Burrard Inlet and the Inlet Stage in the cove at its north end (inletWalk.ts lays them out,
 * inletWalkKit.ts builds them). What their builders hang on the world's shared lists (the night and event followers,
 * the lit patterns, the lights in the water) is taken back off as they are built and put on only while this is
 * mounted, as Landmarks does.
 */
export function InletWalk() {
  const world = useWorld();
  const built = useMemo(() => {
    const ev = world.events;
    const f0 = ev.followers.length;
    const p0 = ev.patterns.length;
    const r0 = reflectRegistry.list.length;
    const walk = buildInletWalk(world);
    const stage = buildInletStage(world);
    const hooks = { followers: ev.followers.splice(f0), patterns: ev.patterns.splice(p0), reflections: reflectRegistry.list.splice(r0) };
    return { walk, stage, hooks };
  }, [world]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    built.walk.animate?.(t);
    built.stage.animate?.(t);
  });
  useEffect(() => {
    const { followers, patterns, reflections } = built.hooks;
    const ev = world.events;
    ev.followers.push(...followers);
    ev.patterns.push(...patterns);
    addReflections(reflections);
    return () => {
      ev.followers = ev.followers.filter((f) => !followers.includes(f));
      ev.patterns = ev.patterns.filter((p) => !patterns.includes(p));
      removeReflections(reflections);
    };
  }, [world, built]);
  // its glass, beams and small lights are left out of the water's mirror (its lit ring and LEDs stay in)
  useEffect(() => skipInMirror(...built.walk.skipMirror, ...built.stage.skipMirror), [built]);
  useDispose(built, (b) => {
    for (const part of [b.walk, b.stage]) {
      part.group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    }
  });
  return (
    <>
      <primitive object={built.walk.group} />
      <primitive object={built.stage.group} />
    </>
  );
}

/** One of the walk's people: where they are, which figure, how big, and (walkers) which way and how fast. */
type Figure = { x: number; y: number; z: number; cell: number; s: number; need: number; v: number; dir: number };

/**
 * People on the walk and at the stage, painted billboards like the city's (Life.tsx), in one instanced mesh: walkers
 * both ways along the deck, keeping right; a few at the lookout, in the shelters and on the balcony; an audience on
 * the terraces and round the Stage House; players on the stage. By day a matinee's worth of the audience and a
 * rehearsal; after dark the house fills.
 */
export function InletCrowd() {
  const world = useWorld();
  const { lowEnd, mats } = world;
  const built = useMemo(() => {
    const rng = new Rng(31);
    const cell = () => WALK_CELLS[Math.floor(rng.next() * WALK_CELLS.length)];
    const figs: Figure[] = [];
    const add = (x: number, y: number, z: number, s: number, need: number, v = 0, dir = 0) => figs.push({ x, y, z, cell: cell(), s, need, v, dir });
    // walkers, northbound on the east half, southbound on the west
    for (let k = 0; k < (lowEnd ? 12 : 36); k++) {
      const dir = rng.next() < 0.5 ? -1 : 1;
      const z = WALK.z1 + 2 + rng.next() * (WALK.z0 - WALK.z1 - 4);
      add(WALK.x - dir * (0.5 + rng.next() * 1.1), deckY(z), z, 1, 0, 0.45 + rng.next() * 0.4, dir);
    }
    // at the lookout's rail, in the shelters and on the balcony
    for (let k = 0; k < (lowEnd ? 3 : 6); k++) {
      const a = Math.PI / 2 + rng.next() * Math.PI;
      const r = 0.55 + rng.next() * 0.35;
      add(WALK.x - WALK.beam + Math.cos(a) * LOOKOUT.reach * r, deckY(LOOKOUT.z), LOOKOUT.z - Math.sin(a) * LOOKOUT.half * r, 1, 0);
    }
    for (const b of BAYS) {
      const r = bayBox(b);
      for (let k = 0; k < (b.kind === "balcony" ? (lowEnd ? 4 : 8) : 2); k++) add(r.x0 + 0.7 + rng.next() * (r.x1 - r.x0 - 1.4), deckY(b.z0), b.z0 - 0.8 - rng.next() * (b.z0 - b.z1 - 1.6), 1, b.kind === "balcony" ? rng.next() * 0.8 : 0);
    }
    // the audience: seats along every row but the aisles, a share of them taken
    const T = TERRACES;
    const aisles = [T.x0 + (T.x1 - T.x0) / 3, T.x0 + ((T.x1 - T.x0) * 2) / 3];
    const seats: [number, number, number][] = [];
    for (let k = 0; k < T.rows; k++) {
      const { y, zf } = terraceRow(k);
      for (let x = T.x0 + 0.7; x < T.x1 - 0.6; x += 0.75) if (aisles.every((a) => Math.abs(x - a) > 0.9)) seats.push([x, y, zf - 0.5]);
    }
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    for (const [x, y, z] of seats.slice(0, lowEnd ? 24 : 80)) add(x, y, z, 0.8, rng.next());
    // round the Stage House, and the players on the stage
    for (let k = 0; k < (lowEnd ? 3 : 8); k++) add(STAGE_HOUSE.x0 - 4 + rng.next() * (STAGE_HOUSE.x1 - STAGE_HOUSE.x0 + 8), CROWN.y, CROWN.z0 - 0.6 - rng.next() * 2, 1, rng.next());
    for (let k = 0; k < 5; k++) add(STAGE.x0 + 5 + k * 2 + rng.next() * 0.8, STAGE.deck + 0.08, STAGE.z1 + 2.5 + rng.next() * 3, 1, k < 2 ? 0 : 0.3 + rng.next() * 0.7);
    const quad = new PlaneGeometry(0.55, 1.1).translate(0, 0.55, 0);
    quad.setAttribute("aCell", new InstancedBufferAttribute(Float32Array.from(figs.map((f) => f.cell)), 1));
    const mesh = new InstancedMesh(quad, mats.people, figs.length);
    mesh.frustumCulled = false;
    mesh.name = "inletCrowd";
    return { figs, mesh };
  }, [lowEnd, mats]);
  useEffect(() => skipInMirror(built.mesh), [built]);
  useDispose(built, (b) => {
    b.mesh.geometry.dispose();
    b.mesh.dispose();
  });
  const m4 = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const p = useMemo(() => new Vector3(), []);
  const sc = useMemo(() => new Vector3(), []);
  useFrame((state, delta) => {
    const dt = Math.min(0.1, delta);
    const cam = state.camera.position;
    // the house fills after dark (the windows' light, 0 by day and 1 at night)
    const fill = 0.35 + 0.65 * Math.min(1, Math.max(0, world.buildings.solid.emissiveIntensity));
    built.figs.forEach((f, i) => {
      if (f.v) {
        f.z += f.dir * f.v * dt;
        // turned back at either end, crossing to the other half to walk the other way
        if (f.z < WALK.z1 + 1 || f.z > WALK.z0 - 1) {
          f.dir = -f.dir;
          f.z = Math.min(WALK.z0 - 1, Math.max(WALK.z1 + 1, f.z));
          f.x = WALK.x - (f.x - WALK.x);
        }
        f.y = deckY(f.z);
      }
      p.set(f.x, f.y, f.z);
      q.setFromAxisAngle(UP, Math.atan2(cam.x - f.x, cam.z - f.z));
      const s = f.need < fill ? f.s : 0;
      built.mesh.setMatrixAt(i, m4.compose(p, q, sc.set((PEOPLE_WIDTH[f.cell] ?? 1) * s, s, s)));
    });
    built.mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={built.mesh} />;
}
