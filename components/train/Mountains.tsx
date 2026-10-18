"use client";

import { useEffect, useMemo, useState } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Mesh, MeshStandardMaterial } from "three";

import { FAR_V, SEA, TERRAIN_V } from "./constants";
import { merged } from "./merge";
import { useTrain } from "./store";
import { RASTER, sdfAt } from "./terrain";
import { useWorld } from "./world";

type FarModule = typeof import("./terrainFar");

/**
 * The real backdrop from the far grid: North Vancouver rising to the North Shore range (Grouse, Seymour, Cypress),
 * Burnaby Mountain, the suburbs and the strait, coloured by height and slope with a summer and a winter snowline.
 * The city rectangle is lowered under the city mesh. Mount Baker stays a stylised cone on the south-east horizon.
 */
function buildFar(mod: FarModule): { geometry: BufferGeometry; summer: BufferAttribute; winter: BufferAttribute } {
  const g = mod.DEM_FAR;
  const bin = atob(mod.DEM_FAR_DATA);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const raw = new Uint16Array(u8.buffer);
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
      if (inside) y = Math.min(y, sdfAt(x, z) < 0 ? SEA - 5 : y) - 3;
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
    out.set([c.r, c.g, c.b], k * 3);
  };
  for (let k = 0; k < n; k++) {
    paint(summer, k, 1050);
    paint(winter, k, 430);
  }
  const s = new BufferAttribute(summer, 3);
  const w = new BufferAttribute(winter, 3);
  geometry.setAttribute("color", s);
  return { geometry, summer: s, winter: w };
}

/** The First Narrows from the real coastline: where the shore crossing nearest x −218 runs out of water. */
function narrows(): { x: number; zS: number; zN: number } {
  const x = -218;
  let zS = -300;
  let zN = -360;
  let inWater = false;
  for (let z = -230; z > -450; z -= 2) {
    const wet = sdfAt(x, z) < 0;
    if (wet && !inWater) zS = z + 2;
    if (!wet && inWater) {
      zN = z;
      break;
    }
    inWater = wet;
  }
  return { x, zS, zN };
}

export function Mountains() {
  const world = useWorld();
  const [far, setFar] = useState<ReturnType<typeof buildFar> | null>(null);

  useEffect(() => {
    let alive = true;
    import("./terrainFar").then((mod) => {
      if (alive) setFar(buildFar(mod));
    });
    return () => {
      alive = false;
    };
  }, []);

  const farMesh = useMemo(() => (far ? new Mesh(far.geometry, world.mats.mountain) : null), [far, world]);

  const built = useMemo(() => {
    const baker = new Mesh(new ConeGeometry(460, 430, 7), new MeshStandardMaterial({ color: 0xe9eef5, roughness: 1, flatShading: true, fog: false }));
    baker.position.set(1900, 190, 1700);
    // Lions Gate: two towers, a deck across the First Narrows, four main cables; concrete and cables as two meshes
    const nw = narrows();
    const len = nw.zS - nw.zN + 40;
    const mid = (nw.zS + nw.zN) / 2;
    const span = Math.max(40, (nw.zS - nw.zN) * 0.55);
    const bridge = new Mesh(
      merged([
        { geo: new BoxGeometry(6, 1.6, len), position: [0, 26, mid] },
        { geo: new BoxGeometry(5, 58, 5), position: [0, 29, mid - span / 2] },
        { geo: new BoxGeometry(5, 58, 5), position: [0, 29, mid + span / 2] },
      ]),
      new MeshStandardMaterial({ color: 0x5f8a6f, roughness: 0.6 }),
    );
    bridge.position.set(nw.x, 0, 0);
    const cables = new Mesh(
      merged(
        (
          [
            [mid - span / 2, mid + span / 2],
            [mid - span / 2, mid - len / 2],
            [mid + span / 2, mid + len / 2],
          ] as [number, number][]
        ).flatMap(([z0, z1]) =>
          [-2.4, 2.4].map((xo) => {
            const L = Math.abs(z1 - z0);
            return { geo: new CylinderGeometry(0.3, 0.3, Math.hypot(L, 30), 6), position: [xo, 42, (z0 + z1) / 2] as [number, number, number], rotation: [Math.atan2(L, 30) * (z1 > z0 ? 1 : -1), 0, 0] as [number, number, number] };
          }),
        ),
      ),
      world.mats.mast,
    );
    cables.position.set(nw.x, 0, 0);
    return { baker, bridge, cables };
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
      for (const m of [built.baker, built.bridge, built.cables]) m.geometry.dispose();
    },
    [built],
  );

  return (
    <>
      {farMesh ? <primitive object={farMesh} /> : null}
      <primitive object={built.baker} />
      <primitive object={built.bridge} />
      <primitive object={built.cables} />
    </>
  );
}
