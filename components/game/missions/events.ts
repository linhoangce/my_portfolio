/**
 * Typed event bus for the mission system plus a zone membership map.
 * Pure TypeScript: no three.js, unit-testable.
 */

export type ZoneEvent = { type: "zone"; zone: string; tag: string; enter: boolean };
export type CollectEvent = { type: "collect"; tag: string; zone?: string };
export type SpotEvent = { type: "spot"; id: string };
export type GameEvent = ZoneEvent | CollectEvent | SpotEvent;

type Listener = (event: GameEvent) => void;

const listeners = new Set<Listener>();

export function emit(event: GameEvent) {
  for (const listener of listeners) listener(event);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** zone id -> tag -> count of bodies currently inside. */
const membership = new Map<string, Map<string, number>>();

export function updateMembership(zone: string, tag: string, enter: boolean) {
  let tags = membership.get(zone);
  if (!tags) {
    tags = new Map();
    membership.set(zone, tags);
  }
  const next = Math.max(0, (tags.get(tag) ?? 0) + (enter ? 1 : -1));
  tags.set(tag, next);
}

export function countIn(zone: string, tag: string): number {
  return membership.get(zone)?.get(tag) ?? 0;
}

export function isIn(zone: string, tag: string): boolean {
  return countIn(zone, tag) > 0;
}

/** Zones the tagged body is currently inside. */
export function zonesOf(tag: string): string[] {
  const out: string[] = [];
  for (const [zone, tags] of membership) if ((tags.get(tag) ?? 0) > 0) out.push(zone);
  return out;
}

export function resetMembership() {
  membership.clear();
}
