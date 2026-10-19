/** Driving, camera and world numbers. Geometry numbers that only one builder uses live next to that builder. */

/** World units per kilometre; x east, z south, origin at Waterfront station. */
export const K = 110;
/** Guideway deck height above the ground (where the terrain allows; see trackProfile.ts). */
export const DECK = 10.5;

// Terrain
/** World units per metre of elevation (≈ 3.6× vertical exaggeration at 9.1 m per unit, so Vancouver's slopes read). */
export const TERRAIN_V = 0.4;
/** The water plane. */
export const SEA = -0.6;
/** Deck grade limits: everywhere, and on the Grandview Cut ramps. */
export const GRADE_CAP = 0.09;
export const GRADE_CAP_RAMP = 0.11;
/** The deck stays level this far either side of a station. */
export const PLATFORM_FLAT = 18;
/** Minimum deck height above the ground beside the track. */
export const CLEAR_DECK = 7.5;
/**
 * The Grandview Cut, as on the real line: from about Clark Drive (past the False Creek Flats) to just beyond 29th
 * Avenue the deck rides low in a trench between wooded banks, with Commercial–Broadway, Nanaimo and 29th Avenue's
 * platforms down in it. `afterMain` and `after29th` are arc distances from those stations.
 */
export const CUT = { afterMain: 150, after29th: 115, rampIn: 80, rampOut: 105, offset: 2.5, bank: 9.5 } as const;
/** Vertical scale of the far backdrop (the North Shore range would tower at TERRAIN_V); blended from TERRAIN_V at the city edge. */
export const FAR_V = 0.26;
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
/** Speed round the turning loops at either end. */
export const LOOP_V = 22;

// Camera
export const CAM = {
  lambda: 3.2,
  lambdaReduced: 14,
  chase: { right: 11, up: 9.5, back: 30 },
  chasePhone: { right: 13, up: 12, back: 44 },
  station: { right: 30, up: 13, ahead: 20 },
  stationPhone: { right: 40, up: 17, ahead: 28 },
  cab: { up: 3.1, ahead: 4.4, look: 30 },
  /** How fast the chase view swings back behind the train after 3 s without input, once it is moving. */
  yawDecay: 0.6,
  fov: 40,
  near: 0.5,
  far: 5200,
} as const;

/** Seasons, weather and events cycle on their own every this many seconds until the menu or the attendant takes over. */
export const AUTO_LOOK_PERIOD = 10;

/** Below this width the layout is the phone layout (bottom sheets, hold buttons). */
export const PHONE_MAX_WIDTH = 860;

export const PEOPLE_VARIANTS = 6;
