/** Monument positions from the placed landmarks, so the view always centres on what was built. */
import { Vector3 } from "three";

import { MONUMENT_BY_KEY, type MonumentKey } from "./monumentData";
import { LANDMARKS, type LandmarkKey } from "./sites";
import { groundAt } from "./terrain";
import { trackNearest } from "./track";

export { MONUMENT_BY_KEY, MONUMENTS, type Monument, type MonumentKey } from "./monumentData";

const SMALL = new Set<LandmarkKey>(["gate", "cauldron", "orca", "steamClock"]);
const focusCache = new Map<MonumentKey, Vector3>();

/** The centre of a monument's bounding sphere in world space. */
export function monumentFocus(key: MonumentKey): Vector3 {
  let f = focusCache.get(key);
  if (!f) {
    const m = MONUMENT_BY_KEY[key];
    // a monument at its own spot (no landmark) stands on the ground there
    const l = m?.at ? { px: m.at[0], pz: m.at[1], padY: groundAt(m.at[0], m.at[1]), key } : LANDMARKS.find((x) => x.key === key);
    if (!l || !m) throw new Error(`no monument ${key}`);
    const base = m.at || SMALL.has(key as LandmarkKey) ? groundAt(l.px, l.pz) : l.padY;
    f = new Vector3(l.px, base + m.cy, l.pz);
    focusCache.set(key, f);
  }
  return f;
}

/** The yaw that puts the camera on the monument's far side from the guideway, so the line does not fill the frame. */
export function awayYaw(key: MonumentKey): number {
  const f = monumentFocus(key);
  const near = trackNearest(f.x, f.z).p;
  return Math.atan2(f.z - near.z, f.x - near.x);
}

/** Distance at which the whole bounding sphere fits the narrower of the two fields of view, with a margin. */
export function fitDistance(r: number, fovDeg: number, aspect: number): number {
  const vf = (fovDeg * Math.PI) / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  return (r * 1.6) / Math.sin(Math.min(vf, hf) / 2);
}
