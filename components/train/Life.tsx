"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { inLandmark, inPark, inWater, Rng } from "./cityModel";
import { getLifeData } from "./cityData";
import { PEOPLE_VARIANTS } from "./constants";
import { groundAt, UP } from "./track";
import { useWorld } from "./world";

const CAR_COLOURS = [0xffffff, 0xe8e8e8, 0xc9ccd1, 0x2b2f36, 0x1f2a44, 0x8c1d1d, 0x3a5fa8, 0x6b7280, 0xd9d2c3, 0x111111, 0x9ca3af, 0x7f1d1d];

const m4 = new Matrix4();
const q = new Quaternion();
const one = new Vector3(1, 1, 1);
const p = new Vector3();

type Boat = { m: Mesh; x: number; z: number; dir: 1 | -1; speed: number };

/** Traffic on the street grid, people on platforms and sidewalks, boats on the inlet, a floatplane over the harbour. */
export function Life() {
  const world = useWorld();
  const { lowEnd, mats } = world;
  const data = useMemo(() => getLifeData(lowEnd), [lowEnd]);

  const built = useMemo(() => {
    const rng = new Rng(5);
    // cars: a body extruded from a side profile (hood, raked windshield, roof, hatch), glass and wheels in a dark second mesh
    const prof = new Shape(
      [
        [-1.2, 0.3],
        [1.2, 0.3],
        [1.2, 0.58],
        [0.8, 0.64],
        [0.4, 0.96],
        [-0.45, 0.98],
        [-0.9, 0.66],
        [-1.2, 0.6],
      ].map(([x, y]) => new Vector2(x, y)),
    );
    const body = new ExtrudeGeometry(prof, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
    body.translate(0, 0, -0.55);
    const glass = new BoxGeometry(0.95, 0.3, 1.16);
    glass.translate(-0.05, 0.74, 0);
    const wheel = new CylinderGeometry(0.19, 0.19, 0.2, 10);
    wheel.rotateX(Math.PI / 2);
    const wheels = [
      [-0.75, -0.5],
      [0.75, -0.5],
      [-0.75, 0.5],
      [0.75, 0.5],
    ].map(([x, z]) => {
      const w = wheel.clone();
      w.translate(x, 0.19, z);
      return w;
    });
    const n = data.cars.length;
    const carMesh = new InstancedMesh(body, mats.car, Math.max(1, n));
    const carTrim = new InstancedMesh(mergeGeometries([glass, ...wheels], false), mats.carTrim, Math.max(1, n));
    const c = new Color();
    data.cars.forEach((_, i) => carMesh.setColorAt(i, c.setHex(rng.pick(CAR_COLOURS))));
    carMesh.count = carTrim.count = n;
    carMesh.castShadow = !lowEnd;
    wheel.dispose();
    glass.dispose();
    for (const w of wheels) w.dispose();

    // people: painted billboards, six variants, facing the camera every frame
    const quad = new PlaneGeometry(0.55, 1.1);
    quad.translate(0, 0.55, 0);
    const peopleMeshes = Array.from({ length: PEOPLE_VARIANTS }, (_, v) => {
      const m = new InstancedMesh(quad, mats.people[v], Math.max(1, data.counts[v]));
      m.count = data.counts[v];
      return m;
    });

    // boats on the inlet
    const bg = new BoxGeometry(6, 1.6, 2.2);
    bg.translate(0, 0.8, 0);
    const bm = new MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.6 });
    const boats: Boat[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(bg, bm);
      const b: Boat = { m, x: -150 + rng.next() * 700, z: -130 - rng.next() * 180, dir: rng.next() < 0.5 ? 1 : -1, speed: 3 + rng.next() * 3 };
      m.rotation.y = b.dir > 0 ? 0 : Math.PI;
      boats.push(b);
    }

    // a floatplane circling the harbour
    const plane = new Group();
    const fus = new Mesh(new CylinderGeometry(0.5, 0.35, 7, 10), new MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 }));
    fus.rotation.z = Math.PI / 2;
    plane.add(fus);
    const wing = new Mesh(new BoxGeometry(1.6, 0.12, 10), new MeshStandardMaterial({ color: 0xe8b23a, roughness: 0.6 }));
    wing.position.set(0.2, 0.7, 0);
    plane.add(wing);
    const tail = new Mesh(new BoxGeometry(1.2, 1.2, 0.1), new MeshStandardMaterial({ color: 0xe8b23a }));
    tail.position.set(-3.2, 0.7, 0);
    plane.add(tail);
    for (const z of [-1.1, 1.1]) {
      const f = new Mesh(new CylinderGeometry(0.25, 0.25, 5, 8), new MeshStandardMaterial({ color: 0x9aa3ad }));
      f.rotation.z = Math.PI / 2;
      f.position.set(0, -1.1, z);
      plane.add(f);
    }
    return { carMesh, carTrim, peopleMeshes, boats, plane, planeT: 0 };
  }, [data, mats, lowEnd]);

  useEffect(
    () => () => {
      built.carMesh.geometry.dispose();
      built.carTrim.geometry.dispose();
      built.carMesh.dispose();
      built.carTrim.dispose();
      built.peopleMeshes[0].geometry.dispose();
      for (const m of built.peopleMeshes) m.dispose();
      built.boats[0].m.geometry.dispose();
      built.plane.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
    [built],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const cam = state.camera.position;
    data.cars.forEach((c, i) => {
      c.pos += c.dir * c.speed * dt;
      if (c.pos > c.b) c.pos = c.a + (c.pos - c.b);
      else if (c.pos < c.a) c.pos = c.b - (c.a - c.pos);
      const x = c.axis === "x" ? c.pos : c.line + c.off;
      const z = c.axis === "x" ? c.line + c.off : c.pos;
      p.set(x, groundAt(x, z), z);
      q.setFromAxisAngle(UP, c.axis === "x" ? (c.dir > 0 ? 0 : Math.PI) : c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      m4.compose(p, q, one);
      built.carMesh.setMatrixAt(i, m4);
      built.carTrim.setMatrixAt(i, m4);
    });
    built.carMesh.instanceMatrix.needsUpdate = true;
    built.carTrim.instanceMatrix.needsUpdate = true;
    for (const h of data.people) {
      if (h.move) {
        const d = h.dir * h.move * dt;
        const nx = h.axis === "x" ? h.x + d : h.x;
        const nz = h.axis === "x" ? h.z : h.z + d;
        const along = h.axis === "x" ? nx : nz;
        if (Math.abs(along - h.origin) > 30 || inWater(nx, nz) || inLandmark(nx, nz, 1) || inPark(nx, nz)) h.dir = h.dir > 0 ? -1 : 1;
        else {
          h.x = nx;
          h.z = nz;
          h.y = groundAt(nx, nz);
        }
      }
      p.set(h.x, h.y, h.z);
      q.setFromAxisAngle(UP, Math.atan2(cam.x - h.x, cam.z - h.z));
      m4.compose(p, q, one);
      built.peopleMeshes[h.v].setMatrixAt(h.k, m4);
    }
    for (const m of built.peopleMeshes) m.instanceMatrix.needsUpdate = true;
    const t = state.clock.elapsedTime;
    for (const b of built.boats) {
      b.x += b.dir * b.speed * dt;
      if (b.x > 700) b.x = -250;
      if (b.x < -250) b.x = 700;
      b.m.position.set(b.x, -0.3 + Math.sin(t * 1.3 + b.z) * 0.15, b.z);
    }
    built.planeT += dt * 0.12;
    const R = 190;
    const cx = 120;
    const cz = -260;
    built.plane.position.set(cx + Math.cos(built.planeT) * R, 42 + Math.sin(built.planeT * 2.1) * 4, cz + Math.sin(built.planeT) * R * 0.7);
    built.plane.rotation.y = -built.planeT - Math.PI / 2 + 0.3;
    built.plane.rotation.z = 0.12;
  }, -40);

  return (
    <>
      <primitive object={built.carMesh} />
      <primitive object={built.carTrim} />
      {built.peopleMeshes.map((m, v) => (
        <primitive key={`people${v}`} object={m} />
      ))}
      {built.boats.map((b, i) => (
        <primitive key={`boat${i}`} object={b.m} />
      ))}
      <primitive object={built.plane} />
    </>
  );
}
