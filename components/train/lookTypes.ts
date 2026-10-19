/** Season and weather vocabulary shared by the DOM shell and the scene. No three.js here: the top bar imports it. */

export type Season = "spring" | "summer" | "fall" | "winter";
export type Weather = "clear" | "overcast" | "rain" | "snow";
export type Theme = "dark" | "light";

export const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
export const WEATHERS: Weather[] = ["clear", "overcast", "rain", "snow"];

/** Vancouver's events: each lights the monuments, the tower crowns and the station accents in its own colours. */
export type EventId = "diwali" | "halloween" | "brightnights" | "lunar" | "cherry" | "vaisakhi" | "light" | "pride";
export const EVENT_IDS: EventId[] = ["diwali", "halloween", "brightnights", "lunar", "cherry", "vaisakhi", "light", "pride"];
export const EVENT_META: Record<EventId, { label: string; season: Season; weather: Weather; night: boolean; colours: number[]; note: string }> = {
  diwali: { label: "Diwali", season: "fall", weather: "clear", night: true, colours: [0xf5b942, 0xff8a1f, 0xd6336c], note: "warm gold and saffron, diyas strung along the station canopies" },
  halloween: { label: "Halloween", season: "fall", weather: "rain", night: true, colours: [0xff7a1a, 0x7c3aed], note: "orange and violet" },
  brightnights: { label: "Bright Nights", season: "winter", weather: "snow", night: true, colours: [0xe03131, 0x2f9e44, 0xfff1d6], note: "red, green and warm white, string lights in the street trees" },
  lunar: { label: "Lunar New Year", season: "winter", weather: "clear", night: true, colours: [0xd62828, 0xf6c344], note: "red and gold, lanterns across Chinatown" },
  cherry: { label: "Cherry Blossom Festival", season: "spring", weather: "clear", night: false, colours: [0xf7a8c4, 0xfff0f5], note: "blossom pink and white, petals in the air" },
  vaisakhi: { label: "Vaisakhi", season: "spring", weather: "overcast", night: false, colours: [0xff9933, 0x2b59c3], note: "saffron and royal blue" },
  light: { label: "Celebration of Light", season: "summer", weather: "clear", night: true, colours: [0x4dabf7, 0xf783ac, 0xffd43b, 0x69db7c], note: "fireworks over English Bay at night" },
  pride: { label: "Pride", season: "summer", weather: "rain", night: false, colours: [0xe40303, 0xff8c00, 0xffed00, 0x008026, 0x004dff, 0x750787], note: "the six-stripe rainbow, rainbow crosswalks" },
};

/** The automatic cycle, 10 s per look, eased over about two seconds; each look carries its event. */
export const LOOK_CYCLE: [Season, Weather, EventId][] = [
  ["fall", "clear", "diwali"],
  ["fall", "rain", "halloween"],
  ["winter", "snow", "brightnights"],
  ["winter", "clear", "lunar"],
  ["spring", "clear", "cherry"],
  ["spring", "overcast", "vaisakhi"],
  ["summer", "clear", "light"],
  ["summer", "rain", "pride"],
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
