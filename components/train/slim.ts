/**
 * The rail system drawn at SLIM across the track (constants.ts), its stations included: where a point across a station
 * (in its first numbers, the station's frame, + either side of the track) is drawn now. Pure.
 */
import type { BufferGeometry } from "three";

import { SLIM } from "./constants";

/** A station's deck edge and its platforms' outer edge across the track, in its first numbers. */
const DECK_EDGE = 6.3;
const PLATFORM_OUT = 11.5;

/**
 * Inside the deck's edge at SLIM, as the guideway is; the platform beyond widened to keep its outer edge, so the ways up,
 * the sets' bridges and the halls round it meet it where they did; nothing further out moved.
 */
export function acrossStation(x: number): number {
  const a = Math.abs(x);
  if (a <= DECK_EDGE) return x * SLIM;
  if (a >= PLATFORM_OUT) return x;
  return Math.sign(x) * (DECK_EDGE * SLIM + ((a - DECK_EDGE) * (PLATFORM_OUT - DECK_EDGE * SLIM)) / (PLATFORM_OUT - DECK_EDGE));
}

/** A geometry built in a station's frame, its x across the track, remapped as acrossStation (in place). */
export function slimStation(geo: BufferGeometry): BufferGeometry {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, acrossStation(pos.getX(i)));
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
