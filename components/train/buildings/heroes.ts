/**
 * Hero buildings at their mapped spots (Nominatim, km × 110), nudged out of the guideway corridor: the Marine Building,
 * Hotel Vancouver's copper roof, Vancouver House widening as it rises, Living Shangri-La, the Sun Tower's dome,
 * Woodward's red W, the Library's colosseum, the Dominion Building, the Art Gallery and Telus Garden; plus five
 * invented 2100 icons; and round Joyce–Collingwood station the towers there today (concrete with glass balconies on
 * brick podiums) with new ones beside them; and across Broadway from Commercial–Broadway station the redevelopment
 * planned there (three rounded glass towers over a planted podium and a glass market hall).
 * Their footprints are reserved before the city fills its lots.
 */
import { BoxGeometry, Color, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from "three";

import type { Rng } from "../cityModel";
import { fromStation } from "../sets/zones";
import { pushOut } from "../sites";
import { BUILD, type Ctx } from "./archetypes";
import type { Tint } from "./meshBuilder";
import { box, cap, fp, hip, type Sink, solid, walls } from "./parts";

const T = (hex: number): Tint => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

export type Hero = {
  name: string;
  x: number;
  z: number;
  r: number;
  h: number;
  /** Placed by hand clear of the guideway (its towers kept back), so not pushed out. */
  fixed?: boolean;
  build: (s: Sink, x: number, z: number, yb: number, yt: number, rng: Rng, terrace: Ctx["terrace"]) => void;
};

const ctx = (s: Sink, x: number, z: number, yb: number, yt: number, w: number, d: number, H: number, rng: Rng, terrace: Ctx["terrace"]): Ctx => ({ rng, sink: s, x, z, w, d, yb, yt, H, hood: "downtown", terrace });

/** A spot near Joyce–Collingwood: along the line (a) and across it (l, positive toward the station's set). */
const nearJoyce = (a: number, l: number): [number, number] => fromStation(8, a, l);
/** One of the towers round the station today: a brick podium, a concrete shaft wrapped in glass balconies, plant on top. */
const villageTower = (s: Sink, x: number, z: number, yb: number, yt: number, H: number, tint: Tint) => {
  const pod = walls(s, "brick", fp.rect(16, 14), x, z, yb, yt + 4.2, { tint: T(0xa94e3c), yRef: yt });
  cap(s, "garden", pod);
  const ring = walls(s, "balcony", fp.rounded(11, 9.5, 1.6, 3), x, z, yt + 4.2, yt + H, { tint, yRef: yt });
  cap(s, "roof", ring);
  box(s, "concrete", x, yt + H, z, 4, 2.2, 3.4, T(0xd8d4cc));
};
const joyce = (name: string, a: number, l: number, r: number, h: number, build: Hero["build"]): Hero => {
  const [x, z] = nearJoyce(a, l);
  return { name, x, z, r, h, build };
};

const RAW: Hero[] = [
  {
    name: "Marine Building",
    // its real corner (-39, -16) is under the guideway, and the line hems in everything round it: placed by hand on
    // the nearest clear ground, west along Coal Harbour, rather than nudged onto Burrard's platforms
    x: -93,
    z: -17,
    r: 8,
    fixed: true,
    h: 38,
    build: (s, x, z, yb, yt) => {
      const brown = T(0xd9a882);
      let ring = walls(s, "deco", fp.rect(13, 13), x, z, yb, yt + 16, { tint: brown, yRef: yt });
      cap(s, "roof", ring);
      ring = walls(s, "deco", fp.rect(10, 10), x, z, yt + 16, yt + 26, { tint: brown, yRef: yt });
      cap(s, "roof", ring);
      ring = walls(s, "deco", fp.rect(7.5, 7.5), x, z, yt + 26, yt + 33, { tint: brown, yRef: yt });
      cap(s, "roof", ring);
      walls(s, "copper", fp.rect(5, 5), x, z, yt + 33, yt + 36, { tint: T(0xbfe0d0) });
      hip(s, "copper", x, z, 5, 5, yt + 36, 2.2);
    },
  },
  {
    name: "Hotel Vancouver",
    x: -70,
    z: 29.5,
    r: 9,
    h: 44,
    build: (s, x, z, yb, yt) => {
      const stone = T(0xe0d6c2);
      walls(s, "stone", fp.rect(18, 9), x, z, yb, yt + 10, { tint: stone, yRef: yt });
      const ring = walls(s, "stone", fp.rect(12, 12), x, z, yb, yt + 32, { tint: stone, yRef: yt });
      cap(s, "roof", ring);
      hip(s, "copper", x, z, 12, 12, yt + 32, 9);
      for (const [dx, dz] of [[-6.2, 0], [6.2, 0], [0, -6.2], [0, 6.2]]) box(s, "copper", x + dx, yt + 33, z + dz, Math.abs(dx) ? 0.6 : 2, 1.6, Math.abs(dz) ? 0.6 : 2);
      box(s, "roof", x, yt + 10, z, 18, 0.4, 9, T(0x9fbfae));
    },
  },
  {
    name: "Vancouver House",
    x: -156,
    z: 127,
    r: 9,
    h: 62,
    build: (s, x, z, yb, yt) => {
      // a narrow base that widens into a full rectangle as it rises
      const ring = walls(s, "pixel", fp.rect(16, 11), x, z, yb, yt + 60, { segs: 14, s0: 0.42, s1: 1, r0: 0.35, r1: 0, curve: (t) => Math.pow(t, 0.7), yRef: yt });
      cap(s, "garden", ring);
    },
  },
  {
    name: "Living Shangri-La",
    x: -100,
    z: 6,
    r: 8,
    h: 76,
    build: (s, x, z, yb, yt) => {
      const t = T(0xdff2ff);
      let ring = walls(s, "glass", fp.rect(10, 16), x, z, yb, yt + 30, { tint: t, yRef: yt });
      cap(s, "roof", ring);
      ring = walls(s, "glass", fp.rect(9, 13), x - 0.5, z, yt + 30, yt + 58, { tint: t, yRef: yt });
      cap(s, "roof", ring);
      ring = walls(s, "glass", fp.rect(8, 9), x - 1, z, yt + 58, yt + 75, { tint: t, yRef: yt });
      cap(s, "roof", ring);
      box(s, "crownB", x - 1, yt + 74.6, z, 8.2, 0.4, 9.2);
    },
  },
  // the Sun Tower's own corner, Beatty and Pender, is under the Stadium set's terrace, and the guideway's clearance
  // pushed it into the terrace's far side: it stands by hand on the nearest clear block, on Hastings by Abbott
  {
    name: "Sun Tower",
    x: 46.9,
    z: 55,
    r: 5,
    fixed: true,
    h: 36,
    build: (s, x, z, yb, yt) => {
      const ring = walls(s, "brick", fp.rect(8, 8), x, z, yb, yt + 28, { tint: T(0xd8b48e), yRef: yt });
      cap(s, "roof", ring);
      solid(s, "copper", new CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0), x, yt + 28, z, 3.6, 2.4, 3.6);
      solid(s, "copper", new SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, yt + 30.4, z, 3.8, 4.6, 3.8);
    },
  },
  // at Hastings and Abbott, by hand: pushed out from the guideway it stood in the Stadium set's terrace
  {
    name: "Woodward's",
    x: 37.2,
    z: 44.3,
    r: 6,
    fixed: true,
    h: 50,
    build: (s, x, z, yb, yt) => {
      const ring = walls(s, "concrete", fp.rect(10, 10), x, z, yb, yt + 44, { tint: T(0xe8e2d6), yRef: yt });
      cap(s, "roof", ring);
      // the red W on its lattice: four bars through (-3, 4), (-1.5, 0), (0, 3), (1.5, 0), (3, 4)
      const pts: [number, number][] = [[-3, 4], [-1.5, 0], [0, 3], [1.5, 0], [3, 4]];
      for (let k = 0; k < 4; k++) {
        const [ax, ay] = pts[k];
        const [bx, by] = pts[k + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const m = new Matrix4().compose(new Vector3(x + (ax + bx) / 2, yt + 45 + (ay + by) / 2, z), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.atan2(by - ay, bx - ax)), new Vector3(len, 0.45, 0.35));
        s.neon.addGeo(new BoxGeometry(1, 1, 1), m, 0, [1, 1, 1]);
      }
      box(s, "concrete", x, yt + 44, z, 7, 0.3, 0.3);
    },
  },
  {
    name: "Library Square",
    x: -27,
    z: 79,
    r: 11,
    h: 16,
    build: (s, x, z, yb, yt) => {
      const ring = walls(s, "concrete", fp.ellipse(22, 15, 28), x, z, yb, yt + 14, { tint: T(0xc9a98a), yRef: yt });
      cap(s, "garden", ring);
      const inner = walls(s, "glass", fp.rect(11, 8), x, z, yt + 14, yt + 20, { yRef: yt });
      cap(s, "roof", inner);
    },
  },
  {
    name: "Dominion Building",
    x: 21,
    z: 39,
    r: 6,
    h: 26,
    build: (s, x, z, yb, yt) => {
      const ring = walls(s, "brick", fp.chamfer(9, 11, 3), x, z, yb, yt + 20, { tint: T(0xc77a52), yRef: yt });
      cap(s, "roof", ring);
      hip(s, "tile", x, z, 9, 11, yt + 20, 4.5, T(0xb84a32));
    },
  },
  {
    // the old courthouse: stone, a columned portico and the dome over its rotunda
    name: "Vancouver Art Gallery",
    x: -62,
    z: 45,
    r: 7,
    h: 14,
    build: (s, x, z, yb, yt, rng, terrace) => BUILD.civic({ ...ctx(s, x, z, yb, yt, 17, 12, 9, rng, terrace), dome: true }),
  },
  {
    name: "Telus Garden",
    x: -36,
    z: 61,
    r: 8,
    h: 42,
    build: (s, x, z, yb, yt) => {
      const ring = walls(s, "timber", fp.rect(15, 10), x, z, yb, yt + 40, { yRef: yt });
      cap(s, "garden", ring);
      box(s, "glass", x, yt + 40, z, 15.4, 0.6, 10.4);
    },
  },
  // the new Vancouver Art Gallery, stacked galleries in copper and timber
  { name: "Vancouver Art Gallery (2100)", x: -56, z: 86, r: 10, h: 34, build: (s, x, z, yb, yt, rng, terrace) => BUILD.galleryStack(ctx(s, x, z, yb, yt, 18, 16, 30, rng, terrace)) },
  // 2100 icons
  {
    name: "Salish Sea Spire",
    x: -95,
    z: 60,
    r: 9,
    h: 124,
    build: (s, x, z, yb, yt) => {
      // a tapering hexagon of green glass rising to a slim mast, a ring of light two-thirds up: the skyline's peak
      const ring = walls(s, "vancouver", fp.hex(8.4), x, z, yb, yt + 112, { segs: 10, s1: 0.42, curve: (t) => Math.pow(t, 1.5), yRef: yt, tint: [0.86, 1, 0.96] });
      cap(s, "roof", ring);
      solid(s, "concrete", new CylinderGeometry(0.12, 0.4, 1, 6).translate(0, 0.5, 0), x, yt + 112, z, 1, 12, 1, [0.85, 0.87, 0.9]);
      solid(s, "crownA", new TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2), x, yt + 80, z, 6.6, 1, 6.6);
    },
  },
  { name: "Cascadia Twins", x: -125, z: 82, r: 11, h: 100, build: (s, x, z, yb, yt, rng, terrace) => BUILD.twins(ctx(s, x, z, yb, yt, 22, 13, 96, rng, terrace)) },
  { name: "Harbour Helix", x: -132, z: 22, r: 8, h: 104, build: (s, x, z, yb, yt, rng, terrace) => BUILD.helix(ctx(s, x, z, yb, yt, 15, 15, 100, rng, terrace)) },
  { name: "Cedar Terraces", x: -168, z: 60, r: 10, h: 54, build: (s, x, z, yb, yt, rng, terrace) => BUILD.ziggurat(ctx(s, x, z, yb, yt, 19, 17, 52, rng, terrace)) },
  { name: "Fern Tower", x: -76, z: 96, r: 7, h: 74, build: (s, x, z, yb, yt, rng, terrace) => BUILD.vforest(ctx(s, x, z, yb, yt, 13, 13, 72, rng, terrace)) },
  // Joyce–Collingwood: the towers across the line today, and new ones beside the market hall and down the line
  joyce("Collingwood Village I", -24, -34, 9, 42, (s, x, z, yb, yt) => villageTower(s, x, z, yb, yt, 40, T(0xeee6d8))),
  joyce("Collingwood Village II", 0, -44, 9, 38, (s, x, z, yb, yt) => villageTower(s, x, z, yb, yt, 36, T(0xe2e6ea))),
  joyce("Collingwood Village III", 24, -34, 9, 46, (s, x, z, yb, yt) => villageTower(s, x, z, yb, yt, 44, T(0xf3ede0))),
  joyce("Joyce Lattice", -40, 44, 9, 64, (s, x, z, yb, yt, rng, terrace) => BUILD.latticeTower(ctx(s, x, z, yb, yt, 15, 14, 62, rng, terrace))),
  joyce("Joyce Gold", 46, 30, 8, 56, (s, x, z, yb, yt, rng, terrace) => BUILD.boxTower(ctx(s, x, z, yb, yt, 14, 13, 54, rng, terrace))),
  joyce("Joyce Commons", 44, -40, 9, 52, (s, x, z, yb, yt, rng, terrace) => BUILD.slabStack(ctx(s, x, z, yb, yt, 15, 14, 50, rng, terrace))),
  {
    // the block between Broadway, the Expo and the cut: a market hall facing the station, a planted podium stepping
    // back, three towers in curved glass of three heights, their crowns kept 25 back from the guideway
    name: "Broadway & Commercial",
    x: 368,
    z: 309,
    r: 14,
    h: 44,
    fixed: true,
    build: (s, x, z, yb, yt, rng, terrace) => {
      const glassT = T(0xdde9f1);
      const stone = T(0xe8e3d8);
      let ring = walls(s, "mullion", fp.rounded(21, 24, 2.5), x + 4, z, yb, yt + 3.8, { tint: stone, yRef: yt });
      cap(s, "garden", ring);
      ring = walls(s, "glass", fp.rounded(17, 20, 2.5), x + 5.5, z + 0.5, yt + 3.8, yt + 7.6, { tint: glassT, yRef: yt });
      cap(s, "garden", ring);
      const PODIUM = yt + 7.6;
      // the towers clad in copper: copper fins and floor bands over dark glass, a copper plant room on top
      const copper = T(0xd08a55);
      const tower = (tx: number, tz: number, w: number, d: number, h: number) => {
        const top = walls(s, "mullion", fp.rounded(w, d, Math.min(w, d) / 2 - 0.05, 5), x + tx, z + tz, PODIUM, PODIUM + h, { tint: copper, yRef: PODIUM });
        cap(s, "garden", top);
        box(s, "metal", x + tx, PODIUM + h, z + tz, w * 0.45, 1.1, d * 0.35, copper);
      };
      tower(5, -6, 9, 6.4, 34);
      tower(9.5, 5, 7.2, 7.2, 30);
      tower(1, 6.5, 6.2, 8.4, 25);
      // trees on the podium's terraces, along its edges
      for (let k = 0; k < 14; k++) {
        const u = k / 14;
        const edge = k % 2;
        const tx = edge ? x + 5.5 + (u - 0.5) * 14 : x - 3.5;
        const tz = edge ? z + 9.6 : z + (u - 0.5) * 16;
        terrace(tx, edge ? PODIUM : yt + 3.8, tz, 0.5 + rng.next() * 0.25, (["smaple", "cherry", "cedar"] as const)[k % 3]);
      }
    },
  },
];

/** Placed heroes: each nudged to at least its radius plus 18 from the guideway (unless placed by hand). */
export const HEROES: Hero[] = RAW.map((h) => {
  if (h.fixed) return h;
  const [x, z] = pushOut(h.x, h.z, h.r + 18);
  return { ...h, x, z };
});
