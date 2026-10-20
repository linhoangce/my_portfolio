/**
 * Hero buildings at their mapped spots (Nominatim, km × 110), nudged out of the guideway corridor: the Marine Building,
 * Hotel Vancouver's copper roof, Vancouver House widening as it rises, Living Shangri-La, the Sun Tower's dome,
 * Woodward's red W, the Library's colosseum, the Dominion Building, the Art Gallery and Telus Garden; plus five
 * invented 2100 icons.
 * Their footprints are reserved before the city fills its lots.
 */
import { BoxGeometry, Color, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from "three";

import type { Rng } from "../cityModel";
import { pushOut } from "../sites";
import { BUILD, type Ctx } from "./archetypes";
import type { Tint } from "./meshBuilder";
import { box, cap, fp, hip, type Sink, solid, walls } from "./parts";

const T = (hex: number): Tint => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

export type Hero = { name: string; x: number; z: number; r: number; h: number; build: (s: Sink, x: number, z: number, yb: number, yt: number, rng: Rng, terrace: Ctx["terrace"]) => void };

const ctx = (s: Sink, x: number, z: number, yb: number, yt: number, w: number, d: number, H: number, rng: Rng, terrace: Ctx["terrace"]): Ctx => ({ rng, sink: s, x, z, w, d, yb, yt, H, hood: "downtown", terrace });

const RAW: Hero[] = [
  {
    name: "Marine Building",
    x: -39,
    z: -16,
    r: 8,
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
    x: -150,
    z: 140,
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
  {
    name: "Sun Tower",
    x: 30,
    z: 63,
    r: 5,
    h: 36,
    build: (s, x, z, yb, yt) => {
      const ring = walls(s, "brick", fp.rect(8, 8), x, z, yb, yt + 28, { tint: T(0xd8b48e), yRef: yt });
      cap(s, "roof", ring);
      solid(s, "copper", new CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0), x, yt + 28, z, 3.6, 2.4, 3.6);
      solid(s, "copper", new SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, yt + 30.4, z, 3.8, 4.6, 3.8);
    },
  },
  {
    name: "Woodward's",
    x: 39,
    z: 44,
    r: 6,
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
  // 2100 icons
  {
    name: "Salish Sea Spire",
    x: -95,
    z: 60,
    r: 9,
    h: 140,
    build: (s, x, z, yb, yt, rng, terrace) => {
      BUILD.needle(ctx(s, x, z, yb, yt, 18, 18, 128, rng, terrace));
      solid(s, "crownA", new TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2), x, yt + 96, z, 7.5, 1, 7.5);
    },
  },
  { name: "Cascadia Twins", x: -125, z: 82, r: 11, h: 100, build: (s, x, z, yb, yt, rng, terrace) => BUILD.twins(ctx(s, x, z, yb, yt, 22, 13, 96, rng, terrace)) },
  { name: "Harbour Helix", x: -132, z: 22, r: 8, h: 104, build: (s, x, z, yb, yt, rng, terrace) => BUILD.helix(ctx(s, x, z, yb, yt, 15, 15, 100, rng, terrace)) },
  { name: "Cedar Terraces", x: -168, z: 60, r: 10, h: 54, build: (s, x, z, yb, yt, rng, terrace) => BUILD.ziggurat(ctx(s, x, z, yb, yt, 19, 17, 52, rng, terrace)) },
  { name: "Fern Tower", x: -76, z: 96, r: 7, h: 74, build: (s, x, z, yb, yt, rng, terrace) => BUILD.vforest(ctx(s, x, z, yb, yt, 13, 13, 72, rng, terrace)) },
];

/** Placed heroes: each nudged to at least its radius plus 18 from the guideway. */
export const HEROES: Hero[] = RAW.map((h) => {
  const [x, z] = pushOut(h.x, h.z, h.r + 18);
  return { ...h, x, z };
});
