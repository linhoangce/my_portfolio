"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, SpotLight, Vector3 } from "three";

import { CAR, CROSS_LEN, GAP, TRAIN_LEN } from "./constants";
import { merged, type Part } from "./merge";
import { roundedBox } from "./roundedBox";
import { type Sim, useTrain } from "./store";
import { frameAt, makeFrame, UP } from "./track";
import { type World, useWorld } from "./world";

type CarObj = { off: number; obj: Group };
type WheelSlot = { car: number; x: number; z: number };

/** One car: body (with the rounded nose on the end cars), merged dark trim, blue band, one window strip, lights. */
function buildCar(world: World, len: number, isFront: boolean, isTail: boolean, spots: SpotLight[]): Group {
  const { mats, lowEnd } = world;
  const g = new Group();
  const zf = isFront ? 1 : -1;
  const bodyParts: Part[] = [{ geo: roundedBox(2.8, 2.6, len, 0.7), position: [0, 2.15, 0] }];
  if (isFront || isTail) bodyParts.push({ geo: new SphereGeometry(1, 28, 18), position: [0, 2.15, zf * (len / 2 - 0.3)], scale: [1.4, 1.28, 1.5] });
  const body = new Mesh(merged(bodyParts), mats.body);
  body.castShadow = !lowEnd;
  g.add(body);
  const trim = new Mesh(
    merged([
      { geo: new BoxGeometry(2.4, 0.5, len - 0.4), position: [0, 0.85, 0] },
      { geo: new BoxGeometry(1.8, 0.16, len - 2.4), position: [0, 3.5, 0] },
      { geo: new BoxGeometry(2.0, 0.4, 2.3), position: [0, 0.5, -len / 2 + 1.8] },
      { geo: new BoxGeometry(2.0, 0.4, 2.3), position: [0, 0.5, len / 2 - 1.8] },
    ]),
    mats.trim,
  );
  g.add(trim);
  const band = new Mesh(new BoxGeometry(3.14, 0.42, len - 0.5), mats.band);
  band.position.y = 1.5;
  g.add(band);
  // one textured strip per car instead of separate panes: no coplanar faces, so nothing flickers
  const strip = new Mesh(new BoxGeometry(3.16, 0.9, len - 1.6), mats.window);
  strip.position.y = 2.62;
  g.add(strip);
  if (isFront || isTail) {
    const shield = new Mesh(new SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), mats.glass);
    shield.scale.set(1.15, 1.0, 1.3);
    shield.rotation.x = zf * Math.PI * 0.5;
    shield.position.set(0, 2.55, zf * (len / 2 + 0.45));
    g.add(shield);
    const lights = new Mesh(
      merged([-0.7, 0.7].map((x) => ({ geo: new SphereGeometry(0.13, 12, 10), position: [x, 1.65, zf * (len / 2 + 1.1)] as [number, number, number] }))),
      isFront ? mats.head : mats.tail,
    );
    g.add(lights);
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
const wm = new Matrix4();
const wl = new Matrix4();
const wr = new Matrix4();
const wz = new Matrix4().makeRotationZ(Math.PI / 2);

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

/** All 32 wheels of a set as one instanced mesh, following their cars and spinning with the speed. */
function placeWheels(mesh: InstancedMesh, slots: WheelSlot[], cars: CarObj[], spin: number) {
  wr.makeRotationX(spin);
  slots.forEach((w, i) => {
    wl.makeTranslation(w.x, 0.42, w.z).multiply(wr).multiply(wz);
    wm.multiplyMatrices(cars[w.car].obj.matrixWorld, wl);
    mesh.setMatrixAt(i, wm);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/** Our four-car set on the right-hand track and the oncoming set on the left, plus a blob shadow on low-end devices. */
export function Train() {
  const world = useWorld();
  const built = useMemo(() => {
    const spots: SpotLight[] = [];
    const mk = () => [0, 1, 2, 3].map((i) => ({ off: -i * (CAR + GAP), obj: buildCar(world, CAR, i === 0, i === 3, spots) }));
    const cars = mk();
    const cars2 = mk();
    const slots: WheelSlot[] = [];
    for (let car = 0; car < 4; car++) for (const z of [-CAR / 2 + 1.8, CAR / 2 - 1.8]) for (const x of [-0.82, 0.82]) for (const dz of [-0.8, 0.8]) slots.push({ car, x, z: z + dz });
    const wheelGeo = new CylinderGeometry(0.4, 0.4, 0.18, 18);
    const wheels = new InstancedMesh(wheelGeo, world.mats.wheel, slots.length);
    const wheels2 = new InstancedMesh(wheelGeo, world.mats.wheel, slots.length);
    wheels.frustumCulled = wheels2.frustumCulled = false;
    const blob = new Mesh(new PlaneGeometry(4, TRAIN_LEN + 2), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.visible = world.lowEnd;
    return { cars, cars2, slots, wheels, wheels2, spots, blob, spin: 0, spin2: 0 };
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
      built.wheels.geometry.dispose();
      built.wheels.dispose();
      built.wheels2.dispose();
      built.blob.geometry.dispose();
    };
  }, [world, built]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const { sim } = useTrain.getState();
    if (!sim.stationS.length) return;
    placeTrain(built.cars, sim.s, (sc) => laneAt(sim, sc), sim.travelDir);
    placeTrain(built.cars2, sim.s2, -sim.laneTo, -sim.travelDir);
    built.spin += (sim.v * dt) / 0.4;
    built.spin2 += (30 * dt) / 0.4;
    placeWheels(built.wheels, built.slots, built.cars, built.spin);
    placeWheels(built.wheels2, built.slots, built.cars2, built.spin2);
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
      <primitive object={built.wheels} />
      <primitive object={built.wheels2} />
      <primitive object={built.blob} />
    </>
  );
}
