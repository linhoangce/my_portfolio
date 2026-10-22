/** Canvas-painted textures: ground tiles, people, the train's interior glass, guideway ferns, door labels. Client only. */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

import type { Station } from "@/data";

import type { Rng } from "./cityModel";

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("2D canvas unavailable");
  return [c, g];
};

const texture = (cv: HTMLCanvasElement, repeat = false, anisotropy = 4): CanvasTexture => {
  const t = new CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
};

/**
 * One 512 px tile = 44 units of the city's ground between its buildings: yards and gardens in varied greens and
 * greys, a few paved courts, and a back lane down the middle (Vancouver's blocks have them). The streets are their own
 * meshes (Roads.tsx).
 */
export function groundTexture(night: boolean, rng: Rng): CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = night ? "#141a26" : "#9fa596";
  g.fillRect(0, 0, 512, 512);
  const lots = night ? ["#111722", "#161c29", "#121a24", "#13192a"] : ["#a7ad9c", "#8fa58a", "#9aa891", "#b3b0a8", "#86a07f", "#a39f97", "#93ab8c"];
  for (let i = 0; i < 110; i++) {
    g.fillStyle = rng.pick(lots);
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    g.fillRect(x, y, 20 + rng.next() * 60, 16 + rng.next() * 50);
  }
  // a little grass texture over everything
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = night ? "rgba(255,255,255,0.02)" : `rgba(${i % 2 ? "255,255,255" : "20,40,10"},0.06)`;
    g.fillRect(rng.next() * 512, rng.next() * 512, 3, 3);
  }
  g.fillStyle = night ? "#1b202b" : "#8d8f86";
  g.fillRect(256 - 6, 0, 12, 512); // the lane
  const t = texture(c, true, 8);
  t.repeat.set(65, 55);
  return t;
}

/**
 * The street lights on the same tile: a warm pool on the pavement under each lamp and the lamp itself a bright dot,
 * black elsewhere (the ground's glow map, brought up after dark).
 */
export function streetLightTexture(): CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#000";
  g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = "lighter";
  const pool = (x: number, y: number, r: number, a: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,190,110,${a})`);
    gr.addColorStop(0.5, `rgba(255,170,90,${a * 0.45})`);
    gr.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
    g.fillStyle = "rgba(255,240,210,1)";
    g.fillRect(x - 2.5, y - 2.5, 5, 5);
  };
  for (let k = 0; k < 4; k++) {
    const t = 64 + k * 128;
    // both sidewalks of the arterials (which wrap across the tile edge), then the local street, then the lane
    for (const side of [35, 477]) {
      pool(side, t, 42, 0.55);
      pool(t, side, 42, 0.55);
    }
    pool(t + 32, 256 - 23, 34, 0.45);
    pool(t + 32, 256 + 23, 34, 0.45);
    pool(256, t, 20, 0.25);
  }
  const t = texture(c, true, 8);
  t.repeat.set(65, 55);
  return t;
}

/** A painted person (coat, trousers, hair, a bag or an umbrella) from a seed; six variants are built. */
export function personTexture(seed: number): CanvasTexture {
  const W = 96;
  const H = 192;
  const [c, g] = canvas(W, H);
  let sd = seed * 9301 + 49297;
  const rnd = () => {
    sd = (sd * 9301 + 49297) % 233280;
    return sd / 233280;
  };
  const pk = (arr: string[]) => arr[Math.floor(rnd() * arr.length)];
  const skin = pk(["#f1c9a5", "#e0b48f", "#c68642", "#8d5a3b", "#5c3a21", "#f5d6b8"]);
  const hair = pk(["#111111", "#3b2a1a", "#6b4a2b", "#bfa36f", "#2b2b2b", "#8a8a8a"]);
  const coat = pk(["#1f2937", "#374151", "#7c2d12", "#1e3a8a", "#9f1239", "#e5e7eb", "#065f46", "#f59e0b", "#4b5563", "#b91c1c", "#0f766e", "#c2410c"]);
  const pants = pk(["#111827", "#1f2937", "#334155", "#3b2f2f", "#6b7280", "#1e293b"]);
  const rr = (x: number, y: number, w: number, hh: number, r: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x, y, w, hh, r);
    g.fill();
  };
  rr(33, 118, 12, 62, 4, pants);
  rr(51, 118, 12, 62, 4, pants);
  rr(31, 176, 15, 10, 3, "#111");
  rr(50, 176, 15, 10, 3, "#111");
  rr(26, 58, 44, 66, 10, coat);
  rr(17, 62, 12, 54, 6, coat);
  rr(67, 62, 12, 54, 6, coat);
  g.fillStyle = skin;
  g.fillRect(19, 112, 8, 8);
  g.fillRect(69, 112, 8, 8);
  g.fillRect(43, 46, 10, 14);
  g.beginPath();
  g.arc(48, 34, 16, 0, 6.28);
  g.fill();
  g.fillStyle = hair;
  g.beginPath();
  g.arc(48, 31, 16.5, Math.PI, 0);
  g.fill();
  if (rnd() < 0.4) g.fillRect(31.5, 31, 33, 8);
  if (rnd() < 0.35) rr(12, 80, 10, 22, 3, pk(["#7c2d12", "#111827", "#9a3412"]));
  if (rnd() < 0.25) {
    g.fillStyle = "#333";
    g.fillRect(57, 22, 2, 42);
    g.fillStyle = pk(["#1d4ed8", "#dc2626", "#111", "#f59e0b"]);
    g.beginPath();
    g.arc(58, 22, 26, Math.PI, 0);
    g.fill();
  }
  return texture(c);
}

/**
 * The panoramic glass: by day a dark cabin with a pale sky reflection along the top, at night warm light with rows of
 * seat backs and the odd passenger's head and shoulders against it.
 */
export function interiorTextures(): { map: CanvasTexture; emissiveMap: CanvasTexture } {
  const W = 512;
  const H = 64;
  const [c, g] = canvas(W, H);
  const [e, h] = canvas(W, H);
  g.fillStyle = "#16202c";
  g.fillRect(0, 0, W, H);
  h.fillStyle = "#000000";
  h.fillRect(0, 0, W, H);
  const lg = h.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, "#fff1d6");
  lg.addColorStop(1, "#ffd49a");
  h.fillStyle = lg;
  h.fillRect(0, 6, W, 52);
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let x = 10; x < W; x += 46) {
    h.fillStyle = "#3a2a1a";
    h.fillRect(x, 34, 26, 26);
    g.fillStyle = "#0d141d";
    g.fillRect(x, 34, 26, 26);
    if (rnd() < 0.45) {
      h.fillStyle = "#2a1c12";
      h.beginPath();
      h.arc(x + 13, 24, 7, 0, Math.PI * 2);
      h.fill();
      h.fillRect(x + 6, 30, 14, 14);
    }
  }
  g.fillStyle = "rgba(160,190,215,0.18)";
  g.fillRect(0, 0, W, 22);
  return { map: texture(c, true), emissiveMap: texture(e, true) };
}

/** A clipped hedge: small leaves in three greens with dark gaps, tiling both ways (u round the hedge, v along it). */
export function hedgeTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#24401f";
  g.fillRect(0, 0, 128, 128);
  let sd = 7;
  const rnd = () => {
    sd = (sd * 9301 + 49297) % 233280;
    return sd / 233280;
  };
  const greens = ["#3d6b31", "#4a7c38", "#2f5a28", "#5a8a40"];
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 128;
    const y = rnd() * 128;
    const rx = 2 + rnd() * 2.5;
    const ry = 1.2 + rnd() * 1.6;
    const rot = rnd() * Math.PI;
    g.fillStyle = greens[i % greens.length];
    // drawn again across each edge it crosses, so the tile repeats cleanly
    for (const ox of [-128, 0, 128]) {
      for (const oy of [-128, 0, 128]) {
        if (x + ox < -6 || x + ox > 134 || y + oy < -6 || y + oy > 134) continue;
        g.beginPath();
        g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return texture(c, true);
}

/** Sleepers under a pair of rails: pale concrete ties on the dark slab, one per tile along the track. */
export function sleeperTexture(): CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = "#33373d";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#80848a";
  g.fillRect(3, 20, 58, 24);
  g.fillStyle = "#6d7177";
  g.fillRect(3, 40, 58, 4);
  return texture(c, true);
}

export type SignFonts = { sans: string; serif: string; mono: string };

/** Read the next/font family names off the document so canvas text uses the same faces as the page. */
export function signFonts(): SignFonts {
  const cs = getComputedStyle(document.documentElement);
  const pick = (v: string, fallback: string) => {
    const val = cs.getPropertyValue(v).trim();
    return val ? `${val}, ${fallback}` : fallback;
  };
  return {
    sans: pick("--font-sans", "system-ui, sans-serif"),
    serif: pick("--font-serif", "Georgia, serif"),
    mono: pick("--font-mono", "ui-monospace, monospace"),
  };
}

/** The station's name as a thin light line on the top rail of its platform screen doors. */
export function paintDoorLabel(cv: HTMLCanvasElement, st: Station, fonts: SignFonts): void {
  const g = cv.getContext("2d");
  if (!g) return;
  g.fillStyle = "#0b0f18";
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#a78bfa";
  g.fillRect(0, cv.height - 4, cv.width, 4);
  g.font = `500 30px ${fonts.mono}`;
  g.fillStyle = "#c4b5fd";
  g.fillText(st.code, 24, 40);
  g.fillStyle = "#eaeff7";
  g.fillText(st.name.toUpperCase(), 92, 40);
  g.fillStyle = "#7f8ca3";
  g.textAlign = "right";
  g.fillText(st.section, cv.width - 24, 40);
  g.textAlign = "left";
}

export function doorLabel(st: Station, fonts: SignFonts): { texture: Texture; canvas: HTMLCanvasElement } {
  const [c] = canvas(1024, 60);
  paintDoorLabel(c, st, fonts);
  return { texture: texture(c), canvas: c };
}

let dotTex: CanvasTexture | null = null;
/** A soft round dot, so points read as lights rather than square pixels. Shared. */
export function dotTexture(): CanvasTexture {
  if (dotTex) return dotTex;
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.85)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  dotTex = new CanvasTexture(c);
  return dotTex;
}
