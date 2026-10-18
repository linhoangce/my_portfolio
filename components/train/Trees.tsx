"use client";

import { useEffect, useMemo } from "react";
import { BufferGeometry, Color, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { Rng } from "./cityModel";
import { getCityData } from "./cityData";
import { colourCrowns } from "./lookModel";
import { useTrain } from "./store";
import { groundAt, UP } from "./track";
import { useWorld } from "./world";

/** Two crossed quads carrying the painted silhouette (6.4 × 8 deciduous, 5 × 10 evergreen). */
function crossQuad(w: number, h: number): BufferGeometry {
  const a = new PlaneGeometry(w, h);
  a.translate(0, h / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b], false);
  a.dispose();
  b.dispose();
  return g;
}

/** Painted trees, instanced: evergreens with a fixed colour, deciduous crowns recoloured per season by the look. */
export function Trees() {
  const world = useWorld();
  const { lowEnd, mats } = world;
  const data = useMemo(() => getCityData(lowEnd), [lowEnd]);

  const built = useMemo(() => {
    const rng = new Rng(4);
    const evers = data.trees.filter((t) => t.ever);
    const decids = data.trees.filter((t) => !t.ever);
    const everMesh = new InstancedMesh(crossQuad(5, 10), mats.ever, Math.max(1, evers.length));
    const decidMesh = new InstancedMesh(crossQuad(6.4, 8), mats.decid, Math.max(1, decids.length));
    const m4 = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    const p = new Vector3();
    const c = new Color();
    const place = (mesh: InstancedMesh, list: typeof evers) =>
      list.forEach((t, i) => {
        p.set(t.x, groundAt(t.x, t.z) - 0.2, t.z);
        q.setFromAxisAngle(UP, rng.next() * 6.28);
        sc.set(t.s, t.s * (0.9 + rng.next() * 0.4), t.s);
        m4.compose(p, q, sc);
        mesh.setMatrixAt(i, m4);
      });
    place(everMesh, evers);
    place(decidMesh, decids);
    evers.forEach((_, i) => everMesh.setColorAt(i, c.setHSL(0.34 + rng.next() * 0.06, 0.32 + rng.next() * 0.18, 0.22 + rng.next() * 0.14)));
    everMesh.count = evers.length;
    decidMesh.count = decids.length;
    everMesh.castShadow = decidMesh.castShadow = false;
    everMesh.receiveShadow = decidMesh.receiveShadow = true;
    return { everMesh, decidMesh, decids };
  }, [data, mats]);

  useEffect(() => {
    world.refs.decid = built.decidMesh;
    world.refs.decidList = built.decids;
    const season = useTrain.getState().season;
    colourCrowns(world, season);
    world.look.lastSeason = season;
    return () => {
      world.refs.decid = null;
      world.refs.decidList = [];
      built.everMesh.geometry.dispose();
      built.decidMesh.geometry.dispose();
      built.everMesh.dispose();
      built.decidMesh.dispose();
    };
  }, [world, built]);

  return (
    <>
      <primitive object={built.everMesh} />
      <primitive object={built.decidMesh} />
    </>
  );
}
