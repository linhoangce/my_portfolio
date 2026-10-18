import { ExtrudeGeometry, Shape } from "three";

/** A rounded-rectangle profile extruded along z with a small bevel: the train car body. */
export function roundedBox(w: number, h: number, d: number, r: number): ExtrudeGeometry {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return g;
}
