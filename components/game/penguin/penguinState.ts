import type { RapierRigidBody } from "@react-three/rapier";
import { Vector3 } from "three";

import { world } from "@/data";
import type { MoveMode } from "../store";

/** Per-frame penguin facts for the camera, model animation, fish and screens. Mutable, read in loops. */
export const penguinState = {
  /** Physics position (updated every physics step). */
  pos: new Vector3(...world.spawn.position),
  /** Interpolated render position (updated every frame). */
  visualPos: new Vector3(...world.spawn.position),
  yaw: world.spawn.yaw,
  move: "walk" as MoveMode,
  speed: 0,
  grounded: true,
  diving: false,
  airborne: false,
};

let penguinBody: RapierRigidBody | null = null;

export function setPenguinBody(body: RapierRigidBody | null) {
  penguinBody = body;
}

export function getPenguinBody(): RapierRigidBody | null {
  return penguinBody;
}
