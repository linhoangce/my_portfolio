"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BatchedMesh,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";

import { bridgeTraffic } from "./bridgeTraffic";
import { Rng } from "./cityModel";
import { getLifeData } from "./cityData";
import { PEOPLE_WIDTH, SEA } from "./constants";
import { merged } from "./merge";
import { paint } from "./shapes";
import { groundAt, UP } from "./track";
import { boatLights, busSection, sailboat, seabus, yacht } from "./vessels";
import { asVehicle, canoe, carKinds } from "./vehicles";
import { floatplaneAt } from "./airways";
import { type BoatPose, Harbour } from "./harbourTraffic";
import { useDispose } from "./useDispose";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

const CAR_COLOURS = [0xffffff, 0xe8e8e8, 0xc9ccd1, 0x2b2f36, 0x1f2a44, 0x8c1d1d, 0x3a5fa8, 0x6b7280, 0xd9d2c3, 0x111111, 0x9ca3af, 0x7f1d1d];

const m4 = new Matrix4();
const q = new Quaternion();
const one = new Vector3(1, 1, 1);
const p = new Vector3();
const sc = new Vector3();
const e = new Euler();

const bp: BoatPose = { x: 0, z: 0, yaw: 0, v: 0 };

/**
 * Traffic on the street grid and over the bridges, people on platforms and sidewalks, the harbour's boats on the inlet
 * and on False Creek (under way between their berths, moored and at anchor: harbourTraffic.ts runs them) and their
 * docks, a floatplane over the harbour (the air taxis over it are AirTaxis.tsx's).
 */
export function Life() {
  const world = useWorld();
  const { lowEnd, mats } = world;
  const data = useMemo(() => getLifeData(lowEnd), [lowEnd]);

  const built = useMemo(() => {
    const rng = new Rng(5);
    // the vehicles: the five kinds of car and the buses' two sections (vehicles.ts), one batched mesh, one draw. The
    // paint takes each one's colour; lamps, light bars and the buses' signs glow by an attribute, brighter after dark.
    const kinds = carKinds();
    const BUS_F = kinds.length;
    const BUS_R = BUS_F + 1;
    const CANOE = BUS_F + 2;
    const geos = [...kinds, asVehicle(busSection(true)), asVehicle(busSection(false)), canoe()];
    // the harbour's boats and docks; its journey canoes on False Creek are drawn with the vehicles
    const harbour = new Harbour(lowEnd);
    const nCanoe = harbour.hulls.filter((h) => h.kind === 3).length;
    const cars = data.traffic.cars;
    const nb = data.traffic.buses.length;
    // and over the bridges, each lane its own stream (bridgeTraffic.ts)
    const bridges = bridgeTraffic(new Rng(9), lowEnd);
    const vehGlow = { value: 0.6 };
    const vehMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.2, envMap: world.envTex, envMapIntensity: 0.55 });
    vehMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = vehGlow;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGlow;\nattribute float aTint;\nvarying float vGlow;")
        .replace("#include <color_vertex>", "#include <color_vertex>\nvColor.xyz = mix(color.xyz, vColor.xyz, aTint);")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uGlow;\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uGlow;");
    };
    vehMat.customProgramCacheKey = () => "vehicles";
    const vehicles = new BatchedMesh(
      cars.length + 2 * nb + nCanoe + bridges.cars.length,
      geos.reduce((s, g) => s + g.attributes.position.count, 0),
      0,
      vehMat,
    );
    const geoIds = geos.map((g) => vehicles.addGeometry(g));
    for (const g of geos) g.dispose();
    const c = new Color();
    const addCar = (kind: number, r: Rng) => {
      const id = vehicles.addInstance(geoIds[kind]);
      // the trucks in their stainless steel, the vans in delivery liveries, the rest from the street's palette
      const hex = kind === 4 ? r.pick([0xc3c8ce, 0xaab0b7, 0x2b2f36]) : kind === 3 ? r.pick([0xffffff, 0xf2f3f5, 0x2563eb, 0xf59e0b, 0x0f766e]) : r.pick(CAR_COLOURS);
      vehicles.setColorAt(id, c.setHex(hex));
      return id;
    };
    const carIds = cars.map((car) => addCar(car.kind, rng));
    const busIds = data.traffic.buses.map(() => [vehicles.addInstance(geoIds[BUS_F]), vehicles.addInstance(geoIds[BUS_R])]);
    for (const [f, r] of busIds) {
      vehicles.setColorAt(f, c.setHex(0xffffff));
      vehicles.setColorAt(r, c.setHex(0xffffff));
    }
    // (their paint from a draw of their own, so the boats below are where they always were)
    const paintRng = new Rng(13);
    const bridgeIds = bridges.cars.map((car) => addCar(car.kind, paintRng));
    const canoeIds = Array.from({ length: nCanoe }, () => {
      const id = vehicles.addInstance(geoIds[CANOE]);
      vehicles.setColorAt(id, c.setHex(0x221a16));
      return id;
    });
    vehicles.castShadow = !lowEnd;
    vehicles.frustumCulled = false;
    vehicles.sortObjects = false;
    // the boats' lamps, unlit
    const lightMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DoubleSide });

    // people: painted billboards facing the camera every frame, all in one mesh, each instance's figure a cell of the
    // people's atlas (textures.ts), as wide as its figure is
    const quad = new PlaneGeometry(0.55, 1.1);
    quad.translate(0, 0.55, 0);
    const np = data.people.length;
    const peopleMesh = new InstancedMesh(quad, mats.people, Math.max(1, np));
    peopleMesh.count = np;
    quad.setAttribute("aCell", new InstancedBufferAttribute(Float32Array.from(data.people.map((h) => h.v)), 1));

    // boats: the SeaBus's hull (scaled down, False Creek's ferries), sailboats and motor yachts, one instanced mesh per
    // kind, each boat its instance in its kind's; the docks in one mesh
    const boatMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: 2 });
    const perKind = [0, 0, 0, 0];
    const boatIds = harbour.hulls.map((h) => perKind[h.kind]++);
    const boatMeshes = [seabus(), sailboat(), yacht()].map((g, kind) => {
      const m = new InstancedMesh(g, boatMat, Math.max(1, perKind[kind]));
      m.count = perKind[kind];
      m.frustumCulled = false;
      m.castShadow = !lowEnd;
      return m;
    });
    const docks = new Mesh(merged(harbour.boxes.map((d) => ({ geo: paint(new BoxGeometry(d.w, d.h, d.l), d.hex), position: [d.x, d.y, d.z], rotation: [0, d.yaw, 0] }))), boatMat);
    docks.receiveShadow = true;

    // a floatplane circling the harbour, clear of the vertiports and under the taxis (airways.ts): fuselage, wing and
    // tail, and floats, painted into one mesh
    const plane = new Group();
    plane.add(
      new Mesh(
        merged([
          { geo: paint(new CylinderGeometry(0.5, 0.35, 7, 10), 0xf4f4f4), rotation: [0, 0, Math.PI / 2] },
          { geo: paint(new BoxGeometry(1.6, 0.12, 10), 0xe8b23a), position: [0.2, 0.7, 0] },
          { geo: paint(new BoxGeometry(1.2, 1.2, 0.1), 0xe8b23a), position: [-3.2, 0.7, 0] },
          ...[-1.1, 1.1].map((z) => ({ geo: paint(new CylinderGeometry(0.25, 0.25, 5, 8), 0x9aa3ad), position: [0, -1.1, z] as [number, number, number], rotation: [0, 0, Math.PI / 2] as [number, number, number] })),
        ]),
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
      ),
    );
    const boatLamps = boatMeshes.map((b, kind) => {
      const m = new InstancedMesh(boatLights(kind), lightMat, Math.max(1, perKind[kind]));
      m.instanceMatrix = b.instanceMatrix;
      m.count = b.count;
      m.frustumCulled = false;
      return m;
    });
    return { vehicles, vehMat, vehGlow, carIds, busIds, bridges, bridgeIds, canoeIds, peopleMesh, harbour, boatIds, boatMeshes, boatLamps, boatMat, lightMat, docks, plane };
  }, [data, mats, lowEnd, world.envTex]);

  // cars and people are too small to show in the water
  useEffect(() => skipInMirror(built.vehicles, built.peopleMesh), [built]);

  useDispose(built, (b) => {
    b.vehicles.dispose();
    b.vehMat.dispose();
    b.peopleMesh.geometry.dispose();
    b.peopleMesh.dispose();
    for (const m of [...b.boatMeshes, ...b.boatLamps]) {
      m.geometry.dispose();
      m.dispose();
    }
    b.lightMat.dispose();
    b.docks.geometry.dispose();
    b.plane.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const cam = state.camera.position;
    // the cars drive the real streets and stop at the lights (traffic.ts), on the scene's clock as the signals are
    data.traffic.advance(dt, state.clock.elapsedTime);
    data.traffic.cars.forEach((c, i) => {
      p.set(c.x, c.y, c.z);
      q.setFromAxisAngle(UP, c.yaw);
      built.vehicles.setMatrixAt(built.carIds[i], m4.compose(p, q, one));
    });
    data.traffic.buses.forEach((c, i) => {
      const b = c.bus!;
      p.set(b.fx, c.y, b.fz);
      q.setFromAxisAngle(UP, b.fyaw);
      built.vehicles.setMatrixAt(built.busIds[i][0], m4.compose(p, q, one));
      p.set(b.rx, c.y, b.rz);
      q.setFromAxisAngle(UP, b.ryaw);
      built.vehicles.setMatrixAt(built.busIds[i][1], m4.compose(p, q, one));
    });
    built.bridges.advance(dt);
    built.bridges.cars.forEach((c, i) => {
      const id = built.bridgeIds[i];
      built.vehicles.setVisibleAt(id, c.s > 0);
      if (c.s <= 0) return;
      p.set(c.x, c.y, c.z);
      // up and down the decks' grades: nose up about its own width, then turned to its heading
      q.setFromEuler(e.set(0, c.yaw, c.pitch, "YXZ"));
      built.vehicles.setMatrixAt(id, m4.compose(p, q, sc.setScalar(c.s)));
    });
    for (const h of data.people) {
      if (h.move) {
        const pos = h.pos + h.dir * h.move * dt;
        if (pos < h.lo || pos > h.hi) h.dir = h.dir > 0 ? -1 : 1;
        else {
          h.pos = pos;
          h.x = h.ox + h.ux * pos;
          h.z = h.oz + h.uz * pos;
          h.y = groundAt(h.x, h.z);
        }
      }
      p.set(h.x, h.y, h.z);
      q.setFromAxisAngle(UP, Math.atan2(cam.x - h.x, cam.z - h.z));
      m4.compose(p, q, sc.set(PEOPLE_WIDTH[h.v] ?? 1, 1, 1));
      built.peopleMesh.setMatrixAt(h.k, m4);
    }
    built.peopleMesh.instanceMatrix.needsUpdate = true;
    const t = state.clock.elapsedTime;
    // the boats where the harbour has them (its bookings get a few milliseconds a frame, fewer on a phone), rocking a
    // little more under way than at their berths
    built.harbour.update(t, lowEnd ? 3 : 5);
    built.harbour.hulls.forEach((h, i) => {
      built.harbour.pose(i, t, bp);
      p.set(bp.x, SEA + 0.05 + Math.sin(t * 1.1 + built.harbour.bob(i)) * (0.04 + 0.02 * Math.min(1, bp.v)), bp.z);
      q.setFromAxisAngle(UP, bp.yaw);
      m4.compose(p, q, sc.setScalar(h.s));
      if (h.kind === 3) built.vehicles.setMatrixAt(built.canoeIds[built.boatIds[i]], m4);
      else built.boatMeshes[h.kind].setMatrixAt(built.boatIds[i], m4);
    });
    for (const m of built.boatMeshes) m.instanceMatrix.needsUpdate = true;
    // white hulls take the city's night tone rather than glowing in the dark; the lamps come on with the windows
    built.boatMat.color.copy(world.buildings.solid.color);
    const lit = world.buildings.solid.emissiveIntensity;
    built.lightMat.color.setScalar(1.6 * lit);
    built.vehMat.color.copy(world.buildings.solid.color);
    built.vehGlow.value = 0.5 + 1.8 * lit;
    for (const m of built.boatLamps) m.visible = lit > 0.02;
    const fp = floatplaneAt(t);
    built.plane.position.set(fp.x, fp.y, fp.z);
    built.plane.rotation.y = fp.ry;
    built.plane.rotation.z = 0.12;
  }, -40);

  return (
    <>
      <primitive object={built.vehicles} />
      <primitive object={built.peopleMesh} />
      {built.boatMeshes.map((m, i) => (
        <primitive key={`boat${i}`} object={m} />
      ))}
      {built.boatLamps.map((m, i) => (
        <primitive key={`lamp${i}`} object={m} />
      ))}
      <primitive object={built.docks} />
      <primitive object={built.plane} />
    </>
  );
}
