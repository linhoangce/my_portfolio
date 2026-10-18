"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, ConeGeometry, CylinderGeometry, Mesh, MeshStandardMaterial } from "three";

import { buildHill, buildMountains } from "./cityModel";
import { merged } from "./merge";
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
    // Lions Gate: two 66-unit towers, a 330-unit deck at height 28, four cables; concrete and cables as two meshes
    const bridge = new Mesh(
      merged([
        { geo: new BoxGeometry(6, 1.6, 330), position: [0, 28, -575] },
        { geo: new BoxGeometry(5, 66, 5), position: [0, 33, -470] },
        { geo: new BoxGeometry(5, 66, 5), position: [0, 33, -680] },
      ]),
      world.mats.concrete,
    );
    bridge.position.set(-300, 0, 0);
    const cables = new Mesh(
      merged(
        (
          [
            [-470, -575],
            [-575, -680],
            [-470, -420],
            [-680, -730],
          ] as [number, number][]
        ).map(([z0, z1]) => {
          const L = Math.abs(z1 - z0);
          return { geo: new CylinderGeometry(0.35, 0.35, Math.hypot(L, 37), 6), position: [0, 47.5, (z0 + z1) / 2] as [number, number, number], rotation: [Math.atan2(L, 37) * (z1 > z0 ? 1 : -1), 0, 0] as [number, number, number] };
        }),
      ),
      world.mats.mast,
    );
    cables.position.set(-300, 0, 0);
    return { ridge, ridgeMesh, hill, baker, bridge, cables };
  }, [world]);

  useEffect(() => {
    world.refs.mountain = built.ridgeMesh;
    world.refs.mountainCols = { summer: built.ridge.summer, winter: built.ridge.winter };
    return () => {
      world.refs.mountain = null;
      world.refs.mountainCols = null;
      for (const m of [built.ridgeMesh, built.hill, built.baker, built.bridge, built.cables]) m.geometry.dispose();
    };
  }, [world, built]);

  return (
    <>
      <primitive object={built.ridgeMesh} />
      <primitive object={built.hill} />
      <primitive object={built.baker} />
      <primitive object={built.bridge} />
      <primitive object={built.cables} />
    </>
  );
}
