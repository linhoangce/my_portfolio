import { Vector3 } from "three";

import { type ScreenDef, world } from "@/data";
import { SCREENS } from "../constants";
import { terrainHeight } from "../world/terrainHeight";

const cache = new Map<string, Vector3>();

/** World-space centre of a screen panel (data y is height above the local ground). */
export function screenAnchor(def: ScreenDef): Vector3 {
  const cached = cache.get(def.id);
  if (cached) return cached;
  const [x, yAbove, z] = def.position;
  const ground = Math.max(terrainHeight(x, z), world.waterLevel + 0.3);
  const v = new Vector3(x, ground + yAbove, z);
  cache.set(def.id, v);
  return v;
}

/** Unit normal the panel faces. */
export function screenNormal(def: ScreenDef): Vector3 {
  return new Vector3(Math.sin(def.yaw), 0, Math.cos(def.yaw));
}

/** Camera pose that makes the panel fill ~70% of the viewport. */
export function focusPose(def: ScreenDef, fovDeg: number, aspect: number): { position: Vector3; lookAt: Vector3 } {
  const [w, h] = def.size;
  const fov = (fovDeg * Math.PI) / 180;
  const tan = Math.tan(fov / 2);
  const dH = h / SCREENS.focusFill / (2 * tan);
  const dW = w / SCREENS.focusFill / (2 * tan * aspect);
  const d = Math.max(dH, dW, 1.2);
  const anchor = screenAnchor(def);
  const n = screenNormal(def);
  return {
    position: anchor.clone().addScaledVector(n, d),
    lookAt: anchor.clone(),
  };
}
