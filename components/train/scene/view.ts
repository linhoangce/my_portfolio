/**
 * The visitor's hands on the camera, shared by the pointer, wheel and keyboard controls: orbit, zoom and reset act on
 * whichever view is current (the chase or a monument). Any of them while a scene's copy is still coming in shows the
 * rest of it at once. Three-free.
 */
import type { TrainState } from "../store";
import { skipToHold } from "./director";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function orbitBy(st: TrainState, dyaw: number, dpitch: number): void {
  const { sim } = st;
  skipToHold(st);
  if (st.monument) {
    sim.mon.yaw += dyaw;
    sim.mon.pitch = clamp(sim.mon.pitch + dpitch, 0.05, 1.3);
  } else {
    sim.orbit.yaw += dyaw;
    sim.orbit.pitch = clamp(sim.orbit.pitch + dpitch, -0.4, 1.2);
  }
  sim.orbit.idle = 0;
}

/** Positive zooms out; a log multiplier on the view's distance. The chase can come in close to the train or go far out. */
export function zoomBy(st: TrainState, z: number): void {
  const { sim } = st;
  skipToHold(st);
  if (st.monument) sim.mon.zoom = clamp(sim.mon.zoom + z, -0.7, 1.4);
  else sim.orbit.zoom = clamp(sim.orbit.zoom + z, -1.3, 1);
  sim.orbit.idle = 0;
}

export function resetView(st: TrainState): void {
  const { sim } = st;
  Object.assign(sim.orbit, { yaw: 0, pitch: 0, zoom: 0 });
  Object.assign(sim.mon, { pitch: 0.3, zoom: 0 });
}
