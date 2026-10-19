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

/** One 512 px tile = 44 units: an arterial (4 lanes) and a local street (2 lanes) with sidewalks over varied lot colours. */
export function groundTexture(night: boolean, rng: Rng): CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = night ? "#141a26" : "#a9a69e";
  g.fillRect(0, 0, 512, 512);
  const lots = night ? ["#111722", "#161c29", "#121a24", "#13192a"] : ["#b3b0a8", "#9ea39a", "#b9b1a4", "#8fa58a", "#a39f97", "#b0a999"];
  for (let i = 0; i < 90; i++) {
    g.fillStyle = rng.pick(lots);
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    g.fillRect(x, y, 20 + rng.next() * 60, 16 + rng.next() * 50);
  }
  // the arterial sits on the tile edge, so it is drawn at both 0 and 512 to wrap
  for (const [o, half] of [
    [0, 30],
    [512, 30],
    [256, 18],
  ]) {
    g.fillStyle = night ? "#2f3747" : "#cfccc4";
    g.fillRect(o - half - 10, 0, 2 * half + 20, 512);
    g.fillRect(0, o - half - 10, 512, 2 * half + 20); // sidewalks
    g.fillStyle = night ? "#1f2532" : "#5d6168";
    g.fillRect(o - half, 0, 2 * half, 512);
    g.fillRect(0, o - half, 512, 2 * half); // asphalt
    g.fillStyle = night ? "#3a4152" : "#d8d2b0";
    for (let y = 0; y < 512; y += 28) {
      g.fillRect(o - 1, y, 2, 14);
      g.fillRect(y, o - 1, 14, 2);
    } // centre lines
    if (half > 20) {
      g.fillStyle = night ? "#2a3140" : "#8a8e95";
      g.fillRect(o - half + 14, 0, 1, 512);
      g.fillRect(o + half - 14, 0, 1, 512);
      g.fillRect(0, o - half + 14, 512, 1);
      g.fillRect(0, o + half - 14, 512, 1);
    } // lane lines
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

/** A curtain of sword fern fronds draping over the guideway fascia, painted on transparent canvas. */
export function fernTexture(): CanvasTexture {
  const [c, g] = canvas(128, 160);
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 11; k++) {
    const x0 = 8 + k * 11 + rnd() * 4;
    const out = (k % 2 ? 1 : -1) * (6 + rnd() * 10);
    const len = 95 + rnd() * 55;
    const green = 135 + Math.floor(rnd() * 40);
    g.strokeStyle = `rgb(70,${green - 15},55)`;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x0, 2);
    g.quadraticCurveTo(x0 + out * 0.7, len * 0.45, x0 + out, len);
    g.stroke();
    for (let t = 0.08; t < 1; t += 0.07) {
      const x = x0 + out * (0.7 * 2 * t * (1 - t) + t * t);
      const y = 2 + len * t;
      g.fillStyle = `rgb(${84 + Math.floor(rnd() * 20)},${green},${62 + Math.floor(rnd() * 12)})`;
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.ellipse(x + sd * 4.5 * (1 - t * 0.5), y + 1.5, 5.5 * (1 - t * 0.55), 1.8, sd * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return texture(c);
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
