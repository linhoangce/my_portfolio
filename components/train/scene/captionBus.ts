/**
 * The pinned captions' DOM elements, registered by SceneCaptions for the canvas-side projector to move. Three-free.
 * `prio` mirrors each caption's priority so phones can keep the top three.
 */
export const captionBus: { els: (HTMLElement | null)[]; prio: number[] } = { els: [], prio: [] };
