/**
 * The tree atlas: sixteen species painted on canvas in a 4 × 4 grid of 256 × 320 cells, channel-packed so one texture
 * carries both layers: R leaf luminance, G bark luminance, B leaf cover, A bark cover. Deciduous species get a full
 * branch skeleton (recursive branching, species by species) under their leaf clumps, so a bare winter crown shows its
 * real silhouette. The conifers are drawn from the same build as the three-dimensional ones (trees/conifer.ts): every
 * spray card projected side on, back to front, shaded by depth and height, over the trunk and limbs. Client only.
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, Matrix4, RGBAFormat, Vector3 } from "three";

import { Rng } from "../cityModel";
import { type Conifer, coniferSkeleton, crownFromOf, DETAIL_FULL, frondCanvas, sprayMatrix } from "./conifer";
import { SPECIES, type SpeciesId } from "./species";

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
/** The height the conifers are painted at, in world units, and how much of their cell's height that fills. */
export const CONIFER_PAINT_H = 24;
export const CONIFER_FILL = 0.885;
const CW = 256;
const CH = 320;

type Branching = { trunk: number; wid: number; depth: number; fork0: number; fork: number; spread: number; ratio: number; lean?: number };
const BRANCHING: Partial<Record<SpeciesId, Branching>> = {
  cherry: { trunk: 64, wid: 13, depth: 6, fork0: 3, fork: 2, spread: 0.62, ratio: 0.74 },
  smaple: { trunk: 82, wid: 12, depth: 6, fork0: 3, fork: 2, spread: 0.46, ratio: 0.72 },
  bigleaf: { trunk: 70, wid: 17, depth: 6, fork0: 3, fork: 2, spread: 0.7, ratio: 0.73 },
  plane: { trunk: 104, wid: 13, depth: 6, fork0: 2, fork: 2, spread: 0.55, ratio: 0.72 },
  alder: { trunk: 128, wid: 10, depth: 6, fork0: 2, fork: 2, spread: 0.34, ratio: 0.7 },
  dogwood: { trunk: 50, wid: 10, depth: 5, fork0: 3, fork: 2, spread: 0.95, ratio: 0.74 },
  arbutus: { trunk: 58, wid: 14, depth: 5, fork0: 3, fork: 2, spread: 0.8, ratio: 0.72, lean: 0.35 },
  rhodo: { trunk: 14, wid: 6, depth: 3, fork0: 5, fork: 2, spread: 0.55, ratio: 0.7 },
  oak: { trunk: 66, wid: 18, depth: 6, fork0: 3, fork: 2, spread: 0.9, ratio: 0.72, lean: 0.2 },
  hornbeam: { trunk: 46, wid: 11, depth: 6, fork0: 3, fork: 2, spread: 0.2, ratio: 0.82 },
  magnolia: { trunk: 30, wid: 10, depth: 5, fork0: 4, fork: 2, spread: 0.85, ratio: 0.72 },
  ginkgo: { trunk: 96, wid: 10, depth: 5, fork0: 3, fork: 2, spread: 0.42, ratio: 0.66 },
};

/**
 * A conifer painted from its three-dimensional build: the trunk and limbs into the bark layers, then every spray card
 * projected exactly (each card is flat, so a canvas transform maps the frond onto it), farthest first, its frond in
 * grey at a level for its depth and height, into the leaf layers.
 */
function paintConifer(sp: Conifer, layers: CanvasRenderingContext2D[], bx: number, by: number, cellH: number): void {
  const [gLL, gBL, gLA, gBA] = layers;
  const H = CONIFER_PAINT_H;
  const k = (cellH * CONIFER_FILL) / H;
  const sk = coniferSkeleton(sp, H, crownFromOf(sp, H), DETAIL_FULL, 1.3);
  const X = (x: number) => bx + x * k;
  const Y = (y: number) => by - y * k;
  // a mid grey under the leaves, so the cover's fuller edge (below) reads as foliage, not a dark rim
  gLL.fillStyle = "rgb(120,120,120)";
  gLL.fillRect(bx - 200, by - 400, 400, 420);
  // the trunk, a little lighter on its lit side: full girth below the crown, slimmer inside it (the sprays round it
  // hide most of it), stopping under the top whorl; the leader above it a thin line, and the limbs only near the trunk
  const crownY = crownFromOf(sp, H);
  const trunk = sk.trunk.filter((p) => p.y < H - 1.6).map((p) => ({ x: p.x * (p.y > crownY + 1 ? 0.55 : 1), y: p.y }));
  for (const [g, col] of [
    [gBL, "#a8a8a8"],
    [gBA, "#fff"],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    trunk.forEach((p, i) => (i ? g.lineTo(X(-p.x), Y(p.y)) : g.moveTo(X(-p.x), Y(p.y))));
    for (let i = trunk.length - 1; i >= 0; i--) g.lineTo(X(trunk[i].x), Y(trunk[i].y));
    g.closePath();
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 1.2;
    g.beginPath();
    sk.lead.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y - 0.5))));
    g.stroke();
  }
  gBL.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < trunk.length - 1; i++) gBL.fillRect(X(-trunk[i].x * 0.2), Y(trunk[i + 1].y), trunk[i].x * k * 0.7, (trunk[i + 1].y - trunk[i].y) * k + 1);
  for (const [a, b] of sk.limbs) {
    for (const [g, col] of [
      [gBL, "#8a8a8a"],
      [gBA, "#fff"],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(X(a.x), Y(a.y));
      g.lineTo(X(a.x + (b.x - a.x) * 0.45), Y(a.y + (b.y - a.y) * 0.45));
      g.stroke();
    }
  }
  // the frond in grey at six levels, and as a white silhouette for the cover
  const src = frondCanvas(sp).getContext("2d")?.getImageData(0, 0, 128, 80);
  if (!src) return;
  const LEVELS = [0.5, 0.62, 0.74, 0.86, 0.98, 1.1];
  const frond = [...LEVELS.map((lv) => lv * 1.65), -1].map((gain) => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 80;
    const g = c.getContext("2d");
    if (!g) return c;
    const img = g.createImageData(128, 80);
    for (let i = 0; i < src.data.length; i += 4) {
      const l = gain < 0 ? 255 : Math.min(255, (0.3 * src.data[i] + 0.59 * src.data[i + 1] + 0.11 * src.data[i + 2]) * gain);
      img.data.set([l, l, l, src.data[i + 3]], i);
    }
    g.putImageData(img, 0, 0);
    return c;
  });
  const white = frond[LEVELS.length];
  const m = new Matrix4();
  const d = new Vector3();
  const up = new Vector3();
  const n = new Vector3();
  const reach = Math.max(...sk.sprays.map((s) => Math.hypot(s.p.x, s.p.z) + s.s));
  const cards = sk.sprays
    .map((s) => {
      sprayMatrix(s, m);
      d.set(1, 0, 0).transformDirection(m);
      return { s, z: s.p.z + d.z * s.s * 0.5 };
    })
    .sort((a, b) => a.z - b.z);
  for (const { s, z } of cards) {
    sprayMatrix(s, m);
    const e = m.elements;
    // the card's axes as the matrix carries them (scale included): along the twig, up, across
    d.set(e[0], e[1], e[2]);
    up.set(e[4], e[5], e[6]);
    n.set(e[8], e[9], e[10]);
    const depth = Math.min(1, Math.max(0, 0.5 + z / (2 * reach)));
    const high = s.p.y / H;
    const lv = Math.min(LEVELS.length - 1, Math.max(0, Math.round((0.15 + 0.6 * depth + 0.35 * high) * (LEVELS.length - 1))));
    // image (ix, iy) on the hanging card: along the twig with ix / 128, and from 0.11 above it to 0.39 below
    const hang = [d.x / 128, -d.y / 128, -up.x * (0.5 / 80), up.y * (0.5 / 80), s.p.x + up.x * 0.11, s.p.y + up.y * 0.11] as const;
    // on the flat card: across it from -0.31 to +0.31
    const flat = [d.x / 128, -d.y / 128, n.x * (0.62 / 80), -n.y * (0.62 / 80), s.p.x - n.x * 0.31, s.p.y - n.y * 0.31] as const;
    for (const [a, b, c, dd, ex, ey] of [flat, hang]) {
      gLL.setTransform(a * k, b * k, c * k, dd * k, X(ex), Y(ey));
      gLL.drawImage(frond[lv], 0, 0);
      // the cover a pixel fuller all round, so the needles close up instead of letting bark show through as specks
      for (const [ox, oy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        gLA.setTransform(a * k, b * k, c * k, dd * k, X(ex) + ox, Y(ey) + oy);
        gLA.drawImage(white, 0, 0);
      }
    }
  }
  for (const g of [gLL, gLA]) g.setTransform(1, 0, 0, 1, 0, 0);
}

export function paintTreeAtlas(): DataTexture {
  const AW = CW * ATLAS_COLS;
  const AH = CH * ATLAS_ROWS;
  const layers = [0, 1, 2, 3].map(() => {
    const c = document.createElement("canvas");
    c.width = AW;
    c.height = AH;
    const g = c.getContext("2d");
    if (!g) throw new Error("2D canvas unavailable");
    g.fillStyle = "#000";
    g.fillRect(0, 0, AW, AH);
    return g;
  });
  const [gLL, gBL, gLA, gBA] = layers;
  const rr = new Rng(77);
  const grey = (l: number) => `rgb(${l | 0},${l | 0},${l | 0})`;

  SPECIES.forEach((sp, ci) => {
    const ox = (ci % ATLAS_COLS) * CW;
    const oy = Math.floor(ci / ATLAS_COLS) * CH;
    const bx = ox + CW / 2;
    const by = oy + CH - 10;
    const tips: [number, number, number][] = [];
    for (const g of layers) {
      g.save();
      g.beginPath();
      g.rect(ox + 8, oy + 8, CW - 16, CH - 16);
      g.clip();
    }
    const stroke = (g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, col: string) => {
      g.strokeStyle = col;
      g.lineCap = "round";
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x1, y1);
      g.quadraticCurveTo((x1 + x2) / 2 + rr.next() * 8 - 4, (y1 + y2) / 2 + rr.next() * 8 - 4, x2, y2);
      g.stroke();
    };
    const bark = (x1: number, y1: number, x2: number, y2: number, w: number) => {
      stroke(gBL, x1, y1, x2, y2, w, grey(120 + rr.next() * 70));
      stroke(gBA, x1, y1, x2, y2, w, "#fff");
    };
    const clump = (x: number, y: number, r: number, lum: number) => {
      gLL.fillStyle = grey(lum);
      gLL.beginPath();
      gLL.arc(x, y, r, 0, Math.PI * 2);
      gLL.fill();
      gLA.fillStyle = "#fff";
      gLA.beginPath();
      gLA.arc(x, y, r, 0, Math.PI * 2);
      gLA.fill();
    };
    const branch = (x: number, y: number, ang: number, len: number, wid: number, depth: number, P: Branching) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y - Math.sin(ang) * len;
      bark(x, y, x2, y2, wid);
      tips.push([x2, y2, depth]);
      if (depth <= 0 || wid < 0.7) return;
      const n = depth > P.depth - 2 ? P.fork0 : P.fork;
      for (let k = 0; k < n; k++) branch(x2, y2, ang + P.spread * (k - (n - 1) / 2) + rr.next() * 0.5 - 0.25, len * P.ratio * (0.85 + rr.next() * 0.25), wid * 0.66, depth - 1, P);
    };

    if (sp.id === "cedar" || sp.id === "fir" || sp.id === "hemlock") {
      paintConifer(sp.id, layers, bx, by, CH);
    } else if (sp.id === "fern") {
      // sword fern: arching fronds from a crown at the base, leaflets along each
      for (let k = 0; k < 11; k++) {
        const a = -1.1 + (k / 10) * 2.2;
        const ex = bx + Math.sin(a) * 105;
        const ey = by - 60 - Math.cos(a) * 70;
        for (let t = 0.1; t < 1; t += 0.06) {
          const x = bx + (ex - bx) * t;
          const y = by + (ey - by) * t - Math.sin(t * Math.PI) * 40;
          clump(x, y, 9 * (1 - t * 0.6), 120 + rr.next() * 70);
        }
      }
      bark(bx, by, bx, by - 8, 8);
    } else {
      const P = BRANCHING[sp.id];
      if (P) branch(bx, by, Math.PI / 2 + (P.lean ? (rr.next() - 0.5) * P.lean : 0), P.trunk, P.wid, P.depth, P);
      if (sp.id === "plane") {
        for (const [x, y, d] of tips) {
          if (d === 0 && rr.next() < 0.25) {
            gBL.fillStyle = "#9a9a9a";
            gBL.beginPath();
            gBL.arc(x, y + 6, 3, 0, Math.PI * 2);
            gBL.fill();
            gBA.fillStyle = "#fff";
            gBA.beginPath();
            gBA.arc(x, y + 6, 3, 0, Math.PI * 2);
            gBA.fill();
          }
        }
      }
      // leaf clumps around the outer branches, lighter on top; the rhododendron is a dense low dome
      for (const [x, y, d] of tips) {
        if (d > 2) continue;
        const n = sp.id === "cherry" || sp.id === "dogwood" || sp.id === "rhodo" || sp.id === "magnolia" || sp.id === "hornbeam" ? 3 : 2;
        const big = sp.id === "bigleaf" || sp.id === "oak" ? 17 : sp.id === "rhodo" ? 20 : sp.id === "hornbeam" ? 11 : sp.id === "ginkgo" ? 12 : 14;
        for (let k = 0; k < n; k++) clump(x + rr.next() * 24 - 12, y + rr.next() * 18 - 10, 7 + rr.next() * (big - 7), 120 + rr.next() * 80 + (by - y) * 0.25);
      }
    }
    for (const g of layers) g.restore();
  });

  // pack the four greyscale layers into RGBA, rows flipped (DataTexture v = 0 is the first row); outside a layer its
  // luminance is a mid grey so mipmaps do not pull dark halos into the crowns
  const d = layers.map((g) => g.getImageData(0, 0, AW, AH).data);
  const out = new Uint8Array(AW * AH * 4);
  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      const si = (y * AW + x) * 4;
      const di = ((AH - 1 - y) * AW + x) * 4;
      const la = d[2][si];
      const ba = d[3][si];
      out[di] = la > 8 ? d[0][si] : 170;
      out[di + 1] = ba > 8 ? d[1][si] : 150;
      out[di + 2] = la;
      out[di + 3] = ba;
    }
  }
  const t = new DataTexture(out, AW, AH, RGBAFormat);
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
