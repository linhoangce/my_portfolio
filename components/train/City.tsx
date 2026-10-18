"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, ConeGeometry, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";

import { FACADES } from "./cityModel";
import { getCityData } from "./cityData";
import { groundAt, UP } from "./track";
import { useWorld } from "./world";

/** Four merged facade meshes (one draw call per family) and the east-side houses as two instanced meshes. */
export function City() {
  const world = useWorld();
  const { lowEnd, mats } = world;
  const data = useMemo(() => getCityData(lowEnd), [lowEnd]);

  const houses = useMemo(() => {
    const list = data.houses;
    const n = list.length;
    const body = new InstancedMesh(new BoxGeometry(1, 1, 1), mats.houseBody, Math.max(1, n));
    const roofG = new ConeGeometry(0.72, 1, 4);
    roofG.rotateY(Math.PI / 4);
    roofG.translate(0, 0.5, 0);
    const roof = new InstancedMesh(roofG, mats.houseRoof, Math.max(1, n));
    const m4 = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    const p = new Vector3();
    const c = new Color();
    list.forEach((h, i) => {
      const gy = groundAt(h.x, h.z);
      q.setFromAxisAngle(UP, h.rot);
      p.set(h.x, gy + h.h / 2, h.z);
      sc.set(h.w, h.h, h.d);
      m4.compose(p, q, sc);
      body.setMatrixAt(i, m4);
      body.setColorAt(i, c.setHex(h.body));
      p.set(h.x, gy + h.h, h.z);
      // roof pitch varies per house: a hash of its position stands in for the prototype's random draw
      const pitch = 1.6 + ((Math.abs(Math.sin(h.x * 12.9898 + h.z * 78.233)) * 43758.5453) % 1) * 0.6;
      sc.set(h.w * 1.15, pitch, h.d * 1.15);
      m4.compose(p, q, sc);
      roof.setMatrixAt(i, m4);
      roof.setColorAt(i, c.setHex(h.roof));
    });
    body.count = roof.count = n;
    body.castShadow = roof.castShadow = !lowEnd;
    body.receiveShadow = true;
    return { body, roof };
  }, [data, mats, lowEnd]);

  useEffect(
    () => () => {
      houses.body.geometry.dispose();
      houses.roof.geometry.dispose();
      houses.body.dispose();
      houses.roof.dispose();
    },
    [houses],
  );

  return (
    <>
      {FACADES.map((k) => {
        const g = data.geos[k];
        return g ? <mesh key={k} geometry={g} material={mats.city[k]} castShadow={!lowEnd} receiveShadow /> : null;
      })}
      <primitive object={houses.body} />
      <primitive object={houses.roof} />
    </>
  );
}
