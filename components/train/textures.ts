/** Canvas-painted textures: ground tiles, facades, foliage, people, train windows, station signs. Client only. */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

import type { Station } from "@/data";

import type { Facade, Rng } from "./cityModel";

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

export type FacadeTextures = { map: CanvasTexture; emissiveMap: CanvasTexture };

/**
 * Four facade families, the way the city reads: curtain-wall glass, white concrete with balcony slabs, brick with
 * punched windows, plain concrete. One 512 px tile = 4 floors × 2 bays; the emissive map lights a share of windows at night.
 */
export function facadeSet(kind: Facade, rng: Rng): FacadeTextures {
  const size = 512;
  const tiles = 4;
  const tw = size / tiles;
  const [c, g] = canvas(size, size);
  const [e, h] = canvas(size, size);
  const warm = () => rng.pick(["#ffd9a0", "#ffe9c4", "#dbe7ff", "#fff3d6"]);
  h.fillStyle = "#000000";
  h.fillRect(0, 0, size, size);
  if (kind === "glass") {
    g.fillStyle = "#8db3cf";
    g.fillRect(0, 0, size, size);
    for (let ty = 0; ty < tiles; ty++) {
      g.fillStyle = "#5f7f97";
      g.fillRect(0, ty * tw, size, 7);
      for (let x = 0; x < size; x += 32) {
        g.fillStyle = "#4e6a81";
        g.fillRect(x, ty * tw, 2, tw);
      }
      if (rng.next() < 0.3) {
        h.fillStyle = warm();
        h.fillRect(0, ty * tw + 9, size, tw - 12);
      }
    }
  } else if (kind === "balcony") {
    g.fillStyle = "#ebe7df";
    g.fillRect(0, 0, size, size);
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        const x = tx * tw;
        const y = ty * tw;
        g.fillStyle = "#2b3a4a";
        g.fillRect(x + 6, y + 14, tw - 12, 56);
        g.fillStyle = "#9aa3ad";
        g.fillRect(x + 6, y + 40, tw - 12, 2);
        g.fillStyle = "#f6f3ec";
        g.fillRect(x, y + 70, tw, 14);
        g.fillStyle = "#cfcac0";
        g.fillRect(x, y + 84, tw, 6);
        if (rng.next() < 0.38) {
          h.fillStyle = warm();
          h.fillRect(x + 8, y + 16, tw - 16, 52);
        }
      }
    }
  } else if (kind === "brick") {
    g.fillStyle = "#9c5c47";
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 8) {
      g.fillStyle = y % 16 ? "#a86652" : "#8f5140";
      g.fillRect(0, y, size, 4);
    }
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        for (const bx of [18, 74]) {
          const x = tx * tw + bx;
          const y = ty * tw + 30;
          g.fillStyle = "#2a2f36";
          g.fillRect(x, y, 36, 70);
          g.fillStyle = "#d8cbb8";
          g.fillRect(x - 3, y + 70, 42, 5);
          if (rng.next() < 0.3) {
            h.fillStyle = warm();
            h.fillRect(x + 2, y + 2, 32, 66);
          }
        }
      }
    }
  } else {
    g.fillStyle = "#d4cdbf";
    g.fillRect(0, 0, size, size);
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        for (const bx of [14, 72]) {
          const x = tx * tw + bx;
          const y = ty * tw + 26;
          g.fillStyle = "#30363f";
          g.fillRect(x, y, 42, 72);
          if (rng.next() < 0.35) {
            h.fillStyle = warm();
            h.fillRect(x + 2, y + 2, 38, 68);
          }
        }
      }
    }
  }
  return { map: texture(c, true), emissiveMap: texture(e, true) };
}

/**
 * Painted trees: a canvas silhouette with the trunk included, soft overlapping leaf clumps for broadleaf trees or
 * layered ragged conifer fronds, in near-neutral luminance so the per-instance season colour sets the hue.
 */
export function foliageTexture(kind: "decid" | "ever", rng: Rng): CanvasTexture {
  const W = 256;
  const H = 320;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#5a4535";
  g.fillRect(W / 2 - 7, H * 0.55, 14, H * 0.45);
  if (kind === "decid") {
    const cx = W / 2;
    const cy = H * 0.38;
    for (let i = 0; i < 160; i++) {
      const a = rng.next() * 6.28;
      const r = Math.pow(rng.next(), 0.55) * 96;
      const x = cx + Math.cos(a) * r * 1.08;
      const y = cy + Math.sin(a) * r * 0.92;
      const rad = 12 + rng.next() * 24;
      const l = 120 + rng.next() * 110 + (cy - y) * 0.45;
      g.fillStyle = `rgb(${(l * 0.86) | 0},${l | 0},${(l * 0.72) | 0})`;
      g.beginPath();
      g.arc(x, y, rad, 0, 6.28);
      g.fill();
    }
  } else {
    for (let t = 0; t < 8; t++) {
      const y0 = 24 + t * 30;
      const w = 22 + t * 15;
      const l = 120 + t * 10 + rng.next() * 25;
      g.fillStyle = `rgb(${(l * 0.8) | 0},${l | 0},${(l * 0.78) | 0})`;
      g.beginPath();
      g.moveTo(W / 2, y0 - 26);
      for (let k = 0; k <= 14; k++) {
        const u = k / 14;
        g.lineTo(W / 2 - w + 2 * w * u, y0 + 18 + (k % 2 ? 16 : 2) + rng.next() * 7);
      }
      g.closePath();
      g.fill();
    }
  }
  return texture(c, false, 8);
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

/** One textured window strip per car: dark glass with a lighter pane by day, the same pane glowing warm at night. */
export function windowTextures(panesPerSide: number): { map: CanvasTexture; emissiveMap: CanvasTexture } {
  const W = 256;
  const H = 64;
  const [c, g] = canvas(W, H);
  const [e, h] = canvas(W, H);
  g.fillStyle = "#1a2230";
  g.fillRect(0, 0, W, H);
  h.fillStyle = "#000000";
  h.fillRect(0, 0, W, H);
  g.fillStyle = "#2b3547";
  g.fillRect(26, 8, 204, 48);
  h.fillStyle = "#ffe3b8";
  h.fillRect(26, 8, 204, 48);
  const mk = (cv: HTMLCanvasElement) => {
    const t = texture(cv, true);
    t.repeat.set(panesPerSide, 1);
    return t;
  };
  return { map: mk(c), emissiveMap: mk(e) };
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

/** Fascia sign: blue Expo-line band, section name, "code · Linh Hoang" in serif violet, the real station name small. */
export function paintSign(cv: HTMLCanvasElement, st: Station, fonts: SignFonts): void {
  const g = cv.getContext("2d");
  if (!g) return;
  g.fillStyle = "#0b1019";
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#1657b3";
  g.fillRect(0, 0, 1024, 26);
  g.fillStyle = "#a78bfa";
  g.fillRect(0, 26, 22, 486);
  g.fillStyle = "#7f8ca3";
  g.font = `500 30px ${fonts.mono}`;
  g.fillText("EXPO LINE · " + st.name.toUpperCase(), 72, 96);
  g.fillStyle = "#eaeff7";
  g.font = `700 ${st.section.length > 12 ? 80 : 104}px ${fonts.sans}`;
  g.fillText(st.section, 72, 250);
  g.fillStyle = "#a78bfa";
  g.font = `400 90px ${fonts.serif}`;
  g.fillText(st.code + " · Linh Hoang", 72, 400);
}

export function signTexture(st: Station, fonts: SignFonts): { texture: Texture; canvas: HTMLCanvasElement } {
  const [c] = canvas(1024, 512);
  paintSign(c, st, fonts);
  return { texture: texture(c), canvas: c };
}
