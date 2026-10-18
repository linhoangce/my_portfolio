/** Season and weather vocabulary shared by the DOM shell and the scene. No three.js here: the top bar imports it. */

export type Season = "spring" | "summer" | "fall" | "winter";
export type Weather = "clear" | "overcast" | "rain" | "snow";
export type Theme = "dark" | "light";

export const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
export const WEATHERS: Weather[] = ["clear", "overcast", "rain", "snow"];

/** The automatic cycle, 10 s per look, eased over about two seconds. */
export const LOOK_CYCLE: [Season, Weather][] = [
  ["fall", "clear"],
  ["fall", "rain"],
  ["winter", "snow"],
  ["winter", "clear"],
  ["spring", "clear"],
  ["spring", "overcast"],
  ["summer", "clear"],
  ["summer", "rain"],
];

const BY_MONTH: Season[] = [
  "winter",
  "winter",
  "spring",
  "spring",
  "spring",
  "summer",
  "summer",
  "summer",
  "fall",
  "fall",
  "fall",
  "winter",
];

/** Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov fall. */
export const seasonForMonth = (month: number): Season => BY_MONTH[((month % 12) + 12) % 12];
/** Clear by default; overcast in winter. */
export const weatherForSeason = (season: Season): Weather => (season === "winter" ? "overcast" : "clear");

export const cycleNext = <T,>(arr: T[], cur: T): T => arr[(arr.indexOf(cur) + 1) % arr.length];
