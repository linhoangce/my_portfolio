/**
 * Lights that stand over the water and so show in it after dark: buildings along both shores (added by Reflections)
 * and the lit landmarks, which register theirs as they are built. Colours are live: a landmark keeps its Color objects
 * up to date with the event, and the reflections copy them. No three.js beyond the Color type.
 */
import type { Color } from "three";

/** Base at (x, y, z), lit for h above it and w across; `gain` scales the colour. */
export type ReflectSource = { x: number; z: number; y: number; h: number; w: number; col: Color; gain: number };

export const reflectRegistry: { list: ReflectSource[]; version: number } = { list: [], version: 0 };

export function addReflections(sources: ReflectSource[]): void {
  reflectRegistry.list.push(...sources);
  reflectRegistry.version++;
}

/** Take these sources (as added) back out. */
export function removeReflections(sources: ReflectSource[]): void {
  reflectRegistry.list = reflectRegistry.list.filter((s) => !sources.includes(s));
  reflectRegistry.version++;
}
