"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry } from "three";

import { stations } from "@/data";

import { signFonts, signTexture, paintSign } from "./textures";
import { frameAt, groundAt, makeFrame, stationS } from "./track";
import { useWorld } from "./world";

/**
 * Side platforms on both tracks with a violet edge strip, a flat canopy on three posts and two lamps each; the fascia
 * sign and the access tower down to the street sit on the left platform, which faces the camera.
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
      g.lookAt(f.p.clone().add(f.t));
      // +x local = left of the track
      for (const side of [1, -1]) {
        const plat = new Mesh(new BoxGeometry(5.2, 0.9, 26), mats.plat);
        plat.position.set(side * 8.9, 0.95, 0);
        plat.receiveShadow = true;
        plat.castShadow = !lowEnd;
        g.add(plat);
        const edgeMat = new MeshStandardMaterial({ color: 0x222222, emissive: 0xa78bfa, emissiveIntensity: 0.7 });
        const edge = new Mesh(new BoxGeometry(0.16, 0.05, 25.4), edgeMat);
        edge.position.set(side * 6.4, 1.42, 0);
        g.add(edge);
        mats.edge.push(edgeMat);
        const canopy = new Mesh(new BoxGeometry(6.0, 0.18, 24), mats.canopy);
        canopy.position.set(side * 9.3, 6.6, 0);
        canopy.castShadow = !lowEnd;
        g.add(canopy);
        const fascia = new Mesh(new BoxGeometry(0.12, 0.9, 24), mats.canopy);
        fascia.position.set(side * 6.4, 6.2, 0);
        g.add(fascia);
        for (const z of [-9, 0, 9]) {
          const c = new Mesh(new CylinderGeometry(0.14, 0.14, 5.2, 10), mats.post);
          c.position.set(side * 11.3, 4.0, z);
          g.add(c);
        }
        for (const z of [-10, 10]) {
          const lamp = new Mesh(new SphereGeometry(0.17, 12, 10), mats.lamp);
          lamp.position.set(side * 8.2, 6.4, z);
          g.add(lamp);
        }
      }
      const gy = groundAt(f.p.x, f.p.z);
      const th = f.p.y - gy + 1.4;
      const tower = new Mesh(new BoxGeometry(5, th, 6), mats.concrete);
      tower.position.set(13.3, -(f.p.y - gy) + th / 2, -14);
      tower.castShadow = !lowEnd;
      g.add(tower);
      const bridge = new Mesh(new BoxGeometry(4.2, 0.5, 4), mats.concrete);
      bridge.position.set(11.3, 1.2, -13.5);
      g.add(bridge);
      const sign = signTexture(st, fonts);
      const signMesh = new Mesh(new PlaneGeometry(5.2, 2.6), new MeshBasicMaterial({ map: sign.texture, toneMapped: false }));
      signMesh.position.set(6.32, 4.6, -4);
      signMesh.rotation.y = -Math.PI / 2;
      g.add(signMesh);
      signs.push({ canvas: sign.canvas, texture: sign.texture, index: i });
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
