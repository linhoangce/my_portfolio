/**
 * The Project Gallery's painted surfaces (sets/build.ts `more` builds the hall), each painted once into a canvas:
 * - one atlas of the ten cloth banners hung from the arcade's eave, each the art of one of the communities round Joyce
 *   and the city, and the hall's name plaque;
 * - one of the project boards inside, with a swatch of each project's colour for its plinth's lit band;
 * - the upper floor's screens, a Filipino capiz window and a South Asian jali in turn, with their glow after dark.
 *
 * The patterns are general ones of each tradition (a paper-cut's plum blossom and carp, a parol, phulkari's diamonds,
 * a Đông Sơn drum's sun, formline salmon, a rangoli, bojagi patchwork, girih stars, asanoha, papel picado): no text,
 * and nothing copied from a particular work. Client only (canvas).
 */
import { type CanvasTexture, ClampToEdgeWrapping, RepeatWrapping } from "three";

import { rangoliMural } from "../cultureArt";
import { BLACK, RED, salmon } from "../formline";
import { canvasTexture } from "../shapes";

/** The banners' arts, by the community whose tradition each follows. */
export type BannerArt = "jianzhi" | "parol" | "phulkari" | "dongson" | "salmon" | "rangoli" | "bojagi" | "girih" | "asanoha" | "papel";
/** A rectangle of a texture: u0, v0, u1, v1. */
export type UvRect = [number, number, number, number];
/** A banner's height for its width. */
export const BANNER_ASPECT = 1.4;
/** The name plaque's width for its height. */
export const PLAQUE_RATIO = 6;

/** A small deterministic noise, so a painting is the same every time. */
const hash = (k: number) => {
  const n = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const star = (g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, n: number, rot = -Math.PI / 2) => {
  g.beginPath();
  for (let k = 0; k < n * 2; k++) {
    const a = rot + (k / (n * 2)) * Math.PI * 2;
    const r = k % 2 ? r1 : r0;
    g[k ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
};
const disc = (g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};

/* ------------------------------------------------------------------ the banners, each on a unit-wide cloth h high */

/** A Chinese paper-cut: red paper on cream, a medallion, twin carp circling it, plum blossom on branches. */
function jianzhi(g: CanvasRenderingContext2D, h: number): void {
  const R = "#c41e24";
  g.fillStyle = "#f4e9d2";
  g.fillRect(0, 0, 1, h);
  // the scalloped border
  g.fillStyle = R;
  g.fillRect(0, 0, 1, 0.05);
  g.fillRect(0, h - 0.05, 1, 0.05);
  for (let x = 0.05; x < 1; x += 0.1) {
    disc(g, x, 0.05, 0.035, R);
    disc(g, x, h - 0.05, 0.035, R);
  }
  // the medallion: a red disc cut into a ring of petals round a lattice
  const cx = 0.5;
  const cy = h / 2;
  disc(g, cx, cy, 0.26, R);
  g.fillStyle = "#f4e9d2";
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * 0.17, cy + Math.sin(a) * 0.17, 0.05, 0.022, a, 0, Math.PI * 2);
    g.fill();
  }
  disc(g, cx, cy, 0.09, "#f4e9d2");
  disc(g, cx, cy, 0.065, R);
  g.strokeStyle = "#f4e9d2";
  g.lineWidth = 0.012;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI;
    g.beginPath();
    g.moveTo(cx - Math.cos(a) * 0.06, cy - Math.sin(a) * 0.06);
    g.lineTo(cx + Math.cos(a) * 0.06, cy + Math.sin(a) * 0.06);
    g.stroke();
  }
  // twin carp, one above swimming left, one below swimming right, their tails flicking
  const carp = (x: number, y: number, dir: number) => {
    g.save();
    g.translate(x, y);
    g.scale(dir, 1);
    g.fillStyle = R;
    g.beginPath();
    g.ellipse(0, 0, 0.17, 0.07, 0.25, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(0.14, 0.04);
    g.lineTo(0.27, -0.04);
    g.lineTo(0.25, 0.12);
    g.closePath();
    g.fill();
    // scales cut out in rows, the eye
    g.fillStyle = "#f4e9d2";
    for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) disc(g, -0.04 + i * 0.045, j * 0.025 + 0.01, 0.01, "#f4e9d2");
    disc(g, -0.12, -0.015, 0.012, "#f4e9d2");
    g.restore();
  };
  carp(0.48, cy - 0.38, -1);
  carp(0.52, cy + 0.38, 1);
  // plum blossom along two branches, top and bottom
  g.strokeStyle = "#7a1414";
  g.lineWidth = 0.014;
  for (const [y0, s] of [
    [0.16, 1],
    [h - 0.16, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(0.08, y0);
    g.quadraticCurveTo(0.5, y0 + s * 0.08, 0.92, y0 - s * 0.02);
    g.stroke();
    for (let k = 0; k < 4; k++) {
      const x = 0.18 + k * 0.22;
      const y = y0 + s * 0.035 * Math.sin(k * 1.7);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        disc(g, x + Math.cos(a) * 0.028, y + Math.sin(a) * 0.028, 0.022, R);
      }
      disc(g, x, y, 0.014, "#f4e9d2");
    }
  }
}

/** A Filipino parol: a five-point star lantern with its ring and tails, on deep blue in a woven banig border. */
function parol(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#0f2a5c";
  g.fillRect(0, 0, 1, h);
  // the banig border: a mat's diagonal weave in bands of colour
  const cols = ["#d4342c", "#f2b632", "#2e9b5f", "#7a3d9e", "#f4e9d2"];
  const b = 0.075;
  for (let y = 0; y < h; y += 0.025) {
    for (let x = 0; x < 1; x += 0.025) {
      if (x > b && x < 1 - b && y > b && y < h - b) continue;
      const k = Math.floor((x + y) / 0.05) + Math.floor((x - y + 2) / 0.1);
      g.fillStyle = cols[((k % cols.length) + cols.length) % cols.length];
      g.fillRect(x, y, 0.026, 0.026);
    }
  }
  const cx = 0.5;
  const cy = h * 0.42;
  // the tails, two long ribbons and three short, falling from the ring
  for (const [dx, len, col] of [
    [-0.1, 0.5, "#f2b632"],
    [0.1, 0.5, "#d4342c"],
    [-0.04, 0.36, "#f4e9d2"],
    [0.04, 0.36, "#2e9b5f"],
    [0, 0.42, "#f2b632"],
  ] as const) {
    g.strokeStyle = col;
    g.lineWidth = 0.022;
    g.beginPath();
    g.moveTo(cx + dx * 0.6, cy + 0.2);
    g.bezierCurveTo(cx + dx, cy + 0.32, cx + dx * 1.8, cy + 0.2 + len * 0.6, cx + dx * 1.2, cy + 0.2 + len);
    g.stroke();
  }
  // the ring, the star and the star within it
  g.strokeStyle = "#f2b632";
  g.lineWidth = 0.025;
  g.beginPath();
  g.arc(cx, cy, 0.3, 0, Math.PI * 2);
  g.stroke();
  star(g, cx, cy, 0.29, 0.12, 5);
  g.fillStyle = "#d4342c";
  g.fill();
  star(g, cx, cy, 0.2, 0.085, 5);
  g.fillStyle = "#f2b632";
  g.fill();
  star(g, cx, cy, 0.1, 0.045, 5);
  g.fillStyle = "#fff6d8";
  g.fill();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    disc(g, cx + Math.cos(a) * 0.3, cy + Math.sin(a) * 0.3, 0.018, k % 2 ? "#2e9b5f" : "#fff6d8");
  }
}

/** Punjabi phulkari: rows of gold and orange diamonds darned on madder red, a band of small triangles at each end. */
function phulkari(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#8f1d1f";
  g.fillRect(0, 0, 1, h);
  const gold = ["#f2b632", "#ff8c1a", "#ffd36b", "#f6a21e"];
  const s = 0.125;
  for (let j = 0; j * s * 0.9 < h - 0.16; j++) {
    for (let i = 0; i <= 8; i++) {
      const x = (i + (j % 2) * 0.5) * s;
      const y = 0.16 + j * s * 0.9;
      if (x > 1.05) continue;
      const col = gold[(i + j * 3) % gold.length];
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x, y - s * 0.46);
      g.lineTo(x + s * 0.46, y);
      g.lineTo(x, y + s * 0.46);
      g.lineTo(x - s * 0.46, y);
      g.closePath();
      g.fill();
      // the darning's stitches: a darker diamond in, a red one in that
      g.fillStyle = (i + j) % 2 ? "#d9661a" : "#b8451a";
      g.beginPath();
      g.moveTo(x, y - s * 0.24);
      g.lineTo(x + s * 0.24, y);
      g.lineTo(x, y + s * 0.24);
      g.lineTo(x - s * 0.24, y);
      g.closePath();
      g.fill();
      disc(g, x, y, s * 0.06, "#ffd36b");
    }
  }
  for (const y of [0.02, h - 0.1]) {
    g.fillStyle = "#5e1214";
    g.fillRect(0, y, 1, 0.08);
    g.fillStyle = "#f2b632";
    for (let x = 0; x < 1; x += 0.08) {
      g.beginPath();
      g.moveTo(x, y + 0.08);
      g.lineTo(x + 0.04, y);
      g.lineTo(x + 0.08, y + 0.08);
      g.closePath();
      g.fill();
    }
  }
}

/** A Vietnamese Đông Sơn drum's face: the sun's star at the centre, rings of patterns and flying birds; lotus below. */
function dongson(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#1e3b34";
  g.fillRect(0, 0, 1, h);
  const B = "#c9a24b";
  const cx = 0.5;
  const cy = 0.5;
  disc(g, cx, cy, 0.45, "#8a6a2c");
  g.strokeStyle = B;
  for (const [r, w] of [
    [0.44, 0.012],
    [0.4, 0.006],
    [0.3, 0.006],
    [0.26, 0.012],
    [0.17, 0.006],
  ] as const) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  // the outer ring's birds, flying round it
  g.fillStyle = B;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * 0.35, cy + Math.sin(a) * 0.35);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    g.moveTo(-0.05, 0);
    g.quadraticCurveTo(0, -0.03, 0.05, -0.005);
    g.lineTo(0.02, 0.012);
    g.lineTo(-0.02, 0.012);
    g.closePath();
    g.fill();
    g.restore();
  }
  // the inner ring's ticks and circles
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    disc(g, cx + Math.cos(a) * 0.215, cy + Math.sin(a) * 0.215, 0.012, B);
  }
  // the sun: a fourteen-point star, the spaces between its points hatched
  star(g, cx, cy, 0.16, 0.05, 14);
  g.fillStyle = "#e8c66a";
  g.fill();
  disc(g, cx, cy, 0.04, "#8a6a2c");
  // lotus on the water below the drum: open petals and two leaves
  const ly = h - 0.22;
  g.fillStyle = "#3f7a4a";
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 0.25, ly + 0.08, 0.16, 0.05, s * 0.15, 0, Math.PI * 2);
    g.fill();
  }
  for (let k = -3; k <= 3; k++) {
    g.save();
    g.translate(cx, ly + 0.06);
    g.rotate(k * 0.32);
    g.fillStyle = Math.abs(k) % 2 ? "#e88aa6" : "#f4b7c8";
    g.beginPath();
    g.ellipse(0, -0.1, 0.04, 0.1, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  disc(g, cx, ly + 0.03, 0.03, "#f2c94c");
}

/** Coast Salish formline: two salmon circling head to tail, in black and red on cedar. */
function salmonPair(g: CanvasRenderingContext2D, h: number): void {
  const bg = "#e8d2ae";
  g.fillStyle = bg;
  g.fillRect(0, 0, 1, h);
  g.strokeStyle = BLACK;
  g.lineWidth = 0.02;
  g.strokeRect(0.05, 0.05, 0.9, h - 0.1);
  salmon(g, 0.5, h * 0.33, 0.78, Math.PI, bg);
  salmon(g, 0.5, h * 0.67, 0.78, 0, bg, BLACK, RED);
}

/** A rangoli (cultureArt's), on a deep blue cloth with a border of dots. */
function rangoli(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#1e3a5f";
  g.fillRect(0, 0, 1, h);
  g.save();
  g.translate(0, (h - 1) / 2);
  rangoliMural(g);
  g.restore();
  for (let x = 0.06; x < 1; x += 0.08) {
    disc(g, x, 0.06, 0.016, "#f59e0b");
    disc(g, x, h - 0.06, 0.016, "#db2777");
  }
}

/** Korean bojagi: a patchwork of silk rectangles in many colours, its seams light lines between them. */
function bojagi(g: CanvasRenderingContext2D, h: number): void {
  const cols = ["#d94f70", "#f2b632", "#3a8f8a", "#7b5ea7", "#e8835a", "#9fc46a", "#f1d9e0", "#4f78b8", "#c43b3b", "#f4e9d2"];
  g.fillStyle = "#f6efe1";
  g.fillRect(0, 0, 1, h);
  let k = 0;
  const split = (x: number, y: number, w: number, hh: number, depth: number) => {
    if (depth === 0 || (w < 0.16 && hh < 0.16)) {
      g.fillStyle = cols[Math.floor(hash(k++) * cols.length)];
      g.fillRect(x + 0.006, y + 0.006, w - 0.012, hh - 0.012);
      return;
    }
    const f = 0.3 + hash(k++) * 0.4;
    if (w > hh) {
      split(x, y, w * f, hh, depth - 1);
      split(x + w * f, y, w * (1 - f), hh, depth - 1);
    } else {
      split(x, y, w, hh * f, depth - 1);
      split(x, y + hh * f, w, hh * (1 - f), depth - 1);
    }
  };
  split(0.04, 0.04, 0.92, h - 0.08, 6);
}

/** Persian girih: eight-pointed stars and crosses in turquoise and white on cobalt. */
function girih(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#1c3f8f";
  g.fillRect(0, 0, 1, h);
  const s = 0.25;
  for (let j = 0; j * s < h + s; j++) {
    for (let i = 0; i <= 4; i++) {
      const x = i * s;
      const y = j * s;
      star(g, x, y, s * 0.42, s * 0.3, 8, 0);
      g.fillStyle = "#3fb6b0";
      g.fill();
      g.strokeStyle = "#f4f1e8";
      g.lineWidth = 0.01;
      g.stroke();
      star(g, x, y, s * 0.2, s * 0.14, 8, Math.PI / 8);
      g.fillStyle = "#f4f1e8";
      g.fill();
      // the cross between four stars
      g.fillStyle = "#e8a33a";
      const cx = x + s / 2;
      const cy = y + s / 2;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        g.lineTo(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2);
        g.lineTo(cx + Math.cos(a + Math.PI / 4) * s * 0.07, cy + Math.sin(a + Math.PI / 4) * s * 0.07);
      }
      g.closePath();
      g.fill();
    }
  }
}

/** Japanese asanoha, the hemp-leaf pattern, in white on indigo. */
function asanoha(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#1d2f5e";
  g.fillRect(0, 0, 1, h);
  g.strokeStyle = "#e9eef7";
  g.lineWidth = 0.007;
  const s = 0.2;
  const rh = (s * Math.sqrt(3)) / 2;
  // a lattice of triangles, each joined from its centre to its corners
  for (let j = -1; j * rh < h + rh; j++) {
    for (let i = -1; i <= 6; i++) {
      const x0 = i * s + (j % 2 ? s / 2 : 0);
      const y0 = j * rh;
      for (const up of [true, false]) {
        const tri: [number, number][] = up
          ? [
              [x0, y0 + rh],
              [x0 + s, y0 + rh],
              [x0 + s / 2, y0],
            ]
          : [
              [x0 + s / 2, y0],
              [x0 + s * 1.5, y0],
              [x0 + s, y0 + rh],
            ];
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        g.beginPath();
        g.moveTo(...tri[0]);
        g.lineTo(...tri[1]);
        g.lineTo(...tri[2]);
        g.closePath();
        for (const p of tri) {
          g.moveTo(cx, cy);
          g.lineTo(...p);
        }
        g.stroke();
      }
    }
  }
}

/** Mexican papel picado: rows of cut-paper flags in bright colours on their strings, each cut with flowers and a fringe. */
function papel(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#f7f2e8";
  g.fillRect(0, 0, 1, h);
  const cols = ["#e6397a", "#f28c28", "#2fb0a0", "#7d4cc2", "#f2c230", "#3a7bd5"];
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const y = 0.06 + (r * (h - 0.06)) / rows;
    g.strokeStyle = "#5a5a5a";
    g.lineWidth = 0.006;
    g.beginPath();
    g.moveTo(0, y);
    g.quadraticCurveTo(0.5, y + 0.03, 1, y);
    g.stroke();
    for (let k = 0; k < 3; k++) {
      const x = 0.04 + k * 0.32;
      const fy = y + 0.01 + 0.03 * Math.sin(((k + 0.5) / 3) * Math.PI) * 0.6;
      const w = 0.28;
      const fh = (h - 0.06) / rows - 0.05;
      g.fillStyle = cols[(r * 3 + k) % cols.length];
      g.beginPath();
      g.moveTo(x, fy);
      g.lineTo(x + w, fy);
      g.lineTo(x + w, fy + fh);
      for (let t = 1; t >= 0; t -= 0.125) g.lineTo(x + w * t, fy + fh - (Math.round(t * 8) % 2 ? 0.025 : 0));
      g.closePath();
      g.fill();
      // the cut: a flower of holes and a row of diamonds
      const cx = x + w / 2;
      const cy = fy + fh * 0.45;
      disc(g, cx, cy, 0.022, "#f7f2e8");
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        disc(g, cx + Math.cos(a) * 0.045, cy + Math.sin(a) * 0.045, 0.016, "#f7f2e8");
      }
      g.fillStyle = "#f7f2e8";
      for (let d = 0; d < 4; d++) {
        const dx = x + 0.05 + d * 0.06;
        const dy = fy + fh * 0.82;
        g.beginPath();
        g.moveTo(dx, dy - 0.014);
        g.lineTo(dx + 0.012, dy);
        g.lineTo(dx, dy + 0.014);
        g.lineTo(dx - 0.012, dy);
        g.closePath();
        g.fill();
      }
    }
  }
}

const PAINTERS: Record<BannerArt, (g: CanvasRenderingContext2D, h: number) => void> = { jianzhi, parol, phulkari, dongson, salmon: salmonPair, rangoli, bojagi, girih, asanoha, papel };

/**
 * The banners and the name plaque in one atlas (map and glow both): the banners five across and two down at the top,
 * the plaque in black lacquer under them, framed in red and gold, its letters gold. Returns each banner's rectangle and
 * the plaque's.
 */
export function galleryAtlas(lowEnd: boolean, arts: BannerArt[], exhibits: number, fonts: { serif: string; sans: string }): { tex: CanvasTexture; banner: UvRect[]; plaque: UvRect } {
  const W = lowEnd ? 1024 : 2048;
  const bw = W / 5;
  const bh = bw * BANNER_ASPECT;
  const ph = W / PLAQUE_RATIO;
  const H = Math.ceil(bh * 2 + ph + 8);
  const banner: UvRect[] = [];
  const tex = canvasTexture(W, H, (g) => {
    arts.forEach((art, k) => {
      const x = (k % 5) * bw;
      const y = Math.floor(k / 5) * bh;
      g.save();
      g.translate(x, y);
      g.beginPath();
      g.rect(0, 0, bw, bh);
      g.clip();
      g.scale(bw, bw);
      PAINTERS[art](g, BANNER_ASPECT);
      g.restore();
      banner.push([(x + 2) / W, 1 - (y + bh - 2) / H, (x + bw - 2) / W, 1 - (y + 2) / H]);
    });
    // the plaque: black lacquer, a red frame with a gold line inside it, the name in gold and what it holds under it
    const y0 = bh * 2 + 4;
    g.fillStyle = "#b3261e";
    g.fillRect(0, y0, W, ph);
    g.fillStyle = "#d4a641";
    g.fillRect(ph * 0.08, y0 + ph * 0.08, W - ph * 0.16, ph * 0.84);
    g.fillStyle = "#0e0c0b";
    g.fillRect(ph * 0.11, y0 + ph * 0.11, W - ph * 0.22, ph * 0.78);
    g.fillStyle = "#e3b955";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 ${ph * 0.42}px ${fonts.serif}`;
    g.fillText("Project Gallery", W / 2, y0 + ph * 0.43, W * 0.8);
    g.font = `500 ${ph * 0.13}px ${fonts.sans}`;
    g.fillText(`SIDE PROJECTS · ${exhibits} EXHIBITS`, W / 2, y0 + ph * 0.76, W * 0.7);
  });
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  const y0 = bh * 2 + 4;
  return { tex, banner, plaque: [4 / W, 1 - (y0 + ph - 4) / H, (W - 4) / W, 1 - (y0 + 4) / H] };
}

/**
 * The project boards behind the stalls in one atlas: each its project's name and what it is, lit, a band of its colour
 * along its head; under them a swatch of each project's colour for its plinth's lit band. Returns each board's
 * rectangle and the middle of each swatch.
 */
export function boardsAtlas(projects: { title: string; copy: string }[], cols: string[], fonts: { serif: string; sans: string }): { tex: CanvasTexture; board: UvRect[]; swatch: [number, number][] } {
  const W = 512;
  const BH = 256;
  const H = BH * projects.length + 64;
  const tex = canvasTexture(W, H, (g) => {
    projects.forEach((pr, j) => {
      const y = j * BH;
      g.fillStyle = "#14161b";
      g.fillRect(0, y, W, BH);
      g.fillStyle = cols[j];
      g.fillRect(0, y, W, 14);
      g.fillStyle = "#f4f2ec";
      g.font = `500 64px ${fonts.serif}`;
      g.textBaseline = "top";
      g.fillText(pr.title, 28, y + 40, 456);
      g.fillStyle = "#b9bcc4";
      g.font = `400 26px ${fonts.sans}`;
      // the line about it, wrapped to three lines at most
      const lines: string[] = [];
      let line = "";
      for (const w of pr.copy.split(" ")) {
        const t = line ? `${line} ${w}` : w;
        if (g.measureText(t).width > 456 && line) {
          lines.push(line);
          line = w;
        } else line = t;
      }
      if (line) lines.push(line);
      if (lines.length > 3) lines[2] = `${lines.slice(2).join(" ").slice(0, 34)}…`;
      lines.slice(0, 3).forEach((ln, k) => g.fillText(ln, 28, y + 130 + k * 34));
      g.fillStyle = cols[j];
      g.fillRect((j * W) / projects.length, H - 64, W / projects.length, 64);
    });
  });
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  return {
    tex,
    board: projects.map((_, j) => [0, 1 - ((j + 1) * BH) / H, 1, 1 - (j * BH) / H]),
    swatch: projects.map((_, j) => [(j + 0.5) / projects.length, 32 / H]),
  };
}

/**
 * The upper floor's screens, two bays a tile (each 3 wide and as tall as the floor): a Filipino capiz window (sliding
 * panels of pearly shell squares in dark timber, small balustered ventanillas under them) and a South Asian jali (pale
 * sandstone cut in a lattice of stars). After dark the capiz panes and the jali's holes glow warm.
 */
export function screenTextures(lowEnd: boolean): { map: CanvasTexture; glow: CanvasTexture } {
  const W = lowEnd ? 384 : 768;
  const H = lowEnd ? 256 : 512;
  const paint = (g: CanvasRenderingContext2D, lit: boolean) => {
    const bw = W / 2;
    g.fillStyle = lit ? "#000" : "#2b1a10";
    g.fillRect(0, 0, W, H);
    // the capiz bay: two sliding panels, a grid of shell panes each, the ventanillas below
    const fx = bw * 0.06;
    const fy = H * 0.05;
    const pw = (bw - fx * 2) / 2;
    const ph = H * 0.68;
    for (let p = 0; p < 2; p++) {
      const x0 = fx + p * pw;
      const cols = 4;
      const rows = 7;
      const cw = pw / cols;
      const ch = ph / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const v = hash(p * 31 + i * 7 + j);
          g.fillStyle = lit ? `rgb(${230 + v * 25}, ${170 + v * 40}, ${90 + v * 40})` : `rgb(${226 + v * 20}, ${216 + v * 18}, ${196 + v * 20})`;
          g.fillRect(x0 + i * cw + cw * 0.08, fy + j * ch + ch * 0.08, cw * 0.84, ch * 0.84);
        }
      }
    }
    if (!lit) {
      // the balusters of the ventanillas
      g.fillStyle = "#4a3020";
      g.fillRect(fx, fy + ph + H * 0.03, bw - fx * 2, H * 0.2);
      g.fillStyle = "#1a0f08";
      for (let k = 0; k < 9; k++) g.fillRect(fx + (k + 0.5) * ((bw - fx * 2) / 9) - 3, fy + ph + H * 0.05, 6, H * 0.16);
    }
    // the jali bay: sandstone, a border, a lattice of eight-pointed stars cut through it
    const jx = bw;
    if (!lit) {
      g.fillStyle = "#dcc59c";
      g.fillRect(jx, 0, bw, H);
      g.strokeStyle = "#b99f73";
      g.lineWidth = W * 0.008;
      g.strokeRect(jx + bw * 0.06, H * 0.05, bw * 0.88, H * 0.9);
    }
    const s = bw * 0.16;
    g.fillStyle = lit ? "#ffb35c" : "#2a1d12";
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 5; i++) {
        const cx = jx + bw * 0.14 + i * s * 1.1 + (j % 2 ? s * 0.55 : 0);
        const cy = H * 0.1 + j * s * 0.95;
        if (cx > jx + bw * 0.9 || cy > H * 0.92) continue;
        star(g, cx, cy, s * 0.36, s * 0.2, 8, 0);
        g.fill();
      }
    }
  };
  const map = canvasTexture(W, H, (g) => paint(g, false));
  const glow = canvasTexture(W, H, (g) => paint(g, true));
  for (const t of [map, glow]) t.wrapS = t.wrapT = RepeatWrapping;
  return { map, glow };
}
