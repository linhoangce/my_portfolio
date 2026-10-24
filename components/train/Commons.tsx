"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
} from "three";

import { getCityData } from "./cityData";
import { FEATURES, type Feature, onFeature, PLACES, terraceSoffit } from "./commonsLayout";
import { CELL, COMMONS_BOX, commonsGround, PAVINGS } from "./commonsGround";
import { chessBoard, dragon, globeLamp, lanternString, laughingFigures, parkLamp, picnic, pingPong, playground, ringSculpture, stageWithSeats, steamLocomotive, waveArch } from "./commonsKit";
import { bench, foodTruck, pavilion, type Pieces, shopGlow, stall, umbrellaTable, warmLights } from "./pavilion";
import { canvasTexture, merge, paint } from "./shapes";
import { surfaceAt } from "./terrain";
import { ART_LIGHTS, placeLight, uplight } from "./uplight";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/** Each paving's colours: two base tones and an accent (brick's darker courses, granite's red bands, the boards' seams). */
const PAVE: Record<string, [number, number, number]> = {
  brick: [0x9a5b47, 0xa5654f, 0x84503f],
  granite: [0xb3a89a, 0xa39889, 0x9b3f33],
  boards: [0xa98260, 0x96704f, 0x7f5f42],
  stone: [0xd3ccbf, 0xc8c1b4, 0xb9b2a5],
};
/** A cell's tone in its paving: brick varies stone by stone, granite lies in large pavers with a red band every so
 * often, the boards run in planks. */
function paveTone(style: string, i: number, j: number): number {
  const [p, q, accent] = PAVE[style];
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  const u = n - Math.floor(n);
  if (style === "brick") return u < 0.12 ? accent : u < 0.56 ? p : q;
  if (style === "granite") return i % 12 === 0 || j % 12 === 0 ? accent : (Math.floor(i / 2) + Math.floor(j / 2)) % 2 ? p : q;
  if (style === "boards") return i % 3 === 0 ? accent : u < 0.5 ? p : q;
  return (i + j) % 2 ? p : q;
}
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (hex: number) => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const empty = (): Pieces => ({ solid: [], glass: [], warm: [] });
const fontOf = () => {
  const cs = getComputedStyle(document.documentElement);
  return { serif: `${cs.getPropertyValue("--font-serif").trim() || "Georgia"}, Georgia, serif`, sans: `${cs.getPropertyValue("--font-sans").trim() || "system-ui"}, system-ui, sans-serif` };
};

/** Victory Square's cenotaph: a granite obelisk on three steps, a wreath at its foot. */
function cenotaph(): Pieces {
  const out = empty();
  for (let k = 0; k < 3; k++) out.solid.push(paint(new BoxGeometry(3 - k * 0.7, 0.3, 3 - k * 0.7).translate(0, 0.15 + k * 0.3, 0), 0xb9b4aa));
  out.solid.push(paint(new CylinderGeometry(0.35, 0.6, 6, 4).rotateY(Math.PI / 4).translate(0, 3.9, 0), 0xc9c4ba), paint(new CylinderGeometry(0.01, 0.35, 0.6, 4).rotateY(Math.PI / 4).translate(0, 7.2, 0), 0xc9c4ba));
  out.solid.push(paint(new TorusGeometry(0.4, 0.12, 6, 14).translate(0, 1.4, 0.62), 0x2f6b3a));
  return out;
}

/** A bike-share dock: n bikes in their posts along x. */
function bikes(n: number): Pieces {
  const out = empty();
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * 1.1;
    out.solid.push(paint(new BoxGeometry(0.12, 0.9, 0.12).translate(x, 0.45, -0.6), 0x3a3f46), paint(new BoxGeometry(0.1, 0.45, 1.3).translate(x, 0.62, 0), 0x2f9e44));
    for (const z of [-0.5, 0.55]) out.solid.push(paint(new TorusGeometry(0.32, 0.05, 5, 12).rotateY(Math.PI / 2).translate(x, 0.34, z), 0x2a3039));
  }
  return out;
}

/** A pool with a stone rim (the jets are instanced apart). */
function pool(r: number): Pieces {
  const out = empty();
  out.solid.push(paint(new CylinderGeometry(r, r + 0.15, 0.45, 20).translate(0, 0.2, 0), 0xbab4a8), paint(new CylinderGeometry(r - 0.25, r - 0.25, 0.05, 20).translate(0, 0.43, 0), 0x5fa8d3));
  return out;
}

/** A tree's round planter (the tree layer plants the tree). */
function treePlanter(): Pieces {
  const out = empty();
  out.solid.push(paint(new CylinderGeometry(0.85, 0.95, 0.5, 10).translate(0, 0.2, 0), 0xa9a49a), paint(new CylinderGeometry(0.75, 0.75, 0.06, 10).translate(0, 0.46, 0), 0x5b4a3a));
  return out;
}

/**
 * Downtown's open places (commonsLayout.ts) on their ground (commonsGround.ts; Ground.tsx lays their lawns with the
 * parks'): the paving and paths and every feature in one painted mesh, its glass and its lights (the pavilions' names
 * among them).
 */
export function Commons() {
  const world = useWorld();
  const { lowEnd, mats } = world;
  const built = useMemo(() => {
    const stride = lowEnd ? 2 : 1;
    const ground = commonsGround(getCityData(lowEnd), lowEnd);
    const { nx, nz, cells } = ground;
    const { x0, z0 } = COMMONS_BOX;
    // the corners' heights, shared by the cells round them
    const corner = new Float32Array((nx + 1) * (nz + 1)).fill(NaN);
    const h = (i: number, j: number) => {
      const k = j * (nx + 1) + i;
      if (Number.isNaN(corner[k])) corner[k] = surfaceAt(x0 + i * CELL, z0 + j * CELL, stride);
      return corner[k];
    };
    // the paving: per cell, in its place's colours (the lawns are the ground's, with the parks')
    const pavePos: number[] = [];
    const paveCol: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const c = cells[j * nx + i];
        if (c >= 2) {
          const col = rgb(paveTone(PAVINGS[c - 2], i, j));
          const pt = (a: number, b: number) => [x0 + (i + a) * CELL, h(i + a, j + b) + 0.09, z0 + (j + b) * CELL];
          for (const [a, b] of [
            [0, 0],
            [0, 1],
            [1, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ]) {
            pavePos.push(...pt(a, b));
            paveCol.push(...col);
          }
        }
      }
    }
    const paveGeo = new BufferGeometry();
    paveGeo.setAttribute("position", new Float32BufferAttribute(pavePos, 3));
    paveGeo.setAttribute("color", new Float32BufferAttribute(paveCol, 3));
    paveGeo.setAttribute("uv", new Float32BufferAttribute(new Float32Array((pavePos.length / 3) * 2), 2));
    paveGeo.computeVertexNormals();

    const all: Pieces = { solid: [paveGeo], glass: [], warm: [] };
    const add = (p: Pieces, x: number, y: number, z: number, ry: number) => {
      for (const g of p.solid) all.solid.push(g.rotateY(ry).translate(x, y, z));
      for (const g of p.glass) all.glass.push(g.rotateY(ry).translate(x, y, z));
      for (const g of p.warm) all.warm.push(g.rotateY(ry).translate(x, y, z));
    };
    // a sculpture lit after dark from fixtures on the ground round it, their light baked into it (uplight.ts)
    const addLit = (kind: string, p: Pieces, x: number, y: number, z: number, ry: number) => {
      add(p, x, y, z, ry);
      const spec = ART_LIGHTS[kind];
      const { spots, parts } = placeLight(spec, x, y, z, ry, (px, pz) => surfaceAt(px, pz, stride) + 0.1, paint);
      uplight(p.solid, spots, spec.gain);
      all.solid.push(...parts);
    };
    // the paths across the lawns: draped ribbons of pale stone, benches and lamps along them
    const STONE = rgb(0xd9d2c3);
    for (const place of PLACES) {
      for (const path of place.paths) {
        const pos: number[] = [];
        for (let k = 1; k < path.pts.length; k++) {
          const [ax, az] = path.pts[k - 1];
          const [bx, bz] = path.pts[k];
          const L = Math.hypot(bx - ax, bz - az);
          const nxv = -(bz - az) / L;
          const nzv = (bx - ax) / L;
          const n = Math.max(1, Math.ceil(L / 0.8));
          const hw = path.w / 2;
          for (let s = 0; s < n; s++) {
            const t0 = s / n;
            const t1 = (s + 1) / n;
            const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0];
            const p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
            const q = (p: number[], side: number) => {
              const x = p[0] + nxv * hw * side;
              const z = p[1] + nzv * hw * side;
              return [x, surfaceAt(x, z, stride) + 0.12, z];
            };
            const [l0, r0, l1, r1] = [q(p0, 1), q(p0, -1), q(p1, 1), q(p1, -1)];
            // wound to face up
            pos.push(...l0, ...l1, ...r0, ...r0, ...l1, ...r1);
          }
          // a bench every nine along it on alternate sides, a lamp every eighteen
          for (let s = 4.5; s < L - 2; s += 9) {
            const side = Math.round(s / 9) % 2 ? 1 : -1;
            const x = ax + ((bx - ax) * s) / L + nxv * (hw + 1.1) * side;
            const z = az + ((bz - az) * s) / L + nzv * (hw + 1.1) * side;
            if (onFeature(x, z, 1) || !ground.covered(x, z)) continue;
            const b = empty();
            bench(b, 0, 0, 0, 0);
            add(b, x, surfaceAt(x, z, stride), z, Math.atan2(-nxv * side, -nzv * side));
            if (Math.round(s / 9) % 2 === 0) {
              const lx = ax + ((bx - ax) * s) / L - nxv * (hw + 0.6) * side;
              const lz = az + ((bz - az) * s) / L - nzv * (hw + 0.6) * side;
              if (!onFeature(lx, lz, 0.5)) add(parkLamp(), lx, surfaceAt(lx, lz, stride), lz, 0);
            }
          }
        }
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setAttribute("color", new Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => STONE[k % 3]), 3));
        geo.setAttribute("uv", new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
        geo.computeVertexNormals();
        all.solid.push(geo);
      }
    }

    // the names over the pavilions and on the board: one atlas, a white strip at its foot that the lights' unmapped
    // corner reads, so they share one glowing material
    const signed = FEATURES.filter((f) => (f.kind === "pavilion" || f.kind === "board") && f.name);
    const CELLH = 128;
    const AH = CELLH * signed.length + 16;
    const fonts = fontOf();
    const atlas = canvasTexture(1024, AH, (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, CELLH * signed.length, 1024, 16);
      signed.forEach((f, k) => {
        const y = k * CELLH;
        g.fillStyle = f.kind === "board" ? "#1d2228" : ["#1f2a33", "#3a2a22", "#22332a"][k % 3];
        g.fillRect(0, y, 1024, CELLH);
        g.fillStyle = "#f6efe2";
        g.font = f.kind === "board" ? `500 44px ${fonts.sans}` : `500 66px ${fonts.serif}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(f.name ?? "", 512, y + CELLH / 2 + 4, 980);
      });
    });
    const signGeo = (k: number, w: number, hgt: number) => {
      const s = new PlaneGeometry(w, hgt);
      const uv = s.attributes.uv as BufferAttribute;
      const v0 = 1 - ((k + 1) * CELLH) / AH;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q), v0 + (uv.getY(q) * CELLH) / AH);
      return paint(s, 0xffffff);
    };

    // the features
    const jets: Vector3[] = [];
    const groundUnder = (f: Feature, hw: number, hd: number) => {
      const c = Math.cos(f.ry ?? 0);
      const s = Math.sin(f.ry ?? 0);
      let y = -Infinity;
      for (const [a, b] of [
        [-hw, -hd],
        [hw, -hd],
        [-hw, hd],
        [hw, hd],
        [0, 0],
      ])
        y = Math.max(y, surfaceAt(f.x + a * c + b * s, f.z - a * s + b * c, stride));
      return y;
    };
    for (const f of FEATURES) {
      const ry = f.ry ?? 0;
      const y = surfaceAt(f.x, f.z, stride);
      switch (f.kind) {
        case "laughing":
          addLit("laughing", laughingFigures(f.r ?? 8, Math.round(f.x)), f.x, groundUnder(f, 3.5, 2) - 0.05, f.z, ry);
          break;
        case "arch":
          addLit("arch", waveArch(f.r ?? 8), f.x, y, f.z, ry);
          break;
        case "playground":
          add(playground(), f.x, groundUnder(f, 4.5, 4) - 0.02, f.z, ry);
          break;
        case "locomotive":
          add(steamLocomotive(), f.x, groundUnder(f, 2.6, 9.4) - 0.1, f.z, ry);
          break;
        case "globeLamp":
          add(globeLamp(), f.x, y, f.z, ry);
          break;
        case "parkLamp":
          add(parkLamp(), f.x, y, f.z, ry);
          break;
        case "dragon":
          add(dragon(), f.x, y, f.z, ry);
          break;
        case "chess":
          add(chessBoard(), f.x, groundUnder(f, 4.6, 4.6) - 0.02, f.z, ry);
          break;
        case "pingpong":
          add(pingPong(), f.x, y, f.z, ry);
          break;
        case "stage":
          add(stageWithSeats(0), f.x, groundUnder(f, 3.6, 2.2) - 0.1, f.z, ry);
          break;
        case "ring":
          addLit("ring", ringSculpture(), f.x, y, f.z, ry);
          break;
        case "picnic":
          add(picnic(f.hex ?? 0xd2452f), f.x, y + 0.05, f.z, ry);
          break;
        case "stall":
          add(stall(f.hex ?? 0xe4572e, Math.round(f.x * 3)), f.x, y, f.z, ry);
          break;
        case "truck":
          add(foodTruck(f.hex ?? 0xf2b632), f.x, y, f.z, ry);
          break;
        case "seat": {
          const p = empty();
          umbrellaTable(p, 0, 0, 0, f.hex ?? 0xe8663a);
          add(p, f.x, y, f.z, ry);
          break;
        }
        case "bench": {
          const p = empty();
          bench(p, 0, 0, 0, 0);
          add(p, f.x, y, f.z, ry);
          break;
        }
        case "bikes":
          add(bikes(f.r ?? 6), f.x, y, f.z, ry);
          break;
        case "tree":
          add(treePlanter(), f.x, y, f.z, ry);
          break;
        case "cenotaph":
          addLit("cenotaph", cenotaph(), f.x, y, f.z, ry);
          break;
        case "fountain": {
          const r = f.r ?? 2;
          add(pool(r), f.x, y, f.z, 0);
          for (let k = 0; k < 8; k++) jets.push(new Vector3(f.x + Math.cos((k / 8) * Math.PI * 2) * r * 0.55, y + 0.45, f.z + Math.sin((k / 8) * Math.PI * 2) * r * 0.55));
          break;
        }
        case "board": {
          const p = empty();
          p.solid.push(paint(new BoxGeometry(0.12, 2.2, 0.12).translate(-1.15, 1.1, 0), 0x3a3f46), paint(new BoxGeometry(0.12, 2.2, 0.12).translate(1.15, 1.1, 0), 0x3a3f46), paint(new BoxGeometry(2.5, 0.75, 0.1).translate(0, 1.75, -0.04), 0x1d2228));
          p.warm.push(signGeo(signed.indexOf(f), 2.4, 0.3).translate(0, 1.75, 0.02));
          add(p, f.x, y, f.z, ry);
          break;
        }
        case "lanterns": {
          const [[ax, az], [bx, bz]] = f.ends ?? [
            [f.x, f.z],
            [f.x, f.z],
          ];
          const p = empty();
          const yy = terraceSoffit();
          lanternString(p, [ax, yy, az], [bx, yy, bz], 0.9);
          add(p, 0, 0, 0, 0);
          break;
        }
        case "pavilion": {
          const front = f.front ?? 3.4;
          const piece = pavilion({ w: f.w ?? 6, d: f.d ?? 4, front, umbrella: f.hex, roof: f.roof, well: (f.w ?? 6) > 7 });
          const s = piece.sign;
          piece.warm.push(signGeo(signed.indexOf(f), s.w, s.h).translate(s.x, s.y, s.z));
          // on the highest ground under its deck, which drops its skirt to the lower side
          add(piece, f.x, groundUnder(f, (f.w ?? 6) / 2 + 0.8, (f.d ?? 4) / 2 + front) - 0.02, f.z, ry);
          break;
        }
      }
    }
    // small and low: they take shadows but cast none (no shadow pass for them)
    const solid = new Mesh(merge(all.solid), shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), world));
    solid.receiveShadow = true;
    const glass = new Mesh(all.glass.length ? merge(all.glass) : new BufferGeometry(), mats.pane);
    const warm = new Mesh(merge(all.warm), warmLights(world, new MeshBasicMaterial({ map: atlas, vertexColors: true, toneMapped: false })));
    const jetMesh = new InstancedMesh(
      new CylinderGeometry(0.06, 0.14, 1, 6).translate(0, 0.5, 0),
      new MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7, roughness: 0.1, emissive: 0x88c8ff, emissiveIntensity: 0.3 }),
      Math.max(1, jets.length),
    );
    jetMesh.count = jets.length;
    return { solid, glass, warm, jetMesh, jets, atlas };
  }, [world, lowEnd, mats]);

  // the ground and what stands on it are too low and small to show in the water
  useEffect(() => skipInMirror(built.solid, built.glass, built.warm, built.jetMesh), [built]);
  useEffect(
    () => () => {
      for (const m of [built.solid, built.glass, built.warm, built.jetMesh]) m.geometry.dispose();
      (built.solid.material as MeshStandardMaterial).dispose();
      (built.warm.material as MeshBasicMaterial).dispose();
      (built.jetMesh.material as MeshStandardMaterial).dispose();
      built.atlas.dispose();
    },
    [built],
  );

  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3() }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    built.jets.forEach((p, k) => {
      const v = Math.max(0, Math.sin(t * 2.4 - k * 0.8));
      built.jetMesh.setMatrixAt(k, tmp.m.compose(p, tmp.q, tmp.s.set(1, 0.2 + 2.2 * v, 1)));
    });
    built.jetMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={built.solid} />
      <primitive object={built.glass} />
      <primitive object={built.warm} />
      <primitive object={built.jetMesh} />
    </>
  );
}
