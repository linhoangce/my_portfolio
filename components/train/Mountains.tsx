"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";

import { buildHill, buildMountains } from "./cityModel";
import { useWorld } from "./world";

/** The horizon: North Shore ridge, Burnaby Mountain, Mount Baker and the Lions Gate Bridge over the First Narrows. */
export function Mountains() {
  const world = useWorld();
  const built = useMemo(() => {
    const ridge = buildMountains();
    const ridgeMesh = new Mesh(ridge.geometry, world.mats.mountain);
    const hill = new Mesh(buildHill(), new MeshStandardMaterial({ color: 0x5c7a5e, roughness: 1, flatShading: true }));
    hill.position.set(1250, 2, 300);
    const baker = new Mesh(new ConeGeometry(460, 430, 7), new MeshStandardMaterial({ color: 0xe9eef5, roughness: 1, flatShading: true, fog: false }));
    baker.position.set(1900, 190, 1700);
    const lg = new Group();
    lg.position.set(-300, 0, 0);
    const deck = new Mesh(new BoxGeometry(6, 1.6, 330), world.mats.concrete);
    deck.position.set(0, 28, -575);
    lg.add(deck);
    for (const z of [-470, -680]) {
      const tw = new Mesh(new BoxGeometry(5, 66, 5), world.mats.concrete);
      tw.position.set(0, 33, z);
      lg.add(tw);
    }
    for (const [z0, z1] of [
      [-470, -575],
      [-575, -680],
      [-470, -420],
      [-680, -730],
    ]) {
      const L = Math.abs(z1 - z0);
      const zm = (z0 + z1) / 2;
      const cable = new Mesh(new CylinderGeometry(0.35, 0.35, Math.hypot(L, 37), 6), world.mats.mast);
      cable.position.set(0, 47.5, zm);
      cable.rotation.x = Math.atan2(L, 37) * (z1 > z0 ? 1 : -1);
      lg.add(cable);
    }
    return { ridge, ridgeMesh, hill, baker, lg };
  }, [world]);

  useEffect(() => {
    world.refs.mountain = built.ridgeMesh;
    world.refs.mountainCols = { summer: built.ridge.summer, winter: built.ridge.winter };
    return () => {
      world.refs.mountain = null;
      world.refs.mountainCols = null;
      built.ridge.geometry.dispose();
      built.hill.geometry.dispose();
      built.baker.geometry.dispose();
      built.lg.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    };
  }, [world, built]);

  return (
    <>
      <primitive object={built.ridgeMesh} />
      <primitive object={built.hill} />
      <primitive object={built.baker} />
      <primitive object={built.lg} />
    </>
  );
}
