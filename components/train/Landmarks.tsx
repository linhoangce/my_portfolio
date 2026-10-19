"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";

import { registerPattern } from "./eventLights";
import { LANDMARKS, type LandmarkKey, type PlacedLandmark } from "./sites";
import { groundAt } from "./terrain";
import { type World, useWorld } from "./world";

const UPV = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const q = new Quaternion();
const one = new Vector3(1, 1, 1);
const p = new Vector3();
const SMALL = new Set<LandmarkKey>(["gate", "cauldron", "orca", "steamClock"]);

type Built = { group: Group; animate?: (t: number) => void };

/** A sail: a triangle bulged outward along its height. */
function sailGeo(w: number, h: number, bulge: number): BufferGeometry {
  const rows = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const half = (w / 2) * (1 - v);
    for (const s of [-1, 0, 1]) pos.push(s * half, v * h, Math.sin(v * Math.PI) * bulge * (1 - Math.abs(s) * 0.6));
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 2; c++) {
      const a = r * 3 + c;
      idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Sized against the train (one car ≈ 17 m), not the compressed street grid, so they read at the right scale from the guideway. */
function buildLandmark(l: PlacedLandmark, world: World): Built {
  const { mats, events, lowEnd } = world;
  const g = new Group();
  const silver = new MeshStandardMaterial({ color: 0xc3ccd6, metalness: 0.75, roughness: 0.3, envMap: world.envTex, envMapIntensity: 0.9, flatShading: true });
  const led = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const darkGlass = new MeshStandardMaterial({ color: 0x223040, metalness: 0.4, roughness: 0.15, envMap: world.envTex, envMapIntensity: 0.9 });
  const centre = new Vector3(l.px, 0, l.pz);
  const key: LandmarkKey = l.key;

  if (key === "harbourCentre") {
    const shaft = new Mesh(new CylinderGeometry(5.5, 5.5, 44, 24), mats.landmark);
    shaft.position.y = 22;
    const pod = new Mesh(new CylinderGeometry(10, 8, 4, 32), mats.landmark);
    pod.position.y = 46;
    const ring = new Mesh(new TorusGeometry(10.1, 0.35, 8, 64), events.glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 46.4;
    const glassBand = new Mesh(new CylinderGeometry(9.6, 9.6, 1.6, 32, 1, true), darkGlass);
    glassBand.position.y = 46.5;
    const mast = new Mesh(new CylinderGeometry(0.3, 0.5, 8, 8), mats.mast);
    mast.position.y = 52;
    // the glass elevators riding the outside of the shaft
    const lifts = [0, 1].map((k) => {
      const m = new Mesh(new BoxGeometry(1.6, 2.2, 1.2), new MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd77a, emissiveIntensity: 0.6, roughness: 0.3 }));
      m.position.set(k ? 5.9 : -5.9, 10, 0);
      return m;
    });
    g.add(shaft, pod, ring, glassBand, mast, ...lifts);
    return {
      group: g,
      animate: (t) => {
        lifts[0].position.y = 4 + (Math.sin(t * 0.21) * 0.5 + 0.5) * 38;
        lifts[1].position.y = 4 + (Math.sin(t * 0.21 + 2.4) * 0.5 + 0.5) * 38;
      },
    };
  }
  if (key === "canadaPlace") {
    const pier = new Mesh(new BoxGeometry(28, 2.4, 80), mats.concrete);
    pier.position.set(0, 0.9, 0);
    const hall = new Mesh(new BoxGeometry(22, 5, 70), mats.concrete);
    hall.position.set(0, 4.5, 0);
    g.add(pier, hall);
    for (let i = 0; i < 5; i++) {
      const sail = new Mesh(sailGeo(15, 17, 2.2), mats.sail);
      sail.position.set(-1 + (i % 2) * 2, 7, -30 + i * 14);
      sail.rotation.y = Math.PI / 2;
      const up = new Mesh(new BoxGeometry(1.2, 0.3, 12), i % 2 ? events.glowB : events.glow);
      up.position.set(-4, 7.1, -30 + i * 14);
      g.add(sail, up);
    }
    // a docked electric sail-ship
    const hull = new Mesh(new BoxGeometry(9, 4, 58), mats.landmark);
    hull.position.set(21, 1.2, 0);
    const deck2 = new Mesh(new BoxGeometry(7.6, 6, 40), new MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.5 }));
    deck2.position.set(21, 6, -2);
    g.add(hull, deck2);
    for (const z of [-16, 0, 16]) {
      const wing = new Mesh(new BoxGeometry(0.6, 16, 9), new MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.4, metalness: 0.2 }));
      wing.position.set(21, 17, z);
      g.add(wing);
    }
    g.rotation.y = -0.45;
    return { group: g };
  }
  if (key === "convention") {
    const hall = new Mesh(new BoxGeometry(60, 9, 40), mats.concrete);
    hall.position.y = 4.5;
    const glassFront = new Mesh(new BoxGeometry(60.6, 5, 40.6), darkGlass);
    glassFront.position.y = 2.6;
    const lawn = new Mesh(new BoxGeometry(60.4, 0.8, 40.4), new MeshStandardMaterial({ color: 0x6a8f5a, roughness: 1 }));
    lawn.position.y = 9.3;
    g.add(hall, glassFront, lawn);
    return { group: g };
  }
  if (key === "bcPlace") {
    const R = 32;
    const bowl = new Mesh(new CylinderGeometry(R, R - 2.5, 11, 64, 1, true), new MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.9, side: 2 }));
    bowl.position.y = 5.5;
    const pitch = new Mesh(new CircleGeometry(R - 2.5, 64), new MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.3;
    const concourse = new Mesh(new CylinderGeometry(R + 1.2, R + 1.2, 1.4, 64), new MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.8 }));
    concourse.position.y = 11.5;
    const roofPts = [[0, 20.4], [6, 20.4], [12, 19.6], [20, 17.6], [27, 14.8], [31, 12.6], [R + 1.2, 12.2]].map(([r, y]) => new Vector2(r, y));
    const roof = new Mesh(new LatheGeometry(roofPts, 72), mats.dome);
    roof.castShadow = !lowEnd;
    const ring = new Mesh(new TorusGeometry(6.4, 0.5, 8, 48), mats.mast);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 20.6;
    const ribs = new InstancedMesh(new BoxGeometry(0.5, 11.5, 1.0), new MeshStandardMaterial({ color: 0xbfb9ad, roughness: 0.9 }), 64);
    const masts = new InstancedMesh(new CylinderGeometry(0.28, 0.5, 26, 8), new MeshStandardMaterial({ color: 0xf0f1f3, roughness: 0.6 }), 36);
    const cables = new InstancedMesh(new CylinderGeometry(0.07, 0.07, 1, 5), new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.5 }), 36);
    const tips = new InstancedMesh(new SphereGeometry(0.26, 8, 6), led, 36);
    const ledRing = new InstancedMesh(new BoxGeometry(2.9, 0.45, 0.35), led, 72);
    const dv = new Vector3();
    const tang = new Vector3();
    const ringPts: Vector3[] = [];
    const tipPts: Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      p.set(Math.cos(a) * (R + 0.3), 5.75, Math.sin(a) * (R + 0.3));
      q.setFromAxisAngle(UPV, -a);
      m4.compose(p, q, one);
      ribs.setMatrixAt(i, m4);
    }
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      p.set(Math.cos(a) * (R + 1.35), 12.45, Math.sin(a) * (R + 1.35));
      q.setFromAxisAngle(UPV, -a + Math.PI / 2);
      m4.compose(p, q, one);
      ledRing.setMatrixAt(i, m4);
      ledRing.setColorAt(i, new Color(0xffffff));
      ringPts.push(p.clone().add(centre));
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      p.set(cx * (R + 3.5), 12, cz * (R + 3.5));
      tang.set(-cz, 0, cx);
      q.setFromAxisAngle(tang, -0.16);
      m4.compose(p, q, one);
      masts.setMatrixAt(i, m4);
      const top = new Vector3(cx * (R + 5.6), 24.8, cz * (R + 5.6));
      const anchor = new Vector3(cx * 6.4, 20.6, cz * 6.4);
      m4.makeTranslation(top.x, top.y + 0.3, top.z);
      tips.setMatrixAt(i, m4);
      tips.setColorAt(i, new Color(0xffffff));
      tipPts.push(top.clone().add(centre));
      dv.subVectors(anchor, top);
      const L = dv.length();
      p.addVectors(top, anchor).multiplyScalar(0.5);
      q.setFromUnitVectors(UPV, dv.normalize());
      m4.compose(p, q, new Vector3(1, L, 1));
      cables.setMatrixAt(i, m4);
    }
    registerPattern(events, ledRing, "ring", ringPts, centre);
    registerPattern(events, tips, "nodes", tipPts, centre);
    g.add(bowl, pitch, concourse, roof, ring, ribs, masts, cables, tips, ledRing);
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
  if (key === "scienceWorld") {
    // the geodesic sphere with an LED node on every vertex, a lit band, a glass base ring and a 2100 halo
    const r = 11;
    const ball = new Mesh(new IcosahedronGeometry(r, 3), silver);
    ball.position.y = 13;
    ball.castShadow = !lowEnd;
    const ico = new IcosahedronGeometry(r + 0.12, 3);
    const pa = ico.attributes.position;
    const seen = new Set<string>();
    const verts: Vector3[] = [];
    for (let i = 0; i < pa.count; i++) {
      const k = `${pa.getX(i).toFixed(2)},${pa.getY(i).toFixed(2)},${pa.getZ(i).toFixed(2)}`;
      if (!seen.has(k)) {
        seen.add(k);
        verts.push(new Vector3(pa.getX(i), pa.getY(i) + 13, pa.getZ(i)));
      }
    }
    ico.dispose();
    const nodes = new InstancedMesh(new IcosahedronGeometry(0.2, 0), led, verts.length);
    verts.forEach((v, i) => {
      m4.makeTranslation(v.x, v.y, v.z);
      nodes.setMatrixAt(i, m4);
      nodes.setColorAt(i, new Color(0xffffff));
    });
    registerPattern(events, nodes, "nodes", verts.map((v) => v.clone().add(centre)), centre);
    const base = new Mesh(new CylinderGeometry(9.5, 10.5, 4.2, 40), darkGlass);
    base.position.y = 2.1;
    const roofRing = new Mesh(new CylinderGeometry(10.8, 10.8, 0.6, 40), mats.landmark);
    roofRing.position.y = 4.4;
    const band = new Mesh(new TorusGeometry(10.3, 0.22, 8, 64), events.glow);
    band.rotation.x = Math.PI / 2;
    band.position.y = 5.0;
    const halo = new Mesh(new TorusGeometry(14.5, 0.18, 6, 96), mats.landmark);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 16.5;
    const haloGlow = new Mesh(new TorusGeometry(14.5, 0.08, 6, 96), events.glowB);
    haloGlow.rotation.x = Math.PI / 2;
    haloGlow.position.y = 16.2;
    const struts = new InstancedMesh(new CylinderGeometry(0.06, 0.06, 1, 4), mats.mast, 12);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const top = new Vector3(Math.cos(a) * 14.5, 16.5, Math.sin(a) * 14.5);
      const bot = new Vector3(Math.cos(a) * 9.6, 21, Math.sin(a) * 9.6);
      const dir = bot.clone().sub(top);
      m4.compose(top.clone().add(bot).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(UPV, dir.clone().normalize()), new Vector3(1, dir.length(), 1));
      struts.setMatrixAt(i, m4);
    }
    const plaza = new Mesh(new CylinderGeometry(15.5, 16, 0.5, 48), mats.concrete);
    plaza.position.y = 0.05;
    plaza.receiveShadow = true;
    const cols = new InstancedMesh(new CylinderGeometry(0.35, 0.35, 4.2, 8), mats.landmark, 10);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      m4.makeTranslation(Math.cos(a) * 11.2, 2.1, Math.sin(a) * 11.2);
      cols.setMatrixAt(i, m4);
    }
    g.add(ball, nodes, base, roofRing, band, halo, haloGlow, struts, plaza, cols);
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
