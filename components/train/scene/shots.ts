/**
 * Each station's establishing shot: a start and an end pose (position and look) and the focus the hold orbit circles.
 * The poses come from the station's set (in the station frame: along the track, lateral toward the set, up from the
 * deck) and are then checked against the generated city: a clear-line search turns the camera around the focus, and
 * raises it, until the lines to every subject miss all building boxes, the camera sits off the guideway and outside
 * the landmarks it does not own. Main Street frames Science World whole, with the water column beside it.
 */
import { Box3, Vector3 } from "three";

import { blockedSamples, roofAt } from "../camSafe";
import { monumentFocus } from "../monuments";
import type { ShotSpec } from "../sets/build";
import { setRegistry } from "../sets/registry";
import { SET_SHIFT, SET_SIDE, STATION_FRAMES } from "../sets/zones";
import { BLOCKERS, LANDMARKS, type LandmarkKey } from "../sites";
import { groundAt, sdfAt } from "../terrain";
import { trackDist, UP } from "../track";

export type Pose = { pos: Vector3; look: Vector3 };
export type ShotPlan = { from: Pose; to: Pose; focus: Vector3; dist: [number, number]; owns?: LandmarkKey };

type V3 = [number, number, number];
const FALLBACK: ShotSpec = { from: [-58, 82, 15], to: [-22, 62, 24], look: [0, 14, 5] };

const cache = new Map<string, ShotPlan>();

export function shotFor(i: number, lowEnd: boolean): ShotPlan {
  const k = `${i}:${lowEnd}:${setRegistry.sets ? 1 : 0}`;
  let plan = cache.get(k);
  if (!plan) {
    plan = i === 4 ? scienceWorldShot(lowEnd) : stationShot(i, lowEnd);
    cache.set(k, plan);
  }
  return plan;
}

/** World position of (along, lateral toward the set, up) at stop i. */
function stationPoint(i: number, [a0, l, u]: V3): Vector3 {
  const fr = STATION_FRAMES[i];
  const s = SET_SIDE[i];
  const a = a0 + SET_SHIFT[i];
  return new Vector3(fr.x + fr.tx * a + fr.rx * l * s, fr.y + u, fr.z + fr.tz * a + fr.rz * l * s);
}

function stationShot(i: number, lowEnd: boolean): ShotPlan {
  const set = setRegistry.sets?.[i];
  const spec: ShotSpec = set?.shot ?? FALLBACK;
  const fr = STATION_FRAMES[i];
  const deck = new Vector3(fr.x, fr.y + 2, fr.z);
  const focus = set?.focus.clone() ?? stationPoint(i, spec.look);
  const look = stationPoint(i, spec.look);
  const fromLook = stationPoint(i, spec.fromLook ?? spec.look);
  const targets = [focus, deck, ...(set?.anchors.slice(0, 2) ?? [])];
  // a free shot starts where it is authored (the Granville dolly starts on the guideway, behind the train); the others
  // are a short push-in that starts just behind where they end, so the cut lands on the set straight away
  const to = search(focus, stationPoint(i, spec.to), targets, lowEnd, undefined, i);
  const from = spec.free ? stationPoint(i, spec.from) : pullBack(to, focus, lowEnd);
  // the hold circles the focus from where the shot ends, so the shot's last look is the focus
  return {
    from: { pos: from, look: spec.free ? fromLook : focus.clone().addScaledVector(UP, -1.5) },
    to: { pos: to, look: spec.free ? look : focus.clone() },
    focus,
    dist: [18, 170],
  };
}

function scienceWorldShot(lowEnd: boolean): ShotPlan {
  const sw = monumentFocus("scienceWorld");
  const fr = STATION_FRAMES[4];
  const station = new Vector3(fr.x, fr.y + 2, fr.z);
  const col = setRegistry.sets?.[4]?.anchors[1]?.clone() ?? station.clone();
  // centred near the sphere, so its deck and the water round it stay in frame with the column beyond
  const mid = sw.clone().lerp(col, 0.25);
  mid.y = sw.y + 2;
  const v = col.clone().sub(sw).setY(0).normalize();
  // look from over False Creek if it can: the bay in the foreground, the sphere on its point and the column and the
  // station beyond it; then the farther from the guideway
  let best = -Infinity;
  const dir = new Vector3();
  const d = new Vector3();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    d.set(Math.cos(a), 0, Math.sin(a));
    let wet = 0;
    for (let u = 0.2; u <= 1.001; u += 0.2) if (sdfAt(mid.x + d.x * 95 * u, mid.z + d.z * 95 * u) < 0) wet++;
    const score = wet * 2 - d.dot(v) * 2.5 + Math.min(trackDist(mid.x + d.x * 95, mid.z + d.z * 95), 60) / 30;
    if (score > best) {
      best = score;
      dir.copy(d);
    }
  }
  const targets = [sw.clone().addScaledVector(UP, 8), sw.clone().addScaledVector(UP, -6), col, station];
  const guessTo = mid.clone().addScaledVector(dir, 108).addScaledVector(UP, 30);
  const to = search(mid, guessTo, targets, lowEnd, "scienceWorld", 4);
  const from = pullBack(to, mid, lowEnd, 16);
  return { from: { pos: from, look: mid.clone().addScaledVector(UP, -1.5) }, to: { pos: to, look: mid.clone() }, focus: mid, dist: [30, 200], owns: "scienceWorld" };
}

/** The other stations' set pieces as boxes, so one stop's camera never stands in (or looks through) the next stop's set. */
let setBoxes: Box3[] | null = null;
function boxesOf(): Box3[] {
  if (!setBoxes && setRegistry.sets) setBoxes = setRegistry.sets.map((st) => new Box3().setFromObject(st.group).expandByScalar(1.5));
  return setBoxes ?? [];
}
const bp = new Vector3();
function setBlocked(a: Vector3, b: Vector3, own: number): number {
  const boxes = boxesOf();
  let n = 0;
  for (let k = 1; k < 28; k++) {
    bp.lerpVectors(a, b, k / 28);
    for (let i = 0; i < boxes.length; i++) if (i !== own && boxes[i].containsPoint(bp)) n++;
  }
  return n;
}

/** How many of 28 samples along a → b pass through a landmark's volume (a cylinder to its top), other than `owns`. */
function landmarkBlocked(a: Vector3, b: Vector3, owns?: LandmarkKey): number {
  let n = 0;
  for (let k = 1; k < 28; k++) {
    const u = k / 28;
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    const z = a.z + (b.z - a.z) * u;
    for (let i = 0; i < BLOCKERS.length; i++) {
      const bl = BLOCKERS[i];
      if (LANDMARKS[i].key !== owns && y < bl.top && (x - bl.x) ** 2 + (z - bl.z) ** 2 < bl.r * bl.r) n++;
    }
  }
  return n;
}

/** A start pose `d` behind and a little above the end pose, along the line of sight, kept clear of roofs and ground. */
function pullBack(to: Vector3, focus: Vector3, lowEnd: boolean, d = 11): Vector3 {
  const p = to.clone().addScaledVector(to.clone().sub(focus).normalize(), d).addScaledVector(UP, 2.5);
  p.y = Math.max(p.y, roofAt(p.x, p.z, 1.5, lowEnd) + 3, groundAt(p.x, p.z) + 4);
  return p;
}

/**
 * From the authored pose, turn around `focus` (all the way round if need be), then back off, then rise a little,
 * scoring every candidate: it must stand clear of the ground, roofs, the guideway and landmarks, and its line to the
 * focus must miss every building and landmark (the hold orbit's spring arm checks the same line); lines to the other subjects count against
 * it. Within about 70° of the authored angle the first fully clear candidate wins, else the least blocked one there;
 * only when that whole arc fails does the camera go further round. Never higher than about 40° over the focus, so a
 * crowded view does not turn into a plan view.
 */
function search(focus: Vector3, guess: Vector3, targets: Vector3[], lowEnd: boolean, owns?: LandmarkKey, own = -1): Vector3 {
  const off = guess.clone().sub(focus);
  const yaw0 = Math.atan2(off.z, off.x);
  const dist0 = Math.hypot(off.x, off.z);
  const up0 = off.y;
  const p = new Vector3();
  let best: Vector3 | null = null;
  let bestScore = Infinity;
  let near: Vector3 | null = null;
  let nearScore = Infinity;
  let order = 0;
  for (const rise of [0, 6, 12]) {
    for (const scale of [1, 1.25, 1.55]) {
      const dist = dist0 * scale;
      const up = Math.min(up0 * scale + rise, dist * 0.84);
      for (let k = 0; k <= 44; k++) {
        order++;
        const a = yaw0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.14;
        p.set(focus.x + Math.cos(a) * dist, focus.y + up, focus.z + Math.sin(a) * dist);
        if (p.y < groundAt(p.x, p.z) + 3) continue;
        if (p.y < roofAt(p.x, p.z, 1.5, lowEnd)) continue;
        if (trackDist(p.x, p.z) < 10) continue;
        // the camera may stand near a landmark (it is part of the view), just not inside one
        if (BLOCKERS.some((b, bi) => LANDMARKS[bi].key !== owns && Math.hypot(p.x - b.x, p.z - b.z) < b.r + 4 && p.y < b.top + 3)) continue;
        if (boxesOf().some((bx, bi) => bi !== own && bx.containsPoint(p))) continue;
        if (blockedSamples(p, focus, 28, lowEnd) > 0 || landmarkBlocked(p, focus, owns) > 0 || setBlocked(p, focus, own) > 0) continue;
        let blocked = 0;
        for (const tg of targets) if (tg !== focus) blocked += blockedSamples(p, tg, 28, lowEnd) + landmarkBlocked(p, tg, owns) + setBlocked(p, tg, own);
        const inArc = Math.ceil(k / 2) * 0.14 <= 1.22;
        if (blocked === 0 && inArc) return p.clone();
        const score = blocked * 50 + order;
        if (inArc && score < nearScore) {
          nearScore = score;
          near = p.clone();
        }
        if (score < bestScore) {
          bestScore = score;
          best = p.clone();
        }
      }
    }
  }
  return near ?? best ?? guess.clone().setY(Math.max(guess.y, roofAt(guess.x, guess.z, 1.5, lowEnd) + 4, groundAt(guess.x, guess.z) + 20));
}
