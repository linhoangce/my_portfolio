export type CapabilityReason = "reduced-motion" | "save-data" | "low-memory" | "no-webgl";

export type CapabilityResult = { ok: true } | { ok: false; reason: CapabilityReason; soft: boolean };

type NavigatorExtras = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Decides whether the visitor should get the game or the flat page.
 * Soft reasons (motion, data, memory) are bypassed with ?play=1; the lack of
 * WebGL2 is a hard stop.
 */
export function checkCapabilities({ force = false }: { force?: boolean } = {}): CapabilityResult {
  if (typeof window === "undefined") return { ok: true };

  if (!hasWebGL2()) return { ok: false, reason: "no-webgl", soft: false };
  if (force) return { ok: true };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { ok: false, reason: "reduced-motion", soft: true };
  }
  const nav = navigator as NavigatorExtras;
  if (nav.connection?.saveData) return { ok: false, reason: "save-data", soft: true };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 2) {
    return { ok: false, reason: "low-memory", soft: true };
  }
  return { ok: true };
}

export const reasonText: Record<CapabilityReason, string> = {
  "reduced-motion": "Your system prefers reduced motion, so here is the flat version.",
  "save-data": "Data saver is on, so here is the flat version.",
  "low-memory": "This device is low on memory, so here is the flat version.",
  "no-webgl": "This browser cannot run WebGL, so here is the flat version.",
};
