"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SpotLight, Vector3 } from "three";

import { CAR, CROSS_LEN, GAP, TRAIN_LEN, VMAX } from "./constants";
import { type Sim, useTrain } from "./store";
import { frameAt, makeFrame, UP } from "./track";
import { carGeometry } from "./trainGeometry";
import { type World, useWorld } from "./world";

type CarObj = { off: number; obj: Group };

/**
 * One 2100 car: the pearl superellipse body, panoramic glass with the cabin behind it, a light line along each side,
 * a dark skirt hiding the running gear, bellows to the car ahead, a light bar on each end car and a soft under-glow.
 */
function buildCar(world: World, isFront: boolean, isTail: boolean, spots: SpotLight[]): Group {
  const { mats, lowEnd } = world;
  const g = new Group();
  const geo = carGeometry(CAR, isFront, isTail, lowEnd ? 18 : 30);
  const body = new Mesh(geo.body, mats.body);
  body.castShadow = !lowEnd;
  const glass = new Mesh(geo.glass, mats.window);
  const line = new Mesh(geo.line, mats.trainLine);
  const skirt = new Mesh(new BoxGeometry(2.3, 0.62, CAR - 1.2), mats.trim);
  skirt.position.y = 0.42;
  const glow = new Mesh(new PlaneGeometry(3.2, CAR), mats.underGlow);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  g.add(body, glass, line, skirt, glow);
  if (!isFront) {
    const bellows = new Mesh(new BoxGeometry(2.5, 2.7, GAP + 0.3), mats.trim);
    bellows.position.set(0, 2.2, CAR / 2 + GAP / 2);
    g.add(bellows);
  }
  if (isFront || isTail) {
    const zf = isFront ? 1 : -1;
    const bar = new Mesh(new BoxGeometry(1.2, 0.12, 0.2), isFront ? mats.head : mats.tail);
    bar.position.set(0, 1.75, zf * (CAR / 2 - 0.05));
    g.add(bar);
    if (isFront) {
      const spot = new SpotLight(0xfff1d6, 900, 120, 0.42, 0.55, 1.6);
      spot.position.set(0, 1.9, CAR / 2 + 0.3);
      spot.target.position.set(0, 0.4, CAR / 2 + 60);
      spot.castShadow = false;
      g.add(spot, spot.target);
      spots.push(spot);
    }
  }
  return g;
}

const fA = makeFrame();
const fB = makeFrame();
const fC = makeFrame();
const tmp = new Vector3();
const tmp2 = new Vector3();

/** Lane offset of our train at arc position sc: constant between crossovers, an eased diagonal inside one. */
export function laneAt(sim: Sim, sc: number): number {
  if (sim.laneFrom === sim.laneTo) return sim.laneTo;
  const u = Math.min(1, Math.max(0, ((sc - sim.crossStart) * sim.travelDir) / CROSS_LEN));
  return sim.laneFrom + (sim.laneTo - sim.laneFrom) * (u * u * (3 - 2 * u));
}

/** Each car is oriented on a ±4.5-unit chord, so the set sits steady on curves: no bank, no bob. */
function placeTrain(list: CarObj[], sPos: number, lane: number | ((sc: number) => number), dir: number) {
  for (const c of list) {
    const sc = sPos + dir * c.off;
    const at = (x: number) => (typeof lane === "function" ? lane(x) : lane);
    frameAt(sc, fA, at(sc));
    frameAt(sc + 4.5 * dir, fB, at(sc + 4.5 * dir));
    frameAt(sc - 4.5 * dir, fC, at(sc - 4.5 * dir));
    c.obj.position.copy(fA.p).addScaledVector(UP, 0.98);
    tmp.copy(fB.p).sub(fC.p).normalize();
    c.obj.lookAt(tmp2.copy(c.obj.position).add(tmp));
    c.obj.updateMatrixWorld();
  }
}

/** Our four-car set on the right-hand track and the oncoming set on the left, plus a blob shadow on low-end devices. */
export function Train() {
  const world = useWorld();
  const built = useMemo(() => {
    const spots: SpotLight[] = [];
    const mk = () => [0, 1, 2, 3].map((i) => ({ off: -i * (CAR + GAP), obj: buildCar(world, i === 0, i === 3, spots) }));
    const cars = mk();
    const cars2 = mk();
    const blob = new Mesh(new PlaneGeometry(4, TRAIN_LEN + 2), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.visible = world.lowEnd;
    return { cars, cars2, spots, blob };
  }, [world]);

  useEffect(() => {
    world.lights.spots = built.spots;
    return () => {
      world.lights.spots = [];
      for (const c of [...built.cars, ...built.cars2]) {
        c.obj.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
      built.blob.geometry.dispose();
    };
  }, [world, built]);

  useFrame(() => {
    const { sim } = useTrain.getState();
    if (!sim.stationS.length) return;
    placeTrain(built.cars, sim.s, (sc) => laneAt(sim, sc), sim.travelDir);
    placeTrain(built.cars2, sim.s2, -sim.laneTo, -sim.travelDir);
    // the light line brightens with speed; the under-glow only shows after dark
    const edge = world.look.cur?.edge ?? 0.4;
    const speed = Math.min(1, Math.abs(sim.v) / VMAX);
    world.mats.trainLine.emissiveIntensity = (0.5 + edge * 2.5) * (0.45 + 0.55 * speed);
    world.mats.underGlow.opacity = Math.max(0, edge - 0.15) * 0.5;
    if (built.blob.visible) {
      const mid = sim.s - (sim.travelDir * TRAIN_LEN) / 2;
      frameAt(mid, fA, laneAt(sim, mid));
      built.blob.position.copy(fA.p).addScaledVector(UP, 1.02);
      built.blob.lookAt(tmp.copy(built.blob.position).add(fA.t));
      built.blob.rotateX(-Math.PI / 2);
    }
  }, -90);

  return (
    <>
      {built.cars.map((c, i) => (
        <primitive key={`a${i}`} object={c.obj} />
      ))}
      {built.cars2.map((c, i) => (
        <primitive key={`b${i}`} object={c.obj} />
      ))}
      <primitive object={built.blob} />
    </>
  );
}
