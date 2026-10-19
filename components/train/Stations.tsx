"use client";

import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  TubeGeometry,
  Vector3,
} from "three";

import { stations } from "@/data";

import { merged, type Part } from "./merge";
import { doorLabel, paintDoorLabel, signFonts } from "./textures";
import { frameAt, groundAt, makeFrame, stationS } from "./track";
import { useWorld } from "./world";

type Canopy = "grid" | "leaf" | "living" | "ribbed";
/** One of four canopies per stop: timber gridshell, glass leaf, living roof, ribbed arch. */
const CANOPY: Canopy[] = ["grid", "living", "ribbed", "leaf", "grid", "living", "leaf", "ribbed", "grid", "living"];

/** A parabolic vault `w` wide rising `rise` above `base`, `len` long, as an open sheet. */
function vault(w: number, rise: number, len: number, base: number, nu = 18, nz = 8): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      pos.push((u * w) / 2, base + rise * (1 - u * u), (j / nz - 0.5) * len);
      uv.push(i / nu, j / nz);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A rib following the same parabola, as a tube. */
const rib = (w: number, rise: number, base: number, z: number, r: number): BufferGeometry => {
  const pts: Vector3[] = [];
  for (let k = 0; k <= 20; k++) {
    const u = (k / 20) * 2 - 1;
    pts.push(new Vector3((u * w) / 2, base + rise * (1 - u * u), z));
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), 24, r, 5, false);
};

const at = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

/**
 * The 2100 station kit on both side platforms: white decks on slender columns, glowing edges, full-height platform
 * screen doors with a light line and the stop's name on their top rail, one of four canopies, lamp strips, and a glass
 * lift with a bridge down to the street on the left. No fascia board: the station is the scene. One mesh per
 * material per station.
 */
export function Stations() {
  const world = useWorld();
  const { mats, lowEnd } = world;

  const built = useMemo(() => {
    mats.edge.length = 0;
    const fonts = signFonts();
    const f = makeFrame();
    const labels: { canvas: HTMLCanvasElement; texture: { needsUpdate: boolean }; index: number }[] = [];
    const groups = stations.map((st, i) => {
      frameAt(stationS[i], f);
      const g = new Group();
      g.position.copy(f.p);
      const tH = f.t.clone().setY(0).normalize();
      g.lookAt(f.p.clone().add(tH));
      // local +x = left of the track, +z = ahead; platforms at x ±8.9, top at y 1.4
      const local = (x: number, z: number) => f.p.clone().addScaledVector(f.r, -x).addScaledVector(tH, z);
      const dropTo = (x: number, z: number) => {
        const w = local(x, z);
        return f.p.y - groundAt(w.x, w.z);
      };
      const white: Part[] = [];
      const edgeP: Part[] = [];
      const pane: Part[] = [];
      const steel: Part[] = [];
      const ribs: Part[] = [];
      const timber: Part[] = [];
      const green: Part[] = [];
      const lamps: Part[] = [];
      const bannerA: Part[] = [];
      const bannerB: Part[] = [];
      for (const side of [1, -1]) {
        white.push({ geo: new BoxGeometry(5.2, 0.9, 27), position: at(side * 8.9, 0.95, 0) });
        for (const z of [-9, 0, 9]) {
          const d = dropTo(side * 10, z);
          if (d > 1.2) white.push({ geo: new CylinderGeometry(0.35, 0.5, d + 0.5, 10), position: at(side * 10, (0.5 - d) / 2, z) });
        }
        edgeP.push({ geo: new BoxGeometry(0.16, 0.05, 26.4), position: at(side * 6.38, 1.42, 0) });
        edgeP.push({ geo: new BoxGeometry(0.14, 0.1, 26), position: at(side * 6.62, 3.85, 0) });
        pane.push({ geo: new BoxGeometry(0.05, 2.3, 26), position: at(side * 6.62, 2.6, 0) });
        for (let z = -13; z <= 13.01; z += 2.6) steel.push({ geo: new BoxGeometry(0.12, 2.5, 0.12), position: at(side * 6.62, 2.65, z) });
        steel.push({ geo: new BoxGeometry(0.16, 0.22, 26.2), position: at(side * 6.62, 4.0, 0) });
        // a banner pole at each platform end, flying the event's colours
        for (const z of [-12.6, 12.6]) {
          steel.push({ geo: new CylinderGeometry(0.07, 0.07, 4.6, 6), position: at(side * 11.1, 3.7, z) });
          steel.push({ geo: new BoxGeometry(0.06, 0.06, 1.1), position: at(side * 11.1, 5.85, z - Math.sign(z) * 0.55) });
          (z < 0 ? bannerA : bannerB).push({ geo: new PlaneGeometry(1.0, 2.2), position: at(side * 11.1, 4.7, z - Math.sign(z) * 0.6), rotation: [0, Math.PI / 2, 0] });
        }
      }
      const canopy = CANOPY[i % CANOPY.length];
      if (canopy === "grid") {
        // a timber gridshell vaulting both tracks, its feet on the platforms' outer edges
        pane.push({ geo: vault(23, 8.5, 27, 1.4) });
        for (let z = -13.5; z <= 13.51; z += 2.25) timber.push({ geo: rib(23, 8.5, 1.42, z, 0.14) });
        for (let u = -0.8; u <= 0.81; u += 0.2) timber.push({ geo: new BoxGeometry(0.22, 0.22, 27), position: at(u * 11.5, 1.4 + 8.5 * (1 - u * u) - 0.12, 0) });
        for (const side of [1, -1]) for (const z of [-7, 7]) lamps.push({ geo: new BoxGeometry(0.12, 0.08, 10), position: at(side * 8.6, 4.6, z) });
      } else if (canopy === "leaf") {
        // a glass leaf on white ribs, held up by branching columns
        pane.push({ geo: vault(25, 3.2, 30, 6.4) });
        for (let z = -14; z <= 14.01; z += 3.5) ribs.push({ geo: rib(25, 3.2, 6.38, z, 0.09) });
        for (const side of [1, -1]) {
          for (const z of [-10, 0, 10]) {
            // a slim trunk flaring into a disc just under the glass
            ribs.push({ geo: new CylinderGeometry(0.16, 0.24, 5, 8), position: at(side * 11.6, 3.9, z) });
            ribs.push({ geo: new CylinderGeometry(1.1, 0.2, 0.42, 12), position: at(side * 11.6, 6.6, z) });
          }
          lamps.push({ geo: new BoxGeometry(0.12, 0.08, 24), position: at(side * 9.6, 7.3, 0) });
        }
      } else if (canopy === "living") {
        // a planted roof over each platform on timber columns, open over the tracks
        for (const side of [1, -1]) {
          timber.push({ geo: new BoxGeometry(6.8, 0.35, 27), position: at(side * 9.2, 6.4, 0) });
          green.push({ geo: new BoxGeometry(6.5, 0.4, 26.6), position: at(side * 9.2, 6.75, 0) });
          for (const z of [-10, 0, 10]) timber.push({ geo: new BoxGeometry(0.4, 4.9, 0.4), position: at(side * 11.2, 3.85, z) });
          lamps.push({ geo: new BoxGeometry(0.12, 0.08, 24), position: at(side * 7.4, 6.18, 0) });
        }
      } else {
        // a ribbed arch: white ribs over everything with a glass spine along the crown
        for (let z = -13; z <= 13.01; z += 2.0) ribs.push({ geo: rib(23, 8, 1.42, z, 0.17) });
        pane.push({ geo: new BoxGeometry(3, 0.06, 27), position: at(0, 9.3, 0) });
        ribs.push({ geo: new BoxGeometry(0.3, 0.3, 27), position: at(0, 9.45, 0) });
        for (const side of [1, -1]) lamps.push({ geo: new BoxGeometry(0.12, 0.08, 25), position: at(side * 8.2, 4.9, 0) });
      }
      // the glass lift and a bridge down to the street on the left, behind the platform
      const lx = 13.4;
      const lz = -10;
      const drop = dropTo(lx, lz) + 1.4;
      pane.push({ geo: new BoxGeometry(3, drop, 3), position: at(lx, 1.4 - drop / 2, lz) });
      for (const [dx, dz] of [
        [-1.5, -1.5],
        [1.5, -1.5],
        [-1.5, 1.5],
        [1.5, 1.5],
      ])
        steel.push({ geo: new BoxGeometry(0.12, drop, 0.12), position: at(lx + dx, 1.4 - drop / 2, lz + dz) });
      white.push({ geo: new BoxGeometry(3.4, 0.25, 3.4), position: at(lx, 1.45, lz) });
      white.push({ geo: new BoxGeometry(2.2, 0.2, 5), position: at(lx - 1, 1.3, lz + 3.5) });
      white.push({ geo: new BoxGeometry(3.6, 0.3, 3.6), position: at(lx, 1.4 - drop + 0.15, lz) });

      const edgeMat = new MeshStandardMaterial({ color: 0x1b1530, emissive: 0xa78bfa, emissiveIntensity: 0.7 });
      mats.edge.push(edgeMat);
      const meshes: [Part[], Material, boolean][] = [
        [white, mats.plat, true],
        [edgeP, edgeMat, false],
        [steel, mats.canopy, false],
        [ribs, mats.canopy, true],
        [timber, mats.timber, true],
        [green, mats.roofGreen, true],
        [lamps, mats.lamp, false],
        [bannerA, mats.bannerA, false],
        [bannerB, mats.bannerB, false],
        [pane, mats.pane, false],
      ];
      for (const [parts, mat, cast] of meshes) {
        if (!parts.length) continue;
        const m = new Mesh(merged(parts), mat);
        m.castShadow = cast && !lowEnd;
        m.receiveShadow = mat !== mats.pane && mat !== mats.lamp;
        g.add(m);
      }
      // the stop's name on the top rail of both screen-door rows, facing the track
      const label = doorLabel(st, fonts);
      labels.push({ canvas: label.canvas, texture: label.texture, index: i });
      const labelMesh = new Mesh(
        merged(
          // 1024 × 60 px, so 8 units wide is 0.47 tall: a strip just under the doors' light line
          [1, -1].map((side) => ({ geo: new PlaneGeometry(8, 0.47), position: at(side * 6.5, 3.58, side * -4), rotation: [0, -side * (Math.PI / 2), 0] as [number, number, number] })),
        ),
        new MeshBasicMaterial({ map: label.texture, toneMapped: false }),
      );
      g.add(labelMesh);
      return g;
    });
    return { groups, labels, fonts };
  }, [mats, lowEnd]);

  // repaint the labels once the web fonts are in, so the names use the same faces as the page
  useEffect(() => {
    let alive = true;
    const { fonts } = built;
    document.fonts
      .load(`500 30px ${fonts.mono}`)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        for (const s of built.labels) {
          paintDoorLabel(s.canvas, stations[s.index], fonts);
          s.texture.needsUpdate = true;
        }
      });
    return () => {
      alive = false;
    };
  }, [built]);

  useEffect(
    () => () => {
      for (const g of built.groups) {
        g.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
    },
    [built],
  );

  return (
    <>
      {built.groups.map((g, i) => (
        <primitive key={stations[i].id} object={g} />
      ))}
    </>
  );
}
