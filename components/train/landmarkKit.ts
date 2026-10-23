/**
 * The four landmarks with the most to them: Canada Place (the five white sails over the cruise terminal, a docked
 * cruise ship), Harbour Centre (an office podium, the banded tower, glass elevators and the Lookout's saucer), Science
 * World (the sphere of stainless pyramids with its double layer of LED nodes, the drum and A-frames, the round base
 * and its deck over the water, the solar-roofed wing and the science park) and BC Place (the LED fascia, lit masts
 * and cable lights); the Waterfront hub; and the bridges over False Creek. Built in each landmark's local frame; client only.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  type CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";

import { SEA } from "./constants";
import { CONVENTION, DECK_Y, FLOAT_DOCK, FORECOURT, FORECOURT_TREES, GREEN_CAFES, harbourfrontBenches, harbourfrontTrees, inConvention, PLAZA, PLAZA_SOUTH, PLAZA_X, PROMENADE, PROMENADE_W } from "./harbourfront";
import { SET_RECT, toStation } from "./sets/zones";
import { pavilion, type Pieces, shopGlow, UMBRELLAS, warmLights } from "./pavilion";
import { registerPattern } from "./eventLights";
import { EVENT_META } from "./lookTypes";
import { addReflections } from "./reflectionSources";
import { merged, type Part } from "./merge";
import { canvasTexture, cap, merge, type P2, paint, roundRect, walls } from "./shapes";
import { type Bridge, BRIDGES, type PlacedLandmark, SW_ROOF } from "./sites";
import { groundAt, polySdf, sdfAt, surfaceAt } from "./terrain";
import { HUB_BLOCKS, HUB_CANOPY, HUB_DECK, HUB_DECK_BOX, HUB_GALLERY } from "./waterfrontHub";
import { cabinTexture, cruiseShip, floatplane } from "./vessels";
import type { World } from "./world";

export type Built = { group: Group; animate?: (t: number) => void };

const UPV = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const q = new Quaternion();
const one = new Vector3(1, 1, 1);
const p = new Vector3();
const rect = (w: number, d: number, x = 0, z = 0): P2[] => [
  [x - w / 2, z - d / 2],
  [x + w / 2, z - d / 2],
  [x + w / 2, z + d / 2],
  [x - w / 2, z + d / 2],
];
/** A light that is full at night (level 1) and off by day (level about a third). */
const nightOf = (level: number) => Math.max(0, (level - 0.4) / 0.6);

/** A façade texture and its lit-window twin (black except the windows). */
type Facade = { map: CanvasTexture; glow: CanvasTexture };
/** Paint a façade twice: once as the day surface, once as the night glow (only what `windows` paints shows). */
function facade(w: number, h: number, wall: (g: CanvasRenderingContext2D) => void, windows: (g: CanvasRenderingContext2D, lit: boolean) => void): Facade {
  return {
    map: canvasTexture(w, h, (g) => {
      wall(g);
      windows(g, false);
    }),
    glow: canvasTexture(w, h, (g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, w, h);
      windows(g, true);
    }),
  };
}
const WARM = ["#ffd9a0", "#ffe7c0", "#f6c98a", "#fff1d8"];

/**
 * After dusk the city's façades take a darker tone and light their windows: these materials follow it, and their
 * environment reflections fade so nothing glows that should not.
 */
function cityToned(world: World, mat: MeshStandardMaterial, lights = 0.9): MeshStandardMaterial {
  const env = mat.envMapIntensity;
  const day = mat.color.clone();
  world.events.followers.push((level) => {
    const n = nightOf(level);
    mat.color.copy(day).multiply(world.buildings.solid.color);
    if (mat.emissiveMap) mat.emissiveIntensity = world.buildings.solid.emissiveIntensity * lights;
    mat.envMapIntensity = env * (1 - 0.85 * n);
  });
  return mat;
}

/* ------------------------------------------------------------------ Canada Place */

/** The terminal's white façade: two rows of windows between pilasters. */
const terminalTexture = () =>
  facade(
    128,
    64,
    (g) => {
      g.fillStyle = "#f1f2ef";
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#d7dad6";
      g.fillRect(0, 30, 128, 3);
      g.fillRect(0, 60, 128, 4);
    },
    (g, lit) => {
      let k = 0;
      for (let x = 6; x < 128; x += 32) {
        for (const y of [10, 38]) {
          g.fillStyle = lit ? WARM[k++ % 4] : "#2c3a48";
          g.fillRect(x, y, 22, 16);
        }
      }
    },
  );

/** Hotel rooms: a grid of small windows, some lit at night. */
const hotelTexture = () =>
  facade(
    64,
    64,
    (g) => {
      g.fillStyle = "#e9e8e3";
      g.fillRect(0, 0, 64, 64);
    },
    (g, lit) => {
      let k = 0;
      for (let y = 6; y < 64; y += 16) {
        for (let x = 4; x < 64; x += 16) {
          k++;
          if (lit && (k * 7) % 5 < 2) continue;
          g.fillStyle = lit ? WARM[k % 4] : "#33414f";
          g.fillRect(x, y, 10, 9);
        }
      }
    },
  );

/**
 * Canada Place's sails as the fabric hangs, after the real ones seen from the water: a row of sails down the roof,
 * each a sweep of fabric curving down between two poles and pointing up at both ends, where a pole holds it. The poles
 * stand along both long edges (x = ±halfW) at the z's in `poles` (ascending), each pulling the fabric up to its own
 * height above `base` (`peaks`). Along an edge the fabric sags between two poles to `dip` of their height; across the
 * roof it sags from the edges to `mid` of theirs; at the edges and ends it falls straight to the roof, so from the side
 * each sail reads as a white sweep between two points. The grid runs through every pole, so each point stays sharp.
 */
function sailRoof(halfW: number, poles: number[], peaks: number[], base: number, step: number, dip = 0.16, mid = 0.55): BufferGeometry {
  const n = poles.length - 1;
  const edge = (z: number): number => {
    let k = 0;
    while (k < n - 1 && z > poles[k + 1]) k++;
    const u = Math.min(1, Math.max(0, (z - poles[k]) / (poles[k + 1] - poles[k])));
    return (peaks[k] + (peaks[k + 1] - peaks[k]) * u) * (dip + (1 - dip) * (2 * u - 1) ** 2);
  };
  const h = (x: number, z: number) => base + edge(z) * (mid + (1 - mid) * (x / halfW) ** 2);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let x = -halfW; x <= halfW + 1e-6; x += step) xs.push(x);
  if (Math.abs(xs[xs.length - 1] - halfW) > 1e-3) xs.push(halfW);
  for (let z = poles[0]; z <= poles[n] + 1e-6; z += step) zs.push(z);
  for (const pz of poles) if (!zs.some((z) => Math.abs(z - pz) < 1e-3)) zs.push(pz);
  zs.sort((a, c) => a - c);
  const pos: number[] = [];
  const idx: number[] = [];
  // a grid of points (cols × rows) laid by f, its quads into idx
  const grid = (cols: number, rows: number, f: (i: number, j: number) => [number, number, number]) => {
    const o = pos.length / 3;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pos.push(...f(i, j));
    for (let j = 0; j + 1 < rows; j++) {
      for (let i = 0; i + 1 < cols; i++) {
        const q = o + j * cols + i;
        idx.push(q, q + cols, q + 1, q + 1, q + cols, q + cols + 1);
      }
    }
  };
  // the fabric over the roof
  grid(xs.length, zs.length, (i, j) => [xs[i], h(xs[i], zs[j]), zs[j]]);
  // its falls to the roof: down both long edges (under each sweep) and across both ends
  for (const x of [-halfW, halfW]) grid(zs.length, 2, (i, j) => [x, j ? h(x, zs[i]) : base, zs[i]]);
  for (const z of [poles[0], poles[n]]) grid(xs.length, 2, (i, j) => [xs[i], j ? h(xs[i], z) : base, z]);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A long white vault, an elliptical section across (w wide, h high) rounding down at both ends, from y0, centred at zc
 * and len long: the cruise terminal's roof.
 */
function vaultRoof(w: number, len: number, h: number, y0: number, zc: number, nx: number, nz: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    const v = -1 + (2 * j) / nz;
    const end = Math.sqrt(Math.max(0, 1 - v ** 8));
    for (let i = 0; i <= nx; i++) {
      const u = -1 + (2 * i) / nx;
      pos.push((u * w) / 2, y0 + h * Math.sqrt(Math.max(0, 1 - u * u)) * end, zc + (v * len) / 2);
      if (i < nx && j < nz) {
        const k = j * (nx + 1) + i;
        idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Canada Place as it stands on its pier into the harbour, from the shore end out:
 * - the Pan Pacific's curved white tower on a glass podium;
 * - the convention hall in glass under the five white sails in a row, a mast through each, a white drum at their
 *   seaward end;
 * - the cruise terminal, glass under a long white curved roof;
 * - the open deck at the pier's end, planted, with benches and flags;
 * - glass canopies down both promenades, white gangway towers reaching out to a cruise ship berthed on each side.
 * After dark each sail is floodlit in its own colour (or the event's), and the lamps come on.
 */
export function buildCanadaPlace(l: PlacedLandmark, world: World): Built {
  const { events, lowEnd, envTex } = world;
  const g = new Group();
  // the pier runs out north from the shore, a little east of north
  const ROT = 0.15;
  g.rotation.y = ROT;
  const water = SEA - l.padY;
  const toWorld = (x: number, z: number): P2 => [l.px + x * Math.cos(ROT) + z * Math.sin(ROT), l.pz - x * Math.sin(ROT) + z * Math.cos(ROT)];
  // which end of the pier is the shore's: everything is laid out in sz (toward the shore), z = sz × shore
  const shore = sdfAt(...toWorld(0, 44)) > sdfAt(...toWorld(0, -44)) ? 1 : -1;
  const Z = (sz: number) => sz * shore;
  const deck = water + 2.6;
  const solid: BufferGeometry[] = [
    // the pier on its piles, its deck, and the promenade railings along both sides
    paint(new BoxGeometry(31, 3.4, 82).translate(0, water + 0.9, 0), 0x9a9890),
    paint(cap(rect(31, 82), deck), 0xc9c6bd),
    paint(new BoxGeometry(0.12, 0.9, 80).translate(15.2, deck + 0.45, 0), 0xe6e9ec),
    paint(new BoxGeometry(0.12, 0.9, 80).translate(-15.2, deck + 0.45, 0), 0xe6e9ec),
  ];
  for (let z = -36; z <= 36; z += 4) for (const x of [-15.5, 15.5]) solid.push(paint(new CylinderGeometry(0.35, 0.35, 3.2, 6).translate(x, water + 0.6, z), 0x6b6a64));
  const glassWalls: BufferGeometry[] = [];
  // the convention hall under the sails (sz -2 to 26) and the cruise terminal (sz -33 to -8): glass, a white cornice
  const HALL = { s0: -2, s1: 26, w: 24, h: 5 };
  const TERM = { s0: -33, s1: -8, w: 22, h: 4.6 };
  for (const b of [HALL, TERM]) {
    const zc = Z((b.s0 + b.s1) / 2);
    const len = b.s1 - b.s0;
    glassWalls.push(walls(rect(b.w, len, 0, zc), deck, deck + b.h, { uPer: 8, vPer: b.h }));
    solid.push(paint(new BoxGeometry(b.w + 0.6, 0.45, len + 0.6).translate(0, deck + b.h + 0.2, zc), 0xeef0ee));
  }
  // the terminal's roof: a long white vault
  solid.push(paint(vaultRoof(TERM.w + 1.2, TERM.s1 - TERM.s0 + 1.2, 5.2, deck + TERM.h + 0.4, Z((TERM.s0 + TERM.s1) / 2), lowEnd ? 12 : 20, lowEnd ? 14 : 24), 0xf4f5f3));
  // the drum at the sails' seaward end, half round toward the sea
  solid.push(paint(new CylinderGeometry(7, 7, 6.6, lowEnd ? 16 : 28, 1, false, shore > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI).translate(0, deck + 3.3, Z(HALL.s0)), 0xf1f2f0));
  // the Pan Pacific: a crescent of white tower opening to the harbour, on a glass podium at the shore end
  const podium = rect(27, 9, 0, Z(36.5));
  glassWalls.push(walls(podium, deck, deck + 5, { uPer: 8, vPer: 5 }));
  solid.push(paint(cap(podium, deck + 5), 0xd9d9d3));
  const C = 45;
  const arc = (r: number, from: number, to: number): P2[] => Array.from({ length: 13 }, (_, k) => {
    const f = from + ((to - from) * k) / 12;
    return [r * Math.sin(f), Z(C - r * Math.cos(f))] as P2;
  });
  const outer = arc(13.5, -1.0, 1.0);
  const inner = arc(10.2, 1.0, -1.0);
  const hotelTop = deck + 17;
  const hotel = [...outer, ...inner];
  // its roof: the strip between the two arcs
  {
    const pos: number[] = [];
    for (let k = 0; k < 12; k++) {
      const [a0, a1, b0, b1] = [outer[k], outer[k + 1], inner[12 - k], inner[11 - k]];
      for (const [x, z] of [a0, b0, a1, a1, b0, b1]) pos.push(x, hotelTop, z);
    }
    const top = new BufferGeometry();
    top.setAttribute("position", new Float32BufferAttribute(pos, 3));
    top.computeVertexNormals();
    // keep it facing up whichever way the arcs ran
    if (top.attributes.normal.getY(0) < 0) {
      for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
      top.setAttribute("position", new Float32BufferAttribute(pos, 3));
      top.computeVertexNormals();
    }
    solid.push(paint(top, 0xd9d9d3));
  }
  // lamp standards along the promenades, their lamps lit after dark
  const lampAt: [number, number, number][] = [];
  for (let z = -36; z <= 36; z += 6) for (const x of [-14.7, 14.7]) lampAt.push([x, deck + 2.7, z]);
  for (const [x, y, z] of lampAt) solid.push(paint(new CylinderGeometry(0.05, 0.07, 2.6, 4).translate(x, y - 1.35, z), 0x3a3f46));
  const lampMat = new MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
  const lamps = new InstancedMesh(new IcosahedronGeometry(0.24, 0), lampMat, lampAt.length);
  lampAt.forEach(([x, y, z], i) => lamps.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  // the glass canopies down both promenades, on white posts
  for (const x of [-13.4, 13.4]) {
    solid.push(paint(new BoxGeometry(2.6, 0.12, 64).translate(x + Math.sign(x) * 0.5, deck + 4.2, Z(-3)), 0x8fc9c0));
    for (let sz = -34; sz <= 28; sz += 6) solid.push(paint(new BoxGeometry(0.14, 4.2, 0.14).translate(x + Math.sign(x) * 1.6, deck + 2.1, Z(sz)), 0xf3f4f6));
  }
  // the gangway towers: white lattices by each berth, an arm out over the water to the ship's door
  for (const sx of [-1, 1]) {
    for (const sz of [-24, -10, 4]) {
      const tx = sx * 16.6;
      const tz = Z(sz);
      for (const [dx, dz] of [
        [-0.9, -0.9],
        [0.9, -0.9],
        [-0.9, 0.9],
        [0.9, 0.9],
      ])
        solid.push(paint(new BoxGeometry(0.18, 10, 0.18).translate(tx + dx, deck + 5, tz + dz), 0xf3f4f6));
      for (let y = 2; y <= 9; y += 2.4) {
        solid.push(paint(new BoxGeometry(2, 0.12, 0.12).translate(tx, deck + y, tz - 0.9), 0xf3f4f6), paint(new BoxGeometry(2, 0.12, 0.12).translate(tx, deck + y, tz + 0.9), 0xf3f4f6));
        solid.push(paint(new BoxGeometry(0.12, 0.12, 2).translate(tx - 0.9, deck + y, tz), 0xf3f4f6), paint(new BoxGeometry(0.12, 0.12, 2).translate(tx + 0.9, deck + y, tz), 0xf3f4f6));
      }
      solid.push(paint(new BoxGeometry(2.6, 0.5, 1.4).translate(tx + sx * 2.2, deck + 7.2, tz), 0xe6e9ec));
    }
  }
  // the open deck at the pier's end: planters with shrubs, benches, three flags
  for (const x of [-9, -3, 3, 9]) {
    solid.push(paint(new BoxGeometry(2.4, 0.7, 2.4).translate(x, deck + 0.35, Z(-37)), 0x9c958a), paint(new IcosahedronGeometry(1.2, 0).scale(1, 0.75, 1).translate(x, deck + 1.2, Z(-37)), 0x4f7a3e));
    solid.push(paint(new BoxGeometry(1.8, 0.45, 0.5).translate(x + 3, deck + 0.22, Z(-35.5)), 0x9a7048));
  }
  for (const [x, hex] of [
    [-4, 0xd52b1e],
    [0, 0x2f6bff],
    [4, 0xd52b1e],
  ] as [number, number][]) {
    solid.push(paint(new CylinderGeometry(0.07, 0.09, 9, 5).translate(x, deck + 4.5, Z(-39.5)), 0xe6e9ec), paint(new BoxGeometry(0.05, 1.3, 2.2).translate(x, deck + 8.2, Z(-39.5) - shore * 1.15), hex));
  }
  const tt = terminalTexture();
  const ht = hotelTexture();
  const terminalMat = cityToned(world, new MeshStandardMaterial({ map: tt.map, emissiveMap: tt.glow, emissive: 0xffffff, roughness: 0.6 }));
  const hotelMat = cityToned(world, new MeshStandardMaterial({ map: ht.map, emissiveMap: ht.glow, emissive: 0xffffff, roughness: 0.6 }));
  const terminal = new Mesh(merge(glassWalls), terminalMat);
  const hotelMesh = new Mesh(walls(hotel, deck, hotelTop, { uPer: 4, vPer: 3.2 }), hotelMat);
  // the sails: five in a row down the hall, each sweeping down between two poles and up to a point at both; six
  // poles along each long edge, standing well proud of their points, stays from their heads out to the roof's edge.
  // SAIL_Z: each sail's middle, from the shore end out (their floodlight colours run in this order)
  const POLE_S = [26.5, 20.5, 14.5, 8.5, 2.5, -3.5];
  const SAIL_Z = POLE_S.slice(1).map((sz, k) => Z((sz + POLE_S[k]) / 2));
  const SAIL_W = 9;
  const poleH = POLE_S.map((_, k) => (k === POLE_S.length - 1 ? 12.5 : 11.5));
  const masts: P2[] = POLE_S.flatMap((sz): P2[] => [
    [-SAIL_W, Z(sz)],
    [SAIL_W, Z(sz)],
  ]);
  const peaks = POLE_S.flatMap((_, k) => [poleH[k], poleH[k]]);
  // the roof terrace either side of the sails: planters of shrubs along its edge
  for (let sz = -1; sz <= 25; sz += 4.4) {
    for (const x of [-11, 11]) {
      solid.push(paint(new BoxGeometry(1.0, 0.55, 2.6).translate(x, deck + HALL.h + 0.7, Z(sz)), 0xb5603a), paint(new IcosahedronGeometry(0.75, 0).scale(1, 0.8, 1.4).translate(x, deck + HALL.h + 1.3, Z(sz)), 0x4f7a3e));
    }
  }
  const upper = deck + HALL.h + 0.4;
  const sailMat = new MeshStandardMaterial({ color: 0xfbfbf9, roughness: 0.6, side: DoubleSide, emissive: 0xfff1d8, emissiveIntensity: 0 });
  // after dark each sail is floodlit in its own colour: blue, green, white, orange and red, or the event's; the fabric's
  // seams run down from every peak
  const sailCols = { value: SAIL_Z.map(() => new Color()) };
  const sailTint = { value: 0 };
  const mastUni = { value: masts.map(([x, z]) => new Vector2(x, z)) };
  sailMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSail = sailCols;
    sh.uniforms.uTint = sailTint;
    sh.uniforms.uMast = mastUni;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSailXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSailXZ = position.xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uSail[5];\nuniform float uTint;\nuniform vec2 uMast[${masts.length}];\nvarying vec2 vSailXZ;`)
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          "vec2 near = uMast[0]; float nd = 1e9;",
          `for ( int i = 0; i < ${masts.length}; i++ ) { float d = distance( vSailXZ, uMast[i] ); if ( d < nd ) { nd = d; near = uMast[i]; } }`,
          "vec2 rel = vSailXZ - near;",
          "float sf16 = fract( atan( rel.y, rel.x ) * 2.546 );",
          "float arcd = min( sf16, 1.0 - sf16 ) * nd * 0.3927;",
          "diffuseColor.rgb *= 1.0 - 0.08 * smoothstep( 0.09, 0.0, arcd ) * step( 0.6, nd );",
        ].join("\n"),
      )
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          `float sf = clamp( ( vSailXZ.y - ( ${SAIL_Z[0].toFixed(2)} ) ) / ( ${(SAIL_Z[1] - SAIL_Z[0]).toFixed(2)} ), 0.0, 4.0 );`,
          "int s0 = int( floor( sf ) );",
          "vec3 sc = mix( uSail[ s0 ], uSail[ min( s0 + 1, 4 ) ], smoothstep( 0.4, 0.6, fract( sf ) ) );",
          "totalEmissiveRadiance *= mix( vec3( 1.0 ), sc, uTint );",
        ].join("\n"),
      );
  };
  // (the poles in ascending z, whichever end the shore is)
  const order = POLE_S.map((_, k) => k).sort((a, b) => Z(POLE_S[a]) - Z(POLE_S[b]));
  const roof = new Mesh(sailRoof(SAIL_W, order.map((k) => Z(POLE_S[k])), order.map((k) => poleH[k]), upper, lowEnd ? 0.9 : 0.5), sailMat);
  roof.castShadow = !lowEnd;
  const MAST_UP = 3.4;
  const mastGeo: BufferGeometry[] = masts.map(([x, z], k) => paint(new CylinderGeometry(0.12, 0.24, peaks[k] + MAST_UP, 8).translate(x, upper + (peaks[k] + MAST_UP) / 2, z), 0xf3f4f6));
  // the stays: from each pole's head out and down to the roof's edge, fore and aft
  const stay = (a: Vector3, b: Vector3) => {
    const len = a.distanceTo(b);
    const g = new CylinderGeometry(0.035, 0.035, len, 4).translate(0, len / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(UPV, b.clone().sub(a).normalize())).translate(a.x, a.y, a.z);
    return paint(g, 0xd9dcdf);
  };
  masts.forEach(([x, z], k) => {
    const head = new Vector3(x, upper + peaks[k] + MAST_UP - 0.3, z);
    for (const dz of [-2.4, 2.4]) mastGeo.push(stay(head, new Vector3(x + Math.sign(x) * 2.6, upper - 0.2, z + dz)));
  });
  // uplights along the sails' feet, in the event's colours (one mesh for each of the two colours)
  for (const odd of [0, 1]) {
    const ups = [...SAIL_Z.entries()].filter(([i]) => i % 2 === odd).map(([, z]) => new BoxGeometry(0.4, 0.2, 2.4).translate(odd ? SAIL_W + 0.6 : -SAIL_W - 0.6, upper + 0.15, z));
    if (ups.length) g.add(new Mesh(merge(ups), odd ? events.glowB : events.glow));
  }
  const solidMesh = new Mesh(merge([...solid, ...mastGeo]), cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
  solidMesh.receiveShadow = true;
  // the cruise ship berthed on the east side, on the open inlet (the west side faces Coal Harbour's island and Stanley
  // Park: no room to come and go), bow to the sea, toward the pier's end so its stern keeps off the bank at the
  // pier's root (the bow reaches a little past the end)
  const BERTH = -shore * 16;
  const shipX = 15.5 + 4.4 + 0.4;
  const ship = cruiseShip(lowEnd);
  const berth = (geo: BufferGeometry) => geo.rotateY(shore > 0 ? Math.PI : 0).translate(shipX, water + 0.05, BERTH);
  const shipSolidGeo = berth(ship.solid);
  const shipCabinGeo = berth(ship.cabins);
  const shipSolid = new Mesh(shipSolidGeo, cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, envMap: envTex, envMapIntensity: 0.4 })));
  const ct = cabinTexture();
  const shipCabins = new Mesh(shipCabinGeo, cityToned(world, new MeshStandardMaterial({ map: ct.map, emissiveMap: ct.glow, emissive: 0xffffff, roughness: 0.4, envMap: envTex, envMapIntensity: 0.5 }), 1.2));
  shipSolid.castShadow = !lowEnd;
  g.add(solidMesh, terminal, hotelMesh, roof, shipSolid, shipCabins, lamps);
  // the fabric is translucent: a little light through it by day, floodlit in colour after dark
  const SAILS_LIT = [0x2f6bff, 0x2fd36b, 0xffffff, 0xff7a2a, 0xff2a2a];
  const warm = new Color(0xffd29a);
  addReflections([
    ...SAIL_Z.map((z, k) => {
      const [x, wz] = toWorld(0, z);
      return { x, z: wz, y: l.padY + upper, h: 11, w: 9, col: sailCols.value[k], gain: 0.9 };
    }),
    ...[-24, 0, 24].map((z) => {
      const [x, wz] = toWorld(-15.5, z);
      return { x, z: wz, y: l.padY + deck, h: 5, w: 16, col: warm, gain: 0.45 };
    }),
    ...[-24, -8, 8, 24].map((z) => {
      const [x, wz] = toWorld(shipX, z + BERTH);
      return { x, z: wz, y: l.padY + water, h: 16, w: 14, col: warm, gain: 0.5 };
    }),
  ]);
  events.followers.push((level, ev) => {
    const n = nightOf(level);
    sailMat.emissiveIntensity = 0.12 + 0.85 * n;
    sailTint.value = n;
    const pal = ev ? EVENT_META[ev].colours : SAILS_LIT;
    sailCols.value.forEach((c, k) => c.setHex(pal[k % pal.length]));
    lampMat.color.setHex(0xffe2b0).multiplyScalar(0.25 + 1.5 * n);
  });
  return { group: g };
}

/* ------------------------------------------------------------------ Harbour Centre */

/** The tower's bands: concrete spandrels and dark ribbon windows, one floor per tile; offices lit here and there at night. */
const towerTexture = () =>
  facade(
    64,
    64,
    (g) => {
      g.fillStyle = "#cbc7bf";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#b9b4ab";
      g.fillRect(0, 20, 64, 2);
    },
    (g, lit) => {
      for (let x = 0; x < 64; x += 16) {
        g.fillStyle = lit ? (x === 16 ? "#000" : WARM[x / 16]) : "#26303c";
        g.fillRect(x + 2, 22, 14, 34);
        if (!lit) {
          g.fillStyle = "#3a4656";
          g.fillRect(x, 22, 2, 34);
        }
      }
    },
  );

/** The podium's bronze glass. */
const podiumTexture = () =>
  facade(
    64,
    64,
    (g) => {
      g.fillStyle = "#6d5844";
      g.fillRect(0, 0, 64, 64);
    },
    (g, lit) => {
      g.fillStyle = lit ? "#ffd9a0" : "#2b2f35";
      g.fillRect(0, 14, 64, 38);
      if (!lit) {
        g.fillStyle = "#7d6750";
        for (let x = 0; x < 64; x += 16) g.fillRect(x, 14, 3, 38);
      }
    },
  );

export function buildHarbourCentre(world: World): Built {
  const { events, envTex, mats } = world;
  const g = new Group();
  const podiumTop = 9;
  const towerTop = 45;
  const pt = podiumTexture();
  const podium = new Mesh(walls(rect(30, 22, 0, 5), -2, podiumTop, { uPer: 4, vPer: 3 }), cityToned(world, new MeshStandardMaterial({ map: pt.map, emissiveMap: pt.glow, emissive: 0xffffff, roughness: 0.45, envMap: envTex, envMapIntensity: 0.5 })));
  const tower = roundRect(12, 9.5, 2.4);
  const tw = towerTexture();
  const towerMesh = new Mesh(walls(tower, podiumTop, towerTop, { uPer: 3, vPer: 1.8, smooth: true }), cityToned(world, new MeshStandardMaterial({ map: tw.map, emissiveMap: tw.glow, emissive: 0xffffff, roughness: 0.6, envMap: envTex, envMapIntensity: 0.3 })));
  towerMesh.castShadow = true;
  const concrete: BufferGeometry[] = [
    paint(cap(rect(30, 22, 0, 5), podiumTop), 0xb9b4ab),
    paint(cap(tower, towerTop), 0xcbc7bf),
    // a roof garden on the podium
    paint(cap(rect(12, 8, -8, 9), podiumTop + 0.05), 0x5f8a4a),
    paint(new CylinderGeometry(3.0, 3.6, 2.6, 24).translate(0, towerTop + 1.3, 0), 0xcbc7bf),
    // the elevator shafts' frames on the north face
    ...[-2.4, 2.4].map((x) => paint(new BoxGeometry(1.9, 0.3, 1.6).translate(x, towerTop - 0.2, -5.5), 0xdfe3e8)),
  ];
  const concreteMesh = new Mesh(merge(concrete), cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  // the saucer: a sloping underside, the observation deck's glass, a white rim, the restaurant's glass, a shallow roof
  const lathe = (pts: [number, number][], seg = 48) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg);
  const saucerWhite = cityToned(world, new MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.45, side: DoubleSide }));
  const glassMat = new MeshStandardMaterial({ color: 0x253244, metalness: 0.5, roughness: 0.12, envMap: envTex, envMapIntensity: 0.9, emissive: 0xffd9a0, emissiveIntensity: 0, side: DoubleSide });
  const under = new Mesh(lathe([[0.5, 47.4], [3.2, 47.5], [6.2, 48.0], [9.3, 49.0], [9.9, 49.4]]), saucerWhite);
  const deck1 = new Mesh(lathe([[9.9, 49.4], [9.9, 50.9]]), glassMat);
  const rim = new Mesh(lathe([[9.9, 50.9], [10.45, 51.0], [10.45, 51.45], [9.6, 51.55]]), saucerWhite);
  const deck2 = new Mesh(lathe([[9.6, 51.55], [9.2, 52.9]]), glassMat);
  const top = new Mesh(lathe([[9.2, 52.9], [9.4, 53.05], [6, 53.6], [2, 53.9], [0, 53.95]]), saucerWhite);
  const ring = new Mesh(new TorusGeometry(10.45, 0.22, 8, 64), events.glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 51.2;
  const antenna = new Mesh(new CylinderGeometry(0.14, 0.3, 7, 8), mats.mast);
  antenna.position.y = 57.4;
  const beacon = new Mesh(new SphereGeometry(0.32, 10, 8), new MeshStandardMaterial({ color: 0x551111, emissive: 0xff2a2a, emissiveIntensity: 0.4 }));
  beacon.position.y = 61;
  // the glass elevators in their shafts on the north face, travelling between the podium and the saucer
  const shafts = new Mesh(merge([-2.4, 2.4].map((x) => new BoxGeometry(1.7, towerTop - podiumTop, 1.4).translate(x, (towerTop + podiumTop) / 2, -5.55))), world.mats.pane);
  const lifts = [-2.4, 2.4].map((x) => {
    const m = new Mesh(new BoxGeometry(1.4, 2.0, 1.1), new MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd77a, emissiveIntensity: 0.6, roughness: 0.3 }));
    m.position.set(x, podiumTop + 2, -5.55);
    return m;
  });
  g.add(podium, towerMesh, concreteMesh, under, deck1, rim, deck2, top, ring, antenna, beacon, shafts, ...lifts);
  events.followers.push((level) => {
    const n = nightOf(level);
    glassMat.emissiveIntensity = 0.85 * n;
    glassMat.envMapIntensity = 0.9 * (1 - 0.8 * n);
    (beacon.material as MeshStandardMaterial).emissiveIntensity = 0.4 + 2.2 * n;
  });
  const span = towerTop - podiumTop - 4;
  return {
    group: g,
    animate: (t) => {
      lifts[0].position.y = podiumTop + 1 + (Math.sin(t * 0.21) * 0.5 + 0.5) * span;
      lifts[1].position.y = podiumTop + 1 + (Math.sin(t * 0.21 + 2.4) * 0.5 + 0.5) * span;
    },
  };
}

/* ------------------------------------------------------------------ Science World */

/** A flat annular sector (r0..r1, a0..a1 radians in the x-z plane, x = cos, z = sin) at height y, facing up or down. */
function sector(r0: number, r1: number, a0: number, a1: number, y: number, seg: number, up = true): BufferGeometry {
  const pos: number[] = [];
  for (let k = 0; k < seg; k++) {
    const u = a0 + ((a1 - a0) * k) / seg;
    const v = a0 + ((a1 - a0) * (k + 1)) / seg;
    const p = [
      [Math.cos(u) * r0, Math.sin(u) * r0],
      [Math.cos(u) * r1, Math.sin(u) * r1],
      [Math.cos(v) * r1, Math.sin(v) * r1],
      [Math.cos(v) * r0, Math.sin(v) * r0],
    ];
    // (p0, p2, p1) faces up for an increasing angle (z grows with the angle, so the turn is clockwise seen from above)
    const order = up === a1 > a0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of order) pos.push(p[i][0], y, p[i][1]);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) uv.set([pos[i * 3] / 4, pos[i * 3 + 2] / 4], i * 2);
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  return g;
}

/** A curved wall on radius r from angle a0 to a1, y0 to y1, facing out (or in), u along the arc in `uPer` units. */
function arcWall(r: number, a0: number, a1: number, y0: number, y1: number, seg: number, uPer = 1, vPer = y1 - y0, out = true): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const du = (Math.abs(a1 - a0) * r) / seg / uPer;
  for (let k = 0; k < seg; k++) {
    const u = a0 + ((a1 - a0) * k) / seg;
    const v = a0 + ((a1 - a0) * (k + 1)) / seg;
    const q = [
      [Math.cos(u) * r, y0, Math.sin(u) * r, k * du, 0, u],
      [Math.cos(v) * r, y0, Math.sin(v) * r, (k + 1) * du, 0, v],
      [Math.cos(v) * r, y1, Math.sin(v) * r, (k + 1) * du, (y1 - y0) / vPer, v],
      [Math.cos(u) * r, y1, Math.sin(u) * r, k * du, (y1 - y0) / vPer, u],
    ];
    // (q0, q1, q2) faces inward when the angle grows; flip for the outward face
    const order = out === a1 > a0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      pos.push(q[i][0], q[i][1], q[i][2]);
      const s = out ? 1 : -1;
      nor.push(Math.cos(q[i][5]) * s, 0, Math.sin(q[i][5]) * s);
      uv.push(q[i][3], q[i][4]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * Science World's round base, two storeys to a tile: a red fascia, a storey of red panels with white joints, a white
 * band, and the ground storey of glass between slim mullions, lit at night.
 */
const swCladTexture = () =>
  facade(
    128,
    128,
    (g) => {
      g.fillStyle = "#c8202c";
      g.fillRect(0, 0, 128, 62);
      g.fillStyle = "#b01a26";
      g.fillRect(0, 0, 128, 7);
      g.fillStyle = "#e9e4e0";
      for (let x = 0; x < 128; x += 32) g.fillRect(x, 7, 2, 55);
      g.fillRect(0, 34, 128, 2);
      g.fillStyle = "#f3f3f1";
      g.fillRect(0, 62, 128, 8);
      g.fillStyle = "#6f767c";
      g.fillRect(0, 124, 128, 4);
    },
    (g, lit) => {
      let k = 0;
      for (let x = 0; x < 128; x += 16) {
        g.fillStyle = lit ? WARM[k++ % 4] : "#3f6170";
        g.fillRect(x + 1, 72, 14, 51);
        if (!lit) {
          g.fillStyle = "rgba(200,225,235,0.3)";
          g.fillRect(x + 1, 72, 14, 16);
        }
      }
    },
  );

/**
 * The east front, two storeys to a tile: bays of red panels crossed by white bracing and grey bays crossed in red,
 * over a ground floor of glass between grey piers.
 */
const swBraceTexture = () =>
  facade(
    256,
    128,
    (g) => {
      g.fillStyle = "#dcdfe1";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#c5cacd";
      for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 1, 128);
      g.fillStyle = "#c8202c";
      g.fillRect(0, 0, 256, 8);
      g.fillRect(10, 14, 108, 62);
      g.fillRect(0, 82, 256, 4);
      g.lineCap = "square";
      g.strokeStyle = "#f3f3f1";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(13, 17);
      g.lineTo(115, 73);
      g.moveTo(115, 17);
      g.lineTo(13, 73);
      g.stroke();
      g.strokeStyle = "#c8202c";
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(140, 14);
      g.lineTo(244, 76);
      g.moveTo(244, 14);
      g.lineTo(140, 76);
      g.stroke();
      g.fillStyle = "#f2c12e";
      g.fillRect(224, 40, 12, 12);
      g.fillStyle = "#2f6eb5";
      g.fillRect(148, 40, 11, 11);
      g.fillStyle = "#6f767c";
      g.fillRect(0, 122, 256, 6);
    },
    (g, lit) => {
      let k = 0;
      for (let x = 4; x < 256; x += 32) {
        g.fillStyle = lit ? WARM[k++ % 4] : "#2b3a48";
        g.fillRect(x, 92, 26, 26);
      }
    },
  );

/** Glazing with slim white mullions, for the entrance hall and the round stair tower. */
const swGlassTexture = () =>
  facade(
    64,
    64,
    (g) => {
      g.fillStyle = "#e8eaec";
      g.fillRect(0, 0, 64, 64);
    },
    (g, lit) => {
      for (let x = 0; x < 64; x += 16) {
        for (let y = 0; y < 64; y += 32) {
          g.fillStyle = lit ? WARM[(x / 16 + y / 32) % 4] : "#4d6478";
          g.fillRect(x + 1.5, y + 1.5, 13, 29);
        }
      }
    },
  );

/** Photovoltaic modules from above: dark blue cells in a light frame, four to a tile. */
const swSolarTexture = () =>
  canvasTexture(64, 64, (g) => {
    g.fillStyle = "#b7bec6";
    g.fillRect(0, 0, 64, 64);
    for (const [x, y] of [
      [1, 1],
      [33, 1],
      [1, 33],
      [33, 33],
    ]) {
      g.fillStyle = "#1e2d4c";
      g.fillRect(x, y, 30, 30);
      g.fillStyle = "#2c4068";
      for (let k = 6; k < 30; k += 6) {
        g.fillRect(x, y + k, 30, 1);
        g.fillRect(x + k, y, 1, 30);
      }
    }
  });
/**
 * Science World as it was built for Expo 86, at the head of False Creek, in its local frame (the land side along +x),
 * with its 2100 touches:
 * - the geodesic sphere, polished stainless steel in shallow pyramids under a white tube along every edge, an LED
 *   node on every vertex and every pyramid's apex, joined by a lattice that glows after dark (the double layer of
 *   lights); by day the nodes are the frame's small white joints;
 * - the red drum it sits on, its rim lit, in a courtyard roof with the white space frame standing beside it;
 * - on the water side the round base, a glass storey under red panels, its roof a garden with two white tensile
 *   tents; round it the promenade deck on piles with its white railing, and the little pier with the orange C;
 * - on the land side the fan: bays of stepped roofs radiating from the sphere, a glazed clerestory at each step, the
 *   outer wall in red-and-white panels, a red line where it meets the courtyard; in 2100 its middle steps carry
 *   solar panels and green roofs in turn and every inner step a skylight; the round glass stair tower and a plaza
 *   beyond it.
 * The landmark's yaw turns the group (Landmarks.tsx); the event patterns are registered at their turned positions.
 */
export function buildScienceWorld(l: PlacedLandmark, world: World): Built {
  const { events, lowEnd, envTex, mats } = world;
  const centre = new Vector3(l.px, 0, l.pz);
  const yaw = l.yaw ?? 0;
  const g = new Group();
  // the base stands about a third of the sphere's diameter, as the real one does
  const R = 11;
  const DRUM = 8.7;
  const ROOF = SW_ROOF;
  const DRUM_TOP = 9.4;
  const cy = DRUM_TOP + Math.sqrt(R * R - DRUM * DRUM);
  const BASE = 14;
  const DECK = 18.5;
  /**
   * The roof garden's arc on the water side, and the fan's arc over the land and its reach (local angles): the fan stops
   * where the ground starts to rise toward the south-east (Creekside Slope, sites.ts), so all of it stands on the pad.
   */
  const GARDEN: [number, number] = [2.2, 4.4];
  const FAN = { a0: -1.35, a1: 0.25, r: 30 };
  const SHELL = 0xc8ced5;
  const deckY = 0.28;
  const toWorld = (v: Vector3) => v.clone().applyAxisAngle(UPV, yaw).add(centre);

  // the sphere: a shallow stainless pyramid on every face of a geodesic (icosahedron, 4 subdivisions)
  const ico = new IcosahedronGeometry(1, 4);
  const pa = ico.attributes.position;
  const keyOf = (i: number) => `${pa.getX(i).toFixed(3)},${pa.getY(i).toFixed(3)},${pa.getZ(i).toFixed(3)}`;
  const index = new Map<string, number>();
  const dirs: Vector3[] = [];
  const faces: [number, number, number][] = [];
  for (let i = 0; i < pa.count; i += 3) {
    const f: number[] = [];
    for (let k = 0; k < 3; k++) {
      const key = keyOf(i + k);
      let vi = index.get(key);
      if (vi === undefined) {
        vi = dirs.length;
        index.set(key, vi);
        dirs.push(new Vector3(pa.getX(i + k), pa.getY(i + k), pa.getZ(i + k)).normalize());
      }
      f.push(vi);
    }
    faces.push(f as [number, number, number]);
  }
  ico.dispose();
  const at = (d: Vector3, rr: number) => new Vector3(d.x * rr, d.y * rr + cy, d.z * rr);
  const spos: number[] = [];
  for (const [a, b, c] of faces) {
    const A = at(dirs[a], R);
    const B = at(dirs[b], R);
    const C = at(dirs[c], R);
    const P = at(dirs[a].clone().add(dirs[b]).add(dirs[c]).normalize(), R + 0.11);
    // the icosahedron's faces wind outward, so each side of the pyramid keeps its edge's order
    for (const [u, v] of [
      [A, B],
      [B, C],
      [C, A],
    ]) spos.push(u.x, u.y, u.z, v.x, v.y, v.z, P.x, P.y, P.z);
  }
  const shellGeo = new BufferGeometry();
  shellGeo.setAttribute("position", new Float32BufferAttribute(spos, 3));
  shellGeo.computeVertexNormals();
  const shellMat = new MeshStandardMaterial({ color: SHELL, metalness: 0.92, roughness: 0.16, envMap: envTex, envMapIntensity: 1.3, flatShading: true, emissive: 0x000000 });
  const ball = new Mesh(shellGeo, shellMat);
  ball.castShadow = !lowEnd;

  // the lights: a node on every vertex and on every apex
  const led = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const outerPts = dirs.map((d) => at(d, R + 0.07));
  const apexPts = faces.map(([a, b, c]) => at(dirs[a].clone().add(dirs[b]).add(dirs[c]).normalize(), R + 0.2));
  // octahedra: at this size they read as points of light, for 8 triangles each
  const outer = new InstancedMesh(new OctahedronGeometry(0.17, 0), led, outerPts.length);
  const apex = new InstancedMesh(new OctahedronGeometry(0.12, 0), led, apexPts.length);
  for (const [mesh, pts] of [
    [outer, outerPts],
    [apex, apexPts],
  ] as const) {
    pts.forEach((v, i) => {
      m4.makeTranslation(v.x, v.y, v.z);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, new Color(0xffffff));
    });
    registerPattern(events, mesh, "nodes", pts.map(toWorld), centre);
  }
  // the lattice: each apex node to its face's corners
  const lpos = new Float32Array(faces.length * 6 * 3);
  const lcol = new Float32Array(faces.length * 6 * 3);
  faces.forEach((f, fi) => {
    f.forEach((vi, k) => {
      lpos.set([apexPts[fi].x, apexPts[fi].y, apexPts[fi].z, outerPts[vi].x, outerPts[vi].y, outerPts[vi].z], (fi * 6 + k * 2) * 3);
    });
  });
  const lgeo = new BufferGeometry();
  lgeo.setAttribute("position", new BufferAttribute(lpos, 3));
  lgeo.setAttribute("color", new BufferAttribute(lcol, 3));
  // additive: a dim colour adds next to nothing by day, so the lattice only shows as light after dark
  const lattice = new LineSegments(lgeo, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false, blending: AdditiveBlending, depthWrite: false }));

  // the red drum the sphere sits on, and its lit rim
  const red = cityToned(world, new MeshStandardMaterial({ color: 0xc41f2b, roughness: 0.5 }), 0);
  const white = cityToned(world, new MeshStandardMaterial({ color: 0xf1f2f3, roughness: 0.45, metalness: 0.15 }), 0);
  const drum = new Mesh(new CylinderGeometry(DRUM, DRUM, DRUM_TOP - ROOF, 48, 1, true), red);
  drum.position.y = (ROOF + DRUM_TOP) / 2;
  const rim = new Mesh(new TorusGeometry(DRUM + 0.08, 0.16, 6, 64), events.glow);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = DRUM_TOP;

  // the sphere's structure: a white tube along every edge of the geodesic, standing just proud of the steel
  const edgeKeys = new Set<string>();
  const edges: [number, number][] = [];
  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const a = Math.min(f[k], f[(k + 1) % 3]);
      const b = Math.max(f[k], f[(k + 1) % 3]);
      if (edgeKeys.has(`${a},${b}`)) continue;
      edgeKeys.add(`${a},${b}`);
      edges.push([a, b]);
    }
  }
  const struts = new InstancedMesh(new CylinderGeometry(0.07, 0.07, 1, 5, 1, true), white, edges.length);
  edges.forEach(([a, b], i) => {
    const A = at(dirs[a], R + 0.05);
    const B = at(dirs[b], R + 0.05);
    const d = B.clone().sub(A);
    p.addVectors(A, B).multiplyScalar(0.5);
    q.setFromUnitVectors(UPV, d.clone().normalize());
    m4.compose(p, q, new Vector3(1, d.length(), 1));
    struts.setMatrixAt(i, m4);
  });

  // the round base on the water side: glass below, red panels above; its roof a terrace round the drum, with a
  // garden and two white tensile tents on the water side
  const clad = swCladTexture();
  const cladMat = cityToned(world, new MeshStandardMaterial({ map: clad.map, emissiveMap: clad.glow, emissive: 0xffffff, roughness: 0.55 }), 0.9);
  const base = new Mesh(arcWall(BASE, FAN.a1, FAN.a0 + Math.PI * 2, 0, ROOF, 48, 12, ROOF), cladMat);
  const roofMat = cityToned(world, new MeshStandardMaterial({ color: 0xd4d6d4, roughness: 0.85 }), 0);
  const roofs = new Mesh(sector(DRUM, BASE + 0.12, GARDEN[1], GARDEN[0] + Math.PI * 2, ROOF, 40), roofMat);
  roofs.receiveShadow = true;
  const garden = new Mesh(sector(DRUM, BASE + 0.12, GARDEN[0], GARDEN[1], ROOF + 0.04, 32), mats.roofGreen);
  garden.receiveShadow = true;
  const parapet = new Mesh(arcWall(BASE + 0.12, FAN.a1, FAN.a0 + Math.PI * 2, ROOF, ROOF + 0.7, 48), white);
  const tentMat = new MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.6, side: DoubleSide, emissive: 0xfff1d8, emissiveIntensity: 0 });
  const tents: BufferGeometry[] = [];
  const masts: BufferGeometry[] = [];
  for (const a of [3.35, 3.95]) {
    const tx = Math.cos(a) * 11.3;
    const tz = Math.sin(a) * 11.3;
    tents.push(new CylinderGeometry(0.25, 3.4, 2.2, 6, 1, true).translate(tx, ROOF + 4.6, tz));
    for (let k = 0; k < 6; k++) {
      const b = (k / 6) * Math.PI * 2;
      masts.push(new CylinderGeometry(0.07, 0.07, 3.6, 4).translate(tx + Math.cos(b) * 3.3, ROOF + 1.8, tz + Math.sin(b) * 3.3));
    }
    masts.push(new CylinderGeometry(0.1, 0.1, 5.9, 5).translate(tx, ROOF + 2.95, tz));
  }
  const tentMesh = new Mesh(merge(tents), tentMat);

  // the fan, as the Expo Centre was built: bays of stepped roofs radiating from the sphere over the land side, a
  // glazed clerestory at each step, the outer wall in red-and-white panels, a red trim line facing the sphere; in
  // 2100 the middle steps carry solar panels and green roofs in turn, and every inner step a skylight
  const brace = swBraceTexture();
  const braceMat = cityToned(world, new MeshStandardMaterial({ map: brace.map, emissiveMap: brace.glow, emissive: 0xffffff, roughness: 0.6 }), 0.9);
  const glassTex = swGlassTexture();
  const glassMat = cityToned(world, new MeshStandardMaterial({ map: glassTex.map, emissiveMap: glassTex.glow, emissive: 0xffffff, roughness: 0.15, metalness: 0.3, envMap: envTex, envMapIntensity: 0.8 }), 1);
  const STEPS: [number, number, number][] = [
    [BASE, 19, 8.8],
    [19, 24.5, 7.4],
    [24.5, FAN.r, 6.0],
  ];
  const NB = 10;
  const fanRoof: BufferGeometry[] = [];
  const fanPv: BufferGeometry[] = [];
  const fanGreen: BufferGeometry[] = [];
  const fanGlass: BufferGeometry[] = [arcWall(19, FAN.a0, FAN.a1, 7.4, 8.8, 40, 3, 1.4), arcWall(24.5, FAN.a0, FAN.a1, 6.0, 7.4, 48, 3, 1.4)];
  const fanWhite: BufferGeometry[] = [];
  const fanFront: BufferGeometry[] = [arcWall(FAN.r, FAN.a0, FAN.a1, 0, 6.0, 64, 9, 6.0)];
  // the fan's two ends, step by step (both windings, so they show from either side)
  for (const a of [FAN.a0, FAN.a1]) {
    for (const [r0, r1, h] of STEPS) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const P = [
        [c * r0, 0, s * r0, 0, 0],
        [c * r1, 0, s * r1, (r1 - r0) / 9, 0],
        [c * r1, h, s * r1, (r1 - r0) / 9, h / 6],
        [c * r0, h, s * r0, 0, h / 6],
      ];
      const pos: number[] = [];
      const uv: number[] = [];
      for (const i of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) {
        pos.push(P[i][0], P[i][1], P[i][2]);
        uv.push(P[i][3], P[i][4]);
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      fanFront.push(geo);
    }
  }
  for (let b = 0; b < NB; b++) {
    const a0 = FAN.a0 + ((FAN.a1 - FAN.a0) * b) / NB;
    const a1 = FAN.a0 + ((FAN.a1 - FAN.a0) * (b + 1)) / NB;
    const am = (a0 + a1) / 2;
    STEPS.forEach(([r0, r1, h], i) => {
      fanRoof.push(sector(r0, r1 + 0.05, a0, a1, h, 4));
      if (i === 1) (b % 2 ? fanGreen : fanPv).push(sector(r0 + 0.7, r1 - 0.7, a0 + 0.03, a1 - 0.03, h + 0.08, 3));
      if (i === 0) fanGlass.push(new BoxGeometry(1.4, 0.9, 2.6).rotateY(-am).translate(Math.cos(am) * 16.5, h + 0.45, Math.sin(am) * 16.5));
    });
  }
  // the bays' dividing walls, a white line over each step
  for (let b = 0; b <= NB; b++) {
    const a = FAN.a0 + ((FAN.a1 - FAN.a0) * b) / NB;
    for (const [r0, r1, h] of STEPS) {
      const rm = (r0 + r1) / 2;
      fanWhite.push(new BoxGeometry(r1 - r0, 0.7, 0.24).rotateY(-a).translate(Math.cos(a) * rm, h + 0.35, Math.sin(a) * rm));
    }
  }
  // the red line where the fan meets the courtyard round the drum, facing the sphere
  const trim = new Mesh(arcWall(BASE - 0.05, FAN.a0, FAN.a1, ROOF, 8.8 + 0.5, 40, 1, 1.9, false), red);
  const fanRoofMesh = new Mesh(merge(fanRoof), roofMat);
  fanRoofMesh.receiveShadow = true;
  const fanPvMesh = new Mesh(merge(fanPv), new MeshStandardMaterial({ map: swSolarTexture(), roughness: 0.3, metalness: 0.5, envMap: envTex, envMapIntensity: 0.7 }));
  const fanGreenMesh = new Mesh(merge(fanGreen), mats.roofGreen);
  const fanGlassMesh = new Mesh(merge(fanGlass), glassMat);
  const fanFrontMesh = new Mesh(merge(fanFront), braceMat);
  fanFrontMesh.castShadow = !lowEnd;

  // the white space frame standing on the courtyard roof beside the sphere, two cells square and three high
  const S = 2.2;
  const fc = new Vector3(Math.cos(-0.95) * 11.4 - S, ROOF, Math.sin(-0.95) * 11.4 - S);
  const frame: [Vector3, Vector3][] = [];
  const P3 = (i: number, j: number, k: number) => new Vector3(fc.x + i * S, fc.y + j * S, fc.z + k * S);
  for (let i = 0; i <= 2; i++) {
    for (let j = 0; j <= 3; j++) {
      for (let k = 0; k <= 2; k++) {
        if (i < 2) frame.push([P3(i, j, k), P3(i + 1, j, k)]);
        if (j < 3) frame.push([P3(i, j, k), P3(i, j + 1, k)]);
        if (k < 2) frame.push([P3(i, j, k), P3(i, j, k + 1)]);
        if (i < 2 && j < 3 && (i + j + k) % 2 === 0) frame.push([P3(i, j, k), P3(i + 1, j + 1, k)]);
      }
    }
  }
  const spaceFrame = new InstancedMesh(new CylinderGeometry(0.1, 0.1, 1, 5), white, frame.length);
  frame.forEach(([a, b], i) => {
    const d = b.clone().sub(a);
    p.addVectors(a, b).multiplyScalar(0.5);
    q.setFromUnitVectors(UPV, d.clone().normalize());
    m4.compose(p, q, new Vector3(1, d.length(), 1));
    spaceFrame.setMatrixAt(i, m4);
  });
  // the round glass stair tower just outside the fan
  const tower = new Group();
  const towerBody = new Mesh(walls(oval(2.1, 2.1, 24), 0, 9.6, { uPer: 1.65, vPer: 2.4, smooth: true }), glassMat);
  const towerCap = new Mesh(new CylinderGeometry(2.3, 2.3, 0.4, 24), white);
  towerCap.position.y = 9.8;
  tower.add(towerBody, towerCap);
  tower.position.set(Math.cos(FAN.a1 - 0.15) * (FAN.r + 3), 0, Math.sin(FAN.a1 - 0.15) * (FAN.r + 3));

  // the promenade deck out over the water on piles round the base, its white railing, the little pier with the C
  const deckMat = cityToned(world, new MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.85 }), 0);
  const d0 = FAN.a1 - 0.04;
  const d1 = FAN.a0 + Math.PI * 2 + 0.04;
  const pierA = 2.45;
  const deck = new Mesh(
    merge([
      sector(BASE - 0.1, DECK, d0, d1, deckY, 64),
      sector(BASE - 0.1, DECK, d0, d1, -0.35, 64, false),
      arcWall(DECK, d0, d1, -0.35, deckY, 64),
      new BoxGeometry(4.2, 0.63, 4.2).translate(Math.cos(pierA) * 20.4, deckY - 0.315, Math.sin(pierA) * 20.4),
    ]),
    deckMat,
  );
  deck.receiveShadow = true;
  // down from the deck's underside to the bed below the sea
  const pileLen = Math.max(1, deckY - 0.35 - (SEA - 1.5 - l.padY));
  const pileSpots: P2[] = [];
  for (let a = d0 + 0.06; a < d1; a += 0.2) for (const rr of [15.6, 17.9]) pileSpots.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  const piles = new InstancedMesh(new CylinderGeometry(0.26, 0.26, 1, 6), new MeshStandardMaterial({ color: 0x4a4540, roughness: 0.9 }), pileSpots.length);
  pileSpots.forEach(([x, z], i) => {
    p.set(x, deckY - 0.35 - pileLen / 2, z);
    m4.compose(p, q.identity(), new Vector3(1, pileLen, 1));
    piles.setMatrixAt(i, m4);
  });
  const railR = DECK - 0.18;
  const posts: P2[] = [];
  for (let a = d0; a <= d1 + 1e-6; a += 1.2 / railR) posts.push([Math.cos(a) * railR, Math.sin(a) * railR]);
  const railPosts = new InstancedMesh(new BoxGeometry(0.1, 1.05, 0.1), white, posts.length);
  posts.forEach(([x, z], i) => {
    m4.makeTranslation(x, deckY + 0.52, z);
    railPosts.setMatrixAt(i, m4);
  });
  const rails = new Mesh(
    merge(
      [deckY + 1.05, deckY + 0.6].map((y) => {
        const t = new TorusGeometry(railR, 0.06, 4, 96, d1 - d0);
        t.rotateX(Math.PI / 2);
        t.rotateY(-d0);
        t.translate(0, y, 0);
        return t;
      }),
    ),
    white,
  );
  const orange = new MeshStandardMaterial({ color: 0xf28a1a, roughness: 0.45 });
  const cSculpt = new Mesh(new TorusGeometry(0.95, 0.34, 10, 20, Math.PI * 1.5), orange);
  cSculpt.position.set(Math.cos(pierA) * 20.4, deckY + 1.32, Math.sin(pierA) * 20.4);
  // the arc opens toward +x before the turn; z first, then the turn to face out over the water
  cSculpt.rotation.set(0, -pierA + Math.PI / 2, Math.PI / 4, "YXZ");
  // the plaza beyond the fan
  const paving = new Mesh(sector(FAN.r + 0.1, FAN.r + 3.5, FAN.a0, FAN.a1, 0.08, 48), cityToned(world, new MeshStandardMaterial({ color: 0xc9c5bb, roughness: 0.95 }), 0));
  paving.receiveShadow = true;

  // lights: the night shell and the tents lit from below
  const ca = new Color();
  const cb = new Color();
  const joint = new Color(0xe9edf1);
  events.followers.push((level) => {
    const oc = outer.instanceColor;
    const ac = apex.instanceColor;
    if (!oc || !ac) return;
    const n = nightOf(level);
    // by day the nodes are the frame's white joints; the event's colours come up with the dark
    for (const [mesh, attr] of [
      [outer, oc],
      [apex, ac],
    ] as const) {
      const arr = attr.array as Float32Array;
      for (let i = 0; i < mesh.count; i++) {
        ca.fromArray(arr, i * 3).lerp(joint, 1 - n);
        ca.toArray(arr, i * 3);
      }
      attr.needsUpdate = true;
    }
    const dim = 0.06 + 0.64 * n;
    faces.forEach((f, fi) => {
      ca.fromArray(ac.array as Float32Array, fi * 3).multiplyScalar(dim);
      f.forEach((vi, k) => {
        cb.fromArray(oc.array as Float32Array, vi * 3).multiplyScalar(dim);
        lcol.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], (fi * 6 + k * 2) * 3);
      });
    });
    (lgeo.attributes.color as BufferAttribute).needsUpdate = true;
    // after dark the shell recedes and takes a faint wash of the light
    shellMat.color.setHex(SHELL).multiplyScalar(1 - 0.75 * n);
    shellMat.envMapIntensity = 1.3 * (1 - 0.9 * n);
    shellMat.emissive.copy(events.glow.emissive).multiplyScalar(0.1 * n);
    tentMat.emissiveIntensity = 0.5 * n;
  });
  g.add(ball, struts, outer, apex, lattice, drum, rim, base, roofs, garden, parapet, tentMesh, new Mesh(merge(masts), white), trim, fanRoofMesh, fanPvMesh, fanGreenMesh, fanGlassMesh, new Mesh(merge(fanWhite), white), fanFrontMesh, spaceFrame, tower, deck, piles, railPosts, rails, cSculpt, paving);
  // its lights show in False Creek, in the event's colours
  addReflections([{ x: centre.x, z: centre.z, y: centre.y, h: 26, w: 22, col: events.glow.emissive, gain: 0.8 }]);
  return { group: g };
}

/* ------------------------------------------------------------------ BC Place */

/**
 * BC Place: the bowl, a tall LED fascia round the rim (in the event's colours by day and night) under a white line,
 * and the cable-supported roof: 36 masts leaning out round the rim, a cable from each mast top to the compression ring
 * at the centre, and the white fabric rising between the cables to the ring, sagging into a scallop between each pair,
 * with the retractable roof closed over the middle as a low pillow. After dark the masts glow white, lights run down
 * every cable and the fabric is lit from within.
 */
export function buildBCPlace(world: World, centre: Vector3): Built {
  const { events, lowEnd, mats } = world;
  const g = new Group();
  const R = 40;
  const RIM = 17.6;
  const rOut = R + 1.4;
  const rIn = 13;
  const yIn = 31;
  const bowl = new Mesh(new CylinderGeometry(R, R - 2.5, RIM - 1.2, 72, 1, true), new MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.9, side: 2 }));
  bowl.position.y = (RIM - 1.2) / 2;
  const pitch = new Mesh(new CircleGeometry(R - 2.5, 64), new MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.3;
  const concourse = new Mesh(new CylinderGeometry(R + 1.2, R + 1.2, 1.4, 72), new MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.8 }));
  concourse.position.y = RIM - 0.7;
  // the fabric: a polar grid rising from the rim to the ring, sagging between the 36 radial cables
  const NS = lowEnd ? 144 : 216;
  const NR = lowEnd ? 10 : 16;
  const rise = (r: number) => {
    const t = (rOut - r) / (rOut - rIn);
    return RIM + (yIn - RIM) * (1 - (1 - t) * (1 - t));
  };
  const fpos: number[] = [];
  const fidx: number[] = [];
  for (let j = 0; j <= NR; j++) {
    const r = rOut - ((rOut - rIn) * j) / NR;
    const sag = 2.1 * Math.sin((Math.PI * j) / NR);
    for (let i = 0; i <= NS; i++) {
      const a = (i / NS) * Math.PI * 2;
      fpos.push(Math.cos(a) * r, rise(r) - sag * Math.sin(18 * a) ** 2, Math.sin(a) * r);
      if (i < NS && j < NR) {
        const k = j * (NS + 1) + i;
        fidx.push(k, k + 1, k + NS + 1, k + 1, k + NS + 2, k + NS + 1);
      }
    }
  }
  const fabric = new BufferGeometry();
  fabric.setAttribute("position", new BufferAttribute(new Float32Array(fpos), 3));
  fabric.setIndex(fidx);
  fabric.computeVertexNormals();
  const roofMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: DoubleSide, emissive: 0xe4ecff, emissiveIntensity: 0 });
  const roof = new Mesh(fabric, roofMat);
  roof.castShadow = !lowEnd;
  // the retractable roof, closed: a low pillow inside the ring
  const pillow = new Mesh(new LatheGeometry([0, 0.25, 0.5, 0.75, 1].map((t) => new Vector2(rIn * (1 - t) + 0.01, yIn + 0.3 + 2.6 * Math.sin((t * Math.PI) / 2))), 72), roofMat);
  const ring = new Mesh(new TorusGeometry(rIn, 0.7, 8, 72), mats.mast);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = yIn + 0.2;
  const ribs = new InstancedMesh(new BoxGeometry(0.6, RIM - 3.2, 1.1), new MeshStandardMaterial({ color: 0xbfb9ad, roughness: 0.9 }), 72);
  const mastMat = new MeshStandardMaterial({ color: 0xf0f1f3, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 });
  const MAST = 27;
  const masts = new InstancedMesh(new CylinderGeometry(0.26, 0.5, MAST, 8), mastMat, 36);
  const cables = new InstancedMesh(new CylinderGeometry(0.08, 0.08, 1, 5), new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.5 }), 36);
  const led = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const tips = new InstancedMesh(new IcosahedronGeometry(0.42, 1), led, 36);
  // the fascia: 72 tall LED panels round the rim, and a thin white line above them
  const fascia = new InstancedMesh(new BoxGeometry(3.6, 3.8, 0.3), led, 72);
  const lineMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const topLine = new Mesh(new TorusGeometry(R + 1.45, 0.32, 6, 160), lineMat);
  topLine.rotation.x = Math.PI / 2;
  topLine.position.y = RIM - 1.0;
  const perCable = lowEnd ? 7 : 12;
  const bulbMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bulbs = new InstancedMesh(new IcosahedronGeometry(0.34, 0), bulbMat, 36 * perCable);
  const dv = new Vector3();
  const tang = new Vector3();
  const ringPts: Vector3[] = [];
  const tipPts: Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    p.set(Math.cos(a) * (R + 0.3), (RIM - 3.2) / 2, Math.sin(a) * (R + 0.3));
    q.setFromAxisAngle(UPV, -a);
    m4.compose(p, q, one);
    ribs.setMatrixAt(i, m4);
  }
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    p.set(Math.cos(a) * (R + 1.35), RIM - 3.3, Math.sin(a) * (R + 1.35));
    q.setFromAxisAngle(UPV, -a + Math.PI / 2);
    m4.compose(p, q, one);
    fascia.setMatrixAt(i, m4);
    fascia.setColorAt(i, new Color(0xffffff));
    ringPts.push(p.clone().add(centre));
  }
  let b = 0;
  const lean = 0.16;
  for (let i = 0; i < 36; i++) {
    // the masts stand on the ridges between scallops (where the cables run)
    const a = (i / 36) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // each stands on the rim just outside the fascia
    const base = R + 2.4;
    const foot = RIM - 5;
    p.set(cx * (base + Math.sin(lean) * MAST * 0.5), foot + Math.cos(lean) * MAST * 0.5, cz * (base + Math.sin(lean) * MAST * 0.5));
    tang.set(-cz, 0, cx);
    q.setFromAxisAngle(tang, -lean);
    m4.compose(p, q, one);
    masts.setMatrixAt(i, m4);
    const top = new Vector3(cx * (base + Math.sin(lean) * MAST), foot + Math.cos(lean) * MAST, cz * (base + Math.sin(lean) * MAST));
    const anchor = new Vector3(cx * rIn, yIn + 0.4, cz * rIn);
    m4.makeTranslation(top.x, top.y + 0.4, top.z);
    tips.setMatrixAt(i, m4);
    tips.setColorAt(i, new Color(0xffffff));
    tipPts.push(top.clone().add(centre));
    dv.subVectors(anchor, top);
    const L = dv.length();
    p.addVectors(top, anchor).multiplyScalar(0.5);
    q.setFromUnitVectors(UPV, dv.clone().normalize());
    m4.compose(p, q, new Vector3(1, L, 1));
    cables.setMatrixAt(i, m4);
    for (let k = 1; k <= perCable; k++) {
      p.copy(top).addScaledVector(dv, k / (perCable + 1));
      m4.makeTranslation(p.x, p.y, p.z);
      bulbs.setMatrixAt(b++, m4);
    }
  }
  registerPattern(events, fascia, "ring", ringPts, centre);
  registerPattern(events, tips, "nodes", tipPts, centre);
  const white = new Color();
  events.followers.push((level, _ev, t) => {
    const n = nightOf(level);
    mastMat.emissiveIntensity = 0.85 * n;
    roofMat.emissiveIntensity = 0.22 * n;
    lineMat.color.setScalar(0.35 + 0.65 * level);
    bulbMat.color.copy(white.setRGB(1, 1, 1)).multiplyScalar(0.15 + 0.85 * n * (0.85 + 0.15 * Math.sin(t * 2)));
  });
  g.add(bowl, pitch, concourse, roof, pillow, ring, ribs, masts, cables, tips, fascia, topLine, bulbs);
  addReflections(
    [0, 1, 2, 3, 4, 5].map((k) => {
      const a = (k / 6) * Math.PI * 2;
      return { x: centre.x + Math.cos(a) * R, z: centre.z + Math.sin(a) * R, y: centre.y, h: RIM, w: 18, col: k % 2 ? events.glowB.emissive : events.glow.emissive, gain: 0.7 };
    }),
  );
  return { group: g };
}

/* ------------------------------------------------------------------ Rogers Arena */

/** An oval of n points, rx by rz. */
const oval = (rx: number, rz: number, n = 64): P2[] => Array.from({ length: n }, (_, i): P2 => [Math.cos((i / n) * Math.PI * 2) * rx, Math.sin((i / n) * Math.PI * 2) * rz]);

/** The ice from above: white, the red centre line, two blue lines, five face-off circles, the goal creases. */
function rinkTexture(): CanvasTexture {
  return canvasTexture(512, 220, (g) => {
    g.fillStyle = "#f4f8fb";
    g.beginPath();
    g.roundRect(4, 4, 504, 212, 70);
    g.fill();
    g.strokeStyle = "#1b1f27";
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = "#c8202f";
    g.fillRect(253, 4, 6, 212);
    g.fillRect(34, 4, 3, 212);
    g.fillRect(475, 4, 3, 212);
    g.fillStyle = "#1f4fb4";
    g.fillRect(170, 4, 10, 212);
    g.fillRect(332, 4, 10, 212);
    g.strokeStyle = "#c8202f";
    g.lineWidth = 3;
    for (const [x, y, r] of [[256, 110, 30], [92, 58, 26], [92, 162, 26], [420, 58, 26], [420, 162, 26]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "#7fb2e8";
    for (const x of [36, 476]) {
      g.beginPath();
      g.arc(x, 110, 16, x < 256 ? -Math.PI / 2 : Math.PI / 2, x < 256 ? Math.PI / 2 : (3 * Math.PI) / 2);
      g.fill();
    }
  });
}

/** The arena's LED wrap: a hockey night in blue and green, crossed sticks and a puck, repeated round the oval. */
function arenaBandTexture(): CanvasTexture {
  const t = canvasTexture(512, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 512, 0);
    gr.addColorStop(0, "#0b2f6b");
    gr.addColorStop(0.5, "#0f5c4a");
    gr.addColorStop(1, "#0b2f6b");
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 64);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 5;
    g.lineCap = "round";
    for (const cx of [64, 320]) {
      g.beginPath();
      g.moveTo(cx - 22, 12);
      g.lineTo(cx + 14, 50);
      g.lineTo(cx + 26, 50);
      g.moveTo(cx + 22, 12);
      g.lineTo(cx - 14, 50);
      g.lineTo(cx - 26, 50);
      g.stroke();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.ellipse(cx, 54, 7, 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#ffffff";
    g.font = "700 30px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const cx of [192, 448]) g.fillText("HOCKEY NIGHT", cx, 33);
  });
  t.wrapS = RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/**
 * Rogers Arena, the hockey arena beside the stadium, as 2100 would keep it: an oval of dark glass, an LED wrap round
 * the top showing a hockey night, and a glass oculus in the white roof over the rink, so from the guideway and the
 * air you look down on the seating bowl, the lit ice with its lines and circles, and the scoreboard hung over centre
 * ice. A ring under the roof edge takes the event's colours.
 */
export function buildRogersArena(world: World): Built {
  const { events, lowEnd, envTex } = world;
  const g = new Group();
  const RX = 21;
  const RZ = 15.5;
  const WALL = 9.5;
  const BAND = 2.6;
  const ROOF = WALL + BAND;
  const glassFacade = facade(
    64,
    64,
    (gx) => {
      gx.fillStyle = "#26323f";
      gx.fillRect(0, 0, 64, 64);
    },
    (gx, lit) => {
      let k = 0;
      for (let x = 2; x < 64; x += 16) {
        for (const y of [4, 36]) {
          gx.fillStyle = lit ? WARM[k++ % 4] : "#3a4c5e";
          gx.fillRect(x, y, 13, 26);
        }
      }
    },
  );
  const glassMat = cityToned(world, new MeshStandardMaterial({ map: glassFacade.map, emissiveMap: glassFacade.glow, emissive: 0xffffff, roughness: 0.25, metalness: 0.3, envMap: envTex, envMapIntensity: 0.6 }), 1);
  const walls0 = new Mesh(walls(oval(RX, RZ, 72), 0, WALL, { uPer: 4, vPer: 4.75, smooth: true }), glassMat);
  const bandTex = arenaBandTexture();
  const bandMat = new MeshBasicMaterial({ map: bandTex, toneMapped: false });
  const band = new Mesh(walls(oval(RX + 0.15, RZ + 0.15, 72), WALL, ROOF, { uPer: 1, vPer: BAND, smooth: true }), bandMat);
  // the roof: a white ring from the edge in to the oculus, which is glazed
  const OX = 16;
  const OZ = 10.6;
  const outer = oval(RX + 0.4, RZ + 0.4, 72);
  const inner = oval(OX, OZ, 72);
  const rpos: number[] = [];
  const ridx: number[] = [];
  for (let i = 0; i < 72; i++) {
    rpos.push(outer[i][0], ROOF, outer[i][1], inner[i][0], ROOF + 1.6, inner[i][1]);
    const a = i * 2;
    const b = ((i + 1) % 72) * 2;
    ridx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const roofGeo = new BufferGeometry();
  roofGeo.setAttribute("position", new BufferAttribute(new Float32Array(rpos), 3));
  roofGeo.setIndex(ridx);
  roofGeo.computeVertexNormals();
  const roofMat = new MeshStandardMaterial({ color: 0xf2f3f1, roughness: 0.6, side: DoubleSide });
  const roof = new Mesh(roofGeo, roofMat);
  roof.castShadow = !lowEnd;
  const ribs = new InstancedMesh(new BoxGeometry(0.22, 0.3, 1), roofMat, 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const ox = Math.cos(a) * (RX + 0.4);
    const oz = Math.sin(a) * (RZ + 0.4);
    const ix = Math.cos(a) * OX;
    const iz = Math.sin(a) * OZ;
    const len = Math.hypot(ox - ix, oz - iz);
    p.set((ox + ix) / 2, ROOF + 0.95, (oz + iz) / 2);
    q.setFromAxisAngle(UPV, -Math.atan2(oz - iz, ox - ix) + Math.PI / 2);
    m4.compose(p, q, new Vector3(1, 1, len));
    ribs.setMatrixAt(i, m4);
  }
  const glass = new Mesh(cap(inner, ROOF + 1.6), world.mats.pane);
  // inside: the seating bowl stepping down from the oculus to the boards, blue and green tiers, shallow enough
  // that the ice shows from the guideway
  const tiers = lowEnd ? 4 : 6;
  const seatCols = [0x1f4fb4, 0x0f6e58, 0x1f4fb4, 0x23407e, 0x0f6e58, 0x1f4fb4];
  const bowlParts: BufferGeometry[] = [];
  const RINK_X = 9;
  const RINK_Z = 3.9;
  const ICE = 6.2;
  for (let k = 0; k < tiers; k++) {
    const t0 = k / tiers;
    const t1 = (k + 1) / tiers;
    const rx0 = OX + 0.5 - (OX + 0.5 - RINK_X - 0.8) * t0;
    const rz0 = OZ + 0.5 - (OZ + 0.5 - RINK_Z - 0.8) * t0;
    const rx1 = OX + 0.5 - (OX + 0.5 - RINK_X - 0.8) * t1;
    const rz1 = OZ + 0.5 - (OZ + 0.5 - RINK_Z - 0.8) * t1;
    const y0 = ROOF - 1 - (ROOF - 1 - ICE) * t0;
    const y1 = ROOF - 1 - (ROOF - 1 - ICE) * t1;
    const a = oval(rx0, rz0, 48);
    const b = oval(rx1, rz1, 48);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < 48; i++) {
      pos.push(a[i][0], y0, a[i][1], b[i][0], y1, b[i][1]);
      const u = i * 2;
      const v = ((i + 1) % 48) * 2;
      idx.push(u, v, u + 1, v, v + 1, u + 1);
    }
    const tier = new BufferGeometry();
    tier.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    tier.setIndex(idx);
    tier.computeVertexNormals();
    bowlParts.push(paint(tier, seatCols[k % seatCols.length]));
  }
  const seats = new Mesh(merge(bowlParts), new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: DoubleSide }));
  const iceMat = new MeshStandardMaterial({ map: rinkTexture(), roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.15 });
  iceMat.emissiveMap = iceMat.map;
  const ice = new Mesh(new PlaneGeometry(RINK_X * 2, RINK_Z * 2), iceMat);
  ice.rotation.x = -Math.PI / 2;
  ice.position.y = ICE;
  const boards = new Mesh(walls(oval(RINK_X + 0.15, RINK_Z + 0.15, 48), ICE, ICE + 0.7, { smooth: true }), new MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.5 }));
  // the scoreboard over centre ice: four lit screens on a dark frame
  const scoreTex = canvasTexture(128, 64, (gx) => {
    gx.fillStyle = "#05070c";
    gx.fillRect(0, 0, 128, 64);
    gx.fillStyle = "#ffd27a";
    gx.font = "700 30px ui-monospace, monospace";
    gx.textAlign = "center";
    gx.textBaseline = "middle";
    gx.fillText("3 - 2", 64, 26);
    gx.fillStyle = "#7dd3fc";
    gx.font = "600 14px ui-monospace, monospace";
    gx.fillText("3RD  12:40", 64, 50);
  });
  const scoreMat = new MeshBasicMaterial({ map: scoreTex, toneMapped: false });
  const score = new Group();
  score.add(new Mesh(new BoxGeometry(2.8, 1.7, 2.8), new MeshStandardMaterial({ color: 0x15181d, roughness: 0.5, metalness: 0.4 })));
  for (let k = 0; k < 4; k++) {
    const sc = new Mesh(new PlaneGeometry(2.5, 1.4), scoreMat);
    sc.rotation.y = (k * Math.PI) / 2;
    sc.position.set(Math.sin((k * Math.PI) / 2) * 1.41, 0, Math.cos((k * Math.PI) / 2) * 1.41);
    score.add(sc);
  }
  score.position.y = ROOF - 1.9;
  const hang = new Mesh(new CylinderGeometry(0.06, 0.06, 3.2, 4), world.mats.mast);
  hang.position.y = ROOF + 0.4;
  // a line of light along the roof edge, in the event's colours
  const glow = new Mesh(walls(oval(RX + 0.45, RZ + 0.45, 96), ROOF - 0.05, ROOF + 0.3, { smooth: true }), events.glowB);
  events.followers.push((level) => {
    const n = nightOf(level);
    bandMat.color.setScalar(0.75 + 0.6 * n);
    iceMat.emissiveIntensity = 0.15 + 0.75 * n;
  });
  g.add(walls0, band, roof, ribs, glass, seats, ice, boards, score, hang, glow);
  // smaller than BC Place by more than life would have it, so the two sit side by side on the basin
  g.scale.setScalar(0.82);
  return { group: g };
}

/* ------------------------------------------------------------------ False Creek's bridges */

/** Four lanes of asphalt: white edge lines, dashed lines between the lanes, a median down the middle. */
const roadTexture = () =>
  canvasTexture(64, 128, (g) => {
    g.fillStyle = "#43464c";
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = "#e9e9e4";
    g.fillRect(2, 0, 1.5, 128);
    g.fillRect(60.5, 0, 1.5, 128);
    for (const x of [17, 46]) for (let y = 0; y < 128; y += 32) g.fillRect(x, y, 1.2, 16);
    g.fillStyle = "#b9b6ad";
    g.fillRect(30.5, 0, 3, 128);
  });

/** A steel truss panel, see-through between its members: chords, verticals and a pair of diagonals. */
const trussTexture = (hex: string) =>
  canvasTexture(128, 64, (g) => {
    g.strokeStyle = hex;
    g.lineCap = "square";
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(128, 4);
    g.moveTo(0, 60);
    g.lineTo(128, 60);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    for (const x of [0, 64, 128]) {
      g.moveTo(x, 4);
      g.lineTo(x, 60);
    }
    g.moveTo(0, 60);
    g.lineTo(64, 4);
    g.lineTo(128, 60);
    g.moveTo(0, 4);
    g.lineTo(64, 60);
    g.lineTo(128, 4);
    g.stroke();
  });

/** A ribbon of quads through matching rows of points (each row a cross-section or a pair of edge points). */
function ribbon(rows: Vector3[][], uv?: (i: number, k: number) => [number, number]): BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < rows[i].length - 1; k++) {
      const quad = [
        [i, k],
        [i + 1, k],
        [i + 1, k + 1],
        [i, k],
        [i + 1, k + 1],
        [i, k + 1],
      ];
      for (const [a, b] of quad) {
        const v = rows[a][b];
        pos.push(v.x, v.y, v.z);
        uvs.push(...(uv ? uv(a, b) : [0, 0]));
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * One bridge: the deck rises from the ground at each end to its clearance over the water (no steeper than a road
 * should be) and is drawn as a box girder with parapets and four lanes; piers stand on the creek bed or the ground
 * wherever the deck is up in the air; lamps line both parapets. Granville's deck rides on a steel deck truss;
 * Burrard's middle span runs between see-through truss walls, with a pair of concrete towers at each end of it.
 */
function buildBridge(br: Bridge, world: World): Group {
  const { lowEnd, mats } = world;
  const g = new Group();
  const [ax, az] = br.a;
  const [bx, bz] = br.b;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  // across the deck, to the right of a → b
  const rx = -uz;
  const rz = ux;
  const h = br.half;
  const n = Math.ceil(L / 2) + 1;
  const T = Array.from({ length: n }, (_, i) => (i * L) / (n - 1));
  const at = (t: number, lat: number): [number, number] => [ax + ux * t + rx * lat, az + uz * t + rz * lat];
  const wet = T.map((t) => sdfAt(...at(t, 0)) < 0);
  const i0 = wet.indexOf(true);
  const i1 = wet.lastIndexOf(true);
  const ground = T.map((t) => Math.max(...[-h, 0, h].map((l) => groundAt(...at(t, l)))));
  const raw = T.map((_, i) => (wet[i] ? SEA + br.clear * (0.88 + 0.12 * Math.sin((Math.PI * (i - i0)) / Math.max(1, i1 - i0))) : ground[i] + 0.4));
  // no steeper than the grade from any high point
  const grade = br.kind === "deckTruss" ? 0.11 : 0.13;
  const deck = T.map((t) => Math.max(...raw.map((r, j) => r - grade * Math.abs(t - T[j]))));
  const depth = br.kind === "girder" ? 1.5 : br.kind === "deckTruss" ? 0.7 : 1.2;
  const P = (t: number, lat: number, y: number) => {
    const [x, z] = at(t, lat);
    return new Vector3(x, y, z);
  };
  const concrete = cityToned(world, new MeshStandardMaterial({ color: 0xd3cec4, roughness: 0.85, side: DoubleSide }), 0);
  // the girder and its parapets as one extruded cross-section (lateral, height over the road)
  const section: [number, number][] = [
    [-h - 0.3, 0.9],
    [-h, 0.9],
    [-h, 0.02],
    [h, 0.02],
    [h, 0.9],
    [h + 0.3, 0.9],
    [h + 0.3, -depth],
    [-h - 0.3, -depth],
    [-h - 0.3, 0.9],
  ];
  const shell = new Mesh(ribbon(T.map((t, i) => section.map(([l, v]) => P(t, l, deck[i] + v)))), concrete);
  shell.castShadow = !lowEnd;
  shell.receiveShadow = true;
  const road = new Mesh(
    ribbon(
      T.map((t, i) => [P(t, -h, deck[i] + 0.04), P(t, h, deck[i] + 0.04)]),
      (i, k) => [k, T[i] / 8],
    ),
    cityToned(world, new MeshStandardMaterial({ map: roadTexture(), roughness: 0.9 }), 0),
  );
  road.receiveShadow = true;
  g.add(shell, road);
  // piers wherever the deck is up in the air, and an abutment at an end that stays above the ground
  const pierEvery = br.kind === "deckTruss" ? 14 : br.kind === "throughTruss" ? 11 : 9;
  const below = br.kind === "deckTruss" ? depth + 3.4 : depth;
  const piers: Part[] = [];
  for (let i = 0; i < n; i++) {
    if (i % Math.round(pierEvery / 2) !== 0) continue;
    const base = wet[i] ? SEA - 2.5 : ground[i] - 0.3;
    const top = deck[i] - below;
    if (top - base < 1.2) continue;
    const H = top - base;
    const [cx, cz] = at(T[i], 0);
    for (const s of [-1, 1]) {
      const [px, pz] = at(T[i], s * (h - 0.9));
      piers.push({ geo: new CylinderGeometry(br.kind === "deckTruss" ? 0.75 : 0.55, br.kind === "deckTruss" ? 0.9 : 0.6, H, 10), position: [px, base + H / 2, pz] });
    }
    piers.push({ geo: new BoxGeometry(2 * h + 0.6, 0.8, 1.4), position: [cx, top - 0.4, cz], rotation: [0, Math.atan2(ux, uz), 0] });
  }
  for (const i of [0, n - 1]) {
    const lift = deck[i] - depth - ground[i];
    if (lift < 0.3) continue;
    const [cx, cz] = at(T[i], 0);
    piers.push({ geo: new BoxGeometry(2 * h + 0.6, lift + 1, 1.6), position: [cx, ground[i] + lift / 2 - 0.5, cz], rotation: [0, Math.atan2(ux, uz), 0] });
  }
  if (piers.length) {
    const pierMesh = new Mesh(merged(piers), concrete);
    pierMesh.castShadow = !lowEnd;
    g.add(pierMesh);
  }
  // lamps along both parapets
  const posts: Part[] = [];
  const heads: Part[] = [];
  for (let t = 4; t < L - 2; t += 10) {
    const i = Math.round((t / L) * (n - 1));
    for (const s of [-1, 1]) {
      const [px, pz] = at(t, s * (h + 0.15));
      posts.push({ geo: new CylinderGeometry(0.07, 0.09, 2.8, 5), position: [px, deck[i] + 2.3, pz] });
      const [hx, hz] = at(t, s * (h - 0.35));
      heads.push({ geo: new BoxGeometry(0.6, 0.14, 0.3), position: [hx, deck[i] + 3.65, hz], rotation: [0, Math.atan2(ux, uz) + Math.PI / 2, 0] });
    }
  }
  if (posts.length) g.add(new Mesh(merged(posts), mats.post), new Mesh(merged(heads), mats.lamp));
  // the steel: Granville's deck truss under the deck where it is high, Burrard's truss walls and towers over the water
  if (br.kind === "deckTruss") {
    const tex = trussTexture("#58695f");
    const steel = cityToned(world, new MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, roughness: 0.6, metalness: 0.3 }), 0);
    const high = T.map((_, i) => deck[i] - depth - 3.4 - (wet[i] ? SEA : ground[i]) > 0.8);
    const sides: BufferGeometry[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) {
        for (const s of [-1, 1]) {
          sides.push(
            ribbon(
              run.map((i) => [P(T[i], s * (h - 0.2), deck[i] - depth - 3.4), P(T[i], s * (h - 0.2), deck[i] - depth)]),
              (a, k) => [T[run[a]] / 6, k],
            ),
          );
        }
      }
      run = [];
    };
    for (let i = 0; i < n; i++) {
      if (high[i]) run.push(i);
      else flush();
    }
    flush();
    if (sides.length) g.add(new Mesh(merge(sides), steel));
  } else if (br.kind === "throughTruss" && i0 >= 0) {
    const tex = trussTexture("#6f8174");
    const steel = cityToned(world, new MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, roughness: 0.6, metalness: 0.3 }), 0);
    // the middle of the water span, between the towers
    const s0 = i0 + Math.round((i1 - i0) * 0.28);
    const s1 = i1 - Math.round((i1 - i0) * 0.28);
    const idx = Array.from({ length: s1 - s0 + 1 }, (_, k) => s0 + k);
    const walls2 = [-1, 1].map((s) =>
      ribbon(
        idx.map((i) => [P(T[i], s * (h + 0.35), deck[i] + 0.9), P(T[i], s * (h + 0.35), deck[i] + 6.4)]),
        (a, k) => [(T[idx[a]] - T[s0]) / 6, k],
      ),
    );
    const braces: Part[] = [];
    for (let i = s0; i <= s1; i += 3) {
      const [cx, cz] = at(T[i], 0);
      braces.push({ geo: new BoxGeometry(2 * h + 0.9, 0.3, 0.3), position: [cx, deck[i] + 6.3, cz], rotation: [0, Math.atan2(ux, uz), 0] });
    }
    // the towers: a pair at each end of the truss, joined by a portal over the road
    for (const i of [s0, s1]) {
      const base = wet[i] ? SEA - 2.5 : ground[i];
      const topY = deck[i] + 9.5;
      for (const s of [-1, 1]) {
        const [px, pz] = at(T[i], s * (h + 1.5));
        braces.push({ geo: new BoxGeometry(2.2, topY - base, 2.4), position: [px, (topY + base) / 2, pz], rotation: [0, Math.atan2(ux, uz), 0] });
        braces.push({ geo: new BoxGeometry(1.6, 1.4, 1.8), position: [px, topY + 0.7, pz], rotation: [0, Math.atan2(ux, uz), 0] });
      }
      const [cx, cz] = at(T[i], 0);
      braces.push({ geo: new BoxGeometry(2 * h + 5.2, 1.2, 2), position: [cx, deck[i] + 7.6, cz], rotation: [0, Math.atan2(ux, uz), 0] });
    }
    g.add(new Mesh(merge(walls2), steel), new Mesh(merged(braces), concrete));
  }
  return g;
}

/** Cambie, Granville and Burrard Bridges over False Creek. */
export function buildBridges(world: World): Built {
  const g = new Group();
  for (const br of BRIDGES) g.add(buildBridge(br, world));
  return { group: g };
}

/* ------------------------------------------------------------------ the Waterfront hub */

/**
 * The hub towers' skin: pale glass with the floor plates showing through, slim mullions, and a white lattice of
 * diagonals over it, one diamond to a tile; the night glow lights most floors.
 */
const latticeTexture = () =>
  facade(
    128,
    128,
    (g) => {
      const gr = g.createLinearGradient(0, 0, 128, 128);
      gr.addColorStop(0, "#bcd4e4");
      gr.addColorStop(0.5, "#8fb0c8");
      gr.addColorStop(1, "#a9c4d8");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      // the floor plates through the glass, and the mullions
      g.fillStyle = "#eef3f5";
      for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 2.5);
      g.fillStyle = "rgba(120,150,170,0.35)";
      for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 1, 128);
    },
    (g, lit) => {
      // the floors between the plates: by day a faint band; at night runs of lit offices with dark breaks
      let k = 0;
      for (let y = 0; y < 128; y += 16) {
        if (!lit) {
          g.fillStyle = "rgba(120,160,185,0.22)";
          g.fillRect(0, y + 3, 128, 12);
          continue;
        }
        for (let x = 0; x < 128; ) {
          const run = 10 + ((k * 37 + y * 3) % 34);
          if ((k * 7 + y) % 5 < 3) {
            g.fillStyle = WARM[k % 4];
            g.fillRect(x, y + 3, run, 12);
          }
          x += run + 2;
          k++;
        }
      }
      // the lattice over the glass: white by day, a dark line across the lit floors at night
      g.strokeStyle = lit ? "#000" : "#fbfcfc";
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(128, 128);
      g.moveTo(128, 0);
      g.lineTo(0, 128);
      g.moveTo(64, 0);
      g.lineTo(0, 64);
      g.moveTo(64, 0);
      g.lineTo(128, 64);
      g.moveTo(0, 64);
      g.lineTo(64, 128);
      g.moveTo(128, 64);
      g.lineTo(64, 128);
      g.stroke();
    },
  );

/** A space frame seen from above: a square grid with its diagonals, in `line` over glass of opacity `glass`. */
const spaceFrameTexture = (line: string, glass: number) => {
  const t = canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    if (glass > 0) {
      g.fillStyle = `rgba(214,232,242,${glass})`;
      g.fillRect(0, 0, 128, 128);
    }
    g.strokeStyle = line;
    g.lineWidth = 3;
    g.beginPath();
    for (const v of [0, 64, 128]) {
      g.moveTo(v, 0);
      g.lineTo(v, 128);
      g.moveTo(0, v);
      g.lineTo(128, v);
    }
    g.moveTo(0, 0);
    g.lineTo(128, 128);
    g.moveTo(128, 0);
    g.lineTo(0, 128);
    g.stroke();
  });
  return t;
};

/** A flat grid at height y over a rectangle (local x0..x1, z0..z1), its uvs one tile per `tile` units, facing up. */
function slab(x0: number, x1: number, z0: number, z1: number, y: number, tile: number, lift = 0): BufferGeometry {
  const nx = Math.max(1, Math.round((x1 - x0) / 2));
  const nz = Math.max(1, Math.round((z1 - z0) / 2));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const z = z0 + ((z1 - z0) * j) / nz;
      // a gentle vault across the short side
      const u = (z - z0) / (z1 - z0);
      pos.push(x, y + lift * Math.sin(u * Math.PI), z);
      uv.push(x / tile, z / tile);
      if (i < nx && j < nz) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The Waterfront hub (waterfrontHub.ts lays it out): the deck on its piles, the stepped glass towers in their white
 * lattice with a white slab edge at every step and the maintenance frame on the tallest, the canopy (glass over a
 * timber lattice on slim white columns) and the gallery out into the inlet with its end pavilion. Lit floors, a
 * faintly glowing canopy and their reflections after dark.
 */
export function buildWaterfrontHub(l: PlacedLandmark, world: World): Built {
  const { lowEnd, envTex, mats } = world;
  const g = new Group();
  const deck = HUB_DECK - l.padY;
  const water = SEA - l.padY;
  const D = HUB_DECK_BOX;
  const white = cityToned(world, new MeshStandardMaterial({ color: 0xf4f5f3, roughness: 0.45, metalness: 0.1 }), 0);
  // the deck, its edge and the piles under it, and the gallery's
  const deckParts: BufferGeometry[] = [paint(new BoxGeometry(D.x1 - D.x0, 1.2, D.z1 - D.z0).translate((D.x0 + D.x1) / 2, deck - 0.6, (D.z0 + D.z1) / 2), 0xbcb8ae)];
  const G = HUB_GALLERY;
  deckParts.push(paint(new BoxGeometry(G.half * 2 + 2, 0.8, G.z0 - G.z1).translate(G.x, deck - 0.4, (G.z0 + G.z1) / 2), 0xb08a5e));
  const piles: [number, number][] = [];
  for (let x = D.x0 + 2; x < D.x1; x += 5) for (let z = D.z0 + 2; z < D.z1; z += 5) if (x < D.x0 + 3 || x > D.x1 - 4 || z < D.z0 + 3 || z > D.z1 - 4) piles.push([x, z]);
  for (let z = G.z0 - 3; z > G.z1; z -= 5) for (const s of [-1, 1]) piles.push([G.x + s * (G.half + 0.6), z]);
  for (const [x, z] of piles) deckParts.push(paint(new CylinderGeometry(0.35, 0.35, deck - water + 2.4, 6).translate(x, (deck + water - 2.4) / 2 - 0.6, z), 0x5d5850));
  const deckMesh = new Mesh(merge(deckParts), cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 0));
  deckMesh.receiveShadow = true;
  // the towers
  const lt = latticeTexture();
  const glassMat = cityToned(world, new MeshStandardMaterial({ map: lt.map, emissiveMap: lt.glow, emissive: 0xffffff, roughness: 0.18, metalness: 0.35, envMap: envTex, envMapIntensity: 0.9 }), 0.8);
  const towerWalls: BufferGeometry[] = [];
  const edges: BufferGeometry[] = [];
  const roofs: BufferGeometry[] = [];
  for (const b of HUB_BLOCKS) {
    const ring = rect(b.x1 - b.x0, b.z1 - b.z0, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    towerWalls.push(walls(ring, deck, deck + b.h, { uPer: 8, vPer: 8, vFrom: deck }));
    roofs.push(cap(ring, deck + b.h));
    // the white slab edge round each roof, a little proud of the glass
    edges.push(walls(rect(b.x1 - b.x0 + 0.5, b.z1 - b.z0 + 0.5, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), deck + b.h - 0.5, deck + b.h + 0.6));
    edges.push(cap(rect(b.x1 - b.x0 + 0.5, b.z1 - b.z0 + 0.5, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), deck + b.h + 0.6));
  }
  const towers = new Mesh(merge(towerWalls), glassMat);
  towers.castShadow = !lowEnd;
  // the roofs are gardens (the trees on them come from the tree layer)
  const roofMesh = new Mesh(merge(roofs.map((r) => r.translate(0, 0.05, 0))), mats.roofGreen);
  // the maintenance frame on the tallest: two white posts and a beam reaching out over the edge
  const top = HUB_BLOCKS.reduce((a, b) => (b.h > a.h ? b : a));
  const ty = deck + top.h + 0.6;
  for (const x of [top.x0 + 2, top.x1 - 2]) edges.push(new BoxGeometry(0.7, 9, 0.7).translate(x, ty + 4.5, (top.z0 + top.z1) / 2));
  edges.push(new BoxGeometry(top.x1 - top.x0, 0.8, 0.8).translate((top.x0 + top.x1) / 2, ty + 9, (top.z0 + top.z1) / 2));
  edges.push(new BoxGeometry(0.6, 0.6, 9).translate(top.x1 - 2, ty + 8.4, top.z0 - 1.5));
  // the canopy: glass over a timber lattice, a gentle vault, on slim white columns
  const C = HUB_CANOPY;
  const glassTop = spaceFrameTexture("rgba(250,251,252,0.95)", 0.28);
  const canopyMat = new MeshStandardMaterial({ map: glassTop, transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.15, metalness: 0.2, envMap: envTex, envMapIntensity: 0.8, emissive: 0xffe2b8, emissiveIntensity: 0 });
  const timberMat = cityToned(world, new MeshStandardMaterial({ map: spaceFrameTexture("#b9824a", 0), alphaTest: 0.5, side: DoubleSide, roughness: 0.7, emissive: 0xffc98a, emissiveIntensity: 0 }), 0);
  const canopy = new Mesh(slab(C.x0, C.x1, C.z0, C.z1, deck + C.h, 6, 1.4), canopyMat);
  canopy.renderOrder = 2;
  const lattice = new Mesh(slab(C.x0 + 0.3, C.x1 - 0.3, C.z0 + 0.3, C.z1 - 0.3, deck + C.h - 0.9, 3, 1.4), timberMat);
  for (let x = C.x0 + 3; x < C.x1; x += 8) for (const z of [C.z0 + 2, C.z1 - 2]) edges.push(new CylinderGeometry(0.22, 0.28, C.h, 8).translate(x, deck + C.h / 2, z));
  // the gallery: glass walls under a glass roof, the pavilion at its end two storeys high
  const galleryGlass: BufferGeometry[] = [walls(rect(G.half * 2, G.z0 - G.z1 - 10, G.x, (G.z0 + G.z1 - 10) / 2 + 5), deck, deck + 5, { uPer: 8, vPer: 16 })];
  const pav = rect(G.half * 2 + 7, 10, G.x, G.z1 + 5);
  galleryGlass.push(walls(pav, deck, deck + 9, { uPer: 8, vPer: 16 }));
  const galleryMesh = new Mesh(merge(galleryGlass), glassMat);
  const galleryRoof = new Mesh(merge([slab(G.x - G.half - 0.4, G.x + G.half + 0.4, G.z1 + 10, G.z0, deck + 5.1, 6, 0.6), slab(G.x - G.half - 4, G.x + G.half + 4, G.z1, G.z1 + 10, deck + 9.1, 6, 0.8)]), canopyMat);
  galleryRoof.renderOrder = 2;
  const whiteMesh = new Mesh(merge(edges), white);
  whiteMesh.castShadow = !lowEnd;
  // its lit floors show in the inlet after dark
  const warm = new Color();
  world.events.followers.push((level) => {
    const n = nightOf(level);
    canopyMat.emissiveIntensity = 0.35 * n;
    timberMat.emissiveIntensity = 0.5 * n;
    canopyMat.envMapIntensity = 0.8 * (1 - 0.85 * n);
    warm.setHex(0xffd29a).multiplyScalar(n);
  });
  g.add(deckMesh, towers, roofMesh, whiteMesh, lattice, canopy, galleryMesh, galleryRoof);
  addReflections(
    HUB_BLOCKS.slice(0, 3).map((b) => ({ x: l.px + (b.x0 + b.x1) / 2, z: l.pz + b.z0, y: HUB_DECK, h: b.h, w: b.x1 - b.x0, col: warm, gain: 0.35 })),
  );
  return { group: g };
}

/* ------------------------------------------------------------------ the Convention Centre and the harbourfront */

/**
 * Three floors of glass to the floor, a slab at each floor in white, the timber ceilings warm behind the glass; slim
 * mullions. After dark the halls light warm and the ceilings glow.
 */
const hallTexture = () =>
  facade(
    64,
    64,
    (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 64);
      grd.addColorStop(0, "#5f7d96");
      grd.addColorStop(1, "#2c4154");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    },
    (g, lit) => {
      if (lit) {
        g.fillStyle = "#ffd9a8";
        g.globalAlpha = 0.6;
        g.fillRect(0, 8, 64, 48);
        g.globalAlpha = 1;
      }
      // the timber ceiling under each slab, the slab, the mullions
      g.fillStyle = lit ? "#ffc27a" : "#c8955a";
      g.fillRect(0, 2, 64, 6);
      g.fillStyle = lit ? "#000" : "#eef0f1";
      g.fillRect(0, 0, 64, 2);
      g.fillRect(0, 58, 64, 6);
      for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 2, 64);
    },
  );

/** The part of a convex polygon (x, z) where k0 <= x·dx + z·dz < k1 (Sutherland–Hodgman against both lines). */
function band(poly: P2[], dx: number, dz: number, k0: number, k1: number): P2[] {
  const clip = (pts: P2[], keep: (pt: P2) => number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const fa = keep(a);
      const fb = keep(b);
      if (fa >= 0) out.push(a);
      if (fa >= 0 !== fb >= 0) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return clip(
    clip(poly, ([x, z]) => x * dx + z * dz - k0),
    ([x, z]) => k1 - (x * dx + z * dz),
  );
}

/** Whether a triangle of (x, z) points faces up as given (else it needs two of them swapped). */
const facesUp = (t: P2[]) => (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) - (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) > 0;

/**
 * A plane of the living roof over a convex outline, at the height `y` gives each point: meadow grasses in diagonal
 * drifts of green and gold (as the real roof's are), a white fascia round its edge, dark lightwells cut through it,
 * and (on the cantilevered prow) a timber soffit under it.
 */
function meadowPlane(poly: P2[], y: (x: number, z: number) => number, wells: P2[][], soffit = false): BufferGeometry[] {
  const pos: number[] = [];
  const col: number[] = [];
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const tones = [0x6f8f3a, 0x84993f, 0xa39552, 0x76913f, 0x5f863a, 0x9a9a4a, 0x7d9a45, 0xb09a58];
  const dx = 0.86;
  const dz = 0.51;
  const ks = poly.map(([x, z]) => x * dx + z * dz);
  const BW = 1.7;
  for (let k = Math.floor(Math.min(...ks) / BW); k * BW < Math.max(...ks); k++) {
    const piece = band(poly, dx, dz, k * BW, (k + 1) * BW);
    if (piece.length < 3) continue;
    const hex = tones[((k % tones.length) + tones.length) % tones.length];
    const c = [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
    // a fan from the first point
    for (let i = 1; i + 1 < piece.length; i++) {
      const tri = [piece[0], piece[i], piece[i + 1]];
      for (const [x, z] of facesUp(tri) ? tri : [tri[0], tri[2], tri[1]]) {
        pos.push(x, y(x, z), z);
        col.push(...c);
      }
    }
  }
  const grass = new BufferGeometry();
  grass.setAttribute("position", new Float32BufferAttribute(pos, 3));
  grass.setAttribute("color", new Float32BufferAttribute(col, 3));
  grass.setAttribute("uv", new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  grass.computeVertexNormals();
  const out: BufferGeometry[] = [grass];
  // the fascia: a white band down from the roof's edge
  const fas: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const ya = y(ax, az);
    const yb = y(bx, bz);
    fas.push(ax, ya + 0.12, az, ax, ya - 0.5, az, bx, yb + 0.12, bz, bx, yb + 0.12, bz, ax, ya - 0.5, az, bx, yb - 0.5, bz);
  }
  const fg = new BufferGeometry();
  fg.setAttribute("position", new Float32BufferAttribute(fas, 3));
  out.push(paint(fg, 0xf1f2ee));
  // lightwells: dark slots lying just on the grass
  for (const [a, b, c2, d] of wells) {
    const q4: number[] = [];
    for (const [x, z] of facesUp([a, b, c2]) ? [a, b, c2, a, c2, d] : [a, c2, b, a, d, c2]) q4.push(x, y(x, z) + 0.04, z);
    const wg = new BufferGeometry();
    wg.setAttribute("position", new Float32BufferAttribute(q4, 3));
    out.push(paint(wg, 0x1d2126));
  }
  // under the cantilever, a timber soffit facing down
  if (soffit) {
    const s: number[] = [];
    for (let i = 1; i + 1 < poly.length; i++) {
      const tri = [poly[0], poly[i], poly[i + 1]];
      for (const [x, z] of facesUp(tri) ? [tri[0], tri[2], tri[1]] : tri) s.push(x, y(x, z) - 0.45, z);
    }
    const sg = new BufferGeometry();
    sg.setAttribute("position", new Float32BufferAttribute(s, 3));
    out.push(paint(sg, 0xc8955a));
  }
  return out;
}

/**
 * The Convention Centre West (harbourfront.ts CONVENTION, built in its turned frame: x along the shore, the water at
 * -z), after the real building:
 * - three floors of glass halls on a stone plinth, the seaward third on piles over the water;
 * - the west end drawn to a prow toward the inlet under a cantilevered roof on one raking white strut;
 * - a six-acre living roof in three folded planes: the long east plane, the prow's plane rising to its tip, and a
 *   lower plane falling to the city, a glazed slot between the first two and a clerestory where the lower one meets them;
 * - meadow grasses in diagonal drifts, white fascias, dark lightwells;
 * - a tall glass lobby at the east end onto Jack Poole Plaza and an entrance canopy on the city side;
 * - the Drop, the tall blue raindrop, leaning out over the promenade at the west end.
 */
export function buildConvention(world: World): Built {
  const { lowEnd } = world;
  const { w: W, d: D, h: H } = CONVENTION;
  const g = new Group();
  // the halls' outline: square along the water and the city, drawn to a point at the west end
  const ring: P2[] = [
    [-17, -D / 2],
    [W / 2, -D / 2],
    [W / 2, D / 2],
    [-12, D / 2],
    [-23, -3],
  ];
  const solid: BufferGeometry[] = [
    paint(new BoxGeometry(W + 1.2, 1.4, D + 1.2).translate(0, -0.6, 0), 0xb9b4aa),
    // the east lobby's roof slab, the entrance canopy
    paint(new BoxGeometry(4.4, 0.4, 11).translate(W / 2 + 2, H + 2.2, 0), 0xf1f2ee),
    paint(new BoxGeometry(14, 0.3, 3.4).translate(-2, 4.6, D / 2 + 1.7), 0xf1f2ee),
  ];
  for (const x of [-8, -4, 0, 4]) solid.push(paint(new CylinderGeometry(0.16, 0.16, 4.5, 8).translate(x, 2.25, D / 2 + 3), 0xe6e9ec));
  // planters with clipped hedges along the seawall side
  for (let x = -W / 2 + 7; x <= W / 2 - 3; x += 6) {
    solid.push(paint(new BoxGeometry(4.6, 0.8, 1.2).translate(x, 0.4, -D / 2 - 1.2), 0xc9c6bd));
    solid.push(paint(new BoxGeometry(4.2, 0.6, 0.9).translate(x, 1.05, -D / 2 - 1.2), 0x4f7a3c));
  }
  // the halls and the lobby's glass, three floors, lit with the city
  const ht = hallTexture();
  const hallMat = cityToned(world, new MeshStandardMaterial({ map: ht.map, emissiveMap: ht.glow, emissive: 0xffffff, roughness: 0.15, metalness: 0.35, envMap: world.envTex, envMapIntensity: 0.9 }), 0.8);
  const halls = new Mesh(merge([walls(ring, 0, H, { uPer: 3, vPer: H / 3 }), walls(rect(4, 10, W / 2 + 2, 0), 0, H + 2.2, { uPer: 3, vPer: H / 3 })]), hallMat);
  // the roof's three planes: the long east one rising toward the city, the prow's rising to its tip, the lower one
  // falling to the city; the prow's reaches out past the glass
  const yEast = (_x: number, z: number) => H + 0.35 + 0.19 * (z + D / 2 + 0.8);
  const yProw = (x: number, z: number) => H + 0.6 + 0.19 * (z + D / 2 + 0.8) + 0.13 * Math.max(0, -4.5 - x);
  const yCity = (_x: number, z: number) => H + 0.95 - 0.16 * (z - 2.5);
  const roofParts = [
    ...meadowPlane(
      [
        [-3, -D / 2 - 0.8],
        [W / 2 + 0.8, -D / 2 - 0.8],
        [W / 2 + 0.8, 2.5],
        [-3, 2.5],
      ],
      yEast,
      [
        [
          [8, -4.6],
          [16, -4.6],
          [16, -3.6],
          [8, -3.6],
        ],
      ],
    ),
    ...meadowPlane(
      [
        [-4.5, -D / 2 - 0.8],
        [-4.5, 2.5],
        [-12.6, 2.5],
        [-27, -3.6],
        [-18, -D / 2 - 0.8],
      ],
      yProw,
      [
        [
          [-16, -3.4],
          [-9, -3.4],
          [-9, -2.4],
          [-16, -2.4],
        ],
      ],
      true,
    ),
    ...meadowPlane(
      [
        [-12.6, 2.5],
        [W / 2 + 0.8, 2.5],
        [W / 2 + 0.8, D / 2 + 0.8],
        [-9.5, D / 2 + 0.8],
      ],
      yCity,
      [
        [
          [2, 4.2],
          [9, 4.2],
          [9, 5.3],
          [2, 5.3],
        ],
        [
          [-6, 4.6],
          [-2, 4.6],
          [-2, 5.7],
          [-6, 5.7],
        ],
      ],
    ),
  ];
  // glass: the slot between the east and prow planes, and the clerestory where the city plane meets them
  const glass: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => glass.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([-4.5, H + 0.45, -D / 2], [-3, H + 0.45, -D / 2], [-3, H + 0.45, 2.5], [-4.5, H + 0.45, 2.5]);
  const clerestoryTop = (x: number) => (x > -3.75 ? yEast(x, 2.5) : yProw(x, 2.5)) - 0.4;
  for (let k = 0; k < 16; k++) {
    const x0 = -12.6 + ((W / 2 + 12.6) * k) / 16;
    const x1 = -12.6 + ((W / 2 + 12.6) * (k + 1)) / 16;
    quad([x0, yCity(x0, 2.5), 2.5], [x1, yCity(x1, 2.5), 2.5], [x1, clerestoryTop(x1), 2.5], [x0, clerestoryTop(x0), 2.5]);
  }
  const glassGeo = new BufferGeometry();
  glassGeo.setAttribute("position", new Float32BufferAttribute(glass, 3));
  glassGeo.computeVertexNormals();
  const skylights = new Mesh(glassGeo, world.mats.pane);
  // the prow's raking strut, from the plinth at the point up to the roof's tip
  const foot = new Vector3(-21.2, 0.1, -4.6);
  const head = new Vector3(-25.6, yProw(-25.6, -3.8) - 0.5, -3.8);
  const len = foot.distanceTo(head);
  solid.push(
    paint(
      new CylinderGeometry(0.32, 0.4, len, 10)
        .applyQuaternion(q.setFromUnitVectors(UPV, p.subVectors(head, foot).normalize()))
        .translate((foot.x + head.x) / 2, (foot.y + head.y) / 2, (foot.z + head.z) / 2),
      0xf1f2ee,
    ),
  );
  // the seaward third stands on piles over the water, down from the building's plinth
  const below = -1.3 - (SEA - 1.5);
  for (let x = -W / 2 + 4; x <= W / 2 - 2; x += 4) {
    for (const z of [-D / 2 + 0.6, -D / 2 + 3.4]) solid.push(paint(new CylinderGeometry(0.35, 0.35, Math.max(0.5, below + 3), 8).translate(x, -1.3 - Math.max(0.5, below + 3) / 2, z), 0x6b6862));
  }
  // the Drop: a tall blue raindrop leaning out over the promenade at the west end
  solid.push(paint(new SphereGeometry(1, 16, 12).scale(0.7, 3.4, 0.7).rotateZ(0.22).translate(-18.5, 3.1, -D / 2 - 3.6), 0x2f8fd8));
  // the meadow roof with the rest: one mesh
  const solidMesh = new Mesh(merge([...solid, ...roofParts]), cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: DoubleSide })));
  solidMesh.receiveShadow = true;
  solidMesh.castShadow = !lowEnd;
  g.add(halls, solidMesh, skylights);
  return { group: g };
}

/**
 * The harbourfront round it, in world space (harbourfront.ts): Jack Poole Plaza paved in granite with a row of flags
 * and its trees in planters, the seawall promenade's railing along the water and lamps along its inland edge (lit
 * after dark), benches facing the water. The promenade's own paving is the ground's (one of its walks); the trees are
 * the tree layer's.
 */
export function buildHarbourfront(world: World): Built {
  const { lowEnd, events } = world;
  const g = new Group();
  const stride = lowEnd ? 2 : 1;
  // the plaza: granite pavers on a grid draped on the ground, a darker band every few
  const step = 0.75;
  const pos: number[] = [];
  const col: number[] = [];
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const tone = (x: number, z: number) => {
    const band = Math.floor(x / 3) % 4 === 0 || Math.floor(z / 3) % 4 === 0;
    const v = band ? 0.62 : 0.78 + 0.04 * Math.sin(x * 3.1 + z * 1.7);
    return [lin(v), lin(v * 0.99), lin(v * 0.96)];
  };
  const xs = PLAZA.map(([x]) => x);
  const zs = PLAZA.map(([, z]) => z);
  for (let x = Math.min(...xs); x < Math.max(...xs); x += step) {
    for (let z = Math.min(...zs); z < Math.max(...zs); z += step) {
      const quad: [number, number][] = [
        [x, z],
        [x, z + step],
        [x + step, z],
        [x + step, z],
        [x, z + step],
        [x + step, z + step],
      ];
      if (quad.some(([a, b]) => polySdf(PLAZA, a, b) > 0.2)) continue;
      const c = tone(x + step / 2, z + step / 2);
      for (const [a, b] of quad) {
        pos.push(a, surfaceAt(a, b, stride) + 0.13, b);
        col.push(...c);
      }
    }
  }
  // the forecourt at the foot of the Canada Place pier: only the pier's own deck (the shoreline's water, raised), and
  // short of the Waterfront set, which paves its own
  const d0 = SET_RECT[0] as [number, number, number, number];
  for (let x = FORECOURT.x0; x < FORECOURT.x1; x += step) {
    for (let z = FORECOURT.z0; z < FORECOURT.z1; z += step) {
      const cx = x + step / 2;
      const cz = z + step / 2;
      const [da, dl] = toStation(0, cx, cz);
      if (sdfAt(cx, cz) >= 0.6 || surfaceAt(cx, cz, stride) < SEA + 0.4 || (da > d0[0] - 1 && da < d0[1] + 1 && dl > d0[2] - 1 && dl < d0[3] + 1)) continue;
      const c = tone(cx, cz);
      for (const [a, b] of [
        [x, z],
        [x, z + step],
        [x + step, z],
        [x + step, z],
        [x, z + step],
        [x + step, z + step],
      ]) {
        pos.push(a, surfaceAt(a, b, stride) + 0.13, b);
        col.push(...c);
      }
    }
  }
  const paveGeo = new BufferGeometry();
  paveGeo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  paveGeo.setAttribute("color", new Float32BufferAttribute(col, 3));
  paveGeo.computeVertexNormals();
  // the paving lies in the painted mesh with the railing, lamps and benches
  // the promenade's height: the ground, or the deck where it runs over the water
  const walkY = (x: number, z: number) => (sdfAt(x, z) < 0.8 ? DECK_Y : surfaceAt(x, z, stride));
  // the railing on the water side of the promenade and the lamps on its inland side
  const parts: BufferGeometry[] = [];
  // over the water, a timber deck on piles
  for (let i = 1; i < PROMENADE.length; i++) {
    const [ax, az] = PROMENADE[i - 1];
    const [bx, bz] = PROMENADE[i];
    if (sdfAt((ax + bx) / 2, (az + bz) / 2) >= 0.8) continue;
    const L = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    parts.push(paint(new BoxGeometry(PROMENADE_W + 0.6, 0.35, L + 0.1).rotateY(ry).translate((ax + bx) / 2, DECK_Y - 0.17, (az + bz) / 2), 0xb08a64));
    parts.push(paint(new CylinderGeometry(0.22, 0.22, DECK_Y - SEA + 2, 6).translate(ax, (DECK_Y + SEA - 2) / 2, az), 0x5c5a55));
  }
  const lampAt: [number, number, number][] = [];
  let run = 0;
  for (let i = 1; i < PROMENADE.length; i++) {
    const [ax, az] = PROMENADE[i - 1];
    const [bx, bz] = PROMENADE[i];
    const L = Math.hypot(bx - ax, bz - az);
    // the inland normal (-t.z, t.x) of the eastward tangent; the water is the other way
    const nx = -(bz - az) / L;
    const nz = (bx - ax) / L;
    const off = PROMENADE_W / 2 + 0.1;
    const rx0 = ax - nx * off;
    const rz0 = az - nz * off;
    const rx1 = bx - nx * off;
    const rz1 = bz - nz * off;
    const y0 = walkY(rx0, rz0);
    const y1 = walkY(rx1, rz1);
    const ry = Math.atan2(rx1 - rx0, rz1 - rz0);
    const mx = (rx0 + rx1) / 2;
    const mz = (rz0 + rz1) / 2;
    parts.push(paint(new BoxGeometry(0.08, 0.08, L + 0.05).rotateY(ry).translate(mx, (y0 + y1) / 2 + 1.05, mz), 0xe6e9ec));
    parts.push(paint(new BoxGeometry(0.06, 0.06, L + 0.05).rotateY(ry).translate(mx, (y0 + y1) / 2 + 0.55, mz), 0xb9c0c7));
    parts.push(paint(new BoxGeometry(0.1, 1.1, 0.1).translate(rx0, y0 + 0.55, rz0), 0xb9c0c7));
    run += L;
    if (run >= 6) {
      run = 0;
      const lx = ax + nx * (PROMENADE_W / 2 + 0.35);
      const lz = az + nz * (PROMENADE_W / 2 + 0.35);
      if (!inConvention(lx, lz, 0.5)) {
        const ly = walkY(lx, lz);
        parts.push(paint(new CylinderGeometry(0.06, 0.09, 3.4, 6).translate(lx, ly + 1.7, lz), 0x3a3f46));
        lampAt.push([lx, ly + 3.45, lz]);
      }
    }
  }
  // benches: a timber seat and back on two steel legs, facing the water
  for (const b of harbourfrontBenches()) {
    const y = walkY(b.x, b.z);
    const bench = merge([
      paint(new BoxGeometry(1.8, 0.1, 0.5).translate(0, 0.45, 0), 0x9a7048),
      paint(new BoxGeometry(1.8, 0.45, 0.08).translate(0, 0.72, -0.24), 0x9a7048),
      paint(new BoxGeometry(0.08, 0.45, 0.45).translate(-0.75, 0.22, 0), 0x3a3f46),
      paint(new BoxGeometry(0.08, 0.45, 0.45).translate(0.75, 0.22, 0), 0x3a3f46),
    ]);
    parts.push(bench.rotateY(b.ry).translate(b.x, y, b.z));
  }
  // flags along the plaza's city edge, the Olympic plaza's row of poles
  const FLAGS = [0xd52b1e, 0xffffff, 0x2f6bff, 0x2fb36b, 0xf2c230];
  FLAGS.forEach((hex, k) => {
    const x = PLAZA_X[0] + 3 + ((PLAZA_X[1] - PLAZA_X[0] - 6) * k) / (FLAGS.length - 1);
    const z = PLAZA_SOUTH - 3.2;
    const y = surfaceAt(x, z, stride);
    parts.push(paint(new CylinderGeometry(0.06, 0.08, 7, 6).translate(x, y + 3.5, z), 0xe6e9ec));
    parts.push(paint(new BoxGeometry(0.04, 1.1, 1.8).translate(x, y + 6.3, z + 0.95), hex));
  });
  // the forecourt's trees (the tree layer's) in their planters, a bench under each
  for (const [x, z] of FORECOURT_TREES) {
    const y = surfaceAt(x, z, stride);
    parts.push(paint(new BoxGeometry(1.6, 0.5, 1.6).translate(x, y + 0.25, z), 0xa9a49a));
    const bench = merge([
      paint(new BoxGeometry(1.8, 0.1, 0.5).translate(0, 0.45, 0), 0x9a7048),
      paint(new BoxGeometry(0.08, 0.45, 0.45).translate(-0.75, 0.22, 0), 0x3a3f46),
      paint(new BoxGeometry(0.08, 0.45, 0.45).translate(0.75, 0.22, 0), 0x3a3f46),
    ]);
    parts.push(bench.translate(x + 2, y, z));
  }
  // the plaza's trees (planted by the tree layer) each in a granite planter
  for (const t of harbourfrontTrees()) {
    if (polySdf(PLAZA, t.x, t.z) > 0.5) continue;
    parts.push(paint(new BoxGeometry(1.6, 0.5, 1.6).translate(t.x, surfaceAt(t.x, t.z, stride) + 0.25, t.z), 0xa9a49a));
  }
  // the floatplane dock in the bay: a gangway down from the seawall, the float and its fingers, a floatplane alongside
  // each, and the terminal on its own float at the north end
  const D = FLOAT_DOCK;
  const FLOAT = 0xd6d2c9;
  const plank = (x0: number, z0: number, x1: number, z1: number, w: number, y: number) =>
    parts.push(paint(new BoxGeometry(w, 0.35, Math.hypot(x1 - x0, z1 - z0)).rotateY(Math.atan2(x1 - x0, z1 - z0)).translate((x0 + x1) / 2, y, (z0 + z1) / 2), FLOAT));
  {
    const [x0, x1] = D.gangway;
    const y0 = walkY(x0, D.gangwayZ);
    const y1 = SEA + 0.55;
    const L = Math.hypot(x1 - x0, y1 - y0);
    const tilt = Math.atan2(y1 - y0, x1 - x0);
    for (const [w, h, dz, hex] of [
      [1.4, 0.2, 0, 0x9aa3ad],
      [0.06, 0.06, -0.7, 0xe6e9ec],
      [0.06, 0.06, 0.7, 0xe6e9ec],
    ] as const)
      parts.push(paint(new BoxGeometry(L, h, w).rotateZ(tilt).translate((x0 + x1) / 2, (y0 + y1) / 2 + (w < 1 ? 1 : 0), D.gangwayZ + dz), hex));
  }
  plank(D.floatX, D.float[0], D.floatX, D.float[1], 2.2, SEA + 0.35);
  for (const z of D.fingers) plank(D.floatX + 1.1, z, D.fingerTo, z, 0.8, SEA + 0.33);
  parts.push(paint(new BoxGeometry(7, 0.4, 7).translate(D.terminal.x, SEA + 0.35, D.terminal.z), FLOAT));
  D.planes.forEach(([x, z, yaw], k) => parts.push(floatplane([0xe8b23a, 0x2d6cb0, 0xd2452f][k % 3]).rotateY(yaw).translate(x, SEA + 0.02, z)));
  // the terminal and Harbour Green's cafés: glass pavilions on their decks (pavilion.ts), facing the water
  const glass: BufferGeometry[] = [];
  const warm: BufferGeometry[] = [];
  const place = (pc: Pieces, x: number, y: number, z: number, face: [number, number]) => {
    const ry = Math.atan2(face[0], face[1]);
    for (const geo of pc.solid) parts.push(geo.rotateY(ry).translate(x, y, z));
    for (const geo of pc.glass) glass.push(geo.rotateY(ry).translate(x, y, z));
    for (const geo of pc.warm) warm.push(geo.rotateY(ry).translate(x, y, z));
  };
  place(pavilion({ w: 5, d: 4, front: 2.2, umbrella: UMBRELLAS[3], tables: 1 }), D.terminal.x, SEA + 0.25, D.terminal.z, [1, 0]);
  for (const c of GREEN_CAFES) {
    // on the highest ground under its deck
    let y = -Infinity;
    for (const [al, ac] of [
      [-c.d / 2 - 0.8, -c.w / 2 - 0.8],
      [-c.d / 2 - 0.8, c.w / 2 + 0.8],
      [c.d / 2 + 3.4, -c.w / 2 - 0.8],
      [c.d / 2 + 3.4, c.w / 2 + 0.8],
    ])
      y = Math.max(y, surfaceAt(c.x + c.face[0] * al - c.face[1] * ac, c.z + c.face[1] * al + c.face[0] * ac, stride));
    place(pavilion({ w: c.w, d: c.d, umbrella: c.umbrella, well: c.w > 7, roof: c.roof }), c.x, y - 0.02, c.z, c.face);
  }
  const panes = new Mesh(merge(glass), world.mats.pane);
  const lit = new Mesh(merge(warm), warmLights(world, new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  const solid = new Mesh(merge([paveGeo, ...parts]), shopGlow(cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })), world));
  solid.receiveShadow = true;
  solid.castShadow = !lowEnd;
  const lampMat = new MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
  const lamps = new InstancedMesh(new IcosahedronGeometry(0.26, 0), lampMat, Math.max(1, lampAt.length));
  lampAt.forEach(([x, y, z], i) => lamps.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  lamps.count = lampAt.length;
  events.followers.push((level) => lampMat.color.setHex(0xffe2b0).multiplyScalar(0.25 + 1.5 * nightOf(level)));
  g.add(solid, lamps, panes, lit);
  return { group: g };
}
