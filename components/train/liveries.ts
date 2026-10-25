/**
 * The Expo's and the Millennium's own cars (trainGeometry.ts styles), each line's character drawn from an animal of the
 * coast as form and finish rather than likeness.
 *
 * The Expo's, after the ocean and the blue whale: a long, broad nose that flows down and levels out into a low rounded
 * snout under a glass canopy; a fuller, rounder section; the body graded from the abyss on the roof through ocean blue
 * to a pale silver-blue underneath (a whale's countershading, quietly), fine flutes sculpted along the lower flanks (the
 * throat's pleats, as form); a silver horizon line where the glass meets the roof; and one slim cyan seam, the light
 * line, dipping toward each end.
 *
 * The Millennium's, after Anna's hummingbird: a slim, taut section whose sides lean in above the waist, and a sharp,
 * raked needle nose with a short windscreen over it; deep jade metallic over graphite with a strong colour shift
 * toward rose (mats.millBody); the whole nose in deep metallic rose, as the bird's head and throat, flowing back into a
 * rose band along each side; and one fine gold blade (the line's yellow) rising from the car's far end to the tip, the
 * band's upper edge.
 */
import { Color } from "three";

import type { At, CarSpec, CarStyle, NoseShape, Section, Strip } from "./trainGeometry";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ca = new Color();
const cb = new Color();
/** Between two sRGB colours, t of the way. */
const mix = (a: number, b: number, t: number) => ca.setHex(a).lerp(cb.setHex(b), Math.min(1, Math.max(0, t))).getHex();

/** A nose from its roof and keel heights at u and its width, rounded off past `round` toward the tip by `k`. */
const noseOf = (S: Section, top: number, keel: number, sx: number, u: number, round = 1, k = 0): NoseShape => {
  const r = u > round ? 1 - k * Math.pow((u - round) / (1 - round), 2) : 1;
  return { sx: sx * r, sy: ((top - keel) / 2 / S.b) * r, dy: (top + keel) / 2 - S.cy };
};
/** The nose's progress at a, whichever end. */
const ends = (a: At) => Math.max(a.front, a.back);

// ------------------------------------------------------------------ the Expo: the ocean
const EXPO_SECTION: Section = { a: 1.5, b: 1.58, cy: 2.22, np: 3, flutes: { n: 7, depth: 0.024, lo: -0.88, hi: -0.26 } };
const ABYSS = 0x0b2342;
const OCEAN = 0x1556a0;
const SHALLOW = 0x9ab9d2;
const HORIZON = 0xd2dde6;
/** The side glass's lower edge: under the canopy it sweeps down, so the nose's glazing wraps low round the cab. */
const expoGlassLo = (a: At) => 0.08 - 0.3 * Math.pow(ends(a), 1.6);
const EXPO_GLASS_HI = 0.84;

export const EXPO: CarStyle = {
  section: EXPO_SECTION,
  nose: 5,
  // the roof flows down in one long curve and levels out into a broad snout over a level keel, rounded at the tip
  profile: (u) => {
    const S = EXPO_SECTION;
    const top = S.cy + S.b - 1.75 * u * u * (3 - 2 * u);
    const keel = S.cy - S.b + 0.2 * u * u * u;
    return noseOf(S, top, keel, 1 - 0.32 * Math.pow(u, 2.4), u, 0.84, 0.78);
  },
  glass: { lo: expoGlassLo, hi: EXPO_GLASS_HI },
  canopy: [0.1, 1],
  tint: (f) => (f > 0.5 ? ABYSS : mix(OCEAN, SHALLOW, smooth(-0.3, -0.9, f))),
  glow: ({ len }: CarSpec): Strip[] => [{ z0: -len / 2, z1: len / 2, lo: (a) => expoGlassLo(a) - 0.2, hi: (a) => expoGlassLo(a) - 0.13 }],
  decals: ({ len, nose, front, back }: CarSpec): Strip[] => [
    { z0: back ? -len / 2 + nose + 0.5 : -len / 2, z1: front ? len / 2 - nose + 0.5 : len / 2, lo: () => EXPO_GLASS_HI, hi: () => EXPO_GLASS_HI + 0.04, hex: HORIZON },
  ],
};

// ------------------------------------------------------------------ the Millennium: Anna's hummingbird
const MILL_SECTION: Section = { a: 1.45, b: 1.62, cy: 2.25, np: 3.8, tumble: 0.14 };
const CROWN = 0x082a21;
const JADE = 0x0d5a43;
const GRAPHITE = 0x161c1b;
const ROSE = 0xc8306e;

/** The gold blade's middle at a, rising from low at the car's far end to the nose's root (t its progress there). */
const bladeOf = ({ len, nose, front }: CarSpec) => {
  const z1 = front ? len / 2 - nose : len / 2;
  return (a: At) => {
    const t = Math.min(1, (a.z + len / 2) / (z1 + len / 2));
    return { t, c: -0.6 + 0.45 * t };
  };
};

export const MILLENNIUM: CarStyle = {
  section: MILL_SECTION,
  nose: 4.4,
  // a raked needle: the roof runs down almost straight to a fine point, the chin rising to meet it
  profile: (u) => {
    const S = MILL_SECTION;
    return noseOf(S, S.cy + S.b - 2.05 * Math.pow(u, 1.2), S.cy - S.b + 0.8 * Math.pow(u, 1.7), 1 - 0.93 * Math.pow(u, 1.35), u);
  },
  glass: { lo: 0.14, hi: 0.84 },
  canopy: [0.06, 0.66],
  // the rose head: the whole nose, crown to chin, easing back into the jade over its first third
  tint: (f, a) => mix(f > 0.5 ? CROWN : mix(JADE, GRAPHITE, smooth(-0.2, -0.85, f)), ROSE, smooth(0.05, 0.4, a.front)),
  // the gold blade: one straight rise from low at the car's far end to the nose's root, then on to the tip
  glow: (car: CarSpec): Strip[] => {
    const blade = bladeOf(car);
    return [{ z0: -car.len / 2, z1: car.len / 2, lo: (a) => blade(a).c - 0.03, hi: (a) => blade(a).c + 0.03 }];
  },
  // the rose band under the blade, broad at the nose's root and tapering to a point at the car's far end
  decals: (car: CarSpec): Strip[] => {
    const blade = bladeOf(car);
    return [{ z0: -car.len / 2, z1: car.len / 2, lo: (a) => blade(a).c - 0.02 - 0.2 * Math.pow(blade(a).t, 1.2), hi: (a) => blade(a).c, hex: ROSE }];
  },
};
