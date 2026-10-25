/** Canvas-painted textures: ground tiles, people, the train's interior glass, guideway ferns, door labels. Client only. */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

import type { Station } from "@/data";

import type { Rng } from "./cityModel";
import { PEOPLE_CELLS } from "./constants";

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

/**
 * The people of the city, painted into one atlas of PEOPLE_CELLS figures (4 × 4 cells of 96 × 192 px), so every
 * pedestrian is one instanced mesh whose cell an instance attribute picks:
 * - walkers in coats, with bags and umbrellas, across the full range of skin tones;
 * - a woman in a hijab;
 * - a Sikh man in a dastar;
 * - a woman in a salwar kameez and dupatta;
 * - an elder with a cane;
 * - a wheelchair user;
 * - a parent with a child;
 * - two couples (two men, two women) holding hands;
 * - someone carrying a small Progress Pride flag;
 * - someone in a woven cedar hat and a red-and-black blanket cape (seen at the big house and the welcome figures).
 * Each cell's figure keeps a few pixels clear of its edges, so mipmaps do not bleed between cells.
 */
const SKINS = ["#f6d7bd", "#eac09a", "#d39b6f", "#b07a4f", "#8a5a36", "#5e3b22", "#3f2716"];
const HAIRS = ["#111111", "#2b1d12", "#5a3a22", "#a8875a", "#d9c7a0", "#8a8a8a"];
const COATS = ["#1f2937", "#7c2d12", "#1e3a8a", "#9f1239", "#e5e7eb", "#065f46", "#f59e0b", "#0f766e", "#c2410c", "#6d28d9", "#334155", "#b45309"];
const PANTS = ["#111827", "#1f2937", "#334155", "#3b2f2f", "#6b7280", "#1e293b"];

/** Paint the atlas. */
export function peopleAtlas(): CanvasTexture {
  const CW = 96;
  const CH = 192;
  const [c, g] = canvas(CW * 4, CH * 4);
  for (let k = 0; k < PEOPLE_CELLS; k++) {
    g.save();
    g.translate((k % 4) * CW, Math.floor(k / 4) * CH);
    g.beginPath();
    g.rect(0, 0, CW, CH);
    g.clip();
    paintPerson(g, k);
    g.restore();
  }
  return texture(c);
}

function paintPerson(g: CanvasRenderingContext2D, k: number): void {
  let sd = (k + 1) * 9301 + 49297;
  const rnd = () => {
    sd = (sd * 9301 + 49297) % 233280;
    return sd / 233280;
  };
  const pk = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const rr = (x: number, y: number, w: number, h: number, r: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
  };
  const disc = (x: number, y: number, r: number, col: string, a0 = 0, a1 = Math.PI * 2) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, a0, a1);
    g.fill();
  };
  // every figure's skin from the whole range, spread over the cells
  const skin = SKINS[(k * 3) % SKINS.length];
  /** A standing figure, `s` its scale and `cx` its middle; returns nothing, paints legs, body, arms, head and hair. */
  const walker = (cx: number, s: number, skinC: string, coat: string, pants: string, hair: string | null, opts: { long?: boolean; skirt?: string } = {}) => {
    const X = (v: number) => cx + (v - 48) * s;
    const Y = (v: number) => 192 - (192 - v) * s;
    const W = (v: number) => v * s;
    if (opts.skirt) {
      // a long tunic over trousers: the trousers' hems show at the ankles
      rr(X(34), Y(150), W(11), W(30), 3 * s, pants);
      rr(X(51), Y(150), W(11), W(30), 3 * s, pants);
      g.fillStyle = opts.skirt;
      g.beginPath();
      g.moveTo(X(28), Y(92));
      g.lineTo(X(68), Y(92));
      g.lineTo(X(72), Y(158));
      g.lineTo(X(24), Y(158));
      g.closePath();
      g.fill();
    } else {
      rr(X(33), Y(118), W(12), W(62), 4 * s, pants);
      rr(X(51), Y(118), W(12), W(62), 4 * s, pants);
    }
    rr(X(31), Y(176), W(15), W(10), 3 * s, "#111");
    rr(X(50), Y(176), W(15), W(10), 3 * s, "#111");
    rr(X(26), Y(58), W(44), W(opts.long ? 92 : 66), 10 * s, coat);
    rr(X(17), Y(62), W(12), W(54), 6 * s, coat);
    rr(X(67), Y(62), W(12), W(54), 6 * s, coat);
    g.fillStyle = skinC;
    g.fillRect(X(19), Y(112), W(8), W(8));
    g.fillRect(X(69), Y(112), W(8), W(8));
    g.fillRect(X(43), Y(46), W(10), W(14));
    disc(X(48), Y(34), W(16), skinC);
    if (hair) disc(X(48), Y(31), W(16.5), hair, Math.PI, 0);
  };
  const coat = pk(COATS);
  const pants = pk(PANTS);
  const hair = pk(HAIRS);
  switch (k) {
    case 6: {
      // a hijab: the scarf over the head and shoulders, the face open
      walker(48, 1, skin, pk(["#1e3a8a", "#065f46", "#7c2d12", "#334155"]), pants, null, { long: true });
      const scarf = pk(["#be185d", "#0f766e", "#f1e9da", "#6d28d9", "#1f2937"]);
      disc(48, 33, 19, scarf);
      rr(30, 40, 36, 26, 10, scarf);
      disc(48, 35, 12, skin);
      break;
    }
    case 7: {
      // a Sikh man: a dastar wound high over the head, a beard
      walker(48, 1, skin, pk(["#1f2937", "#1e3a8a", "#e5e7eb"]), pants, null);
      const turban = pk(["#f59e0b", "#1d4ed8", "#b91c1c", "#f97316", "#0f172a"]);
      g.fillStyle = turban;
      g.beginPath();
      g.ellipse(48, 24, 18, 13, 0, 0, Math.PI * 2);
      g.fill();
      rr(31, 22, 34, 10, 4, turban);
      g.fillStyle = "#1b1410";
      g.beginPath();
      g.ellipse(48, 44, 11, 9, 0, 0, Math.PI);
      g.fill();
      break;
    }
    case 8: {
      // a salwar kameez: a long tunic over trousers, the dupatta over one shoulder
      const tunic = pk(["#db2777", "#f59e0b", "#0ea5e9", "#16a34a", "#9333ea"]);
      walker(48, 1, skin, tunic, pk(["#f1e9da", "#fde68a", "#e5e7eb"]), hair, { skirt: tunic });
      g.strokeStyle = pk(["#facc15", "#f472b6", "#fef3c7"]);
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(30, 60);
      g.lineTo(64, 96);
      g.lineTo(66, 128);
      g.stroke();
      break;
    }
    case 9: {
      // an elder, grey-haired, leaning a little on a cane
      walker(46, 0.96, skin, pk(["#78350f", "#374151", "#1e3a8a"]), pants, "#c9c9c9");
      g.strokeStyle = "#5b3a1e";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(74, 112);
      g.lineTo(78, 186);
      g.stroke();
      break;
    }
    case 10: {
      // a wheelchair user: seated, the big wheel beside, the footrest forward
      const W0 = 48;
      g.strokeStyle = "#1f2937";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(W0 + 2, 154, 28, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2;
      for (let a = 0; a < 6; a++) {
        g.beginPath();
        g.moveTo(W0 + 2, 154);
        g.lineTo(W0 + 2 + Math.cos(a) * 26, 154 + Math.sin(a) * 26);
        g.stroke();
      }
      rr(28, 128, 44, 10, 3, "#374151");
      rr(26, 84, 8, 50, 3, "#374151");
      // the person: torso upright, thighs forward, shins down to the footrest
      rr(30, 82, 36, 50, 9, coat);
      rr(36, 124, 44, 12, 5, pants);
      rr(70, 130, 11, 40, 4, pants);
      rr(68, 170, 18, 8, 3, "#111");
      g.fillStyle = skin;
      g.fillRect(43, 70, 10, 14);
      disc(48, 58, 15, skin);
      disc(48, 55, 15.5, hair, Math.PI, 0);
      rr(60, 96, 10, 34, 5, coat);
      break;
    }
    case 11: {
      // a parent and a child holding hands
      walker(36, 0.92, skin, coat, pants, hair);
      walker(72, 0.56, SKINS[(k * 3 + 2) % SKINS.length], pk(["#f59e0b", "#ef4444", "#22c55e", "#3b82f6"]), "#1f2937", pk(HAIRS));
      g.strokeStyle = skin;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(58, 120);
      g.lineTo(66, 132);
      g.stroke();
      break;
    }
    case 12:
    case 13: {
      // a couple holding hands: two men (12), two women (13)
      const other = SKINS[(k * 5 + 3) % SKINS.length];
      if (k === 12) {
        walker(30, 0.86, skin, pk(["#1e3a8a", "#065f46", "#1f2937"]), pants, pk(HAIRS));
        walker(66, 0.88, other, pk(["#b45309", "#9f1239", "#e5e7eb"]), "#1f2937", pk(HAIRS));
      } else {
        walker(30, 0.84, skin, pk(["#9333ea", "#0f766e", "#f59e0b"]), pants, pk(HAIRS), { long: true });
        walker(66, 0.84, other, pk(["#be185d", "#1e3a8a", "#16a34a"]), "#111827", pk(HAIRS));
        // longer hair on one
        rr(53, 34, 26, 30, 10, pk(HAIRS));
        disc(66, 40, 11, other);
      }
      g.strokeStyle = skin;
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(44, 120);
      g.lineTo(54, 120);
      g.stroke();
      break;
    }
    case 14: {
      // someone carrying a small Progress Pride flag over the shoulder
      walker(44, 1, skin, coat, pants, hair);
      g.fillStyle = "#3a3a3a";
      g.fillRect(70, 20, 2.5, 96);
      const stripes = ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"];
      stripes.forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect(72, 20 + i * 5, 22, 5);
      });
      // the chevron: white, pink, light blue, brown, black, from the hoist
      ["#000000", "#613915", "#5bcefa", "#f5a9b8", "#ffffff"].forEach((col, i) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(72, 20 + i * 1.2);
        g.lineTo(72 + 13 - i * 2.6, 35);
        g.lineTo(72, 50 - i * 1.2);
        g.closePath();
        g.fill();
      });
      break;
    }
    case 15: {
      // a woven cedar hat (wide, conical) and a red blanket cape bordered in black with a row of pale buttons
      walker(48, 1, skin, "#1f2937", "#1f2937", "#111111");
      g.fillStyle = "#b9874f";
      g.beginPath();
      g.moveTo(22, 30);
      g.lineTo(48, 8);
      g.lineTo(74, 30);
      g.closePath();
      g.fill();
      g.strokeStyle = "#7a5530";
      g.lineWidth = 1.5;
      for (let y = 14; y < 30; y += 4) {
        g.beginPath();
        g.moveTo(48 - (y - 8) * 1.18, y);
        g.lineTo(48 + (y - 8) * 1.18, y);
        g.stroke();
      }
      g.fillStyle = "#111";
      g.beginPath();
      g.moveTo(22, 58);
      g.lineTo(74, 58);
      g.lineTo(82, 134);
      g.lineTo(14, 134);
      g.closePath();
      g.fill();
      g.fillStyle = "#b91c1c";
      g.beginPath();
      g.moveTo(26, 62);
      g.lineTo(70, 62);
      g.lineTo(77, 128);
      g.lineTo(19, 128);
      g.closePath();
      g.fill();
      g.fillStyle = "#f5f0e6";
      for (let x = 20; x <= 76; x += 6) disc(x, 131, 1.6, "#f5f0e6");
      // a simple formline ovoid on the back panel, black on red
      g.strokeStyle = "#111";
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(48, 96, 13, 9, 0, 0, Math.PI * 2);
      g.stroke();
      disc(48, 96, 4, "#111");
      break;
    }
    default: {
      // walkers: the first six, each with its own extras
      walker(48, 1, skin, coat, pants, hair);
      if (rnd() < 0.4) g.fillRect(31.5, 31, 33, 8);
      if (rnd() < 0.4) rr(12, 80, 10, 22, 3, pk(["#7c2d12", "#111827", "#9a3412"]));
      if (k === 2 || k === 5) {
        g.fillStyle = "#333";
        g.fillRect(57, 22, 2, 42);
        g.fillStyle = pk(["#1d4ed8", "#dc2626", "#111", "#f59e0b"]);
        g.beginPath();
        g.arc(58, 22, 26, Math.PI, 0);
        g.fill();
      }
    }
  }
}

/**
 * The panoramic glass, smoked: by day near-black with a faint sky sheen along the top and slim pillars between the
 * panes (the material's reflections do the rest); at night the cabin lit up behind it, a bright ceiling light line
 * over warm white light, passengers' heads and shoulders in shadow against it. The top rows stay dark, day and night:
 * a nose's canopy (trainGeometry.ts) takes its colour from there.
 */
export function interiorTextures(): { map: CanvasTexture; emissiveMap: CanvasTexture } {
  const W = 512;
  const H = 64;
  const [c, g] = canvas(W, H);
  const [e, h] = canvas(W, H);
  g.fillStyle = "#0a0f15";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(150,175,200,0.1)";
  g.fillRect(0, 0, W, 10);
  h.fillStyle = "#000000";
  h.fillRect(0, 0, W, H);
  // the ceiling's light line, and the cabin's dim warm light under it
  h.fillStyle = "#fff3df";
  h.fillRect(0, 9, W, 3);
  const lg = h.createLinearGradient(0, 12, 0, H);
  lg.addColorStop(0, "rgba(255,240,220,0.95)");
  lg.addColorStop(1, "rgba(255,228,196,0.7)");
  h.fillStyle = lg;
  h.fillRect(0, 12, W, H - 16);
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  // the seat backs, faint, and the odd passenger in shadow
  for (let x = 10; x < W; x += 46) {
    h.fillStyle = "rgba(0,0,0,0.3)";
    h.fillRect(x, 44, 26, 16);
    if (rnd() < 0.45) {
      h.fillStyle = "rgba(0,0,0,0.6)";
      h.beginPath();
      h.arc(x + 13, 28, 6, 0, Math.PI * 2);
      h.fill();
      h.fillRect(x + 6, 34, 14, 14);
    }
  }
  // the pillars between the panes
  for (let x = 0; x < W; x += 128) {
    g.fillStyle = "#04070a";
    g.fillRect(x, 0, 4, H);
    h.fillStyle = "#000000";
    h.fillRect(x, 0, 4, H);
  }
  return { map: texture(c, true), emissiveMap: texture(e, true) };
}

/**
 * Light through water: a web of bright caustic lines on black, tiling both ways (the cells of a scatter of points,
 * bright where two are nearly equally near). The Expo's under-glow (Train.tsx) drifts it under each car after dark.
 */
export function causticTexture(): CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S, S);
  let seed = 5;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pts: [number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    // each point again across the edges, so the cells wrap
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) pts.push([x + dx, y + dy]);
  }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of pts) {
        const d = Math.hypot(px - x, py - y);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const v = Math.round(255 * Math.pow(Math.max(0, 1 - (d2 - d1) / 7), 3));
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c, true);
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
