"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
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
import { canvasTexture } from "./shapes";
import { doorLabel, paintDoorLabel, signFonts } from "./textures";
import { accessParts } from "./accessKit";
import { CANOPY, canopyParts, FIN, turbineBlades } from "./canopies";
import { inRailCut } from "./rail";
import { getCityData } from "./cityData";
import { acrossStation, bendAlong, bendGeometry, slimStation } from "./slim";
import { setBridges, stationAccess, TOWER } from "./stationAccess";
import { isRoad } from "./roadNetwork";
import { frameAt, groundAt, makeFrame, stationS } from "./track";
import { useWorld } from "./world";

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

/**
 * Photovoltaic modules from above: dark blue cells in a silver frame, two modules to a tile, a unit each (the roofs give
 * their UVs in modules, canopies.ts).
 */
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
  return new MeshStandardMaterial({ map: t, roughness: 0.28, metalness: 0.45, envMap: envTex, envMapIntensity: 0.8 });
}

/** The harbour sails' membrane: white fabric printed with a narrow band of thin-film cells every 1.5 units across. */
function membraneMaterial(): MeshStandardMaterial {
  const t = canvasTexture(64, 64, (g) => {
    g.fillStyle = "#f5f6f3";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#7d8fae";
    g.fillRect(27, 0, 10, 64);
    g.fillStyle = "#9aa9c3";
    for (let y = 4; y < 64; y += 8) g.fillRect(27, y, 10, 1);
  });
  return new MeshStandardMaterial({ map: t, roughness: 0.6, side: DoubleSide });
}

/** See-through solar glass: dark cells with clear glass between, the train showing through. */
function pvGlassMaterial(envTex: MeshStandardMaterial["envMap"]): MeshStandardMaterial {
  const t = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    for (const x of [3, 35]) {
      for (const y of [3, 35]) {
        g.fillStyle = "#1d2f52";
        g.fillRect(x, y, 26, 26);
        g.fillStyle = "#2f4670";
        g.fillRect(x, y + 12, 26, 1);
        g.fillRect(x + 12, y, 1, 26);
      }
    }
  });
  return new MeshStandardMaterial({ map: t, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide, roughness: 0.2, metalness: 0.4, envMap: envTex, envMapIntensity: 0.8 });
}

/**
 * The 2100 station kit on both side platforms: white decks on slender columns, glowing edges, full-height platform
 * screen doors with a light line and the stop's name on their top rail, each stop's own roof (canopies.ts), the ways
 * up, and a pair of small wind turbines beside the left platform. No fascia board: the station is the scene. One mesh
 * per material per station (timber and planting painted into one), every station's turbine rotors in one instanced
 * mesh and Joyce–Collingwood's louvre fins in another, turning to follow the sun.
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
    const membraneMat = membraneMaterial();
    const pvGlassMat = pvGlassMaterial(world.envTex);
    const lanternMat = new MeshStandardMaterial({ color: 0x3a0d08, emissive: 0xff4a26, emissiveIntensity: 1.3, roughness: 0.6 });
    const turbineGeo = turbineBlades();
    // each rotor: where it stands in the world, its station's turn, the angle it starts at
    const rotors: { p: Vector3; q: Quaternion; a: number }[] = [];
    // each louvre fin: its centre in the world, its station's turn and the way along the track
    const fins: { p: Vector3; q: Quaternion; t: Vector3 }[] = [];
    const wood = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const groups = stations.map((st, i) => {
      frameAt(stationS[i], f);
      const g = new Group();
      // local +x = left of the track, +z = ahead; platforms at x ±8.9, top at y 1.4; the frame bent along the track, so
      // on a curve the platforms keep their distance from the beams (slim.ts), everything built in it baked into place
      const bend = bendAlong((s, o) => frameAt(s, o), stationS[i]);
      const deckY = f.p.y;
      const local = (x: number, z: number) => {
        const [wx, wz] = bend.point(x, z);
        return new Vector3(wx, deckY, wz);
      };
      const place = (geo: BufferGeometry) => bendGeometry(geo, bend, deckY);
      const turnAt = (z: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), bend.heading(z));
      const dropTo = (x: number, z: number) => {
        const w = local(x, z);
        return f.p.y - groundAt(w.x, w.z);
      };
      const white: Part[] = [];
      const edgeP: Part[] = [];
      const pane: Part[] = [];
      const steel: Part[] = [];
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
      // the roof, its columns kept off the stairwells, the lifts, the towers' landings and a set's bridge
      const bridges = setBridges(i);
      const clear = (x: number, z: number, half: number) => {
        const side = x > 0 ? 1 : -1;
        const ax = Math.abs(x);
        for (const e of access) {
          if (e.side !== side) continue;
          if (e.kind === "tower") {
            if (ax + half > 10.2 && Math.abs(z - e.zTop) < TOWER.d / 2 + 0.6 + half) return false;
          } else if (e.kind === "end") {
            if (Math.abs(z - e.zTop) < 2.8 + half) return false;
          } else if (ax - half < 9.8) {
            const z0 = e.zTop - e.dir * 3.4;
            if ((z + half > Math.min(z0, e.zTop) && z - half < Math.max(z0, e.zTop)) || Math.abs(z - e.zLift) < 1.3 + half) return false;
          }
        }
        return !bridges.some((b) => b.side === side && ax + half > 10.2 && z + half > b.z0 - 0.6 && z - half < b.z1 + 0.6);
      };
      const roof = canopyParts(CANOPY[i % CANOPY.length], { PL: PLATFORM_LEN, lowEnd, clear });
      pane.push(...roof.pane);
      steel.push(...roof.steel);
      painted.push(...roof.painted);
      if (roof.fins.length) {
        for (const c of roof.fins) {
          const h = bend.heading(c.z);
          fins.push({ p: local(acrossStation(c.x), c.z).setY(deckY + c.y), q: turnAt(c.z), t: new Vector3(Math.sin(h), 0, Math.cos(h)) });
        }
      }
      // a pair of small wind turbines on masts beside the left platform, turning in the wind off the inlet, clear of
      // the ways in (the interchange has none)
      if (CANOPY[i % CANOPY.length] !== "hub") {
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
          rotors.push({ p: local(tx, tz).setY(deckY + 5.4), q: turnAt(tz), a: i + dz });
        }
      }
      const edgeMat = new MeshStandardMaterial({ color: 0x1b1530, emissive: 0xa78bfa, emissiveIntensity: 0.7 });
      mats.edge.push(edgeMat);
      const meshes: [Part[], Material, boolean][] = [
        [white, mats.plat, true],
        [edgeP, edgeMat, false],
        [steel, mats.canopy, true],
        [painted, wood, true],
        [roof.solar, solarMat, true],
        [roof.membrane, membraneMat, true],
        [roof.lamps, mats.lamp, false],
        [roof.lanterns, lanternMat, false],
        [bannerA, mats.bannerA, false],
        [bannerB, mats.bannerB, false],
        [roof.pvGlass, pvGlassMat, false],
        [pane, mats.pane, false],
      ];
      for (const [parts, mat, cast] of meshes) {
        if (!parts.length) continue;
        // drawn across the track as the slimmer guideway and trains (slim.ts)
        const m = new Mesh(place(slimStation(merged(parts))), mat);
        m.castShadow = cast && !lowEnd;
        m.receiveShadow = !([mats.pane, mats.lamp, lanternMat, pvGlassMat] as Material[]).includes(mat);
        g.add(m);
      }
      // the stop's name on the top rail of both screen-door rows, facing the track
      const label = doorLabel(st, fonts);
      labels.push({ canvas: label.canvas, texture: label.texture, index: i });
      const labelMesh = new Mesh(
        place(
          slimStation(
          merged(
          // 1024 × 60 px, so 8 units wide is 0.47 tall: a strip just under the doors' light line
              [1, -1].map((side) => ({ geo: new PlaneGeometry(8, 0.47), position: at(side * 6.5, 3.58, side * -4), rotation: [0, -side * (Math.PI / 2), 0] as [number, number, number] })),
            ),
          ),
        ),
        new MeshBasicMaterial({ map: label.texture, toneMapped: false }),
      );
      g.add(labelMesh);
      return g;
    });
    const rotorMesh = new InstancedMesh(turbineGeo, mats.canopy, rotors.length);
    rotorMesh.frustumCulled = false;
    const finGeo = new BoxGeometry(FIN.len, FIN.t, FIN.w);
    const uv = finGeo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * FIN.len) / 1.2, (uv.getY(k) * FIN.w) / 1.2);
    const finMesh = new InstancedMesh(finGeo, pvGlassMat, fins.length);
    finMesh.frustumCulled = false;
    return { groups, labels, fonts, rotors, rotorMesh, turbineGeo, fins, finMesh, finGeo, solarMat, membraneMat, pvGlassMat, lanternMat, wood };
  }, [mats, lowEnd, world]);

  // the turbines turn; the louvres' fins face the sun across the track by day and lie flat at night
  const spin = useMemo(() => ({ t: 0, m: new Matrix4(), q: new Quaternion(), turn: new Quaternion(), one: new Vector3(1, 1, 1), up: new Vector3(0, 1, 0), across: new Vector3(1, 0, 0) }), []);
  useFrame((_, dt) => {
    spin.t += Math.min(dt, 0.05) * 1.6;
    built.rotors.forEach((r, k) => {
      spin.q.copy(r.q).multiply(spin.turn.setFromAxisAngle(spin.up, r.a + spin.t));
      built.rotorMesh.setMatrixAt(k, spin.m.compose(r.p, spin.q, spin.one));
    });
    built.rotorMesh.instanceMatrix.needsUpdate = true;
    if (!built.fins.length) return;
    const sun = world.sunDir;
    const day = Math.min(1, Math.max(0, (sun.y - 0.02) * 6));
    built.fins.forEach((f, k) => {
      const tilt = day * Math.min(1, Math.max(-1, Math.atan2(sun.dot(f.t), Math.max(sun.y, 0.05))));
      spin.q.copy(f.q).multiply(spin.turn.setFromAxisAngle(spin.across, tilt));
      built.finMesh.setMatrixAt(k, spin.m.compose(f.p, spin.q, spin.one));
    });
    built.finMesh.instanceMatrix.needsUpdate = true;
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
      built.finGeo.dispose();
      built.finMesh.dispose();
      built.wood.dispose();
      for (const m of [built.solarMat, built.membraneMat, built.pvGlassMat, built.lanternMat]) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [built],
  );

  return (
    <>
      {built.groups.map((g, i) => (
        <primitive key={stations[i].id} object={g} />
      ))}
      <primitive object={built.rotorMesh} />
      {built.fins.length ? <primitive object={built.finMesh} /> : null}
    </>
  );
}
