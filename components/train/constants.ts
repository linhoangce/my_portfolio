/** Driving, camera and world numbers. Geometry numbers that only one builder uses live next to that builder. */

/** World units per kilometre; x east, z south, origin at Waterfront station. */
export const K = 110;
/** Guideway deck height above the ground. */
export const DECK = 10.5;
/** Lateral offset of each track from the guideway centreline; ours is +LANE (right-hand running). */
export const LANE = 2.6;
/** Length of a scissors crossover diagonal along the track. */
export const CROSS_LEN = 44;

export const CAR = 9.2;
export const GAP = 0.7;
export const TRAIN_LEN = 3 * (CAR + GAP) + CAR;

// Driving model
export const VMAX = 46;
export const ACC = 15;
export const BRAKE = 24;
export const DRAG = 0.55;
export const S_MIN = 6;
export const ASSIST_RADIUS = 30;
export const WHEEL_GAIN = 0.16;
export const SWIPE_GAIN = 0.4;
export const DOCK_DIST = 2.2;
export const DOCK_V = 0.6;
export const KMH_PER_UNIT = 1.8;
export const METRES_PER_UNIT = 9.1;

// The oncoming train on the other track
export const ONCOMING_SPEED = 30;
export const ONCOMING_DWELL = 5;
export const ONCOMING_RESEAT = 420;

// Camera
export const CAM = {
  lambda: 3.2,
  lambdaReduced: 14,
  chase: { right: 11, up: 9.5, back: 30 },
  chasePhone: { right: 13, up: 12, back: 44 },
  station: { right: 30, up: 13, ahead: 20 },
  stationPhone: { right: 40, up: 17, ahead: 28 },
  dockShift: 9,
  cab: { up: 3.1, ahead: 4.4, look: 30 },
  yawMax: 1.3,
  pitchMin: -0.22,
  pitchMax: 0.4,
  yawDecay: 0.6,
  fov: 40,
  near: 0.5,
  far: 5200,
} as const;

/** Seasons and weather cycle on their own every this many seconds until a chip or the attendant takes over. */
export const AUTO_LOOK_PERIOD = 10;

/** Below this width the layout is the phone layout (bottom sheets, hold buttons). */
export const PHONE_MAX_WIDTH = 860;

export const PEOPLE_VARIANTS = 6;
