"use client";

import { useEffect, useMemo } from "react";
import { CircleGeometry, PlaneGeometry } from "three";

import { SEA } from "./constants";
import { LAKE, lakeLevel } from "./terrain";
import { useWorld } from "./world";

/** One sea plane under the whole world (the terrain clips it to the real coastline) and Trout Lake at its own level. */
export function Water() {
  const { mats } = useWorld();
  const geos = useMemo(() => ({ sea: new PlaneGeometry(9000, 9000), lake: new CircleGeometry(1, 48) }), []);
  useEffect(
    () => () => {
      geos.sea.dispose();
      geos.lake.dispose();
    },
    [geos],
  );
  return (
    <>
      <mesh geometry={geos.sea} material={mats.water} rotation-x={-Math.PI / 2} position={[400, SEA, 0]} />
      <mesh geometry={geos.lake} material={mats.water} rotation-x={-Math.PI / 2} scale={[LAKE.rx + 1, LAKE.rz + 1, 1]} position={[LAKE.x, lakeLevel(), LAKE.z]} />
    </>
  );
}
