/**
 * Houses as instanced templates, so whole neighbourhoods cost a handful of draw calls: the Victorian/Edwardian (steep
 * gable, bay window, porch), the Craftsman (low gable to the street, porch on columns), the Vancouver Special (boxy two
 * storeys, low hip, front balcony) and a plain far-away version. Each instance carries its own wall and roof tint.
 */
import type { BufferGeometry } from "three";

import { GeoBuilder } from "./meshBuilder";
import { box, fp, gable, hip, type Sink, walls, WHITE } from "./parts";

export type HouseKind = "victorian" | "craftsman" | "special" | "simple";
export const HOUSE_KINDS: HouseKind[] = ["victorian", "craftsman", "special", "simple"];

export type HouseInst = { kind: HouseKind; x: number; y: number; z: number; ry: number; sx: number; sz: number; wall: [number, number, number]; roof: [number, number, number] };

/** Template geometry at unit scale: base at y 0, front facing −z, about 6 × 8 units. */
export function houseTemplate(kind: HouseKind): BufferGeometry {
  const B = new GeoBuilder();
  const sink: Sink = { solid: B, glass: B, crownA: B, crownB: B, dome: B, neon: B };
  if (kind === "victorian") {
    walls(sink, "wood", fp.rect(6, 8), 0, 0, -0.6, 3.8, { yRef: 0 });
    gable(sink, "wood", "shingle", 0, 0, 6, 8, 0, 3.8, 2.6, WHITE, WHITE);
    walls(sink, "wood", fp.rect(2.6, 1.2), -1.1, -4.6, -0.6, 3.0, { yRef: 0 });
    hip(sink, "shingle", -1.1, -4.6, 2.6, 1.2, 3.0, 0.7, WHITE, 0, 0.1);
    box(sink, "concrete", 1.5, 0.5, -4.9, 2.6, 0.18, 1.6);
    box(sink, "concrete", 1.5, 2.3, -4.9, 2.8, 0.15, 1.8);
  } else if (kind === "craftsman") {
    walls(sink, "wood", fp.rect(7, 7.5), 0, 0, -0.6, 3.0, { yRef: 0 });
    gable(sink, "wood", "shingle", 0, 0, 7.5, 7, 0, 3.0, 1.7, WHITE, WHITE, Math.PI / 2, 0.6);
    box(sink, "concrete", 0, 0.45, -4.6, 6.4, 0.2, 1.8);
    box(sink, "concrete", 0, 2.6, -4.6, 6.8, 0.18, 2.0);
    for (const x of [-2.8, 2.8]) box(sink, "concrete", x, 0.6, -5.2, 0.35, 2.0, 0.35);
  } else if (kind === "special") {
    walls(sink, "stucco", fp.rect(7, 8), 0, 0, -0.6, 4.2, { yRef: 0, vOff: 0.5 });
    hip(sink, "shingle", 0, 0, 7, 8, 4.2, 1.0, WHITE, 0, 0.5);
    box(sink, "concrete", 0, 2.0, -4.5, 5, 0.15, 1.2);
  } else {
    walls(sink, "wood", fp.rect(6, 7), 0, 0, -0.6, 3.2, { yRef: 0 });
    hip(sink, "shingle", 0, 0, 6, 7, 3.2, 1.6, WHITE, 0, 0.35);
  }
  const g = B.build();
  g.deleteAttribute("aTint");
  return g;
}

