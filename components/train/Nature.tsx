"use client";

import { useFrame } from "@react-three/fiber";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";

import { SEA } from "./constants";
import { merged, type Part } from "./merge";
import { streetX, streetZ } from "./cityModel";
import { STREAM } from "./sites";
import { dotTexture } from "./textures";
import { DRONE_LIGHT_POINTS, quadcopter, quadcopterLights } from "./vessels";
import { useTrain } from "./store";
import { groundAt, inWater, sdfAt, surfaceAt } from "./terrain";
import { LEN, frameAt, makeFrame, UP } from "./track";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/** A ribbon draped on the drawn ground along a polyline, `half` wide either side of a line offset by `side`. */
function drape(pts: Vector3[], half: number, lift: number, stride: number, side = 0, n = 220): BufferGeometry {
  const path = new CatmullRomCurve3(pts, false, "centripetal");
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAt(i / n);
    const t = path.getTangentAt(i / n);
    const rx = -t.z;
    const rz = t.x;
    for (const s of [-1, 1]) {
      const x = p.x + rx * (side + s * half);
      const z = p.z + rz * (side + s * half);
      pos.push(x, surfaceAt(x, z, stride) + lift, z);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function cloudTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    for (let k = 0; k < 26; k++) {
      const x = 40 + Math.random() * 176;
      const y = 90 + Math.random() * 70;
      const r = 26 + Math.random() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Nature and the small infrastructure of 2100: the daylighted China Creek with its boardwalk, the BC Parkway path
 * under the guideway, birds over the parks and the creek, drones on lit lanes above the towers, orcas surfacing in
 * Burrard Inlet, seals off the shore and low cloud hanging on the North Shore.
 */
export function Nature() {
  const world = useWorld();
  const { lowEnd } = world;
  const { resolvedTheme } = useTheme();
  const night = useRef(true);
  night.current = resolvedTheme !== "light";

  const built = useMemo(() => {
    const group = new Group();
    // China Creek and its boardwalk
    const stride = lowEnd ? 2 : 1;
    const streamPts = STREAM.map(([x, z]) => new Vector3(x, 0, z));
    const water = new Mesh(drape(streamPts, 1.8, 0.2, stride), new MeshStandardMaterial({ color: 0x3f7393, roughness: 0.1, metalness: 0.3, envMap: world.envTex, envMapIntensity: 1 }));
    const walk = new Mesh(drape(streamPts, 0.9, 0.55, stride, 4.4), new MeshStandardMaterial({ color: 0xc89a63, roughness: 0.7 }));
    walk.receiveShadow = true;
    group.add(water, walk);
    // small concrete bridges carry each street over the creek, deck at bank level
    const bridgeMat = new MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 });
    const railMat = new MeshStandardMaterial({ color: 0xd8d4ca, roughness: 0.7 });
    const spanned = new Set<string>();
    const decks: Part[] = [];
    const rails: Part[] = [];
    for (let k = 0; k < STREAM.length - 1; k++) {
      const [ax, az] = STREAM[k];
      const [bx, bz] = STREAM[k + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let q = 0; q <= steps; q++) {
        const x = ax + ((bx - ax) * q) / steps;
        const z = az + ((bz - az) * q) / steps;
        const i = Math.round((x - streetX(0)) / 22);
        const j = Math.round((z - streetZ(0)) / 22);
        for (const [alongX, key, d] of [
          [false, `x${i}`, Math.abs(x - streetX(i))],
          [true, `z${j}`, Math.abs(z - streetZ(j))],
        ] as const) {
          if (d > 0.6 || spanned.has(key) || inWater(x, z)) continue;
          spanned.add(key);
          const px = alongX ? x : streetX(i);
          const pz = alongX ? streetZ(j) : z;
          const bank = Math.max(...[-6, 6].map((o) => surfaceAt(alongX ? px + o : px, alongX ? pz : pz + o, stride)));
          const w = 9;
          decks.push({ geo: new BoxGeometry(alongX ? w : 6.5, 0.5, alongX ? 6.5 : w), position: [px, bank + 0.05, pz] });
          for (const side of [-3.1, 3.1]) rails.push({ geo: new BoxGeometry(alongX ? w : 0.15, 0.7, alongX ? 0.15 : w), position: [alongX ? px : px + side, bank + 0.65, alongX ? pz + side : pz] });
        }
      }
    }
    if (decks.length) {
      const deckMesh = new Mesh(merged(decks), bridgeMat);
      deckMesh.receiveShadow = true;
      group.add(deckMesh, new Mesh(merged(rails), railMat));
    }
    // the BC Parkway under the guideway, in dry runs, merged into one mesh
    const f = makeFrame();
    let run: Vector3[] = [];
    const paths: Part[] = [];
    const flush = () => {
      if (run.length > 4) paths.push({ geo: drape(run, 1.5, 0.12, stride, 0, run.length * 2) });
      run = [];
    };
    for (let s = 0; s < LEN; s += 6) {
      frameAt(s, f);
      const ok = !inWater(f.p.x, f.p.z) && f.p.y - groundAt(f.p.x, f.p.z) > 4;
      if (ok) run.push(new Vector3(f.p.x, 0, f.p.z));
      else flush();
    }
    flush();
    if (paths.length) {
      const parkway = new Mesh(merged(paths), new MeshStandardMaterial({ color: 0xbdb9ae, roughness: 0.9 }));
      parkway.receiveShadow = true;
      group.add(parkway);
    }
    // birds: flapping Vs circling the parks, the creek and the inlet
    const vg = new BufferGeometry();
    vg.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, -0.9, 0.25, -0.2, -0.2, 0, 0.15, 0, 0, 0, 0.2, 0, 0.15, 0.9, 0.25, -0.2]), 3));
    vg.computeVertexNormals();
    const BN = lowEnd ? 36 : 72;
    const birds = new InstancedMesh(vg, new MeshStandardMaterial({ color: 0x2b2f36, roughness: 1, side: 2 }), BN);
    birds.frustumCulled = false;
    const birdData = Array.from({ length: BN }, (_, i) => {
      const centres = [[400, 374], [860, 790], [80, 175], [-300, -200], [0, -120], [248, 253]];
      const [cx, cz] = centres[i % centres.length];
      return { cx, cz, r: 20 + Math.random() * 50, h: 30 + Math.random() * 30, sp: (0.15 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * Math.PI * 2, scale: i % 9 === 0 ? 2.4 : 1 };
    });
    // drones on lanes over the towers and along the line
    const DN = lowEnd ? 30 : 90;
    // quadcopters: a vertex-coloured frame and, as a second mesh, their lights (red to port, green to starboard), on
    // day and night like real drones; a few pixels per light as points too, so a drone reads from any distance, with
    // a white strobe flashing on top
    const drones = new InstancedMesh(quadcopter(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }), DN);
    drones.frustumCulled = false;
    const droneMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const droneLights = new InstancedMesh(quadcopterLights(), droneMat, DN);
    droneLights.frustumCulled = false;
    const NP = DRONE_LIGHT_POINTS.length;
    const dotGeo = new BufferGeometry();
    dotGeo.setAttribute("position", new BufferAttribute(new Float32Array(DN * NP * 3), 3));
    const dotCols = new Float32Array(DN * NP * 3);
    dotGeo.setAttribute("color", new BufferAttribute(dotCols, 3));
    const dotMat = new PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false, toneMapped: false });
    const droneDots = new Points(dotGeo, dotMat);
    droneDots.frustumCulled = false;
    const droneData = Array.from({ length: DN }, (_, i) => {
      const lane = i % 5;
      const centres = [[-60, 50, 70], [-120, 80, 95], [60, 140, 60], [340, 300, 70], [640, 580, 80]];
      const [cx, cz, h] = centres[lane];
      return { cx, cz, h: h + (i % 3) * 6, r: 40 + (i % 4) * 18, ph: (i / DN) * Math.PI * 2 * 5, sp: 0.06 + (i % 4) * 0.015 };
    });
    // orcas surfacing in Burrard Inlet, seals off the shore
    const orcas: Group[] = [];
    const orcaHome: [number, number][] = [];
    for (let k = 0; k < 200 && orcas.length < 3; k++) {
      const x = -150 + Math.random() * 600;
      const z = -70 - Math.random() * 160;
      if (sdfAt(x, z) > -14) continue;
      const o = new Group();
      const body = new Mesh(new SphereGeometry(1, 16, 10), new MeshStandardMaterial({ color: 0x111316, roughness: 0.4 }));
      body.scale.set(1.1, 1.0, 3.2);
      const belly = new Mesh(new SphereGeometry(1, 12, 8), new MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.5 }));
      belly.scale.set(0.8, 0.5, 2);
      belly.position.set(0, -0.45, 0.4);
      const fin = new Mesh(new ConeGeometry(0.35, 1.6, 6), body.material);
      fin.position.set(0, 1.4, -0.3);
      o.add(body, belly, fin);
      orcas.push(o);
      orcaHome.push([x, z]);
      group.add(o);
    }
    const sealAt: Vector3[] = [];
    for (let k = 0; k < 400 && sealAt.length < (lowEnd ? 3 : 6); k++) {
      const x = -250 + Math.random() * 700;
      const z = -40 - Math.random() * 230;
      const sd = sdfAt(x, z);
      if (sd > -2 || sd < -6) continue;
      sealAt.push(new Vector3(x, SEA, z));
    }
    const sealGeo = new SphereGeometry(0.5, 10, 8);
    sealGeo.scale(0.8, 0.7, 1.6);
    const seals = new InstancedMesh(sealGeo, new MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.6 }), Math.max(1, sealAt.length));
    seals.count = sealAt.length;
    seals.frustumCulled = false;
    group.add(seals);
    // low cloud on the North Shore
    const cloudMat = new SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0.4, color: 0xffffff });
    const clouds: Sprite[] = [];
    for (let k = 0; k < (lowEnd ? 5 : 9); k++) {
      const s = new Sprite(cloudMat);
      s.position.set(-700 + k * 190 + Math.random() * 80, 120 + Math.random() * 90, -620 - Math.random() * 320);
      s.scale.set(220 + Math.random() * 120, 110, 1);
      clouds.push(s);
      group.add(s);
    }
    group.add(birds, drones, droneLights, droneDots);
    return { group, birds, birdData, drones, droneLights, droneData, droneMat, droneDots, dotCols, dotMat, orcas, orcaHome, seals, sealAt, cloudMat };
  }, [world, lowEnd]);

  useEffect(
    () => () => {
      built.group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
    [built],
  );

  const m4 = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const v = useMemo(() => new Vector3(), []);
  const s = useMemo(() => new Vector3(), []);
  const col = useMemo(() => new Color(), []);
  const e = useMemo(() => new Euler(), []);
  const dotPos = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const { birds, birdData, drones, droneData } = built;
    birdData.forEach((b, i) => {
      const a = b.ph + t * b.sp;
      v.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + i) * 2, b.cz + Math.sin(a) * b.r);
      q.setFromAxisAngle(UP, -a + (b.sp > 0 ? 0 : Math.PI));
      s.set(b.scale, b.scale * (0.6 + 0.6 * Math.abs(Math.sin(t * 6 + i))), b.scale);
      m4.compose(v, q, s);
      birds.setMatrixAt(i, m4);
    });
    birds.instanceMatrix.needsUpdate = true;
    const lit = night.current ? 1.4 : 0.9;
    droneData.forEach((d, i) => {
      const a = d.ph + t * d.sp;
      v.set(d.cx + Math.cos(a) * d.r, d.h + Math.sin(t + i) * 0.6, d.cz + Math.sin(a) * d.r * 0.7);
      // nose along the flight path, pitched a little forward as quadcopters fly
      e.set(0.14, Math.atan2(-Math.sin(a) * d.r, Math.cos(a) * d.r * 0.7), 0, "YXZ");
      m4.compose(v, q.setFromEuler(e), s.set(1, 1, 1));
      drones.setMatrixAt(i, m4);
      built.droneLights.setMatrixAt(i, m4);
      // the strobe: two quick flashes every 1.6 s, each drone on its own beat
      const beat = (t + i * 0.37) % 1.6;
      const flash = beat < 0.07 || (beat > 0.2 && beat < 0.27) ? 1 : 0;
      DRONE_LIGHT_POINTS.forEach(([lx, ly, lz, hex], k) => {
        const j = (i * DRONE_LIGHT_POINTS.length + k) * 3;
        dotPos.set(lx, ly, lz).applyMatrix4(m4);
        (built.droneDots.geometry.attributes.position as BufferAttribute).setXYZ(j / 3, dotPos.x, dotPos.y, dotPos.z);
        col.setHex(hex).multiplyScalar(k === 2 ? flash * 1.6 : lit);
        built.dotCols.set([col.r, col.g, col.b], j);
      });
    });
    drones.instanceMatrix.needsUpdate = true;
    built.droneLights.instanceMatrix.needsUpdate = true;
    built.droneDots.geometry.attributes.position.needsUpdate = true;
    built.droneDots.geometry.attributes.color.needsUpdate = true;
    built.droneMat.color.setScalar(night.current ? 2.2 : 1);
    built.dotMat.size = night.current ? 5 : 3.5;
    built.orcas.forEach((o, i) => {
      const [hx, hz] = built.orcaHome[i];
      const cyc = (t * 0.08 + i * 0.37) % 1;
      const surf = cyc < 0.25 ? Math.sin((cyc / 0.25) * Math.PI) : 0;
      o.position.set(hx + Math.sin(t * 0.05 + i) * 20, SEA - 1.6 + surf * 2.2, hz + cyc * 40);
      o.rotation.x = cyc < 0.25 ? Math.cos((cyc / 0.25) * Math.PI) * 0.5 : 0;
      o.visible = surf > 0.02;
    });
    built.sealAt.forEach((p, i) => {
      m4.makeTranslation(p.x, SEA + 0.05 + Math.sin(t * 1.2 + i) * 0.12, p.z);
      built.seals.setMatrixAt(i, m4);
    });
    built.seals.instanceMatrix.needsUpdate = true;
    const weather = useTrain.getState().weather;
    built.cloudMat.opacity = weather === "clear" ? 0.3 : weather === "overcast" ? 0.7 : 0.82;
    built.cloudMat.color.copy(col.setHex(night.current ? 0x556070 : 0xffffff));
  });

  useEffect(() => skipInMirror(built.birds, built.drones, built.droneLights, built.droneDots), [built]);
  return <primitive object={built.group} />;
}
