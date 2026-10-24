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
import { useWorld } from "./world";

const PURPLE = 0x5b2a86;
const WHITE = 0xeef0f2;
const DARK = 0x1c2430;
/** The two tracks' centres, either side of the line. */
const TRACKS = [-2.1, 2.1];
const COACH = 8.2;
const LOCO = 7.2;
const N_COACH = 4;
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

/** A bi-level coach (along +x): white with a purple band, two rows of windows, a grey roof, on two bogies. */
function coachGeo(): BufferGeometry {
  return merged([
    { geo: paint(new BoxGeometry(COACH, 2.5, 1.9).translate(0, 1.75, 0), WHITE) },
    { geo: paint(new BoxGeometry(COACH + 0.02, 0.32, 1.92).translate(0, 1.0, 0), PURPLE) },
    { geo: paint(new BoxGeometry(COACH - 0.8, 0.42, 1.94).translate(0, 1.55, 0), DARK) },
    { geo: paint(new BoxGeometry(COACH - 0.8, 0.42, 1.94).translate(0, 2.3, 0), DARK) },
    { geo: paint(new BoxGeometry(COACH, 0.25, 1.7).translate(0, 3.1, 0), 0xb5b9be) },
    ...[-COACH / 2 + 1.3, COACH / 2 - 1.3].map((x) => ({ geo: paint(new BoxGeometry(1.8, 0.5, 1.6).translate(x, 0.3, 0), 0x22252a) })),
  ]);
}
/** The locomotive (cab toward +x): purple with a white stripe, a sloped cab front, a roof of grilles. */
function locoGeo(): BufferGeometry {
  return merged([
    { geo: paint(new BoxGeometry(LOCO, 2.4, 1.9).translate(0, 1.7, 0), PURPLE) },
    { geo: paint(new BoxGeometry(LOCO + 0.02, 0.25, 1.92).translate(0, 1.25, 0), WHITE) },
    { geo: paint(new BoxGeometry(0.9, 0.6, 1.8).translate(LOCO / 2 - 0.6, 2.4, 0), DARK) },
    { geo: paint(new BoxGeometry(LOCO - 1.6, 0.3, 1.5).translate(-0.6, 3.05, 0), 0x3b3f46) },
    ...[-LOCO / 2 + 1.2, LOCO / 2 - 1.2].map((x) => ({ geo: paint(new BoxGeometry(1.8, 0.5, 1.6).translate(x, 0.3, 0), 0x22252a) })),
  ]);
}

/**
 * The West Coast Express along the waterfront (wce.ts): two tracks on a ballast bed, ending at Waterfront in buffer
 * stops (the line's terminus) and, out east past the port, running into a tunnel portal under a planted berm (the line
 * carries on beyond the map); a platform by Waterfront under a canopy with its name; a train laid up on the far track,
 * and one (the locomotive at the east end, four bi-level coaches) that waits at the platform, runs out east into the
 * tunnel, waits there and comes back.
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
    const vehicleMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 });
    // the running train's locomotive and coaches first, then the train laid up on the far track, then the yard's sets
    const sets = 2 + yard.wceHeads.length;
    const coaches = new InstancedMesh(coachGeo(), vehicleMat, N_COACH * sets);
    const loco = new InstancedMesh(locoGeo(), vehicleMat, sets);
    yard.wceHeads.forEach((h, j) => {
      const m = new Matrix4();
      const stand = (s: number) => {
        const p = guideAt(s);
        const [x, z] = yardPoint(s, YARD_TRACKS[0]);
        return m.compose(new Vector3(x, yardTop(s) + 0.3, z), new Quaternion().setFromAxisAngle(UP, Math.atan2(-p.tz, p.tx)), new Vector3(1, 1, 1));
      };
      loco.setMatrixAt(2 + j, stand(h - LOCO / 2));
      for (let k = 0; k < N_COACH; k++) coaches.setMatrixAt((2 + j) * N_COACH + k, stand(h - LOCO - 0.4 - COACH / 2 - k * (COACH + 0.4)));
    });
    coaches.frustumCulled = false;
    loco.frustumCulled = false;
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
    return { fixed, fixedMat, sleepers, sign, coaches, loco, vehicleMat, tex };
  }, [lowEnd, world]);

  useEffect(
    () => () => {
      if (!built) return;
      for (const g of [built.fixed, built.sleepers, built.coaches.geometry, built.loco.geometry, built.sign.geometry]) g.dispose();
      for (const m of [built.vehicleMat, built.fixedMat]) m.dispose();
      built.tex.dispose();
    },
    [built],
  );

  // the timetable: wait at Waterfront, out east into the tunnel, wait, back
  const p = useMemo(() => ({ x: 0, z: 0, tx: 1, tz: 0 }), []);
  useFrame(({ clock }) => {
    if (!built) return;
    const TRAIN = LOCO + N_COACH * (COACH + 0.4);
    const home = (WCE_PLATFORM[0] + WCE_PLATFORM[1]) / 2 + TRAIN / 2;
    const away = WCE_LEN - 2;
    const run = Math.max(1, (away - home) / 9);
    const cycle = 2 * (24 + run);
    const T = clock.elapsedTime % cycle;
    const ease = (u: number) => u * u * (3 - 2 * u);
    // the east end of the train (the locomotive's front)
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
    for (const [i, h, lane] of trains) {
      built.loco.setMatrixAt(i, place(h - LOCO / 2, lane));
      for (let k = 0; k < N_COACH; k++) built.coaches.setMatrixAt(i * N_COACH + k, place(h - LOCO - 0.4 - COACH / 2 - k * (COACH + 0.4), lane));
    }
    built.loco.instanceMatrix.needsUpdate = true;
    built.coaches.instanceMatrix.needsUpdate = true;
    built.vehicleMat.color.copy(world.buildings.solid.color);
  });

  if (!built) return null;
  return (
    <>
      <mesh geometry={built.fixed} material={built.fixedMat} receiveShadow />
      <mesh geometry={built.sleepers} material={mats.sleepers} receiveShadow />
      <primitive object={built.sign} />
      <primitive object={built.coaches} />
      <primitive object={built.loco} />
    </>
  );
}
