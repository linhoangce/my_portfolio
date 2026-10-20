/**
 * Façades as one texture array: seventeen families and five roofs, each a layer of a DataArrayTexture. RGB is the
 * painted colour and alpha a tint mask (walls take the building's tint, glass and window frames keep their own
 * colour); a second array holds the lit windows for the night, eight floors by eight bays per layer. Two materials
 * (solid and glass) read both arrays through a small shader patch, so every building in a chunk is one draw call.
 * Client only (canvas).
 */
import {
  Color,
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";

import { Rng } from "../cityModel";

export type FamilyId =
  | "brick"
  | "warehouse"
  | "stucco"
  | "wood"
  | "concrete"
  | "balcony"
  | "glass"
  | "dark"
  | "timber"
  | "green"
  | "diagrid"
  | "solar"
  | "vancouver"
  | "pixel"
  | "fins"
  | "deco"
  | "stone"
  | "roof"
  | "copper"
  | "garden"
  | "shingle"
  | "tile";

/** Bay width and floor height in world units; one albedo tile = 2 bays × 2 floors. */
export const FAMILY: Record<FamilyId, { layer: number; bay: number; floor: number; glass: boolean }> = {
  brick: { layer: 0, bay: 2.6, floor: 2.0, glass: false },
  warehouse: { layer: 1, bay: 3.0, floor: 2.3, glass: false },
  stucco: { layer: 2, bay: 2.4, floor: 1.9, glass: false },
  wood: { layer: 3, bay: 2.0, floor: 1.7, glass: false },
  concrete: { layer: 4, bay: 2.2, floor: 1.7, glass: false },
  balcony: { layer: 5, bay: 2.6, floor: 1.7, glass: false },
  glass: { layer: 6, bay: 2.4, floor: 1.7, glass: true },
  dark: { layer: 7, bay: 2.4, floor: 1.8, glass: true },
  timber: { layer: 8, bay: 2.2, floor: 1.8, glass: false },
  green: { layer: 9, bay: 2.6, floor: 1.9, glass: false },
  diagrid: { layer: 10, bay: 3.2, floor: 1.8, glass: true },
  solar: { layer: 11, bay: 2.4, floor: 1.7, glass: true },
  /** Vancouverism: blue-green glass, a white slab edge at every floor, glass balconies. */
  vancouver: { layer: 12, bay: 2.4, floor: 1.7, glass: true },
  /** Vancouver House's staggered white balcony frames over dark glass. */
  pixel: { layer: 13, bay: 2.6, floor: 1.7, glass: true },
  /** Mass timber: warm vertical fins over glass, a white balcony band at every floor. */
  fins: { layer: 14, bay: 2.2, floor: 1.8, glass: false },
  /** Art Deco terracotta: unbroken piers, recessed spandrels with chevrons. */
  deco: { layer: 15, bay: 2.2, floor: 2.0, glass: false },
  /** Beaux-Arts and Edwardian stone: tall windows under lintels and keystones, sills, coursed joints. */
  stone: { layer: 16, bay: 2.6, floor: 2.1, glass: false },
  roof: { layer: 17, bay: 3, floor: 3, glass: false },
  copper: { layer: 18, bay: 3, floor: 3, glass: false },
  garden: { layer: 19, bay: 3, floor: 3, glass: false },
  shingle: { layer: 20, bay: 3, floor: 3, glass: false },
  tile: { layer: 21, bay: 3, floor: 3, glass: false },
};
const LAYERS = 22;
const FACADE_LAYERS = 17;

type Painter = { g: CanvasRenderingContext2D; m: CanvasRenderingContext2D; S: number; wins: [number, number, number, number][] };

function paintLayer(kind: FamilyId, P: Painter, R: Rng): void {
  const { g, m, S } = P;
  const C = S / 2;
  const k = S / 512;
  const rect = (ctx: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = col;
    ctx.fillRect(x * k, y * k, w * k, h * k);
  };
  const both = (gc: string, mc: string, x: number, y: number, w: number, h: number) => {
    rect(g, gc, x, y, w, h);
    rect(m, mc, x, y, w, h);
  };
  const cells = (fn: (x: number, y: number) => void) => {
    for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) fn(cx * 256, cy * 256);
  };
  const grey = (l: number) => `rgb(${l | 0},${l | 0},${l | 0})`;
  const wall = "#fff";
  const keep = "#000";
  void C;
  if (kind === "brick" || kind === "warehouse") {
    // neutral brick: the per-building tint makes it red, brown, buff or painted
    both(kind === "brick" ? "#d8d2c8" : "#c9c2b6", wall, 0, 0, 512, 512);
    for (let y = 0; y < 512; y += 9) for (let x = (y / 9) % 2 ? 0 : 11; x < 512; x += 22) rect(g, grey(214 * (0.86 + R.next() * 0.22)), x, y, 20, 7);
    cells((x, y) => {
      rect(g, "#f6f2ea", x, y + 244, 256, 12);
      if (kind === "brick") {
        const wx = x + 70;
        const wy = y + 52;
        rect(g, "#fbf8f1", wx - 10, wy + 40, 136, 116);
        g.fillStyle = "#fbf8f1";
        g.beginPath();
        g.arc((wx + 58) * k, (wy + 50) * k, 68 * k, Math.PI, 0);
        g.fill();
        both("#26303b", keep, wx, wy + 50, 116, 100);
        g.fillStyle = "#26303b";
        g.beginPath();
        g.arc((wx + 58) * k, (wy + 50) * k, 58 * k, Math.PI, 0);
        g.fill();
        m.fillStyle = keep;
        m.beginPath();
        m.arc((wx + 58) * k, (wy + 50) * k, 58 * k, Math.PI, 0);
        m.fill();
        rect(g, "#8e7b62", wx + 55, wy, 6, 150);
        rect(g, "#8e7b62", wx, wy + 92, 116, 5);
        P.wins.push([70, 52, 116, 150]);
      } else {
        both("#2a333d", keep, x + 34, y + 40, 188, 170);
        for (let q = 1; q < 4; q++) rect(g, "#6d5e4c", x + 34 + q * 47, y + 40, 4, 170);
        rect(g, "#6d5e4c", x + 34, y + 120, 188, 4);
        rect(g, "#f2eadc", x + 26, y + 210, 204, 10);
        P.wins.push([34, 40, 188, 170]);
      }
    });
  } else if (kind === "stucco") {
    both("#f3efe6", wall, 0, 0, 512, 512);
    cells((x, y) => {
      both("#3a3f46", keep, x + 18, y + 40, 220, 150);
      both("#c8433a", keep, x + 10, y + 32, 236, 10);
      both("#c8433a", keep, x + 10, y + 188, 236, 8);
      for (let q = 0; q < 12; q++) rect(g, "#e9e3d6", x + 22 + q * 18, y + 150, 4, 38);
      rect(g, "#e9e3d6", x + 18, y + 146, 220, 6);
      rect(g, "#5b6a73", x + 60, y + 58, 60, 84);
      rect(g, "#5b6a73", x + 140, y + 58, 60, 84);
      P.wins.push([60, 58, 60, 84], [140, 58, 60, 84]);
    });
  } else if (kind === "wood") {
    both("#f2f0ea", wall, 0, 0, 512, 512);
    for (let y = 0; y < 512; y += 14) rect(g, "rgba(0,0,0,0.10)", 0, y + 11, 512, 3);
    cells((x, y) => {
      both("#fbfaf6", keep, x + 66, y + 50, 124, 160);
      both("#2f3a44", keep, x + 78, y + 62, 100, 136);
      rect(g, "#fbfaf6", x + 125, y + 62, 6, 136);
      rect(g, "#fbfaf6", x + 78, y + 126, 100, 6);
      P.wins.push([78, 62, 100, 136]);
    });
  } else if (kind === "concrete") {
    both("#d7d1c5", wall, 0, 0, 512, 512);
    for (let i = 0; i < 40; i++) rect(g, "rgba(80,70,60,0.05)", R.next() * 512, 0, 6 + R.next() * 10, 512);
    cells((x, y) => {
      both("#323943", keep, x + 40, y + 50, 176, 130);
      rect(g, "#bdb6a8", x + 36, y + 180, 184, 8);
      P.wins.push([40, 50, 176, 130]);
    });
  } else if (kind === "balcony") {
    both("#2e3c4c", keep, 0, 0, 512, 512);
    cells((x, y) => {
      rect(g, "#3c5266", x, y + 30, 256, 150);
      rect(g, "rgba(190,220,235,0.35)", x, y + 120, 256, 60);
      both("#f4f2ec", wall, x, y + 180, 256, 30);
      both("#d4d0c6", wall, x, y + 210, 256, 10);
      rect(g, "#25313d", x + 126, y + 30, 4, 150);
      P.wins.push([0, 30, 126, 150], [130, 30, 126, 150]);
    });
  } else if (kind === "glass") {
    const gr = g.createLinearGradient(0, 0, 512 * k, 512 * k);
    gr.addColorStop(0, "#9cc4d8");
    gr.addColorStop(0.5, "#6f9ab4");
    gr.addColorStop(1, "#8fb6cb");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    rect(m, wall, 0, 0, 512, 512);
    cells((x, y) => {
      both("#4e6d83", "#808080", x, y + 234, 256, 22);
      both("#56778d", keep, x + 126, y, 4, 256);
      both("#56778d", keep, x, y, 3, 256);
      P.wins.push([4, 6, 120, 226], [132, 6, 120, 226]);
    });
  } else if (kind === "dark") {
    both("#27313d", wall, 0, 0, 512, 512);
    cells((x, y) => {
      rect(g, "#1b222b", x, y + 242, 256, 14);
      for (let q = 0; q < 4; q++) both("#3d4855", keep, x + q * 64, y, 3, 256);
      P.wins.push([4, 8, 58, 230], [68, 8, 58, 230], [132, 8, 58, 230], [196, 8, 58, 230]);
    });
  } else if (kind === "timber") {
    both("#7f97a8", keep, 0, 0, 512, 512);
    cells((x, y) => {
      rect(g, "#93abbb", x + 6, y + 20, 244, 180);
      rect(g, "rgba(255,255,255,0.18)", x + 6, y + 20, 244, 60);
      for (let q = 0; q < 5; q++) both("#dcae74", wall, x + q * 52, y, 14, 256);
      both("#cf9f66", wall, x, y + 200, 256, 26);
      rect(g, "#ecc58f", x, y + 200, 256, 6);
      P.wins.push([16, 20, 36, 180], [68, 20, 36, 180], [120, 20, 36, 180], [172, 20, 36, 180]);
    });
  } else if (kind === "green") {
    both("#8a9aa6", keep, 0, 0, 512, 512);
    cells((x, y) => {
      rect(g, "#6f8798", x, y + 30, 256, 140);
      both("#e8e5dc", wall, x, y + 170, 256, 20);
      for (let q = 0; q < 26; q++) {
        const r = 10 + R.next() * 22;
        const l = 0.75 + R.next() * 0.4;
        g.fillStyle = `rgb(${(88 * l) | 0},${(146 * l) | 0},${(70 * l) | 0})`;
        g.beginPath();
        g.arc((x + R.next() * 256) * k, (y + 165 - R.next() * 40) * k, r * k, 0, Math.PI * 2);
        g.fill();
      }
      for (let q = 0; q < 8; q++) rect(g, "rgba(60,110,50,0.9)", x + R.next() * 256, y + 190, 3, 20 + R.next() * 40);
      P.wins.push([10, 34, 110, 100], [136, 34, 110, 100]);
    });
  } else if (kind === "diagrid") {
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, "#3a4b5c");
    gr.addColorStop(1, "#2a3846");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    rect(m, wall, 0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) rect(g, "rgba(160,200,225,0.18)", 0, y, 512, 3);
    for (const ctx of [g, m]) {
      ctx.strokeStyle = ctx === g ? "#eeece6" : keep;
      ctx.lineWidth = 7 * k;
      for (let q = -8; q <= 16; q++) {
        ctx.beginPath();
        ctx.moveTo(q * 64 * k, 0);
        ctx.lineTo((q * 64 + 512) * k, S);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo((q * 64 + 512) * k, 0);
        ctx.lineTo(q * 64 * k, S);
        ctx.stroke();
      }
    }
    cells(() => P.wins.push([40, 40, 48, 48], [168, 40, 48, 48], [40, 168, 48, 48], [168, 168, 48, 48]));
  } else if (kind === "solar") {
    both("#2c3f60", "#505050", 0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) for (let x = 0; x < 512; x += 32) rect(g, (x + y) % 64 ? "#34507a" : "#3a5884", x + 2, y + 2, 28, 28);
    for (let q = 0; q < 512; q += 128) {
      both("#9aa6b8", keep, q, 0, 3, 512);
      both("#9aa6b8", keep, 0, q, 512, 3);
    }
    cells(() => P.wins.push([40, 160, 176, 70]));
  } else if (kind === "vancouver") {
    const gr = g.createLinearGradient(0, 0, 512 * k, 512 * k);
    gr.addColorStop(0, "#86bcc8");
    gr.addColorStop(0.5, "#5d95a8");
    gr.addColorStop(1, "#7db2c2");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    rect(m, wall, 0, 0, 512, 512);
    cells((x, y) => {
      both("#4b7a8c", wall, x + 126, y, 4, 224);
      both("#4b7a8c", wall, x, y, 3, 224);
      rect(g, "rgba(255,255,255,0.12)", x + 8, y + 18, 112, 70);
      // a glass balcony on alternate bays, its white rail cap catching the light
      if ((x + y) % 512 === 0) {
        rect(g, "rgba(214,236,240,0.55)", x + 6, y + 176, 244, 48);
        both("#f3f4f1", keep, x + 6, y + 172, 244, 5);
      }
      both("#f1f2ee", keep, x, y + 224, 256, 32);
      rect(g, "rgba(0,0,0,0.18)", x, y + 252, 256, 4);
      P.wins.push([6, 10, 118, 210], [134, 10, 118, 210]);
    });
  } else if (kind === "pixel") {
    both("#2a3846", keep, 0, 0, 512, 512);
    // floor-high boxes, white frames over dark glass, each floor shifted half a bay from the one below
    for (let row = 0; row < 2; row++) {
      const y = row * 256;
      const off = row ? 128 : 0;
      for (let q = -1; q < 2; q++) {
        const x = off + q * 256;
        both("#eeeeea", wall, x + 8, y + 14, 240, 228);
        rect(g, "rgba(0,0,0,0.28)", x + 8, y + 214, 240, 28);
        both("#2f4152", keep, x + 30, y + 34, 196, 170);
        rect(g, "rgba(170,200,220,0.28)", x + 30, y + 34, 196, 46);
        rect(g, "#d9d8d2", x + 8, y + 14, 240, 6);
      }
    }
    P.wins.push([30, 34, 196, 170]);
  } else if (kind === "fins") {
    both("#c99a5c", wall, 0, 0, 512, 512);
    cells((x, y) => {
      rect(g, "#3f5661", x, y + 30, 256, 168);
      rect(g, "rgba(255,255,255,0.14)", x, y + 30, 256, 52);
      for (let q = 0; q < 10; q++) both(q % 3 ? "#d9a96a" : "#c4914f", wall, x + 4 + q * 26, y + 30, 9, 168);
      // the white balcony band, and a few planters on it
      both("#f5f4ef", keep, x, y + 198, 256, 30);
      rect(g, "rgba(0,0,0,0.2)", x, y + 228, 256, 7);
      for (let q = 0; q < 3; q++) {
        g.fillStyle = q % 2 ? "#5d8a45" : "#6f9a52";
        g.beginPath();
        g.arc((x + 40 + q * 80 + R.next() * 30) * k, (y + 196) * k, (9 + R.next() * 8) * k, Math.PI, 0);
        g.fill();
      }
      P.wins.push([8, 34, 112, 160], [136, 34, 112, 160]);
    });
  } else if (kind === "deco") {
    both("#dcc6a4", wall, 0, 0, 512, 512);
    cells((x, y) => {
      both("#2b333c", keep, x + 56, y + 36, 144, 140);
      rect(g, "#46525e", x + 126, y + 36, 4, 140);
      // the spandrel, with a chevron in relief
      rect(g, "#b99b76", x + 56, y + 176, 144, 80);
      g.strokeStyle = "#e6d3b2";
      g.lineWidth = 5 * k;
      g.beginPath();
      g.moveTo((x + 70) * k, (y + 236) * k);
      g.lineTo((x + 128) * k, (y + 194) * k);
      g.lineTo((x + 186) * k, (y + 236) * k);
      g.stroke();
      // the piers run up unbroken, catching the light on one side
      rect(g, "#ead9bc", x, y, 40, 256);
      rect(g, "rgba(0,0,0,0.12)", x + 40, y, 8, 256);
      rect(g, "rgba(0,0,0,0.08)", x + 200, y, 8, 256);
      P.wins.push([56, 36, 144, 140]);
    });
  } else if (kind === "stone") {
    both("#e2dbcc", wall, 0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) rect(g, "rgba(90,70,40,0.07)", 0, y, 512, 3);
    for (let y = 0; y < 512; y += 32) for (let x = (y / 32) % 2 ? 0 : 40; x < 512; x += 80) rect(g, "rgba(90,70,40,0.05)", x, y, 3, 32);
    cells((x, y) => {
      both("#2a3139", keep, x + 80, y + 58, 96, 150);
      rect(g, "#5b6670", x + 126, y + 58, 4, 150);
      rect(g, "#5b6670", x + 80, y + 124, 96, 4);
      // lintel and keystone above, sill below
      rect(g, "#f3ede1", x + 70, y + 44, 116, 14);
      rect(g, "#f3ede1", x + 120, y + 34, 16, 24);
      rect(g, "#f3ede1", x + 72, y + 208, 112, 10);
      rect(g, "rgba(0,0,0,0.14)", x + 72, y + 218, 112, 5);
      P.wins.push([80, 58, 96, 150]);
    });
  } else if (kind === "roof") {
    both("#8a8c8d", wall, 0, 0, 512, 512);
    for (let i = 0; i < 900; i++) rect(g, `rgba(0,0,0,${R.next() * 0.08})`, R.next() * 512, R.next() * 512, 4, 4);
  } else if (kind === "copper") {
    both("#5e9b86", wall, 0, 0, 512, 512);
    for (let y = 0; y < 512; y += 24) rect(g, "rgba(30,70,60,0.35)", 0, y, 512, 3);
    for (let i = 0; i < 400; i++) rect(g, `rgba(160,210,190,${R.next() * 0.2})`, R.next() * 512, R.next() * 512, 10, 3);
  } else if (kind === "garden") {
    both("#5d8a4a", "#404040", 0, 0, 512, 512);
    for (let i = 0; i < 420; i++) {
      const l = 0.7 + R.next() * 0.5;
      g.fillStyle = `rgb(${(80 * l) | 0},${(128 * l) | 0},${(64 * l) | 0})`;
      g.beginPath();
      g.arc(R.next() * S, R.next() * S, (6 + R.next() * 16) * k, 0, Math.PI * 2);
      g.fill();
    }
    rect(g, "#cbbf9f", 0, 240, 512, 18);
    rect(g, "#cbbf9f", 240, 0, 18, 512);
  } else if (kind === "shingle") {
    both("#7a7f88", wall, 0, 0, 512, 512);
    for (let y = 0; y < 512; y += 22) for (let x = (y / 22) % 2 ? 0 : 18; x < 512; x += 36) rect(g, `rgba(0,0,0,${0.05 + R.next() * 0.1})`, x, y, 34, 3);
  } else if (kind === "tile") {
    both("#2f7d5a", "#404040", 0, 0, 512, 512);
    for (let x = 0; x < 512; x += 22) rect(g, "rgba(0,0,0,0.25)", x, 0, 5, 512);
  }
}

export type FacadeArrays = { albedo: DataArrayTexture; emissive: DataArrayTexture };

/** Paints every layer; 512 px per layer on desktop, 256 on the low-end budget. */
export function paintFacadeArrays(lowEnd: boolean): FacadeArrays {
  const S = lowEnd ? 256 : 512;
  const E = lowEnd ? 256 : 512;
  const R = new Rng(2100);
  const albedo = new Uint8Array(S * S * 4 * LAYERS);
  const emissive = new Uint8Array(E * E * 4 * LAYERS);
  const mk = (w: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = w;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    return ctx;
  };
  const g = mk(S);
  const m = mk(S);
  const e = mk(E);
  const warm = ["#ffd9a0", "#ffe8c2", "#fff3d6", "#dce8ff", "#ffcf8a"];
  (Object.keys(FAMILY) as FamilyId[]).forEach((kind) => {
    const L = FAMILY[kind].layer;
    g.clearRect(0, 0, S, S);
    m.fillStyle = "#000";
    m.fillRect(0, 0, S, S);
    const P: Painter = { g, m, S, wins: [] };
    paintLayer(kind, P, R);
    const gd = g.getImageData(0, 0, S, S).data;
    const md = m.getImageData(0, 0, S, S).data;
    for (let i = 0; i < S * S; i++) {
      const o = (L * S * S + i) * 4;
      albedo[o] = gd[i * 4];
      albedo[o + 1] = gd[i * 4 + 1];
      albedo[o + 2] = gd[i * 4 + 2];
      albedo[o + 3] = md[i * 4];
    }
    // lit windows: the albedo's window rects on an 8 × 8 grid of half-size cells
    e.fillStyle = "#000";
    e.fillRect(0, 0, E, E);
    if (L < FACADE_LAYERS) {
      const share = kind === "dark" ? 0.4 : kind === "warehouse" ? 0.45 : kind === "pixel" || kind === "vancouver" ? 0.38 : 0.32;
      const ke = E / 1024;
      for (let cy = 0; cy < 8; cy++) {
        for (let cx = 0; cx < 8; cx++) {
          for (const [wx, wy, ww, wh] of P.wins.slice(0, 4)) {
            if (R.next() < share) {
              e.fillStyle = warm[Math.floor(R.next() * warm.length)];
              e.globalAlpha = 0.65 + R.next() * 0.35;
              e.fillRect((cx * 128 + wx / 2 + 1) * ke, (cy * 128 + wy / 2 + 1) * ke, (ww / 2 - 2) * ke, (wh / 2 - 2) * ke);
            }
          }
        }
      }
      e.globalAlpha = 1;
      if (kind === "diagrid") {
        e.strokeStyle = "rgba(170,200,255,0.45)";
        e.lineWidth = 2 * ke;
        for (let q = -16; q <= 16; q++) {
          e.beginPath();
          e.moveTo(q * 64 * ke, 0);
          e.lineTo((q * 64 + 1024) * ke, E);
          e.stroke();
        }
      }
    }
    const ed = e.getImageData(0, 0, E, E).data;
    emissive.set(ed, L * E * E * 4);
  });
  const make = (data: Uint8Array, size: number) => {
    const t = new DataArrayTexture(data, size, size, LAYERS);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: make(albedo, S), emissive: make(emissive, E) };
}

export type BuildingMaterials = {
  solid: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  /** Crown lights: their emissive colours follow the Vancouver event. */
  crownA: MeshStandardMaterial;
  crownB: MeshStandardMaterial;
  dome: MeshPhysicalMaterial;
  /** Neon signs (Woodward's W, Chinatown blades): always red, glowing at night. */
  neon: MeshStandardMaterial;
  /** Instanced houses: the same arrays, roofs tinted per instance by aTint2. */
  house: MeshStandardMaterial;
};

/** Patch a standard material to read the arrays by the per-vertex layer, tinting only where the mask allows. */
function patch(mat: MeshStandardMaterial, arrays: FacadeArrays, house = false): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFacade = { value: arrays.albedo };
    sh.uniforms.uFacadeE = { value: arrays.emissive };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aLayer;\nattribute vec3 aTint;\n${house ? "attribute vec3 aTint2;\n" : ""}varying float vLayer;\nvarying vec3 vTint;\nvarying vec2 vFUv;`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>\nvLayer = aLayer;\nvTint = ${house ? "aLayer > 16.5 ? aTint2 : aTint" : "aTint"};\nvFUv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nprecision highp sampler2DArray;\nuniform sampler2DArray uFacade;\nuniform sampler2DArray uFacadeE;\nvarying float vLayer;\nvarying vec3 vTint;\nvarying vec2 vFUv;",
      )
      .replace(
        "#include <map_fragment>",
        "vec4 fTex = texture(uFacade, vec3(vFUv, floor(vLayer + 0.5)));\ndiffuseColor.rgb *= fTex.rgb * mix(vec3(1.0), vTint, fTex.a);",
      )
      .replace(
        "#include <emissivemap_fragment>",
        "totalEmissiveRadiance *= texture(uFacadeE, vec3(vFUv * 0.25, floor(vLayer + 0.5))).rgb;",
      );
  };
  mat.customProgramCacheKey = () => (house ? "facade-array-house" : "facade-array");
}

export function createBuildingMaterials(arrays: FacadeArrays, envTex: Texture): BuildingMaterials {
  const solid = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, emissive: 0xffffff, emissiveIntensity: 0 });
  const glass = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.28, emissive: 0xffffff, emissiveIntensity: 0, envMap: envTex, envMapIntensity: 0.5 });
  const house = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, emissive: 0xffffff, emissiveIntensity: 0 });
  patch(solid, arrays);
  patch(glass, arrays);
  patch(house, arrays, true);
  return {
    solid,
    glass,
    crownA: new MeshStandardMaterial({ color: 0x20242c, emissive: new Color(0xa78bfa), emissiveIntensity: 0, roughness: 0.4 }),
    crownB: new MeshStandardMaterial({ color: 0x20242c, emissive: new Color(0x6ee7f9), emissiveIntensity: 0, roughness: 0.4 }),
    dome: new MeshPhysicalMaterial({ color: 0xd8eef5, roughness: 0.08, transparent: true, opacity: 0.38, envMap: envTex, envMapIntensity: 1, side: 2, emissive: 0x9fe0c0, emissiveIntensity: 0, depthWrite: false }),
    neon: new MeshStandardMaterial({ color: 0x5a1010, emissive: 0xff2a2a, emissiveIntensity: 0.4, roughness: 0.4 }),
    house,
  };
}
