/**
 * The Lions Gate Bridge across the First Narrows, from the Stanley Park causeway to the North Shore: two towers in
 * the water near either shore, each two tapering legs tied by cross-beams and stepped in at the top; the deck on a
 * stiffening truss, hung from the main cables by suspenders and carried on to an anchorage at each end of the side
 * spans; and the approach viaducts on piers down to the ground on both shores. Green steel, as the real one is
 * painted; the cables' necklace of lights follows the event. Client only (the truss texture needs a canvas).
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import { SEA } from "./constants";
import { merged, type Part } from "./merge";
import { canvasTexture } from "./shapes";
import { groundAt, sdfAt } from "./terrain";

/** The crossing's line (x) and where the water runs from (south shore, z) to (north shore). */
function narrows(): { x: number; zS: number; zN: number } {
  const x = -218;
  let zS = -300;
  let zN = -360;
  let inWater = false;
  for (let z = -230; z > -470; z -= 2) {
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

/** A Warren truss panel seen side on: top and bottom chords, verticals and diagonals, see-through between. */
const trussTexture = () =>
  canvasTexture(128, 32, (g) => {
    g.clearRect(0, 0, 128, 32);
    g.strokeStyle = "#fff";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 2);
    g.lineTo(128, 2);
    g.moveTo(0, 30);
    g.lineTo(128, 30);
    for (let x = 0; x <= 128; x += 32) {
      g.moveTo(x, 2);
      g.lineTo(x, 30);
      g.moveTo(x, 30);
      g.lineTo(x + 16, 2);
      g.lineTo(x + 32, 30);
    }
    g.stroke();
  });

/** Three lanes (the middle one reversible, as the real bridge's is): edge lines and dashed lines between the lanes. */
const roadTexture = () =>
  canvasTexture(48, 128, (g) => {
    g.fillStyle = "#4a4d52";
    g.fillRect(0, 0, 48, 128);
    g.fillStyle = "#e9e9e4";
    g.fillRect(1.5, 0, 1.5, 128);
    g.fillRect(45, 0, 1.5, 128);
    for (const x of [15.5, 31.5]) for (let y = 0; y < 128; y += 32) g.fillRect(x, y, 1.2, 16);
  });

export type LionsGate = { group: Group; necklace: Vector3[]; centre: Vector3; dispose: () => void };

/**
 * The deck along the crossing line (x = X): the towers' and the anchorages' places, the road's height at any z (a
 * gentle crown over the suspended spans, falling at a road's grade along the approaches) and where it comes down to
 * the ground at each end. The bridge and the cars on it (roadNetwork.ts) both stand on it.
 */
export function lionsGateDeck() {
  const nw = narrows();
  const X = nw.x;
  const D = 19;
  // the towers stand in the water a little out from each shore
  const zT1 = nw.zS - 9;
  const zT2 = nw.zN + 9;
  const span = zT1 - zT2;
  const mid = (zT1 + zT2) / 2;
  // the side spans reach an anchorage on each shore; beyond, the approaches fall at a road's grade to the ground
  const side = span * 0.42;
  const zA1 = zT1 + side;
  const zA2 = zT2 - side;
  const grade = 0.09;
  const deckAt = (z: number): number => {
    if (z <= zA1 && z >= zA2) return D + 0.6 * (1 - ((z - mid) / (zA1 - mid)) ** 2);
    return D - grade * (z > zA1 ? z - zA1 : zA2 - z);
  };
  const ground = (z: number) => Math.max(SEA, groundAt(X, z));
  // walk each approach out until the deck is down on the ground, where the road goes on from it
  let zEndS = zA1;
  while (zEndS < zA1 + 200 && deckAt(zEndS) > ground(zEndS) + 0.1) zEndS += 2;
  let zEndN = zA2;
  while (zEndN > zA2 - 220 && deckAt(zEndN) > ground(zEndN) + 0.1) zEndN -= 2;
  return { X, D, zT1, zT2, span, mid, zA1, zA2, deckAt, ground, zEndS, zEndN };
}

export function buildLionsGate(lowEnd: boolean, mast: MeshStandardMaterial): LionsGate {
  const { X, D, zT1, zT2, span, mid, zA1, zA2, deckAt, ground, zEndS, zEndN } = lionsGateDeck();
  const T = 41;
  const zs: number[] = [];
  for (let z = zEndS; z >= zEndN; z -= 2) zs.push(z);

  const steel = new MeshStandardMaterial({ color: 0x4d6f58, roughness: 0.55, metalness: 0.3 });
  const concrete = new MeshStandardMaterial({ color: 0xbab6ad, roughness: 0.85 });
  const roadTex = roadTexture();
  const road = new MeshStandardMaterial({ map: roadTex, roughness: 0.9 });
  const group = new Group();
  const HW = 3.6;

  // the roadway, following the deck's line, wound to face up (its rows run north, each from west to east)
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let along = 0;
  zs.forEach((z, i) => {
    const y = deckAt(z);
    if (i) along += Math.hypot(zs[i - 1] - z, y - deckAt(zs[i - 1]));
    pos.push(X - HW, y, z, X + HW, y, z);
    uvs.push(0, along / 8, 1, along / 8);
    if (i < zs.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const roadGeo = new BufferGeometry();
  roadGeo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  roadGeo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(idx);
  roadGeo.computeVertexNormals();
  group.add(new Mesh(roadGeo, road));

  // the deck's edges: a stiffening truss under the suspended spans, a plain girder along the approaches
  const steelParts: Part[] = [];
  const concreteParts: Part[] = [];
  const trussPos: number[] = [];
  const trussUv: number[] = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i];
    const zb = zs[i + 1];
    const ya = deckAt(za);
    const yb = deckAt(zb);
    const suspended = za <= zA1 + 0.1 && zb >= zA2 - 0.1;
    for (const sx of [-1, 1]) {
      const x = X + sx * (HW + 0.15);
      if (suspended) {
        const d = 2.6;
        const ua = (zA1 - za) / 8;
        const ub = (zA1 - zb) / 8;
        trussPos.push(x, ya, za, x, yb, zb, x, yb - d, zb, x, ya, za, x, yb - d, zb, x, ya - d, za);
        trussUv.push(ua, 1, ub, 1, ub, 0, ua, 1, ub, 0, ua, 0);
      }
      // the parapet rail all along
      const L = Math.hypot(zb - za, yb - ya);
      steelParts.push({ geo: new BoxGeometry(0.14, 0.8, L), position: [x, (ya + yb) / 2 + 0.4, (za + zb) / 2], rotation: [Math.atan2(yb - ya, za - zb), 0, 0] });
    }
    // the suspended spans: the steel deck plate the road is laid on, across the top of the trusses
    if (suspended) {
      const L = Math.hypot(zb - za, yb - ya);
      steelParts.push({ geo: new BoxGeometry(HW * 2 + 0.2, 0.55, L), position: [X, (ya + yb) / 2 - 0.31, (za + zb) / 2], rotation: [Math.atan2(yb - ya, za - zb), 0, 0] });
    }
    // the approaches: a solid concrete girder under the road
    if (!suspended) {
      const L = Math.hypot(zb - za, yb - ya);
      concreteParts.push({ geo: new BoxGeometry(HW * 2 + 0.6, 1.4, L), position: [X, (ya + yb) / 2 - 0.75, (za + zb) / 2], rotation: [Math.atan2(yb - ya, za - zb), 0, 0] });
    }
  }
  const trussGeo = new BufferGeometry();
  trussGeo.setAttribute("position", new Float32BufferAttribute(trussPos, 3));
  trussGeo.setAttribute("uv", new Float32BufferAttribute(trussUv, 2));
  trussGeo.computeVertexNormals();
  group.add(new Mesh(trussGeo, new MeshStandardMaterial({ color: 0x4d6f58, map: trussTexture(), alphaTest: 0.5, side: DoubleSide, roughness: 0.55, metalness: 0.3 })));
  // floor beams under the suspended deck tie the two trusses
  for (let z = zA1 - 4; z > zA2; z -= 8) steelParts.push({ geo: new BoxGeometry(HW * 2 + 0.3, 0.5, 0.5), position: [X, deckAt(z) - 2.4, z] });
  // the approach piers, down to the ground or the shore
  for (const [from, to, dir] of [
    [zA1 + 10, zEndS - 4, 1],
    [zA2 - 10, zEndN + 4, -1],
  ] as const) {
    for (let z = from; dir > 0 ? z < to : z > to; z += dir * 14) {
      const top = deckAt(z) - 1.4;
      const base = ground(z) - 0.5;
      if (top - base < 1.5) continue;
      for (const sx of [-1, 1]) concreteParts.push({ geo: new BoxGeometry(1.1, top - base, 1.4), position: [X + sx * (HW - 0.8), (top + base) / 2, z] });
      concreteParts.push({ geo: new BoxGeometry(HW * 2 + 0.4, 0.9, 1.6), position: [X, top - 0.45, z] });
    }
  }
  // the anchorages: massive concrete blocks where the cables come down at the ends of the side spans
  for (const z of [zA1, zA2]) {
    const base = ground(z) - 1;
    concreteParts.push({ geo: new BoxGeometry(HW * 2 + 4, deckAt(z) - base + 1.2, 7), position: [X, (deckAt(z) + base) / 2 + 0.6, z] });
  }

  // the towers: two legs tapering as they rise, three cross-beams, a stepped crown; a concrete pier in the water
  for (const zt of [zT1, zT2]) {
    concreteParts.push({ geo: new BoxGeometry(HW * 2 + 5, 3.2, 7), position: [X, SEA + 0.6, zt] });
    for (const sx of [-1, 1]) {
      const segs = 4;
      for (let k = 0; k < segs; k++) {
        const y0 = SEA + 2.2 + ((T - SEA - 2.2) * k) / segs;
        const y1 = SEA + 2.2 + ((T - SEA - 2.2) * (k + 1)) / segs;
        const w = 1.9 - 0.18 * k;
        steelParts.push({ geo: new BoxGeometry(w, y1 - y0 + 0.05, w * 1.35), position: [X + sx * (HW + 0.6), (y0 + y1) / 2, zt] });
      }
      // the stepped crown over each leg, and the saddle the cable passes over
      steelParts.push({ geo: new BoxGeometry(1.0, 2, 1.35), position: [X + sx * (HW + 0.6), T + 1, zt] });
      steelParts.push({ geo: new BoxGeometry(0.7, 0.8, 1.9), position: [X + sx * (HW + 0.6), T + 2.4, zt] });
    }
    for (const [y, h] of [
      [D - 3.2, 1.4],
      [D + (T - D) * 0.5, 1.2],
      [T - 0.8, 1.6],
    ] as const) steelParts.push({ geo: new BoxGeometry(HW * 2 + 2.4, h, 1.3), position: [X, y, zt] });
    // the lattice between the top two beams, the towers' art deco touch
    const ym = (D + (T - D) * 0.5 + T - 0.8) / 2;
    for (const s of [-1, 1]) steelParts.push({ geo: new BoxGeometry(0.35, (T - D) * 0.62, 0.4), position: [X, ym, zt], rotation: [0, 0, s * 0.42] });
  }
  const steelMesh = new Mesh(merged(steelParts), steel);
  const concreteMesh = new Mesh(merged(concreteParts), concrete);
  steelMesh.castShadow = concreteMesh.castShadow = !lowEnd;
  group.add(steelMesh, concreteMesh);

  // the main cables: up from each anchorage over the tower tops, sagging to just above the deck at mid-span
  const cableY = (z: number): number => {
    if (z <= zT1 && z >= zT2) return D + 2.2 + (T + 2.6 - D - 2.2) * ((z - mid) / (span / 2)) ** 2;
    const [za, zt] = z > zT1 ? [zA1, zT1] : [zA2, zT2];
    const u = (z - za) / (zt - za);
    return deckAt(za) + 0.8 + (T + 2.6 - deckAt(za) - 0.8) * u - Math.sin(u * Math.PI) * 1.6;
  };
  const curves: Vector3[][] = [-1, 1].map((sx) => {
    const c: Vector3[] = [];
    for (let z = zA1; z >= zA2 - 0.01; z -= 2) c.push(new Vector3(X + sx * (HW + 0.6), cableY(z), z));
    return c;
  });
  const cableParts: Part[] = curves.flatMap((c) =>
    c.slice(0, -1).map((a, k): Part => {
      const d = c[k + 1].clone().sub(a);
      const L = d.length();
      return { geo: new BoxGeometry(0.42, 0.42, L), position: a.clone().add(c[k + 1]).multiplyScalar(0.5).toArray() as [number, number, number], rotation: [Math.atan2(d.y, -d.z), 0, 0] };
    }),
  );
  group.add(new Mesh(merged(cableParts), mast));
  // the suspenders: a pair from each cable down to the deck every 4 units
  const sus: number[] = [];
  for (const c of curves) {
    for (const p of c) {
      if (Math.round(p.z) % 4 !== 0) continue;
      const dy = deckAt(p.z) + 0.6;
      if (p.y - dy < 0.6) continue;
      sus.push(p.x, p.y, p.z, p.x, dy, p.z);
    }
  }
  const susGeo = new BufferGeometry();
  susGeo.setAttribute("position", new BufferAttribute(new Float32Array(sus), 3));
  group.add(new LineSegments(susGeo, new LineBasicMaterial({ color: 0x3f5547 })));
  // lamp standards along the deck
  const lamps: Part[] = [];
  for (let z = zA1; z > zA2; z -= 10) for (const sx of [-1, 1]) lamps.push({ geo: new SphereGeometry(0.22, 6, 4), position: [X + sx * (HW - 0.2), deckAt(z) + 2.6, z] });
  const lampMesh = new Mesh(merged(lamps), new MeshBasicMaterial({ color: new Color(0xffe2b0), toneMapped: false }));
  group.add(lampMesh);

  const necklace = curves.flat().filter((_, i) => i % 2 === 0).map((v) => v.clone().add(new Vector3(0, 0.5, 0)));
  return {
    group,
    necklace,
    centre: new Vector3(X, 0, mid),
    dispose: () => {
      group.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
      });
    },
  };
}

/** The First Narrows' crossing line and shores, for the tidal turbines beneath the bridge. */
export const narrowsLine = narrows;
