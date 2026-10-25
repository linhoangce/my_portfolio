/**
 * The SeaBus's crossing as a timetable: its two berths, where each boat lies at them and where it is at any moment on
 * the way between, so the harbour's other boats (harbourTraffic.ts) can keep out of its way as well as SeaBus.tsx can
 * draw it. Pure.
 */
import { SEA } from "./constants";
import { HUB_AT, HUB_GALLERY } from "./waterfrontHub";

/** The SeaBus's two berths: the end of the hub's gallery pier at Waterfront, and Lonsdale Quay on the North Shore. */
export const SEABUS_A: [number, number] = [HUB_AT.x + HUB_GALLERY.x, HUB_AT.z + HUB_GALLERY.z1 - 7];
export const SEABUS_B: [number, number] = [225, -271];
/** The crossing's heading, Waterfront to Lonsdale. */
export const SEABUS_YAW = Math.atan2(SEABUS_B[0] - SEABUS_A[0], SEABUS_B[1] - SEABUS_A[1]);
/**
 * Where Waterfront's name hangs on its terminal float's roof edge toward the inlet, facing out: drawn with the West
 * Coast Express's sign (WestCoastExpress.tsx), which is in view wherever this is, so it costs no draw of its own.
 */
export const SEABUS_SIGN = { x: SEABUS_A[0] + Math.sin(SEABUS_YAW) * 4.45, y: SEA + 5.2, z: SEABUS_A[1] + Math.cos(SEABUS_YAW) * 4.45, ry: SEABUS_YAW };
/** Seconds across, and at each berth. */
const CROSS = 46;
const DWELL = 16;
/** The hull (vessels.ts seabus): end to end and across, the same both ways. */
export const SEABUS_LEN = 18.6;
export const SEABUS_BEAM = 5.8;
/** How far off the straight line each crossing swings at its middle, to its own starboard, so the two pass port to port. */
const SWING = 18;

const UX = Math.sin(SEABUS_YAW);
const UZ = Math.cos(SEABUS_YAW);
/**
 * Where a boat lies at each berth, nose to the float rather than in it: at Waterfront against the terminal float's
 * seaward face (it reaches 4 along the crossing from its centre), its end under the roof's overhang; at Lonsdale
 * against the pontoon's (2.5).
 */
export const SEABUS_STOP_A: [number, number] = [SEABUS_A[0] + UX * (4 + SEABUS_LEN / 2 + 0.25), SEABUS_A[1] + UZ * (4 + SEABUS_LEN / 2 + 0.25)];
export const SEABUS_STOP_B: [number, number] = [SEABUS_B[0] - UX * (2.5 + SEABUS_LEN / 2 + 0.25), SEABUS_B[1] - UZ * (2.5 + SEABUS_LEN / 2 + 0.25)];

export type SeaBusPose = { x: number; z: number; yaw: number; v: number };

/**
 * Where SeaBus k (0 or 1) is at time t: the second sails as the first arrives, so one waits at each berth while the
 * other two cross, then they swap. Each crossing eases away from its berth and in to the next, bowing out to its own
 * starboard on the way; the boats are double-ended and keep their heading, turned only as far as the swing asks.
 */
export function seabusAt(t: number, k: number, out: SeaBusPose): SeaBusPose {
  const [ax, az] = SEABUS_STOP_A;
  const [bx, bz] = SEABUS_STOP_B;
  const cycle = 2 * (CROSS + DWELL);
  const T = (((t + k * (CROSS + DWELL)) % cycle) + cycle) % cycle;
  const ease = (v: number) => v * v * (3 - 2 * v);
  // how far across from A (0 to 1), its rate, and which way it is going (+1 toward B)
  let u = 0;
  let du = 0;
  let dir = 1;
  if (T < DWELL) u = 0;
  else if (T < DWELL + CROSS) {
    const f = (T - DWELL) / CROSS;
    u = ease(f);
    du = (6 * f * (1 - f)) / CROSS;
  } else if (T < 2 * DWELL + CROSS) u = 1;
  else {
    const f = (T - 2 * DWELL - CROSS) / CROSS;
    u = 1 - ease(f);
    du = -(6 * f * (1 - f)) / CROSS;
    dir = -1;
  }
  // the swing to starboard of the way it is going: toward B that is (−UZ, UX), toward A the other side
  const sx = -UZ * dir;
  const sz = UX * dir;
  const off = Math.sin(u * Math.PI) * SWING;
  out.x = ax + (bx - ax) * u + sx * off;
  out.z = az + (bz - az) * u + sz * off;
  // along the track, A to B whichever way it is going
  const dOff = Math.cos(u * Math.PI) * Math.PI * SWING;
  const tx = bx - ax + sx * dOff;
  const tz = bz - az + sz * dOff;
  out.yaw = Math.atan2(tx, tz);
  out.v = Math.hypot(tx, tz) * Math.abs(du);
  return out;
}
