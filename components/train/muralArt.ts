/**
 * The city's murals, each painted once from its seed so no two walls carry the same one (cultureArt.ts lays them
 * under its own cells, MURAL0 on). Five kinds, after what Vancouver's walls carry:
 * - weave: blankets of triangles, zigzags, chevrons, diamonds, hourglasses and checks in red, black, white, ochre and
 *   blue, after Coast Salish weaving as Musqueam weavers paint it on the city's columns and walls;
 * - formline: a moon, a sun, salmon and ovoid panels in Coast Salish–inspired formline, each in its own palette (general
 *   subjects; no crest or family design is copied);
 * - portrait: a woman among flowers and plants, her clothes in blocks of folk pattern, after the painted women of the
 *   Vancouver Mural Festival;
 * - abstract: the festival's colour murals: circles, arches, waves under the North Shore mountains, bands of dots;
 * - front: a Coast Salish–inspired hall's painted front, wide (painted at half width, so its 2:1 wall shows it true):
 *   a face across it, its eyes ovoids, U-forms for wings, a door at its foot.
 * Every painter draws on the unit square.
 */
import { BLACK, eye, ovoid, RED, salmon, trigon, uform } from "./formline";

export type MuralKind = "weave" | "formline" | "portrait" | "abstract" | "front";
/** How many of each, in atlas order. */
const COUNTS: [MuralKind, number][] = [
  ["weave", 14],
  ["formline", 10],
  ["portrait", 9],
  ["abstract", 5],
  ["front", 10],
];
/** The murals in atlas order: their kind and seed. */
export const MURALS: { kind: MuralKind; seed: number }[] = COUNTS.flatMap(([kind, n], j) => Array.from({ length: n }, (_, k) => ({ kind, seed: 1 + k + j * 97 })));
/** The murals of a kind, as their atlas indices. */
export const muralsOf = (kind: MuralKind): number[] => MURALS.flatMap((m, k) => (m.kind === kind ? [k] : []));

/** A small seeded generator: the same seed paints the same mural. */
function rngOf(seed: number): () => number {
  let s = Math.imul(seed, 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function paintMural(g: CanvasRenderingContext2D, k: number): void {
  const m = MURALS[k];
  if (!m) return;
  const R = rngOf(m.seed);
  // the first draws are poor in a fresh xorshift; let it run
  for (let i = 0; i < 8; i++) R();
  if (m.kind === "weave") weave(g, R);
  else if (m.kind === "formline") formline(g, R, k);
  else if (m.kind === "portrait") portrait(g, R, k);
  else if (m.kind === "abstract") abstract(g, R, k);
  else front(g, R, k);
}

type Rand = () => number;
const pick = <T>(R: Rand, a: readonly T[]): T => a[Math.floor(R() * a.length)];
/** Shuffle a copy. */
const shuffled = <T>(R: Rand, a: readonly T[]): T[] => {
  const o = [...a];
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
};

/* ------------------------------------------------------------------ weave */

const WOOL = { red: "#b8262b", black: "#151515", white: "#f4efe3", ochre: "#e3a32c", blue: "#2e6fb4", sky: "#7fb6d9", teal: "#1f8a8a" };
/** The weavers' palettes: a ground and the colours woven on it. */
const WEAVE_PALETTES: [string, string[]][] = [
  [WOOL.white, [WOOL.black, WOOL.red, WOOL.ochre]],
  [WOOL.white, [WOOL.black, WOOL.red, WOOL.blue]],
  [WOOL.black, [WOOL.white, WOOL.red, WOOL.ochre]],
  [WOOL.red, [WOOL.black, WOOL.white, WOOL.ochre]],
  [WOOL.ochre, [WOOL.black, WOOL.red, WOOL.white]],
  [WOOL.white, [WOOL.blue, WOOL.black, WOOL.sky]],
  [WOOL.sky, [WOOL.black, WOOL.white, WOOL.red]],
  [WOOL.black, [WOOL.teal, WOOL.white, WOOL.ochre]],
];

/** One woven motif repeated across a band (x0..x1, y..y+h), in colours a and b. */
function band(g: CanvasRenderingContext2D, motif: number, n: number, x0: number, x1: number, y: number, h: number, a: string, b: string): void {
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * w;
    g.fillStyle = i % 2 ? b : a;
    g.beginPath();
    if (motif === 0) {
      // triangles, points up
      g.moveTo(x, y + h);
      g.lineTo(x + w / 2, y);
      g.lineTo(x + w, y + h);
    } else if (motif === 1) {
      // a zigzag
      g.moveTo(x, y + h * 0.7);
      g.lineTo(x + w / 2, y + h * 0.1);
      g.lineTo(x + w, y + h * 0.7);
      g.lineTo(x + w, y + h * 0.95);
      g.lineTo(x + w / 2, y + h * 0.4);
      g.lineTo(x, y + h * 0.95);
    } else if (motif === 2) {
      // chevrons pointing along
      g.moveTo(x, y);
      g.lineTo(x + w * 0.55, y + h / 2);
      g.lineTo(x, y + h);
      g.lineTo(x + w * 0.4, y + h);
      g.lineTo(x + w * 0.95, y + h / 2);
      g.lineTo(x + w * 0.4, y);
    } else if (motif === 3) {
      // diamonds, a smaller one inside in the other colour
      g.moveTo(x + w / 2, y + h * 0.05);
      g.lineTo(x + w * 0.95, y + h / 2);
      g.lineTo(x + w / 2, y + h * 0.95);
      g.lineTo(x + w * 0.05, y + h / 2);
      g.closePath();
      g.fill();
      g.fillStyle = i % 2 ? a : b;
      g.beginPath();
      g.moveTo(x + w / 2, y + h * 0.32);
      g.lineTo(x + w * 0.68, y + h / 2);
      g.lineTo(x + w / 2, y + h * 0.68);
      g.lineTo(x + w * 0.32, y + h / 2);
    } else if (motif === 4) {
      // hourglasses
      g.moveTo(x + w * 0.1, y + h * 0.08);
      g.lineTo(x + w * 0.9, y + h * 0.08);
      g.lineTo(x + w * 0.1, y + h * 0.92);
      g.lineTo(x + w * 0.9, y + h * 0.92);
    } else if (motif === 5) {
      // checks, two rows
      g.rect(x, y + (i % 2 ? 0 : h / 2), w / 2, h / 2);
      g.rect(x + w / 2, y + (i % 2 ? h / 2 : 0), w / 2, h / 2);
    } else {
      // a stepped mountain
      for (let s = 0; s < 3; s++) g.rect(x + (w * s) / 6, y + h - (h * (s + 1)) / 3, w - (w * s) / 3, h / 3 + 0.002);
    }
    g.closePath();
    g.fill();
  }
}

/**
 * A blanket. Half are banded top to bottom, each band its own motif; half are framed: zigzag borders round a field
 * whose centre is one great diamond (or hourglass) built of triangles, checks either side.
 */
function weave(g: CanvasRenderingContext2D, R: Rand): void {
  const [ground, cols] = pick(R, WEAVE_PALETTES);
  const pal = shuffled(R, cols);
  g.fillStyle = ground;
  g.fillRect(0, 0, 1, 1);
  if (R() < 0.5) {
    let y = 0.02;
    let k = 0;
    while (y < 0.98) {
      const h = Math.min(0.98 - y, 0.08 + R() * 0.1);
      const a = pal[k % pal.length];
      const b = pal[(k + 1 + Math.floor(R() * 2)) % pal.length];
      band(g, Math.floor(R() * 7), 4 + Math.floor(R() * 6), 0, 1, y, h, a, b === a ? pal[(k + 2) % pal.length] : b);
      y += h;
      // a solid stripe between some bands
      if (R() < 0.55 && y < 0.95) {
        g.fillStyle = pal[(k + 2) % pal.length];
        g.fillRect(0, y + 0.006, 1, 0.018);
        y += 0.03;
      }
      k++;
    }
    return;
  }
  const [a, b, c] = pal;
  // borders: triangles top and foot, zigzags down the sides
  band(g, 0, 10, 0, 1, 0.02, 0.08, a, b);
  band(g, 0, 10, 0, 1, 0.9, 0.08, b, a);
  g.save();
  g.translate(0.12, 0.12);
  g.rotate(Math.PI / 2);
  band(g, 1, 8, 0, 0.76, 0, 0.1, a, c);
  g.restore();
  g.save();
  g.translate(0.98, 0.12);
  g.rotate(Math.PI / 2);
  band(g, 1, 8, 0, 0.76, 0, 0.1, c, a);
  g.restore();
  // the centre: a diamond or an hourglass of triangles, nested
  const cx = 0.5;
  const cy = 0.5;
  const hour = R() < 0.4;
  for (let r = 0.33, k = 0; r > 0.04; r -= 0.07, k++) {
    g.fillStyle = [a, b, c, ground][k % 4];
    g.beginPath();
    if (hour) {
      g.moveTo(cx - r * 0.9, cy - r);
      g.lineTo(cx + r * 0.9, cy - r);
      g.lineTo(cx, cy);
      g.lineTo(cx + r * 0.9, cy + r);
      g.lineTo(cx - r * 0.9, cy + r);
      g.lineTo(cx, cy);
    } else {
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.8, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r * 0.8, cy);
    }
    g.closePath();
    g.fill();
  }
  // checks in the field's corners
  for (const [x, y] of [[0.17, 0.14], [0.69, 0.14], [0.17, 0.72], [0.69, 0.72]] as const) {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2) continue;
        g.fillStyle = c;
        g.fillRect(x + i * 0.035, y + j * 0.045, 0.035, 0.045);
      }
    }
  }
}

/* ------------------------------------------------------------------ formline */

/** Formline palettes: ground, ink (the primary forms), the secondary colour, the tertiary. */
const FORM_PALETTES: [string, string, string, string][] = [
  ["#efe4cf", BLACK, RED, "#1f7f7a"],
  ["#c98b55", BLACK, RED, "#efe4cf"],
  ["#151515", "#f4efe3", RED, "#1f8a8a"],
  ["#1f7f7a", BLACK, "#f4efe3", RED],
  ["#e3a32c", BLACK, RED, "#f4efe3"],
  ["#8fc3d9", "#14284a", RED, "#f4efe3"],
  ["#b3261e", BLACK, "#f4efe3", "#e3a32c"],
  ["#f4efe3", "#14284a", "#2e6fb4", RED],
];

/** A ring of alternating U-forms and trigons round (cx, cy) at radius r. */
function ring(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, a: string, b: string): void {
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    if (k % 2) trigon(g, x, y, 0.07, b, t + Math.PI / 2);
    else uform(g, x, y, 0.11, 0.09, 0.03, a, t - Math.PI / 2);
  }
}

/** A face: two eyes, cheeks, a mouth, inside the ground's colour. */
function face(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, bg: string, ink: string, acc: string): void {
  eye(g, cx - s * 0.2, cy - s * 0.08, s * 0.28, bg, 0, ink);
  eye(g, cx + s * 0.2, cy - s * 0.08, s * 0.28, bg, 0, ink);
  ovoid(g, cx - s * 0.24, cy + s * 0.16, s * 0.16, s * 0.1, acc);
  ovoid(g, cx + s * 0.24, cy + s * 0.16, s * 0.16, s * 0.1, acc);
  uform(g, cx, cy + s * 0.08, s * 0.1, s * 0.18, s * 0.035, ink, 0);
  g.fillStyle = ink;
  g.beginPath();
  g.ellipse(cx, cy + s * 0.32, s * 0.16, s * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = bg;
  g.fillRect(cx - s * 0.12, cy + s * 0.315, s * 0.24, s * 0.012);
}

/** A moon, a sun, two salmon circling, a column of salmon, or a panel of ovoids, in one of the palettes. */
function formline(g: CanvasRenderingContext2D, R: Rand, k: number): void {
  const [bg, ink, acc, third] = FORM_PALETTES[(k * 3 + Math.floor(R() * 3)) % FORM_PALETTES.length];
  g.fillStyle = bg;
  g.fillRect(0, 0, 1, 1);
  const kind = k % 5;
  if (kind === 0) {
    // the moon: a face in a disc, a ring round it
    g.fillStyle = ink;
    g.beginPath();
    g.arc(0.5, 0.5, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0.5, 0.5, 0.34, 0, Math.PI * 2);
    g.fill();
    face(g, 0.5, 0.5, 0.5, bg, ink, acc);
    ring(g, 0.5, 0.5, 0.44, 16, acc, third);
  } else if (kind === 1) {
    // the sun: a face, rays of U-forms
    for (let r = 0; r < 12; r++) {
      const t = (r / 12) * Math.PI * 2;
      uform(g, 0.5 + Math.cos(t) * 0.36, 0.5 + Math.sin(t) * 0.36, 0.13, 0.2, 0.035, r % 2 ? acc : ink, t - Math.PI / 2);
    }
    g.fillStyle = acc;
    g.beginPath();
    g.arc(0.5, 0.5, 0.27, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0.5, 0.5, 0.23, 0, Math.PI * 2);
    g.fill();
    face(g, 0.5, 0.5, 0.36, bg, ink, third);
  } else if (kind === 2) {
    // two salmon circling, head to tail, a rim of trigons
    g.strokeStyle = ink;
    g.lineWidth = 0.02;
    g.beginPath();
    g.arc(0.5, 0.5, 0.45, 0, Math.PI * 2);
    g.stroke();
    salmon(g, 0.5, 0.32, 0.6, 0, bg, ink, acc);
    salmon(g, 0.5, 0.68, 0.6, Math.PI, bg, ink, acc);
    for (let r = 0; r < 20; r++) {
      const t = (r / 20) * Math.PI * 2;
      trigon(g, 0.5 + Math.cos(t) * 0.41, 0.5 + Math.sin(t) * 0.41, 0.04, third, t + Math.PI / 2);
    }
  } else if (kind === 3) {
    // a column of salmon going up, alternating, between borders of U-forms
    for (let i = 0; i < 4; i++) salmon(g, 0.5, 0.15 + i * 0.235, 0.56, i % 2 ? Math.PI : 0, bg, ink, i % 2 ? acc : third);
    for (let i = 0; i < 7; i++) {
      uform(g, 0.07, 0.08 + i * 0.14, 0.1, 0.1, 0.028, i % 2 ? acc : ink, -Math.PI / 2);
      uform(g, 0.93, 0.08 + i * 0.14, 0.1, 0.1, 0.028, i % 2 ? ink : acc, Math.PI / 2);
    }
  } else {
    // salmon under the moon: a crescent over waves of U-forms, two salmon swimming past each other
    g.fillStyle = acc;
    g.beginPath();
    g.arc(0.72, 0.22, 0.15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0.78, 0.18, 0.13, 0, Math.PI * 2);
    g.fill();
    salmon(g, 0.42, 0.48, 0.6, -0.25, bg, ink, acc);
    salmon(g, 0.58, 0.72, 0.52, Math.PI + 0.2, bg, ink, third);
    for (let i = 0; i < 6; i++) uform(g, 0.08 + i * 0.17, 0.93, 0.16, 0.1, 0.03, i % 2 ? third : ink, Math.PI);
    for (let i = 0; i < 4; i++) trigon(g, 0.12 + i * 0.12, 0.1 + (i % 2) * 0.07, 0.05, third, i);
  }
}

/* ------------------------------------------------------------------ portrait */

const SKINS = ["#f6d7bd", "#eac09a", "#d39b6f", "#b07a4f", "#8a5a36", "#5e3b22", "#3f2716"];
/** The folk palettes: a deep colour, a light one, a warm one, a second warm one. */
const FOLK: [string, string, string, string][] = [
  ["#1f3a5f", "#9cc7d6", "#c0392b", "#e67e22"],
  ["#2b3e63", "#b7c9e8", "#d35400", "#f0a35e"],
  ["#3d2a55", "#c7b7e8", "#c2185b", "#f6a5c0"],
  ["#1e4d3a", "#a8d5ba", "#c0392b", "#f2c14e"],
  ["#5a1f2b", "#f1d2c4", "#2e6fb4", "#e3a32c"],
];

type Folk = { deep: string; light: string; warm: string; warm2: string; cream: string };

/** A stylised flower: petals round a centre, the petals patterned with a dot. */
function flower(g: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, petal: string, mid: string): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.fillStyle = petal;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.42, r * 0.22, a, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = mid;
    g.beginPath();
    g.arc(x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66, r * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = mid;
  g.beginPath();
  g.arc(x, y, r * 0.28, 0, Math.PI * 2);
  g.fill();
}

/** A woman's head, facing out, s its half height: her long hair behind (or a hijab round it), closed eyes, cheeks, lips. */
function head(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, skin: string, hair: string, f: Folk, hijab?: string): void {
  g.fillStyle = hijab ?? hair;
  g.beginPath();
  if (hijab) g.ellipse(cx, cy + s * 0.25, s * 1.2, s * 1.4, 0, 0, Math.PI * 2);
  else g.ellipse(cx, cy + s * 1.3, s * 1.35, s * 2.7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = skin;
  if (!hijab) g.fillRect(cx - s * 0.3, cy + s * 0.8, s * 0.6, s * 0.7);
  g.beginPath();
  g.ellipse(cx, cy, s * 0.78, s, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(232,110,90,0.75)";
  g.beginPath();
  g.arc(cx - s * 0.46, cy + s * 0.26, s * 0.18, 0, Math.PI * 2);
  g.arc(cx + s * 0.46, cy + s * 0.26, s * 0.18, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#151515";
  g.lineWidth = s * 0.07;
  for (const k of [-1, 1]) {
    g.beginPath();
    g.arc(cx + k * s * 0.36, cy - s * 0.12, s * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  g.fillStyle = f.warm;
  g.beginPath();
  g.ellipse(cx, cy + s * 0.52, s * 0.18, s * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  // her fringe, or the hijab's edge over her brow
  g.fillStyle = hijab ?? hair;
  g.beginPath();
  g.ellipse(cx, cy - s * 0.8, s * 0.86, s * (hijab ? 0.36 : 0.42), 0, Math.PI, Math.PI * 2);
  g.fill();
}

/** A block of folk pattern: dots, triangles, an eye, checks or a flower, in ink on its colour. */
function folkBlock(g: CanvasRenderingContext2D, R: Rand, x: number, y: number, w: number, h: number, base: string, f: Folk): void {
  const ink = base === f.deep ? f.cream : f.deep;
  g.fillStyle = base;
  g.fillRect(x, y, w + 0.002, h + 0.002);
  g.fillStyle = ink;
  const pat = Math.floor(R() * 5);
  if (pat === 0) {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.arc(x + (w * (i + 0.5)) / 5, y + (h * (j + 0.5)) / 4, Math.min(w, h) * 0.04, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (pat === 1) {
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(x + (w * i) / 4, y + h);
      g.lineTo(x + (w * (i + 0.5)) / 4, y + h * 0.55);
      g.lineTo(x + (w * (i + 1)) / 4, y + h);
      g.fill();
    }
  } else if (pat === 2) {
    g.fillStyle = f.cream;
    g.beginPath();
    g.ellipse(x + w / 2, y + h / 2, w * 0.32, h * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#151515";
    g.beginPath();
    g.arc(x + w / 2, y + h / 2, h * 0.08, 0, Math.PI * 2);
    g.fill();
  } else if (pat === 3) {
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2) g.fillRect(x + (w * i) / 5, y + (h * j) / 3, w / 5, h / 3);
  } else flower(g, x + w / 2, y + h / 2, Math.min(w, h) * 0.38, 6, ink, f.warm2);
}

/** Her dress: from her shoulders (y0, w0 across) flaring to the wall's foot (w1 across), in blocks of folk pattern. */
function dress(g: CanvasRenderingContext2D, R: Rand, cx: number, y0: number, w0: number, w1: number, f: Folk): void {
  g.save();
  g.beginPath();
  g.moveTo(cx - w0 / 2, y0 + 0.04);
  g.quadraticCurveTo(cx - w0 / 2, y0, cx - w0 / 2 + 0.05, y0);
  g.lineTo(cx + w0 / 2 - 0.05, y0);
  g.quadraticCurveTo(cx + w0 / 2, y0, cx + w0 / 2, y0 + 0.04);
  g.lineTo(cx + w1 / 2, 1.01);
  g.lineTo(cx - w1 / 2, 1.01);
  g.closePath();
  g.clip();
  const cols = [f.deep, f.light, f.warm, f.warm2];
  const rows = 3 + Math.floor(R() * 2);
  const h = (1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    const n = 2 + Math.floor(R() * 2);
    for (let q = 0; q < n; q++) folkBlock(g, R, cx - w1 / 2 + (w1 * q) / n, y0 + r * h, w1 / n, h, cols[(r + q * 3) % 4], f);
  }
  g.restore();
}

/** Plants either side of x, their leaves patterned black and white. */
function plants(g: CanvasRenderingContext2D, R: Rand, cx: number, off: number, cream: string): void {
  for (const s of [-1, 1]) {
    const px = cx + s * (off + R() * 0.05);
    g.strokeStyle = "#151515";
    g.lineWidth = 0.008;
    g.beginPath();
    g.moveTo(px, 1);
    g.quadraticCurveTo(px + s * 0.05, 0.6, px, 0.24 + R() * 0.12);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const ly = 0.34 + i * 0.105;
      const dark = i % 2 === 1;
      g.fillStyle = dark ? "#151515" : cream;
      g.beginPath();
      g.ellipse(px + s * 0.045, ly, 0.048, 0.015, s * 0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = dark ? cream : "#151515";
      g.lineWidth = 0.004;
      g.beginPath();
      g.moveTo(px + s * 0.005, ly);
      g.lineTo(px + s * 0.085, ly - 0.012);
      g.stroke();
    }
  }
}

/** A small bird, facing +x (or -x), its wing in the second colour. */
function bird(g: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, body: string, wing: string, beak: string): void {
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(x, y, s, s * 0.56, -0.2 * dir, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(x + dir * s * 0.9, y - s * 0.4, s * 0.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = beak;
  g.beginPath();
  g.moveTo(x + dir * s * 1.25, y - s * 0.5);
  g.lineTo(x + dir * s * 1.7, y - s * 0.36);
  g.lineTo(x + dir * s * 1.25, y - s * 0.22);
  g.fill();
  g.fillStyle = wing;
  g.beginPath();
  g.ellipse(x - dir * s * 0.2, y - s * 0.05, s * 0.6, s * 0.24, -0.5 * dir, 0, Math.PI * 2);
  g.fill();
}

/** Her profile, large, facing +x: her hair flowing back to the wall's edge, flowers and leaves in it. */
function profile(g: CanvasRenderingContext2D, R: Rand, f: Folk, skin: string, hair: string): void {
  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(0.62, 0.16);
  g.bezierCurveTo(0.5, -0.02, 0.06, 0.02, 0.04, 0.34);
  g.bezierCurveTo(0.0, 0.62, 0.14, 0.86, 0.02, 1.01);
  g.lineTo(0.52, 1.01);
  g.bezierCurveTo(0.44, 0.84, 0.5, 0.64, 0.56, 0.52);
  g.closePath();
  g.fill();
  const P = (x: number, y: number): [number, number] => [0.56 + x * 0.32, 0.4 + y * 0.32];
  const to = (x: number, y: number) => g.lineTo(...P(x, y));
  const q = (a: number, b: number, x: number, y: number) => g.quadraticCurveTo(...P(a, b), ...P(x, y));
  g.fillStyle = skin;
  g.beginPath();
  g.moveTo(...P(-0.1, -0.62));
  q(0.25, -0.62, 0.3, -0.3);
  q(0.32, -0.16, 0.33, -0.12);
  to(0.48, 0.08);
  q(0.46, 0.13, 0.36, 0.14);
  q(0.39, 0.19, 0.37, 0.22);
  to(0.33, 0.25);
  q(0.38, 0.29, 0.35, 0.33);
  q(0.33, 0.45, 0.22, 0.47);
  q(0.08, 0.5, 0.06, 0.56);
  to(0.12, 1.3);
  to(-0.3, 1.3);
  to(-0.28, 0.4);
  g.closePath();
  g.fill();
  // her closed eye and brow, her cheek, her lips
  g.strokeStyle = "#151515";
  g.lineWidth = 0.007;
  g.beginPath();
  g.arc(...P(0.17, -0.06), 0.022, 0.1 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  g.beginPath();
  g.moveTo(...P(0.08, -0.22));
  g.quadraticCurveTo(...P(0.2, -0.27), ...P(0.3, -0.2));
  g.stroke();
  g.fillStyle = "rgba(232,110,90,0.7)";
  g.beginPath();
  g.arc(...P(0.12, 0.14), 0.03, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = f.warm;
  g.beginPath();
  g.ellipse(...P(0.355, 0.235), 0.012, 0.02, 0, 0, Math.PI * 2);
  g.fill();
  // the hair over her head
  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(...P(0.26, -0.44));
  q(0.05, -0.78, -0.36, -0.46);
  to(-0.42, 0.34);
  to(-0.12, 0.38);
  q(-0.08, -0.12, 0.26, -0.44);
  g.fill();
  // her collar of pattern
  g.save();
  g.beginPath();
  g.moveTo(...P(-0.6, 1.0));
  q(0.0, 0.8, 0.6, 1.0);
  g.lineTo(0.95, 1.01);
  g.lineTo(0.2, 1.01);
  g.closePath();
  g.clip();
  for (let i = 0; i < 4; i++) folkBlock(g, R, 0.2 + i * 0.19, 0.68, 0.19, 0.34, [f.deep, f.warm, f.light, f.warm2][i], f);
  g.restore();
  // flowers and leaves in her hair
  for (let i = 0; i < 9; i++) {
    const y = 0.1 + i * 0.1;
    const x = 0.12 + R() * 0.26 + (i > 4 ? -0.04 : 0);
    if (i % 3 === 2) {
      g.fillStyle = i % 2 ? f.light : f.cream;
      g.beginPath();
      g.ellipse(x, y, 0.05, 0.018, R() * 3, 0, Math.PI * 2);
      g.fill();
    } else flower(g, x, y, 0.05 + R() * 0.03, 7 + (i % 3), i % 2 ? f.warm : f.light, i % 2 ? f.cream : f.warm2);
  }
}

/**
 * A portrait after the festival's painted women, in one of four compositions: a woman standing among plants under a
 * halo of flowers; her profile, her hair flowing back full of flowers; two women side by side, one in a hijab, their
 * hands joined; her portrait to the shoulders, a moon behind and a bird on her shoulder. Every one has her own palette,
 * skin and hair, her clothes blocks of folk pattern.
 */
function portrait(g: CanvasRenderingContext2D, R: Rand, k: number): void {
  const [deep, light, warm, warm2] = FOLK[(k + Math.floor(R() * 2)) % FOLK.length];
  const f: Folk = { deep, light, warm, warm2, cream: "#f4efe3" };
  g.fillStyle = pick(R, ["#d9d6d0", "#cfd4d8", "#e4ddd2", light]);
  g.fillRect(0, 0, 1, 1);
  const hairs = ["#151515", "#3a2416", "#5a2d1f", "#7a1f2b", "#2b2b3a"];
  const hair = pick(R, hairs);
  const skin = SKINS[(k * 3 + Math.floor(R() * 2)) % SKINS.length];
  const kind = k % 4;
  if (kind === 0) {
    const cx = 0.42 + R() * 0.16;
    const halo = 7 + Math.floor(R() * 3);
    for (let i = 0; i < halo; i++) {
      const a = Math.PI * 1.05 + (Math.PI * 0.9 * i) / (halo - 1);
      flower(g, cx + Math.cos(a) * 0.2, 0.3 + Math.sin(a) * 0.2, 0.075, 8, i % 2 ? warm : deep, i % 2 ? f.cream : warm2);
    }
    head(g, cx, 0.31, 0.095, skin, hair, f);
    dress(g, R, cx, 0.45, 0.22, 0.56, f);
    const side = R() < 0.5 ? -1 : 1;
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(cx + side * 0.15, 0.55, 0.028, 0.042, side * 0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1e4d3a";
    g.lineWidth = 0.006;
    g.beginPath();
    g.moveTo(cx + side * 0.15, 0.53);
    g.lineTo(cx + side * 0.19, 0.44);
    g.stroke();
    flower(g, cx + side * 0.19, 0.42, 0.05, 8, warm, f.cream);
    plants(g, R, cx, 0.34, f.cream);
    bird(g, cx - side * 0.36, 0.2, 0.045, side, deep, warm, warm2);
  } else if (kind === 1) {
    g.save();
    if (R() < 0.5) {
      g.translate(1, 0);
      g.scale(-1, 1);
    }
    profile(g, R, f, skin, hair);
    g.restore();
  } else if (kind === 2) {
    for (let i = 0; i < 9; i++) flower(g, 0.06 + i * 0.11, 0.08 + (i % 2) * 0.05, 0.05, 7, i % 2 ? warm : deep, i % 2 ? f.cream : warm2);
    const hijab = pick(R, [deep, "#1f3a5f", "#7a1f2b", "#2e6f5a"]);
    const skin2 = SKINS[(k * 3 + 3) % SKINS.length];
    head(g, 0.3, 0.33, 0.08, skin, hair, f);
    head(g, 0.7, 0.33, 0.08, skin2, hairs[(hairs.indexOf(hair) + 2) % hairs.length], f, hijab === deep ? warm : hijab);
    dress(g, R, 0.3, 0.45, 0.17, 0.4, f);
    dress(g, R, 0.7, 0.45, 0.17, 0.4, f);
    // their joined hands
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(0.47, 0.6, 0.03, 0.02, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = skin2;
    g.beginPath();
    g.ellipse(0.53, 0.6, 0.03, 0.02, -0.4, 0, Math.PI * 2);
    g.fill();
    flower(g, 0.5, 0.56, 0.035, 7, warm2, f.cream);
  } else {
    const cx = 0.5;
    g.fillStyle = light === g.fillStyle ? f.cream : light;
    g.beginPath();
    g.arc(cx, 0.4, 0.36, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = deep;
    g.lineWidth = 0.01;
    for (let r = 0.39; r < 0.5; r += 0.04) {
      g.beginPath();
      g.arc(cx, 0.4, r, 0, Math.PI * 2);
      g.stroke();
    }
    head(g, cx, 0.42, 0.16, skin, hair, f);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 1.15 + (Math.PI * 0.7 * i) / 4;
      flower(g, cx + Math.cos(a) * 0.17, 0.42 + Math.sin(a) * 0.19, 0.045, 7, i % 2 ? warm : warm2, f.cream);
    }
    dress(g, R, cx, 0.72, 0.56, 0.8, f);
    bird(g, cx + 0.22, 0.66, 0.06, -1, deep, warm, warm2);
  }
  g.fillStyle = f.cream;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.arc(R(), R() * 0.16, 0.005, 0, Math.PI * 2);
    g.fill();
  }
}

/* ------------------------------------------------------------------ abstract */

const BRIGHT: string[][] = [
  ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#2b2d42"],
  ["#f72585", "#7209b7", "#3a0ca3", "#4cc9f0", "#fefae0"],
  ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"],
  ["#ffbe0b", "#fb5607", "#ff006e", "#8338ec", "#3a86ff"],
  ["#003049", "#d62828", "#f77f00", "#fcbf49", "#eae2b7"],
  ["#0b3954", "#087e8b", "#bfd7ea", "#ff5a5f", "#c81d25"],
];

/** Circles over bands; rainbow arches under a sun; waves under the North Shore's peaks; or a field of shapes and dots. */
function abstract(g: CanvasRenderingContext2D, R: Rand, k: number): void {
  const pal = shuffled(R, BRIGHT[k % BRIGHT.length]);
  const kind = k % 4;
  g.fillStyle = pal[4];
  g.fillRect(0, 0, 1, 1);
  if (kind === 0) {
    for (let i = 0; i < 5; i++) {
      g.fillStyle = pal[i % 4];
      g.fillRect(0, i * 0.2, 1, 0.2);
    }
    for (let i = 0; i < 7; i++) {
      g.fillStyle = pal[(i + 2) % 5];
      g.beginPath();
      g.arc(R(), R(), 0.08 + R() * 0.18, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = pal[4];
    g.lineWidth = 0.02;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(0.2 + R() * 0.6, 0.2 + R() * 0.6, 0.1 + R() * 0.15, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (kind === 1) {
    g.fillStyle = pal[3];
    g.beginPath();
    g.arc(0.78, 0.2, 0.12, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = pal[i % 4];
      g.beginPath();
      g.arc(0.5, 1.05, 0.62 - i * 0.09, Math.PI, 0);
      g.fill();
    }
  } else if (kind === 2) {
    // the North Shore's peaks, snow on them, waves below
    g.fillStyle = pal[3];
    g.beginPath();
    g.arc(0.3, 0.25, 0.1, 0, Math.PI * 2);
    g.fill();
    const peaks: [number, number][] = [[0, 0.62], [0.18, 0.38], [0.32, 0.52], [0.52, 0.3], [0.7, 0.48], [0.86, 0.36], [1, 0.55]];
    g.fillStyle = pal[0];
    g.beginPath();
    g.moveTo(0, 1);
    for (const [x, y] of peaks) g.lineTo(x, y);
    g.lineTo(1, 1);
    g.fill();
    g.fillStyle = "#ffffff";
    for (const [x, y] of peaks.slice(1, -1)) {
      g.beginPath();
      g.moveTo(x - 0.05, y + 0.06);
      g.lineTo(x, y);
      g.lineTo(x + 0.05, y + 0.06);
      g.fill();
    }
    for (let i = 0; i < 5; i++) {
      g.fillStyle = pal[(i % 3) + 1];
      g.beginPath();
      g.moveTo(0, 1);
      for (let x = 0; x <= 1.001; x += 0.025) g.lineTo(x, 0.62 + i * 0.08 + Math.sin(x * 18 + i) * 0.025);
      g.lineTo(1, 1);
      g.fill();
    }
  } else {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = pal[i % 4];
      const x = R();
      const y = R();
      const s = 0.06 + R() * 0.14;
      g.beginPath();
      if (i % 3 === 0) g.arc(x, y, s, 0, Math.PI * 2);
      else if (i % 3 === 1) {
        g.moveTo(x, y - s);
        g.lineTo(x + s, y + s);
        g.lineTo(x - s, y + s);
      } else g.rect(x - s / 2, y - s / 2, s, s);
      g.fill();
    }
    g.fillStyle = pal[4] === "#fefae0" ? "#2b2d42" : "#ffffff";
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      g.arc(R(), R(), 0.008, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* ------------------------------------------------------------------ hall fronts */

/** The fronts' woods and paints: wood, ink, the secondary colour, the light one. */
const CEDARS: [string, string, string, string][] = [
  ["#8b5a35", BLACK, RED, "#d39a63"],
  ["#9a6a44", BLACK, "#1f7f7a", "#e2c79f"],
  ["#efe4cf", BLACK, RED, "#1f7f7a"],
  ["#7a6a5a", BLACK, RED, "#f4efe3"],
  ["#6e4a2e", "#f4efe3", RED, "#e3a32c"],
];

/**
 * A hall's painted front, drawn at half width (x 0–2) so its 2:1 wall shows it true, a door at its foot, in one of four
 * compositions: a face across the whole, its eyes great ovoids; a moon over the door, a salmon either side swimming to
 * it; two figures either side of the door, arms raised in welcome; or woven: bands of the weavers' motifs and a great
 * diamond over the door.
 */
function front(g: CanvasRenderingContext2D, R: Rand, k: number): void {
  const [wood, ink, acc, light] = CEDARS[k % CEDARS.length];
  g.fillStyle = wood;
  g.fillRect(0, 0, 1, 1);
  g.strokeStyle = "rgba(40,20,8,0.3)";
  g.lineWidth = 0.004;
  for (let y = 0.05; y < 1; y += 0.065) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1, y);
    g.stroke();
  }
  g.save();
  g.scale(0.5, 1);
  const kind = k % 4;
  if (kind === 0) {
    const wide = 0.5 + R() * 0.15;
    for (const s of [-1, 1]) {
      ovoid(g, 1 + s * wide * 0.5, 0.36, 0.44, 0.3, ink);
      eye(g, 1 + s * wide * 0.5, 0.36, 0.3, light, -s * 0.5, ink);
      uform(g, 1 + s * wide * 0.5, 0.17, 0.42, 0.12, 0.04, acc, Math.PI);
      for (let i = 0; i < 3; i++) {
        uform(g, 1 + s * (wide * 0.5 + 0.34 + i * 0.16), 0.5 + i * 0.05, 0.14, 0.32 - i * 0.05, 0.04, i % 2 ? acc : ink, (s * Math.PI) / 2);
        trigon(g, 1 + s * (wide * 0.5 + 0.42 + i * 0.16), 0.3, 0.06, light, s * 0.8);
      }
      ovoid(g, 1 + s * 0.62, 0.78, 0.22, 0.14, acc);
      ovoid(g, 1 + s * 0.62, 0.79, 0.12, 0.07, ink);
    }
    uform(g, 1, 0.5, 0.14, 0.22, 0.04, ink, 0);
    trigon(g, 1, 0.64, 0.08, acc, Math.PI);
  } else if (kind === 1) {
    g.fillStyle = ink;
    g.beginPath();
    g.arc(1, 0.32, 0.22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.arc(1, 0.32, 0.18, 0, Math.PI * 2);
    g.fill();
    face(g, 1, 0.32, 0.28, light, ink, acc);
    salmon(g, 0.44, 0.44, 0.72, 0, wood, ink, acc);
    salmon(g, 1.56, 0.44, 0.72, Math.PI, wood, ink, acc);
    for (let i = 0; i < 10; i++) uform(g, 0.1 + i * 0.2, 0.86, 0.18, 0.1, 0.035, i % 2 ? acc : ink, Math.PI);
  } else if (kind === 2) {
    for (const cx of [0.5, 1.5]) {
      ovoid(g, cx, 0.34, 0.3, 0.22, ink);
      eye(g, cx - 0.07, 0.32, 0.1, light, 0, ink);
      eye(g, cx + 0.07, 0.32, 0.1, light, 0, ink);
      g.fillStyle = acc;
      g.fillRect(cx - 0.05, 0.4, 0.1, 0.02);
      g.fillStyle = ink;
      g.fillRect(cx - 0.1, 0.47, 0.2, 0.4);
      ovoid(g, cx, 0.62, 0.14, 0.1, acc);
      uform(g, cx, 0.76, 0.12, 0.08, 0.025, light, 0);
      for (const s of [-1, 1]) {
        g.save();
        g.translate(cx + s * 0.09, 0.5);
        g.rotate(s * 0.75);
        g.fillStyle = ink;
        g.fillRect(-0.035, -0.28, 0.07, 0.28);
        ovoid(g, 0, -0.3, 0.1, 0.07, acc);
        g.restore();
      }
    }
    for (let i = 0; i < 10; i++) uform(g, 0.1 + i * 0.2, 0.07, 0.17, 0.09, 0.03, i % 2 ? acc : ink, 0);
  } else {
    band(g, 0, 12, 0, 2, 0.03, 0.1, ink, acc);
    band(g, 3, 8, 0, 2, 0.15, 0.09, acc, light);
    band(g, 1, 12, 0, 2, 0.88, 0.1, ink, acc);
    for (let r = 0.26, i = 0; r > 0.03; r -= 0.055, i++) {
      g.fillStyle = [ink, acc, light, wood][i % 4];
      g.beginPath();
      g.moveTo(1, 0.4 - r);
      g.lineTo(1 + r * 1.1, 0.4);
      g.lineTo(1, 0.4 + r);
      g.lineTo(1 - r * 1.1, 0.4);
      g.closePath();
      g.fill();
    }
    band(g, 4, 3, 0.12, 0.66, 0.34, 0.24, ink, acc);
    band(g, 4, 3, 1.34, 1.88, 0.34, 0.24, acc, ink);
    band(g, 5, 8, 0.12, 0.66, 0.64, 0.12, light, ink);
    band(g, 5, 8, 1.34, 1.88, 0.64, 0.12, ink, light);
  }
  // the door
  g.fillStyle = ink;
  g.fillRect(0.86, 0.66, 0.28, 0.34);
  g.fillStyle = "#2a1a0e";
  g.fillRect(0.89, 0.69, 0.22, 0.31);
  g.restore();
}
