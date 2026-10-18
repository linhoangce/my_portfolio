"use client";

import { useEffect, useMemo } from "react";
import { CircleGeometry } from "three";

import { buildGroundGeometry, PARKS } from "./cityModel";
import { groundAt } from "./track";
import { useWorld } from "./world";

/** One textured plane with the street grid, dipped inside the water polygons, plus the park lawns. */
export function Ground() {
  const { mats } = useWorld();
  const geo = useMemo(() => buildGroundGeometry(), []);
  const lawn = useMemo(() => new CircleGeometry(1, 40), []);
  useEffect(
    () => () => {
      geo.dispose();
      lawn.dispose();
    },
    [geo, lawn],
  );
  return (
    <>
      <mesh geometry={geo} material={mats.ground} receiveShadow />
      {PARKS.map((pk) => (
        <mesh
          key={pk.name}
          geometry={lawn}
          material={mats.park}
          rotation-x={-Math.PI / 2}
          scale={[pk.r, pk.r, 1]}
          position={[pk.x, groundAt(pk.x, pk.z) + 0.04, pk.z]}
          receiveShadow
        />
      ))}
    </>
  );
}
