/**
 * The air taxis of 2100 (airways.ts flies them, AirTaxis.tsx draws them): four makes, none of them a car with its
 * wheels off and none of them a drone, each built nose along +x, its feet on y 0 (it stands on its pad):
 * - the Halo, an egg of a two-seater inside a ring wing, the ring's inner face and outer rim its light;
 * - the Manta, a four-seat flying wing, a fan in each wing under a lit rim, its swept leading edges lit;
 * - the Dart, a tandem two-seater with canards, a swept wing and a ducted fan at each tip, a light line down its flanks;
 * - the Lantern, a six-seat cabin on two fan sponsons, a band of windows down each side over a belt of light.
 * No open rotors and no red, green and white points (the delivery drones' look, vessels.ts): lights in lines and
 * rings in the livery's accent, a white lamp at the nose and red at the tail. Every vertex carries what the aircraft
 * shader needs:
 * - its colour;
 * - aTint (1 where the paint takes the instance's livery);
 * - aGlow: 1 a lamp in its own colour, 2 a light in the livery's accent, 3 glass, 4 glass with the cabin's light
 *   behind it (warm after dark).
 */
import {
  type BufferGeometry,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  RingGeometry,
  Shape,
  SphereGeometry,
  SplineCurve,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";

import { merge } from "./shapes";

/** A face's look: its colour, its glow (see above) and whether the livery tints it. */
type Look = readonly [hex: number, glow: number, tint: number];
const PAINT: Look = [0xffffff, 0, 1];
const GLASS: Look = [0x0c1622, 3, 0];
const LIT: Look = [0x0c1622, 4, 0];
const ACCENT: Look = [0xffffff, 2, 0];
const HEAD: Look = [0xf2f8ff, 1, 0];
const TAIL: Look = [0xff2a1f, 1, 0];
const DARK: Look = [0x15181d, 0, 0];
const BELLY: Look = [0x2a3039, 0, 0];
const TRIM: Look = [0x8d96a1, 0, 0];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: number) => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];

const c = new Vector3();
const n = new Vector3();
/**
 * A part with the aircraft's attributes, face by face: its look, or its look by where a face sits (its centre) and
 * which way it faces; `quads` takes its triangles two by two (a lathe's or a sphere's are its quads), so its edges run
 * straight.
 */
function part(g: BufferGeometry, look: Look | ((c: Vector3, n: Vector3) => Look), quads = false): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  if (!ng.attributes.normal) ng.computeVertexNormals();
  for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "uv"].includes(k)) ng.deleteAttribute(k);
  const pos = ng.attributes.position;
  const nrm = ng.attributes.normal;
  const count = pos.count;
  if (!ng.attributes.uv) ng.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  const col = new Float32Array(count * 3);
  const glow = new Float32Array(count);
  const tint = new Float32Array(count);
  const per = quads ? 6 : 3;
  for (let f = 0; f < count; f += per) {
    c.set(0, 0, 0);
    n.set(0, 0, 0);
    for (let v = f; v < f + per; v++) {
      c.x += pos.getX(v) / per;
      c.y += pos.getY(v) / per;
      c.z += pos.getZ(v) / per;
      n.x += nrm.getX(v);
      n.y += nrm.getY(v);
      n.z += nrm.getZ(v);
    }
    n.normalize();
    const [hex, gl, ti] = typeof look === "function" ? look(c, n) : look;
    const k = rgb(hex);
    for (let v = f; v < f + per; v++) {
      col.set(k, v * 3);
      glow[v] = gl;
      tint[v] = ti;
    }
  }
  ng.setAttribute("color", new Float32BufferAttribute(col, 3));
  ng.setAttribute("aGlow", new Float32BufferAttribute(glow, 1));
  ng.setAttribute("aTint", new Float32BufferAttribute(tint, 1));
  return ng;
}

/**
 * A body of revolution along x: smooth through its radius at each x of `prof` (tail to nose, on the axis at both
 * ends), a row every `step` or so, `seg` round. A row of faces is centred on the equator at either side (±z).
 */
function spindle(prof: [number, number][], seg: number, step: number): BufferGeometry {
  const curve = new SplineCurve(prof.map(([x, r]) => new Vector2(x, r)));
  const pts = curve.getSpacedPoints(Math.ceil(curve.getLength() / step)).map((p) => new Vector2(Math.max(0, p.y), p.x));
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new LatheGeometry(pts, seg, -Math.PI / seg).rotateZ(-Math.PI / 2);
}

/** A plan outline from its right half (nose to tail, x forward and s out to the right), smoothed or as given, and mirrored. */
function outline(half: [number, number][], smooth: boolean): [number, number][] {
  const right = smooth ? new SplineCurve(half.map(([x, s]) => new Vector2(x, s))).getSpacedPoints(28).map((p): [number, number] => [p.x, Math.max(0, p.y)]) : half;
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, s]): [number, number] => [x, -s]);
  return [...right, ...left];
}

/** A flat plate of a plan outline, `t` thick with its edges rounded by r, its mid-plane at height y. */
function plate(ring: [number, number][], t: number, r: number, y: number): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(ring[0][0], ring[0][1]);
  for (const [x, s] of ring.slice(1)) sh.lineTo(x, s);
  sh.closePath();
  // the extrusion's depth stands up and the outline's s runs along z
  return new ExtrudeGeometry(sh, { depth: t, bevelEnabled: r > 0, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 4 })
    .rotateX(-Math.PI / 2)
    .translate(0, y - t / 2, 0);
}

/** A fin standing on the centre line: its side outline (x, y) `t` thick. */
function fin(side: [number, number][], t: number): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(side[0][0], side[0][1]);
  for (const [x, y] of side.slice(1)) sh.lineTo(x, y);
  sh.closePath();
  return new ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2);
}

/** A ring round a vertical axis through (x, y, z), radius R, its section w across and h high. */
const hoop = (x: number, y: number, z: number, R: number, w: number, h: number, radial = 8, around = 36) =>
  new TorusGeometry(R, w / 2, radial, around)
    .rotateX(Math.PI / 2)
    .scale(1, h / w, 1)
    .translate(x, y, z);

/** How much a face's normal points out from a vertical axis through (x, z): 1 straight out, −1 straight in. */
const outward = (x: number, z: number) => {
  const d = Math.hypot(c.x - x, c.z - z) || 1;
  return (n.x * (c.x - x) + n.z * (c.z - z)) / d;
};

/** A disc facing down at (x, y, z), lit in the livery's accent: the glow of a fan's downwash. */
const downwash = (x: number, y: number, z: number, r: number) => part(new CircleGeometry(r, 16).rotateX(Math.PI / 2).translate(x, y, z), ACCENT);

/** A leg from the ground up to y at (x, z), on a round foot. */
const leg = (x: number, z: number, y: number) => [
  part(new CylinderGeometry(0.035, 0.045, y, 6).translate(x, y / 2, z), DARK),
  part(new CylinderGeometry(0.1, 0.1, 0.03, 8).translate(x, 0.015, z), DARK),
];

/** The Halo: an egg of a pod for two inside a ring wing on four pylons, three legs. About 3.7 across. */
function halo(): BufferGeometry {
  const yc = 1.0;
  const rx = 0.05;
  // prettier-ignore
  const pod = spindle([[-1.4, 0], [-1.3, 0.28], [-0.95, 0.52], [-0.4, 0.68], [0.2, 0.72], [0.75, 0.65], [1.18, 0.47], [1.43, 0.23], [1.5, 0]], 20, 0.14)
    .scale(1, 0.9, 1)
    .translate(0, yc, 0);
  const parts = [
    part(pod, (c, n) => {
      // by its row of faces, the angle over the pod's equator: a lamp across the nose under the visor and one across
      // the tail; the canopy over the top and round the front, its lower rows lit from inside; a light line down the
      // spine behind it
      const a = (Math.atan2((c.y - yc) / 0.9, Math.abs(c.z)) * 180) / Math.PI;
      if (c.x > 1.1 && a < -9 && a > -27) return HEAD;
      if (c.x < -1.12 && Math.abs(a) < 9) return TAIL;
      if ((a > 9 && c.x > -0.55) || (c.x > 0.8 && a > -9)) return a < 45 ? LIT : GLASS;
      if (a > 81 && c.x < -0.55 && c.x > -1.2) return ACCENT;
      return n.y < -0.75 ? BELLY : PAINT;
    }, true),
    // the ring, lit on its inner face, and a line of light round its outer rim
    part(hoop(rx, yc, 0, 1.7, 0.34, 0.2, 6, 36), (_, n) => (outward(rx, 0) < -0.5 ? ACCENT : n.y < -0.6 ? BELLY : PAINT), true),
    part(hoop(rx, yc, 0, 1.87, 0.03, 0.03, 3, 36), ACCENT),
    ...[0.7, -0.7, Math.PI - 0.7, 0.7 - Math.PI].map((a) => part(new BoxGeometry(0.92, 0.07, 0.13).rotateY(-a).translate(rx + Math.cos(a) * 1.08, yc, Math.sin(a) * 1.08), PAINT)),
    part(new RingGeometry(0.2, 0.44, 16).rotateX(Math.PI / 2).translate(0.15, yc - 0.655, 0), ACCENT),
    ...leg(0.75, 0.32, 0.47),
    ...leg(0.75, -0.32, 0.47),
    ...leg(-0.8, 0, 0.5),
  ];
  return merge(parts);
}

/** The Manta: a flying wing for four, its cabin a blister on the wing, a fan in each wing, twin canted fins, skids. About 4 long and 4 across. */
function manta(): BufferGeometry {
  const yw = 0.48;
  // prettier-ignore
  const wing = plate(outline([[2.0, 0], [1.72, 0.4], [1.1, 1.08], [0.3, 1.72], [-0.38, 2.0], [-0.72, 1.86], [-0.84, 1.32], [-1.12, 0.74], [-1.52, 0.38], [-1.92, 0.14], [-2.0, 0]], true), 0.08, 0.07, yw);
  const yb = yw + 0.12;
  const cabin = new SphereGeometry(1, 20, 10).scale(1.3, 0.44, 0.74).translate(0.3, yb, 0);
  const parts = [
    part(wing, (c, n) => {
      if (n.y > 0.55) return PAINT;
      if (n.y < -0.55) return BELLY;
      // the edge: white at the nose, the accent along the swept leading edges, red at the trailing tips
      if (n.x > 0.2 && c.x > -0.6) return c.x > 1.62 ? HEAD : ACCENT;
      if (c.x < -0.5 && Math.abs(c.z) > 1.72) return TAIL;
      return DARK;
    }),
    // the canopy over its front and round its sides (by meridian, so its edges run straight), its lower half lit from inside
    part(cabin, (c) => (c.y - yb > 0.13 && Math.abs(Math.atan2(c.z / 0.74, (c.x - 0.3) / 1.3)) < 2.0 ? (c.y - yb < 0.27 ? LIT : GLASS) : PAINT), true),
  ];
  for (const fz of [-1.12, 1.12]) {
    const fx = -0.3;
    parts.push(
      part(new CylinderGeometry(0.5, 0.5, 0.27, 20).translate(fx, yw, fz), DARK),
      part(hoop(fx, yw + 0.13, fz, 0.53, 0.07, 0.04, 3, 20), ACCENT),
      ...[0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => part(new BoxGeometry(0.96, 0.02, 0.05).rotateY(a).translate(fx, yw + 0.145, fz), TRIM)),
      part(new CylinderGeometry(0.12, 0.12, 0.05, 10).translate(fx, yw + 0.15, fz), TRIM),
      downwash(fx, yw - 0.14, fz, 0.44),
    );
  }
  for (const s of [-1, 1]) {
    parts.push(
      part(
        fin(
          [
            [-0.85, 0],
            [-1.42, 0],
            [-1.72, 0.52],
            [-1.48, 0.55],
          ],
          0.04,
        ),
        (c) => (c.y > 0.5 ? ACCENT : PAINT),
      )
        .rotateX(s * 0.3)
        .translate(0, yw + 0.1, s * 0.5),
      part(new CylinderGeometry(0.035, 0.035, 1.7, 6).rotateZ(Math.PI / 2).translate(0.25, 0.035, s * 0.5), DARK),
      ...[0.85, -0.4].map((x) => part(new BoxGeometry(0.04, 0.26, 0.04).translate(x, 0.18, s * 0.5), DARK)),
    );
  }
  return merge(parts);
}

/** The Dart: a slender tandem two-seater, canards at the nose, a swept wing with a ducted fan at each tip, a tall fin. About 4.2 long, 4.3 across. */
function dart(): BufferGeometry {
  const yc = 0.8;
  const yw = yc - 0.14;
  // prettier-ignore
  const body = spindle([[-2.02, 0], [-1.95, 0.1], [-1.6, 0.19], [-1.0, 0.31], [-0.3, 0.39], [0.3, 0.41], [0.9, 0.37], [1.4, 0.27], [1.8, 0.15], [2.06, 0.05], [2.14, 0]], 18, 0.18)
    .scale(1, 0.92, 0.9)
    .translate(0, yc, 0);
  /** A flying surface: the paint on top, the belly under, its leading edge lit. */
  const surface = (c: Vector3, n: Vector3): Look => (n.y > 0.5 ? PAINT : n.y < -0.5 ? BELLY : n.x > 0.3 ? ACCENT : PAINT);
  const parts = [
    part(body, (c, n) => {
      if (c.x > 1.8 && Math.abs(c.y - yc) < 0.07) return HEAD;
      if (c.x < -1.88) return TAIL;
      // the light line down each flank, on the row of faces at the equator
      if (Math.abs(n.y) < 0.15 && c.x > -1.65 && c.x < 1.7) return ACCENT;
      return n.y < -0.7 ? BELLY : PAINT;
    }, true),
    part(new SphereGeometry(1, 16, 8).scale(1.0, 0.32, 0.29).translate(0.55, yc + 0.25, 0), (c) => (c.y < yc + 0.42 ? LIT : GLASS), true),
    // prettier-ignore
    part(plate(outline([[0.15, 0], [-0.68, 1.2], [-1.2, 1.2], [-1.18, 0]], false), 0.06, 0.03, yw), surface),
    // prettier-ignore
    part(plate(outline([[1.32, 0], [1.02, 0.62], [0.88, 0.62], [0.9, 0]], false), 0.03, 0.015, yc - 0.05), surface),
    part(
      fin(
        [
          [-1.15, yc + 0.18],
          [-1.9, yc + 0.18],
          [-2.12, yc + 0.96],
          [-1.82, yc + 0.98],
        ],
        0.05,
      ),
      (c) => (c.y > yc + 0.9 ? ACCENT : PAINT),
    ),
    ...leg(1.05, 0, 0.52),
    ...leg(-0.7, 0.42, 0.62),
    ...leg(-0.7, -0.42, 0.62),
  ];
  for (const dz of [-1.62, 1.62]) {
    const dx = -0.95;
    parts.push(
      // the duct, lit inside
      part(hoop(dx, yw, dz, 0.44, 0.2, 0.34, 6, 20), (_, n) => (outward(dx, dz) < -0.4 ? ACCENT : n.y < -0.6 ? BELLY : PAINT), true),
      part(new CylinderGeometry(0.36, 0.36, 0.05, 16).translate(dx, yw, dz), DARK),
      part(new CylinderGeometry(0.09, 0.09, 0.1, 8).translate(dx, yw, dz), TRIM),
      downwash(dx, yw - 0.18, dz, 0.34),
    );
  }
  return merge(parts);
}

/**
 * The Lantern: a cabin for six, a band of windows down each side over a belt of light round it and a lit crown on its
 * roof, on two sponsons with two fans each. About 3.7 long, 3.1 across.
 */
function lantern(): BufferGeometry {
  const yc = 1.0;
  const sy = 0.8;
  const sz = 1.02;
  // prettier-ignore
  const cabin = spindle([[-1.85, 0], [-1.76, 0.3], [-1.45, 0.55], [-0.8, 0.72], [0, 0.78], [0.75, 0.79], [1.3, 0.72], [1.62, 0.52], [1.8, 0.26], [1.85, 0]], 20, 0.15)
    .scale(1, sy, sz)
    .translate(0, yc, 0);
  const parts = [
    part(cabin, (c, n) => {
      // which row of faces: its angle over the cabin's equator
      const a = (Math.atan2((c.y - yc) / sy, Math.abs(c.z) / sz) * 180) / Math.PI;
      if (Math.abs(a) < 5) return c.x > 1.55 ? HEAD : c.x < -1.6 ? TAIL : ACCENT;
      // the windows over the belt along both sides, between three slim pillars, lit from inside
      if (a > 8 && a < 45 && c.x > -1.25 && c.x < 1.3 && Math.abs(c.x + 0.62) > 0.06 && Math.abs(c.x - 0.04) > 0.06 && Math.abs(c.x - 0.7) > 0.06) return LIT;
      return n.y < -0.8 ? BELLY : PAINT;
    }, true),
    // a lit crown on the roof
    part(new SphereGeometry(1, 12, 6).scale(0.5, 0.06, 0.16).translate(-0.15, yc + 0.62, 0), ACCENT),
  ];
  for (const s of [-1, 1]) {
    const z = s * 1.12;
    // prettier-ignore
    const sponson = spindle([[-1.62, 0], [-1.5, 0.14], [-1.1, 0.22], [0, 0.24], [1.1, 0.23], [1.5, 0.16], [1.68, 0]], 8, 0.22)
      .scale(1, 1, 1.85)
      .translate(0, 0.38, z);
    parts.push(
      part(sponson, (c, n) => (c.x < -1.46 ? TAIL : n.y < -0.6 ? BELLY : PAINT), true),
      part(new BoxGeometry(0.9, 0.08, 0.45).translate(0, 0.52, s * 0.56), PAINT),
      ...leg(1.0, z, 0.18),
      ...leg(-1.0, z, 0.18),
    );
    for (const fx of [-0.78, 0.78]) {
      parts.push(
        part(new CylinderGeometry(0.3, 0.3, 0.52, 12).translate(fx, 0.38, z), DARK),
        part(hoop(fx, 0.635, z, 0.32, 0.06, 0.03, 3, 14), ACCENT),
        downwash(fx, 0.115, z, 0.28),
      );
    }
  }
  return merge(parts);
}

/** The makes, in order: the Halo, the Manta, the Dart and the Lantern. */
export function aircraft(): BufferGeometry[] {
  return [halo(), manta(), dart(), lantern()];
}
