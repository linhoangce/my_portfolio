/**
 * The pointer controls live in the DOM and the camera in the canvas: the monument picker registers its raycast here,
 * and the controls call it on a click or a (throttled) hover. Three-free.
 */
import type { LandmarkKey } from "../sites";

export const pickBus: { pick: ((clientX: number, clientY: number) => LandmarkKey | null) | null } = { pick: null };
