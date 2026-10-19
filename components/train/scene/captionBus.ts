/**
 * The pinned captions' DOM elements, registered by SceneCaptions for the canvas-side projector to move. Three-free.
 * `prio` mirrors each caption's priority so phones can keep the top three.
 */
/**
 * `all`: every caption shows on phones too (Contact's captions are its content, not a selection). `docked`: on a
 * phone those are laid out in a grid along the bottom rather than pinned in the scene.
 */
export const captionBus: { els: (HTMLElement | null)[]; prio: number[]; all: boolean; docked: boolean } = { els: [], prio: [], all: false, docked: false };
