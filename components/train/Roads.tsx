"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { type Junction, junction, nodeDeck, type REdge, roads, WALK } from "./roadNetwork";
import { surfaceAt } from "./terrain";
import { useWorld } from "./world";

/** How far above the drawn ground the roads and the junctions ride (the polygon offset does the rest). */
const LIFT = 0.07;
const CHUNK = 512;

/** Vertex buffers for one chunk of road. */
class Strips {
  pos: number[] = [];
  uv: number[] = [];
  road: number[] = [];
  ends: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, u: number, v: number, half: number, walk: number, lanes: number, code: number, ea: number, eb: number) {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    this.road.push(half, walk, lanes, code);
    this.ends.push(ea, eb);
    return this.pos.length / 3 - 1;
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute("aRoad", new BufferAttribute(new Float32Array(this.road), 4));
    g.setAttribute("aEnds", new BufferAttribute(new Float32Array(this.ends), 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The road material: one quad across each road, its markings drawn from the uv (across, -1 at the right kerb to +1 at
 * the left, then along in world units) and per-vertex road data (half-width, sidewalk, lanes each way, and a code of
 * class + 4 × one-way + 16 × median + 32 × subway): asphalt, kerbs and sidewalks; a double yellow line down a two-way
 * arterial or collector (a planted median where a divided road was merged; over the Broadway Subway its route, lit,
 * with a pulse running west toward UBC); dashed white lanes; zebra crossings and stop lines at signalled junctions
 * (aEnds: distance from each signalled end); and after dark warm pools under the street lamps.
 */
function roadMaterial(): { mat: MeshStandardMaterial; night: { value: number }; time: { value: number } } {
  const night = { value: 0 };
  const time = { value: 0 };
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aRoad;\nattribute vec2 aEnds;\nvarying vec4 vRoad;\nvarying vec2 vEnds;\nvarying vec2 vRUv;\nvarying vec2 vRW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRoad = aRoad;\nvEnds = aEnds;\nvRUv = uv;\nvRW = position.xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform float uNight;",
          "uniform float uTime;",
          "varying vec4 vRoad;",
          "varying vec2 vEnds;",
          "varying vec2 vRUv;",
          "varying vec2 vRW;",
          "float rHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }",
        ].join("\n"),
      )
      .replace(
        "#include <map_fragment>",
        [
          "{",
          "  float hw = vRoad.x;",
          "  float walk = vRoad.y;",
          "  float lanes = max( 1.0, vRoad.z );",
          "  float code = vRoad.w;",
          "  float cls = mod( code, 4.0 );",
          "  float oneway = mod( floor( code / 4.0 ), 4.0 );",
          "  float median = mod( floor( code / 16.0 ), 2.0 );",
          "  float sub = floor( code / 32.0 );",
          "  float l = vRUv.x * hw;",
          "  float al = abs( l );",
          "  float c = hw - walk;",
          "  float along = vRUv.y;",
          "  float grain = rHash( floor( vRW * 3.0 ) );",
          "  vec3 col = vec3( 0.2, 0.21, 0.23 ) * ( 0.9 + 0.12 * grain );",
          "  float dash = step( fract( along / 5.0 ), 0.45 );",
          "  if ( hw > 50.0 ) {",
          // a junction: plain asphalt
          "  } else if ( al > c + 0.12 ) {",
          "    col = vec3( 0.66, 0.65, 0.62 ) * ( 0.94 + 0.08 * grain );",
          "    if ( fract( along / 1.8 ) < 0.04 ) col *= 0.88;",
          "  } else if ( al > c ) {",
          "    col = vec3( 0.78, 0.77, 0.74 );",
          "  } else {",
          "    if ( oneway < 0.5 ) {",
          "      if ( median > 0.5 ) {",
          "        if ( al < 0.5 ) col = vec3( 0.3, 0.42, 0.24 ) * ( 0.85 + 0.2 * grain );",
          "        else if ( al < 0.6 ) col = vec3( 0.75 );",
          "      } else if ( cls < 2.5 && al > 0.05 && al < 0.17 ) col = vec3( 0.93, 0.74, 0.18 );",
          "      float w = c / lanes;",
          "      for ( int k = 1; k < 4; k++ ) {",
          "        if ( float( k ) >= lanes ) break;",
          "        if ( abs( al - w * float( k ) ) < 0.06 && dash > 0.5 ) col = vec3( 0.88 );",
          "      }",
          "    } else {",
          "      float w = 2.0 * c / lanes;",
          "      for ( int k = 1; k < 4; k++ ) {",
          "        if ( float( k ) >= lanes ) break;",
          "        if ( abs( l + c - w * float( k ) ) < 0.06 && dash > 0.5 ) col = vec3( 0.88 );",
          "      }",
          "    }",
          "    if ( cls < 1.5 && abs( al - ( c - 0.22 ) ) < 0.05 ) col = vec3( 0.86 );",
          // the Broadway Subway's route down the middle of Broadway, in the line's yellow
          "    if ( sub > 0.5 && al < 0.2 ) col = vec3( 0.62, 0.5, 0.1 );",
          // zebra crossings at a signalled end, then the stop line on the lanes coming in
          "    float cr = min( vEnds.x, vEnds.y );",
          "    if ( cr > 0.0 && cr < 1.3 && fract( l / 0.6 ) < 0.5 ) col = vec3( 0.9 );",
          "    if ( vEnds.y > 1.55 && vEnds.y < 1.8 && l < 0.0 ) col = vec3( 0.9 );",
          "    if ( vEnds.x > 1.55 && vEnds.x < 1.8 && l > 0.0 ) col = vec3( 0.9 );",
          "  }",
          "  diffuseColor.rgb *= col;",
          "}",
        ].join("\n"),
      )
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "{",
          // a lamp every 14 units, staggered side to side, on arterials and collectors
          "  float hw = vRoad.x;",
          "  if ( hw < 50.0 && mod( vRoad.w, 4.0 ) < 2.5 ) {",
          "    float l = vRUv.x * hw;",
          "    float side = mod( floor( vRUv.y / 14.0 ), 2.0 ) < 0.5 ? 1.0 : -1.0;",
          "    float d = length( vec2( fract( vRUv.y / 14.0 ) * 14.0 - 7.0, l - side * ( hw - 0.6 ) ) );",
          "    totalEmissiveRadiance += vec3( 1.0, 0.72, 0.42 ) * uNight * 0.32 * exp( -d * d / 9.0 );",
          "  }",
          // the subway's route lit, a pulse running west along it toward UBC every few seconds, as a train below
          "  float sb = floor( vRoad.w / 32.0 );",
          "  if ( hw < 50.0 && sb > 0.5 && abs( vRUv.x * hw ) < 0.2 ) {",
          "    float ph = fract( ( ( sb < 1.5 ? 1.0 : -1.0 ) * vRUv.y - uTime * 14.0 ) / 56.0 );",
          "    float pulse = smoothstep( 0.86, 0.97, ph ) * ( 1.0 - smoothstep( 0.97, 1.0, ph ) );",
          "    totalEmissiveRadiance += vec3( 0.98, 0.8, 0.08 ) * ( 0.12 + uNight * 0.4 + pulse * 1.6 );",
          "  }",
          "}",
        ].join("\n"),
      );
  };
  mat.customProgramCacheKey = () => "road";
  return { mat, night, time };
}

/**
 * Vancouver's streets as the ride draws them (roads.ts): every road a strip draped on the ground with its markings in
 * the shader, junctions as asphalt polygons the strips stop at, and where a road crosses the Grandview Cut a deck
 * with parapets. In 512-unit chunks so the camera's frustum culls them.
 */
export function Roads() {
  const world = useWorld();
  const { mats, lowEnd } = world;
  const stride = lowEnd ? 2 : 1;

  const built = useMemo(() => {
    const { nodes, edges } = roads();
    const chunks = new Map<number, Strips>();
    const chunkOf = (x: number, z: number) => {
      const k = Math.floor(x / CHUNK) * 1000 + Math.floor(z / CHUNK);
      let c = chunks.get(k);
      if (!c) {
        c = new Strips();
        chunks.set(k, c);
      }
      return c;
    };
    const jn = new Map<number, Junction>();
    const jy = new Map<number, number | null>();
    nodes.forEach((n, i) => {
      if (n.deg < 3) return;
      const j = junction(i);
      if (!j) return;
      jn.set(i, j);
      jy.set(i, nodeDeck(i));
    });
    const deckParts: BufferGeometry[] = [];
    const STEP = lowEnd ? 3.5 : 2.2;
    const strip = (e: REdge) => {
      const n = e.pts.length / 2;
      const sA = jn.get(e.a)?.setback.get(edges.indexOf(e)) ?? 0;
      const sB = jn.get(e.b)?.setback.get(edges.indexOf(e)) ?? 0;
      const code = e.cls + 4 * (e.oneway === 1 ? 1 : e.oneway === -1 ? 2 : 0) + 16 * (e.median ? 1 : 0) + 32 * e.subway;
      const lanes = e.oneway ? e.lanes : e.lanes;
      const sigA = nodes[e.a].signal ? 1 : 0;
      const sigB = nodes[e.b].signal ? 1 : 0;
      const c = chunkOf(e.pts[(n >> 1) * 2], e.pts[(n >> 1) * 2 + 1]);
      // rows at every segment end and subdivision inside [sA, len - sB], and exactly at both ends of that run, so a
      // short block's strip still meets the junctions; a hidden segment breaks the strip
      const rows: { s: number; i: number }[] = [];
      for (let i = 0; i + 1 < n; i++) {
        const L = e.cum[i + 1] - e.cum[i];
        const m = Math.max(1, Math.ceil(L / STEP));
        for (let k = 0; k <= m; k++) rows.push({ s: e.cum[i] + (L * k) / m, i: Math.min(i, n - 2) });
      }
      const s0 = Math.min(sA, e.len / 2 - 0.05);
      const s1 = Math.max(e.len - sB, e.len / 2 + 0.05);
      const segOf = (sv: number) => {
        for (let i = 0; i + 1 < n; i++) if (e.cum[i + 1] >= sv) return i;
        return n - 2;
      };
      const list = [{ s: s0, i: segOf(s0) }, ...rows.filter((r) => r.s > s0 + 0.05 && r.s < s1 - 0.05), { s: s1, i: segOf(s1) }];
      let prev = -1;
      let prevSeg = -1;
      for (const { s: sv, i } of list) {
        if (!e.shown[i] || (prevSeg >= 0 && [...Array(i - prevSeg + 1).keys()].some((k) => !e.shown[prevSeg + k]))) {
          prev = -1;
          prevSeg = e.shown[i] ? i : -1;
          if (!e.shown[i]) continue;
        }
        const ax = e.pts[i * 2];
        const az = e.pts[i * 2 + 1];
        const bx = e.pts[i * 2 + 2];
        const bz = e.pts[i * 2 + 3];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const tx = (bx - ax) / L;
        const tz = (bz - az) / L;
        // the left of travel from a to b
        const nx = tz;
        const nz = -tx;
        const u = Math.min(1, Math.max(0, (sv - e.cum[i]) / (e.cum[i + 1] - e.cum[i] || 1)));
        const x = ax + (bx - ax) * u;
        const z = az + (bz - az) * u;
        const deck = e.deck[i] === 1;
        const yDeck = e.y[i] + (e.y[i + 1] - e.y[i]) * u + 0.12;
        const lx = x + nx * e.half;
        const lz = z + nz * e.half;
        const rx = x - nx * e.half;
        const rz = z - nz * e.half;
        const ea = sigA ? sv - sA : 999;
        const eb = sigB ? e.len - sB - sv : 999;
        // on a bridge the deck's height, unless the bank under it is higher (at its ends)
        // over a crease of the drawn ground that bulges between the two edges, the strip rises by the bulge
        const er = surfaceAt(rx, rz, stride);
        const el = surfaceAt(lx, lz, stride);
        const bulge = Math.max(0, surfaceAt(x, z, stride) - (er + el) / 2);
        const yr = er + LIFT + bulge;
        const yl = el + LIFT + bulge;
        const r0 = c.vert(rx, deck ? Math.max(yDeck, yr) : yr, rz, -1, sv, e.half, WALK[e.cls], lanes, code, ea, eb);
        c.vert(lx, deck ? Math.max(yDeck, yl) : yl, lz, 1, sv, e.half, WALK[e.cls], lanes, code, ea, eb);
        // wound to face up: right, ahead-right, left
        if (prev >= 0) c.idx.push(prev, r0, prev + 1, prev + 1, r0, r0 + 1);
        prev = r0;
        prevSeg = i;
      }
      // a bridge over the cut: a slab under the road and a parapet each side, both stopping at a junction's corners
      // (the junction has its own slab), so no parapet runs across another road
      for (let i = 0; i + 1 < n; i++) {
        if (!e.deck[i] || !e.shown[i]) continue;
        const c0 = Math.max(e.cum[i], sA);
        const c1 = Math.min(e.cum[i + 1], e.len - sB);
        if (c1 - c0 < 0.05) continue;
        const ax0 = e.pts[i * 2];
        const az0 = e.pts[i * 2 + 1];
        const L0 = e.cum[i + 1] - e.cum[i] || 1;
        const tx = (e.pts[i * 2 + 2] - ax0) / L0;
        const tz = (e.pts[i * 2 + 3] - az0) / L0;
        const yAt = (sv: number) => e.y[i] + ((e.y[i + 1] - e.y[i]) * (sv - e.cum[i])) / L0;
        const L = c1 - c0;
        const mid = (c0 + c1) / 2 - e.cum[i];
        const mx = ax0 + tx * mid;
        const mz = az0 + tz * mid;
        const my = (yAt(c0) + yAt(c1)) / 2;
        const ry = Math.atan2(tx, tz);
        // pitched with the deck, which climbs from one bank's lip to the other's
        const pitch = -Math.atan2(yAt(c1) - yAt(c0), L);
        const over = (c0 > e.cum[i] + 1e-3 ? 0 : 0.1) + (c1 < e.cum[i + 1] - 1e-3 ? 0 : 0.1);
        deckParts.push(new BoxGeometry(e.half * 2 + 0.4, 0.9, L + over).rotateX(pitch).rotateY(ry).translate(mx, my - 0.33, mz));
        for (const side of [-1, 1]) deckParts.push(new BoxGeometry(0.3, 1.0, L + over).rotateX(pitch).rotateY(ry).translate(mx + tz * side * (e.half + 0.05), my + 0.6, mz - tx * side * (e.half + 0.05)));
      }
    };
    edges.forEach(strip);
    // the junctions: a fan from the node, each point on the drawn ground
    for (const [ni, j] of jn) {
      const c = chunkOf(j.x, j.z);
      // on a deck over the cut the junction is level with it, else it lies on the ground
      const deck = jy.get(ni);
      const yAt = (x: number, z: number) => Math.max(deck != null ? deck + 0.13 : -1e9, surfaceAt(x, z, stride) + LIFT + 0.01);
      const centre = c.vert(j.x, yAt(j.x, j.z), j.z, 0, 0, 99, 0, 1, 0, 999, 999);
      const first = c.pos.length / 3;
      for (const [x, z] of j.poly) c.vert(x, yAt(x, z), z, 0, 0, 99, 0, 1, 0, 999, 999);
      const m = j.poly.length;
      for (let i = 0; i < m; i++) c.idx.push(centre, first + ((i + 1) % m), first + i);
      // on a deck, a slab under the junction joining its roads' slabs
      if (deck != null) {
        const pos: number[] = [];
        const top = deck + 0.12;
        for (let i = 0; i < m; i++) {
          const [x0, z0] = j.poly[i];
          const [x1, z1] = j.poly[(i + 1) % m];
          // the top, as a fan, and the side down to the slab's foot
          pos.push(j.x, top, j.z, x1, top, z1, x0, top, z0);
          pos.push(x0, top, z0, x1, top, z1, x0, top - 0.9, z0, x1, top, z1, x1, top - 0.9, z1, x0, top - 0.9, z0);
        }
        const g = new BufferGeometry();
        g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
        g.computeVertexNormals();
        deckParts.push(g);
      }
    }
    const { mat, night, time } = roadMaterial();
    const meshes = [...chunks.values()].filter((c) => c.idx.length).map((c) => {
      const m = new Mesh(c.geometry(), mat);
      m.receiveShadow = true;
      return m;
    });
    // the junction slabs carry no texture coordinates: neither do the boxes merged with them
    const decks = deckParts.length
      ? mergeGeometries(
          deckParts.map((g) => {
            const ng = g.index ? g.toNonIndexed() : g.clone();
            ng.deleteAttribute("uv");
            return ng;
          }),
          false,
        )
      : null;
    for (const g of deckParts) g.dispose();
    return { meshes, mat, night, time, decks };
  }, [lowEnd, stride]);

  useEffect(
    () => () => {
      for (const m of built.meshes) m.geometry.dispose();
      built.decks?.dispose();
      built.mat.dispose();
    },
    [built],
  );

  // the lamps come on with the city's windows; the subway's pulses run on the scene's clock
  useFrame((state) => {
    built.time.value = state.clock.elapsedTime;
    built.night.value = mats.lamp.emissiveIntensity > 0 ? Math.min(1, world.buildings.solid.emissiveIntensity * 1.1) : 0;
  });

  return (
    <>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {built.decks && <mesh geometry={built.decks} material={mats.girder} castShadow={!lowEnd} receiveShadow />}
    </>
  );
}
