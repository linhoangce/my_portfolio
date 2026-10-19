/**
 * Keeps cameras out of buildings: a 16-unit grid hash over the city's lot boxes (axis-aligned footprints with an
 * absolute top), queried for the highest roof under a point and for clear sight lines.
 */
import type { Vector3 } from "three";

import type { Lot } from "./buildings/city";
import { getCityData } from "./cityData";

const CELL = 16;
let grid: Map<number, Lot[]> | null = null;
let gridFor: boolean | null = null;

const key = (i: number, j: number) => i * 4096 + j;

function lotGrid(lowEnd: boolean): Map<number, Lot[]> {
  if (grid && gridFor === lowEnd) return grid;
  const g = new Map<number, Lot[]>();
  for (const l of getCityData(lowEnd).lots) {
    const i0 = Math.floor((l.x - l.w / 2) / CELL);
    const i1 = Math.floor((l.x + l.w / 2) / CELL);
    const j0 = Math.floor((l.z - l.d / 2) / CELL);
    const j1 = Math.floor((l.z + l.d / 2) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        const list = g.get(k);
        if (list) list.push(l);
        else g.set(k, [l]);
      }
    }
  }
  grid = g;
  gridFor = lowEnd;
  return g;
}

/** The highest roof (plus clearance) of any lot whose footprint, grown by `margin`, contains (x, z); -Infinity if none. */
export function roofAt(x: number, z: number, margin: number, lowEnd: boolean): number {
  const list = lotGrid(lowEnd).get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  let top = -Infinity;
  if (!list) return top;
  for (const l of list) if (Math.abs(x - l.x) < l.w / 2 + margin && Math.abs(z - l.z) < l.d / 2 + margin && l.top > top) top = l.top;
  return top;
}

/** How many of `steps` samples along a → b fall inside a building box. */
export function blockedSamples(a: Vector3, b: Vector3, steps: number, lowEnd: boolean): number {
  let n = 0;
  for (let k = 1; k < steps; k++) {
    const u = k / steps;
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    const z = a.z + (b.z - a.z) * u;
    if (y < roofAt(x, z, 0.5, lowEnd)) n++;
  }
  return n;
}
