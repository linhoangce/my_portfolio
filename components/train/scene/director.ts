/**
 * The scene director: turns an arrival into a scene, the station's section brought in over the view. Three-free; Drive
 * calls it inside the physics sub-steps, so it runs on the same warped clock. The camera keeps its chase view
 * throughout.
 *
 * Arm: the visitor is heading for a stop and is within ~1.6 s of the brake curve (50 units, 20 when slow), or sits
 * docked there, unless the visitor dismissed that stop's scene (Esc) and has not stopped anywhere else since. Cut: a
 * 0.28 s beat. Establish: the copy revealed in stages. Hold: all of it shown until the visitor drives on. Exit: 1.2 s
 * for it to go; the stop just left cannot re-arm for 3 s, the next one can at once.
 */
import { DOCK_DIST, DOCK_V } from "../constants";
import { type TrainState, useTrain } from "../store";

const CUT_S = 0.28;
const REVEAL_S = 4;
const EXIT_S = 1.2;

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
    // a stop the visitor dismissed stays dismissed (round the loop and back, or a scroll that settles there again) until
    // the train stops at another one, or the visitor picks it (driveTo clears it)
    if (st.dismissed !== null && st.dockedIdx !== null && st.dockedIdx !== st.dismissed) useTrain.setState({ dismissed: null });
    if (!st.introDone || st.monument || st.cab) return;
    for (let i = 0; i < sim.stationS.length; i++) {
      if (film.cooldown > 0 && i === film.idx) continue;
      const d = Math.abs(sim.stationS[i] - sim.s);
      const arriving = sim.target === sim.stationS[i] && d <= (Math.abs(sim.v) < 8 ? 20 : 50) && st.dismissed !== i;
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
    st.setStage(quick ? 4 : T > 2.4 ? 4 : T > 1.7 ? 3 : T > 1.0 ? 2 : T > 0.5 ? 1 : 0);
    if (T >= (quick ? 0.6 : REVEAL_S)) st.setPhase("hold");
  } else if (film.phase === "hold") {
    // the opening hold, Waterfront's scene on first load, reveals everything at once
    if (st.introDone && st.sceneStage < 4) st.setStage(4);
  } else if (film.phase === "exit") {
    if (film.t > EXIT_S) st.setPhase("idle");
  }
}

/** Show the rest of a scene's copy at once (any drag, zoom or orbit key while it is coming in). */
export function skipToHold(st: TrainState): void {
  if (st.sim.film.phase !== "establish") return;
  st.setStage(4);
  st.setPhase("hold");
}
