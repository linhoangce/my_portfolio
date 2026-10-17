import type { RefObject } from "react";
import type { Object3D } from "three";

/**
 * Short list of large meshes (buildings, the lighthouse) that may hide an
 * in-world screen. drei's Html raycasts against them every frame, so keep it short.
 */
export const occluderRefs: RefObject<Object3D>[] = [];

/** Ref callback for a mesh that should occlude screens. */
export function registerOccluder(object: Object3D | null) {
  if (!object) return;
  if (occluderRefs.some((r) => r.current === object)) return;
  occluderRefs.push({ current: object });
}
