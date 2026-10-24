"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import { merged } from "./merge";
import { shopGlow } from "./pavilion";
import { merge, paint } from "./shapes";
import { type Built, buildBCPlace, buildBridges, buildCanadaPlace, buildConvention, buildHarbourCentre, buildHarbourfront, buildRogersArena, buildScienceWorld, buildWaterfrontHub } from "./landmarkKit";
import { clearReflections } from "./reflectionSources";
import { LANDMARKS, type LandmarkKey, type PlacedLandmark } from "./sites";
import { groundAt, surfaceAt } from "./terrain";
import { ART_LIGHTS, placeLight, uplight } from "./uplight";
import { type World, useWorld } from "./world";

const SMALL = new Set<LandmarkKey>(["gate", "cauldron", "orca", "steamClock"]);

/** Sized against the train (one car ≈ 17 m), not the compressed street grid, so they read at the right scale from the guideway. */
function buildLandmark(l: PlacedLandmark, world: World): Built {
  const { events } = world;
  const g = new Group();
  const centre = new Vector3(l.px, 0, l.pz);
  const key: LandmarkKey = l.key;
  if (key === "harbourCentre") return buildHarbourCentre(world);
  if (key === "canadaPlace") return buildCanadaPlace(l, world);
  if (key === "scienceWorld") return buildScienceWorld(l, world);
  if (key === "bcPlace") return buildBCPlace(world, centre);
  if (key === "waterfrontHub") return buildWaterfrontHub(l, world);

  if (key === "convention") return buildConvention(world);
  if (key === "rogers") return buildRogersArena(world);
  if (key === "gate") {
    // Chinatown's Millennium Gate: red columns and beam, a gold panel, two green-tiled roofs, painted into one mesh
    const columns = [-3.4, 3.4].flatMap((sx) => [-0.7, 0.7].map((sz) => ({ geo: paint(new CylinderGeometry(0.34, 0.38, 6.4, 10), 0xb3261e), position: [sx, 3.2, sz] as [number, number, number] })));
    const gate = merged([
      ...columns,
      { geo: paint(new BoxGeometry(8.6, 0.6, 1.8), 0xb3261e), position: [0, 5.9, 0] },
      { geo: paint(new BoxGeometry(3.2, 1.3, 0.3), 0xd4a641), position: [0, 5.0, 0] },
      { geo: paint(new ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), 0x2f7d5a), position: [0, 6.9, 0], scale: [6.6, 1.4, 2.2] },
      { geo: paint(new ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), 0x2f7d5a), position: [0, 8.3, 0], scale: [4.4, 1.3, 1.8] },
    ]);
    g.add(new Mesh(gate, new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
    return { group: g };
  }
  // the plaza's sculptures are lit after dark from fixtures on the paving round them (uplight.ts), in their own mesh
  const stride = world.lowEnd ? 2 : 1;
  const foot = groundAt(l.px, l.pz);
  const litUp = (parts: BufferGeometry[]) => {
    const spec = ART_LIGHTS[key];
    const { spots, parts: fixtures } = placeLight(spec, 0, 0, 0, 0, (x, z) => surfaceAt(l.px + x, l.pz + z, stride) + 0.13 - foot, paint);
    uplight(parts, spots, spec.gain);
    return new Mesh(merge([...parts, ...fixtures]), shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), world));
  };
  if (key === "cauldron") {
    // the Olympic Cauldron: four leaning white columns and a flame that burns in the event's colours
    const cols = Array.from({ length: 4 }, (_, i) => {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      return { geo: paint(new BoxGeometry(0.7, 11, 0.9), 0xf2f3f5), position: [Math.cos(a) * 2.2, 5.2, Math.sin(a) * 2.2] as [number, number, number], rotation: [Math.sin(a) * 0.18, -a, -Math.cos(a) * 0.18] as [number, number, number] };
    });
    // the columns and the bowl in one mesh
    g.add(litUp([merged([...cols, { geo: paint(new CylinderGeometry(1.4, 0.9, 0.8, 16), 0xf2f3f5), position: [0, 9.9, 0] }])]));
    const flame = new Mesh(new ConeGeometry(1.1, 3.4, 10), events.glow);
    flame.position.y = 11.6;
    g.add(flame);
    return { group: g, animate: (t) => flame.scale.set(1, 0.85 + 0.25 * Math.sin(t * 6) * Math.sin(t * 2.3), 1) };
  }
  if (key === "orca") {
    // Douglas Coupland's Digital Orca: a breaching killer whale in black and white cubes, painted into one mesh
    const cubes: [number, number, number, boolean][] = [];
    for (let k = 0; k < 14; k++) {
      const t = k / 13;
      const y = 1 + Math.sin(t * Math.PI * 0.9) * 4.5;
      const zc = -3.5 + t * 7;
      const rad = 1.4 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.08));
      for (let a = -2; a <= 2; a++) for (let b = -1; b <= 1; b++) if (a * a + b * b * 2 <= rad * rad * 3) cubes.push([a * 0.5, y + b * 0.5, zc, b < 0 && Math.abs(a) < 2]);
    }
    cubes.push([0, 5.6, 0.4, false], [0, 6.1, 0.4, false]);
    g.add(litUp(cubes.map(([x, y, z, isWhite]) => paint(new BoxGeometry(0.48, 0.48, 0.48).translate(x, y, z), isWhite ? 0xf2f3f5 : 0x15171c))));
    return { group: g };
  }
  // the Gastown Steam Clock, puffing steam
  // the brick base, bronze body and roof painted into one mesh
  const bronze = new MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.5 });
  const base = new Mesh(
    merged([
      { geo: paint(new BoxGeometry(1.4, 2.4, 1.4), 0x8a4e3c), position: [0, 1.2, 0] },
      { geo: paint(new BoxGeometry(1.1, 2.2, 1.1), 0x6b5a3a), position: [0, 3.5, 0] },
      { geo: paint(new ConeGeometry(0.85, 1.2, 4).rotateY(Math.PI / 4), 0x6b5a3a), position: [0, 5.4, 0] },
    ]),
    bronze,
  );
  const faces = new Mesh(new BoxGeometry(1.15, 0.8, 1.15), new MeshStandardMaterial({ color: 0xf5efdc, emissive: 0xfff1c8, emissiveIntensity: 0.3 }));
  faces.position.y = 4.4;
  const puffs = [0, 1, 2].map(() => new Mesh(new SphereGeometry(0.35, 8, 6), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })));
  g.add(base, faces, ...puffs);
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

/** The landmarks and monuments at their placed spots (with the event-lit parts registered for Events.tsx) and the bridges. */
export function Landmarks() {
  const world = useWorld();
  const built = useMemo(
    () =>
      LANDMARKS.map((l) => {
        const b = buildLandmark(l, world);
        b.group.position.set(l.px, SMALL.has(l.key) ? groundAt(l.px, l.pz) : l.padY, l.pz);
        b.group.rotation.y = l.yaw ?? 0;
        return b;
      }),
    [world],
  );
  const bridges = useMemo(() => buildBridges(world), [world]);
  const harbourfront = useMemo(() => buildHarbourfront(world), [world]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const b of built) b.animate?.(t);
  });
  useEffect(
    () => () => {
      world.events.patterns.length = 0;
      world.events.followers.length = 0;
      clearReflections();
      for (const b of [...built, bridges, harbourfront]) {
        b.group.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
    },
    [world, built, bridges, harbourfront],
  );
  return (
    <>
      {built.map((b, i) => (
        <primitive key={LANDMARKS[i].key} object={b.group} />
      ))}
      <primitive object={bridges.group} />
      <primitive object={harbourfront.group} />
    </>
  );
}
