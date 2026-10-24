"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CircleGeometry, CylinderGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from "three";

import { approachAxis, junction, nodeDeck, roadNear, roads, signalCycle, signalOffset, WALK } from "./roadNetwork";
import { inSetZone } from "./sets/zones";
import { inLandmark } from "./sites";
import { surfaceAt } from "./terrain";
import { trackDist } from "./track";
import { useWorld } from "./world";

const POLE_H = 5.8;
const ARM_Y = 5.5;

/**
 * Traffic signals where Vancouver has them (roads.ts, from the City's and OpenStreetMap's lists): on every road coming
 * into a signalled junction, a pole at the near-right corner, a mast arm out over the lanes coming in and a head over
 * each lane, facing the traffic; a pole each side of a signalled crossing mid-block. The lamps' colours come from the
 * same timing the cars obey (roads.ts signalState), worked out in the shader from the time and each lamp's junction,
 * phase and colour, so the 2100 city's lights cost nothing per frame; after dark they glow. Kept to the streets the
 * ride can see: within 450 units of the line (240 on the low-end budget).
 */
export function Signals() {
  const world = useWorld();
  const { lowEnd } = world;

  const built = useMemo(() => {
    const { nodes, edges } = roads();
    const reach = lowEnd ? 240 : 450;
    type Head = { x: number; y: number; z: number; ry: number; cycle: number; offset: number; axis: number };
    const poles: Matrix4[] = [];
    const arms: Matrix4[] = [];
    const heads: Head[] = [];
    const q = new Quaternion();
    const UPV = new Vector3(0, 1, 0);
    // a pole stands on the drawn ground, or on the deck where its junction is over the cut
    let deckY: number | null = null;
    const baseY = (x: number, z: number) => deckY ?? surfaceAt(x, z, lowEnd ? 2 : 1);
    // no two poles crowd one corner: an approach whose pole would stand on another's is left to that one
    const placed: [number, number][] = [];
    const crowded = (x: number, z: number, r: number) => placed.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < r * r);
    const pole = (x: number, z: number) => {
      placed.push([x, z]);
      poles.push(new Matrix4().compose(new Vector3(x, baseY(x, z), z), q.identity(), new Vector3(1, 1, 1)));
    };
    nodes.forEach((nd, ni) => {
      if (!nd.signal || trackDist(nd.x, nd.z) > reach) return;
      const j = junction(ni);
      if (!j) return;
      const dy = nodeDeck(ni);
      deckY = dy == null ? null : dy + 0.13;
      const cycle = signalCycle(ni);
      const offset = signalOffset(ni) * cycle;
      for (const [k, setback] of j.setback) {
        const e = edges[k];
        const atA = e.a === ni;
        // traffic coming in along this road: none on a one-way leading away
        if ((e.oneway === 1 && atA) || (e.oneway === -1 && !atA)) continue;
        const n = e.pts.length / 2;
        const [x0, z0, x1, z1] = atA ? [e.pts[0], e.pts[1], e.pts[2], e.pts[3]] : [e.pts[n * 2 - 2], e.pts[n * 2 - 1], e.pts[n * 2 - 4], e.pts[n * 2 - 3]];
        const L = Math.hypot(x1 - x0, z1 - z0) || 1;
        const ux = (x1 - x0) / L;
        const uz = (z1 - z0) / L;
        // the incoming traffic heads -u; its right is (u.z, -u.x)
        const rx = uz;
        const rz = -ux;
        const c = e.half - WALK[e.cls];
        const px = nd.x + ux * (setback + 0.9) + rx * (e.half - 0.3);
        const pz = nd.z + uz * (setback + 0.9) + rz * (e.half - 0.3);
        // never in a station's set or a landmark's grounds
        if (inSetZone(px, pz, 1) || inLandmark(px, pz, 0) || crowded(px, pz, 2.5)) continue;
        pole(px, pz);
        const gy = baseY(px, pz);
        // the arm reaches across the lanes coming in: half the road, or all of it on a one-way
        const reachIn = e.oneway ? 2 * c : c;
        const ry = Math.atan2(-rx, -rz);
        q.setFromAxisAngle(UPV, ry - Math.PI / 2);
        arms.push(new Matrix4().compose(new Vector3(px, gy + ARM_Y, pz), q, new Vector3(reachIn + 0.3, 1, 1)));
        const lanes = Math.max(1, Math.min(3, e.lanes));
        const axis = approachAxis(k, ni);
        for (let i = 0; i < lanes; i++) {
          const d = 0.3 + (reachIn * (i + 0.5)) / lanes;
          heads.push({ x: px - rx * d, y: gy + ARM_Y - 0.75, z: pz - rz * d, ry: Math.atan2(ux, uz), cycle, offset, axis });
        }
      }
    });
    // a signalled crossing mid-block: a pole each side, a head facing each way
    deckY = null;
    for (const [x, z] of roads().ped) {
      if (trackDist(x, z) > reach) continue;
      const near = roadNear(x, z, { edge: 0, seg: 0, t: 0, d: 0, s: 0, side: 1 });
      if (!near) continue;
      const e = edges[near.edge];
      const i = near.seg;
      if (!e.shown[i] || inSetZone(x, z, 2) || inLandmark(x, z, 1) || crowded(x, z, e.half + 4)) continue;
      const tx = e.pts[i * 2 + 2] - e.pts[i * 2];
      const tz = e.pts[i * 2 + 3] - e.pts[i * 2 + 1];
      const L = Math.hypot(tx, tz) || 1;
      const ux = tx / L;
      const uz = tz / L;
      const cx = e.pts[i * 2] + tx * near.t;
      const cz = e.pts[i * 2 + 1] + tz * near.t;
      for (const side of [1, -1]) {
        const px = cx + uz * side * (e.half - 0.3);
        const pz = cz - ux * side * (e.half - 0.3);
        pole(px, pz);
        heads.push({ x: px, y: surfaceAt(px, pz, lowEnd ? 2 : 1) + POLE_H - 1.6, z: pz, ry: Math.atan2(-ux * side, -uz * side), cycle: 60, offset: ((x * 7.3 + z * 3.1) % 60 + 60) % 60, axis: 0 });
      }
    }

    const metal = new MeshStandardMaterial({ color: 0x2f3a35, roughness: 0.55, metalness: 0.4 });
    const housing = new MeshStandardMaterial({ color: 0x1d2320, roughness: 0.6 });
    const poleMesh = new InstancedMesh(new CylinderGeometry(0.1, 0.13, POLE_H, lowEnd ? 5 : 7).translate(0, POLE_H / 2, 0), metal, Math.max(1, poles.length));
    poles.forEach((m, i) => poleMesh.setMatrixAt(i, m));
    poleMesh.count = poles.length;
    const armMesh = new InstancedMesh(new BoxGeometry(1, 0.13, 0.13).translate(0.5, 0, 0), metal, Math.max(1, arms.length));
    arms.forEach((m, i) => armMesh.setMatrixAt(i, m));
    armMesh.count = arms.length;
    const headMesh = new InstancedMesh(new BoxGeometry(0.42, 1.25, 0.3), housing, Math.max(1, heads.length));
    const lampMesh = new InstancedMesh(new CircleGeometry(0.15, 6), new MeshBasicMaterial({ color: 0xffffff }), Math.max(1, heads.length * 3));
    const sig = new Float32Array(heads.length * 3 * 4);
    const m4 = new Matrix4();
    heads.forEach((h, i) => {
      q.setFromAxisAngle(UPV, h.ry);
      headMesh.setMatrixAt(i, m4.compose(new Vector3(h.x, h.y, h.z), q, new Vector3(1, 1, 1)));
      const fx = Math.sin(h.ry) * 0.16;
      const fz = Math.cos(h.ry) * 0.16;
      for (let l = 0; l < 3; l++) {
        // red on top, amber, green below: lamp 2, 1, 0
        lampMesh.setMatrixAt(i * 3 + l, m4.compose(new Vector3(h.x + fx, h.y + 0.38 - l * 0.38, h.z + fz), q, new Vector3(1, 1, 1)));
        sig.set([h.cycle, h.offset, h.axis, 2 - l], (i * 3 + l) * 4);
      }
    });
    headMesh.count = heads.length;
    lampMesh.count = heads.length * 3;
    lampMesh.geometry.setAttribute("aSig", new InstancedBufferAttribute(sig, 4));
    const time = { value: 0 };
    const night = { value: 0 };
    lampMesh.material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.uniforms.uNight = night;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 aSig;\nvarying vec4 vSig;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSig = aSig;");
      // the same timing as roads.ts signalState: each phase green, 3 s amber, 2 s all-red
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uNight;\nvarying vec4 vSig;")
        .replace(
          "#include <color_fragment>",
          [
            "#include <color_fragment>",
            "{",
            "  float C = vSig.x;",
            "  float u = mod( uTime + vSig.y, C );",
            "  float h = C * 0.5;",
            "  float v = vSig.z < 0.5 ? u : mod( u + h, C );",
            "  float state = v < h - 5.0 ? 0.0 : ( v < h - 2.0 ? 1.0 : 2.0 );",
            "  vec3 lit = vSig.w < 0.5 ? vec3( 0.2, 1.0, 0.55 ) : ( vSig.w < 1.5 ? vec3( 1.0, 0.7, 0.1 ) : vec3( 1.0, 0.16, 0.12 ) );",
            "  float on = abs( state - vSig.w ) < 0.5 ? 1.0 : 0.0;",
            "  diffuseColor.rgb = mix( lit * 0.12, lit * ( 1.2 + 1.6 * uNight ), on );",
            "}",
          ].join("\n"),
        );
    };
    lampMesh.material.customProgramCacheKey = () => "signal-lamps";
    for (const m of [poleMesh, armMesh, headMesh]) m.castShadow = !lowEnd;
    return { poleMesh, armMesh, headMesh, lampMesh, metal, housing, time, night, count: heads.length };
  }, [lowEnd]);

  useEffect(
    () => () => {
      for (const m of [built.poleMesh, built.armMesh, built.headMesh, built.lampMesh]) {
        m.geometry.dispose();
        m.dispose();
      }
      built.metal.dispose();
      built.housing.dispose();
      (built.lampMesh.material as MeshBasicMaterial).dispose();
    },
    [built],
  );

  useFrame(({ clock }) => {
    built.time.value = clock.elapsedTime;
    built.night.value = Math.min(1, world.buildings.solid.emissiveIntensity * 1.1);
  });

  return (
    <>
      <primitive object={built.poleMesh} />
      <primitive object={built.armMesh} />
      <primitive object={built.headMesh} />
      <primitive object={built.lampMesh} />
    </>
  );
}
