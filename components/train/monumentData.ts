/**
 * The monuments a visitor can circle: name, era line and a bounding sphere (radius, centre height above the base)
 * for framing and picking. Three-free, so the DOM controls and the menu can list them.
 */
import type { LandmarkKey } from "./sites";

export type Monument = { key: LandmarkKey; name: string; era: string; r: number; cy: number };

/** Ordered for M (next monument) and the menu list; the Convention Centre is a backdrop, not a monument. */
export const MONUMENTS: Monument[] = [
  { key: "scienceWorld", name: "Science World", era: "Expo 86 · geodesic dome · an LED node at every vertex", r: 17, cy: 11 },
  { key: "bcPlace", name: "BC Place", era: "1983 · cable-stayed roof since 2011 · LED crown", r: 50, cy: 20 },
  { key: "canadaPlace", name: "Canada Place", era: "Expo 86 · five sails over the cruise pier", r: 46, cy: 8 },
  { key: "harbourCentre", name: "Vancouver Lookout", era: "Harbour Centre · 1977 · the saucer and its glass elevators", r: 33, cy: 31 },
  { key: "rogers", name: "Rogers Arena", era: "1995 · home ice of the Canucks · a glass roof over the rink", r: 24, cy: 6 },
  { key: "gate", name: "Millennium Gate", era: "2002 · Chinatown's gateway on Pender Street", r: 7, cy: 4.5 },
  { key: "cauldron", name: "Olympic Cauldron", era: "2010 Winter Games · Jack Poole Plaza", r: 8, cy: 6.5 },
  { key: "orca", name: "Digital Orca", era: "Douglas Coupland · 2009 · Coal Harbour", r: 5.5, cy: 3.5 },
  { key: "steamClock", name: "Gastown Steam Clock", era: "1977 · whistles on the quarter hour", r: 4.5, cy: 3.5 },
];
export const MONUMENT_BY_KEY = Object.fromEntries(MONUMENTS.map((m) => [m.key, m])) as Partial<Record<LandmarkKey, Monument>>;
