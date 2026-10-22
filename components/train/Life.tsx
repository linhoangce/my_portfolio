"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { Rng } from "./cityModel";
import { getLifeData } from "./cityData";
import { PEOPLE_VARIANTS, SEA } from "./constants";
import { merged, type Part } from "./merge";
import { paint } from "./shapes";
import { sdfAt } from "./terrain";
import { groundAt, UP } from "./track";
import { boatLights, busSection, carLights, sailboat, seabus, yacht } from "./vessels";
import { SEABUS_A, SEABUS_B } from "./SeaBus";
import { inNoSail } from "./waterfrontHub";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

const CAR_COLOURS = [0xffffff, 0xe8e8e8, 0xc9ccd1, 0x2b2f36, 0x1f2a44, 0x8c1d1d, 0x3a5fa8, 0x6b7280, 0xd9d2c3, 0x111111, 0x9ca3af, 0x7f1d1d];

const m4 = new Matrix4();
const q = new Quaternion();
const one = new Vector3(1, 1, 1);
const p = new Vector3();
const sc = new Vector3();

/**
 * kind: 0 SeaBus (or, smaller, a False Creek ferry), 1 sailboat, 2 motor yacht. A moored boat keeps its heading (bow
 * along yaw) at scale s; a lane boat runs along False Creek at distance u, `side` units right of the lane.
 */
type Boat = { x: number; z: number; dir: 1 | -1; speed: number; kind: number; k: number; moored?: { yaw: number; s: number }; lane?: { u: number; s: number; side: number } };

/** kind: 0 ferry or SeaBus, 1 sailboat, 2 motor yacht; yaw (bow direction) and scale. */
type Mooring = [number, number, number, number, number];

/**
 * False Creek, moored and at anchor: marinas along both shores of the creek and the basin (a main float off the
 * shore, fingers out toward the water, a gangway from the seawall, boats in the slips), the dragon boat club's dock
 * beside Science World (boathouses, three dragon boats alongside, a gangway to the deck's pier), and boats lying at
 * anchor out on the water. Docks as painted parts; nothing is placed on land.
 */
function creekMoorings(rng: Rng): { docks: Part[]; boats: Mooring[] } {
  const docks: Part[] = [];
  const boats: Mooring[] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, yaw: number, hex: number) =>
    docks.push({ geo: paint(new BoxGeometry(w, h, l), hex), position: [x, y, z], rotation: [0, yaw, 0] });
  // a straight run from a to b, `w` wide, its top `top` above the sea
  const run = (ax: number, az: number, bx: number, bz: number, w: number, top: number, hex: number) =>
    box(w, 0.4, Math.hypot(bx - ax, bz - az), (ax + bx) / 2, SEA + top - 0.2, (az + bz) / 2, Math.atan2(bx - ax, bz - az), hex);
  const FLOAT = 0xd6d2c9;
  const wet = (x: number, z: number) => sdfAt(x, z) < -0.6;
  /** A marina along the shore from a to b: the float 4.5 out, fingers every 5.2, a boat in each slip. */
  const marina = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    const sx = (bx - ax) / L;
    const sz = (bz - az) / L;
    // out toward the water
    let nx = -sz;
    let nz = sx;
    if (sdfAt((ax + bx) / 2 + nx * 5, (az + bz) / 2 + nz * 5) > sdfAt((ax + bx) / 2 - nx * 5, (az + bz) / 2 - nz * 5)) {
      nx = -nx;
      nz = -nz;
    }
    const ox = ax + nx * 4.5;
    const oz = az + nz * 4.5;
    if (!wet(ox, oz) || !wet(ox + sx * L, oz + sz * L)) return;
    run(ox, oz, ox + sx * L, oz + sz * L, 1.2, 0.35, FLOAT);
    for (let t = 1; t < L; t += 5.2) if (wet(ox + sx * t + nx * 5, oz + sz * t + nz * 5)) run(ox + sx * t, oz + sz * t, ox + sx * t + nx * 5, oz + sz * t + nz * 5, 0.7, 0.32, FLOAT);
    run(ox + sx * L * 0.45 - nx * 4.4, oz + sz * L * 0.45 - nz * 4.4, ox + sx * L * 0.45, oz + sz * L * 0.45, 1, 0.9, 0x9aa3ad);
    const bowIn = Math.atan2(-nx, -nz);
    for (let t = 3.6; t < L - 0.5; t += 5.2) {
      const x = ox + sx * t + nx * 3;
      const z = oz + sz * t + nz * 3;
      if (!wet(x, z)) continue;
      const kind = rng.next() < 0.5 ? 1 : 2;
      boats.push([x, z, kind, bowIn + (rng.next() - 0.5) * 0.1, kind === 2 ? 0.45 : 0.55]);
    }
  };
  // below BC Place, off Yaletown (Quayside), off the Fairview shore (Spruce Harbour), on Granville Island's north
  // side, and off the Olympic Village
  marina(-47.6, 180.3, -27.9, 187);
  marina(-84, 172.4, -116, 159.6);
  marina(-96, 219.5, -128, 205.5);
  marina(-200, 168, -170, 169.5);
  marina(-14, 250.2, 14, 251.4);
  // and in Coal Harbour, off Harbour Green's north shore
  marina(-143, -84.2, -155.5, -87.4);
  // the dragon boat club: a float with four boathouses, the boats alongside on its open side
  const [ax, az, bx, bz] = [44, 232.5, 56, 230.5];
  run(ax, az, bx, bz, 1.8, 0.35, FLOAT);
  const ux = (bx - ax) / Math.hypot(bx - ax, bz - az);
  const uz = (bz - az) / Math.hypot(bx - ax, bz - az);
  const along = Math.atan2(ux, uz);
  for (const t of [1.6, 4.4, 7.2, 10]) {
    box(1.5, 1.3, 2.1, ax + ux * t, SEA + 0.35 + 0.65, az + uz * t, along, 0xf2f1ec);
    box(1.7, 0.18, 2.3, ax + ux * t, SEA + 1.4, az + uz * t, along, 0x2f5f8f);
  }
  ([0xc0392b, 0xe0b020, 0x2d6cb0] as const).forEach((hex, k) => box(0.75, 0.35, 5.6, ax + ux * (3 + k * 3.3) - uz * 1.5, SEA + 0.1, az + uz * (3 + k * 3.3) + ux * 1.5, along, hex));
  run(bx, bz, 60, 231.2, 1, 0.75, FLOAT);
  // at anchor, swung to the tide
  for (const [x, z] of [
    [24, 218],
    [-4, 230],
    [-30, 220],
    [-104, 196],
    [-150, 168],
    [-198, 126],
    [-224, 106],
  ] as const) {
    if (sdfAt(x, z) > -6) continue;
    const kind = rng.next() < 0.6 ? 1 : 2;
    boats.push([x, z, kind, rng.next() * Math.PI * 2, kind === 2 ? 0.5 : 0.6]);
  }
  return { docks, boats };
}

/**
 * The lane boats keep along False Creek, from the head of the basin past Science World, under the three bridges and
 * out into English Bay; each runs it end to end and back on its own side of the channel.
 */
const CREEK_LANE: [number, number][] = [
  [50, 214],
  [14, 232],
  [-28, 220],
  [-62, 208],
  [-92, 198],
  [-122, 187],
  [-148, 171],
  [-170, 152],
  [-192, 131],
  [-213, 111],
  [-236, 93],
  [-262, 74],
  [-290, 56],
];
const LANE_AT = CREEK_LANE.reduce<number[]>((acc, p, i) => {
  acc.push(i ? acc[i - 1] + Math.hypot(p[0] - CREEK_LANE[i - 1][0], p[1] - CREEK_LANE[i - 1][1]) : 0);
  return acc;
}, []);
const LANE_LEN = LANE_AT[LANE_AT.length - 1];
/** Point and unit tangent on the lane at distance u. */
function laneAt(u: number, out: { x: number; z: number; tx: number; tz: number }): void {
  let i = 1;
  while (i < LANE_AT.length - 1 && LANE_AT[i] < u) i++;
  const [ax, az] = CREEK_LANE[i - 1];
  const [bx, bz] = CREEK_LANE[i];
  const L = LANE_AT[i] - LANE_AT[i - 1];
  const f = Math.min(1, Math.max(0, (u - LANE_AT[i - 1]) / L));
  out.x = ax + (bx - ax) * f;
  out.z = az + (bz - az) * f;
  out.tx = (bx - ax) / L;
  out.tz = (bz - az) / L;
}
const lane = { x: 0, z: 0, tx: 0, tz: 0 };

/**
 * Traffic on the street grid, people on platforms and sidewalks, boats on the inlet and on False Creek (under way,
 * moored and at anchor), a floatplane over the harbour.
 */
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
    const body = new ExtrudeGeometry(prof, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
    body.translate(0, 0, -0.55);
    const glass = new BoxGeometry(0.95, 0.3, 1.16);
    glass.translate(-0.05, 0.74, 0);
    // the wheels as two dark axle blocks: at street distance they read the same for 24 triangles instead of 160
    const wheels = [-0.75, 0.75].map((x) => new BoxGeometry(0.38, 0.38, 1.2).translate(x, 0.19, 0));
    const n = data.traffic.cars.length;
    const carMesh = new InstancedMesh(body, mats.car, Math.max(1, n));
    const carTrim = new InstancedMesh(mergeGeometries([glass, ...wheels], false), mats.carTrim, Math.max(1, n));
    const c = new Color();
    data.traffic.cars.forEach((_, i) => carMesh.setColorAt(i, c.setHex(rng.pick(CAR_COLOURS))));
    carMesh.count = carTrim.count = n;
    carMesh.castShadow = !lowEnd;
    // head and tail lights after dark, riding on the bodies' own instance matrices
    const lightMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DoubleSide });
    const carLamps = new InstancedMesh(carLights(), lightMat, Math.max(1, n));
    carLamps.instanceMatrix = carMesh.instanceMatrix;
    carLamps.count = n;
    glass.dispose();
    for (const w of wheels) w.dispose();
    // the buses: a front and a rear section each, one instanced mesh per section; their signs, lamps and light line
    // glow by an attribute, brighter after dark
    const nb = data.traffic.buses.length;
    const busGlow = { value: 0.6 };
    const busMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.15, envMap: world.envTex, envMapIntensity: 0.4 });
    busMat.onBeforeCompile = (sh) => {
      sh.uniforms.uBusGlow = busGlow;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uBusGlow;\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uBusGlow;");
    };
    const busFront = new InstancedMesh(busSection(true), busMat, Math.max(1, nb));
    const busRear = new InstancedMesh(busSection(false), busMat, Math.max(1, nb));
    busFront.count = busRear.count = nb;
    for (const m of [busFront, busRear]) {
      m.castShadow = !lowEnd;
      m.frustumCulled = false;
    }

    // people: painted billboards, six variants, facing the camera every frame
    const quad = new PlaneGeometry(0.55, 1.1);
    quad.translate(0, 0.55, 0);
    const peopleMeshes = Array.from({ length: PEOPLE_VARIANTS }, (_, v) => {
      const m = new InstancedMesh(quad, mats.people[v], Math.max(1, data.counts[v]));
      m.count = data.counts[v];
      return m;
    });

    // boats on the inlet: the SeaBus, sailboats and motor yachts, one instanced mesh per kind
    const KINDS = 3;
    const boatMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: 2 });
    const boatMeshes = [seabus(), sailboat(), yacht()].map((g) => {
      const m = new InstancedMesh(g, boatMat, 40);
      m.frustumCulled = false;
      m.castShadow = !lowEnd;
      return m;
    });
    const boats: Boat[] = [];
    const perKind = new Array<number>(KINDS).fill(0);
    // boat lanes come from the real coastline: only spots well out in Burrard Inlet
    for (let tries = 0; boats.length < 8 && tries < 600; tries++) {
      const x = -150 + rng.next() * 700;
      const z = -60 - rng.next() * 200;
      // and off the SeaBus's crossing
      const [ax, az] = SEABUS_A;
      const [bx, bz] = SEABUS_B;
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
      const onCrossing = Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t) < 34;
      if (sdfAt(x, z) < -10 && sdfAt(x + 30, z) < -8 && sdfAt(x - 30, z) < -8 && !inNoSail(x, z) && !onCrossing) {
        const kind = [1, 2, 1, 2, 2, 1, 1, 2][boats.length];
        const speed = kind === 0 ? 6 : kind === 1 ? 2 + rng.next() : 4 + rng.next() * 2;
        boats.push({ x, z, dir: rng.next() < 0.5 ? 1 : -1, speed, kind, k: perKind[kind]++ });
      }
    }
    const moorings = creekMoorings(rng);
    for (const [x, z, kind, yaw, s] of moorings.boats) boats.push({ x, z, dir: 1, speed: 0, kind, k: perKind[kind]++, moored: { yaw, s } });
    // under way on False Creek: little ferries, sailboats and yachts, spread along the lane
    const LANE_KINDS = lowEnd ? [0, 1, 2, 0] : [0, 1, 2, 0, 1, 2, 0];
    LANE_KINDS.forEach((kind, k) => {
      const u = ((k + rng.next() * 0.5) / LANE_KINDS.length) * LANE_LEN;
      const speed = kind === 0 ? 4.5 : kind === 1 ? 2 + rng.next() : 3.5 + rng.next() * 2;
      boats.push({ x: 0, z: 0, dir: rng.next() < 0.5 ? 1 : -1, speed, kind, k: perKind[kind]++, lane: { u, s: kind === 0 ? 0.32 : kind === 1 ? 0.7 : 0.6, side: 3 + rng.next() * 3 } });
    });
    const docks = new Mesh(merged(moorings.docks), boatMat);
    docks.receiveShadow = true;

    // a floatplane circling the harbour: fuselage and floats, wing and tail, three meshes
    const plane = new Group();
    plane.add(
      new Mesh(merged([{ geo: new CylinderGeometry(0.5, 0.35, 7, 10), rotation: [0, 0, Math.PI / 2] }]), new MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 })),
      new Mesh(
        merged([
          { geo: new BoxGeometry(1.6, 0.12, 10), position: [0.2, 0.7, 0] },
          { geo: new BoxGeometry(1.2, 1.2, 0.1), position: [-3.2, 0.7, 0] },
        ]),
        new MeshStandardMaterial({ color: 0xe8b23a, roughness: 0.6 }),
      ),
      new Mesh(
        merged([-1.1, 1.1].map((z) => ({ geo: new CylinderGeometry(0.25, 0.25, 5, 8), position: [0, -1.1, z] as [number, number, number], rotation: [0, 0, Math.PI / 2] as [number, number, number] }))),
        new MeshStandardMaterial({ color: 0x9aa3ad }),
      ),
    );
    boatMeshes.forEach((m, kind) => (m.count = perKind[kind]));
    const boatLamps = boatMeshes.map((b, kind) => {
      const m = new InstancedMesh(boatLights(kind), lightMat, 40);
      m.instanceMatrix = b.instanceMatrix;
      m.count = b.count;
      m.frustumCulled = false;
      return m;
    });
    return { carMesh, carTrim, carLamps, busFront, busRear, busMat, busGlow, peopleMeshes, boats, boatMeshes, boatLamps, boatMat, lightMat, docks, plane, planeT: 0 };
  }, [data, mats, lowEnd, world.envTex]);

  // cars and people are too small and low to show in the water
  useEffect(() => skipInMirror(built.carMesh, built.carTrim, built.carLamps, built.busFront, built.busRear, ...built.peopleMeshes), [built]);

  useEffect(
    () => () => {
      built.carMesh.geometry.dispose();
      built.carTrim.geometry.dispose();
      for (const m of [built.busFront, built.busRear]) {
        m.geometry.dispose();
        m.dispose();
      }
      built.busMat.dispose();
      built.carMesh.dispose();
      built.carTrim.dispose();
      built.peopleMeshes[0].geometry.dispose();
      for (const m of built.peopleMeshes) m.dispose();
      for (const m of [...built.boatMeshes, ...built.boatLamps, built.carLamps]) {
        m.geometry.dispose();
        m.dispose();
      }
      built.lightMat.dispose();
      built.docks.geometry.dispose();
      built.plane.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
    [built],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const cam = state.camera.position;
    // the cars drive the real streets and stop at the lights (traffic.ts), on the scene's clock as the signals are
    data.traffic.advance(dt, state.clock.elapsedTime);
    data.traffic.cars.forEach((c, i) => {
      p.set(c.x, c.y, c.z);
      q.setFromAxisAngle(UP, c.yaw);
      m4.compose(p, q, one);
      built.carMesh.setMatrixAt(i, m4);
      built.carTrim.setMatrixAt(i, m4);
    });
    built.carMesh.instanceMatrix.needsUpdate = true;
    built.carTrim.instanceMatrix.needsUpdate = true;
    data.traffic.buses.forEach((c, i) => {
      const b = c.bus!;
      p.set(b.fx, c.y, b.fz);
      q.setFromAxisAngle(UP, b.fyaw);
      built.busFront.setMatrixAt(i, m4.compose(p, q, one));
      p.set(b.rx, c.y, b.rz);
      q.setFromAxisAngle(UP, b.ryaw);
      built.busRear.setMatrixAt(i, m4.compose(p, q, one));
    });
    built.busFront.instanceMatrix.needsUpdate = true;
    built.busRear.instanceMatrix.needsUpdate = true;
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
      m4.compose(p, q, one);
      built.peopleMeshes[h.v].setMatrixAt(h.k, m4);
    }
    for (const m of built.peopleMeshes) m.instanceMatrix.needsUpdate = true;
    const t = state.clock.elapsedTime;
    built.boats.forEach((b) => {
      if (b.moored) {
        p.set(b.x, SEA + 0.05 + Math.sin(t * 0.9 + b.x) * 0.04, b.z);
        q.setFromAxisAngle(UP, b.moored.yaw);
        m4.compose(p, q, sc.setScalar(b.moored.s));
        built.boatMeshes[b.kind].setMatrixAt(b.k, m4);
        return;
      }
      if (b.lane) {
        // end to end and back, keeping to the right of the lane
        b.lane.u += b.dir * b.speed * dt;
        if (b.lane.u < 0 || b.lane.u > LANE_LEN) {
          b.dir = b.dir > 0 ? -1 : 1;
          b.lane.u = Math.min(LANE_LEN, Math.max(0, b.lane.u));
        }
        laneAt(b.lane.u, lane);
        const fx = lane.tx * b.dir;
        const fz = lane.tz * b.dir;
        p.set(lane.x - fz * b.lane.side, SEA + 0.05 + Math.sin(t * 1.3 + b.lane.u) * 0.06, lane.z + fx * b.lane.side);
        q.setFromAxisAngle(UP, Math.atan2(fx, fz));
        m4.compose(p, q, sc.setScalar(b.lane.s));
        built.boatMeshes[b.kind].setMatrixAt(b.k, m4);
        return;
      }
      // turn around before the shore
      if (sdfAt(b.x + b.dir * 12, b.z) > -6 || inNoSail(b.x + b.dir * 12, b.z)) b.dir = b.dir > 0 ? -1 : 1;
      b.x += b.dir * b.speed * dt;
      p.set(b.x, SEA + 0.05 + Math.sin(t * 1.3 + b.z) * 0.08, b.z);
      // the hulls are built bow along +z; a quarter turn points them along the lane
      q.setFromAxisAngle(UP, b.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      m4.compose(p, q, one);
      built.boatMeshes[b.kind].setMatrixAt(b.k, m4);
    });
    for (const m of built.boatMeshes) m.instanceMatrix.needsUpdate = true;
    // white hulls take the city's night tone rather than glowing in the dark; the lamps come on with the windows
    built.boatMat.color.copy(world.buildings.solid.color);
    const lit = world.buildings.solid.emissiveIntensity;
    built.lightMat.color.setScalar(1.6 * lit);
    built.carLamps.visible = lit > 0.02;
    built.busMat.color.copy(world.buildings.solid.color);
    built.busGlow.value = 0.5 + 1.8 * lit;
    for (const m of built.boatLamps) m.visible = lit > 0.02;
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
      <primitive object={built.carLamps} />
      <primitive object={built.busFront} />
      <primitive object={built.busRear} />
      {built.peopleMeshes.map((m, v) => (
        <primitive key={`people${v}`} object={m} />
      ))}
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
