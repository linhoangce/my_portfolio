/**
 * Traffic over the bridges: Cambie, Granville and Burrard over False Creek, and the Lions Gate over the First
 * Narrows. Their decks stand apart from the street network (roadNetwork.ts leaves the roads out over the water), so
 * each lane keeps its own stream: cars nose to tail at the lane's speed, up the deck's ramp, over the water and down
 * the far side, growing in where the deck leaves the ground and shrinking away where it comes back to it, so none
 * pops. Right-hand running: two lanes each way on the False Creek bridges, where their road markings put them; on the
 * Lions Gate's three, the middle lane runs with the morning rush, into town. Each car's pose for Life.tsx's vehicles.
 */
import type { Rng } from "./cityModel";
import { lionsGateDeck } from "./lionsGate";
import { bridgeDeck, BRIDGES } from "./sites";
import { CAR_KINDS } from "./traffic";

export type BridgeCar = {
  /** Which of CAR_KINDS it is, how far along its lane's loop. */
  kind: number;
  u: number;
  /** The sample it is past (kept as it goes, so finding its place is a step or two). */
  i: number;
  /** Pose: world position, the yaw that turns the body (built nose along +x) to its heading, nose-up pitch, scale. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  s: number;
};
/** A lane: its centreline (x, y, z every few units, the road's top), the length along it, its loop and speed. */
type Lane = { pts: number[]; cum: number[]; len: number; loop: number; v: number; cars: BridgeCar[] };
export type BridgeTraffic = { cars: BridgeCar[]; advance: (dt: number) => void };

/** Units over which a car grows in at the start of a deck and shrinks away at its end. */
const SHOW = 3;
/** Beyond each deck's end, out of sight, a stretch of loop that spaces the streams' returns. */
const OFF = 14;
/** The road's top over the deck line. */
const ROAD = 0.05;

const SHARES = CAR_KINDS.reduce((s, k) => s + k.share, 0);
/** A kind for a draw in [0, 1), by share. */
function kindAt(u: number): number {
  let r = u * SHARES;
  for (let k = 0; k < CAR_KINDS.length; k++) {
    r -= CAR_KINDS[k].share;
    if (r < 0) return k;
  }
  return 0;
}
const LONGEST = Math.max(...CAR_KINDS.map((k) => k.len));

/** A lane through its points at speed v, filled round its loop with cars `gap` (min, max) apart bumper to bumper. */
function lane(pts: number[], v: number, gap: [number, number], rng: Rng): Lane {
  const cum = [0];
  for (let i = 3; i < pts.length; i += 3) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2], pts[i + 2] - pts[i - 1]));
  const len = cum[cum.length - 1];
  const loop = len + OFF;
  const cars: BridgeCar[] = [];
  for (let u = rng.next() * gap[1]; u < loop - LONGEST - gap[0]; ) {
    const kind = kindAt(rng.next());
    cars.push({ kind, u, i: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, s: 0 });
    u += CAR_KINDS[kind].len + gap[0] + rng.next() * (gap[1] - gap[0]);
  }
  return { pts, cum, len, loop, v, cars };
}

/** Pose a car at its place on its lane. */
function place(l: Lane, c: BridgeCar): void {
  if (c.u > l.len) {
    c.s = 0;
    return;
  }
  const { pts, cum } = l;
  while (c.i < cum.length - 1 && cum[c.i] < c.u) c.i++;
  const a = (c.i - 1) * 3;
  const b = c.i * 3;
  const f = Math.min(1, Math.max(0, (c.u - cum[c.i - 1]) / (cum[c.i] - cum[c.i - 1] || 1)));
  const dx = pts[b] - pts[a];
  const dy = pts[b + 1] - pts[a + 1];
  const dz = pts[b + 2] - pts[a + 2];
  c.x = pts[a] + dx * f;
  c.y = pts[a + 1] + dy * f;
  c.z = pts[a + 2] + dz * f;
  c.yaw = Math.atan2(-dz, dx);
  c.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  c.s = Math.max(0, Math.min(1, c.u / SHOW, (l.len - c.u) / SHOW));
}

/** The bridges' lanes and their cars (fewer on the low end, spaced further apart). */
export function bridgeTraffic(rng: Rng, lowEnd: boolean): BridgeTraffic {
  const lanes: Lane[] = [];
  const gap: [number, number] = lowEnd ? [7, 18] : [3, 10];
  for (const br of BRIDGES) {
    const d = bridgeDeck(br);
    const h = br.half;
    // the inner and outer lanes each way, centred between the markings (a → b keeps to the right of the line)
    for (const lat of [0.24 * h, 0.68 * h, -0.24 * h, -0.68 * h]) {
      const pts: number[] = [];
      d.T.forEach((t, i) => {
        const [x, z] = d.at(t, lat);
        pts.push(x, d.deck[i] + ROAD, z);
      });
      if (lat < 0) {
        // b → a: the samples the other way round
        const rev: number[] = [];
        for (let i = pts.length - 3; i >= 0; i -= 3) rev.push(pts[i], pts[i + 1], pts[i + 2]);
        lanes.push(lane(rev, 9 + rng.next() * 2.5, gap, rng));
      } else lanes.push(lane(pts, 9 + rng.next() * 2.5, gap, rng));
    }
  }
  // the Lions Gate: southbound on its west lane and the middle, northbound on its east lane
  const lg = lionsGateDeck();
  for (const [dx, south] of [
    [-2.4, true],
    [0, true],
    [2.4, false],
  ] as const) {
    const pts: number[] = [];
    if (south) for (let z = lg.zEndN; z <= lg.zEndS; z += 2) pts.push(lg.X + dx, lg.deckAt(z) + ROAD, z);
    else for (let z = lg.zEndS; z >= lg.zEndN; z -= 2) pts.push(lg.X + dx, lg.deckAt(z) + ROAD, z);
    lanes.push(lane(pts, 11 + rng.next() * 2, lowEnd ? [10, 24] : [6, 18], rng));
  }
  const cars = lanes.flatMap((l) => l.cars);
  const advance = (dt: number) => {
    for (const l of lanes) {
      for (const c of l.cars) {
        c.u += l.v * dt;
        if (c.u >= l.loop) {
          c.u -= l.loop;
          c.i = 1;
        }
        place(l, c);
      }
    }
  };
  advance(0);
  return { cars, advance };
}
