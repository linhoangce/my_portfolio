/**
 * Event lighting: the monuments' LED nodes and rings, the tower crowns, the station accents and the shared glow
 * material all take the current Vancouver event's colours. Patterns are per event (Pride's rainbow sweeps around,
 * Diwali twinkles gold, the cherry festival waves pink, Bright Nights chases red and green, the Celebration of Light
 * bursts). Lights are full strength at night and a third by day.
 */
import { Color, type InstancedMesh, MeshStandardMaterial, type Vector3 } from "three";

import { EVENT_META, type EventId } from "./lookTypes";

/** A lit instanced mesh and the positions its pattern reads (local, normalised height and angle). */
export type LitPattern = { mesh: InstancedMesh; kind: "nodes" | "ring"; heights: Float32Array; angles: Float32Array };

export type EventLights = {
  /** Bands, halos, uplights, flames: one colour that cycles through the palette. */
  glow: MeshStandardMaterial;
  glowB: MeshStandardMaterial;
  patterns: LitPattern[];
  /** Anything else lit by the event or by night (sail uplights, mast lights, a lattice that follows its nodes). */
  followers: ((level: number, ev: EventId | null, t: number) => void)[];
};

export function createEventLights(): EventLights {
  return {
    glow: new MeshStandardMaterial({ color: 0x15171c, emissive: 0xa78bfa, emissiveIntensity: 0, roughness: 0.5 }),
    glowB: new MeshStandardMaterial({ color: 0x15171c, emissive: 0x6ee7f9, emissiveIntensity: 0, roughness: 0.5 }),
    patterns: [],
    followers: [],
  };
}

const NONE = [0xa78bfa, 0x6ee7f9];
const tmp = new Color();
const tmp2 = new Color();
export const paletteOf = (ev: EventId | null): number[] => (ev ? EVENT_META[ev].colours : NONE);

/** The i-th of two rotating colours of a palette at time t (seconds). */
export function eventColour(ev: EventId | null, i: number, t: number, out: Color): Color {
  const cols = paletteOf(ev);
  const n = cols.length;
  const f = (t * 0.25 + i * (n / 2)) % n;
  const a = Math.floor(f);
  return out.setHex(cols[a]).lerp(tmp2.setHex(cols[(a + 1) % n]), Math.min(1, Math.max(0, (f - a - 0.6) / 0.4)));
}

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Recolour every registered pattern for the event at time t; `level` is 1 at night, about a third by day. */
export function tickEventLights(L: EventLights, ev: EventId | null, t: number, level: number): void {
  const cols = paletteOf(ev);
  const n = cols.length;
  for (const p of L.patterns) {
    const count = p.mesh.count;
    for (let i = 0; i < count; i++) {
      const y = p.heights[i];
      const a = p.angles[i];
      let k = 0;
      let blend = false;
      if (ev === "pride") {
        // a sphere's nodes take the rainbow in horizontal bands, as Science World does; rings sweep it round
        k = p.kind === "nodes" ? ((((1 - y) * n * 0.999 + t * 0.15) % n) + n) % n : ((((a / (Math.PI * 2) + 0.5) * n + t * 0.25) % n) + n) % n;
        blend = true;
      } else if (ev === "diwali") k = hash(i, Math.floor(t * 3)) < 0.3 ? 0 : y > 0.4 ? 1 : 2;
      else if (ev === "cherry") {
        k = (Math.sin(y * 4 - t * 1.4) * 0.5 + 0.5) * (n - 1);
        blend = true;
      } else if (ev === "light") k = Math.floor(hash(i, Math.floor(t * 2)) * n);
      else if (ev === "brightnights") k = Math.floor((((a * 3 + t) % n) + n) % n);
      else k = y > Math.sin(t * 0.6) * 0.5 ? 0 : 1;
      const ai = Math.floor(k) % n;
      tmp.setHex(cols[ai]);
      if (blend) tmp.lerp(tmp2.setHex(cols[(ai + 1) % n]), k - Math.floor(k));
      tmp.multiplyScalar(level * (p.kind === "nodes" ? 0.75 + 0.25 * Math.sin(t * 3 + i) : 1));
      p.mesh.setColorAt(i, tmp);
    }
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
  }
  eventColour(ev, 0, t, L.glow.emissive);
  eventColour(ev, 1, t, L.glowB.emissive);
  L.glow.emissiveIntensity = L.glowB.emissiveIntensity = 0.25 + level * 2.2;
  for (const f of L.followers) f(level, ev, t);
}

/** Register an instanced mesh whose instances sit at `points` (normalised height from minY..maxY, angle about centre). */
export function registerPattern(L: EventLights, mesh: InstancedMesh, kind: LitPattern["kind"], points: Vector3[], centre: Vector3): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.y);
    hi = Math.max(hi, p.y);
  }
  const heights = new Float32Array(points.length);
  const angles = new Float32Array(points.length);
  points.forEach((p, i) => {
    heights[i] = hi > lo ? (p.y - lo) / (hi - lo) : 0.5;
    angles[i] = Math.atan2(p.z - centre.z, p.x - centre.x);
  });
  L.patterns.push({ mesh, kind, heights, angles });
}

/**
 * Register an instanced mesh whose instances run along a line (a bridge's handrail), `along` each one's share of the
 * way (0 to 1): the patterns that climb a tower run along it, and those that sweep round a ring chase down it.
 */
export function registerLine(L: EventLights, mesh: InstancedMesh, along: number[]): void {
  L.patterns.push({ mesh, kind: "ring", heights: Float32Array.from(along), angles: Float32Array.from(along, (u) => u * Math.PI * 2 - Math.PI) });
}
