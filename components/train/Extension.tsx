"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, type Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, ShapeUtils, Vector2, Vector3 } from "three";

import { CAR, FLOOR, GAP, LANE, SLIM } from "./constants";
import { ARM_OUT, ARM_TILT, beam, framesThrough, HEDGE, LED_STRIP, mirror, openSide, PARAPET, ribbon, slimRibbon, SOFFIT, TROUGH } from "./Guideway";
import { acrossStation, bendAlong, bendGeometry } from "./slim";
import { EXPO } from "./liveries";
import { merged, type Part } from "./merge";
import { isRoad } from "./roadNetwork";
import { groundAt, RASTER } from "./terrain";
import { buildExtension, EXT_GAP, EXT_JOIN, type Frame, frameAt, LEN, makeFrame, UP } from "./track";
import { bogieGeometry, bogieMatrix, bogieSpacing, carGeometry } from "./trainGeometry";
import { useWorld } from "./world";

/**
 * The Expo past the turnback loop (track.ts buildExtension): the line's own white trough girder with its planters,
 * hedges, violet LEDs, guide beams and Y piers, on to Royal Oak, Edmonds, 22nd Street and New Westminster, each a pair of side
 * platforms under a roof;
 * and a train running out and back between the first and the last, stopping at each. Drawn once the far terrain under
 * its far end has loaded (`heightAt`), on the city's own ground nearer in; only from within REACH of where it leaves
 * the line (from further off it is lost in the haze).
 */
const REACH = { full: 900, lite: 650 };
/** Half the distance between a car's bogies (trainGeometry.ts bogieSpacing). */
const BOGIE = bogieSpacing(CAR);

export function Extension({ heightAt }: { heightAt: (x: number, z: number) => number }) {
  const world = useWorld();
  const { mats, lowEnd } = world;
  const group = useRef<Group>(null);

  const built = useMemo(() => {
    const inCity = (x: number, z: number) => x < RASTER.x0 + (RASTER.nx - 1) * RASTER.step - 2 && z < RASTER.z0 + (RASTER.nz - 1) * RASTER.step - 2;
    const ground = (x: number, z: number) => (inCity(x, z) ? groundAt(x, z) : heightAt(x, z));
    const ext = buildExtension(ground);
    const all = ext.samples.filter((_, i) => !lowEnd || i % 2 === 0 || i === ext.samples.length - 1);
    const tOf = (i: number) => (i / (all.length - 1)) * ext.L;
    // the junction's length: alongside the line's deck as one, its right side (toward the line) has no wall, parapet,
    // planter, hedge or LED, and its own beams start where the switches meet them
    const J = EXT_JOIN.s1 - EXT_JOIN.s0;
    const runsOf = (skip: (t: number) => boolean) => {
      const out: Frame[][] = [];
      let run: Frame[] = [];
      all.forEach((f, i) => {
        if (skip(tOf(i))) {
          if (run.length > 1) out.push(run);
          run = [];
        } else run.push(f);
      });
      if (run.length > 1) out.push(run);
      return out;
    };
    // the parapets and planters give way to the platforms
    const atStop = (t: number) => ext.stationT.some((st) => Math.abs(t - st) < 13.5);
    const runs = runsOf(atStop);
    const runsRight = runsOf((t) => atStop(t) || t < J + 1);
    const tracked = all.filter((_, i) => tOf(i) >= J - 2);
    const open = openSide(SOFFIT, 1);
    const girder: BufferGeometry[] = [
      slimRibbon((i) => (tOf(i) < J + 1 ? open : SOFFIT), all),
      ...runsRight.flatMap((r) => [slimRibbon(PARAPET, r), slimRibbon(TROUGH, r)]),
      ...runs.flatMap((r) => [slimRibbon(mirror(PARAPET), r), slimRibbon(mirror(TROUGH), r)]),
    ];
    const half = (r: Frame[]) => r.filter((_, i) => i % 2 === 0 || i === r.length - 1);
    const hedges = [...runsRight.map((r) => slimRibbon(HEDGE, half(r), false, 1.6)), ...runs.map((r) => slimRibbon(mirror(HEDGE), half(r), false, 1.6))];
    const bed = [slimRibbon([[6.02, FLOOR + 0.005], [-6.02, FLOOR + 0.005]], all, false)];
    const leds = [slimRibbon(LED_STRIP, all.filter((_, i) => tOf(i) >= J + 1)), slimRibbon(mirror(LED_STRIP), all)];
    const faces: BufferGeometry[] = [];
    const beamOf = (list: Frame[], lane: number) => {
      const b = beam(list, lane);
      girder.push(b.body);
      faces.push(b.face);
    };
    for (const lane of [-LANE, LANE]) beamOf(tracked, lane);
    // the open end of its girder where it leaves, closed (its section there open on the line's side)
    {
      const f = ext.samples[0];
      const pts = open.map(([l, v]) => f.p.clone().addScaledVector(f.r, l * SLIM).addScaledVector(UP, v));
      const pos: number[] = [];
      for (const tri of ShapeUtils.triangulateShape(
        open.map(([l, v]) => new Vector2(l, v)),
        [],
      ))
        for (const k of [tri[0], tri[2], tri[1], tri[0], tri[1], tri[2]]) pos.push(pts[k].x, pts[k].y, pts[k].z);
      const cap = new BufferGeometry();
      cap.setAttribute("position", new Float32BufferAttribute(pos, 3));
      cap.computeVertexNormals();
      girder.push(cap);
    }
    // the switch, on the line's deck and the extension's side by side: both the extension's beams fan off the line's
    // left-hand one (a beam can't cross another as a rail can, so the line's right-hand beam runs on unbroken to the
    // loop, as its left-hand one does)
    const lf = makeFrame();
    const lineAt = (s: number, lat: number) => frameAt(s, lf, lat).p.clone();
    const switchPath = (from: number, to: number): Frame[] => {
      const out: Vector3[] = [];
      const a = EXT_JOIN.s0 + 1;
      const b = EXT_JOIN.s1 - 1;
      for (let s = a; s <= b + 1e-6; s += lowEnd ? 1.5 : 0.75) {
        const u = (s - a) / (b - a);
        out.push(lineAt(s, from + (to - from) * u * u * (3 - 2 * u)));
      }
      return framesThrough(out);
    };
    for (const to of [-(EXT_GAP - LANE), -(EXT_GAP + LANE)]) beamOf(switchPath(-LANE, to), 0);
    // the joint between the two decks, its walls cut down there, floored over with the troughs' bed: over the girders'
    // edges and a little over both beds, one colour, so the overlap never shows; raised clear of the beds, which it would
    // flicker against at a distance
    const joint: Frame[] = [];
    // on to the line's end, where its left parapet stops too
    for (let s = EXT_JOIN.s0; s <= LEN + 1e-6; s += 0.75) joint.push({ ...frameAt(s, makeFrame()) });
    bed.push(ribbon([[-5.7 * SLIM, FLOOR + 0.02], [-EXT_GAP + 5.6 * SLIM, FLOOR + 0.02]], joint, false));
    // Y piers every 24 units, as the line's: a tapered column to just under the soffit, two arms out to its curve
    const piers: Part[] = [];
    const n = ext.samples.length;
    for (let t = 18; t < ext.L - 4; t += 24) {
      const f = ext.samples[Math.round((t / ext.L) * (n - 1))];
      const gy = ground(f.p.x, f.p.z);
      const topY = f.p.y - 1.9 - 3.4;
      if (topY - gy < 0.6 || (inCity(f.p.x, f.p.z) && isRoad(f.p.x, f.p.z, 1))) continue;
      const ry = Math.atan2(f.t.x, f.t.z);
      piers.push({ geo: new CylinderGeometry(0.75, 1.1, topY - gy + 0.3, lowEnd ? 10 : 14), position: [f.p.x, (topY + gy - 0.3) / 2, f.p.z] });
      for (const side of [-1, 1]) {
        const c = f.p.clone().addScaledVector(f.r, side * ARM_OUT);
        // built with +x to the left of travel, so leaning an arm out toward its side is a turn of side × the lean
        piers.push({ geo: new BoxGeometry(0.7, 4.4, 1.5).rotateZ(side * ARM_TILT).rotateY(ry), position: [c.x, topY + 1.7, c.z] });
      }
    }
    // the stations: a side platform each way under a roof on slim columns, a glass screen behind, a violet edge
    const plat: Part[] = [];
    const roof: Part[] = [];
    const pane: Part[] = [];
    const edge: Part[] = [];
    const onExt = (s: number, out: Frame) => {
      const u = Math.min(1, Math.max(0, s / ext.L));
      ext.curve.getPointAt(u, out.p);
      ext.curve.getTangentAt(u, out.t).normalize();
      out.r.crossVectors(out.t, UP).normalize();
    };
    for (const st of ext.stationT) {
      const f = ext.samples[Math.round((st / ext.L) * (n - 1))];
      // the station's frame bent along the track (slim.ts), x left of travel
      const bend = bendAlong(onExt, st, 24);
      // a box from x0 to x1 across (the station's first numbers, + right of travel here), drawn across as the line's own
      // stations are and bent with the track
      const across = (list: Part[], x0: number, x1: number, h: number, len: number, y: number, z: number) => {
        const [a, b] = [acrossStation(x0), acrossStation(x1)];
        list.push({ geo: bendGeometry(new BoxGeometry(Math.abs(b - a), h, len).translate(-(a + b) / 2, y, z), bend, f.p.y) });
      };
      for (const side of [1, -1]) {
        across(plat, side * 6.3, side * 11.5, 0.9, 26, 0.95, 0);
        across(edge, side * 6.3, side * 6.46, 0.05, 25.4, 1.42, 0);
        across(roof, side * 5.8, side * 12.4, 0.3, 26, 6, 0);
        across(pane, side * 11.42, side * 11.48, 2.4, 25, 2.6, 0);
        for (const z of [-10, 0, 10]) across(piers, side * 11.08, side * 11.32, 4.6, 0.24, 3.7, z);
      }
    }
    girder.push(merged(piers));
    // the ribbons carry no texture coordinates: neither may anything merged with them
    for (const g of girder) g.deleteAttribute("uv");
    // a two-car train in the Expo's own design: the second car is the first turned round, so both ends wear a nose
    const geo = carGeometry(CAR, true, false, lowEnd ? 14 : 22, EXPO);
    const train = [
      new InstancedMesh(geo.body, mats.expoBody, 2),
      new InstancedMesh(geo.glass, mats.window, 2),
      new InstancedMesh(geo.line, mats.trainLine, 2),
    ];
    // and its four bogies round the beam, in the line's skirt navy
    const skirt = new MeshStandardMaterial({ color: 0x12233a, roughness: 0.6, metalness: 0.4 });
    const bogies = new InstancedMesh(bogieGeometry(), skirt, 4);
    train[0].castShadow = !lowEnd;
    // the instances run far from the meshes' origin
    for (const m of [...train, bogies]) m.frustumCulled = false;
    return {
      ext,
      girder: merged(girder.map((g) => ({ geo: g }))),
      hedges: merged(hedges.map((g) => ({ geo: g }))),
      bed: merged(bed.map((g) => ({ geo: g }))),
      leds: merged(leds.map((g) => ({ geo: g }))),
      faces: merged(faces.map((g) => ({ geo: g }))),
      plat: merged(plat),
      roof: merged(roof),
      pane: merged(pane),
      edge: merged(edge),
      train,
      bogies,
      skirt,
    };
  }, [mats, lowEnd, heightAt]);

  useEffect(
    () => () => {
      for (const g of [built.girder, built.hedges, built.bed, built.leds, built.faces, built.plat, built.roof, built.pane, built.edge]) g.dispose();
      for (const m of [...built.train, built.bogies]) {
        m.geometry.dispose();
        m.dispose();
      }
      built.skirt.dispose();
    },
    [built],
  );

  // the train: out from Royal Oak to 22nd Street and back, easing in and out of each station, a dwell at each
  const { ext, train, bogies } = built;
  const stops = ext.stationT;
  const legs = stops.slice(1).map((s, i) => s - stops[i]);
  const V = 16;
  const DWELL = 8;
  const legT = legs.map((d) => d / V + 3);
  const oneWay = legT.reduce((a, b) => a + b, 0) + DWELL * (stops.length - 1);
  const where = (t: number): { s: number; dir: 1 | -1 } => {
    const T = t % (2 * oneWay);
    const back = T >= oneWay;
    let u = back ? T - oneWay : T;
    for (let i = 0; i < legs.length; i++) {
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
  const pa = new Vector3();
  const pb = new Vector3();
  const pc = new Vector3();
  const tc = new Vector3();
  const r = new Vector3();
  const bt = new Vector3();
  const m4 = new Matrix4();
  const turn = new Matrix4().makeRotationY(Math.PI);
  const q = new Quaternion();
  const pointAt = (s: number, out: Vector3) => ext.curve.getPointAt(Math.min(1, Math.max(0, s / ext.L)), out);
  const origin = ext.samples[0].p;
  useFrame(({ clock, camera }) => {
    const g = group.current;
    if (g) g.visible = Math.hypot(camera.position.x - origin.x, camera.position.z - origin.z) < REACH[lowEnd ? "lite" : "full"];
    if (!g?.visible) return;
    const { s, dir } = where(clock.elapsedTime);
    for (let k = 0; k < 2; k++) {
      // each car on its two bogies (as the line's own trains ride), in the right-hand lane for its way of travel
      const sc = s - dir * (k - 0.5) * (CAR + GAP);
      pointAt(sc + BOGIE * dir, pa);
      pointAt(sc - BOGIE * dir, pb);
      pc.copy(pa).add(pb).multiplyScalar(0.5);
      ext.curve.getTangentAt(Math.min(1, Math.max(0, sc / ext.L)), tc);
      r.crossVectors(tc, UP).normalize();
      pc.addScaledVector(r, dir * LANE).addScaledVector(UP, 0.98);
      m4.lookAt(pa, pb, UP);
      if (k === 1) m4.multiply(turn);
      q.setFromRotationMatrix(m4);
      // drawn at SLIM across and up, as the line's own trains are
      m4.compose(pc, q, pa.set(SLIM, SLIM, 1));
      for (const m of train) m.setMatrixAt(k, m4);
      // its bogies, each on the beam under it
      [sc + BOGIE * dir, sc - BOGIE * dir].forEach((sb, j) => {
        pointAt(sb, pc);
        ext.curve.getTangentAt(Math.min(1, Math.max(0, sb / ext.L)), bt);
        bogies.setMatrixAt(k * 2 + j, bogieMatrix(m4, pc.addScaledVector(r.crossVectors(bt, UP).normalize(), dir * LANE), bt));
      });
    }
    for (const m of [...train, bogies]) m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <mesh geometry={built.girder} material={mats.girder} castShadow={!lowEnd} receiveShadow />
      <mesh geometry={built.hedges} material={mats.hedge} receiveShadow />
      <mesh geometry={built.bed} material={mats.bed} receiveShadow />
      <mesh geometry={built.leds} material={mats.guideLed} />
      <mesh geometry={built.faces} material={mats.plate} receiveShadow />
      <mesh geometry={built.plat} material={mats.plat} receiveShadow />
      <mesh geometry={built.roof} material={mats.canopy} castShadow={!lowEnd} />
      <mesh geometry={built.pane} material={mats.pane} />
      <mesh geometry={built.edge} material={mats.guideLed} />
      {built.train.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <primitive object={built.bogies} />
    </group>
  );
}
