"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from "three";

import { SEA } from "./constants";
import { merged } from "./merge";
import { shopGlow } from "./pavilion";
import { SEABUS_A, SEABUS_B, SEABUS_YAW, seabusAt, type SeaBusPose } from "./seabusLine";
import { paint } from "./shapes";
import { groundAt } from "./terrain";
import { UP } from "./track";
import { boatLights, seabus } from "./vessels";
import { harbourVertiport, lonsdaleVertiport } from "./vertiports";
import { HUB_AT, HUB_DECK, HUB_GALLERY } from "./waterfrontHub";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/** Berths' names, one over the other on one canvas (each sign takes its row). */
const labels = (rows: [string, string][]) => {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 160 * rows.length;
  const g = cv.getContext("2d");
  if (g) {
    rows.forEach(([text, bg], k) => {
      g.fillStyle = bg;
      g.fillRect(0, k * 160, 1024, 160);
      g.fillStyle = "#ffffff";
      g.font = "600 82px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 512, k * 160 + 84);
    });
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
};
/** A sign's plane showing row k of n of the labels' canvas. */
const signPlane = (w: number, h: number, k: number, n: number) => {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (k + 1 - uv.getY(i)) / n);
  return g;
};

/**
 * The SeaBus across Burrard Inlet: two catamarans on the crossing between Waterfront (a floating berth at the end of
 * the hub's gallery pier) and Lonsdale Quay (its berth, and the quay's market hall on the shore under its name),
 * double-ended as the real ones are: they cross together, passing port to port, and lie nose to their floats between
 * crossings, on the timetable the harbour's other boats keep clear of (seabusLine.ts). Their windows light after dark.
 * Beside each berth, in the same mesh, an air taxi vertiport (vertiports.ts).
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
    const yaw = SEABUS_YAW;
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
    // Waterfront's terminal float: a broad pontoon under a white roof on posts, railed, glass at its sides, and a covered
    // gangway from the end of the hub's gallery
    const wf = (w: number, h: number, d: number, lat: number, y: number, along: number, hex: number) => ({
      geo: paint(new BoxGeometry(w, h, d).translate(lat, 0, along).rotateY(yaw).translate(ax, y, az), hex),
    });
    const terminal = merged([
      wf(14, 0.9, 8, 0, SEA + 0.45, 0, 0x8e949b),
      wf(14.6, 0.3, 8.6, 0, SEA + 4.3, 0, 0xeef0f2),
      wf(14.6, 0.5, 0.2, 0, SEA + 4.0, 4.2, 0x1f6fb2),
      ...[-6.6, -2.2, 2.2, 6.6].flatMap((lat) => [-3.6, 3.6].map((along) => wf(0.22, 3.4, 0.22, lat, SEA + 2.6, along, 0x3a3f46))),
      ...[-1, 1].map((sd) => wf(0.06, 2.4, 7.2, sd * 7, SEA + 2.2, 0, 0x9fc3d6)),
      ...[-1, 1].map((sd) => wf(13.6, 0.08, 0.08, 0, SEA + 1.95, sd * 3.9, 0xd9dcdf)),
      ...[-1, 1].map((sd) => wf(0.08, 0.08, 7.6, sd * 6.9, SEA + 1.95, 0, 0xd9dcdf)),
    ]);
    const gz0 = HUB_AT.z + HUB_GALLERY.z1;
    const walkLen = Math.max(1, gz0 - az - 3) + 1;
    const walkZ = (gz0 + az + 3) / 2;
    const walk = merged([
      { geo: paint(new BoxGeometry(2.8, 0.4, walkLen).translate(ax, SEA + 1.4, walkZ), 0x8e949b) },
      { geo: paint(new BoxGeometry(3.2, 0.2, walkLen).translate(ax, SEA + 4.0, walkZ), 0xeef0f2) },
      ...[-1, 1].map((sd) => ({ geo: paint(new BoxGeometry(0.06, 2.2, walkLen).translate(ax + sd * 1.45, SEA + 2.7, walkZ), 0x9fc3d6) })),
    ]);
    // and in the same mesh the air taxis' vertiports beside both berths (vertiports.ts), their pad lights, docks and
    // windsocks glowing after dark
    const vertiports = [harbourVertiport(HUB_AT.x + HUB_GALLERY.x + HUB_GALLERY.half + 0.2, HUB_DECK), lonsdaleVertiport()];
    const solidMat = shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), world);
    const solid = new Mesh(merged([{ geo: terminal }, { geo: walk }, { geo: pontoon(bx, bz, yaw) }, { geo: quay }, ...vertiports.map((geo) => ({ geo }))]), solidMat);
    solid.receiveShadow = true;
    // the quay's name over its front (Waterfront's goes with the West Coast Express's sign: SEABUS_SIGN)
    const tex = labels([["Lonsdale Quay · SeaBus", "#9c3b2e"]]);
    const sign = new Mesh(signPlane(12, 1.9, 0, 1).rotateY(ry).translate(lx + Math.sin(ry) * 5.75, lg + 5.2, lz + Math.cos(ry) * 5.75), new MeshBasicMaterial({ map: tex, toneMapped: false }));
    const g = new Group();
    g.add(solid, sign, boats, lamps);
    return { g, boats, lamps, mat, lampMat, solid, solidMat, sign, tex };
  }, [world]);

  useEffect(() => skipInMirror(built.boats, built.lamps), [built]);
  useEffect(
    () => () => {
      for (const m of [built.boats, built.lamps, built.solid, built.sign]) m.geometry.dispose();
      built.mat.dispose();
      built.solidMat.dispose();
      built.lampMat.dispose();
      built.tex.dispose();
    },
    [built],
  );

  const pose = useMemo(() => ({ m4: new Matrix4(), q: new Quaternion(), p: new Vector3(), one: new Vector3(1, 1, 1), at: { x: 0, z: 0, yaw: 0, v: 0 } as SeaBusPose }), []);
  useFrame(({ clock }) => {
    // each where its timetable has it (seabusLine.ts), which the harbour's other boats keep clear of
    for (let k = 0; k < 2; k++) {
      const at = seabusAt(clock.elapsedTime, k, pose.at);
      pose.p.set(at.x, SEA + 0.05 + Math.sin(clock.elapsedTime * 0.8 + k) * 0.05, at.z);
      built.boats.setMatrixAt(k, pose.m4.compose(pose.p, pose.q.setFromAxisAngle(UP, at.yaw), pose.one));
    }
    built.boats.instanceMatrix.needsUpdate = true;
    // white hulls take the city's night tone; the windows and running lights come on after dark
    built.mat.color.copy(world.buildings.solid.color);
    built.lampMat.color.setScalar(1.6 * world.buildings.solid.emissiveIntensity);
  });

  return <primitive object={built.g} />;
}
