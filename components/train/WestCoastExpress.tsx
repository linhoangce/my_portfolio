"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, type BufferGeometry, CanvasTexture, CatmullRomCurve3, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, SRGBColorSpace, TubeGeometry, Vector3 } from "three";

import { ribbon } from "./Guideway";
import { merged, type Part } from "./merge";
import { lit, shopGlow } from "./pavilion";
import { tunnelPortal } from "./portal";
import { guideAt, YARD_TRACKS, yardPoint, yardTop } from "./railYard";
import { buildYard } from "./railYardKit";
import { SEABUS_SIGN } from "./SeaBus";
import { paint } from "./shapes";
import { sdfAt } from "./terrain";
import { type Frame, UP } from "./track";
import { WCE_HALF, WCE_LEN, WCE_PLATFORM, WCE_PTS, WCE_S, wceBed, wceBedAt } from "./wce";
import { bedProfile } from "./bedLift";
import { GAP } from "./constants";
import { carGeometry } from "./trainGeometry";
import { useWorld } from "./world";

const PURPLE = 0x5b2a86;
/** The two tracks' centres, either side of the line. */
const TRACKS = [-2.1, 2.1];
/** A set: four pearl cars (trainGeometry.ts) of this length, a nose at each end. */
const CAR = 9.2;
const N_CARS = 4;
const SET = N_CARS * CAR + (N_CARS - 1) * GAP;
/** The tunnel portal's length over the line's east end (the waiting train fits inside). */
const PORTAL_LEN = 50;

/** Frames along the drawn line every `step`, on its bed (clear of the ground as drawn: wce.ts wceBed). */
function frames(step: number, lowEnd: boolean): Frame[] {
  const bed = wceBed(lowEnd);
  const out: Frame[] = [];
  for (let i = 0; i < WCE_PTS.length; i += step) {
    const [x, z] = WCE_PTS[i];
    const [ax, az] = WCE_PTS[Math.max(0, i - 1)];
    const [bx, bz] = WCE_PTS[Math.min(WCE_PTS.length - 1, i + 1)];
    const t = new Vector3(bx - ax, 0, bz - az).normalize();
    out.push({ p: new Vector3(x, bed[i], z), t, r: new Vector3().crossVectors(t, UP).normalize() });
  }
  return out;
}

/** The point and heading at distance s along the line. */
function at(s: number, out: { x: number; z: number; tx: number; tz: number }) {
  let i = 1;
  while (i < WCE_S.length - 1 && WCE_S[i] < s) i++;
  const u = Math.min(1, Math.max(0, (s - WCE_S[i - 1]) / (WCE_S[i] - WCE_S[i - 1] || 1)));
  const [ax, az] = WCE_PTS[i - 1];
  const [bx, bz] = WCE_PTS[i];
  const L = Math.hypot(bx - ax, bz - az) || 1;
  out.x = ax + (bx - ax) * u;
  out.z = az + (bz - az) * u;
  out.tx = (bx - ax) / L;
  out.tz = (bz - az) / L;
}

/** Where car k of a set (0 the lead) stands, back from the set's head at s. */
const carAt = (head: number, k: number) => head - CAR / 2 - k * (CAR + GAP);

/** The sets' cars: the end cars' body, glass and light line, the middle cars', and every car's skirt. */
type Cars = { noses: InstancedMesh[]; mids: InstancedMesh[]; skirts: InstancedMesh };
const turn = new Matrix4().makeRotationY(Math.PI);
const back = new Matrix4();

/** Stand car k of set j at m (along +x, facing the set's way); the last car is turned round, so its nose leads back. */
function setCar(cars: Cars, j: number, k: number, m: Matrix4): void {
  cars.skirts.setMatrixAt(j * N_CARS + k, m);
  if (k > 0 && k < N_CARS - 1) {
    for (const im of cars.mids) im.setMatrixAt(2 * j + k - 1, m);
    return;
  }
  const at = k === 0 ? m : back.multiplyMatrices(m, turn);
  for (const im of cars.noses) im.setMatrixAt(2 * j + (k === 0 ? 0 : 1), at);
}

/**
 * The West Coast Express along the waterfront (wce.ts): two tracks on a ballast bed, ending at Waterfront in buffer
 * stops (the line's terminus) and, out east past the port, running into a tunnel portal under a planted berm (the line
 * carries on beyond the map); a platform by Waterfront under a canopy with its name; a train laid up on the far track,
 * and one that waits at the platform, runs out east into the tunnel, waits there and comes back: each four pearl cars
 * (trainGeometry.ts), as the Canada Line's, the line's purple their light line.
 */
export function WestCoastExpress() {
  const world = useWorld();
  const { mats, lowEnd } = world;
  const built = useMemo(() => {
    if (WCE_PTS.length < 4) return null;
    const fr = frames(lowEnd ? 2 : 1, lowEnd);
    // the bed, its shoulders falling into the ground either side
    const bed = ribbon(bedProfile(WCE_HALF), fr, false);
    // the rail yard on the fill north of the line (railYard.ts), in these same meshes
    const yard = buildYard(lowEnd);
    const sleepers = merged([...TRACKS.map((l) => ({ geo: ribbon([[l + 1.3, 0.06], [l - 1.3, 0.06]], fr, false, 0.65) })), ...yard.sleepers.map((geo) => ({ geo }))]);
    const rails = merged(
      TRACKS.flatMap((l) =>
        [-0.72, 0.72].map((side) => ({
          geo: new TubeGeometry(new CatmullRomCurve3(fr.map((f) => f.p.clone().addScaledVector(f.r, l + side).addScaledVector(UP, 0.14)), false, "catmullrom", 0), fr.length * 2, 0.07, 4, false),
        })),
      ),
    );
    // the platform on the inland side of the first stretch, under a canopy with a purple fascia
    const f0 = fr[Math.round((WCE_PLATFORM[0] + WCE_PLATFORM[1]) / 2 / 2 / (lowEnd ? 2 : 1))];
    const inland = sdfAt(f0.p.x + f0.r.x * 8, f0.p.z + f0.r.z * 8) >= sdfAt(f0.p.x - f0.r.x * 8, f0.p.z - f0.r.z * 8) ? 1 : -1;
    const span = fr.filter((_, i) => {
      const s = WCE_S[i * (lowEnd ? 2 : 1)];
      return s >= WCE_PLATFORM[0] && s <= WCE_PLATFORM[1];
    });
    const plat: BufferGeometry[] = [];
    const canopy: Part[] = [];
    const trim: BufferGeometry[] = [];
    if (span.length > 1) {
      const sd = (a: number, b: number): [number, number][] => (inland > 0 ? [[a, 0], [b, 0], [b, 1.1], [a, 1.1]] : [[-b, 0], [-a, 0], [-a, 1.1], [-b, 1.1]]);
      plat.push(ribbon(sd(4.5, 9.8), span));
      plat.push(ribbon(inland > 0 ? [[4.6, 4.6], [10.2, 4.6], [10.2, 4.85], [4.6, 4.85]] : [[-10.2, 4.6], [-4.6, 4.6], [-4.6, 4.85], [-10.2, 4.85]], span));
      trim.push(ribbon(inland > 0 ? [[4.5, 4.45], [4.6, 4.45], [4.6, 4.95], [4.5, 4.95]] : [[-4.6, 4.45], [-4.5, 4.45], [-4.5, 4.95], [-4.6, 4.95]], span));
      for (let i = 0; i < span.length; i += lowEnd ? 3 : 4) {
        const f = span[i];
        const c = f.p.clone().addScaledVector(f.r, inland * 9.3);
        canopy.push({ geo: new BoxGeometry(0.16, 3.6, 0.16), position: [c.x, c.y + 2.9, c.z] });
      }
    }
    // the name on the canopy's fascia, facing the tracks; and on the same canvas and mesh, Waterfront's SeaBus sign on
    // its float's roof (SeaBus.tsx SEABUS_SIGN), so neither costs a draw of its own
    const tex = (() => {
      const cv = document.createElement("canvas");
      cv.width = 1024;
      cv.height = 256;
      const g = cv.getContext("2d");
      if (g) {
        const rows: [string, string][] = [
          ["West Coast Express · Waterfront", "#5b2a86"],
          ["Waterfront · SeaBus", "#1f6fb2"],
        ];
        rows.forEach(([text, bg], k) => {
          g.fillStyle = bg;
          g.fillRect(0, k * 128, 1024, 128);
          g.fillStyle = "#ffffff";
          g.font = "600 64px system-ui, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(text, 512, k * 128 + 66);
        });
      }
      const t = new CanvasTexture(cv);
      t.colorSpace = SRGBColorSpace;
      return t;
    })();
    // a plane showing row k of the two
    const row = (w: number, h: number, k: number) => {
      const g = new PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (k + 1 - uv.getY(i)) / 2);
      return g;
    };
    const plates: BufferGeometry[] = [row(9, 1.4, 1).rotateY(SEABUS_SIGN.ry).translate(SEABUS_SIGN.x, SEABUS_SIGN.y, SEABUS_SIGN.z)];
    if (span.length > 1) {
      const f = span[span.length >> 1];
      const c = f.p.clone().addScaledVector(f.r, inland * 4.45).addScaledVector(UP, 4.0);
      const o = new Object3D();
      o.position.copy(c);
      o.lookAt(c.clone().addScaledVector(f.r, -inland));
      o.updateMatrix();
      plates.push(row(14, 1.75, 0).applyMatrix4(o.matrix));
    }
    const sign = new Mesh(merged(plates.map((geo) => ({ geo }))), new MeshBasicMaterial({ map: tex, toneMapped: false }));
    // the cars, turned to run along +x as the line's frames have them: the end cars with a nose (the last turned round,
    // instances 2j and 2j + 1 of set j), the middle ones without (the same); the running set first, then the one laid up
    // on the far track, then the yard's
    const sets = 2 + yard.wceHeads.length;
    const lineMat = new MeshStandardMaterial({ color: 0x1b1530, emissive: 0x9b6cf0, emissiveIntensity: 1 });
    const fleet = (nose: boolean) => {
      const g = carGeometry(CAR, nose, false, lowEnd ? 14 : 22);
      return [new InstancedMesh(g.body.rotateY(Math.PI / 2), mats.body, 2 * sets), new InstancedMesh(g.glass.rotateY(Math.PI / 2), mats.window, 2 * sets), new InstancedMesh(g.line.rotateY(Math.PI / 2), lineMat, 2 * sets)];
    };
    const noses = fleet(true);
    const mids = fleet(false);
    // a dark skirt over the running gear under each car
    const skirts = new InstancedMesh(new BoxGeometry(CAR - 1.2, 0.62, 2.3).translate(0, 0.42, 0), mats.trim, N_CARS * sets);
    noses[0].castShadow = mids[0].castShadow = !lowEnd;
    const cars: Cars = { noses, mids, skirts };
    for (const m of [...noses, ...mids, skirts]) m.frustumCulled = false;
    yard.wceHeads.forEach((h, j) => {
      const m = new Matrix4();
      const stand = (s: number) => {
        const p = guideAt(s);
        const [x, z] = yardPoint(s, YARD_TRACKS[0]);
        // on the yard's rail heads (railYardKit.ts lays them 0.36 over its top)
        return m.compose(new Vector3(x, yardTop(s) + 0.36, z), new Quaternion().setFromAxisAngle(UP, Math.atan2(-p.tz, p.tx)), new Vector3(1, 1, 1));
      };
      for (let k = 0; k < N_CARS; k++) setCar(cars, 2 + j, k, stand(carAt(h, k)));
    });
    // the terminus: a buffer stop on each track (red and white beam on two posts, a red lamp), a concrete end block
    const ends: Part[] = [];
    {
      const f = fr[0];
      const ry = Math.atan2(f.t.x, f.t.z);
      const put = (w: number, h: number, d: number, lat: number, y: number, along: number, hex: number, glow = 0) => {
        const c = f.p.clone().addScaledVector(f.r, lat).addScaledVector(f.t, along);
        const g = paint(new BoxGeometry(w, h, d).rotateY(ry), hex);
        ends.push({ geo: glow ? lit(g, glow) : g, position: [c.x, c.y + y, c.z] });
      };
      put(WCE_HALF * 2 + 0.4, 0.9, 1.4, 0, 0.45, -1.6, 0xb9b4aa);
      for (const l of TRACKS) {
        for (const side of [-0.72, 0.72]) put(0.16, 1.3, 0.16, l + side, 0.65, 0.2, 0x3a3f46);
        for (let k = 0; k < 4; k++) put(0.55, 0.36, 0.3, l - 0.825 + k * 0.55, 1.05, 0.2, k % 2 ? 0xeef0f2 : 0xc0392b);
        put(0.22, 0.22, 0.22, l, 1.42, 0.2, 0xe5302a, 1);
      }
    }
    // the tunnel portal over the line's last stretch, out east past the port: the train waits inside it
    const mouthAt = fr.findIndex((_, i) => WCE_S[i * (lowEnd ? 2 : 1)] >= WCE_LEN - PORTAL_LEN);
    // the dark lining runs nearly the berm's length: the train waits inside it
    const portal = tunnelPortal(fr.slice(Math.max(0, mouthAt)), { mouthW: WCE_HALF * 2 + 1, mouthH: 6, below: 0.6, half: WCE_HALF + 4, crest: 9, drop: 3, trees: lowEnd ? 10 : 18, shrubs: true, depth: PORTAL_LEN - 3 });
    ends.push(
      ...portal.berm.map((g) => ({ geo: paint(g, 0x5f7d45) })),
      ...portal.wall.map((g) => ({ geo: paint(g, 0xbdb8ad) })),
      ...portal.mouth.map((g) => ({ geo: paint(g, 0x0b0d10) })),
      ...portal.band.map((g) => ({ geo: paint(g, PURPLE) })),
    );
    // everything that stands still but the sleepers (their texture), painted into one mesh
    const fixed = merged([
      { geo: paint(bed, 0x3a3f46) },
      { geo: paint(rails, 0x7a6250) },
      ...plat.map((g) => ({ geo: paint(g, 0xd9dbdd) })),
      ...(canopy.length ? [{ geo: paint(merged(canopy), 0x8e95a3) }] : []),
      ...trim.map((g) => ({ geo: paint(g, PURPLE) })),
      ...ends,
      ...yard.painted.map((geo) => ({ geo })),
    ]);
    // the yard's lamps and the buffer stops' lamps glow after dark
    const fixedMat = shopGlow(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: 2 }), world);
    return { fixed, fixedMat, sleepers, sign, cars, lineMat, tex };
  }, [lowEnd, mats, world]);

  useEffect(
    () => () => {
      if (!built) return;
      const { noses, mids, skirts } = built.cars;
      for (const g of [built.fixed, built.sleepers, built.sign.geometry]) g.dispose();
      for (const m of [...noses, ...mids, skirts]) {
        m.geometry.dispose();
        m.dispose();
      }
      for (const m of [built.lineMat, built.fixedMat]) m.dispose();
      built.tex.dispose();
    },
    [built],
  );

  // the timetable: wait at Waterfront, out east into the tunnel, wait, back
  const p = useMemo(() => ({ x: 0, z: 0, tx: 1, tz: 0 }), []);
  useFrame(({ clock }) => {
    if (!built) return;
    const home = (WCE_PLATFORM[0] + WCE_PLATFORM[1]) / 2 + SET / 2;
    const away = WCE_LEN - 2;
    const run = Math.max(1, (away - home) / 9);
    const cycle = 2 * (24 + run);
    const T = clock.elapsedTime % cycle;
    const ease = (u: number) => u * u * (3 - 2 * u);
    // the east end of the train (the lead car's nose)
    const head = T < 24 ? home : T < 24 + run ? home + (away - home) * ease((T - 24) / run) : T < 48 + run ? away : away - (away - home) * ease((T - 48 - run) / run);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const v = new Vector3();
    const place = (s: number, lane: number): Matrix4 => {
      at(Math.max(0, Math.min(WCE_LEN, s)), p);
      const y = wceBedAt(Math.max(0, Math.min(WCE_LEN, s)), lowEnd) + 0.15;
      v.set(p.x - p.tz * lane, y, p.z + p.tx * lane);
      q.setFromAxisAngle(UP, Math.atan2(-p.tz, p.tx));
      return m4.compose(v, q, new Vector3(1, 1, 1));
    };
    // the running train on the near track, the laid-up one alongside the platform on the far one
    const trains: [number, number, number][] = [
      [0, head, TRACKS[1]],
      [1, home, TRACKS[0]],
    ];
    for (const [i, h, lane] of trains) for (let k = 0; k < N_CARS; k++) setCar(built.cars, i, k, place(carAt(h, k), lane));
    for (const m of [...built.cars.noses, ...built.cars.mids, built.cars.skirts]) m.instanceMatrix.needsUpdate = true;
  });

  if (!built) return null;
  return (
    <>
      <mesh geometry={built.fixed} material={built.fixedMat} receiveShadow />
      <mesh geometry={built.sleepers} material={mats.sleepers} receiveShadow />
      <primitive object={built.sign} />
      {[...built.cars.noses, ...built.cars.mids, built.cars.skirts].map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
