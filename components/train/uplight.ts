/**
 * The city's public art lit after dark without a single light: each fixture is a spot on the ground (a position, the
 * way it aims and its cone), and the light it throws is baked into the art's vertices as `aGlow` (pavilion.ts shopGlow
 * shows it, the more the darker the night). A vertex takes from each spot as much as faces it (N·L), fading toward the
 * cone's edge and with distance. Called on a piece's parts in their final, placed frame, before they are merged.
 *
 * Also the fixtures themselves (a dark box with a bright lens, in the art's own mesh) and the warm pools of light they
 * leave on the ground round each piece (Culture.tsx draws those, per tile).
 */
import { BoxGeometry, type BufferGeometry, Float32BufferAttribute } from "three";

import { lit } from "./pavilion";

/** A fixture: where it stands, the point it aims at, its cone's half-angle and how far its light carries. */
export type Spot = { p: [number, number, number]; at: [number, number, number]; cone?: number; range?: number };
/** A warm pool of light on the ground round a lit piece: centre and radius. */
export type Pool = { x: number; z: number; r: number };

/** Add each spot's light to every vertex of the parts (on top of any glow they had), `gain` at full strength. */
export function uplight(parts: BufferGeometry[], spots: Spot[], gain = 0.8): void {
  const S = spots.map((s) => {
    const dx = s.at[0] - s.p[0];
    const dy = s.at[1] - s.p[1];
    const dz = s.at[2] - s.p[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const cone = s.cone ?? 0.6;
    return { p: s.p, d: [dx / L, dy / L, dz / L], cosIn: Math.cos(cone * 0.6), cosOut: Math.cos(cone), range: s.range ?? L * 2 };
  });
  for (const g of parts) {
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    if (!nor) continue;
    const n = pos.count;
    const prev = g.attributes.aGlow;
    const glow = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let sum = 0;
      for (const s of S) {
        // from the vertex toward the fixture
        let lx = s.p[0] - x;
        let ly = s.p[1] - y;
        let lz = s.p[2] - z;
        const d = Math.hypot(lx, ly, lz) || 1;
        lx /= d;
        ly /= d;
        lz /= d;
        const facing = nor.getX(i) * lx + nor.getY(i) * ly + nor.getZ(i) * lz;
        if (facing <= 0) continue;
        // how far off the fixture's aim the vertex lies: full inside the inner cone, nothing outside the outer
        const off = -(lx * s.d[0] + ly * s.d[1] + lz * s.d[2]);
        const cone = Math.min(1, Math.max(0, (off - s.cosOut) / (s.cosIn - s.cosOut)));
        if (cone <= 0) continue;
        const fall = 1 / (1 + (d / s.range) ** 2);
        sum += facing * cone * fall;
      }
      glow[i] = (prev ? prev.getX(i) : 0) + Math.min(1, sum) * gain;
    }
    g.setAttribute("aGlow", new Float32BufferAttribute(glow, 1));
  }
}

/**
 * A ground fixture at (x, y, z) aiming toward (ax, az): a dark housing and its bright lens, tilted up toward the art.
 * `paint` paints a part in the caller's mesh's way (cultureKit's P on the art atlas, or shapes.paint).
 */
export function fixture(x: number, y: number, z: number, ax: number, az: number, paint: (g: BufferGeometry, hex: number) => BufferGeometry): BufferGeometry[] {
  const yaw = Math.atan2(ax - x, az - z);
  const body = paint(new BoxGeometry(0.42, 0.22, 0.42).rotateX(0.35).rotateY(yaw).translate(x, y + 0.13, z), 0x24282d);
  const lens = lit(paint(new BoxGeometry(0.3, 0.04, 0.3).rotateX(0.35).rotateY(yaw).translate(x, y + 0.25, z), 0xfff0c8), 1.6);
  return [body, lens];
}

/**
 * How each kind of piece is lit, in its own frame (x across, z out of its front, y up from its base): its fixtures
 * (lx, lz, then the point aimed at, ax, ay, az), their cone, how bright, and its pool's radius (about its centre, or
 * `poolAt`). `ly` stands the fixtures on a step of the piece rather than on the ground round it; `arm` holds them out
 * from a wall on brackets that long (the senákw forms, high on their towers).
 */
export type ArtLight = { spots: [number, number, number, number, number][]; cone: number; gain: number; pool: number; poolAt?: [number, number]; ly?: number; arm?: number };
const corners = (d: number, ay: number, dz = d): [number, number, number, number, number][] => [
  [d, dz, 0, ay, 0],
  [-d, dz, 0, ay, 0],
  [d, -dz, 0, ay, 0],
  [-d, -dz, 0, ay, 0],
];
export const ART_LIGHTS: Record<string, ArtLight> = {
  // the culture sites (Culture.tsx)
  monument: { spots: corners(2.5, 7.4), cone: 0.8, gain: 0.85, pool: 7.5, ly: 0.45 },
  welcome: {
    spots: [
      [1.0, 2.0, 0, 5.4, 0],
      [-1.0, 2.0, 0, 5.4, 0],
    ],
    cone: 0.6,
    gain: 0.8,
    pool: 3.6,
  },
  post: {
    spots: [
      [0.75, 1.5, 0, 5, 0.3],
      [-0.75, 1.5, 0, 5, 0.3],
    ],
    cone: 0.55,
    gain: 0.8,
    pool: 2.6,
  },
  bighouse: {
    spots: [
      [2.1, 5.3, 2.1, 2.2, 3.85],
      [-2.1, 5.3, -2.1, 2.2, 3.85],
      [0, 5.6, 0, 2.0, 3.25],
    ],
    cone: 0.7,
    gain: 0.7,
    pool: 4.5,
    poolAt: [0, 4.6],
  },
  whorl: { spots: corners(1.2, 2.6, 1.3), cone: 0.6, gain: 0.75, pool: 3.2 },
  moongate: { spots: corners(1.6, 1.8, 1.3), cone: 0.65, gain: 0.7, pool: 3.4 },
  form: {
    spots: [
      [2.4, 0, 1.2, 0, 0.6],
      [-2.4, 0, -1.2, 0, 0.6],
    ],
    cone: 0.75,
    gain: 0.75,
    pool: 0,
    ly: -3.6,
    arm: 2.6,
  },
  // the Commons' sculptures (Commons.tsx)
  laughing: {
    spots: [
      [2.6, 3.4, 1.4, 1.6, 0],
      [-2.6, 3.4, -1.4, 1.6, 0],
      [0, -3.4, 0, 1.6, 0],
    ],
    cone: 0.75,
    gain: 0.7,
    pool: 6,
  },
  ring: {
    spots: [
      [2.4, 2.4, 0, 2.6, 0],
      [-2.4, -2.4, 0, 2.6, 0],
    ],
    cone: 0.7,
    gain: 0.75,
    pool: 3.6,
  },
  arch: {
    spots: [
      [2.2, 2.0, 1.6, 2.4, 0],
      [-2.2, -2.0, -1.6, 2.4, 0],
      [0, 2.4, 0, 3.2, 0],
    ],
    cone: 0.7,
    gain: 0.7,
    pool: 4.5,
  },
  cenotaph: { spots: corners(1.75, 4.5).slice(0, 3), cone: 0.55, gain: 0.8, pool: 3.2 },
  // the harbourfront's, the Digital Orca and the Olympic Cauldron (Landmarks.tsx)
  orca: {
    spots: [
      [2.2, 2.6, 0, 3, 0.5],
      [-2.2, 2.6, 0, 3, 0.5],
      [0, -4.6, 0, 3, -2],
    ],
    cone: 0.75,
    gain: 0.7,
    pool: 4.8,
  },
  cauldron: { spots: corners(3.5, 7).slice(0, 3), cone: 0.6, gain: 0.7, pool: 6 },
};

/**
 * A piece's fixtures where it stands: at (x, y, z) turned by ry (as rotation.y), each standing on the ground there
 * (`ground`), or on the piece's own step (`ly`). Returns the spots for uplight and, painted by `paint`, the fixtures.
 */
export function placeLight(
  light: ArtLight,
  x: number,
  y: number,
  z: number,
  ry: number,
  ground: (x: number, z: number) => number,
  paint: (g: BufferGeometry, hex: number) => BufferGeometry,
): { spots: Spot[]; parts: BufferGeometry[] } {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const W = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const spots: Spot[] = [];
  const parts: BufferGeometry[] = [];
  const arm = light.arm ?? 0;
  for (const [lx, lz, ax, ay, az] of light.spots) {
    const [fx, fz] = W(lx, lz + arm);
    const [tx, tz] = W(ax, az);
    const fy = light.ly !== undefined ? y + light.ly : ground(fx, fz);
    spots.push({ p: [fx, fy + 0.3, fz], at: [tx, y + ay, tz], cone: light.cone });
    parts.push(...fixture(fx, fy, fz, tx, tz, paint));
    // a bracket back to the wall it hangs from
    if (arm > 0) {
      const [bx, bz] = W(lx, lz + arm / 2);
      parts.push(paint(new BoxGeometry(0.12, 0.12, arm).rotateY(ry).translate(bx, fy + 0.1, bz), 0x2b2f36));
    }
  }
  return { spots, parts };
}

/** A lit piece's pool of light on the ground, where it stands (as placeLight). */
export function poolOf(light: ArtLight, x: number, z: number, ry: number): Pool | null {
  if (light.pool <= 0) return null;
  const [lx, lz] = light.poolAt ?? [0, 0];
  return { x: x + lx * Math.cos(ry) + lz * Math.sin(ry), z: z - lx * Math.sin(ry) + lz * Math.cos(ry), r: light.pool };
}
