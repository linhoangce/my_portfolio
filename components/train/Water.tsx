"use client";

import { useEffect, useMemo, useRef } from "react";
import { CircleGeometry, type Mesh, PlaneGeometry } from "three";

import { SEA } from "./constants";
import { LAKE, lakeLevel } from "./terrain";
import { skipInMirror } from "./waterMirror";
import { useWorld } from "./world";

/**
 * One sea plane under the whole world (the terrain clips it to the real coastline) and Trout Lake at its own level,
 * out over its bowl's lip so no bare bank shows between the water and the grass.
 */
export function Water() {
  const { mats } = useWorld();
  const sea = useRef<Mesh>(null);
  const lake = useRef<Mesh>(null);
  useEffect(() => skipInMirror(sea.current, lake.current), []);
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
      <mesh ref={sea} geometry={geos.sea} material={mats.water} rotation-x={-Math.PI / 2} position={[400, SEA, 0]} receiveShadow />
      <mesh ref={lake} geometry={geos.lake} material={mats.water} rotation-x={-Math.PI / 2} scale={[LAKE.rx * 1.12, LAKE.rz * 1.12, 1]} position={[LAKE.x, lakeLevel(), LAKE.z]} />
    </>
  );
}
