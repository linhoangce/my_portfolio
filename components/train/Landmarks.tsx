"use client";

import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";

import { LANDMARKS, type LandmarkKey } from "./cityModel";
import { groundAt } from "./track";
import { type World, useWorld } from "./world";

/** Sized against the train (one car ≈ 17 m), not the compressed street grid, so they read at the right scale from the guideway. */
function buildLandmark(key: LandmarkKey, world: World): Group {
  const { mats } = world;
  const g = new Group();
  if (key === "harbourCentre") {
    const shaft = new Mesh(new CylinderGeometry(5.5, 5.5, 44, 24), mats.landmark);
    shaft.position.y = 22;
    const pod = new Mesh(new CylinderGeometry(10, 8, 4, 28), mats.landmark);
    pod.position.y = 46;
    const mast = new Mesh(new CylinderGeometry(0.3, 0.5, 8, 8), mats.mast);
    mast.position.y = 52;
    g.add(shaft, pod, mast);
  } else if (key === "canadaPlace") {
    const pier = new Mesh(new BoxGeometry(28, 2.4, 80), mats.concrete);
    pier.position.set(0, 0.9, 0);
    const hall = new Mesh(new BoxGeometry(22, 5, 70), mats.concrete);
    hall.position.set(0, 4.5, 0);
    g.add(pier, hall);
    for (let i = 0; i < 5; i++) {
      const sh = new Shape([new Vector2(0, 0), new Vector2(16, 0), new Vector2(7, 18)]);
      const sail = new Mesh(new ShapeGeometry(sh), mats.sail);
      sail.position.set(-8, 7, -32 + i * 14);
      g.add(sail);
    }
    g.rotation.y = -0.45;
  } else if (key === "convention") {
    const hall = new Mesh(new BoxGeometry(60, 9, 40), mats.concrete);
    hall.position.y = 4.5;
    const lawn = new Mesh(new BoxGeometry(60.4, 0.8, 40.4), new MeshStandardMaterial({ color: 0x6a8f5a, roughness: 1 }));
    lawn.position.y = 9.3;
    g.add(hall, lawn);
  } else if (key === "bcPlace") {
    // a 36-mast cable-stayed fabric roof over a concrete bowl
    const R = 32;
    const bowl = new Mesh(new CylinderGeometry(R, R - 2.5, 11, 64, 1, true), new MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.9, side: 2 }));
    bowl.position.y = 5.5;
    const pitch = new Mesh(new CircleGeometry(R - 2.5, 64), new MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.3;
    const concourse = new Mesh(new CylinderGeometry(R + 1.2, R + 1.2, 1.4, 64), new MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.8 }));
    concourse.position.y = 11.5;
    const roofPts = [
      [0, 20.4],
      [6, 20.4],
      [12, 19.6],
      [20, 17.6],
      [27, 14.8],
      [31, 12.6],
      [R + 1.2, 12.2],
    ].map(([r, y]) => new Vector2(r, y));
    const roof = new Mesh(new LatheGeometry(roofPts, 72), new MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.55, side: 2 }));
    const ring = new Mesh(new TorusGeometry(6.4, 0.5, 8, 48), mats.mast);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 20.6;
    const ribs = new InstancedMesh(new BoxGeometry(0.5, 11.5, 1.0), new MeshStandardMaterial({ color: 0xbfb9ad, roughness: 0.9 }), 64);
    const seams = new InstancedMesh(new BoxGeometry(0.16, 1, 0.12), new MeshStandardMaterial({ color: 0xc9ccd2 }), 36);
    const masts = new InstancedMesh(new CylinderGeometry(0.28, 0.5, 26, 8), new MeshStandardMaterial({ color: 0xf0f1f3, roughness: 0.6, metalness: 0.1 }), 36);
    const cables = new InstancedMesh(new CylinderGeometry(0.07, 0.07, 1, 5), new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.5 }), 36);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const one = new Vector3(1, 1, 1);
    const p = new Vector3();
    const up = new Vector3(0, 1, 0);
    const dv = new Vector3();
    const tang = new Vector3();
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      p.set(Math.cos(a) * (R + 0.3), 5.75, Math.sin(a) * (R + 0.3));
      q.setFromAxisAngle(up, -a);
      m4.compose(p, q, one);
      ribs.setMatrixAt(i, m4);
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      p.set(cx * (R + 3.5), 12, cz * (R + 3.5));
      tang.set(-cz, 0, cx);
      q.setFromAxisAngle(tang, -0.16);
      m4.compose(p, q, one);
      masts.setMatrixAt(i, m4); // leaning outward
      const top = new Vector3(cx * (R + 5.6), 24.8, cz * (R + 5.6));
      const anchor = new Vector3(cx * 6.4, 20.6, cz * 6.4);
      dv.subVectors(anchor, top);
      let L = dv.length();
      p.addVectors(top, anchor).multiplyScalar(0.5);
      q.setFromUnitVectors(up, dv.normalize());
      m4.compose(p, q, new Vector3(1, L, 1));
      cables.setMatrixAt(i, m4);
      const s0 = new Vector3(cx * 6.6, 20.3, cz * 6.6);
      const s1 = new Vector3(cx * (R + 1), 12.3, cz * (R + 1));
      dv.subVectors(s1, s0);
      L = dv.length();
      p.addVectors(s0, s1).multiplyScalar(0.5);
      q.setFromUnitVectors(up, dv.normalize());
      m4.compose(p, q, new Vector3(1, L, 1));
      seams.setMatrixAt(i, m4);
    }
    g.add(bowl, pitch, concourse, roof, ring, ribs, masts, cables, seams);
  } else if (key === "rogers") {
    const bowl = new Mesh(new CylinderGeometry(14, 13, 8, 48), new MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.85 }));
    bowl.scale.set(1.35, 1, 1);
    bowl.position.y = 4;
    const roof = new Mesh(new SphereGeometry(14, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.7 }));
    roof.scale.set(1.35, 0.3, 1);
    roof.position.y = 8;
    g.add(bowl, roof);
  } else {
    const ball = new Mesh(new IcosahedronGeometry(11, 3), mats.silver);
    ball.position.y = 12.5;
    const base = new Mesh(new CylinderGeometry(8, 9, 5, 28), mats.concrete);
    base.position.y = 2.5;
    g.add(ball, base);
  }
  return g;
}

/** Harbour Centre, Canada Place, the Convention Centre, BC Place, Rogers Arena and Science World at their mapped spots. */
export function Landmarks() {
  const world = useWorld();
  const groups = useMemo(
    () =>
      LANDMARKS.map((l) => {
        const g = buildLandmark(l.key, world);
        g.position.set(l.px, groundAt(l.px, l.pz), l.pz);
        return g;
      }),
    [world],
  );
  useEffect(
    () => () => {
      for (const g of groups) {
        g.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
    },
    [groups],
  );
  return (
    <>
      {groups.map((g, i) => (
        <primitive key={LANDMARKS[i].key} object={g} />
      ))}
    </>
  );
}
