"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, SpotLight, Vector3 } from "three";

import { CAR, CROSS_LEN, GAP, TRAIN_LEN } from "./constants";
import { roundedBox } from "./roundedBox";
import { type Sim, useTrain } from "./store";
import { frameAt, makeFrame, UP } from "./track";
import { type World, useWorld } from "./world";

type CarObj = { off: number; obj: Group };

function buildCar(world: World, len: number, isFront: boolean, isTail: boolean, wheels: Mesh[], spots: SpotLight[]): Group {
  const { mats, lowEnd } = world;
  const g = new Group();
  const body = new Mesh(roundedBox(2.8, 2.6, len, 0.7), mats.body);
  body.position.y = 2.15;
  body.castShadow = !lowEnd;
  g.add(body);
  const under = new Mesh(new BoxGeometry(2.4, 0.5, len - 0.4), mats.trim);
  under.position.y = 0.85;
  g.add(under);
  const roof = new Mesh(new BoxGeometry(1.8, 0.16, len - 2.4), mats.trim);
  roof.position.y = 3.5;
  g.add(roof);
  const band = new Mesh(new BoxGeometry(3.14, 0.42, len - 0.5), mats.band);
  band.position.y = 1.5;
  g.add(band);
  // one textured strip per car instead of separate panes: no coplanar faces, so nothing flickers
  const strip = new Mesh(new BoxGeometry(3.16, 0.9, len - 1.6), mats.window);
  strip.position.y = 2.62;
  g.add(strip);
  const bogie = (z: number) => {
    const b = new Mesh(new BoxGeometry(2.0, 0.4, 2.3), mats.trim);
    b.position.set(0, 0.5, z);
    g.add(b);
    for (const x of [-0.82, 0.82]) {
      for (const dz of [-0.8, 0.8]) {
        const w = new Mesh(new CylinderGeometry(0.4, 0.4, 0.18, 18), mats.wheel);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.42, z + dz);
        g.add(w);
        wheels.push(w);
      }
    }
  };
  bogie(-len / 2 + 1.8);
  bogie(len / 2 - 1.8);
  if (isFront || isTail) {
    const zf = isFront ? 1 : -1;
    const nose = new Mesh(new SphereGeometry(1, 28, 18), mats.body);
    nose.scale.set(1.4, 1.28, 1.5);
    nose.position.set(0, 2.15, zf * (len / 2 - 0.3));
    nose.castShadow = !lowEnd;
    g.add(nose);
    const shield = new Mesh(new SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), mats.glass);
    shield.scale.set(1.15, 1.0, 1.3);
    shield.rotation.x = zf * Math.PI * 0.5;
    shield.position.set(0, 2.55, zf * (len / 2 + 0.45));
    g.add(shield);
    for (const x of [-0.7, 0.7]) {
      const h = new Mesh(new SphereGeometry(0.13, 12, 10), isFront ? mats.head : mats.tail);
      h.position.set(x, 1.65, zf * (len / 2 + 1.1));
      g.add(h);
    }
    if (isFront) {
      const spot = new SpotLight(0xfff1d6, 900, 120, 0.42, 0.55, 1.6);
      spot.position.set(0, 1.9, zf * (len / 2 + 0.6));
      spot.target.position.set(0, 0.4, zf * (len / 2 + 60));
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
  }
}

/** Our four-car set on the right-hand track and the oncoming set on the left, plus a blob shadow on low-end devices. */
export function Train() {
  const world = useWorld();
  const built = useMemo(() => {
    const wheels: Mesh[] = [];
    const spots: SpotLight[] = [];
    const mk = () => [0, 1, 2, 3].map((i) => ({ off: -i * (CAR + GAP), obj: buildCar(world, CAR, i === 0, i === 3, wheels, spots) }));
    const cars = mk();
    const cars2 = mk();
    const blob = new Mesh(new PlaneGeometry(4, TRAIN_LEN + 2), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.visible = world.lowEnd;
    return { cars, cars2, wheels, spots, blob };
  }, [world]);

  useEffect(() => {
    world.refs.wheels = built.wheels;
    world.lights.spots = built.spots;
    return () => {
      world.refs.wheels = [];
      world.lights.spots = [];
      for (const c of [...built.cars, ...built.cars2]) {
        c.obj.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
      built.blob.geometry.dispose();
    };
  }, [world, built]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const { sim } = useTrain.getState();
    if (!sim.stationS.length) return;
    placeTrain(built.cars, sim.s, (sc) => laneAt(sim, sc), sim.travelDir);
    placeTrain(built.cars2, sim.s2, -sim.laneTo, -sim.travelDir);
    const rot = (sim.v * dt) / 0.4;
    for (const w of built.wheels) w.rotation.x += rot;
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
