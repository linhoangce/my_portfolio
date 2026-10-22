"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, type BufferGeometry, CylinderGeometry, Group, type Material, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";

import { merged, type Part } from "./merge";
import { MILL_LINE } from "./rail";
import { rib, vault } from "./Stations";
import { frameAt, groundAt, makeFrame, stationS, UP } from "./track";
import { useWorld } from "./world";

const at = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];

/** A round strut from a to b (radius r), as a positioned geometry. */
function strut(a: Vector3, b: Vector3, r: number): Part {
  const d = b.clone().sub(a);
  const geo = new CylinderGeometry(r, r, d.length(), 6);
  geo.applyQuaternion(new Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  return { geo, position: at(a.clone().add(b).multiplyScalar(0.5)) };
}

/** A slab of thickness t from a to b (centre-line ends), w wide, its width kept level. */
function ramp(a: Vector3, b: Vector3, w: number, t: number): Part {
  const d = b.clone().sub(a);
  const L = d.length();
  const geo = new BoxGeometry(w, t, L);
  geo.rotateX(-Math.atan2(d.y, Math.hypot(d.x, d.z)));
  geo.rotateY(Math.atan2(d.x, d.z));
  return { geo, position: at(a.clone().add(b).multiplyScalar(0.5)) };
}

/**
 * Commercial–Broadway, the line's busiest interchange, built as one station. The Expo's platforms straddle Broadway
 * under a great glass roof on a timber frame, carried on branching columns and reaching well out past both platform
 * ends, its eaves planted. North of Broadway, on the Grandview Cut's rim, a glass concourse at street level looks down
 * on the Millennium's platform: escalators run down to it and glass lifts rise from it into both Expo platforms
 * overhead. South of Broadway a ticket hall under the platforms, with escalators up to each. Solar modules cover the
 * roof over the platforms; over the tracks it stays solar-control glass.
 */
export function Hub() {
  const world = useWorld();
  const { mats, lowEnd } = world;
  // solar-control glass: a light grey-green tint that keeps the sun's heat and glare off the platforms
  const glass = useMemo(() => {
    const m = mats.pane.clone();
    m.color.set(0xa9c2c4);
    m.opacity = 0.4;
    return m;
  }, [mats]);
  const solarMat = useMemo(() => new MeshStandardMaterial({ color: 0x1d2c4a, metalness: 0.45, roughness: 0.28, envMap: world.envTex, envMapIntensity: 0.8 }), [world.envTex]);

  const built = useMemo(() => {
    const f = makeFrame();
    frameAt(stationS[5], f);
    const tH = f.t.clone().setY(0).normalize();
    // the Expo station's frame: x left of travel, y up from the rails, z ahead
    const E = (x: number, y: number, z: number) => f.p.clone().addScaledVector(f.r, -x).addScaledVector(tH, z).addScaledVector(UP, y);
    const ry = Math.atan2(tH.x, tH.z);
    const pane: Part[] = [];
    const timber: Part[] = [];
    const white: Part[] = [];
    const green: Part[] = [];
    const lamp: Part[] = [];
    const steel: Part[] = [];
    /** A box in the Expo frame. */
    const boxE = (list: Part[], w: number, h: number, d: number, x: number, y: number, z: number) => list.push({ geo: new BoxGeometry(w, h, d).rotateY(ry), position: at(E(x, y, z)) });

    // ------------------------------------------------------------------ the great roof
    const RW = 34;
    const RISE = 4.5;
    const BASE = 6.6;
    const LEN = 52;
    const roofY = (x: number) => BASE + RISE * (1 - (x / (RW / 2)) ** 2);
    const shell = (g: BufferGeometry) => g.rotateY(ry).translate(f.p.x, f.p.y, f.p.z);
    pane.push({ geo: shell(vault(RW, RISE, LEN, BASE, lowEnd ? 14 : 22, lowEnd ? 8 : 14)) });
    for (let z = -LEN / 2; z <= LEN / 2 + 0.01; z += lowEnd ? 4 : 2.6) timber.push({ geo: shell(rib(RW, RISE, BASE + 0.02, z, 0.15)) });
    for (let u = -0.9; u <= 0.91; u += 0.3) boxE(timber, 0.22, 0.22, LEN, (u * RW) / 2, roofY((u * RW) / 2) - 0.12, 0);
    // solar modules over the platforms, following the vault's curve and shading them; the glass stays open over the
    // tracks in the middle
    const solar: Part[] = [];
    for (const side of [1, -1]) {
      for (let a = 7.8; a < RW / 2 - 0.5; a += 1.45) {
        const x = side * (a + 0.65);
        const tilt = Math.atan((-2 * RISE * x) / (RW / 2) ** 2);
        for (let z = -LEN / 2 + 1.1; z < LEN / 2 - 1; z += 2.05) solar.push({ geo: new BoxGeometry(1.3, 0.07, 1.95).rotateZ(tilt).rotateY(ry), position: at(E(x, roofY(x) + 0.1, z)) });
      }
    }
    for (const side of [1, -1]) {
      // planted eaves, and the lights along under the crown
      boxE(green, 1.3, 0.55, LEN, side * (RW / 2 - 0.3), BASE - 0.1, 0);
      boxE(lamp, 0.12, 0.08, LEN - 8, side * 5, roofY(5) - 0.5, 0);
      // branching columns on the platforms: a trunk, then four limbs up into the roof
      for (const z of [-9, 0, 9]) {
        const foot = E(side * 11.1, 1.4, z);
        const knot = E(side * 11.1, 6.2, z);
        white.push(strut(foot, knot, 0.3));
        for (const [dx, dz] of [
          [-3.4, 0],
          [3.6, 0],
          [0, -3],
          [0, 3],
        ]) {
          const x = side * 11.1 + dx;
          white.push(strut(knot, E(x, roofY(x) - 0.15, z + dz), 0.14));
        }
      }
    }

    // ------------------------------------------------------------------ south of Broadway: the ticket hall
    {
      const c = E(0, 0, 10);
      const g = groundAt(c.x, c.z) - f.p.y;
      const H = 4.4;
      boxE(white, 20.6, 0.4, 10.6, 0, g + H, 10.5);
      boxE(green, 19.6, 0.3, 9.6, 0, g + H + 0.35, 10.5);
      boxE(pane, 20, H, 0.08, 0, g + H / 2, 5.4);
      boxE(pane, 20, H, 0.08, 0, g + H / 2, 15.6);
      for (const side of [1, -1]) boxE(pane, 0.08, H, 10.2, side * 10, g + H / 2, 10.5);
      for (let x = -9; x <= 9.01; x += 2.25) for (const z of [5.4, 15.6]) boxE(timber, 0.18, H, 0.18, x, g + H / 2, z);
      // an entrance canopy over the sidewalk, toward Broadway
      boxE(white, 14, 0.25, 3.2, 0, g + 3.6, 3.9);
      boxE(lamp, 10, 0.06, 0.1, 0, g + 3.45, 3.9);
      // escalators up to each platform, outside its edge, and a landing onto it
      for (const side of [1, -1]) {
        const x = side * 12.9;
        white.push(ramp(E(x, g + 0.2, 18.5), E(x, 1.3, 6.5), 1.8, 0.35));
        for (const o of [-0.95, 0.95]) pane.push(ramp(E(x + o, g + 0.8, 18.5), E(x + o, 1.9, 6.5), 0.06, 1.1));
        boxE(white, 2.4, 0.3, 2.6, side * 12.3, 1.25, 5.4);
      }
    }

    // ------------------------------------------------------------------ north of Broadway: the concourse over the Millennium
    {
      const k = MILL_LINE.stations.findIndex((s) => /Commercial/.test(s.name));
      const ms = MILL_LINE.stationS[k];
      const mp = MILL_LINE.curve.getPointAt(ms / MILL_LINE.len);
      const mt = MILL_LINE.curve.getTangentAt(ms / MILL_LINE.len).setY(0).normalize();
      // the Millennium's frame: x left of travel (north), z ahead (east)
      const mr = mt.clone().cross(UP).normalize();
      const M = (x: number, y: number, z: number) => mp.clone().addScaledVector(mr, -x).addScaledVector(mt, z).addScaledVector(UP, y);
      const mry = Math.atan2(mt.x, mt.z);
      const boxM = (list: Part[], w: number, h: number, d: number, x: number, y: number, z: number) => list.push({ geo: new BoxGeometry(w, h, d).rotateY(mry), position: at(M(x, y, z)) });
      // the rim beyond the south platform (12.5 to 18 out), at the street's height
      const rim = M(-15, 0, 0);
      const G = groundAt(rim.x, rim.z) - mp.y;
      const X = -15.3;
      boxM(white, 6.2, 0.6, 28, X, G - 0.3, 0);
      boxM(pane, 0.08, 1.1, 28, X + 3.05, G + 0.55, 0);
      // the hall on it: glass on three sides, open to the sidewalk, a planted roof
      const HH = 4.2;
      boxM(white, 6.6, 0.35, 28.4, X, G + HH, 0);
      boxM(green, 5.8, 0.3, 27.6, X, G + HH + 0.32, 0);
      boxM(pane, 0.08, HH, 28, X + 3.1, G + HH / 2 + 1.1, 0);
      for (const z of [-14, 14]) boxM(pane, 6.2, HH, 0.08, X, G + HH / 2, z);
      for (let z = -13; z <= 13.01; z += 2.6) boxM(timber, 0.18, HH, 0.18, X + 3.1, G + HH / 2, z);
      boxM(lamp, 0.1, 0.06, 24, X + 1.5, G + HH - 0.12, 0);
      // escalators down to the platform (its middle 8.9 out, its top 1.4 up), each from a landing off the hall
      for (const [x, z0, z1] of [
        [-8.2, 9, -3],
        [-9.6, 9, -3],
      ] as const) {
        white.push(ramp(M(x, G - 0.15, z0), M(x, 1.3, z1), 1.25, 0.35));
        for (const o of [-0.6, 0.6]) pane.push(ramp(M(x + o, G + 0.5, z0), M(x + o, 1.95, z1), 0.05, 1.1));
      }
      boxM(white, 3.6, 0.35, 3.4, -10.4, G - 0.2, 10.6);
      // glass lifts from the hall straight up into the Expo's platforms overhead, where one passes over it
      for (const side of [1, -1]) {
        for (let z = -13; z <= 13; z += 0.5) {
          const w = M(X + 0.6, 0, z);
          // in the Expo frame: along and lateral
          const dx = w.x - f.p.x;
          const dz = w.z - f.p.z;
          const a = dx * tH.x + dz * tH.z;
          const l = -(dx * f.r.x + dz * f.r.z);
          if (Math.abs(l - side * 8.9) > 0.3 || a > -6 || a < -13) continue;
          const top = f.p.y + 1.4;
          const base = mp.y + G;
          pane.push({ geo: new BoxGeometry(2.6, top - base, 2.6).rotateY(ry), position: [w.x, (top + base) / 2, w.z] });
          for (const [ox, oz] of [
            [-1.3, -1.3],
            [1.3, -1.3],
            [-1.3, 1.3],
            [1.3, 1.3],
          ]) {
            const c = E(l + ox, 0, a + oz);
            steel.push({ geo: new BoxGeometry(0.12, top - base, 0.12), position: [c.x, (top + base) / 2, c.z] });
          }
          break;
        }
      }
    }

    const g = new Group();
    const meshes: [Part[], Material, boolean][] = [
      [white, mats.plat, true],
      [timber, mats.timber, true],
      [green, mats.roofGreen, false],
      [steel, mats.canopy, false],
      [lamp, mats.lamp, false],
      [solar, solarMat, true],
      [pane, glass, false],
    ];
    for (const [parts, mat, cast] of meshes) {
      if (!parts.length) continue;
      const m = new Mesh(merged(parts), mat);
      m.castShadow = cast && !lowEnd;
      m.receiveShadow = mat !== glass && mat !== mats.lamp;
      g.add(m);
    }
    return g;
  }, [mats, lowEnd, glass, solarMat]);

  useEffect(
    () => () => {
      built.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
    [built],
  );
  useEffect(
    () => () => {
      glass.dispose();
      solarMat.dispose();
    },
    [glass, solarMat],
  );

  return <primitive object={built} />;
}
