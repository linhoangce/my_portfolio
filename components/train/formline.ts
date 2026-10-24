/**
 * The elements of Coast Salish–inspired formline, drawn on the unit square: ovoids, eyes, U-forms, trigons and a
 * salmon built of them. The culture atlas (cultureArt.ts) and the city's murals (muralArt.ts) both draw with them.
 */
export const BLACK = "#15110e";
export const RED = "#b3261e";

/** An ovoid: a rounded, slightly squared oval, its top fuller than its base. */
export function ovoid(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, col: string): void {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(cx - w / 2, cy + h * 0.1);
  g.bezierCurveTo(cx - w / 2, cy - h * 0.75, cx + w / 2, cy - h * 0.75, cx + w / 2, cy + h * 0.1);
  g.bezierCurveTo(cx + w / 2, cy + h * 0.55, cx + w * 0.12, cy + h * 0.38, cx, cy + h * 0.38);
  g.bezierCurveTo(cx - w * 0.12, cy + h * 0.38, cx - w / 2, cy + h * 0.55, cx - w / 2, cy + h * 0.1);
  g.closePath();
  g.fill();
}

/** An eye: an ovoid in ink, a pale inner ovoid and a pupil, looking along dir (-1 left, 1 right). */
export function eye(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, bg: string, dir = 0, ink = BLACK): void {
  ovoid(g, cx, cy, w, w * 0.62, ink);
  ovoid(g, cx, cy + w * 0.02, w * 0.72, w * 0.42, bg);
  g.fillStyle = ink;
  g.beginPath();
  g.ellipse(cx + dir * w * 0.12, cy + w * 0.02, w * 0.17, w * 0.15, 0, 0, Math.PI * 2);
  g.fill();
}

/** A U-form: a broad U, its arms tapering, `t` thick. */
export function uform(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, t: number, col: string, rot = 0): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-w / 2, -h / 2);
  g.bezierCurveTo(-w / 2, h * 0.75, w / 2, h * 0.75, w / 2, -h / 2);
  g.lineTo(w / 2 - t * 0.6, -h / 2);
  g.bezierCurveTo(w / 2 - t, h * 0.75 - t * 1.6, -w / 2 + t, h * 0.75 - t * 1.6, -w / 2 + t * 0.6, -h / 2);
  g.closePath();
  g.fill();
  g.restore();
}

/** A trigon: a small curved-sided triangle cut out between forms. */
export function trigon(g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, rot = 0): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-s / 2, s / 3);
  g.quadraticCurveTo(0, s * 0.1, 0, -s / 2);
  g.quadraticCurveTo(0, s * 0.1, s / 2, s / 3);
  g.quadraticCurveTo(0, s * 0.2, -s / 2, s / 3);
  g.fill();
  g.restore();
}

/** A salmon in formline, nose along +x, centred at (x, y), `len` long, on a background `bg`. */
export function salmon(g: CanvasRenderingContext2D, x: number, y: number, len: number, rot: number, bg: string, body = BLACK, accent = RED): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(len, len);
  g.translate(-0.5, 0);
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(1.0, 0.02);
  g.quadraticCurveTo(0.92, -0.17, 0.62, -0.18);
  g.quadraticCurveTo(0.3, -0.17, 0.14, -0.05);
  g.lineTo(0.0, -0.16);
  g.quadraticCurveTo(0.06, 0, 0.0, 0.16);
  g.lineTo(0.14, 0.05);
  g.quadraticCurveTo(0.3, 0.16, 0.62, 0.17);
  g.quadraticCurveTo(0.92, 0.17, 1.0, 0.02);
  g.closePath();
  g.fill();
  // the body's inner space, the spine's ovoids, the gill and the fins
  ovoid(g, 0.5, 0.0, 0.5, 0.2, bg);
  ovoid(g, 0.38, 0.0, 0.18, 0.09, accent);
  ovoid(g, 0.6, 0.0, 0.18, 0.09, accent);
  uform(g, 0.76, 0.0, 0.1, 0.22, 0.03, accent, -Math.PI / 2);
  eye(g, 0.86, -0.03, 0.09, bg, 1, body);
  trigon(g, 0.52, -0.2, 0.12, accent, 0);
  trigon(g, 0.5, 0.2, 0.1, accent, Math.PI);
  trigon(g, 0.09, 0.0, 0.06, bg, -Math.PI / 2);
  g.restore();
}
