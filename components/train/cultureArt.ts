/**
 * The city's public art, painted once into one atlas of 4 × 5 cells for every place that shows it: the culture sites
 * (Culture.tsx), the halls' carved posts and the people's flags. Under the cells, at half their size, the city's murals
 * (muralArt.ts), each painted once.
 *
 * The Coast Salish–inspired pieces (the spindle whorl, the salmon, the orca, the welcome figures' carving, the big
 * house's front) use the tradition's general elements: ovoids, U-forms, split-U forms and trigons in black and red on
 * cedar. Their subjects are general ones (salmon, orca, human faces), and no crest or design belonging to a family or
 * Nation is copied. The plaques say they are inspired by the tradition. The territory is that of the xʷməθkʷəy̓əm
 * (Musqueam), Sḵwx̱wú7mesh (Squamish) and səlilwətaɬ (Tsleil-Waututh) Nations.
 */
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, MeshStandardMaterial, SRGBColorSpace } from "three";
import { BLACK, eye, ovoid, RED, salmon, trigon, uform } from "./formline";
import { MURALS, paintMural } from "./muralArt";

/** What each cell holds. */
export const ART = {
  whorl: 0,
  salmon: 1,
  orca: 2,
  welcome: 3,
  acknowledge: 4,
  hogan: 5,
  pride: 6,
  trans: 7,
  hands: 8,
  japantown: 9,
  bighouse: 10,
  dragon: 11,
  rangoli: 12,
  plaques: 13,
  faces: 14,
  white: 15,
  /** A button blanket: a red field, a black border, rows of shell-white buttons, a formline salmon at its centre. */
  robe: 16,
  /** Woven cedar bark: diagonal plaits in two browns with a black zigzag band (a woven hat). */
  weave: 17,
  /** A welcome figure's back and sides: formline U-forms and ovoids in black, red and blue-green on cedar. */
  back: 18,
  /** A second welcome figure's face and chest: a woman, cheeks painted, a cedar-bark headband, a necklace. */
  welcome2: 19,
} as const;
/** The plaques' quarters of the plaque cell: Hogan's Alley, Powell Street, the big house, the spindle whorl. */
export const PLAQUE = { hogan: 0, powell: 1, bighouse: 2, whorl: 3 } as const;

/** The atlas's cells: COLS across, ROWS down, square; under them the murals, MURAL_COLS across at half the size. */
const COLS = 4;
const ROWS = 5;
const MURAL_COLS = 8;
const MURAL_ROWS = 6;
/** The atlas's height, in cells. */
const HEIGHT = ROWS + MURAL_ROWS / 2;
/** The first mural's cell: mural k (muralArt.ts) is cell MURAL0 + k. */
export const MURAL0 = COLS * ROWS;
const CEDAR = "#b5703f";
const CEDAR_LIGHT = "#d39a63";
const SKINS = ["#f6d7bd", "#eac09a", "#d39b6f", "#b07a4f", "#8a5a36", "#5e3b22", "#3f2716"];

let atlas: CanvasTexture | null = null;
let atlasFor = 0;
let material: MeshStandardMaterial | null = null;

/** The atlas (512 px cells, 2048 × 4096 with the murals; half that on low-end devices). */
export function artAtlas(lowEnd: boolean): CanvasTexture {
  const S = lowEnd ? 1024 : 2048;
  if (atlas && atlasFor === S) return atlas;
  const c = document.createElement("canvas");
  const C = S / COLS;
  c.width = S;
  c.height = C * HEIGHT;
  const g = c.getContext("2d");
  if (!g) throw new Error("2D canvas unavailable");
  const cs = getComputedStyle(document.documentElement);
  const serif = `${cs.getPropertyValue("--font-serif").trim() || "Georgia"}, Georgia, serif`;
  const sans = `${cs.getPropertyValue("--font-sans").trim() || "system-ui"}, system-ui, sans-serif`;
  const paints: ((g: CanvasRenderingContext2D) => void)[] = [];
  paints[ART.whorl] = whorl;
  paints[ART.salmon] = salmonMural;
  paints[ART.orca] = orcaMural;
  paints[ART.welcome] = welcomeFront;
  paints[ART.acknowledge] = (q) => acknowledge(q, serif, sans);
  paints[ART.hogan] = (q) => hoganMural(q, serif);
  paints[ART.pride] = prideFlag;
  paints[ART.trans] = transFlag;
  paints[ART.hands] = handsMural;
  paints[ART.japantown] = (q) => powellBanner(q, serif);
  paints[ART.bighouse] = bigHouseFront;
  paints[ART.dragon] = dragonMural;
  paints[ART.rangoli] = rangoliMural;
  paints[ART.plaques] = (q) => plaques(q, serif, sans);
  paints[ART.faces] = facesMural;
  paints[ART.robe] = robe;
  paints[ART.weave] = weave;
  paints[ART.back] = figureBack;
  paints[ART.welcome2] = welcomeFront2;
  paints[ART.white] = (q) => {
    q.fillStyle = "#ffffff";
    q.fillRect(0, 0, 1, 1);
  };
  for (let k = 0; k < COLS * ROWS; k++) {
    g.save();
    g.translate((k % COLS) * C, Math.floor(k / COLS) * C);
    g.beginPath();
    g.rect(0, 0, C, C);
    g.clip();
    // every cell drawn on a unit square
    g.scale(C, C);
    paints[k]?.(g);
    g.restore();
  }
  for (let k = 0; k < Math.min(MURALS.length, MURAL_COLS * MURAL_ROWS); k++) {
    g.save();
    g.translate((k % MURAL_COLS) * (C / 2), ROWS * C + Math.floor(k / MURAL_COLS) * (C / 2));
    g.beginPath();
    g.rect(0, 0, C / 2, C / 2);
    g.clip();
    g.scale(C / 2, C / 2);
    paintMural(g, k);
    g.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  atlas = t;
  atlasFor = S;
  return t;
}

/** The material every culture piece shares: the atlas, tinted by vertex colours (white where the art shows). */
export function artMaterial(lowEnd: boolean): MeshStandardMaterial {
  const map = artAtlas(lowEnd);
  if (material && material.map === map) return material;
  material = new MeshStandardMaterial({ map, vertexColors: true, roughness: 0.82 });
  return material;
}

/** The atlas rectangle of a cell, inset so mipmaps do not bleed in from its neighbours: u0, v0, u1, v1. */
export function cellRect(cell: number, inset = 0.01): [number, number, number, number] {
  const mural = cell >= MURAL0;
  const k = mural ? cell - MURAL0 : cell;
  const cols = mural ? MURAL_COLS : COLS;
  const su = 1 / cols;
  const sv = (mural ? 0.5 : 1) / HEIGHT;
  const u0 = (k % cols) * su;
  const v1 = 1 - (mural ? ROWS + Math.floor(k / cols) * 0.5 : Math.floor(k / cols)) / HEIGHT;
  return [u0 + su * inset, v1 - sv + sv * inset, u0 + su - su * inset, v1 - sv * inset];
}

/** Map a geometry's own 0–1 uvs into a cell (or a sub-rectangle of it: x0, y0, x1, y1 from its top-left, 0–1). */
export function intoCell(g: BufferGeometry, cell: number, sub: [number, number, number, number] = [0, 0, 1, 1]): BufferGeometry {
  const [u0, v0, u1, v1] = cellRect(cell);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = sub[0] + uv.getX(i) * (sub[2] - sub[0]);
    const v = 1 - (sub[1] + (1 - uv.getY(i)) * (sub[3] - sub[1]));
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  return g;
}

/** Point every uv of a painted part at the white cell, so its vertex colour is its colour. */
export function onWhite(g: BufferGeometry): BufferGeometry {
  const [u0, v0, u1, v1] = cellRect(ART.white, 0.3);
  const n = g.attributes.position.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) uv.set([(u0 + u1) / 2, (v0 + v1) / 2], i * 2);
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

/* ------------------------------------------------------------------ the cells */

/** A spindle whorl: a cedar disc, three salmon circling the spindle's hole, a ring of trigons at its rim. */
function whorl(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#2a1d14";
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = CEDAR;
  g.beginPath();
  g.arc(0.5, 0.5, 0.48, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = BLACK;
  g.lineWidth = 0.022;
  g.beginPath();
  g.arc(0.5, 0.5, 0.45, 0, Math.PI * 2);
  g.stroke();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
    salmon(g, 0.5 + Math.cos(a) * 0.25, 0.5 + Math.sin(a) * 0.25, 0.42, a + Math.PI / 2, CEDAR);
  }
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    trigon(g, 0.5 + Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42, 0.035, RED, a + Math.PI / 2);
  }
  // the spindle's hole and a face ovoid round it
  ovoid(g, 0.5, 0.5, 0.17, 0.13, BLACK);
  g.fillStyle = "#2a1d14";
  g.beginPath();
  g.arc(0.5, 0.5, 0.04, 0, Math.PI * 2);
  g.fill();
}

/** Salmon running upstream: a school on a river-blue wall, in formline. */
function salmonMural(g: CanvasRenderingContext2D): void {
  const sky = g.createLinearGradient(0, 0, 0, 1);
  sky.addColorStop(0, "#9fd3d8");
  sky.addColorStop(1, "#2f7f8f");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1, 1);
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.lineWidth = 0.012;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    for (let x = 0; x <= 1.01; x += 0.05) g.lineTo(x, 0.12 + k * 0.17 + Math.sin(x * 12 + k) * 0.02);
    g.stroke();
  }
  const fish: [number, number, number, number][] = [
    [0.3, 0.25, 0.36, -0.3],
    [0.68, 0.3, 0.3, -0.25],
    [0.45, 0.55, 0.42, -0.35],
    [0.25, 0.8, 0.3, -0.2],
    [0.75, 0.72, 0.34, -0.4],
  ];
  for (const [x, y, s, r] of fish) salmon(g, x, y, s, r, "#e9d2b0");
}

/** An orca breaching through formline waves, black and red on cedar. */
function orcaMural(g: CanvasRenderingContext2D): void {
  g.fillStyle = CEDAR_LIGHT;
  g.fillRect(0, 0, 1, 1);
  // the waves: a band of split-U forms
  for (let k = 0; k < 6; k++) uform(g, 0.08 + k * 0.17, 0.86, 0.16, 0.12, 0.035, k % 2 ? RED : BLACK, Math.PI);
  g.save();
  g.translate(0.5, 0.5);
  g.rotate(-0.35);
  g.fillStyle = BLACK;
  g.beginPath();
  g.moveTo(0.42, 0.02);
  g.quadraticCurveTo(0.34, -0.2, 0.0, -0.2);
  g.lineTo(-0.06, -0.42);
  g.quadraticCurveTo(-0.14, -0.25, -0.2, -0.17);
  g.quadraticCurveTo(-0.34, -0.12, -0.38, -0.02);
  g.lineTo(-0.48, -0.14);
  g.quadraticCurveTo(-0.45, 0.02, -0.48, 0.16);
  g.lineTo(-0.38, 0.04);
  g.quadraticCurveTo(-0.2, 0.18, 0.1, 0.17);
  g.quadraticCurveTo(0.36, 0.16, 0.42, 0.02);
  g.closePath();
  g.fill();
  ovoid(g, 0.06, 0.04, 0.34, 0.14, CEDAR_LIGHT);
  ovoid(g, 0.06, 0.04, 0.2, 0.08, RED);
  eye(g, 0.27, -0.06, 0.1, CEDAR_LIGHT, 1);
  uform(g, -0.2, 0.0, 0.1, 0.16, 0.03, RED, -Math.PI / 2);
  g.fillStyle = RED;
  g.fillRect(0.3, 0.05, 0.1, 0.022);
  trigon(g, -0.06, -0.24, 0.08, CEDAR_LIGHT, 0);
  g.restore();
}

/** The front of a welcome figure: a face under its brows and a cedar hat's brim, formline on its chest, a red apron. */
function welcomeFront(g: CanvasRenderingContext2D): void {
  g.fillStyle = CEDAR;
  g.fillRect(0, 0, 1, 1);
  // the grain
  g.strokeStyle = "rgba(60,30,10,0.25)";
  g.lineWidth = 0.006;
  for (let x = 0.05; x < 1; x += 0.07) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 0.02, 1);
    g.stroke();
  }
  // the face, its upper third
  g.fillStyle = BLACK;
  g.beginPath();
  g.ellipse(0.3, 0.12, 0.14, 0.03, -0.15, 0, Math.PI * 2);
  g.ellipse(0.7, 0.12, 0.14, 0.03, 0.15, 0, Math.PI * 2);
  g.fill();
  eye(g, 0.3, 0.17, 0.18, CEDAR_LIGHT, 0);
  eye(g, 0.7, 0.17, 0.18, CEDAR_LIGHT, 0);
  g.fillStyle = "#8a4b26";
  g.beginPath();
  g.moveTo(0.5, 0.15);
  g.lineTo(0.43, 0.26);
  g.lineTo(0.57, 0.26);
  g.closePath();
  g.fill();
  g.fillStyle = RED;
  g.beginPath();
  g.ellipse(0.5, 0.3, 0.11, 0.025, 0, 0, Math.PI * 2);
  g.fill();
  // the chest: two U-forms and an ovoid
  uform(g, 0.32, 0.48, 0.22, 0.12, 0.04, BLACK);
  uform(g, 0.68, 0.48, 0.22, 0.12, 0.04, BLACK);
  ovoid(g, 0.5, 0.6, 0.26, 0.1, BLACK);
  ovoid(g, 0.5, 0.605, 0.15, 0.05, RED);
  // the apron
  g.fillStyle = RED;
  g.fillRect(0.12, 0.74, 0.76, 0.2);
  g.fillStyle = BLACK;
  g.fillRect(0.12, 0.74, 0.76, 0.025);
  for (let x = 0.16; x < 0.86; x += 0.08) {
    g.beginPath();
    g.arc(x, 0.86, 0.012, 0, Math.PI * 2);
    g.fillStyle = "#f5f0e6";
    g.fill();
  }
}

/** Draw in the cell's own pixels, so fonts render at real sizes: f gets the cell's size in px. */
function inPx(g: CanvasRenderingContext2D, f: (k: number) => void): void {
  const k = g.getTransform().a;
  g.save();
  g.scale(1 / k, 1 / k);
  f(k);
  g.restore();
}

/** Wrap text into lines no wider than w, drawn from (x, y) down, `lh` apart; returns the next line's y. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number): number {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

/** A bronze plaque's ground and border, in the rectangle (x, y, w, h). */
function bronze(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = "#2b2621";
  g.fillRect(x, y, w, h);
  g.strokeStyle = "#b08d57";
  g.lineWidth = w * 0.012;
  g.strokeRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.94);
}

/** The land acknowledgement at Waterfront. */
function acknowledge(g: CanvasRenderingContext2D, serif: string, sans: string): void {
  bronze(g, 0, 0, 1, 1);
  inPx(g, (k) => {
    g.fillStyle = "#e9d8b4";
    g.textAlign = "center";
    g.font = `600 ${0.075 * k}px ${serif}`;
    g.fillText("Unceded Territory", 0.5 * k, 0.16 * k);
    g.font = `400 ${0.047 * k}px ${sans}`;
    let y = wrap(g, "This city stands on the unceded, traditional and ancestral territories of the", 0.5 * k, 0.27 * k, 0.84 * k, 0.065 * k);
    g.font = `600 ${0.05 * k}px ${sans}`;
    y = wrap(g, "xʷməθkʷəy̓əm (Musqueam),", 0.5 * k, y + 0.01 * k, 0.84 * k, 0.066 * k);
    y = wrap(g, "Sḵwx̱wú7mesh (Squamish) and", 0.5 * k, y, 0.84 * k, 0.066 * k);
    y = wrap(g, "səlilwətaɬ (Tsleil-Waututh) Nations.", 0.5 * k, y, 0.84 * k, 0.066 * k);
    g.font = `400 ${0.036 * k}px ${sans}`;
    g.fillStyle = "#c9b48c";
    wrap(g, "The welcome figures beside this plaque are inspired by Coast Salish carving traditions.", 0.5 * k, y + 0.05 * k, 0.8 * k, 0.05 * k);
  });
}

/** Hogan's Alley: faces of its community, a trumpet's notes, the name. */
function hoganMural(g: CanvasRenderingContext2D, serif: string): void {
  g.fillStyle = "#f2b632";
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = "#e4572e";
  g.beginPath();
  g.arc(0.5, 1.05, 0.62, Math.PI, 0);
  g.fill();
  const faces: [number, number, number, string][] = [
    [0.24, 0.5, 0.15, SKINS[5]],
    [0.5, 0.42, 0.18, SKINS[6]],
    [0.76, 0.52, 0.15, SKINS[4]],
  ];
  for (const [x, y, r, skin] of faces) portrait(g, x, y, r, skin);
  g.strokeStyle = "#1f2937";
  g.lineWidth = 0.012;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.ellipse(0.12 + k * 0.19, 0.13 + Math.sin(k) * 0.03, 0.02, 0.015, -0.4, 0, Math.PI * 2);
    g.moveTo(0.14 + k * 0.19, 0.13 + Math.sin(k) * 0.03);
    g.lineTo(0.14 + k * 0.19, 0.05 + Math.sin(k) * 0.03);
    g.stroke();
  }
  inPx(g, (k) => {
    g.fillStyle = "#1f2937";
    g.font = `700 ${0.085 * k}px ${serif}`;
    g.textAlign = "center";
    g.fillText("Hogan's Alley", 0.5 * k, 0.93 * k);
  });
}

/** A portrait: a face of skin `skin`, hair, shoulders. */
function portrait(g: CanvasRenderingContext2D, x: number, y: number, r: number, skin: string): void {
  g.fillStyle = "#1f2937";
  g.beginPath();
  g.ellipse(x, y + r * 1.55, r * 1.25, r * 0.7, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(x, y, r * 0.72, r * 0.9, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#16120f";
  g.beginPath();
  g.ellipse(x, y - r * 0.55, r * 0.85, r * 0.5, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = "#16120f";
  g.beginPath();
  g.arc(x - r * 0.28, y + r * 0.05, r * 0.07, 0, Math.PI * 2);
  g.arc(x + r * 0.28, y + r * 0.05, r * 0.07, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#7a2e22";
  g.lineWidth = r * 0.08;
  g.beginPath();
  g.arc(x, y + r * 0.35, r * 0.25, 0.2, Math.PI - 0.2);
  g.stroke();
}

/** The Progress Pride flag: the six stripes and the chevron at the hoist (white, pink, light blue, brown, black). */
function prideFlag(g: CanvasRenderingContext2D): void {
  ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"].forEach((c, k) => {
    g.fillStyle = c;
    g.fillRect(0, k / 6, 1, 1 / 6 + 0.002);
  });
  ["#000000", "#613915", "#5bcefa", "#f5a9b8", "#ffffff"].forEach((c, k) => {
    const s = 0.5 - k * 0.085;
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, 0.5 - s - 0.02);
    g.lineTo(s * 0.95, 0.5);
    g.lineTo(0, 0.5 + s + 0.02);
    g.closePath();
    g.fill();
  });
}

/** The transgender pride flag: light blue, pink, white, pink, light blue. */
function transFlag(g: CanvasRenderingContext2D): void {
  ["#5bcefa", "#f5a9b8", "#ffffff", "#f5a9b8", "#5bcefa"].forEach((c, k) => {
    g.fillStyle = c;
    g.fillRect(0, k / 5, 1, 1 / 5 + 0.002);
  });
}

/** Hands of every skin tone raised under a rainbow. */
function handsMural(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#fdf6e9";
  g.fillRect(0, 0, 1, 1);
  ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"].forEach((c, k) => {
    g.strokeStyle = c;
    g.lineWidth = 0.045;
    g.beginPath();
    g.arc(0.5, 0.78, 0.46 - k * 0.045, Math.PI, 0);
    g.stroke();
  });
  SKINS.forEach((skin, k) => {
    const x = 0.1 + k * 0.133;
    const h = 0.26 + Math.sin(k * 1.7) * 0.06;
    g.fillStyle = skin;
    g.beginPath();
    g.roundRect(x - 0.045, 1 - h, 0.09, h + 0.05, 0.03);
    g.fill();
    for (let f = 0; f < 4; f++) {
      g.beginPath();
      g.roundRect(x - 0.045 + f * 0.024, 1 - h - 0.07 - Math.abs(f - 1.5) * -0.01, 0.019, 0.09, 0.009);
      g.fill();
    }
    g.beginPath();
    g.roundRect(x - 0.075, 1 - h + 0.02, 0.035, 0.07, 0.015);
    g.fill();
  });
}

/** A Powell Street Festival banner: a lantern, koi, the name. */
function powellBanner(g: CanvasRenderingContext2D, serif: string): void {
  g.fillStyle = "#1e3a5f";
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = "#c8281e";
  g.beginPath();
  g.ellipse(0.5, 0.36, 0.2, 0.26, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1f1f1f";
  g.fillRect(0.38, 0.08, 0.24, 0.05);
  g.fillRect(0.38, 0.6, 0.24, 0.05);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 0.008;
  for (let k = 1; k < 6; k++) {
    g.beginPath();
    g.ellipse(0.5, 0.36, 0.2, 0.26 * (k / 6), 0, 0, Math.PI * 2);
    g.stroke();
  }
  for (const [x, y, r, c] of [
    [0.25, 0.8, 0.5, "#f59e0b"],
    [0.72, 0.84, -0.4, "#f8fafc"],
  ] as [number, number, number, string][]) {
    g.save();
    g.translate(x, y);
    g.rotate(r);
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(0, 0, 0.11, 0.045, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-0.1, 0);
    g.lineTo(-0.17, -0.05);
    g.lineTo(-0.17, 0.05);
    g.fill();
    g.restore();
  }
  inPx(g, (k) => {
    g.fillStyle = "#f8f1e3";
    g.font = `600 ${0.07 * k}px ${serif}`;
    g.textAlign = "center";
    g.fillText("Powell Street", 0.5 * k, 0.97 * k);
  });
}

/** A big house's painted front, drawn wide (it is stretched to the front's 2 : 1): figures with raised arms, salmon over the door. */
function bigHouseFront(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#8b5a35";
  g.fillRect(0, 0, 1, 1);
  g.strokeStyle = "rgba(40,20,8,0.4)";
  g.lineWidth = 0.004;
  for (let y = 0.04; y < 1; y += 0.06) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1, y);
    g.stroke();
  }
  g.save();
  g.scale(0.5, 1);
  // two figures, arms raised in welcome, either side of the door
  for (const cx of [0.55, 1.45]) {
    ovoid(g, cx, 0.32, 0.3, 0.22, BLACK);
    eye(g, cx - 0.07, 0.3, 0.1, CEDAR_LIGHT, 0);
    eye(g, cx + 0.07, 0.3, 0.1, CEDAR_LIGHT, 0);
    g.fillStyle = RED;
    g.fillRect(cx - 0.05, 0.38, 0.1, 0.02);
    g.fillStyle = BLACK;
    g.fillRect(cx - 0.1, 0.45, 0.2, 0.36);
    ovoid(g, cx, 0.6, 0.14, 0.1, RED);
    for (const s of [-1, 1]) {
      g.save();
      g.translate(cx + s * 0.1, 0.48);
      g.rotate(s * 0.7);
      g.fillStyle = BLACK;
      g.fillRect(-0.025, -0.24, 0.05, 0.24);
      g.restore();
    }
  }
  // salmon over the door, the door's frame
  salmon(g, 1.0, 0.18, 0.36, 0, "#8b5a35");
  g.fillStyle = BLACK;
  g.fillRect(0.86, 0.36, 0.28, 0.64);
  g.fillStyle = "#3b2412";
  g.fillRect(0.89, 0.39, 0.22, 0.61);
  for (let k = 0; k < 6; k++) trigon(g, 0.12 + k * 0.35, 0.92, 0.06, RED, 0);
  g.restore();
}

/** A dragon over Chinatown: red and gold, its body looping between lanterns. */
function dragonMural(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#7f1d1d";
  g.fillRect(0, 0, 1, 1);
  for (const [x, y] of [
    [0.15, 0.15],
    [0.85, 0.2],
    [0.2, 0.85],
    [0.82, 0.82],
  ]) {
    g.fillStyle = "#ef4444";
    g.beginPath();
    g.ellipse(x, y, 0.07, 0.09, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#facc15";
    g.fillRect(x - 0.04, y - 0.11, 0.08, 0.025);
    g.fillRect(x - 0.04, y + 0.085, 0.08, 0.025);
  }
  // the body, a long S, its legs and claws first so the body overlaps them
  const body = (t: number): [number, number] => {
    // two joined cubic curves, (0.1, 0.66) → (0.58, 0.52) → (0.76, 0.38)
    if (t < 0.6) {
      const k = t / 0.6;
      const v = 1 - k;
      return [v ** 3 * 0.1 + 3 * v * v * k * 0.28 + 3 * v * k * k * 0.42 + k ** 3 * 0.58, v ** 3 * 0.66 + 3 * v * v * k * 0.22 + 3 * v * k * k * 0.86 + k ** 3 * 0.52];
    }
    const k = (t - 0.6) / 0.4;
    const v = 1 - k;
    return [v ** 3 * 0.58 + 3 * v * v * k * 0.68 + 3 * v * k * k * 0.8 + k ** 3 * 0.76, v ** 3 * 0.52 + 3 * v * v * k * 0.28 + 3 * v * k * k * 0.44 + k ** 3 * 0.38];
  };
  g.strokeStyle = "#facc15";
  g.lineCap = "round";
  g.lineWidth = 0.022;
  for (const t of [0.25, 0.42, 0.66, 0.82]) {
    const [x, y] = body(t);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 0.03, y + 0.09);
    g.lineTo(x - 0.06, y + 0.1);
    g.moveTo(x - 0.03, y + 0.09);
    g.lineTo(x, y + 0.11);
    g.stroke();
  }
  g.lineWidth = 0.085;
  g.beginPath();
  for (let k = 0; k <= 40; k++) {
    const [x, y] = body(k / 40);
    if (k) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  // scales down the middle, a green crest of spines along the back
  g.strokeStyle = "#16a34a";
  g.lineWidth = 0.02;
  g.stroke();
  g.fillStyle = "#16a34a";
  for (let k = 2; k < 38; k += 3) {
    const [x, y] = body(k / 40);
    g.beginPath();
    g.moveTo(x - 0.015, y - 0.035);
    g.lineTo(x, y - 0.075);
    g.lineTo(x + 0.015, y - 0.035);
    g.fill();
  }
  // the head: snout, jaw, eye, two antler horns, the mane, whiskers
  g.fillStyle = "#facc15";
  g.beginPath();
  g.ellipse(0.8, 0.35, 0.085, 0.06, -0.3, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(0.88, 0.37, 0.05, 0.03, -0.1, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ef4444";
  g.beginPath();
  g.moveTo(0.76, 0.3);
  for (let k = 0; k < 6; k++) g.lineTo(0.7 - k * 0.012, 0.28 + (k % 2 ? 0.05 : 0) + k * 0.012);
  g.lineTo(0.74, 0.39);
  g.fill();
  g.strokeStyle = "#fef3c7";
  g.lineWidth = 0.014;
  g.beginPath();
  g.moveTo(0.79, 0.3);
  g.lineTo(0.76, 0.21);
  g.lineTo(0.72, 0.19);
  g.moveTo(0.76, 0.21);
  g.lineTo(0.79, 0.17);
  g.moveTo(0.83, 0.3);
  g.lineTo(0.83, 0.22);
  g.lineTo(0.87, 0.19);
  g.stroke();
  g.fillStyle = "#111";
  g.beginPath();
  g.arc(0.82, 0.33, 0.014, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#f8fafc";
  g.lineWidth = 0.01;
  g.beginPath();
  g.moveTo(0.91, 0.36);
  g.quadraticCurveTo(0.97, 0.4, 0.95, 0.5);
  g.moveTo(0.9, 0.39);
  g.quadraticCurveTo(0.94, 0.47, 0.88, 0.53);
  g.stroke();
  // the pearl it chases
  g.fillStyle = "#fde68a";
  g.beginPath();
  g.arc(0.9, 0.62, 0.05, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#f59e0b";
  g.lineWidth = 0.01;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(0.9 + Math.cos(a) * 0.065, 0.62 + Math.sin(a) * 0.065);
    g.lineTo(0.9 + Math.cos(a) * 0.09, 0.62 + Math.sin(a) * 0.09);
    g.stroke();
  }
}

/** A rangoli: petals and dots in rings, marigold, magenta, teal and white. */
function rangoliMural(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#1e3a5f";
  g.fillRect(0, 0, 1, 1);
  const rings: [number, number, number, string][] = [
    [0.42, 16, 0.07, "#f59e0b"],
    [0.32, 12, 0.08, "#db2777"],
    [0.21, 8, 0.08, "#14b8a6"],
    [0.11, 6, 0.06, "#fde68a"],
  ];
  for (const [r, n, s, c] of rings) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      g.save();
      g.translate(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
      g.rotate(a + Math.PI / 2);
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(0.5, 0.5, 0.05, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    g.beginPath();
    g.arc(0.5 + Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.48, 0.008, 0, Math.PI * 2);
    g.fill();
  }
}

/** The plaques' quarters. */
function plaques(g: CanvasRenderingContext2D, serif: string, sans: string): void {
  const texts: [string, string][] = [
    [
      "Hogan's Alley",
      "Vancouver's Black community made its home here, round Nora Hendrix and Vie's Chicken and Steak House, until the Georgia Viaducts were driven through it in the early 1970s.",
    ],
    ["Powell Street · Japantown", "Japanese Canadians built this neighbourhood until 1942, when they were uprooted and interned. The Powell Street Festival celebrates them here every summer."],
    ["The Big House", "A gathering house in the tradition of the xʷməθkʷəy̓əm, Sḵwx̱wú7mesh and səlilwətaɬ Nations. Its carving and painting are inspired by Coast Salish art."],
    ["Spindle Whorl", "Coast Salish weavers spun wool on whorls like this one. Its salmon circling the centre are inspired by that tradition."],
  ];
  texts.forEach(([title, body], k) => {
    const x = (k % 2) * 0.5;
    const y = Math.floor(k / 2) * 0.5;
    bronze(g, x, y, 0.5, 0.5);
    inPx(g, (k) => {
      g.fillStyle = "#e9d8b4";
      g.textAlign = "center";
      g.font = `600 ${0.04 * k}px ${serif}`;
      g.fillText(title, (x + 0.25) * k, (y + 0.09) * k);
      g.font = `400 ${0.024 * k}px ${sans}`;
      wrap(g, body, (x + 0.25) * k, (y + 0.15) * k, 0.4 * k, 0.034 * k);
    });
  });
}

/** Faces of the community: a crowd of portraits in every skin tone, in bright colour fields. */
function facesMural(g: CanvasRenderingContext2D): void {
  const fields = ["#14b8a6", "#f59e0b", "#db2777", "#6d28d9", "#16a34a", "#2563eb"];
  for (let k = 0; k < 6; k++) {
    g.fillStyle = fields[k];
    g.fillRect((k % 3) / 3, Math.floor(k / 3) / 2, 1 / 3 + 0.002, 0.5 + 0.002);
  }
  for (let k = 0; k < 6; k++) portrait(g, (k % 3) / 3 + 1 / 6, Math.floor(k / 3) / 2 + 0.2, 0.11, SKINS[(k * 3 + 1) % SKINS.length]);
}

const TEAL = "#1f7f7a";

/** A button blanket, worn as a cape: red, a black border, rows of buttons, a formline salmon in buttons at its middle. */
function robe(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#a3191b";
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = BLACK;
  g.fillRect(0, 0, 1, 0.12);
  g.fillRect(0, 0, 0.1, 1);
  g.fillRect(0.9, 0, 0.1, 1);
  g.fillRect(0, 0.9, 1, 0.1);
  const button = (x: number, y: number, r = 0.012) => {
    g.fillStyle = "#f4efe4";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // rows of buttons along the border
  for (let x = 0.06; x < 0.97; x += 0.035) {
    button(x, 0.06);
    button(x, 0.95);
  }
  for (let y = 0.15; y < 0.9; y += 0.035) {
    button(0.05, y);
    button(0.95, y);
  }
  // a formline salmon outlined in buttons, the blue-green between
  g.save();
  g.translate(0.5, 0.52);
  g.scale(0.62, 0.62);
  salmon(g, 0, 0, 1, -0.3, "#a3191b", BLACK, TEAL);
  g.restore();
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    button(0.5 + Math.cos(a) * 0.36, 0.52 + Math.sin(a) * 0.3, 0.009);
  }
}

/** Woven cedar bark: plaits in two browns, crossing on the diagonal, a black zigzag band round its middle. */
function weave(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#b9874f";
  g.fillRect(0, 0, 1, 1);
  const n = 16;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? "#a57440" : "#c99a60";
      g.fillRect(i / n, j / n, 1 / n + 0.002, 1 / n + 0.002);
      g.strokeStyle = "rgba(60,35,15,0.35)";
      g.lineWidth = 0.004;
      g.beginPath();
      g.moveTo(i / n, j / n);
      g.lineTo((i + 1) / n, (j + 1) / n);
      g.stroke();
    }
  }
  g.fillStyle = BLACK;
  g.beginPath();
  g.moveTo(0, 0.5);
  for (let k = 0; k <= 16; k++) g.lineTo(k / 16, k % 2 ? 0.42 : 0.58);
  g.lineTo(1, 0.66);
  for (let k = 16; k >= 0; k--) g.lineTo(k / 16, k % 2 ? 0.5 : 0.66);
  g.closePath();
  g.fill();
  g.fillStyle = "#a3191b";
  g.fillRect(0, 0.3, 1, 0.03);
  g.fillRect(0, 0.75, 1, 0.03);
}

/** A welcome figure's back and sides: carved cedar with formline in black, red and blue-green, the grain showing. */
function figureBack(g: CanvasRenderingContext2D): void {
  g.fillStyle = CEDAR;
  g.fillRect(0, 0, 1, 1);
  g.strokeStyle = "rgba(60,30,10,0.25)";
  g.lineWidth = 0.006;
  for (let x = 0.03; x < 1; x += 0.06) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 0.015, 1);
    g.stroke();
  }
  for (const [y, s] of [
    [0.16, 1],
    [0.46, 0.9],
    [0.76, 1.1],
  ] as const) {
    ovoid(g, 0.5, y, 0.34 * s, 0.16 * s, BLACK);
    ovoid(g, 0.5, y + 0.005, 0.2 * s, 0.08 * s, TEAL);
    uform(g, 0.2, y, 0.16 * s, 0.14 * s, 0.035, "#a3191b");
    uform(g, 0.8, y, 0.16 * s, 0.14 * s, 0.035, "#a3191b");
    trigon(g, 0.35, y + 0.09, 0.05, BLACK, Math.PI);
    trigon(g, 0.65, y + 0.09, 0.05, BLACK, Math.PI);
  }
}

/** A second welcome figure: a woman, red cheeks and a painted chin, a cedar-bark headband, hair to her shoulders. */
function welcomeFront2(g: CanvasRenderingContext2D): void {
  welcomeFront(g);
  // the headband across the brow, woven in two browns
  g.fillStyle = "#c99a60";
  g.fillRect(0.06, 0.03, 0.88, 0.06);
  g.fillStyle = BLACK;
  for (let x = 0.08; x < 0.92; x += 0.05) g.fillRect(x, 0.045, 0.025, 0.03);
  // cheeks and the chin painted red, and blue-green on the chest's ovoid
  g.fillStyle = "#c2272d";
  g.beginPath();
  g.ellipse(0.2, 0.27, 0.07, 0.035, 0, 0, Math.PI * 2);
  g.ellipse(0.8, 0.27, 0.07, 0.035, 0, 0, Math.PI * 2);
  g.fill();
  ovoid(g, 0.5, 0.605, 0.15, 0.05, TEAL);
  // a dentalium necklace across the chest
  g.strokeStyle = "#f4efe4";
  g.lineWidth = 0.012;
  g.beginPath();
  g.arc(0.5, 0.33, 0.27, 0.35, Math.PI - 0.35);
  g.stroke();
}
