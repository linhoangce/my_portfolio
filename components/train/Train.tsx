"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SpotLight, Vector3 } from "three";

import { CAR, CROSS_LEN, GAP, HEAD, TRAIN_CARS, TRAIN_LEN, VMAX } from "./constants";
import { type Sim, useTrain } from "./store";
import { makeFrame, trainFrameAt, UP } from "./track";
import { carGeometry, SECTION_CY, sectionRing } from "./trainGeometry";
import { type World, useWorld } from "./world";

type CarObj = { off: number; obj: Group };

/**
 * One 2100 car: the pearl superellipse body, panoramic glass with the cabin behind it, a light line along each side,
 * a dark skirt hiding the running gear, a light bar on each end car and a soft under-glow. The gangways between cars
 * are drawn separately (see Bellows), so they follow the cars round curves.
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

/**
 * The gangways of one train: a corrugated tube between each pair of cars, rebuilt every frame from the two car ends
 * (a cubic between them along each car's axis), so the set reads as one articulated vehicle on straights and curves.
 */
class Bellows {
  static readonly N = 28;
  static readonly RINGS = 9;
  readonly mesh: Mesh;
  private readonly ring = sectionRing(Bellows.N, 0.9);
  private readonly pos: Float32Array;
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly ta = new Vector3();
  private readonly tb = new Vector3();
  private readonly ca = new Vector3();
  private readonly cb = new Vector3();
  private readonly p = new Vector3();
  private readonly c = new Vector3();

  constructor(
    private readonly gaps: number,
    material: MeshStandardMaterial,
  ) {
    const { N, RINGS } = Bellows;
    this.pos = new Float32Array(gaps * RINGS * N * 3);
    const idx: number[] = [];
    for (let g = 0; g < gaps; g++) {
      for (let r = 0; r < RINGS - 1; r++) {
        for (let i = 0; i < N; i++) {
          const a = (g * RINGS + r) * N + i;
          const b = (g * RINGS + r) * N + ((i + 1) % N);
          const c = a + N;
          const d = b + N;
          idx.push(a, b, c, b, d, c);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    geo.setIndex(idx);
    this.mesh = new Mesh(geo, material);
    this.mesh.frustumCulled = false;
  }

  /** cars[k] runs ahead of cars[k + 1]; each car's local +z points the way the set travels. */
  update(cars: CarObj[]) {
    const { N, RINGS } = Bellows;
    const { ring, pos, a, b, ta, tb, ca, cb, p, c } = this;
    for (let g = 0; g < this.gaps; g++) {
      const A = cars[g].obj.matrixWorld;
      const B = cars[g + 1].obj.matrixWorld;
      // the back of the car ahead and the front of the car behind, a hair inside each end cap
      ca.set(0, SECTION_CY, -CAR / 2 + 0.05).applyMatrix4(A);
      cb.set(0, SECTION_CY, CAR / 2 - 0.05).applyMatrix4(B);
      const len = Math.max(0.3, ca.distanceTo(cb));
      ta.set(0, 0, -1).transformDirection(A).multiplyScalar(len);
      tb.set(0, 0, -1).transformDirection(B).multiplyScalar(len);
      for (let r = 0; r < RINGS; r++) {
        const u = r / (RINGS - 1);
        const h00 = 2 * u * u * u - 3 * u * u + 1;
        const h10 = u * u * u - 2 * u * u + u;
        const h01 = -2 * u * u * u + 3 * u * u;
        const h11 = u * u * u - u * u;
        // the folds: every other inner ring a little narrower
        const fold = r > 0 && r < RINGS - 1 && r % 2 === 1 ? 0.93 : 1;
        c.copy(ca).multiplyScalar(h00).addScaledVector(ta, h10).addScaledVector(cb, h01).addScaledVector(tb, h11);
        for (let i = 0; i < N; i++) {
          const [x, y] = ring[i];
          a.set(x, SECTION_CY + y, -CAR / 2 + 0.05).applyMatrix4(A);
          b.set(x, SECTION_CY + y, CAR / 2 - 0.05).applyMatrix4(B);
          p.copy(a).multiplyScalar(h00).addScaledVector(ta, h10).addScaledVector(b, h01).addScaledVector(tb, h11);
          p.sub(c).multiplyScalar(fold).add(c);
          const k = ((g * RINGS + r) * N + i) * 3;
          pos[k] = p.x;
          pos[k + 1] = p.y;
          pos[k + 2] = p.z;
        }
      }
    }
    const geo = this.mesh.geometry;
    (geo.attributes.position as BufferAttribute).needsUpdate = true;
    geo.computeVertexNormals();
  }
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

/** Each car is oriented on a ±4.5-unit chord, so the set sits steady on curves: no bank, no bob. Past either end of the line the cars follow the turning loop. */
function placeTrain(list: CarObj[], sPos: number, lane: number | ((sc: number) => number), dir: number) {
  for (const c of list) {
    const sc = sPos + dir * c.off;
    const at = (x: number) => (typeof lane === "function" ? lane(x) : lane);
    trainFrameAt(sc, dir, at(sc), fA);
    trainFrameAt(sc + 4.5 * dir, dir, at(sc + 4.5 * dir), fB);
    trainFrameAt(sc - 4.5 * dir, dir, at(sc - 4.5 * dir), fC);
    c.obj.position.copy(fA.p).addScaledVector(UP, 0.98);
    tmp.copy(fB.p).sub(fC.p).normalize();
    c.obj.lookAt(tmp2.copy(c.obj.position).add(tmp));
    c.obj.updateMatrixWorld();
  }
}

/** Our three-car set on the right-hand track and the oncoming set on the left, plus a blob shadow on low-end devices. */
export function Train() {
  const world = useWorld();
  const built = useMemo(() => {
    const spots: SpotLight[] = [];
    // laid out about the train's middle (sim.s), the lead car HEAD ahead of it
    const mk = () => Array.from({ length: TRAIN_CARS }, (_, i) => ({ off: HEAD - i * (CAR + GAP), obj: buildCar(world, i === 0, i === TRAIN_CARS - 1, spots) }));
    const cars = mk();
    const cars2 = mk();
    const bellowsMat = new MeshStandardMaterial({ color: 0x2f343c, roughness: 0.85, metalness: 0.1, side: 2 });
    const bellows = new Bellows(TRAIN_CARS - 1, bellowsMat);
    const bellows2 = new Bellows(TRAIN_CARS - 1, bellowsMat);
    const blob = new Mesh(new PlaneGeometry(4, TRAIN_LEN + 2), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.visible = world.lowEnd;
    return { cars, cars2, bellows, bellows2, spots, blob };
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
      built.bellows.mesh.geometry.dispose();
      built.bellows2.mesh.geometry.dispose();
      built.blob.geometry.dispose();
    };
  }, [world, built]);

  useFrame(() => {
    const { sim } = useTrain.getState();
    if (!sim.stationS.length) return;
    placeTrain(built.cars, sim.s, (sc) => laneAt(sim, sc), sim.travelDir);
    placeTrain(built.cars2, sim.s2, -sim.laneTo, -sim.travelDir);
    built.bellows.update(built.cars);
    built.bellows2.update(built.cars2);
    // the light line brightens with speed; the under-glow only shows after dark
    const edge = world.look.cur?.edge ?? 0.4;
    const speed = Math.min(1, Math.abs(sim.v) / VMAX);
    world.mats.trainLine.emissiveIntensity = (0.5 + edge * 2.5) * (0.45 + 0.55 * speed);
    world.mats.underGlow.opacity = Math.max(0, edge - 0.15) * 0.5;
    if (built.blob.visible) {
      trainFrameAt(sim.s, sim.travelDir, laneAt(sim, sim.s), fA);
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
      <primitive object={built.bellows.mesh} />
      <primitive object={built.bellows2.mesh} />
      <primitive object={built.blob} />
    </>
  );
}
