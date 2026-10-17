/**
 * Every tunable number for the game feel lives here. Units are metres,
 * seconds and radians unless noted. Adjust and reload.
 */

export const GRAVITY = -22;

export const PENGUIN = {
  /** Capsule collider: total height = 2 * (halfHeight + radius). */
  radius: 0.34,
  halfHeight: 0.28,

  // Walking
  walkSpeed: 5.2,
  /** How fast horizontal velocity chases the target (1/s). Higher = snappier. */
  walkAccel: 16,
  walkDecel: 14,
  /** Visual yaw rate toward the move direction (1/s). */
  turnRate: 14,

  // Jumping
  jumpSpeed: 8.2,
  coyoteMs: 110,
  jumpBufferMs: 140,

  // Belly slide (ice only)
  slideMaxSpeed: 12,
  /** Speed added when the slide starts; feels like a push-off. */
  slideKick: 4,
  /** Minimum speed before a slide can start. */
  slideStartSpeed: 1.5,
  /** Steering rate while sliding (rad/s). */
  slideSteer: 1.5,
  /** Fraction of speed lost per second on flat ice. */
  slideDecay: 0.22,
  /** The slide ends below this speed. */
  slideExitSpeed: 1.6,
  /** Forward push while holding W during a slide (m/s^2). Cruise speed = thrust / decay. */
  slideThrust: 2.6,

  // Swimming
  swimSpeed: 3.6,
  swimAccel: 5,
  swimTurn: 5,
  /** Depth of the body centre when surfaced / diving (relative to water level). */
  surfaceDepth: -0.42,
  diveDepth: -2.4,
  /** Vertical pull toward the target depth (1/s). */
  buoyancy: 4,
  /** Upward speed applied when a walkable edge is found ahead while swimming. */
  hopSpeed: 7.5,
  hopForward: 3,

  // Ground probe
  groundProbe: 0.35,
  slopeMaxDeg: 40,
  /** Centre height above the water surface below which we count as swimming. */
  swimEnterDepth: -0.12,
};

export const CAMERA = {
  fov: 50,
  distance: 7.5,
  minDistance: 3,
  maxDistance: 14,
  pitch: 0.38,
  minPitch: -0.12,
  maxPitch: 1.25,
  /** Radians per pixel of pointer drag. */
  yawPerPx: 0.0045,
  pitchPerPx: 0.003,
  /** Follow damping (higher = tighter). */
  positionLambda: 7,
  targetLambda: 9,
  targetHeight: 0.9,
  /** Wheel zoom step as a fraction of the distance per 100 px of delta. */
  zoomStep: 0.1,
  /** Min pitch while swimming at the surface, keeps the camera above the water. */
  swimMinPitch: 0.14,
  /** Pull-in offset from obstructions. */
  collisionPad: 0.35,
  /** Seconds to settle into a focus pose. */
  focusLambda: 5,
};

export const FISH = {
  catchRadius: 1.15,
  /** Fish accelerate away from the penguin inside this radius. */
  scareRadius: 2.6,
  cruiseSpeed: 1.1,
  fleeSpeed: 3.4,
  /** Seconds before a caught fish respawns on its loop. */
  respawnSeconds: 6,
};

export const SCREENS = {
  /** Panels mount as DOM only within this distance. */
  mountDistance: 25,
  maxMounted: 3,
  /** Fraction of the viewport the screen fills in focus mode. */
  focusFill: 0.7,
  /** Throttle for the distance check, in Hz. */
  checkHz: 4,
  /** CSS pixels per world metre for in-world panels (drei Html transform maps px -> distanceFactor / 400 m). */
  pxPerMetre: 170,
  /** Viewports narrower than this show focus mode as a full-screen overlay. */
  overlayBelowPx: 768,
};

export const MISSIONS = {
  /** Missions that can start in the current milestone. M2 adds 3-7. */
  enabled: ["first-waddle", "fishing-lesson"] as const,
};

export const PHYSICS = {
  timeStep: 1 / 60,
};

export const RENDER = {
  dprDesktop: [1, 1.75] as [number, number],
  dprMobile: [0.75, 1.25] as [number, number],
  shadowMapSize: 1024,
};

/** Rapier collision groups (membership bits). */
export const GROUP = {
  terrain: 0x0001,
  penguin: 0x0002,
  props: 0x0004,
  sensor: 0x0008,
};
