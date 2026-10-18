"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry } from "three";

import { stations } from "@/data";

import { merged } from "./merge";
import { signFonts, signTexture, paintSign } from "./textures";
import { frameAt, groundAt, makeFrame, stationS } from "./track";
import { useWorld } from "./world";

/**
 * Side platforms on both tracks with a violet edge strip, a flat canopy on three posts and two lamps each; the fascia
 * sign and the access tower down to the street sit on the left platform, which faces the camera. Seven meshes per
 * station (one per material), so ten stations cost 70 draw calls before frustum culling.
 */
export function Stations() {
  const world = useWorld();
  const { mats, lowEnd } = world;

  const built = useMemo(() => {
    mats.edge.length = 0;
    const fonts = signFonts();
    const f = makeFrame();
    const signs: { canvas: HTMLCanvasElement; texture: { needsUpdate: boolean }; index: number }[] = [];
    const groups = stations.map((st, i) => {
      frameAt(stationS[i], f);
      const g = new Group();
      g.position.copy(f.p);
      g.lookAt(f.p.clone().add(f.t.clone().setY(0).normalize()));
      // +x local = left of the track
      const sides = [1, -1];
      const plat = new Mesh(merged(sides.map((side) => ({ geo: new BoxGeometry(5.2, 0.9, 26), position: [side * 8.9, 0.95, 0] }))), mats.plat);
      plat.receiveShadow = true;
      plat.castShadow = !lowEnd;
      const edgeMat = new MeshStandardMaterial({ color: 0x222222, emissive: 0xa78bfa, emissiveIntensity: 0.7 });
      mats.edge.push(edgeMat);
      const edge = new Mesh(merged(sides.map((side) => ({ geo: new BoxGeometry(0.16, 0.05, 25.4), position: [side * 6.4, 1.42, 0] }))), edgeMat);
      const canopy = new Mesh(
        merged(
          sides.flatMap((side) => [
            { geo: new BoxGeometry(6.0, 0.18, 24), position: [side * 9.3, 6.6, 0] as [number, number, number] },
            { geo: new BoxGeometry(0.12, 0.9, 24), position: [side * 6.4, 6.2, 0] as [number, number, number] },
          ]),
        ),
        mats.canopy,
      );
      canopy.castShadow = !lowEnd;
      const posts = new Mesh(
        merged(sides.flatMap((side) => [-9, 0, 9].map((z) => ({ geo: new CylinderGeometry(0.14, 0.14, 5.2, 10), position: [side * 11.3, 4.0, z] as [number, number, number] })))),
        mats.post,
      );
      const lamps = new Mesh(
        merged(sides.flatMap((side) => [-10, 10].map((z) => ({ geo: new SphereGeometry(0.17, 12, 10), position: [side * 8.2, 6.4, z] as [number, number, number] })))),
        mats.lamp,
      );
      // +x local = left of the track, -z local = back along it: the tower stands at local (13.3, -14)
      const tH = f.t.clone().setY(0).normalize();
      const towerAt = f.p.clone().addScaledVector(f.r, -13.3).addScaledVector(tH, -14);
      const gy = groundAt(towerAt.x, towerAt.z);
      const th = f.p.y - gy + 1.4;
      const concrete = new Mesh(
        merged([
          { geo: new BoxGeometry(5, th, 6), position: [13.3, -(f.p.y - gy) + th / 2, -14] },
          { geo: new BoxGeometry(4.2, 0.5, 4), position: [11.3, 1.2, -13.5] },
        ]),
        mats.concrete,
      );
      concrete.castShadow = !lowEnd;
      const sign = signTexture(st, fonts);
      const signMesh = new Mesh(new PlaneGeometry(5.2, 2.6), new MeshBasicMaterial({ map: sign.texture, toneMapped: false }));
      signMesh.position.set(6.32, 4.6, -4);
      signMesh.rotation.y = -Math.PI / 2;
      signs.push({ canvas: sign.canvas, texture: sign.texture, index: i });
      g.add(plat, edge, canopy, posts, lamps, concrete, signMesh);
      return g;
    });
    return { groups, signs, fonts };
  }, [mats, lowEnd]);

  // repaint the signs once the web fonts are in, so the names use the same faces as the page
  useEffect(() => {
    let alive = true;
    const { fonts } = built;
    Promise.all([
      document.fonts.load(`700 104px ${fonts.sans}`),
      document.fonts.load(`400 90px ${fonts.serif}`),
      document.fonts.load(`500 30px ${fonts.mono}`),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        for (const s of built.signs) {
          paintSign(s.canvas, stations[s.index], fonts);
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
