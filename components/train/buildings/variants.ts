/**
 * More of the city's towers, so no one look repeats down a street (city.ts spaces the round banded towers apart and
 * builds one of these where another would have stood too near; the choice is by place, so the city's numbers stay):
 * - terracotta baguettes over bronze glass, stepping in to a crown;
 * - mass timber, its glulam X-bracing showing every four floors over light glass, planted at its setbacks;
 * - a slim tower in a pale jali, a sandstone screen cut in stars that glows from within after dark, a domed lantern
 *   on top;
 * - a pagoda tower: a square shaft of bronze glass with flared green eaves every eight floors, a tiered crown and spire;
 * - a red-brick tower of tall arched bays over a stone base, a cornice, a green copper roof.
 * Also the pieces the archetypes vary with: a twin's sibling shaft (another skin, glass, plan, height and crown) and a
 * square plan to take where a round one would repeat. Three-free apart from the shared part geometry.
 */
import { ConeGeometry, CylinderGeometry, SphereGeometry } from "three";

import { Rng as CityRng, type Rng } from "../cityModel";
import type { Ctx } from "./archetypes";
import type { FamilyId } from "./facadeArray";
import type { Tint, V3 } from "./meshBuilder";
import { box, cap, fp, hip, type Poly, type Sink, slopedTop, solid, strut, tpl, walls } from "./parts";

/** The façades with floor bands that make a round tower read as one of the banded kind. */
export const BANDED = new Set<FamilyId>(["ribbon", "balcony", "vancouver", "pixel", "mullion"]);
/** Glass as it is made (archetypes PAL.glass): bronze, smoke, emerald, cobalt, teal, champagne, near-black, copper-rose. */
const GLASS = [0xd9b48a, 0xa7adb3, 0x8fdcb4, 0x8fb0f0, 0x88d0d0, 0xf5e2bc, 0x5c6470, 0xeab49c];

/** A hash of a point to [0, 1) (as city.ts's): what is chosen by place leaves the city's own numbers alone. */
export const hash01 = (x: number, z: number): number => {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
/** A stream of numbers of a place's own (`salt` gives the same place another). */
export const hashRng = (x: number, z: number, salt = 0): Rng => new CityRng(Math.floor(hash01(x + salt * 3.7, z - salt * 1.3) * 2 ** 31));

const toTint = (hex: number): Tint => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng.next() * list.length)];
/** A colour a little off its swatch, lighter or darker. */
const shade = (rng: Rng, hex: number, v = 0.06): Tint => {
  const f = 1 + (rng.next() - 0.5) * v * 2;
  return toTint(hex).map((c) => Math.min(1, c * f)) as Tint;
};

/** A square-ish plan for a tower that would have been round: a rectangle, notched, cut, a cross or two lobes, by place. */
export function squarePlan(w: number, d: number, x: number, z: number): Poly {
  const m = Math.min(w, d);
  const k = Math.floor(hash01(x * 0.61 + 3.3, z * 1.27 - 8.1) * 5);
  return [fp.rect(w, d), fp.notch(w, d, m * 0.16), fp.octagon(w, d, m * 0.22), fp.cross(w, d, 0.58), fp.lobes(w, d)][k];
}

/** A twin's sibling: what its second shaft is clad in, its glass, its height against the first, its plan and crown. */
export type Sibling = {
  fam: FamilyId;
  tint: Tint;
  ratio: number;
  taper: number;
  plan: (w: number, d: number) => Poly;
  crown: (sink: Sink, ring: V3[], cx: number, cz: number, top: number, yRef: number) => void;
};
/** The second shaft of a pair, unlike the first (its skin `fam`, its glass `tint`), chosen by place. */
export function sibling(x: number, z: number, fam: FamilyId, tint: Tint): Sibling {
  const r = hashRng(x, z, 7);
  const fams = (["glass", "vancouver", "balcony", "mullion", "dark", "pixel"] as FamilyId[]).filter((f) => f !== fam);
  const f2 = pick(r, fams);
  // glass of another colour than the first's
  const others = GLASS.filter((h) => toTint(h).reduce((s, c, i) => s + Math.abs(c - tint[i]), 0) > 0.3);
  const t2 = shade(r, pick(r, others.length ? others : GLASS), 0.04);
  const ratio = 0.62 + r.next() * 0.18;
  const taper = 0.8 + r.next() * 0.2;
  const planKind = Math.floor(r.next() * 4);
  const crownKind = Math.floor(r.next() * 4);
  const slant = r.next() * Math.PI * 2;
  return {
    fam: f2,
    tint: t2,
    ratio,
    taper,
    plan: (w, d) => {
      const m = Math.min(w, d);
      return [fp.chamfer(w, d, m * 0.3), fp.octagon(w, d, m * 0.22), fp.notch(w, d, m * 0.16), fp.rect(w, d)][planKind];
    },
    crown: (sink, ring, cx, cz, top, yRef) => {
      const rel = ring.map(([a, , b]) => [a - cx, b - cz] as [number, number]);
      const span = Math.max(...rel.map(([a, b]) => Math.hypot(a, b)));
      if (crownKind === 0) slopedTop(sink, f2 === "dark" || f2 === "vancouver" || f2 === "mullion" ? f2 : "glass", ring, Math.cos(slant), Math.sin(slant), span * 0.9, t2, yRef);
      else if (crownKind === 1) {
        // two setbacks in its own skin
        let y = top;
        let k = 0.8;
        for (let s = 0; s < 2; s++) {
          const r2 = walls(sink, f2, rel.map(([a, b]) => [a * k, b * k] as [number, number]), cx, cz, y, y + 2.2, { tint: t2, yRef });
          cap(sink, "roof", r2);
          y += 2.2;
          k *= 0.74;
        }
      } else if (crownKind === 2) {
        cap(sink, "roof", ring);
        box(sink, "crownB", cx, top - 1.1, cz, span * 1.45, 0.5, span * 1.45);
      } else {
        cap(sink, "garden", ring);
        box(sink, "glass", cx, top, cz, span * 0.7, 2.6, span * 0.7, toTint(0xfff1dc));
      }
    },
  };
}

export type VariantId = "terracottaFins" | "timberBraced" | "jaliTower" | "pagodaTower" | "brickArches";
const VARIANT_IDS: VariantId[] = ["terracottaFins", "timberBraced", "jaliTower", "pagodaTower", "brickArches"];
/** Which of the variants stands at a place. */
export const variantAt = (x: number, z: number): VariantId => VARIANT_IDS[Math.floor(hash01(x * 0.37 - 1.9, z * 0.53 + 6.2) * VARIANT_IDS.length)];

/** Slim boxes all round a w × d face from y0 to y1 (fins, piers), `gap` apart, standing `out` proud, in a family. */
function fins(sink: Sink, fam: FamilyId, x: number, z: number, w: number, d: number, y0: number, y1: number, gap: number, out: number, t: Tint, thick = 0.18, deep = 0.3): void {
  for (const [len, along] of [
    [w, true],
    [d, false],
  ] as const) {
    const n = Math.max(2, Math.floor(len / gap));
    for (let i = 0; i <= n; i++) {
      const u = -len / 2 + (len * i) / n;
      for (const s of [-1, 1]) {
        const px = along ? x + u : x + s * (w / 2 + out);
        const pz = along ? z + s * (d / 2 + out) : z + u;
        box(sink, fam, px, y0, pz, along ? thick : deep, y1 - y0, along ? deep : thick, t);
      }
    }
  }
}

export const VARIANTS: Record<VariantId, (o: Ctx) => void> = {
  /** Terracotta baguettes over bronze glass on a recessed lobby, the shaft stepping in twice to its crown. */
  terracottaFins(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const glass = shade(rng, pick(rng, [0xd9b48a, 0xc9a070, 0xe3c49a]));
    const clay = shade(rng, pick(rng, [0xc8633c, 0xd9824f, 0xb5573a, 0xe0a070]));
    walls(sink, "dark", fp.rect(w * 0.9, d * 0.9), x, z, yb, yt + 3.2, { yRef: yt });
    box(sink, "concrete", x, yt + 3.0, z, w * 0.96, 0.4, d * 0.96, clay);
    const tw = w * (0.74 + rng.next() * 0.1);
    const td = d * (0.74 + rng.next() * 0.1);
    let y = yt + 3.4;
    for (const [f, k] of [
      [0.72, 1],
      [0.9, 0.84],
      [1, 0.66],
    ]) {
      const y1 = yt + H * f;
      if (y1 - y < 1.5) continue;
      const ring = walls(sink, "glass", fp.rect(tw * k, td * k), x, z, y, y1, { tint: glass, yRef: yt, uOff: rng.next() });
      cap(sink, "roof", ring);
      fins(sink, "concrete", x, z, tw * k, td * k, y, y1, 1.25, 0.12, clay);
      box(sink, "concrete", x, y1 - 0.35, z, tw * k + 0.6, 0.35, td * k + 0.6, clay);
      y = y1;
    }
  },
  /** Mass timber: light glass behind glulam X-bracing every four floors, stepping in twice, the setbacks planted. */
  timberBraced(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const glass = shade(rng, pick(rng, [0xeef4fa, 0xd8ecf4, 0xf5e2bc, 0xc8e8d8]), 0.03);
    const wood = shade(rng, pick(rng, [0xffffff, 0xf2e2c8, 0xe8d0a8]), 0.04);
    const pod = walls(sink, "timber", fp.rect(w * 0.94, d * 0.94), x, z, yb, yt + 3.6, { tint: wood, yRef: yt });
    cap(sink, "garden", pod);
    const band = 1.8 * 4;
    let y = yt + 3.6;
    for (const [f, k] of [
      [0.56, 0.8],
      [0.82, 0.68],
      [1, 0.56],
    ]) {
      const y1 = Math.max(y + 2, yt + H * f);
      const tw = w * k;
      const td = d * k;
      const ring = walls(sink, "glass", fp.rect(tw, td), x, z, y, y1, { tint: glass, yRef: yt, uOff: rng.next() });
      cap(sink, "garden", ring);
      // the bracing: on each face a beam at every fourth floor and the two diagonals between
      for (let ya = y; ya < y1 - 0.5; ya += band) {
        const yz = Math.min(y1, ya + band);
        for (const [ax, az, bx, bz] of [
          [-tw / 2, -td / 2 - 0.2, tw / 2, -td / 2 - 0.2],
          [-tw / 2, td / 2 + 0.2, tw / 2, td / 2 + 0.2],
          [-tw / 2 - 0.2, -td / 2, -tw / 2 - 0.2, td / 2],
          [tw / 2 + 0.2, -td / 2, tw / 2 + 0.2, td / 2],
        ]) {
          strut(sink, "timber", [x + ax, ya, z + az], [x + bx, yz, z + bz], 0.17, wood);
          strut(sink, "timber", [x + bx, ya, z + bz], [x + ax, yz, z + az], 0.17, wood);
        }
        box(sink, "timber", x, ya - 0.15, z, tw + 0.5, 0.3, td + 0.5, wood);
      }
      // planted at the setback: trees at two of its corners
      if (f < 1) for (const s of [-1, 1]) o.terrace(x + s * tw * 0.42, y1, z - s * td * 0.42, 0.5, s < 0 ? "smaple" : "cedar");
      y = y1;
    }
  },
  /** A slim tower in a pale sandstone jali that glows from within at night, a domed lantern on its top. */
  jaliTower(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const stone = shade(rng, pick(rng, [0xf0e2c8, 0xe8d4b4, 0xf4ece0]), 0.04);
    const pod = walls(sink, "stone", fp.rect(w * 0.9, d * 0.9), x, z, yb, yt + 4, { tint: stone, yRef: yt });
    cap(sink, "garden", pod);
    const s = Math.min(w, d) * (0.56 + rng.next() * 0.08);
    const plan = rng.next() < 0.5 ? fp.octagon(s, s, s * 0.2) : fp.chamfer(s, s * 0.9, s * 0.18);
    const ring = walls(sink, "jali", plan, x, z, yt + 4, yt + H, { tint: stone, yRef: yt, uOff: rng.next() });
    cap(sink, "roof", ring);
    // the lantern: a drum, a dome and a finial
    solid(sink, "stone", tpl("drum12", () => new CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0)), x, yt + H, z, s * 0.32, 1.6, s * 0.32, stone);
    solid(sink, "stone", tpl("dome12", () => new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), x, yt + H + 1.6, z, s * 0.32, s * 0.36, s * 0.32, stone);
    solid(sink, "copper", tpl("finial6", () => new ConeGeometry(1, 1, 6).translate(0, 0.5, 0)), x, yt + H + 1.6 + s * 0.34, z, 0.18, 1.4, 0.18, toTint(0xe8c060));
  },
  /** A square shaft of bronze glass with flared green eaves every eight floors, three tiers and a spire on top. */
  pagodaTower(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const glass = shade(rng, pick(rng, [0xd9b48a, 0xc9a070, 0x5c6470]), 0.04);
    const green = shade(rng, pick(rng, [0x6fae8a, 0x5c9c78, 0x7cbf9a]), 0.04);
    const s = Math.min(w, d) * 0.7;
    walls(sink, "dark", fp.rect(s * 1.15, s * 1.15), x, z, yb, yt + 3.4, { yRef: yt });
    const seg = 1.8 * 8;
    const eave = (y: number, k: number) => {
      // a skirt flaring out and down from the wall, its soffit under it
      const out = s * k + 3;
      walls(sink, "copper", fp.rect(out, out), x, z, y - 0.9, y, { s1: (s * k + 0.3) / out, tint: green });
      box(sink, "concrete", x, y - 1.05, z, out, 0.15, out, toTint(0x6b5a48));
    };
    let y = yt + 3.4;
    while (y < yt + H - 6) {
      const y1 = Math.min(yt + H - 4, y + seg);
      const ring = walls(sink, "glass", fp.rect(s, s), x, z, y, y1, { tint: glass, yRef: yt, uOff: rng.next() });
      cap(sink, "roof", ring);
      eave(y1, 1);
      y = y1;
    }
    // the crown: three small tiers, each with its eave, and the spire
    let k = 0.8;
    for (let t = 0; t < 3; t++) {
      const h = 1.6;
      const ring = walls(sink, "glass", fp.rect(s * k, s * k), x, z, y, y + h, { tint: glass, yRef: yt });
      cap(sink, "roof", ring);
      eave(y + h, k * 0.9);
      y += h;
      k *= 0.72;
    }
    hip(sink, "copper", x, z, s * k * 1.4, s * k * 1.4, y, 1.4, green);
    solid(sink, "copper", tpl("finial6", () => new ConeGeometry(1, 1, 6).translate(0, 0.5, 0)), x, y + 1.2, z, 0.25, 4.5, 0.25, toTint(0xe8c060));
  },
  /** A red-brick tower of tall arched bays over a stone base, a cornice, its top floors under a green copper roof. */
  brickArches(o) {
    const { rng, sink, x, z, w, d, yb, yt, H } = o;
    const brick = shade(rng, pick(rng, [0xb5523a, 0xa94e3c, 0x9a4632, 0xc4664c]), 0.05);
    const stone = shade(rng, pick(rng, [0xe9dcc4, 0xd8c8a8]), 0.03);
    const tw = w * (0.8 + rng.next() * 0.1);
    const td = d * (0.8 + rng.next() * 0.1);
    const base = walls(sink, "stone", fp.rect(tw + 0.4, td + 0.4), x, z, yb, yt + 4.2, { tint: stone, yRef: yt });
    cap(sink, "roof", base);
    const h1 = yt + H * 0.84;
    const ring = walls(sink, "brick", fp.rect(tw, td), x, z, yt + 4.2, h1, { tint: brick, yRef: yt, uOff: rng.next() });
    // piers at the corners, a stone cornice, the top floors set back under the copper hip
    fins(sink, "brick", x, z, tw, td, yt + 4.2, h1, tw / 2, 0.1, brick, 0.5, 0.5);
    walls(sink, "stone", ring.map(([a, , b]) => [(a - x) * 1.04, (b - z) * 1.04] as [number, number]), x, z, h1, h1 + 0.8, { tint: stone, yRef: yt });
    const top = walls(sink, "brick", fp.rect(tw * 0.8, td * 0.8), x, z, h1 + 0.8, yt + H, { tint: brick, yRef: yt });
    cap(sink, "roof", top);
    hip(sink, "copper", x, z, tw * 0.8, td * 0.8, yt + H, Math.min(tw, td) * 0.3, toTint(0x8fd0b0));
  },
};
