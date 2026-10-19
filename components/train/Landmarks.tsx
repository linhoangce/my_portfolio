"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";

import { canvasTexture, type P2, walls } from "./shapes";
import { type Built, buildBCPlace, buildCanadaPlace, buildHarbourCentre, buildScienceWorld } from "./landmarkKit";
import { LANDMARKS, type LandmarkKey, type PlacedLandmark } from "./sites";
import { groundAt } from "./terrain";
import { type World, useWorld } from "./world";

const m4 = new Matrix4();
const SMALL = new Set<LandmarkKey>(["gate", "cauldron", "orca", "steamClock"]);


const rectRing = (w: number, d: number): P2[] => [
  [-w / 2, -d / 2],
  [w / 2, -d / 2],
  [w / 2, d / 2],
  [-w / 2, d / 2],
];
/** Floor-to-ceiling glass with slim mullions and a spandrel at each floor. */
const curtainTexture = () =>
  canvasTexture(64, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, "#5d7790");
    grd.addColorStop(1, "#2b3b4d");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#cfd6dc";
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 2, 64);
    g.fillRect(0, 30, 64, 3);
  });

/** Sized against the train (one car ≈ 17 m), not the compressed street grid, so they read at the right scale from the guideway. */
function buildLandmark(l: PlacedLandmark, world: World): Built {
  const { events, lowEnd } = world;
  const g = new Group();
  const centre = new Vector3(l.px, 0, l.pz);
  const key: LandmarkKey = l.key;
  if (key === "harbourCentre") return buildHarbourCentre(world);
  if (key === "canadaPlace") return buildCanadaPlace(l, world);
  if (key === "scienceWorld") return buildScienceWorld(world, centre);
  if (key === "bcPlace") return buildBCPlace(world, centre);

  if (key === "convention") {
    // the Convention Centre West: glass halls under a six-acre living roof that arches gently from end to end
    const W = 36;
    const D = 26;
    const glass = new Mesh(
      walls(rectRing(W, D), -1.5, 8, { uPer: 3, vPer: 9.5, vFrom: -1.5 }),
      new MeshStandardMaterial({ map: curtainTexture(), roughness: 0.15, metalness: 0.4, envMap: world.envTex, envMapIntensity: 0.9 }),
    );
    const nx = lowEnd ? 10 : 18;
    const nz = lowEnd ? 8 : 14;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = -W / 2 - 1 + ((W + 2) * i) / nx;
        const z = -D / 2 - 1 + ((D + 2) * j) / nz;
        pos.push(x, 8.2 + 2.6 * (1 - (x / (W / 2 + 1)) ** 2) * (1 - 0.35 * (z / (D / 2 + 1)) ** 2), z);
        if (i < nx && j < nz) {
          const k = j * (nx + 1) + i;
          idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
        }
      }
    }
    const roofGeo = new BufferGeometry();
    roofGeo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    roofGeo.setIndex(idx);
    roofGeo.computeVertexNormals();
    const roof = new Mesh(roofGeo, new MeshStandardMaterial({ color: 0x6f9a55, roughness: 1, side: 2 }));
    const fascia = new Mesh(new BoxGeometry(W + 2.2, 0.5, D + 2.2), new MeshStandardMaterial({ color: 0xe9ebe8, roughness: 0.6 }));
    fascia.position.y = 8.1;
    roof.receiveShadow = true;
    g.add(glass, roof, fascia);
    return { group: g };
  }
  if (key === "rogers") {
    const bowl = new Mesh(new CylinderGeometry(14, 13, 8, 48), new MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.85 }));
    bowl.scale.set(1.35, 1, 1);
    bowl.position.y = 4;
    const roof = new Mesh(new SphereGeometry(14, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.7 }));
    roof.scale.set(1.35, 0.3, 1);
    roof.position.y = 8;
    const glow = new Mesh(new TorusGeometry(14.2, 0.2, 6, 64), events.glowB);
    glow.scale.set(1.35, 1, 1);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 8.1;
    g.add(bowl, roof, glow);
    return { group: g };
  }
  if (key === "gate") {
    // Chinatown's Millennium Gate: red columns, beams and two green-tiled roofs
    const red = new MeshStandardMaterial({ color: 0xb3261e, roughness: 0.55 });
    const gold = new MeshStandardMaterial({ color: 0xd4a641, roughness: 0.4, metalness: 0.5 });
    const tile = new MeshStandardMaterial({ color: 0x2f7d5a, roughness: 0.6 });
    for (const sx of [-3.4, 3.4]) {
      for (const sz of [-0.7, 0.7]) {
        const c = new Mesh(new CylinderGeometry(0.34, 0.38, 6.4, 10), red);
        c.position.set(sx, 3.2, sz);
        g.add(c);
      }
    }
    const beam = new Mesh(new BoxGeometry(8.6, 0.6, 1.8), red);
    beam.position.y = 5.9;
    const panel = new Mesh(new BoxGeometry(3.2, 1.3, 0.3), gold);
    panel.position.y = 5.0;
    const roofA = new Mesh(new ConeGeometry(1, 1, 4, 1), tile);
    roofA.rotation.y = Math.PI / 4;
    roofA.scale.set(6.6, 1.4, 2.2);
    roofA.position.y = 6.9;
    const roofB = roofA.clone();
    roofB.scale.set(4.4, 1.3, 1.8);
    roofB.position.y = 8.3;
    g.add(beam, panel, roofA, roofB);
    return { group: g };
  }
  if (key === "cauldron") {
    // the Olympic Cauldron: four leaning white columns and a flame that burns in the event's colours
    const white = new MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const col = new Mesh(new BoxGeometry(0.7, 11, 0.9), white);
      col.position.set(Math.cos(a) * 2.2, 5.2, Math.sin(a) * 2.2);
      col.rotation.set(Math.sin(a) * 0.18, -a, -Math.cos(a) * 0.18);
      g.add(col);
    }
    const flame = new Mesh(new ConeGeometry(1.1, 3.4, 10), events.glow);
    flame.position.y = 11.6;
    const bowl = new Mesh(new CylinderGeometry(1.4, 0.9, 0.8, 16), white);
    bowl.position.y = 9.9;
    g.add(flame, bowl);
    return { group: g, animate: (t) => flame.scale.set(1, 0.85 + 0.25 * Math.sin(t * 6) * Math.sin(t * 2.3), 1) };
  }
  if (key === "orca") {
    // Douglas Coupland's Digital Orca: a breaching killer whale in black and white cubes
    const black = new MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
    const white = new MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.6 });
    const cubes: [number, number, number, boolean][] = [];
    for (let k = 0; k < 14; k++) {
      const t = k / 13;
      const y = 1 + Math.sin(t * Math.PI * 0.9) * 4.5;
      const zc = -3.5 + t * 7;
      const rad = 1.4 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.08));
      for (let a = -2; a <= 2; a++) for (let b = -1; b <= 1; b++) if (a * a + b * b * 2 <= rad * rad * 3) cubes.push([a * 0.5, y + b * 0.5, zc, b < 0 && Math.abs(a) < 2]);
    }
    cubes.push([0, 5.6, 0.4, false], [0, 6.1, 0.4, false]);
    for (const [isWhite, mat] of [
      [false, black],
      [true, white],
    ] as const) {
      const list = cubes.filter((c) => c[3] === isWhite);
      const inst = new InstancedMesh(new BoxGeometry(0.48, 0.48, 0.48), mat, Math.max(1, list.length));
      list.forEach(([x, y, z], i) => {
        m4.makeTranslation(x, y, z);
        inst.setMatrixAt(i, m4);
      });
      g.add(inst);
    }
    return { group: g };
  }
  // the Gastown Steam Clock, puffing steam
  const brick = new MeshStandardMaterial({ color: 0x8a4e3c, roughness: 0.8 });
  const bronze = new MeshStandardMaterial({ color: 0x6b5a3a, metalness: 0.6, roughness: 0.4 });
  const base = new Mesh(new BoxGeometry(1.4, 2.4, 1.4), brick);
  base.position.y = 1.2;
  const body = new Mesh(new BoxGeometry(1.1, 2.2, 1.1), bronze);
  body.position.y = 3.5;
  const faces = new Mesh(new BoxGeometry(1.15, 0.8, 1.15), new MeshStandardMaterial({ color: 0xf5efdc, emissive: 0xfff1c8, emissiveIntensity: 0.3 }));
  faces.position.y = 4.4;
  const top = new Mesh(new ConeGeometry(0.85, 1.2, 4), bronze);
  top.rotation.y = Math.PI / 4;
  top.position.y = 5.4;
  const puffs = [0, 1, 2].map(() => new Mesh(new SphereGeometry(0.35, 8, 6), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })));
  g.add(base, body, faces, top, ...puffs);
  return {
    group: g,
    animate: (t) => {
      puffs.forEach((m, i) => {
        const u = (t * 0.4 + i / 3) % 1;
        m.position.set(Math.sin(i * 2 + t) * 0.3 * u, 6 + u * 3, 0);
        m.scale.setScalar(0.6 + u * 1.6);
        (m.material as MeshStandardMaterial).opacity = 0.55 * (1 - u);
      });
    },
  };
}

/** The landmarks and monuments at their placed spots, with the event-lit parts registered for Events.tsx. */
export function Landmarks() {
  const world = useWorld();
  const built = useMemo(
    () =>
      LANDMARKS.map((l) => {
        const b = buildLandmark(l, world);
        b.group.position.set(l.px, SMALL.has(l.key) ? groundAt(l.px, l.pz) : l.padY, l.pz);
        return b;
      }),
    [world],
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const b of built) b.animate?.(t);
  });
  useEffect(
    () => () => {
      world.events.patterns.length = 0;
      world.events.followers.length = 0;
      for (const b of built) {
        b.group.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
    },
    [world, built],
  );
  return (
    <>
      {built.map((b, i) => (
        <primitive key={LANDMARKS[i].key} object={b.group} />
      ))}
    </>
  );
}
