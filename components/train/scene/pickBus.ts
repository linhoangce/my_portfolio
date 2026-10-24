/**
 * The pointer controls live in the DOM and the camera in the canvas: the monument picker registers its raycast here,
 * and the controls call it on a click or a (throttled) hover. Three-free.
 */
import type { MonumentKey } from "../monumentData";

export const pickBus: { pick: ((clientX: number, clientY: number) => MonumentKey | null) | null } = { pick: null };
