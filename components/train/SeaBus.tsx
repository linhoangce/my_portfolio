"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from "three";

import { SEA } from "./constants";
import { merged } from "./merge";
import { paint } from "./shapes";
import { groundAt } from "./terrain";
import { UP } from "./track";
import { boatLights, seabus } from "./vessels";
import { HUB_AT, HUB_GALLERY } from "./waterfrontHub";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/** The SeaBus's two berths: the end of the hub's gallery pier at Waterfront, and Lonsdale Quay on the North Shore. */
export const SEABUS_A: [number, number] = [HUB_AT.x + HUB_GALLERY.x, HUB_AT.z + HUB_GALLERY.z1 - 7];
export const SEABUS_B: [number, number] = [225, -271];
/** Seconds across, and at each berth. */
const CROSS = 46;
const DWELL = 16;

const label = (text: string, bg: string) => {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 160;
  const g = cv.getContext("2d");
  if (g) {
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 160);
    g.fillStyle = "#ffffff";
    g.font = "600 82px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 512, 84);
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
};

/**
 * The SeaBus across Burrard Inlet: two catamarans on the crossing between Waterfront (a floating berth at the end of
 * the hub's gallery pier) and Lonsdale Quay (its berth, and the quay's market hall on the shore under its name), each
 * waiting at a berth while the other crosses, double-ended as the real ones are. Their windows light after dark.
 */
export function SeaBus() {
  const world = useWorld();
  const built = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: DoubleSide });
    const lampMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DoubleSide });
    // the two boats in one instanced mesh, their lamps in another on the same matrices
    const boats = new InstancedMesh(seabus(), mat, 2);
    const lamps = new InstancedMesh(boatLights(0), lampMat, 2);
    lamps.instanceMatrix = boats.instanceMatrix;
    for (const m of [boats, lamps]) m.frustumCulled = false;
    // the berths: a floating pontoon each, with a covered gangway to the shore side
    const [ax, az] = SEABUS_A;
    const [bx, bz] = SEABUS_B;
    const yaw = Math.atan2(bx - ax, bz - az);
    const pontoon = (x: number, z: number, ry: number) =>
      merged([
        { geo: paint(new BoxGeometry(9, 0.8, 5).rotateY(ry).translate(x, SEA + 0.4, z), 0x8e949b) },
        { geo: paint(new BoxGeometry(9.4, 0.25, 5.4).rotateY(ry).translate(x, SEA + 3.6, z), 0xeef0f2) },
        ...[-3.8, 3.8].flatMap((dx) => [-2, 2].map((dz) => ({ geo: paint(new BoxGeometry(0.2, 3, 0.2).translate(dx, 0, dz).rotateY(ry).translate(x, SEA + 2.2, z), 0x3a3f46) }))),
      ]);
    // Lonsdale Quay: the market hall on the shore, a glass front under a pitched roof, and its apron
    const lx = 232;
    const lz = -291;
    const lg = groundAt(lx, lz);
    const ry = Math.atan2(bx - lx, bz - lz);
    const gang = Math.max(1, Math.hypot(bx - lx, bz - lz) - 13 - 2.5);
    const quay = merged([
      { geo: paint(new BoxGeometry(20, 6, 11).rotateY(ry).translate(lx, lg + 3, lz), 0xd9d2c4) },
      { geo: paint(new BoxGeometry(20.6, 0.4, 11.6).rotateY(ry).translate(lx, lg + 6.2, lz), 0x9c3b2e) },
      { geo: paint(new CylinderGeometry(0.01, 6.5, 2.6, 4, 1).rotateY(Math.PI / 4).scale(1.6, 1, 0.9).rotateY(ry).translate(lx, lg + 7.6, lz), 0x2f6e5d) },
      // the glass front onto the water, its mullions, and the market's awnings under it
      { geo: paint(new BoxGeometry(16, 3.8, 0.2).translate(0, 0, 5.6).rotateY(ry).translate(lx, lg + 2.3, lz), 0x7fa3b8) },
      ...[-6, -2, 2, 6].map((dx) => ({ geo: paint(new BoxGeometry(0.25, 3.8, 0.3).translate(dx, 0, 5.7).rotateY(ry).translate(lx, lg + 2.3, lz), 0xeef0f2) })),
      ...[-6.8, -2.8, 1.2, 5.2].map((dx, k) => ({ geo: paint(new BoxGeometry(2.6, 0.12, 1.4).rotateX(0.2).translate(dx + 1.3, 0, 6.4).rotateY(ry).translate(lx, lg + 1.6, lz), [0xc0392b, 0x2e8b57, 0xe0b020, 0x2d6cb0][k]) })),
      { geo: paint(new BoxGeometry(6, 0.6, 10).translate(0, 0, 8).rotateY(ry).translate(lx, lg + 0.3, lz), 0xa69a86) },
      // the covered gangway from the apron out to the berth
      { geo: paint(new BoxGeometry(2.6, 0.4, gang).translate(0, 0, 13 + gang / 2).rotateY(ry).translate(lx, SEA + 1.4, lz), 0x8e949b) },
      { geo: paint(new BoxGeometry(3.0, 0.2, gang).translate(0, 0, 13 + gang / 2).rotateY(ry).translate(lx, SEA + 4.2, lz), 0xeef0f2) },
    ]);
    const solid = new Mesh(merged([{ geo: pontoon(ax, az, yaw) }, { geo: pontoon(bx, bz, yaw) }, { geo: quay }]), new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    solid.receiveShadow = true;
    // the quay's name over its front
    const tex = label("Lonsdale Quay · SeaBus", "#9c3b2e");
    const sign = new Mesh(new PlaneGeometry(12, 1.9), new MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(lx + Math.sin(ry) * 5.75, lg + 5.2, lz + Math.cos(ry) * 5.75);
    sign.rotation.y = ry;
    const g = new Group();
    g.add(solid, sign, boats, lamps);
    return { g, boats, lamps, mat, lampMat, solid, sign, tex, yaw };
  }, []);

  useEffect(() => skipInMirror(built.boats, built.lamps), [built]);
  useEffect(
    () => () => {
      for (const m of [built.boats, built.lamps, built.solid, built.sign]) m.geometry.dispose();
      built.mat.dispose();
      built.lampMat.dispose();
      built.tex.dispose();
    },
    [built],
  );

  const pose = useMemo(() => ({ m4: new Matrix4(), q: new Quaternion(), p: new Vector3(), one: new Vector3(1, 1, 1) }), []);
  useFrame(({ clock }) => {
    const [ax, az] = SEABUS_A;
    const [bx, bz] = SEABUS_B;
    const cycle = 2 * (CROSS + DWELL);
    for (let k = 0; k < 2; k++) {
      // the second sails as the first arrives: one at each berth, then crossing the other way
      const T = (clock.elapsedTime + k * (CROSS + DWELL)) % cycle;
      const ease = (v: number) => v * v * (3 - 2 * v);
      const u = T < DWELL ? 0 : T < DWELL + CROSS ? ease((T - DWELL) / CROSS) : T < 2 * DWELL + CROSS ? 1 : 1 - ease((T - 2 * DWELL - CROSS) / CROSS);
      // a gentle arc east of the straight line, so the two never meet head on
      const bow = Math.sin(u * Math.PI) * (T < DWELL + CROSS ? 18 : -18);
      const x = ax + (bx - ax) * u + Math.cos(built.yaw) * bow;
      const z = az + (bz - az) * u - Math.sin(built.yaw) * bow;
      pose.p.set(x, SEA + 0.05 + Math.sin(clock.elapsedTime * 0.8 + k) * 0.05, z);
      built.boats.setMatrixAt(k, pose.m4.compose(pose.p, pose.q.setFromAxisAngle(UP, built.yaw), pose.one));
    }
    built.boats.instanceMatrix.needsUpdate = true;
    // white hulls take the city's night tone; the windows and running lights come on after dark
    built.mat.color.copy(world.buildings.solid.color);
    built.lampMat.color.setScalar(1.6 * world.buildings.solid.emissiveIntensity);
  });

  return <primitive object={built.g} />;
}
