"use client";

import { useEffect, useMemo } from "react";
import { CircleGeometry, Shape, ShapeGeometry, Vector2 } from "three";

import { CREEK, INLET, LAKE } from "./cityModel";
import { groundAt } from "./track";
import { useWorld } from "./world";

const waterShape = (poly: [number, number][]) => new Shape(poly.map(([x, z]) => new Vector2(x, -z)));

/** Burrard Inlet (wrapping the peninsula into English Bay), False Creek and Trout Lake as flat reflective shapes. */
export function Water() {
  const { mats } = useWorld();
  const geos = useMemo(
    () => ({
      inlet: new ShapeGeometry(waterShape(INLET)),
      creek: new ShapeGeometry(waterShape(CREEK)),
      lake: new CircleGeometry(1, 40),
    }),
    [],
  );
  useEffect(
    () => () => {
      geos.inlet.dispose();
      geos.creek.dispose();
      geos.lake.dispose();
    },
    [geos],
  );
  return (
    <>
      <mesh geometry={geos.inlet} material={mats.water} rotation-x={-Math.PI / 2} position-y={-0.6} />
      <mesh geometry={geos.creek} material={mats.water} rotation-x={-Math.PI / 2} position-y={-0.6} />
      <mesh
        geometry={geos.lake}
        material={mats.water}
        rotation-x={-Math.PI / 2}
        scale={[LAKE.rx, LAKE.rz, 1]}
        position={[LAKE.x, groundAt(LAKE.x, LAKE.z) - 0.6, LAKE.z]}
      />
    </>
  );
}
