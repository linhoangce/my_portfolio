/**
 * Where a track lies on the ground (the West Coast Express's, the freight's), its bed must clear the ground as drawn:
 * the terrain's triangles are coarse (6 units, 12 on low-end devices), so a bed laid at the ground's height under its
 * centre is broken through wherever the ground rises across it. These heights lift it just clear across its whole
 * width, smoothed along it so it runs evenly; the bed's shoulders reach down into the ground beside it. Pure.
 */
import { groundAt, surfaceAt } from "./terrain";

/** A polyline resampled every `step` units (its ends kept). */
export function resample(pts: readonly (readonly [number, number])[], step: number): [number, number][] {
  const out: [number, number][] = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= L) {
      out.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]);
      t += step;
    }
    carry = L - (t - step);
  }
  const [lx, lz] = pts[pts.length - 1];
  const [px, pz] = out[out.length - 1];
  if (Math.hypot(lx - px, lz - pz) > step * 0.3) out.push([lx, lz]);
  return out;
}

/**
 * The bed's top at each point: the highest ground (true or as drawn) across `half` either side, and halfway to the
 * next point, plus `lift`; then the highest within three points, averaged over five, so it never dips into the ground.
 */
export function clearHeights(pts: readonly (readonly [number, number])[], half: number, lift: number, lowEnd: boolean): number[] {
  const stride = lowEnd ? 2 : 1;
  const n = pts.length;
  const top = (x: number, z: number) => Math.max(groundAt(x, z), surfaceAt(x, z, stride));
  const raw = pts.map(([x, z], i) => {
    const [ax, az] = pts[Math.max(0, i - 1)];
    const [bx, bz] = pts[Math.min(n - 1, i + 1)];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const rx = -(bz - az) / L;
    const rz = (bx - ax) / L;
    const [nx, nz] = pts[Math.min(n - 1, i + 1)];
    let m = -Infinity;
    for (const u of [0, 0.5]) {
      const cx = x + (nx - x) * u;
      const cz = z + (nz - z) * u;
      for (let l = -half - 0.4; l <= half + 0.41; l += 0.7) m = Math.max(m, top(cx + rx * l, cz + rz * l));
    }
    return m + lift;
  });
  const dilated = raw.map((_, i) => Math.max(...raw.slice(Math.max(0, i - 3), Math.min(n, i + 4))));
  return dilated.map((_, i) => {
    const w = dilated.slice(Math.max(0, i - 2), Math.min(n, i + 3));
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
}

/** A bed's cross-section with its shoulders falling `drop` into the ground beside it (lateral, up; for ribbon()). */
export const bedProfile = (half: number, drop = 2.4): [number, number][] => [
  [half + drop * 0.75, -drop],
  [half, 0],
  [-half, 0],
  [-half - drop * 0.75, -drop],
];
