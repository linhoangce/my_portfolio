"use client";

import { useFrame } from "@react-three/fiber";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";

import { getTreeData } from "./cityData";
import { streetX, streetZ } from "./cityModel";
import { eventColour, tickEventLights } from "./eventLights";
import { EVENT_META } from "./lookTypes";
import { inLandmark, inPark, LANDMARKS } from "./sites";
import { useTrain } from "./store";
import { groundAt, inWater, surfaceAt } from "./terrain";
import { frameAt, makeFrame, STATION_XZ, stationS, UP } from "./track";
import { SPECIES } from "./trees/species";
import { dotTexture } from "./textures";
import { useWorld } from "./world";

const VIOLET = new Color(0xa78bfa);
const col = new Color();


/** Points with per-point colours (string lights, diyas, garlands, fireworks, petals). */
function points(n: number, size: number, additive: boolean): { pts: Points; pos: Float32Array; colour: Float32Array } {
  const pos = new Float32Array(n * 3);
  const colour = new Float32Array(n * 3);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(colour, 3));
  const pts = new Points(g, new PointsMaterial({ size, map: dotTexture(), vertexColors: true, transparent: true, alphaTest: additive ? 0 : 0.2, depthWrite: false, toneMapped: !additive, blending: additive ? AdditiveBlending : NormalBlending }));
  pts.frustumCulled = false;
  pts.visible = false;
  return { pts, pos, colour };
}

/**
 * The event layer: every frame tick of the monuments' LED patterns, the tower crowns and the station accents, plus the
 * extras each event brings (Chinatown lanterns for Lunar New Year, rainbow crosswalks for Pride, fireworks over
 * English Bay for the Celebration of Light, string lights in the street trees for Bright Nights, diyas along the
 * station canopies for Diwali, marigold garlands for Vaisakhi).
 */
export function Events() {
  const world = useWorld();
  const { resolvedTheme } = useTheme();
  const night = useRef(true);
  night.current = resolvedTheme !== "light";
  const lowEnd = world.lowEnd;

  const extras = useMemo(() => {
    // lanterns strung across Chinatown's streets and the gate
    const lanternPts: Vector3[] = [];
    for (let j = 1; j <= 4; j++) {
      const z = streetZ(j);
      if (z < 58 || z > 100) continue;
      for (let x = 30; x < 104; x += 3.4) lanternPts.push(new Vector3(x, groundAt(x, z) + 6.2 + Math.sin(x * 0.9) * 0.3, z));
    }
    const gate = LANDMARKS.find((l) => l.key === "gate");
    if (gate) for (let k = -3; k <= 3; k++) lanternPts.push(new Vector3(gate.px + k * 1.2, groundAt(gate.px, gate.pz) + 5.2, gate.pz + 1.1));
    const lanternMat = new MeshStandardMaterial({ color: 0xb3261e, emissive: 0xff3a20, emissiveIntensity: 0.3, roughness: 0.6 });
    const lanterns = new InstancedMesh(new SphereGeometry(0.45, 10, 8), lanternMat, Math.max(1, lanternPts.length));
    const m4 = new Matrix4();
    lanternPts.forEach((v, i) => {
      m4.compose(v, new Quaternion(), new Vector3(1, 1.25, 1));
      lanterns.setMatrixAt(i, m4);
    });
    lanterns.visible = false;
    // rainbow crosswalks: the street intersection nearest Davie & Bute, and one by Main Street
    const rainbow: Mesh[] = [];
    const onStreet = (x: number, z: number) => !inPark(x, z) && !inWater(x, z) && !inLandmark(x, z, 2);
    const crossing = (tx: number, tz: number): [number, number] => {
      let best: [number, number] = [streetX(Math.round((tx - streetX(0)) / 22)), streetZ(Math.round((tz - streetZ(0)) / 22))];
      let bd = 1e9;
      for (let i = -24; i <= 24; i++) {
        for (let j = -6; j <= 16; j++) {
          const x = streetX(i);
          const z = streetZ(j);
          const d = Math.hypot(x - tx, z - tz);
          if (d < bd && [[0, -6], [0, 6], [-6, 0], [6, 0]].every(([dx, dz]) => onStreet(x + dx, z + dz))) {
            bd = d;
            best = [x, z];
          }
        }
      }
      return best;
    };
    for (const [cx, cz] of [crossing(-171, 59), crossing(100, 150)]) {
      for (const [dx, dz, along] of [
        [0, -6, "x"],
        [0, 6, "x"],
        [-6, 0, "z"],
        [6, 0, "z"],
      ] as const) {
        EVENT_META.pride.colours.forEach((c, k) => {
          const w = 0.72;
          const off = (k - 2.5) * w;
          const x = cx + dx + (along === "x" ? off : 0);
          const z = cz + dz + (along === "z" ? off : 0);
          const m = new Mesh(new PlaneGeometry(along === "x" ? w : 6, along === "x" ? 6 : w), new MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.15 }));
          m.rotation.x = -Math.PI / 2;
          m.position.set(x, surfaceAt(x, z, lowEnd ? 2 : 1) + 0.12, z);
          m.visible = false;
          rainbow.push(m);
        });
      }
    }
    // string lights in the street trees near the stations
    const trees = getTreeData(lowEnd).filter((t) => !SPECIES[t.sp].ever && t.s > 0.6 && STATION_XZ.some(([x, z]) => Math.hypot(t.x - x, t.z - z) < 140)).slice(0, lowEnd ? 300 : 700);
    const lights = points(trees.length * 6, 0.55, true);
    trees.forEach((t, i) => {
      const [w, h] = SPECIES[t.sp].size;
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = (0.15 + Math.random() * 0.25) * w * t.s;
        lights.pos.set([t.x + Math.cos(a) * rr, t.y + h * t.s * (0.45 + Math.random() * 0.4), t.z + Math.sin(a) * rr], (i * 6 + k) * 3);
        col.setHex(EVENT_META.brightnights.colours[(i * 6 + k) % 3]);
        lights.colour.set([col.r, col.g, col.b], (i * 6 + k) * 3);
      }
    });
    // diyas along the station canopies
    const f = makeFrame();
    const diyaList: number[] = [];
    stationS.forEach((ss) => {
      frameAt(ss, f);
      for (const side of [-1, 1]) for (let a = -12; a <= 12; a += 1.2) {
        const v = f.p.clone().addScaledVector(f.r, side * 12.2).addScaledVector(UP, 6.4).addScaledVector(f.t, a);
        diyaList.push(v.x, v.y, v.z);
      }
    });
    const diyas = points(diyaList.length / 3, 0.7, true);
    diyas.pos.set(diyaList);
    for (let i = 0; i < diyaList.length / 3; i++) {
      col.setHex(i % 4 ? 0xffc04a : 0xff8a1f);
      diyas.colour.set([col.r, col.g, col.b], i * 3);
    }
    // marigold garlands, scalloped just below the diyas' line
    const garlands = points(diyaList.length / 3, 0.9, false);
    for (let i = 0; i < diyaList.length / 3; i++) {
      garlands.pos.set([diyaList[i * 3], diyaList[i * 3 + 1] - 0.5 - Math.abs(Math.sin(i * 0.9)) * 0.7, diyaList[i * 3 + 2]], i * 3);
      col.setHex(i % 3 ? 0xff9933 : 0xffc21a);
      garlands.colour.set([col.r, col.g, col.b], i * 3);
    }
    // fireworks over English Bay
    const N = 6;
    const P = lowEnd ? 90 : 140;
    const fw = points(N * P, 3.2, true);
    (fw.pts.material as PointsMaterial).sizeAttenuation = true;
    const vel = new Float32Array(N * P * 3);
    const bursts = Array.from({ length: N }, (_, i) => ({ t: -i * 0.7, life: 2.6 }));
    for (const o of [lights, diyas, garlands, fw]) (o.pts.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    return { lanterns, lanternMat, rainbow, lights, diyas, garlands, fw, vel, bursts, N, P };
  }, [lowEnd]);

  useEffect(
    () => () => {
      extras.lanterns.geometry.dispose();
      for (const m of extras.rainbow) m.geometry.dispose();
      for (const o of [extras.lights, extras.diyas, extras.garlands, extras.fw]) o.pts.geometry.dispose();
    },
    [extras],
  );

  const clock = useRef({ t: 0, tick: 0 });
  useFrame((state, delta) => {
    const st = useTrain.getState();
    const dt = Math.min(delta, 0.05) * st.sim.warp;
    const c = clock.current;
    c.t += dt;
    c.tick += dt;
    const ev = st.event;
    const isNight = night.current;
    const { buildings: B, mats, events } = world;
    // monuments' LED patterns ten times a second (colours change slowly; the nodes twinkle), crowns and accents every frame
    if (c.tick > 0.1) {
      c.tick = 0;
      tickEventLights(events, ev, c.t, isNight ? 1 : 0.33);
    }
    eventColour(ev, 0, c.t, B.crownA.emissive);
    eventColour(ev, 1, c.t, B.crownB.emissive);
    mats.edge.forEach((m, i) => (ev && isNight ? eventColour(ev, i % 2, c.t, m.emissive) : m.emissive.copy(VIOLET)));
    // the guideway's LED line and the train's light line take the event's colours after dark too
    for (const [m, i] of [
      [mats.trainLine, 0],
      [mats.guideLed, 1],
    ] as const) {
      if (ev && isNight) eventColour(ev, i, c.t, m.emissive);
      else m.emissive.copy(VIOLET);
    }
    mats.guideLed.emissiveIntensity = 0.3 + (world.look.cur?.edge ?? 0.4) * 1.6;
    // platform banners fly the event's two colours day and night
    mats.bannerA.visible = mats.bannerB.visible = !!ev;
    if (ev) {
      eventColour(ev, 0, 0, mats.bannerA.color);
      eventColour(ev, 1, 0, mats.bannerB.color);
    }
    mats.underGlow.color.copy(mats.trainLine.emissive);
    // extras
    extras.lanterns.visible = ev === "lunar";
    extras.lanternMat.emissiveIntensity = isNight ? 2.2 : 0.3;
    for (const m of extras.rainbow) m.visible = ev === "pride";
    extras.lights.pts.visible = ev === "brightnights" && isNight;
    extras.diyas.pts.visible = ev === "diwali" && isNight;
    extras.garlands.pts.visible = ev === "vaisakhi";
    // fireworks are decoration: real time, only lightly sped up by warp, with drag per second
    const dtR = Math.min(delta, 0.05) * Math.min(st.sim.warp, 8);
    const drag = Math.pow(0.4, dtR);
    const fwOn = ev === "light" && isNight;
    extras.fw.pts.visible = fwOn;
    if (fwOn) {
      const { fw, vel, bursts, P } = extras;
      bursts.forEach((b, i) => {
        const prev = b.t;
        b.t += dtR;
        if (b.t > b.life || (prev < 0 && b.t >= 0)) {
          const ox = -450 + Math.random() * 110;
          const oy = 60 + Math.random() * 40;
          const oz = 30 + Math.random() * 90;
          col.setHex(EVENT_META.light.colours[Math.floor(Math.random() * 4)]);
          for (let k = 0; k < P; k++) {
            const j = (i * P + k) * 3;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(Math.random() * 2 - 1);
            const sp = 9 + Math.random() * 6;
            fw.pos.set([ox, oy, oz], j);
            vel.set([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp], j);
            fw.colour.set([col.r, col.g, col.b], j);
          }
          b.t = 0;
        }
        if (b.t < 0) return;
        for (let k = 0; k < P; k++) {
          const j = (i * P + k) * 3;
          fw.pos[j] += vel[j] * dtR;
          fw.pos[j + 1] += vel[j + 1] * dtR;
          fw.pos[j + 2] += vel[j + 2] * dtR;
          vel[j + 1] -= 6 * dtR;
          vel[j] *= drag;
          vel[j + 2] *= drag;
          fw.colour[j] *= drag;
          fw.colour[j + 1] *= drag;
          fw.colour[j + 2] *= drag;
        }
      });
      (fw.pts.geometry.attributes.position as BufferAttribute).needsUpdate = true;
      (fw.pts.geometry.attributes.color as BufferAttribute).needsUpdate = true;
    }
  }, -40);

  return (
    <>
      <primitive object={extras.lanterns} />
      {extras.rainbow.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <primitive object={extras.lights.pts} />
      <primitive object={extras.diyas.pts} />
      <primitive object={extras.garlands.pts} />
      <primitive object={extras.fw.pts} />
    </>
  );
}

