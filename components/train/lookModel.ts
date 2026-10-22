/**
 * The look: themes × weather × season. `lookTargets` turns the three into one target state; `applyLook` sets the
 * discrete things (ground map, mountain snow, particles, crowns) and `tickLook` eases every colour, density and
 * intensity toward the target so a change rolls in over a couple of seconds instead of snapping.
 */
import { Color } from "three";

import { setTreeTargets, tickTrees } from "./trees/treeMaterial";

import type { Season, Theme, Weather } from "./lookTypes";
import type { MountainHaze, World } from "./world";
import { mirrorState, seaUniforms } from "./waterMirror";

type ThemeDef = {
  bg: number;
  fogD: number;
  skyTop: number;
  skyHor: number;
  hemi: [number, number, number];
  sun: [number, number];
  sunDir: [number, number, number];
  disc: [number, number];
  stars: boolean;
  facade: number;
  windows: number;
  ground: "day" | "night";
  water: number;
  mountain: number;
  concrete: number;
  platform: number;
  trainWin: number;
  head: number;
  spot: number;
  tail: number;
  lamp: number;
  edge: number;
  stationLight: number;
  bloom: number;
  exposure: number;
  sails: number;
};

export const THEMES: Record<Theme, ThemeDef> = {
  dark: {
    bg: 0x070a12,
    fogD: 0.003,
    skyTop: 0x05070f,
    skyHor: 0x151d33,
    hemi: [0x34456b, 0x0a0d14, 1.5],
    sun: [0xbfccff, 1.5],
    sunDir: [-0.45, 0.7, 0.55],
    disc: [0xe8eeff, 18],
    stars: true,
    facade: 0x6a7386,
    windows: 1.0,
    ground: "night",
    water: 0x0b1a2b,
    mountain: 0x1b2334,
    concrete: 0x6b7280,
    platform: 0x4a5160,
    trainWin: 1.1,
    head: 1.3,
    spot: 900,
    tail: 2.5,
    lamp: 1.4,
    edge: 0.7,
    stationLight: 70,
    bloom: 0.22,
    exposure: 1.0,
    sails: 0x9aa4b4,
  },
  light: {
    bg: 0xdfe7f0,
    fogD: 0.0021,
    skyTop: 0x7fa9dc,
    skyHor: 0xe9eef5,
    hemi: [0xbfd3ea, 0x9c948a, 1.15],
    sun: [0xfff0d8, 2.45],
    sunDir: [-0.5, 0.75, -0.35],
    disc: [0xfff6e0, 14],
    stars: false,
    facade: 0xffffff,
    windows: 0.0,
    ground: "day",
    water: 0x4f86b5,
    mountain: 0xc8ccd2,
    concrete: 0xb3b2ab,
    platform: 0xa9aeb6,
    trainWin: 0.0,
    head: 0.25,
    spot: 0,
    tail: 0.6,
    lamp: 0.0,
    edge: 0.12,
    stationLight: 0,
    bloom: 0.04,
    exposure: 0.96,
    sails: 0xffffff,
  },
};

/**
 * haze: the colour the far mountains fade to (hazeHi for their snow) and how fast, per unit of distance; sea: the
 * water's own colour; cloud: the share of the sky the clouds cover, with their lit and shaded colours. The fog is
 * the horizon's colour, so the far city and the open sea dissolve into the sky's own haze.
 */
type WeatherSide = {
  top: number;
  hor: number;
  fog: number;
  fogD: number;
  sun: number;
  hemi: number;
  disc: boolean;
  haze: number;
  hazeHi: number;
  hazeK: number;
  sea: number;
  cloud: number;
  cloudCol: number;
  cloudShade: number;
};
type WeatherDef = { day: WeatherSide; night: WeatherSide; wet: number };
export const WEATHER: Record<Weather, WeatherDef> = {
  clear: {
    // a clear day: the North Shore deep blue behind the city
    day: { top: 0x2f6cc4, hor: 0xb3cbe4, fog: 0xb3cbe4, fogD: 0.00048, sun: 1.1, hemi: 1.0, disc: true, haze: 0x2a4a76, hazeHi: 0xdde8f5, hazeK: 0.0013, sea: 0x1d5585, cloud: 0.3, cloudCol: 0xffffff, cloudShade: 0xb6c3d4 },
    night: { top: 0x04060e, hor: 0x141b30, fog: 0x0b1020, fogD: 0.0016, sun: 1.0, hemi: 1.0, disc: true, haze: 0x0d182c, hazeHi: 0x55647e, hazeK: 0.0012, sea: 0x061224, cloud: 0.22, cloudCol: 0x2a3246, cloudShade: 0x0e121c },
    wet: 0,
  },
  overcast: {
    day: { top: 0x8e9cae, hor: 0xd2d9e1, fog: 0xd2d9e1, fogD: 0.0013, sun: 0.5, hemi: 1.2, disc: false, haze: 0x566a82, hazeHi: 0xe2e7ee, hazeK: 0.0015, sea: 0x35556c, cloud: 0.92, cloudCol: 0xe4e8ed, cloudShade: 0xa3adba },
    night: { top: 0x0b0e16, hor: 0x1a2030, fog: 0x141a28, fogD: 0.0022, sun: 0.6, hemi: 1.0, disc: false, haze: 0x101726, hazeHi: 0x485367, hazeK: 0.0014, sea: 0x08131f, cloud: 0.92, cloudCol: 0x262c3a, cloudShade: 0x0f131b },
    wet: 0.3,
  },
  rain: {
    day: { top: 0x7c8796, hor: 0xbcc4ce, fog: 0xbcc4ce, fogD: 0.0024, sun: 0.3, hemi: 1.05, disc: false, haze: 0x67788c, hazeHi: 0xd9dfe6, hazeK: 0.0019, sea: 0x2e4858, cloud: 0.98, cloudCol: 0xc2c9d1, cloudShade: 0x7e8894 },
    night: { top: 0x080b12, hor: 0x161c2a, fog: 0x10151f, fogD: 0.0028, sun: 0.5, hemi: 0.95, disc: false, haze: 0x0d131d, hazeHi: 0x3c4555, hazeK: 0.0017, sea: 0x060e18, cloud: 0.98, cloudCol: 0x1e2430, cloudShade: 0x0b0e15 },
    wet: 1,
  },
  snow: {
    day: { top: 0xaab3c0, hor: 0xe2e6ec, fog: 0xe2e6ec, fogD: 0.0028, sun: 0.5, hemi: 1.2, disc: false, haze: 0x8794a8, hazeHi: 0xeef2f7, hazeK: 0.0019, sea: 0x3f5a6a, cloud: 0.95, cloudCol: 0xeef1f4, cloudShade: 0xb2bac4 },
    night: { top: 0x0d1119, hor: 0x202838, fog: 0x181e2b, fogD: 0.0032, sun: 0.6, hemi: 1.1, disc: false, haze: 0x161d2a, hazeHi: 0x687388, hazeK: 0.0017, sea: 0x0a1420, cloud: 0.95, cloudCol: 0x2e3442, cloudShade: 0x12161f },
    wet: 0.5,
  },
};

export const PARK_COLOR: Record<Season, number> = { spring: 0x6faa52, summer: 0x5f8f4a, fall: 0x8c8a3a, winter: 0xb9c0c4 };

export type LookTargets = {
  bg: Color;
  top: Color;
  hor: Color;
  fogD: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiI: number;
  sunCol: Color;
  sunI: number;
  exposure: number;
  bloom: number;
  facade: Color;
  windows: number;
  groundCol: Color;
  groundRough: number;
  groundEnv: number;
  water: Color;
  mountain: Color;
  haze: Color;
  hazeHi: Color;
  hazeK: number;
  sea: Color;
  cloud: number;
  cloudCol: Color;
  cloudShade: Color;
  /** The sun's (or the moon's) glitter on the sea and glow in the sky. */
  glint: Color;
  concrete: Color;
  platform: Color;
  sails: Color;
  houseBody: Color;
  houseRoof: Color;
  park: Color;
  forestFloor: Color;
  /** The forest's overall tone (dimmer at night). */
  treeTone: Color;
  trainWin: number;
  head: number;
  spot: number;
  tail: number;
  lamp: number;
  edge: number;
  stationLight: number;
};

export type LookInput = { theme: Theme; season: Season; weather: Weather };

const Cc = (hex: number) => new Color(hex);

export function lookTargets({ theme, season, weather }: LookInput): LookTargets {
  const t = THEMES[theme];
  const w = WEATHER[weather];
  const light = theme === "light";
  const wd = light ? w.day : w.night;
  const winter = season === "winter";
  const snowy = weather === "snow" || winter;
  return {
    bg: Cc(wd.fog),
    top: Cc(wd.top),
    hor: Cc(wd.hor),
    fogD: wd.fogD,
    hemiSky: Cc(t.hemi[0]),
    hemiGround: Cc(t.hemi[1]),
    hemiI: t.hemi[2] * wd.hemi,
    sunCol: Cc(winter && light ? 0xffe2bf : t.sun[0]),
    sunI: t.sun[1] * wd.sun,
    exposure: t.exposure,
    bloom: t.bloom,
    facade: Cc(t.facade),
    windows: t.windows,
    groundCol: Cc(snowy ? (light ? 0xdfe3e8 : 0x7d8590) : 0xffffff),
    groundRough: 1 - 0.6 * w.wet,
    groundEnv: 0.45 * w.wet,
    water: Cc(t.water),
    mountain: Cc(t.mountain),
    haze: Cc(wd.haze),
    hazeHi: Cc(wd.hazeHi),
    hazeK: wd.hazeK,
    sea: Cc(wd.sea),
    cloud: wd.cloud,
    cloudCol: Cc(wd.cloudCol),
    cloudShade: Cc(wd.cloudShade),
    glint: Cc(light ? 0xfff2d8 : 0xbfccff).multiplyScalar(light ? wd.sun : 0.3 * wd.sun),
    concrete: Cc(t.concrete),
    platform: Cc(t.platform),
    sails: Cc(t.sails),
    houseBody: Cc(light ? 0xffffff : 0x8d93a0),
    houseRoof: Cc(snowy ? (light ? 0xe8ecf0 : 0x9aa2ac) : light ? 0xffffff : 0x7b8290),
    park: Cc(snowy ? (light ? 0xd5dbe0 : 0x6f767e) : PARK_COLOR[season]),
    forestFloor: Cc(weather === "snow" ? (light ? 0xcfd6db : 0x5f666e) : light ? 0x46613d : 0x1f2a1e),
    treeTone: Cc(light ? 0xffffff : 0x8f96a0),
    trainWin: t.trainWin,
    head: t.head,
    spot: t.spot,
    tail: t.tail,
    lamp: t.lamp,
    edge: t.edge,
    stationLight: t.stationLight,
  };
}

/** Discrete switches for a new theme / season / weather, then a new eased target. */
export function applyLook(world: World, input: LookInput): void {
  const t = THEMES[input.theme];
  const w = WEATHER[input.weather];
  const light = input.theme === "light";
  const wd = light ? w.day : w.night;
  const winter = input.season === "winter";
  world.sunDir.set(t.sunDir[0], t.sunDir[1] * (winter && light ? 0.55 : 1), t.sunDir[2]).normalize();
  world.sky.disc.material.color.setHex(t.disc[0]);
  world.sky.disc.scale.setScalar(t.disc[1]);
  world.sky.disc.visible = wd.disc;
  world.sky.stars.visible = t.stars && wd.disc;
  world.mats.ground.map = world.tex.ground[t.ground];
  world.mats.ground.needsUpdate = true;
  // the plain ground beyond the streets: a muted grass by day, near-black at night (as the tile's lots are)
  (world.mats.ground.userData.plain as { value: Color } | undefined)?.value.setHex(t.ground === "day" ? 0x97a48a : 0x10161f);
  if (world.refs.mountain && world.refs.mountainCols) {
    world.refs.mountain.geometry.setAttribute("color", world.refs.mountainCols[winter ? "winter" : "summer"]);
  }
  world.precip.rain.visible = input.weather === "rain";
  world.precip.snow.visible = input.weather === "snow";
  setTreeTargets(world.trees, input.season, input.weather);
  world.look.lastSeason = input.season;
  world.look.tgt = lookTargets(input);
  if (!world.look.cur) world.look.cur = lookTargets(input);
}

/** Ease every material and light toward the target. `instant` snaps (reduced motion or a first frame). */
export function tickLook(world: World, dt: number, instant: boolean, dockedIdx: number | null): void {
  const c = world.look.cur;
  const g = world.look.tgt;
  if (!c || !g) return;
  const k = instant ? 1 : 1 - Math.exp(-dt * 1.6);
  for (const key of Object.keys(g) as (keyof LookTargets)[]) {
    const gv = g[key];
    const cv = c[key];
    if (typeof gv === "number" && typeof cv === "number") (c[key] as number) = cv + (gv - cv) * k;
    else if (gv instanceof Color && cv instanceof Color) cv.lerp(gv, k);
  }
  const { mats, lights, sky, refs } = world;
  world.scene.background.copy(c.bg);
  world.scene.fog.color.copy(c.bg);
  world.scene.fog.density = c.fogD;
  sky.mat.uniforms.top.value.copy(c.top);
  sky.mat.uniforms.hor.value.copy(c.hor);
  sky.mat.uniforms.cloud.value = c.cloud;
  sky.mat.uniforms.cloudCol.value.copy(c.cloudCol);
  sky.mat.uniforms.cloudShade.value.copy(c.cloudShade);
  sky.mat.uniforms.sunCol.value.copy(c.glint);
  seaUniforms.uSeaDeep.value.copy(c.sea);
  seaUniforms.uSunCol.value.copy(c.glint);
  lights.hemi.color.copy(c.hemiSky);
  lights.hemi.groundColor.copy(c.hemiGround);
  lights.hemi.intensity = c.hemiI;
  lights.sun.color.copy(c.sunCol);
  lights.sun.intensity = c.sunI;
  world.gl.toneMappingExposure = c.exposure;
  if (refs.bloom) refs.bloom.strength = c.bloom;
  const bm = world.buildings;
  for (const m of [bm.solid, bm.glass, bm.house]) {
    m.color.copy(c.facade);
    m.emissiveIntensity = c.windows;
  }
  bm.neon.emissiveIntensity = 0.4 + c.windows * 1.6;
  bm.dome.emissiveIntensity = c.windows * 0.35;
  bm.crownA.emissiveIntensity = bm.crownB.emissiveIntensity = 0.3 + c.windows * 1.8;
  mats.ground.color.copy(c.groundCol);
  mats.ground.roughness = c.groundRough;
  mats.ground.envMapIntensity = c.groundEnv;
  mats.ground.emissiveIntensity = c.windows;
  mats.water.color.copy(c.water);
  // the environment map is a lit room: its light panels glare on the water after dark, so the reflection fades
  // (the mirror takes over where it runs)
  mats.water.envMapIntensity = mirrorState.active ? 0 : 0.45 - 0.4 * c.windows;
  mats.mountain.color.copy(c.mountain);
  const haze = mats.mountain.userData.haze as MountainHaze | undefined;
  if (haze) {
    haze.uHaze.value.copy(c.haze);
    haze.uHazeHi.value.copy(c.hazeHi);
    haze.uHazeK.value = c.hazeK;
  }
  mats.concrete.color.copy(c.concrete);
  mats.plat.color.copy(c.platform);
  mats.landmark.color.copy(c.concrete);
  mats.dome.color.copy(c.sails);
  mats.sail.color.copy(c.sails);
  mats.park.color.copy(c.park);
  mats.forestFloor.color.copy(c.forestFloor);
  tickTrees(world.trees, dt, instant, c.treeTone);
  mats.window.emissiveIntensity = c.trainWin;
  mats.head.emissiveIntensity = c.head;
  mats.tail.emissiveIntensity = c.tail;
  for (const sp of lights.spots) sp.intensity = c.spot;
  mats.lamp.emissiveIntensity = c.lamp;
  lights.stationLight.intensity = c.stationLight;
  mats.edge.forEach((m, i) => {
    m.emissiveIntensity = i === dockedIdx ? c.edge * 2.4 : c.edge;
  });
}
