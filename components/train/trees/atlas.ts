/**
 * The tree atlas: twelve species painted on canvas in a 4 × 3 grid of 256 × 320 cells, channel-packed so one texture
 * carries both layers: R leaf luminance, G bark luminance, B leaf cover, A bark cover. Deciduous species get a full
 * branch skeleton (recursive branching, species by species) under their leaf clumps, so a bare winter crown shows its
 * real silhouette. Client only (canvas).
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat } from "three";

import { Rng } from "../cityModel";
import { SPECIES, type SpeciesId } from "./species";

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 3;
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
};

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
      // conifers: a straight trunk and tiers of fronds (drooping sprays for cedar and hemlock, stiff tiers for fir)
      const trunkW = sp.id === "cedar" ? 14 : 11;
      bark(bx, by, bx, oy + 40, trunkW);
      const tiers = sp.id === "fir" ? 13 : 11;
      for (let t = 0; t < tiers; t++) {
        const u = t / (tiers - 1);
        const y0 = oy + 34 + u * (CH - 90);
        const w = (sp.id === "cedar" ? 24 : sp.id === "hemlock" ? 20 : 16) + u * (sp.id === "cedar" ? 92 : sp.id === "hemlock" ? 86 : 80);
        const lum = 110 + (1 - u) * 70 + rr.next() * 30;
        const nod = sp.id === "hemlock" && t === 0 ? 14 : 0; // hemlock's nodding leader
        for (const g of [gLL, gLA]) {
          g.fillStyle = g === gLL ? grey(lum) : "#fff";
          g.beginPath();
          g.moveTo(bx + nod, y0 - 18);
          for (let k = 0; k <= 16; k++) {
            const s = k / 16;
            const droop = sp.id === "fir" ? 12 : 8 * Math.sin(s * Math.PI) + 26 * Math.abs(s - 0.5);
            g.lineTo(bx - w + 2 * w * s, y0 + droop + (k % 2 ? 10 : 0) + rr.next() * 6);
          }
          g.closePath();
          g.fill();
        }
      }
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
        const n = sp.id === "cherry" || sp.id === "dogwood" || sp.id === "rhodo" ? 3 : 2;
        const big = sp.id === "bigleaf" ? 17 : sp.id === "rhodo" ? 20 : 14;
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
