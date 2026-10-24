/**
 * The visitor's hands on the camera, shared by the pointer, wheel and keyboard controls: orbit, zoom and reset act on
 * whichever view is current (the chase, a scene's hold, a monument). Any of them during an establishing shot skips
 * to the hold. Three-free.
 */
import type { TrainState } from "../store";
import { skipToHold } from "./director";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const inScene = (st: TrainState) => st.sim.film.phase === "establish" || st.sim.film.phase === "hold";

export function orbitBy(st: TrainState, dyaw: number, dpitch: number): void {
  const { sim } = st;
  skipToHold(st);
  if (st.monument) {
    sim.mon.yaw += dyaw;
    sim.mon.pitch = clamp(sim.mon.pitch + dpitch, 0.05, 1.3);
  } else if (inScene(st)) {
    sim.hold.yaw += dyaw;
    sim.hold.pitch = clamp(sim.hold.pitch + dpitch, -0.6, 1.1);
  } else {
    sim.orbit.yaw += dyaw;
    sim.orbit.pitch = clamp(sim.orbit.pitch + dpitch, -0.4, 1.2);
  }
  sim.orbit.idle = 0;
}

/** Positive zooms out; a log multiplier on the view's distance. */
export function zoomBy(st: TrainState, z: number): void {
  const { sim } = st;
  skipToHold(st);
  if (st.monument) sim.mon.zoom = clamp(sim.mon.zoom + z, -0.7, 1.4);
  else if (inScene(st)) sim.hold.zoom = clamp(sim.hold.zoom + z, -1.2, 1.6);
  else sim.orbit.zoom = clamp(sim.orbit.zoom + z, -0.5, 1.5);
  sim.orbit.idle = 0;
}

export function resetView(st: TrainState): void {
  const { sim } = st;
  Object.assign(sim.orbit, { yaw: 0, pitch: 0, zoom: 0 });
  Object.assign(sim.hold, { yaw: 0, pitch: 0, zoom: 0 });
  Object.assign(sim.mon, { pitch: 0.3, zoom: 0 });
}
