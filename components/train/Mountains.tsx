"use client";

import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from "three";

import { FAR_V, SEA, TERRAIN_V } from "./constants";
import { registerPattern } from "./eventLights";
import { buildLionsGate, narrowsLine } from "./lionsGate";
import { Extension } from "./Extension";
import { FarCity } from "./FarCity";
import { farDensity, farReach, farZone } from "./farCityModel";
import { merged } from "./merge";
import { useTrain } from "./store";
import { RASTER, sdfAt, SHORE_BOX } from "./terrain";
import { useWorld } from "./world";

type FarModule = typeof import("./terrainFar");

/**
 * The real backdrop from the far grid: North Vancouver rising to the North Shore range (Grouse, Seymour, Cypress),
 * Burnaby Mountain, the suburbs and the strait, coloured by height and slope with a summer and a winter snowline;
 * past the line's end the far city stands on it (FarCity). The city rectangle is lowered under the city mesh. Mount Baker stays a stylised cone on the south-east horizon.
 */
function buildFar(mod: FarModule, stride: number): { geometry: BufferGeometry; summer: BufferAttribute; winter: BufferAttribute; heightAt: (x: number, z: number) => number } {
  const g0 = mod.DEM_FAR;
  // the low-end budget takes every other far sample
  const g = { ...g0, step: g0.step * stride, nx: Math.floor((g0.nx - 1) / stride) + 1, nz: Math.floor((g0.nz - 1) / stride) + 1 };
  const bin = atob(mod.DEM_FAR_DATA);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const raw0 = new Uint16Array(u8.buffer);
  const raw = new Uint16Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) raw[j * g.nx + i] = raw0[j * stride * g0.nx + i * stride];
  const n = g.nx * g.nz;
  const pos = new Float32Array(n * 3);
  const metres = new Float32Array(n);
  const x1 = RASTER.x0 + (RASTER.nx - 1) * RASTER.step;
  const z1 = RASTER.z0 + (RASTER.nz - 1) * RASTER.step;
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      const x = g.x0 + i * g.step;
      const z = g.z0 + j * g.step;
      const m = raw[k] / g.scale - g.bias;
      metres[k] = m;
      // the city's vertical scale at its edge, easing to the gentler backdrop scale over 500 units
      const out = Math.hypot(Math.max(0, RASTER.x0 - x, x - x1), Math.max(0, RASTER.z0 - z, z - z1));
      const t = Math.min(1, out / 500);
      const v = TERRAIN_V + (FAR_V - TERRAIN_V) * t * t * (3 - 2 * t);
      let y = m <= 0.3 ? SEA - 5 : Math.max(0.3, m * v);
      const inside = x > RASTER.x0 + 4 && x < x1 - 4 && z > RASTER.z0 + 4 && z < z1 - 4;
      // well under the city's ground, which the rail trenches dig up to 8 below the DEM
      if (inside) y = Math.min(y, sdfAt(x, z) < 0 ? SEA - 5 : y) - 12;
      // the city ground is cut away at False Creek's shore, so nothing of this may show above the water there
      if (x > SHORE_BOX.x0 - g.step && x < SHORE_BOX.x1 + g.step && z > SHORE_BOX.z0 - g.step && z < SHORE_BOX.z1 + g.step) y = SEA - 8;
      pos.set([x, y, z], k * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < g.nz - 1; j++) {
    for (let i = 0; i < g.nx - 1; i++) {
      const a = j * g.nx + i;
      idx.push(a, a + g.nx, a + 1, a + 1, a + g.nx, a + g.nx + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const nrm = geometry.attributes.normal as BufferAttribute;
  const summer = new Float32Array(n * 3);
  const winter = new Float32Array(n * 3);
  const c = new Color();
  // the far city's ground: paved and gardened, greyer than the forest round it
  const reach = farReach(stride > 1);
  const urban = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const x = pos[k * 3];
    const z = pos[k * 3 + 2];
    if (metres[k] > 0.3 && farZone(x, z, reach)) urban[k] = 0.85 * farDensity(x, z, reach);
  }
  const URBAN = new Color(0.58, 0.59, 0.55);
  const paint = (out: Float32Array, k: number, snowLine: number) => {
    const m = metres[k];
    const slope = 1 - nrm.getY(k);
    if (m <= 0.3) c.setRGB(0.32, 0.4, 0.48);
    else {
      const forest = Math.min(1, Math.max(0, (m - 60) / 240));
      const rock = Math.min(1, Math.max(0, (slope - 0.25) / 0.3)) * Math.min(1, m / 700);
      const snow = Math.min(1, Math.max(0, (m - snowLine) / 160));
      c.setRGB(0.5 - 0.22 * forest, 0.52 - 0.12 * forest, 0.48 - 0.16 * forest);
      c.lerp(new Color(0.46, 0.45, 0.43), rock);
      c.lerp(new Color(0.93, 0.95, 0.98), snow);
    }
    if (urban[k] > 0) c.lerp(URBAN, urban[k]);
    out.set([c.r, c.g, c.b], k * 3);
  };
  for (let k = 0; k < n; k++) {
    paint(summer, k, 1050);
    paint(winter, k, 430);
  }
  const s = new BufferAttribute(summer, 3);
  const w = new BufferAttribute(winter, 3);
  geometry.setAttribute("color", s);
  // bilinear height on the far mesh (world units), for things standing on it beyond the city
  const heightAt = (x: number, z: number) => {
    const fx = Math.min(g.nx - 1.001, Math.max(0, (x - g.x0) / g.step));
    const fz = Math.min(g.nz - 1.001, Math.max(0, (z - g.z0) / g.step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * g.nx + i;
    const y = (kk: number) => pos[kk * 3 + 1];
    return (y(k) * (1 - u) + y(k + 1) * u) * (1 - v) + (y(k + g.nx) * (1 - u) + y(k + g.nx + 1) * u) * v;
  };
  return { geometry, summer: s, winter: w, heightAt };
}

/** A gondola from Brentwood up Burnaby Mountain to the university, on the real far terrain: pylons, cable, moving cabins. */
function buildGondola(heightAt: (x: number, z: number) => number): { group: Group; cabins: InstancedMesh; path: Vector3[] } {
  const a = new Vector3(900, 0, 240);
  const b = new Vector3(1530, 0, 85);
  const group = new Group();
  const n = 7;
  const tops: Vector3[] = [];
  const pylonMat = new MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.5, metalness: 0.3 });
  for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, i / (n - 1));
    const gy = heightAt(p.x, p.z);
    const h = 18;
    const pylon = new Mesh(new CylinderGeometry(0.6, 1.1, h, 8), pylonMat);
    pylon.position.set(p.x, gy + h / 2, p.z);
    group.add(pylon);
    tops.push(new Vector3(p.x, gy + h, p.z));
  }
  const path: Vector3[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < 12; k++) {
      const u = k / 12;
      path.push(tops[i].clone().lerp(tops[i + 1], u).add(new Vector3(0, -Math.sin(u * Math.PI) * 3, 0)));
    }
  }
  path.push(tops[n - 1].clone());
  const up = new Vector3(0, 1, 0);
  const cableMesh = new Mesh(
    merged(
      path.slice(0, -1).map((p0, i) => {
        const p1 = path[i + 1];
        const d = p1.clone().sub(p0);
        const L = d.length();
        d.normalize();
        // the rotation that takes +y onto the segment, as the Euler angles merged() expects
        const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(up, d));
        return { geo: new CylinderGeometry(0.12, 0.12, L, 4), position: p0.clone().add(p1).multiplyScalar(0.5).toArray() as [number, number, number], rotation: [e.x, e.y, e.z] as [number, number, number] };
      }),
    ),
    new MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5 }),
  );
  group.add(cableMesh);
  const cabins = new InstancedMesh(new BoxGeometry(2.2, 2, 3), new MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, emissive: 0x7c5cff, emissiveIntensity: 0.3 }), 12);
  group.add(cabins);
  return { group, cabins, path };
}

export function Mountains() {
  const world = useWorld();
  const cabinM = useMemo(() => new Matrix4(), []);
  const [far, setFar] = useState<ReturnType<typeof buildFar> | null>(null);

  useEffect(() => {
    let alive = true;
    import("./terrainFar").then((mod) => {
      if (alive) setFar(buildFar(mod, world.lowEnd ? 2 : 1));
    });
    return () => {
      alive = false;
    };
  }, [world.lowEnd]);

  const farMesh = useMemo(() => (far ? new Mesh(far.geometry, world.mats.mountain) : null), [far, world]);
  const gondola = useMemo(() => (far ? buildGondola(far.heightAt) : null), [far]);

  const built = useMemo(() => {
    // Mount Baker: hazy lower flanks, grey rock ridges, a glacier cap whose edge wanders around the cone
    // about 2.5° tall from downtown, as the real one looks from 110 km: small, far, on the south-east horizon
    const BH = 170;
    const bakerGeo = new ConeGeometry(320, BH, 30, 10);
    const bp = bakerGeo.attributes.position;
    const bc = new Float32Array(bp.count * 3);
    const haze = new Color(0x9fb3c9);
    const rock = new Color(0xb4bfcb);
    const snow = new Color(0xeef3f8);
    const c = new Color();
    for (let i = 0; i < bp.count; i++) {
      const u = (bp.getY(i) + BH / 2) / BH;
      const a = Math.atan2(bp.getZ(i), bp.getX(i));
      if (u < 0.999) {
        const ridge = 1 + (0.06 * Math.sin(a * 7 + u * 3) + 0.04 * Math.sin(a * 13 + 1.3)) * (1 - u);
        bp.setX(i, bp.getX(i) * ridge);
        bp.setZ(i, bp.getZ(i) * ridge);
      }
      const line = 0.52 + 0.07 * Math.sin(a * 9) + 0.04 * Math.sin(a * 4 + 2);
      c.copy(haze).lerp(rock, Math.min(1, u / line)).lerp(snow, Math.min(1, Math.max(0, (u - line) / 0.06)));
      bc.set([c.r, c.g, c.b], i * 3);
    }
    bakerGeo.computeVertexNormals();
    bakerGeo.setAttribute("color", new BufferAttribute(bc, 3));
    // beyond the fog's reach, so its haze is painted into the colours instead
    const baker = new Mesh(bakerGeo, new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, fog: false }));
    baker.position.set(2600, BH / 2 - 25, 2600);
    // the Lions Gate Bridge (lionsGate.ts); its necklace of lights takes the event's pattern
    const lionsGate = buildLionsGate(world.lowEnd, world.mats.mast);
    const nw = narrowsLine();
    const mid = lionsGate.centre.z;
    const neck = new InstancedMesh(new SphereGeometry(0.35, 6, 4), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), lionsGate.necklace.length);
    const m4 = new Matrix4();
    lionsGate.necklace.forEach((p, i) => {
      m4.makeTranslation(p.x, p.y, p.z);
      neck.setMatrixAt(i, m4);
      neck.setColorAt(i, new Color(0xffffff));
    });
    registerPattern(world.events, neck, "ring", lionsGate.necklace, lionsGate.centre);
    // tidal turbines in the First Narrows: buoys with a light and a wake ring
    // (each kind of part merged across the six, one draw apiece)
    const turbines = new Group();
    const at = Array.from({ length: 6 }, (_, k): [number, number] => [nw.x - 30 + (k % 3) * 30, mid - 14 + Math.floor(k / 3) * 28]);
    turbines.add(
      new Mesh(merged(at.map(([x, z]) => ({ geo: new CylinderGeometry(1.2, 1.6, 2.4, 10), position: [x, SEA + 0.6, z] }))), new MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.5 })),
      new Mesh(merged(at.map(([x, z]) => ({ geo: new SphereGeometry(0.4, 8, 6), position: [x, SEA + 2.2, z] }))), world.events.glowB),
      new Mesh(
        merged(at.map(([x, z]) => ({ geo: new TorusGeometry(3, 0.12, 4, 24), position: [x, SEA + 0.05, z], rotation: [Math.PI / 2, 0, 0] }))),
        new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.4 }),
      ),
    );
    return { baker, lionsGate, neck, turbines };
  }, [world]);

  useEffect(() => {
    if (!farMesh || !far) return;
    world.refs.mountain = farMesh;
    world.refs.mountainCols = { summer: far.summer, winter: far.winter };
    farMesh.geometry.setAttribute("color", useTrain.getState().season === "winter" ? far.winter : far.summer);
    return () => {
      world.refs.mountain = null;
      world.refs.mountainCols = null;
      farMesh.geometry.dispose();
    };
  }, [world, far, farMesh]);

  useEffect(
    () => () => {
      for (const m of [built.baker, built.neck]) m.geometry.dispose();
      built.lionsGate.dispose();
    },
    [built],
  );

  // gondola cabins loop up and down the cable
  useFrame((state) => {
    if (!gondola) return;
    const t = state.clock.elapsedTime;
    const P = gondola.path;
    for (let i = 0; i < 12; i++) {
      const u = ((t * 0.01 + i / 12) % 1) * (P.length - 1);
      const k = Math.floor(u);
      const p = P[k].clone().lerp(P[Math.min(P.length - 1, k + 1)], u - k);
      cabinM.makeTranslation(p.x, p.y - 2, p.z);
      gondola.cabins.setMatrixAt(i, cabinM);
    }
    gondola.cabins.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {farMesh ? <primitive object={farMesh} /> : null}
      <primitive object={built.baker} />
      <primitive object={built.lionsGate.group} />
      <primitive object={built.neck} />
      <primitive object={built.turbines} />
      {gondola ? <primitive object={gondola.group} /> : null}
      {far ? <FarCity heightAt={far.heightAt} /> : null}
      {far ? <Extension heightAt={far.heightAt} /> : null}
    </>
  );
}
