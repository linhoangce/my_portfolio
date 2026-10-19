/** The built sets, shared with the shot planner and the caption projector once Sets.tsx has made them. */
import type { BuiltSet } from "./build";

export const setRegistry: { sets: BuiltSet[] | null } = { sets: null };
