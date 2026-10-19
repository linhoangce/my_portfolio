/**
 * The film director: turns an arrival into a scene. Three-free; Drive calls it inside the physics sub-steps, so it
 * runs on the same warped clock. The camera rig reads the phase and blends between its modes on its own.
 *
 * Arm: the visitor is heading for a stop and is within ~1.6 s of the brake curve (50 units, 20 when slow), or sits
 * docked there with the overlay not dismissed. Cut: 0.28 s dip to black, the camera snaps under it. Establish: the
 * authored shot with the copy revealed in stages. Hold: orbit the set until the visitor drives on. Exit: 1.2 s blend
 * back to the chase, then a 3 s cooldown before another scene can arm.
 */
import { DOCK_DIST, DOCK_V } from "../constants";
import { type TrainState, useTrain } from "../store";

export const CUT_S = 0.28;
export const SHOT_S = 6;
export const EXIT_S = 1.2;

let plainDocked: number | null = null;

export function stepFilm(st: TrainState, dt: number): void {
  const { sim } = st;
  const film = sim.film;
  film.cooldown -= dt;
  const quick = st.env.reduced || sim.warp > 4;

  if (!st.filmOn) {
    // plain mode: docking opens the overlay, leaving closes it
    if (st.dockedIdx !== plainDocked) {
      plainDocked = st.dockedIdx;
      if (st.dockedIdx !== null) useTrain.setState({ sceneIdx: st.dockedIdx, overlay: st.introDone && st.dismissed !== st.dockedIdx });
      else useTrain.setState({ overlay: false, dismissed: null });
    }
    return;
  }

  if (film.phase === "idle") {
    if (!st.introDone || film.cooldown > 0 || st.monument || st.cab) return;
    for (let i = 0; i < sim.stationS.length; i++) {
      const d = Math.abs(sim.stationS[i] - sim.s);
      const arriving = sim.target === sim.stationS[i] && d <= (Math.abs(sim.v) < 8 ? 20 : 50);
      // from the train's own position: the store's docked index lags a frame behind a jump
      const sitting = d < DOCK_DIST && Math.abs(sim.v) < DOCK_V && st.dismissed !== i && sim.target === null && sim.throttle === 0;
      if (arriving || sitting) {
        st.startScene(i);
        return;
      }
    }
    return;
  }

  // driving on ends the scene: throttle, a new target, or rolling away without one
  const here = sim.stationS[film.idx];
  const leaving =
    sim.throttle !== 0 || (sim.target !== null && sim.target !== here) || (Math.abs(sim.v) > 1.2 && sim.target !== here) || Math.abs(sim.s - here) > 80 || st.cab;
  if (leaving && film.phase !== "exit") {
    if (film.phase === "cut") {
      st.setPhase("idle");
      film.cooldown = 1;
    } else st.endScene();
    return;
  }

  film.t += dt;
  if (film.phase === "cut") {
    if (film.t >= (quick ? 0.15 : CUT_S)) st.setPhase("establish");
  } else if (film.phase === "establish") {
    const T = film.t;
    st.setStage(quick ? 4 : T > 3.8 ? 4 : T > 2.8 ? 3 : T > 1.6 ? 2 : T > 1.0 ? 1 : 0);
    if (T >= (quick ? 0.6 : SHOT_S)) st.setPhase("hold");
  } else if (film.phase === "hold") {
    // the opening hold behind the intro card reveals everything once the card goes
    if (st.introDone && st.sceneStage < 4) st.setStage(4);
  } else if (film.phase === "exit") {
    if (film.t > EXIT_S) st.setPhase("idle");
  }
}

/** Skip the rest of an establishing shot (any drag, zoom or key during it), keeping the camera where it is. */
export function skipToHold(st: TrainState): void {
  if (st.sim.film.phase !== "establish") return;
  st.setStage(4);
  st.setPhase("hold");
}
