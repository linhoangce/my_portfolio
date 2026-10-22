/**
 * Patterson's wellness park, round the forest lookout on the city side of the station, laid out in the Contact set's
 * frame (along the track, lateral away from it):
 * - two tennis courts on a level terrace behind the lookout, where the ground falls away, with a pergola between them;
 * - an outdoor gym on a rubber pad east of the lookout, with a bouldering rock;
 * - a yoga lawn to the west, mats in rows facing the instructor's deck;
 * - a red running path joining them.
 *
 * sets/build.ts builds it and cityModel.ts puts its people in it. Pure layout.
 */
import { groundAt } from "../terrain";
import { fromStation } from "./zones";

/** A box in the frame: along [a0, a1], lateral [l0, l1]. */
export type FrameBox = { a0: number; a1: number; l0: number; l1: number };

export const COURTS: FrameBox[] = [
  { a0: -21.5, a1: -4.2, l0: 36, l1: 47.5 },
  { a0: 4.2, a1: 21.5, l0: 36, l1: 47.5 },
];
export const PERGOLA: FrameBox = { a0: -3.2, a1: 3.2, l0: 37.5, l1: 45 };
export const GYM: FrameBox = { a0: 10, a1: 21.5, l0: 8.5, l1: 17.6 };
export const YOGA: FrameBox = { a0: -21.5, a1: -8, l0: 7.5, l1: 14.6 };
/** The instructor's deck at the yoga lawn's west end, and the mats in rows facing it: (along, lateral). */
export const YOGA_DECK: [number, number] = [-19.6, 11];
export const MATS: [number, number][] = [];
for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) MATS.push([-16.2 + row * 2.6, 8.6 + k * 1.75]);
/** The running path: from the gym up the east side, along the courts' front and down to the yoga lawn. */
export const RUN_PATH: [number, number][] = [
  [21, 18.4],
  [21.6, 26],
  [21, 33.6],
  [12, 34.4],
  [0, 34.6],
  [-12, 34.4],
  [-15.8, 33],
];

/** The ground under a box at its highest, world height (the courts' terrace stands level at it). */
export function boxTop(b: FrameBox): number {
  let g = -Infinity;
  for (let a = b.a0; a <= b.a1 + 0.01; a += (b.a1 - b.a0) / 6) for (let l = b.l0; l <= b.l1 + 0.01; l += (b.l1 - b.l0) / 6) g = Math.max(g, groundAt(...fromStation(9, a, l)));
  return g;
}

/** People in the park, standing or playing (world positions and the height of what they stand on). */
export function wellnessPeople(): { x: number; y: number; z: number }[] {
  const at = (a: number, l: number, y?: number) => {
    const [x, z] = fromStation(9, a, l);
    return { x, y: y ?? groundAt(x, z) + 0.12, z };
  };
  const out = [
    // two a side on each court, on its terrace, and two by the pergola
    ...COURTS.flatMap((c) => {
      const am = (c.a0 + c.a1) / 2;
      const lm = (c.l0 + c.l1) / 2;
      const y = boxTop(c) + 0.2;
      return [at(am - 5.2, lm - 1.4, y), at(am - 5.6, lm + 1.6, y), at(am + 5.4, lm - 1.2, y), at(am + 5.1, lm + 1.5, y)];
    }),
    at(0.8, 41, boxTop(PERGOLA) + 0.2),
    at(-1.2, 43, boxTop(PERGOLA) + 0.2),
    // on the gym's bars and benches
    at(12.5, 11.5),
    at(15.4, 15),
    at(18.6, 11),
    at(20.2, 15.6),
    // the class on its mats, and the instructor
    ...MATS.filter((_, k) => k % 4 !== 3).map(([a, l]) => at(a, l)),
    at(YOGA_DECK[0], YOGA_DECK[1], groundAt(...fromStation(9, ...YOGA_DECK)) + 0.45),
  ];
  return out;
}
