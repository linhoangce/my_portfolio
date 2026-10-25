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
export const GRADE_CAP_RAMP = 0.12;
/** The deck stays level this far either side of a station (past its platform's ends). */
export const PLATFORM_FLAT = 22;
/** Minimum deck height above the ground beside the track. */
export const CLEAR_DECK = 7.5;
/**
 * Where the Expo comes down (OSM's structure runs, railData.ts): its rails a ballast's depth over the ground at grade,
 * the floor of its cutting (and of the covered trench at 29th Avenue) this far under the ground.
 */
export const BALLAST = 0.6;
export const CUT_EXPO = 4.5;
/** The Millennium Line: its viaducts lower than the Expo's, its floor in the Grandview Cut this far under the ground. */
export const DECK_MILL = 6.5;
export const CUT_MILL = 7;
/**
 * A rail trench's cross-section about each line in it: a level floor out to `floor` either side (wider at a platform:
 * each bed point carries its own), a steep bank rising `bank` above it within `wall` more, back to the ground within
 * `fade`; concrete retaining walls stand at the floor's edges (Millennium.tsx). The freight line beside the Millennium
 * digs its own, so the floor runs on under both.
 */
export const TRENCH = { floor: 6.5, bank: 8, wall: 3, fade: 8 } as const;
/** The freight line's offset from the Millennium's centreline where they share the cut, on the north side (and past a platform). */
export const FREIGHT_OFFSET = 9;
export const FREIGHT_OFFSET_PLATFORM = 16;
/** Vertical scale of the far backdrop (the North Shore range would tower at TERRAIN_V); blended from TERRAIN_V at the city edge. */
export const FAR_V = 0.26;
/** Lateral offset of each track from the guideway centreline; ours is +LANE (right-hand running). */
export const LANE = 2.6;
/** Length of a scissors crossover diagonal along the track. */
export const CROSS_LEN = 44;

/** An Expo car's length (liveries.ts EXPO), long enough for its long nose to sit in proportion; and between two cars. */
export const CAR = 12;
export const GAP = 0.7;
/** Cars in a train: three, so a train stands whole at a platform (PLATFORM_LEN) with the stations at their real spacing. */
export const TRAIN_CARS = 3;
export const TRAIN_LEN = (TRAIN_CARS - 1) * (CAR + GAP) + CAR;
/**
 * A train's position (sim.s) is its middle, so a docked train is centred on its platform; its lead car's centre is
 * HEAD ahead of that, in the direction of travel.
 */
export const HEAD = (TRAIN_LEN - CAR) / 2;
/** A platform's length: the train and a little to spare. */
export const PLATFORM_LEN = 40;

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
  /**
   * The chase view, the same whether the train runs or stands at a stop: back, up and to the side of the lead car,
   * about 20 degrees down onto it, looking `ahead` of it down the line so the view runs well out in front; a little
   * closer on low-end devices, where a wider view costs more than they have.
   */
  chase: { right: 11, up: 44, back: 120, ahead: 40 },
  chaseLite: { right: 11, up: 35, back: 96, ahead: 32 },
  chasePhone: { right: 13, up: 40, back: 112, ahead: 34 },
  /** The cab: in the lead car, behind its long nose. */
  cab: { up: 3.1, ahead: 3.2, look: 30 },
  /** How fast the chase view swings back behind the train after 3 s without input, once it is moving. */
  yawDecay: 0.6,
  fov: 40,
  near: 0.5,
  far: 5200,
} as const;

/**
 * Day turns to night (and night to the next look's day: its season, weather and event) on its own every this many
 * seconds, until the menu, the day/night button or the attendant takes over.
 */
export const AUTO_LOOK_PERIOD = 15;

/** Below this width the layout is the phone layout (bottom sheets, hold buttons). */
export const PHONE_MAX_WIDTH = 860;

/** The scene loads in this many stages (Scene.tsx), the opening shot's essentials first. */
export const LOAD_STAGES = 6;
/** The stage the city's buildings and lots come in with: what reads them before then sees open ground. */
export const CITY_STAGE = 2;

/** The people's atlas (textures.ts peopleAtlas): its cells and what each holds. */
export const PEOPLE_CELLS = 16;
/** Width of each cell's figure, as a share of a single walker's (couples, a parent and child, a wheelchair are wider). */
export const PEOPLE_WIDTH: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.25, 1.35, 1.55, 1.55, 1, 1];
/** The cells everyone is drawn from; the cedar hat is placed on purpose, not at random. */
export const WALK_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const CELL_COUPLES = [12, 13];
export const CELL_FLAG = 14;
export const CELL_CEDAR = 15;
export const CELL_WHEELCHAIR = 10;

