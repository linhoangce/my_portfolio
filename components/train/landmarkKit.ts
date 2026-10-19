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
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";

import { SEA } from "./constants";
import { registerPattern } from "./eventLights";
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
  g.add(solidMesh, terminal, hotelMesh, roof, shipGroup);
  // the fabric is translucent: a little light through it by day, lit from within after dark
  events.followers.push((level) => {
    sailMat.emissiveIntensity = 0.12 + 0.3 * nightOf(level);
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
  return { group: g };
}

/* ------------------------------------------------------------------ BC Place */

/**
 * The stadium: the bowl, the cable-stayed roof on 36 leaning masts, and its lights: a tall LED fascia round the rim
 * with a white line above it (both in the event's colours by day and night), mast lights, and lights strung along
 * every cable. After dark the masts glow white and the roof is lit from within.
 */
export function buildBCPlace(world: World, centre: Vector3): Built {
  const { events, lowEnd, mats } = world;
  const g = new Group();
  const R = 32;
  const bowl = new Mesh(new CylinderGeometry(R, R - 2.5, 11, 64, 1, true), new MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.9, side: 2 }));
  bowl.position.y = 5.5;
  const pitch = new Mesh(new CircleGeometry(R - 2.5, 64), new MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.3;
  const concourse = new Mesh(new CylinderGeometry(R + 1.2, R + 1.2, 1.4, 64), new MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.8 }));
  concourse.position.y = 12.6;
  const roofPts = [[0, 20.4], [6, 20.4], [12, 19.6], [20, 17.6], [27, 14.8], [31, 13.6], [R + 1.2, 13.3]].map(([r, y]) => new Vector2(r, y));
  const roofMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, emissive: 0xe4ecff, emissiveIntensity: 0 });
  const roof = new Mesh(new LatheGeometry(roofPts, 72), roofMat);
  roof.castShadow = !lowEnd;
  const ring = new Mesh(new TorusGeometry(6.4, 0.5, 8, 48), mats.mast);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 20.6;
  const ribs = new InstancedMesh(new BoxGeometry(0.5, 11.5, 1.0), new MeshStandardMaterial({ color: 0xbfb9ad, roughness: 0.9 }), 64);
  const mastMat = new MeshStandardMaterial({ color: 0xf0f1f3, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 });
  const masts = new InstancedMesh(new CylinderGeometry(0.28, 0.5, 26, 8), mastMat, 36);
  const cables = new InstancedMesh(new CylinderGeometry(0.07, 0.07, 1, 5), new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.5 }), 36);
  const led = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const tips = new InstancedMesh(new SphereGeometry(0.3, 8, 6), led, 36);
  // the fascia: 72 tall LED panels round the rim, and a thin white line above them
  const fascia = new InstancedMesh(new BoxGeometry(2.95, 2.9, 0.3), led, 72);
  const lineMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const topLine = new Mesh(new TorusGeometry(R + 1.45, 0.3, 6, 144), lineMat);
  topLine.rotation.x = Math.PI / 2;
  topLine.position.y = 13.5;
  const perCable = lowEnd ? 7 : 12;
  const bulbMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bulbs = new InstancedMesh(new IcosahedronGeometry(0.3, 0), bulbMat, 36 * perCable);
  const dv = new Vector3();
  const tang = new Vector3();
  const ringPts: Vector3[] = [];
  const tipPts: Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    p.set(Math.cos(a) * (R + 0.3), 5.75, Math.sin(a) * (R + 0.3));
    q.setFromAxisAngle(UPV, -a);
    m4.compose(p, q, one);
    ribs.setMatrixAt(i, m4);
  }
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    p.set(Math.cos(a) * (R + 1.35), 11.8, Math.sin(a) * (R + 1.35));
    q.setFromAxisAngle(UPV, -a + Math.PI / 2);
    m4.compose(p, q, one);
    fascia.setMatrixAt(i, m4);
    fascia.setColorAt(i, new Color(0xffffff));
    ringPts.push(p.clone().add(centre));
  }
  let b = 0;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    p.set(cx * (R + 3.5), 12.6, cz * (R + 3.5));
    tang.set(-cz, 0, cx);
    q.setFromAxisAngle(tang, -0.16);
    m4.compose(p, q, one);
    masts.setMatrixAt(i, m4);
    const top = new Vector3(cx * (R + 5.6), 25.4, cz * (R + 5.6));
    const anchor = new Vector3(cx * 6.4, 20.6, cz * 6.4);
    m4.makeTranslation(top.x, top.y + 0.3, top.z);
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
  g.add(bowl, pitch, concourse, roof, ring, ribs, masts, cables, tips, fascia, topLine, bulbs);
  return { group: g };
}
