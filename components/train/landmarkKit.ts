/**
 * The four landmarks with the most to them: Canada Place (the five white sails over the cruise terminal, a docked
 * cruise ship), Harbour Centre (an office podium, the banded tower, glass elevators and the Lookout's saucer), Science
 * World (a double layer of LED nodes on the geodesic sphere, joined by a glowing lattice) and BC Place (the LED fascia,
 * lit masts and cable lights). Built in each landmark's local frame; client only.
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
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";

import { SEA } from "./constants";
import { registerPattern } from "./eventLights";
import { EVENT_META } from "./lookTypes";
import { addReflections } from "./reflectionSources";
import { canvasTexture, cap, merge, type P2, paint, roundRect, walls } from "./shapes";
import type { PlacedLandmark } from "./sites";
import { sdfAt } from "./terrain";
import { cabinTexture, cruiseShip } from "./vessels";
import type { World } from "./world";

export type Built = { group: Group; animate?: (t: number) => void };

const UPV = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const q = new Quaternion();
const one = new Vector3(1, 1, 1);
const p = new Vector3();
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
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
 * The sail roof: one membrane over the terminal, pulled up into a peak at each of five masts with concave flanks,
 * the long edges lifting in arches between the anchor points.
 */
function sailRoof(halfW: number, halfL: number, base: number, masts: number[], peak: number, nx: number, nz: number): BufferGeometry {
  const R = 9.5;
  const h = (x: number, z: number) => {
    let top = 0;
    let dzNear = 1e9;
    for (const zm of masts) {
      const d = Math.hypot(x * 1.12, z - zm);
      if (d < R) top = Math.max(top, peak * Math.pow(1 - d / R, 1.7));
      dzNear = Math.min(dzNear, Math.abs(z - zm));
    }
    const spacing = masts.length > 1 ? masts[1] - masts[0] : 15;
    const arch = Math.sin(Math.min(1, dzNear / (spacing / 2)) * (Math.PI / 2)) ** 2;
    return base + top + 1.7 * sstep(0.62, 1, Math.abs(x) / halfW) * arch * sstep(halfL, halfL - 4, Math.abs(z));
  };
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -halfW + (2 * halfW * i) / nx;
      const z = -halfL + (2 * halfL * j) / nz;
      pos.push(x, h(x, z), z);
      if (i < nx && j < nz) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCanadaPlace(l: PlacedLandmark, world: World): Built {
  const { events, lowEnd, envTex } = world;
  const g = new Group();
  // the pier runs out north from the shore, a little east of north
  const ROT = 0.15;
  g.rotation.y = ROT;
  const water = SEA - l.padY;
  // the shore end gets the hotel and the ship's bow points out to sea
  const toWorld = (x: number, z: number): P2 => [l.px + x * Math.cos(ROT) + z * Math.sin(ROT), l.pz - x * Math.sin(ROT) + z * Math.cos(ROT)];
  const shore = sdfAt(...toWorld(0, 44)) > sdfAt(...toWorld(0, -44)) ? 1 : -1;
  const deck = water + 2.6;
  const lower = deck + 4.6;
  const upper = lower + 3.2;
  const solid: BufferGeometry[] = [
    // the pier on its piles, and the promenade railings along both sides
    paint(new BoxGeometry(31, 3.4, 82).translate(0, water + 0.9, 0), 0x9a9890),
    paint(cap(rect(31, 82), deck), 0xc9c6bd),
    paint(new BoxGeometry(0.12, 0.9, 80).translate(15.2, deck + 0.45, 0), 0xe6e9ec),
    paint(new BoxGeometry(0.12, 0.9, 80).translate(-15.2, deck + 0.45, 0), 0xe6e9ec),
    paint(cap(rect(27, 78), lower), 0xeef0ee),
    paint(new BoxGeometry(0.12, 0.8, 74).translate(13.4, lower + 0.4, 0), 0xe6e9ec),
    paint(new BoxGeometry(0.12, 0.8, 74).translate(-13.4, lower + 0.4, 0), 0xe6e9ec),
  ];
  for (let z = -36; z <= 36; z += 4) for (const x of [-15.5, 15.5]) solid.push(paint(new CylinderGeometry(0.35, 0.35, 3.2, 6).translate(x, water + 0.6, z), 0x6b6a64));
  // lamp standards along the promenade and the upper walk, their lamps lit after dark
  const lampAt: [number, number, number][] = [];
  for (let z = -36; z <= 36; z += 6) for (const x of [-14.7, 14.7]) lampAt.push([x, deck + 2.7, z]);
  for (let z = -34; z <= 34; z += 8.5) for (const x of [-13, 13]) lampAt.push([x, lower + 1.7, z]);
  for (const [x, y, z] of lampAt) solid.push(paint(new CylinderGeometry(0.05, 0.07, 2.6, 4).translate(x, y - 1.35, z), 0x3a3f46));
  const lampMat = new MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
  const lamps = new InstancedMesh(new IcosahedronGeometry(0.24, 0), lampMat, lampAt.length);
  lampAt.forEach(([x, y, z], i) => lamps.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  // the hotel at the shore end
  const hz = shore * 31;
  const hotel = roundRect(16, 11, 2.2);
  const hotelTop = deck + 15;
  solid.push(paint(cap(hotel.map(([x, z]) => [x, z + hz] as P2), hotelTop), 0xd9d9d3));
  const tt = terminalTexture();
  const ht = hotelTexture();
  const terminalMat = cityToned(world, new MeshStandardMaterial({ map: tt.map, emissiveMap: tt.glow, emissive: 0xffffff, roughness: 0.6 }));
  const hotelMat = cityToned(world, new MeshStandardMaterial({ map: ht.map, emissiveMap: ht.glow, emissive: 0xffffff, roughness: 0.6 }));
  const terminal = new Mesh(merge([walls(rect(27, 78), deck, lower, { uPer: 8, vPer: 4.6 }), walls(rect(24, 74), lower, upper, { uPer: 8, vPer: 3.2 })]), terminalMat);
  const hotelMesh = new Mesh(walls(hotel.map(([x, z]) => [x, z + hz] as P2), upper, hotelTop, { uPer: 4, vPer: 3.2 }), hotelMat);
  // the sails: five peaks along the centreline, a mast through each
  const masts = [-26, -13, 0, 13, 26];
  const sailMat = new MeshStandardMaterial({ color: 0xfbfbf9, roughness: 0.65, side: DoubleSide, emissive: 0xfff1d8, emissiveIntensity: 0 });
  // after dark each sail is floodlit in its own colour: blue, green, white, orange and red, or the event's colours
  const sailCols = { value: masts.map(() => new Color()) };
  const sailTint = { value: 0 };
  sailMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSail = sailCols;
    sh.uniforms.uTint = sailTint;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vSailZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSailZ = position.z;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uSail[5];\nuniform float uTint;\nvarying float vSailZ;").replace(
      "#include <emissivemap_fragment>",
      [
        "#include <emissivemap_fragment>",
        "float sf = clamp( ( vSailZ + 26.0 ) / 13.0, 0.0, 4.0 );",
        "int s0 = int( floor( sf ) );",
        "vec3 sc = mix( uSail[ s0 ], uSail[ min( s0 + 1, 4 ) ], smoothstep( 0.4, 0.6, fract( sf ) ) );",
        "totalEmissiveRadiance *= mix( vec3( 1.0 ), sc, uTint );",
      ].join("\n"),
    );
  };
  const roof = new Mesh(sailRoof(12.5, 34, upper, masts, 9.5, lowEnd ? 14 : 24, lowEnd ? 48 : 90), sailMat);
  roof.castShadow = !lowEnd;
  const mastGeo: BufferGeometry[] = masts.map((z) => paint(new CylinderGeometry(0.16, 0.24, 13.5, 8).translate(0, upper + 6.4, z), 0xf3f4f6));
  // uplights along the sails' feet, in the event's colours
  for (const [i, z] of masts.entries()) {
    const up = new Mesh(new BoxGeometry(1.2, 0.3, 8), i % 2 ? events.glowB : events.glow);
    up.position.set(i % 2 ? 9 : -9, upper + 0.2, z);
    g.add(up);
  }
  const solidMesh = new Mesh(merge([...solid, ...mastGeo]), cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
  solidMesh.receiveShadow = true;
  // the cruise ship alongside, bow to the sea
  const ship = cruiseShip(lowEnd);
  const shipGroup = new Group();
  const shipSolid = new Mesh(ship.solid, cityToned(world, new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, envMap: envTex, envMapIntensity: 0.4 })));
  const ct = cabinTexture();
  const shipCabins = new Mesh(ship.cabins, cityToned(world, new MeshStandardMaterial({ map: ct.map, emissiveMap: ct.glow, emissive: 0xffffff, roughness: 0.4, envMap: envTex, envMapIntensity: 0.5 }), 1.2));
  shipSolid.castShadow = !lowEnd;
  shipGroup.add(shipSolid, shipCabins);
  shipGroup.position.set(15.5 + 4.4 + 0.4, water + 0.05, 0);
  shipGroup.rotation.y = shore > 0 ? Math.PI : 0;
  g.add(solidMesh, terminal, hotelMesh, roof, shipGroup, lamps);
  // the fabric is translucent: a little light through it by day, floodlit in colour after dark
  const SAILS_LIT = [0x2f6bff, 0x2fd36b, 0xffffff, 0xff7a2a, 0xff2a2a];
  const warm = new Color(0xffd29a);
  const shipSide = shore > 0 ? -1 : 1;
  addReflections([
    ...masts.map((z, k) => {
      const [x, wz] = toWorld(0, z);
      return { x, z: wz, y: l.padY + upper, h: 9.5, w: 9, col: sailCols.value[k], gain: 0.9 };
    }),
    ...[-24, 0, 24].map((z) => {
      const [x, wz] = toWorld(-15.5, z);
      return { x, z: wz, y: l.padY + deck, h: upper - deck, w: 16, col: warm, gain: 0.45 };
    }),
    ...[-24, -8, 8, 24].map((z) => {
      const [x, wz] = toWorld(20.3, z * shipSide);
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

/**
 * The geodesic sphere and its double layer of lights: a node on every vertex, a second node raised over the middle
 * of every face, and a lattice of struts joining each raised node to its face's three corners, so every node sits in
 * a starburst. Both layers and the lattice take the event's pattern; after dark the shell faintly takes its colour.
 */
export function buildScienceWorld(world: World, centre: Vector3): Built {
  const { events, lowEnd, envTex, mats } = world;
  const g = new Group();
  const r = 11;
  const cy = 13;
  const shellMat = new MeshStandardMaterial({ color: 0xc3ccd6, metalness: 0.75, roughness: 0.3, envMap: envTex, envMapIntensity: 0.9, flatShading: true, emissive: 0x000000 });
  const ball = new Mesh(new IcosahedronGeometry(r, 3), shellMat);
  ball.position.y = cy;
  ball.castShadow = !lowEnd;
  // vertices and faces of the same subdivision, from the non-indexed triangle list
  const ico = new IcosahedronGeometry(1, 3);
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
  const led = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const outerPts = dirs.map((d) => d.clone().multiplyScalar(r + 0.3).setY(d.y * (r + 0.3) + cy));
  const apexPts = faces.map(([a, b, c]) => dirs[a].clone().add(dirs[b]).add(dirs[c]).normalize().multiplyScalar(r + 0.95).add(new Vector3(0, cy, 0)));
  // the lights read as points of light, so plain icosahedra (20 triangles) do
  const outer = new InstancedMesh(new IcosahedronGeometry(0.36, 0), led, outerPts.length);
  const apex = new InstancedMesh(new IcosahedronGeometry(0.26, 0), led, apexPts.length);
  for (const [mesh, pts] of [
    [outer, outerPts],
    [apex, apexPts],
  ] as const) {
    pts.forEach((v, i) => {
      m4.makeTranslation(v.x, v.y, v.z);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, new Color(0xffffff));
    });
    registerPattern(events, mesh, "nodes", pts.map((v) => v.clone().add(centre)), centre);
  }
  // the lattice: each raised node to its face's corners
  const lpos = new Float32Array(faces.length * 6 * 3);
  const lcol = new Float32Array(faces.length * 6 * 3);
  faces.forEach((f, fi) => {
    f.forEach((vi, k) => {
      const o = (fi * 6 + k * 2) * 3;
      lpos.set([apexPts[fi].x, apexPts[fi].y, apexPts[fi].z, outerPts[vi].x, outerPts[vi].y, outerPts[vi].z], o);
    });
  });
  const lgeo = new BufferGeometry();
  lgeo.setAttribute("position", new BufferAttribute(lpos, 3));
  lgeo.setAttribute("color", new BufferAttribute(lcol, 3));
  // additive: a dim colour adds next to nothing by day, so the lattice only shows as light after dark
  const lattice = new LineSegments(lgeo, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false, blending: AdditiveBlending, depthWrite: false }));
  const ca = new Color();
  const cb = new Color();
  events.followers.push((level, _ev, t) => {
    const oc = outer.instanceColor;
    const ac = apex.instanceColor;
    if (!oc || !ac) return;
    const dim = 0.1 + 0.6 * nightOf(level);
    faces.forEach((f, fi) => {
      ca.fromArray(ac.array as Float32Array, fi * 3).multiplyScalar(dim);
      f.forEach((vi, k) => {
        cb.fromArray(oc.array as Float32Array, vi * 3).multiplyScalar(dim);
        const o = (fi * 6 + k * 2) * 3;
        lcol.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], o);
      });
    });
    (lgeo.attributes.color as BufferAttribute).needsUpdate = true;
    // after dark the shell recedes and takes a faint wash of the light
    const n = nightOf(level);
    shellMat.color.setHex(0xc3ccd6).multiplyScalar(1 - 0.75 * n);
    shellMat.envMapIntensity = 0.9 * (1 - 0.9 * n);
    shellMat.emissive.copy(events.glow.emissive).multiplyScalar(0.1 * n);
    void t;
  });
  const base = new Mesh(new CylinderGeometry(9.5, 10.5, 4.2, 40), new MeshStandardMaterial({ color: 0x223040, metalness: 0.4, roughness: 0.15, envMap: envTex, envMapIntensity: 0.9, emissive: 0xffe2b8, emissiveIntensity: 0 }));
  base.position.y = 2.1;
  const roofRing = new Mesh(new CylinderGeometry(10.8, 10.8, 0.6, 40), mats.landmark);
  roofRing.position.y = 4.4;
  const band = new Mesh(new TorusGeometry(10.3, 0.22, 8, 64), events.glow);
  band.rotation.x = Math.PI / 2;
  band.position.y = 5.0;
  const plaza = new Mesh(new CylinderGeometry(15.5, 16, 0.5, 48), mats.concrete);
  plaza.position.y = 0.05;
  plaza.receiveShadow = true;
  const cols = new InstancedMesh(new CylinderGeometry(0.35, 0.35, 4.2, 8), mats.landmark, 10);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * 11.2, 2.1, Math.sin(a) * 11.2);
    cols.setMatrixAt(i, m4);
  }
  events.followers.push((level) => {
    (base.material as MeshStandardMaterial).emissiveIntensity = 0.6 * nightOf(level);
  });
  g.add(ball, outer, apex, lattice, base, roofRing, band, plaza, cols);
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
