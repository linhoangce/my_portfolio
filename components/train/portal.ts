/**
 * A tunnel portal where a line leaves the map: an earth berm over the line's last stretch, closed at both ends, a
 * concrete head wall round its mouth, the mouth dark and deep (walls, roof and a back inside the berm), a band of the
 * line's colour across the lintel, and trees or shrubs on the berm. The parts come back unpainted, by kind, for the
 * line's own meshes. Pure.
 */
import { BoxGeometry, type BufferGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry, Matrix4, PlaneGeometry, Shape, Vector3 } from "three";

import { ribbon } from "./Guideway";
import type { Frame } from "./track";

const UP = new Vector3(0, 1, 0);

export type PortalSpec = {
  /** The mouth: its width, its height above the rails, how far below them it starts (the girder's depth). */
  mouthW: number;
  mouthH: number;
  below: number;
  /** The berm: its half-width at the foot, its crest above the rails, how far down it reaches (into the ground). */
  half: number;
  crest: number;
  drop: number;
  /** Planting on the berm: trees (a forested hill) or shrubs, how many. */
  trees: number;
  shrubs: boolean;
  /** How deep the dark mouth runs in (shallower where the ground rises inside it). */
  depth?: number;
};
export type PortalParts = { berm: BufferGeometry[]; wall: BufferGeometry[]; mouth: BufferGeometry[]; band: BufferGeometry[]; trunks: BufferGeometry[] };

/**
 * The portal over `list`, the line's frames from the mouth (first) to its end (last); each frame's p is at the rails.
 */
export function tunnelPortal(list: Frame[], o: PortalSpec): PortalParts {
  const out: PortalParts = { berm: [], wall: [], mouth: [], band: [], trunks: [] };
  if (list.length < 2) return out;
  // the berm's cross-section (lateral, up from the rails; counter-clockwise from its foot on the right), made wide and
  // high enough that the mouth (and its head wall) lies inside it, or its face could not be cut through
  const H = Math.max(o.crest, o.mouthH + 3);
  const shapeAt = (w: number): [number, number][] => [
    [w, -o.drop],
    [w * 0.82, H * 0.3],
    [w * 0.58, H * 0.72],
    [w * 0.3, H * 0.94],
    [0, H],
    [-w * 0.3, H * 0.94],
    [-w * 0.58, H * 0.72],
    [-w * 0.82, H * 0.3],
    [-w, -o.drop],
  ];
  const widthAt = (pr: [number, number][], y: number): number => {
    for (let k = 0; k < 4; k++) {
      const [l0, v0] = pr[k];
      const [l1, v1] = pr[k + 1];
      if (y >= v0 && y <= v1) return l0 + ((l1 - l0) * (y - v0)) / (v1 - v0 || 1);
    }
    return 0;
  };
  let W = o.half;
  while (widthAt(shapeAt(W), o.mouthH + 2.2) < o.mouthW / 2 + 2) W *= 1.1;
  const profile = shapeAt(W);
  out.berm.push(ribbon(profile, list, true));
  // a frame's basis: x across (sign), y up, z = x × y; the caps' shapes laid in it and pushed out along z
  const basis = (f: Frame, sx: number, z0: number) => {
    const x = f.r.clone().multiplyScalar(sx);
    const z = new Vector3().crossVectors(x, UP);
    return new Matrix4().makeBasis(x, UP, z).setPosition(f.p.clone().addScaledVector(z, z0));
  };
  const shapeOf = (sx: number): Shape => {
    const s = new Shape();
    profile.forEach(([l, v], k) => (k ? s.lineTo(l * sx, v) : s.moveTo(l * sx, v)));
    s.closePath();
    return s;
  };
  // the front: the berm's face with the mouth cut through (x along r, pushed out toward the approach), and the back
  const f0 = list[0];
  const fN = list[list.length - 1];
  const front = shapeOf(1);
  const hole = new Shape();
  hole.moveTo(-o.mouthW / 2, -o.below);
  hole.lineTo(o.mouthW / 2, -o.below);
  hole.lineTo(o.mouthW / 2, o.mouthH);
  hole.lineTo(-o.mouthW / 2, o.mouthH);
  hole.closePath();
  front.holes.push(hole);
  out.berm.push(new ExtrudeGeometry(front, { depth: 0.3, bevelEnabled: false }).applyMatrix4(basis(f0, 1, 0)));
  out.berm.push(new ExtrudeGeometry(shapeOf(-1), { depth: 0.3, bevelEnabled: false }).applyMatrix4(basis(fN, -1, 0)));
  // the head wall round the mouth, standing proud of the face: two piers and a lintel, the line's band across it
  const fw = basis(f0, 1, 0);
  const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z).applyMatrix4(fw);
  const pierW = 1.6;
  const wallTop = o.mouthH + 2.2;
  for (const s of [-1, 1]) out.wall.push(at(new BoxGeometry(pierW, wallTop + o.below, 1.2), s * (o.mouthW / 2 + pierW / 2), (wallTop - o.below) / 2, 0.6));
  out.wall.push(at(new BoxGeometry(o.mouthW + pierW * 2 + 0.4, 2.2, 1.3), 0, o.mouthH + 1.1, 0.65));
  out.band.push(at(new BoxGeometry(o.mouthW + pierW * 2 - 0.4, 0.45, 0.06), 0, o.mouthH + 1.15, 1.33));
  // the mouth's depth: its walls, roof and a back wall in, dark
  const D = o.depth ?? 12;
  for (const s of [-1, 1]) out.mouth.push(at(new PlaneGeometry(D, o.mouthH + o.below).rotateY((s * Math.PI) / 2), (-s * o.mouthW) / 2, (o.mouthH - o.below) / 2, -D / 2));
  out.mouth.push(at(new PlaneGeometry(o.mouthW, D).rotateX(Math.PI / 2), 0, o.mouthH, -D / 2));
  out.mouth.push(at(new PlaneGeometry(o.mouthW, o.mouthH + o.below), 0, (o.mouthH - o.below) / 2, -D));
  // planting: trees (a trunk and a cone) or shrubs, scattered over the berm's upper slopes
  const height = (lat: number): number => {
    const a = Math.abs(lat);
    for (let k = 0; k < 4; k++) {
      const [l0, v0] = profile[k];
      const [l1, v1] = profile[k + 1];
      if (a <= l0 && a >= l1) return v0 + ((v1 - v0) * (l0 - a)) / (l0 - l1 || 1);
    }
    return H;
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < o.trees; k++) {
    const f = list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
    const lat = (rnd() * 2 - 1) * W * 0.7;
    const y = height(lat) - 0.3;
    const p = f.p.clone().addScaledVector(f.r, lat).addScaledVector(UP, y);
    const s = 0.8 + rnd() * 0.6;
    if (o.shrubs) out.berm.push(new IcosahedronGeometry(0.9 * s, 0).scale(1.3, 0.8, 1.3).translate(p.x, p.y + 0.4 * s, p.z));
    else {
      out.trunks.push(new CylinderGeometry(0.18 * s, 0.25 * s, 1.6 * s, 5).translate(p.x, p.y + 0.8 * s, p.z));
      out.berm.push(new ConeGeometry(1.5 * s, 4.6 * s, 7).translate(p.x, p.y + 3.6 * s, p.z));
    }
  }
  return out;
}
