/**
 * The look: themes × weather × season. `lookTargets` turns the three into one target state; `applyLook` sets the
 * discrete things (ground map, mountain snow, particles, crowns) and `tickLook` eases every colour, density and
 * intensity toward the target so a change rolls in over a couple of seconds instead of snapping.
 */
import { Color } from "three";

import { setTreeTargets, tickTrees } from "./trees/treeMaterial";

import type { Season, Theme, Weather } from "./lookTypes";
import type { World } from "./world";

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
    hemi: [0xbfd3ea, 0x9c948a, 1.35],
    sun: [0xfff0d8, 2.9],
    sunDir: [-0.5, 0.75, -0.35],
    disc: [0xfff6e0, 14],
    stars: false,
    facade: 0xffffff,
    windows: 0.0,
    ground: "day",
    water: 0x4f86b5,
    mountain: 0xc4cec0,
    concrete: 0xb3b2ab,
    platform: 0xa9aeb6,
    trainWin: 0.0,
    head: 0.25,
    spot: 0,
    tail: 0.6,
    lamp: 0.0,
    edge: 0.12,
    stationLight: 0,
    bloom: 0.1,
    exposure: 1.04,
    sails: 0xffffff,
  },
};

type WeatherSide = { top: number; hor: number; fog: number; fogD: number; sun: number; hemi: number; disc: boolean };
type WeatherDef = { day: WeatherSide; night: WeatherSide; wet: number };
export const WEATHER: Record<Weather, WeatherDef> = {
  clear: {
    day: { top: 0x4f8ad0, hor: 0xcfe0f2, fog: 0xcfdcea, fogD: 0.00048, sun: 1.1, hemi: 1.0, disc: true },
    night: { top: 0x05070f, hor: 0x151d33, fog: 0x070a12, fogD: 0.0016, sun: 1.0, hemi: 1.0, disc: true },
    wet: 0,
  },
  overcast: {
    day: { top: 0xa9b5c3, hor: 0xdfe4ea, fog: 0xcfd7df, fogD: 0.0013, sun: 0.5, hemi: 1.2, disc: false },
    night: { top: 0x0b0e16, hor: 0x1a2030, fog: 0x0c1019, fogD: 0.0022, sun: 0.6, hemi: 1.0, disc: false },
    wet: 0.3,
  },
  rain: {
    day: { top: 0x8f9aa8, hor: 0xc9d0d8, fog: 0xbfc7d0, fogD: 0.0024, sun: 0.3, hemi: 1.05, disc: false },
    night: { top: 0x080b12, hor: 0x161c2a, fog: 0x0a0e17, fogD: 0.0028, sun: 0.5, hemi: 0.95, disc: false },
    wet: 1,
  },
  snow: {
    day: { top: 0xc3cbd6, hor: 0xeef1f5, fog: 0xe4e8ee, fogD: 0.0028, sun: 0.5, hemi: 1.2, disc: false },
    night: { top: 0x0d1119, hor: 0x202838, fog: 0x10151f, fogD: 0.0032, sun: 0.6, hemi: 1.1, disc: false },
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
  mats.water.color.copy(c.water);
  mats.mountain.color.copy(c.mountain);
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
