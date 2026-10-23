"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  TubeGeometry,
  Vector3,
} from "three";

import { stations } from "@/data";

import { PLATFORM_LEN } from "./constants";
import { merged, type Part } from "./merge";
import { canvasTexture, paint } from "./shapes";
import { doorLabel, paintDoorLabel, signFonts } from "./textures";
import { accessParts } from "./accessKit";
import { inRailCut } from "./rail";
import { getCityData } from "./cityData";
import { stationAccess } from "./stationAccess";
import { isRoad } from "./roadNetwork";
import { frameAt, groundAt, makeFrame, stationS } from "./track";
import { useWorld } from "./world";

type Canopy = "grid" | "leaf" | "living" | "ribbed" | "hub";
/**
 * One of four canopies per stop: timber gridshell, glass leaf, solar roof with a planted fringe, ribbed arch; at
 * Commercial–Broadway the interchange's own great roof (Hub.tsx) instead.
 */
const CANOPY: Canopy[] = ["grid", "living", "ribbed", "leaf", "grid", "hub", "leaf", "ribbed", "grid", "living"];

/** A parabolic vault `w` wide rising `rise` above `base`, `len` long, as an open sheet. */
export function vault(w: number, rise: number, len: number, base: number, nu = 18, nz = 8): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      pos.push((u * w) / 2, base + rise * (1 - u * u), (j / nz - 0.5) * len);
      uv.push(i / nu, j / nz);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A rib following the same parabola, as a tube. */
export const rib = (w: number, rise: number, base: number, z: number, r: number): BufferGeometry => {
  const pts: Vector3[] = [];
  for (let k = 0; k <= 20; k++) {
    const u = (k / 20) * 2 - 1;
    pts.push(new Vector3((u * w) / 2, base + rise * (1 - u * u), z));
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), 24, r, 5, false);
};

const at = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

/** Photovoltaic modules from above: dark blue cells in a silver frame, two modules to a tile, about a unit each. */
function solarMaterial(envTex: MeshStandardMaterial["envMap"]): MeshStandardMaterial {
  const t = canvasTexture(64, 128, (g) => {
    g.fillStyle = "#c2c8cf";
    g.fillRect(0, 0, 64, 128);
    for (const y of [2, 66]) {
      g.fillStyle = "#1d2c4c";
      g.fillRect(2, y, 60, 60);
      g.fillStyle = "#2b3f66";
      for (let k = 10; k < 60; k += 10) {
        g.fillRect(2, y + k, 60, 1);
        g.fillRect(2 + k, y, 1, 60);
      }
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(6, 13);
  return new MeshStandardMaterial({ map: t, roughness: 0.28, metalness: 0.45, envMap: envTex, envMapIntensity: 0.8 });
}

/**
 * A helical vertical-axis wind turbine, 3.4 tall: three blades twisting a third of a turn round the axis between two
 * hubs, on a short mast. Built round the origin so it spins about y.
 */
function turbineBlades(): BufferGeometry {
  const parts: Part[] = [];
  for (let b = 0; b < 3; b++) {
    const pts: Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const a = (b / 3) * Math.PI * 2 + u * (Math.PI * 2) / 3;
      pts.push(new Vector3(Math.cos(a) * 0.75, 0.2 + u * 3, Math.sin(a) * 0.75));
    }
    parts.push({ geo: new TubeGeometry(new CatmullRomCurve3(pts), 16, 0.07, 4, false) });
    for (const y of [0.2, 3.2]) {
      const a = (b / 3) * Math.PI * 2 + (y > 1 ? (Math.PI * 2) / 3 : 0);
      parts.push({ geo: new BoxGeometry(0.75, 0.06, 0.08), position: at(Math.cos(a) * 0.37, y, Math.sin(a) * 0.37), rotation: [0, -a, 0] });
    }
  }
  return merged(parts);
}

/**
 * The 2100 station kit on both side platforms: white decks on slender columns, glowing edges, full-height platform
 * screen doors with a light line and the stop's name on their top rail, one of four canopies, lamp strips, a glass
 * lift with a bridge down to the street on the left, and a pair of small wind turbines beside it. No fascia board: the
 * station is the scene. One mesh per material per station (timber and planting painted into one), and every
 * station's turbine rotors in one instanced mesh.
 */
export function Stations() {
  const world = useWorld();
  const { mats, lowEnd } = world;

  const built = useMemo(() => {
    mats.edge.length = 0;
    const fonts = signFonts();
    const f = makeFrame();
    const labels: { canvas: HTMLCanvasElement; texture: { needsUpdate: boolean }; index: number }[] = [];
    const solarMat = solarMaterial(world.envTex);
    const turbineGeo = turbineBlades();
    // each rotor: where it stands in the world, its station's turn, the angle it starts at
    const rotors: { p: Vector3; q: Quaternion; a: number }[] = [];
    const wood = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const groups = stations.map((st, i) => {
      frameAt(stationS[i], f);
      const g = new Group();
      g.position.copy(f.p);
      const tH = f.t.clone().setY(0).normalize();
      g.lookAt(f.p.clone().add(tH));
      // local +x = left of the track, +z = ahead; platforms at x ±8.9, top at y 1.4
      const local = (x: number, z: number) => f.p.clone().addScaledVector(f.r, -x).addScaledVector(tH, z);
      const dropTo = (x: number, z: number) => {
        const w = local(x, z);
        return f.p.y - groundAt(w.x, w.z);
      };
      const white: Part[] = [];
      const edgeP: Part[] = [];
      const pane: Part[] = [];
      const steel: Part[] = [];
      const ribs: Part[] = [];
      const timber: Part[] = [];
      const green: Part[] = [];
      const solar: Part[] = [];
      const lamps: Part[] = [];
      const bannerA: Part[] = [];
      const bannerB: Part[] = [];
      for (const side of [1, -1]) {
        white.push({ geo: new BoxGeometry(5.2, 0.9, PLATFORM_LEN), position: at(side * 8.9, 0.95, 0) });
        for (const z of [-9, 0, 9]) {
          const d = dropTo(side * 10, z);
          // at Commercial–Broadway the platforms reach out over the Millennium's trench and Broadway runs under them:
          // no column on the trench's floor or in the street
          const w = local(side * 10, z);
          if (d > 1.2 && !inRailCut(w.x, w.z, 1) && !isRoad(w.x, w.z, 0.6)) white.push({ geo: new CylinderGeometry(0.35, 0.5, d + 0.5, 10), position: at(side * 10, (0.5 - d) / 2, z) });
        }
        // the edge light and the platform screen doors run the whole train's length
        const doors = PLATFORM_LEN - 1;
        edgeP.push({ geo: new BoxGeometry(0.16, 0.05, doors + 0.4), position: at(side * 6.38, 1.42, 0) });
        edgeP.push({ geo: new BoxGeometry(0.14, 0.1, doors), position: at(side * 6.62, 3.85, 0) });
        pane.push({ geo: new BoxGeometry(0.05, 2.3, doors), position: at(side * 6.62, 2.6, 0) });
        for (let z = -doors / 2; z <= doors / 2 + 0.01; z += doors / 12) steel.push({ geo: new BoxGeometry(0.12, 2.5, 0.12), position: at(side * 6.62, 2.65, z) });
        steel.push({ geo: new BoxGeometry(0.16, 0.22, doors + 0.2), position: at(side * 6.62, 4.0, 0) });
        // a banner pole at each platform end, flying the event's colours
        for (const z of [-(PLATFORM_LEN / 2 - 0.9), PLATFORM_LEN / 2 - 0.9]) {
          steel.push({ geo: new CylinderGeometry(0.07, 0.07, 4.6, 6), position: at(side * 11.1, 3.7, z) });
          steel.push({ geo: new BoxGeometry(0.06, 0.06, 1.1), position: at(side * 11.1, 5.85, z - Math.sign(z) * 0.55) });
          (z < 0 ? bannerA : bannerB).push({ geo: new PlaneGeometry(1.0, 2.2), position: at(side * 11.1, 4.7, z - Math.sign(z) * 0.6), rotation: [0, Math.PI / 2, 0] });
        }
      }
      // every roof covers the whole platform
      const PL = PLATFORM_LEN;
      const canopy = CANOPY[i % CANOPY.length];
      if (canopy === "grid") {
        // a timber gridshell vaulting both tracks, its feet on the platforms' outer edges
        pane.push({ geo: vault(23, 8.5, PL, 1.4) });
        for (let z = -PL / 2; z <= PL / 2 + 0.01; z += PL / 12) timber.push({ geo: rib(23, 8.5, 1.42, z, 0.14) });
        for (let u = -0.8; u <= 0.81; u += 0.2) timber.push({ geo: new BoxGeometry(0.22, 0.22, PL), position: at(u * 11.5, 1.4 + 8.5 * (1 - u * u) - 0.12, 0) });
        for (const side of [1, -1]) for (const z of [-8, 8]) lamps.push({ geo: new BoxGeometry(0.12, 0.08, 12), position: at(side * 8.6, 4.6, z) });
      } else if (canopy === "leaf") {
        // a glass leaf on white ribs, held up by branching columns
        pane.push({ geo: vault(25, 3.2, PL + 3, 6.4) });
        for (let z = -(PL + 1) / 2; z <= (PL + 1) / 2 + 0.01; z += (PL + 1) / 8) ribs.push({ geo: rib(25, 3.2, 6.38, z, 0.09) });
        for (const side of [1, -1]) {
          for (const z of [-10, 0, 10]) {
            // a slim trunk flaring into a disc just under the glass
            ribs.push({ geo: new CylinderGeometry(0.16, 0.24, 5, 8), position: at(side * 11.6, 3.9, z) });
            ribs.push({ geo: new CylinderGeometry(1.1, 0.2, 0.42, 12), position: at(side * 11.6, 6.6, z) });
          }
          lamps.push({ geo: new BoxGeometry(0.12, 0.08, 24), position: at(side * 9.6, 7.3, 0) });
        }
      } else if (canopy === "living") {
        // a solar roof over each platform on timber columns, open over the tracks: modules tilted a little toward the
        // sun, and a planted fringe along the outer edge, its ferns hanging over
        for (const side of [1, -1]) {
          timber.push({ geo: new BoxGeometry(6.8, 0.35, PL), position: at(side * 9.2, 6.4, 0) });
          solar.push({ geo: new BoxGeometry(5.6, 0.12, PL - 0.4), position: at(side * 8.75, 6.78, 0), rotation: [0, 0, side * 0.08] });
          green.push({ geo: new BoxGeometry(0.9, 0.5, PL - 0.4), position: at(side * 12.15, 6.8, 0) });
          for (let z = -(PL / 2 - 1.5); z <= PL / 2 - 1.49; z += (PL - 3) / 11) green.push({ geo: new BoxGeometry(0.5, 0.7, 1.4), position: at(side * 12.55, 6.3, z) });
          for (const z of [-10, 0, 10]) timber.push({ geo: new BoxGeometry(0.4, 4.9, 0.4), position: at(side * 11.2, 3.85, z) });
          lamps.push({ geo: new BoxGeometry(0.12, 0.08, 24), position: at(side * 7.4, 6.18, 0) });
        }
      } else if (canopy === "ribbed") {
        // a ribbed arch: white ribs over everything with a glass spine along the crown
        for (let z = -(PL / 2 - 0.5); z <= PL / 2 - 0.49; z += (PL - 1) / 15) ribs.push({ geo: rib(23, 8, 1.42, z, 0.17) });
        pane.push({ geo: new BoxGeometry(3, 0.06, PL), position: at(0, 9.3, 0) });
        ribs.push({ geo: new BoxGeometry(0.3, 0.3, PL), position: at(0, 9.45, 0) });
        for (const side of [1, -1]) lamps.push({ geo: new BoxGeometry(0.12, 0.08, 25), position: at(side * 8.2, 4.9, 0) });
      }
      // the ways in: fare gates at the ground, stairs and lifts up to each platform (stationAccess.ts)
      const access = stationAccess(lowEnd, getCityData(lowEnd).lots).filter((e) => e.i === i);
      const painted: Part[] = [];
      for (const e of access) {
        const p = accessParts(e, (x, z) => -dropTo(x, z));
        painted.push(...p.painted);
        pane.push(...p.glass);
        steel.push(...p.steel);
        edgeP.push(...p.glow);
      }
      // a pair of small wind turbines on masts beside the left platform, turning in the wind off the inlet, clear of
      // the ways in (the interchange has none)
      if (canopy !== "hub") {
        const lz = (() => {
          const w = local(15, -10);
          return inRailCut(w.x, w.z, 3) ? 10 : -10;
        })();
        const tower = access.find((e) => e.side > 0 && e.kind === "tower");
        for (const dz of [-3.2, 3.2]) {
          const tx = 15.2;
          const tz = (tower && Math.abs(tower.zTop - lz) < 7 ? -lz : lz) + dz;
          const gy = -dropTo(tx, tz);
          const w = local(tx, tz);
          if (isRoad(w.x, w.z, 1) || inRailCut(w.x, w.z, 1)) continue;
          steel.push({ geo: new CylinderGeometry(0.09, 0.14, 5.4 - gy, 6), position: at(tx, (5.4 + gy) / 2, tz) });
          g.updateMatrixWorld();
          rotors.push({ p: new Vector3(tx, 5.4, tz).applyMatrix4(g.matrixWorld), q: g.quaternion.clone(), a: i + dz });
        }
      }
      const edgeMat = new MeshStandardMaterial({ color: 0x1b1530, emissive: 0xa78bfa, emissiveIntensity: 0.7 });
      mats.edge.push(edgeMat);
      const meshes: [Part[], Material, boolean][] = [
        [white, mats.plat, true],
        [edgeP, edgeMat, false],
        [[...steel, ...ribs], mats.canopy, ribs.length > 0],
        [[...timber.map((p) => ({ ...p, geo: paint(p.geo, 0xb98a5a) })), ...green.map((p) => ({ ...p, geo: paint(p.geo, 0x5b8a45) })), ...painted], wood, true],
        [solar, solarMat, false],
        [lamps, mats.lamp, false],
        [bannerA, mats.bannerA, false],
        [bannerB, mats.bannerB, false],
        [pane, mats.pane, false],
      ];
      for (const [parts, mat, cast] of meshes) {
        if (!parts.length) continue;
        const m = new Mesh(merged(parts), mat);
        m.castShadow = cast && !lowEnd;
        m.receiveShadow = mat !== mats.pane && mat !== mats.lamp;
        g.add(m);
      }
      // the stop's name on the top rail of both screen-door rows, facing the track
      const label = doorLabel(st, fonts);
      labels.push({ canvas: label.canvas, texture: label.texture, index: i });
      const labelMesh = new Mesh(
        merged(
          // 1024 × 60 px, so 8 units wide is 0.47 tall: a strip just under the doors' light line
          [1, -1].map((side) => ({ geo: new PlaneGeometry(8, 0.47), position: at(side * 6.5, 3.58, side * -4), rotation: [0, -side * (Math.PI / 2), 0] as [number, number, number] })),
        ),
        new MeshBasicMaterial({ map: label.texture, toneMapped: false }),
      );
      g.add(labelMesh);
      return g;
    });
    const rotorMesh = new InstancedMesh(turbineGeo, mats.canopy, rotors.length);
    rotorMesh.frustumCulled = false;
    return { groups, labels, fonts, rotors, rotorMesh, turbineGeo, solarMat, wood };
  }, [mats, lowEnd, world]);

  // the turbines turn
  const spin = useMemo(() => ({ t: 0, m: new Matrix4(), q: new Quaternion(), turn: new Quaternion(), one: new Vector3(1, 1, 1), up: new Vector3(0, 1, 0) }), []);
  useFrame((_, dt) => {
    spin.t += Math.min(dt, 0.05) * 1.6;
    built.rotors.forEach((r, k) => {
      spin.q.copy(r.q).multiply(spin.turn.setFromAxisAngle(spin.up, r.a + spin.t));
      built.rotorMesh.setMatrixAt(k, spin.m.compose(r.p, spin.q, spin.one));
    });
    built.rotorMesh.instanceMatrix.needsUpdate = true;
  });

  // repaint the labels once the web fonts are in, so the names use the same faces as the page
  useEffect(() => {
    let alive = true;
    const { fonts } = built;
    document.fonts
      .load(`500 30px ${fonts.mono}`)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        for (const s of built.labels) {
          paintDoorLabel(s.canvas, stations[s.index], fonts);
          s.texture.needsUpdate = true;
        }
      });
    return () => {
      alive = false;
    };
  }, [built]);

  useEffect(
    () => () => {
      for (const g of built.groups) {
        g.traverse((o) => {
          if (o instanceof Mesh && o.geometry !== built.turbineGeo) o.geometry.dispose();
        });
      }
      built.turbineGeo.dispose();
      built.rotorMesh.dispose();
      built.wood.dispose();
      built.solarMat.map?.dispose();
      built.solarMat.dispose();
    },
    [built],
  );

  return (
    <>
      {built.groups.map((g, i) => (
        <primitive key={stations[i].id} object={g} />
      ))}
      <primitive object={built.rotorMesh} />
    </>
  );
}
