/**
 * Everything the look touches, created once per canvas: shared materials, the environment map, lights, the sky,
 * precipitation buffers and a few refs that scene components register on mount.
 */
import { createContext, useContext } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeUVReflectionMapping,
  DataTexture,
  DirectionalLight,
  FogExp2,
  GLSL3,
  HalfFloatType,
  HemisphereLight,
  LineBasicMaterial,
  LinearFilter,
  LinearSRGBColorSpace,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  RedFormat,
  RGBAFormat,
  type Scene,
  ShaderMaterial,
  SphereGeometry,
  type SpotLight,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
  type IUniform,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

import { createBuildingMaterials, paintFacadeArrays, type BuildingMaterials } from "./buildings/facadeArray";
import { Rng } from "./cityModel";
import { createEventLights, type EventLights } from "./eventLights";
import { applyMirror } from "./waterMirror";
import type { Season } from "./lookTypes";
import type { LookTargets } from "./lookModel";
import { groundTexture, hedgeTexture, interiorTextures, peopleAtlas, sleeperTexture, streetLightTexture } from "./textures";
import { paintTreeAtlas, treeAtlasTexture } from "./trees/atlas";
import { createTreeShading, type TreeShading } from "./trees/treeMaterial";
import { SEA } from "./constants";
import { lakeLevel } from "./terrain";

/**
 * The sky dome's inputs: zenith and horizon colours, the sun's direction and colour (for its glow), and the clouds
 * (how much of the sky they cover, their lit and shaded colours, and the time they drift by).
 */
export type SkyUniforms = {
  top: IUniform<Color>;
  hor: IUniform<Color>;
  sun: IUniform<Vector3>;
  sunCol: IUniform<Color>;
  cloud: IUniform<number>;
  cloudCol: IUniform<Color>;
  cloudShade: IUniform<Color>;
  time: IUniform<number>;
};

/** The people's atlas on one material: each instance's `aCell` (0–15) picks its quarter-by-quarter cell. */
function peopleMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: peopleAtlas(), alphaTest: 0.5, side: 2, roughness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = (vMapUv + vec2(mod(aCell, 4.0), 3.0 - floor(aCell / 4.0))) * 0.25;");
  };
  m.customProgramCacheKey = () => "people-atlas";
  return m;
}

export type World = {
  lowEnd: boolean;
  gl: WebGLRenderer;
  scene: Scene & { background: Color; fog: FogExp2 };
  /** What metal and glass reflect: grey until fillEnvironment renders the room into it. */
  envTex: Texture;
  fillEnvironment: () => void;
  /** Paint the trees' atlas (once): the trees' own stage calls it. */
  paintTrees: () => void;
  rng: Rng;
  mats: {
    concrete: MeshStandardMaterial;
    walk: MeshStandardMaterial;
    plate: MeshStandardMaterial;
    rail: MeshStandardMaterial;
    ground: MeshStandardMaterial;
    water: MeshStandardMaterial;
    park: MeshStandardMaterial;
    forestFloor: MeshStandardMaterial;
    landmark: MeshStandardMaterial;
    mast: MeshStandardMaterial;
    sail: MeshStandardMaterial;
    dome: MeshStandardMaterial;
    silver: MeshStandardMaterial;
    mountain: MeshStandardMaterial;
    plat: MeshStandardMaterial;
    canopy: MeshStandardMaterial;
    post: MeshStandardMaterial;
    lamp: MeshStandardMaterial;
    edge: MeshStandardMaterial[];
    /** The 2100 kit: white U-girder and Y piers, planters and hanging ferns, glass panes, timber, living roofs. */
    girder: MeshStandardMaterial;
    planter: MeshStandardMaterial;
    /** The clipped hedge on each planter box, the dark track slab and the sleepers under the rails. */
    hedge: MeshStandardMaterial;
    bed: MeshStandardMaterial;
    sleepers: MeshStandardMaterial;
    /** Lamp-post banners in the event's two colours; hidden when no event is on. */
    bannerA: MeshStandardMaterial;
    bannerB: MeshStandardMaterial;
    pane: MeshStandardMaterial;
    timber: MeshStandardMaterial;
    roofGreen: MeshStandardMaterial;
    /** The LED line along the guideway fascia and the light line along each car; colours follow the event at night. */
    guideLed: MeshStandardMaterial;
    trainLine: MeshStandardMaterial;
    underGlow: MeshBasicMaterial;
    body: MeshPhysicalMaterial;
    trim: MeshStandardMaterial;
    window: MeshStandardMaterial;
    head: MeshStandardMaterial;
    tail: MeshStandardMaterial;
    /** Every pedestrian: one material over the people's atlas, its cell picked per instance (aCell). */
    people: MeshStandardMaterial;
  };
  tex: { ground: { day: Texture; night: Texture } };
  lights: { hemi: HemisphereLight; sun: DirectionalLight; stationLight: PointLight; spots: SpotLight[] };
  sky: { mesh: Mesh; mat: ShaderMaterial & { uniforms: SkyUniforms }; disc: Mesh<SphereGeometry, MeshBasicMaterial>; stars: Points };
  precip: {
    rain: LineSegments;
    rainPos: Float32Array;
    rainVel: Float32Array;
    RAIN_N: number;
    snow: Points;
    snowPos: Float32Array;
    SNOW_N: number;
  };
  refs: {
    mountain: Mesh | null;
    mountainCols: { summer: BufferAttribute; winter: BufferAttribute } | null;
    bloom: { strength: number } | null;
  };
  look: { cur: LookTargets | null; tgt: LookTargets | null; lastSeason: Season | null };
  trees: TreeShading;
  buildings: BuildingMaterials;
  events: EventLights;
  /** How brightly the shops' lit parts glow (pavilion.ts shopGlow): 0 by day, about 1 after dark; the look eases it. */
  shopGlow: IUniform<number>;
  sunDir: Vector3;
};

export const WorldContext = createContext<World | null>(null);
export function useWorld(): World {
  const w = useContext(WorldContext);
  if (!w) throw new Error("useWorld outside <WorldProvider>");
  return w;
}

/** The far terrain's haze, eased by the look: the colour it fades to, the colour snow fades to, and how fast. */
export type MountainHaze = { uHaze: IUniform<Color>; uHazeHi: IUniform<Color>; uHazeK: IUniform<number>; uHazeFrom: IUniform<number> };

/**
 * The far terrain: vertex-coloured and flat-shaded, and fading with distance into the air between, as the North Shore
 * does from the city: the forested slopes to a deep blue, the snow to a pale blue-white, the nearer hills hardly at
 * all. The fade is on the lit colour, before the fog, so the far ridges lose their shading as real ones do.
 */
function mountainMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: true });
  const haze: MountainHaze = { uHaze: { value: new Color(0x2d4e78) }, uHazeHi: { value: new Color(0xe2ebf6) }, uHazeK: { value: 0.0012 }, uHazeFrom: { value: 260 } };
  mat.userData.haze = haze;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, haze);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uHaze;\nuniform vec3 uHazeHi;\nuniform float uHazeK;\nuniform float uHazeFrom;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nfloat hazeAlb = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );")
      .replace(
        "#include <opaque_fragment>",
        [
          "float hazeK = 1.0 - exp( -max( 0.0, length( vViewPosition ) - uHazeFrom ) * uHazeK );",
          "outgoingLight = mix( outgoingLight, mix( uHaze, uHazeHi, smoothstep( 0.45, 0.8, hazeAlb ) ), hazeK * 0.88 );",
          "#include <opaque_fragment>",
        ].join("\n"),
      );
  };
  return mat;
}

/**
 * The environment metal and glass reflect, a PMREM of three's room, as its generator lays one out (768 × 1024, cube-UV,
 * half float): every material takes this target from the start, so its shader is the one it keeps, and it is grey until
 * fillEnvironment renders the room into it. That rendering (and its shaders) is a second or more the first stage need
 * not wait for.
 */
function environmentTarget(gl: WebGLRenderer): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(3 * Math.max(256, 112), 4 * 256, { magFilter: LinearFilter, minFilter: LinearFilter, generateMipmaps: false, type: HalfFloatType, format: RGBAFormat, colorSpace: LinearSRGBColorSpace, depthBuffer: false });
  rt.texture.mapping = CubeUVReflectionMapping;
  rt.texture.name = "PMREM.cubeUv";
  const prev = gl.getRenderTarget();
  const clear = gl.getClearColor(new Color());
  const alpha = gl.getClearAlpha();
  gl.setRenderTarget(rt);
  gl.setClearColor(new Color(0.42, 0.44, 0.47), 1);
  gl.clear(true, false, false);
  gl.setRenderTarget(prev);
  gl.setClearColor(clear, alpha);
  return rt;
}

/** Render the room's PMREM and copy it, texel for texel, into the target the materials hold. */
function fillEnvironment(gl: WebGLRenderer, into: WebGLRenderTarget): void {
  const pmrem = new PMREMGenerator(gl);
  const room = pmrem.fromScene(new RoomEnvironment(), 0.04);
  pmrem.dispose();
  const copy = new FullScreenQuad(
    new ShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { src: { value: room.texture } },
      vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: "uniform sampler2D src;\nout vec4 colour;\nvoid main() { colour = texelFetch(src, ivec2(gl_FragCoord.xy), 0); }",
      depthTest: false,
      depthWrite: false,
    }),
  );
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(into);
  copy.render(gl);
  gl.setRenderTarget(prev);
  copy.material.dispose();
  copy.dispose();
  room.dispose();
}

export function createWorld(gl: WebGLRenderer, scene: Scene, lowEnd: boolean): World {
  const rng = new Rng(20261018);
  const env = environmentTarget(gl);
  const envTex = env.texture;
  let envFilled = false;
  const treeAtlas = treeAtlasTexture();
  let treesPainted = false;

  scene.background = new Color();
  scene.fog = new FogExp2(0x000000, 0.003);

  const groundTex = { day: groundTexture(false, rng), night: groundTexture(true, rng) };
  const winTex = interiorTextures();

  const ground = new MeshStandardMaterial({ map: groundTex.night, roughness: 1, vertexColors: true });
  ground.envMap = envTex;
  ground.envMapIntensity = 0;
  // street lights: a glow map on the same tile, brought up with the windows after dark
  ground.emissiveMap = streetLightTexture();
  ground.emissive.set(0xffffff);
  ground.emissiveIntensity = 0;
  // the yards-and-gardens tile shows only on the city's land (the land-use raster, set by the Ground); elsewhere plain
  // ground (grass by day, near-black by night), whose colour applyLook sets with the map
  const groundPlain = { value: new Color(0x10161f) };
  const groundZone = { value: new DataTexture(new Uint8Array([0]), 1, 1, RedFormat) as Texture };
  const groundZoneBox = { value: new Vector4(0, 0, 1, 1) };
  // the east basin's water mask (Ground sets it): the ground is cut away exactly at the drawn shore
  const groundBasin = { value: new DataTexture(new Uint8Array([0]), 1, 1, RedFormat) as Texture };
  const groundBasinBox = { value: new Vector4(0, 0, 0, 0) };
  // a rectangle the ground leaves open (the Canada Line's hall at Waterfront): centre x, z, half length, half width,
  // and the direction of its length
  const groundHole = { value: new Vector4(0, 0, 0, 0) };
  const groundHoleDir = { value: new Vector2(1, 0) };
  ground.userData.hole = groundHole;
  ground.userData.holeDir = groundHoleDir;
  ground.userData.plain = groundPlain;
  ground.userData.zone = groundZone;
  ground.userData.zoneBox = groundZoneBox;
  ground.userData.basin = groundBasin;
  ground.userData.basinBox = groundBasinBox;
  ground.onBeforeCompile = (shader) => {
    shader.uniforms.uPlain = groundPlain;
    shader.uniforms.uZone = groundZone;
    shader.uniforms.uZoneBox = groundZoneBox;
    shader.uniforms.uBasin = groundBasin;
    shader.uniforms.uBasinBox = groundBasinBox;
    shader.uniforms.uHole = groundHole;
    shader.uniforms.uHoleDir = groundHoleDir;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aShore;\nvarying vec2 vGroundXZ;\nvarying float vShore;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundXZ = position.xz;\nvShore = aShore;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform vec3 uPlain;",
          "uniform sampler2D uZone;",
          "uniform vec4 uZoneBox;",
          "uniform sampler2D uBasin;",
          "uniform vec4 uBasinBox;",
          "uniform vec4 uHole;",
          "uniform vec2 uHoleDir;",
          "varying vec2 vGroundXZ;",
          // distance to the shore: streets stop short of the water, leaving the shore to the seawall and the grass
          "varying float vShore;",
          // the city's land (the land-use raster over the terrain box, set by the Ground), softened at its edges
          "float cityLand( vec2 p ) {",
          "  vec2 t = ( p - uZoneBox.xy ) / uZoneBox.zw;",
          "  if ( t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0 ) return 0.0;",
          "  return smoothstep( 0.2, 0.8, texture2D( uZone, t ).r );",
          "}",
        ].join("\n"),
      )
      .replace(
        "#include <map_fragment>",
        "#ifdef USE_MAP\n  vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n  diffuseColor *= mix( vec4( uPlain, 1.0 ), sampledDiffuseColor, cityLand( vGroundXZ ) * smoothstep( 3.0, 7.0, vShore ) );\n#endif",
      )
      // the street lamps' pools are the roads' own (Roads.tsx): the ground itself gives no light
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.0;")
      .replace(
        "#include <clipping_planes_fragment>",
        [
          "#include <clipping_planes_fragment>",
          "{",
          "  vec2 bt = ( vGroundXZ - uBasinBox.xy ) / max( uBasinBox.zw, vec2( 1e-3 ) );",
          "  if ( bt.x > 0.0 && bt.y > 0.0 && bt.x < 1.0 && bt.y < 1.0 && texture2D( uBasin, bt ).r > 0.5 ) discard;",
          "  vec2 hd = vGroundXZ - uHole.xy;",
          "  if ( uHole.z > 0.0 && abs( dot( hd, uHoleDir ) ) < uHole.z && abs( dot( hd, vec2( -uHoleDir.y, uHoleDir.x ) ) ) < uHole.w ) discard;",
          "}",
        ].join("\n"),
      );
  };

  const mats: World["mats"] = {
    concrete: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    walk: new MeshStandardMaterial({ color: 0xa3a6aa, roughness: 0.95 }),
    plate: new MeshStandardMaterial({ color: 0x8c949c, metalness: 0.7, roughness: 0.55, envMap: envTex, envMapIntensity: 0.2 }),
    rail: new MeshStandardMaterial({ color: 0x7a6250, metalness: 0.6, roughness: 0.55, envMap: envTex, envMapIntensity: 0.25 }),
    ground,
    water: new MeshStandardMaterial({ color: 0xffffff, metalness: 0.25, roughness: 0.22, envMap: envTex, envMapIntensity: 0.45 }),
    park: new MeshStandardMaterial({ color: 0x5f8f4a, roughness: 1 }),
    forestFloor: new MeshStandardMaterial({ color: 0x46613d, roughness: 1 }),
    landmark: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    mast: new MeshStandardMaterial({ color: 0x8e95a3, roughness: 0.5, metalness: 0.6 }),
    sail: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: 2 }),
    dome: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }),
    silver: new MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.7, roughness: 0.35, envMap: envTex, envMapIntensity: 0.5, flatShading: true }),
    mountain: mountainMaterial(),
    plat: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    canopy: new MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.5, metalness: 0.2, side: 2 }),
    post: new MeshStandardMaterial({ color: 0x8e95a3, roughness: 0.5, metalness: 0.6 }),
    lamp: new MeshStandardMaterial({ color: 0x222222, emissive: 0xffdcb0, emissiveIntensity: 1.4 }),
    edge: [],
    girder: new MeshStandardMaterial({ color: 0xe0e1dd, roughness: 0.6, envMap: envTex, envMapIntensity: 0.2 }),
    planter: new MeshStandardMaterial({ color: 0xc9cbc6, roughness: 0.85 }),
    hedge: new MeshStandardMaterial({ map: hedgeTexture(), roughness: 1, side: 2 }),
    bed: new MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.95, side: 2 }),
    sleepers: new MeshStandardMaterial({ map: sleeperTexture(), roughness: 0.9, side: 2 }),
    bannerA: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: 2 }),
    bannerB: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: 2 }),
    // thin panes need no back-faces-first pass: one draw each, not two
    pane: new MeshStandardMaterial({ color: 0xd6e6f0, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.26, depthWrite: false, side: 2, forceSinglePass: true, envMap: envTex, envMapIntensity: 1 }),
    timber: new MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.7 }),
    roofGreen: new MeshStandardMaterial({ color: 0x5b8a45, roughness: 1 }),
    guideLed: new MeshStandardMaterial({ color: 0x1b1530, emissive: 0xa78bfa, emissiveIntensity: 0.6 }),
    trainLine: new MeshStandardMaterial({ color: 0x1b1530, emissive: 0xa78bfa, emissiveIntensity: 1 }),
    underGlow: new MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    body: new MeshPhysicalMaterial({ color: 0xf3f4f6, metalness: 0.15, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMap: envTex, envMapIntensity: 0.6 }),
    trim: new MeshStandardMaterial({ color: 0x2a3039, roughness: 0.6, metalness: 0.4, envMap: envTex, envMapIntensity: 0.25 }),
    window: new MeshStandardMaterial({
      map: winTex.map,
      emissiveMap: winTex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.2,
      roughness: 0.06,
      metalness: 0.2,
      envMap: envTex,
      envMapIntensity: 1.1,
    }),
    head: new MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff5e0, emissiveIntensity: 1.7 }),
    tail: new MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a2a, emissiveIntensity: 2.5 }),
    people: peopleMaterial(),
  };

  // lights
  const hemi = new HemisphereLight(0xffffff, 0x000000, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  sun.castShadow = !lowEnd;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 520 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  const stationLight = new PointLight(0xffdcb0, 70, 44, 2);

  // sky dome, sun / moon disc, stars
  // the sky: deepening from a hazy horizon to the zenith, a glow round the sun, and clouds drifting on a plane over
  // the city (so they crowd toward the horizon), lit on top and shaded beneath; written out in the display's colour
  // space like everything else
  const sunDir = new Vector3(0, 1, 0);
  const skyUniforms: SkyUniforms = {
    top: { value: new Color() },
    hor: { value: new Color() },
    sun: { value: sunDir },
    sunCol: { value: new Color() },
    cloud: { value: 0.3 },
    cloudCol: { value: new Color(0xffffff) },
    cloudShade: { value: new Color(0xb8c4d4) },
    time: { value: 0 },
  };
  const skyMat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader:
      "varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform vec3 sunCol;",
      "uniform float cloud; uniform vec3 cloudCol; uniform vec3 cloudShade; uniform float time;",
      "varying vec3 vW;",
      "float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }",
      "float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );",
      "  return mix( mix( h21( i ), h21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }",
      "float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i++ ) { s += a * vn( p ); p = p * 2.03 + vec2( 17.1, 9.2 ); a *= 0.5; } return s; }",
      "void main() {",
      "  vec3 d = normalize( vW );",
      "  float h = d.y;",
      "  vec3 c = mix( hor, top, pow( smoothstep( -0.02, 0.6, h ), 0.7 ) );",
      "  float sd = max( dot( d, normalize( sun ) ), 0.0 );",
      "  c += sunCol * ( pow( sd, 10.0 ) * 0.18 + pow( sd, 300.0 ) * 0.5 );",
      "  if ( h > 0.0 && cloud > 0.01 ) {",
      "    vec2 p = d.xz / max( h, 0.05 ) * 0.9 + vec2( time * 0.006, time * 0.0025 );",
      "    float n = fbm( p );",
      "    float thr = 0.72 - cloud * 0.42;",
      "    float cov = smoothstep( thr, thr + 0.16, n ) * smoothstep( 0.0, 0.08, h );",
      "    float lit = smoothstep( 0.25, 0.85, fbm( p * 1.9 + vec2( 3.1, 7.7 ) ) );",
      "    vec3 cc = mix( cloudShade, cloudCol, lit ) + sunCol * pow( sd, 6.0 ) * 0.25;",
      // clouds near the horizon are seen through the haze
      "    cc = mix( cc, hor, smoothstep( 0.25, 0.0, h ) * 0.6 );",
      "    c = mix( c, cc, cov );",
      "  }",
      "  gl_FragColor = vec4( c, 1.0 );",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  }) as ShaderMaterial & { uniforms: SkyUniforms };
  // the sea mirrors the city (Mirror renders the reflection on desktop) and the sky
  applyMirror(mats.water, SEA, lakeLevel(), skyUniforms, sunDir);
  skyMat.toneMapped = false;
  const skyMesh = new Mesh(new SphereGeometry(2600, 32, 16), skyMat);
  skyMesh.frustumCulled = false;
  const disc = new Mesh(new SphereGeometry(1, 24, 16), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }));
  const starN = lowEnd ? 900 : 1800;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const a = rng.next() * Math.PI * 2;
    const e = Math.asin(rng.next() * 0.95 + 0.04);
    const r = 2500;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute("position", new BufferAttribute(starPos, 3));
  const stars = new Points(starGeo, new PointsMaterial({ color: 0xaab6d4, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
  stars.frustumCulled = false;

  // precipitation around the camera
  const RAIN_N = lowEnd ? 900 : 2000;
  const SNOW_N = lowEnd ? 800 : 1800;
  const rainPos = new Float32Array(RAIN_N * 6);
  const rainVel = new Float32Array(RAIN_N);
  const snowPos = new Float32Array(SNOW_N * 3);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 6] = (rng.next() - 0.5) * 70;
    rainPos[i * 6 + 1] = rng.next() * 50 - 20;
    rainPos[i * 6 + 2] = (rng.next() - 0.5) * 70;
    rainVel[i] = 55 + rng.next() * 25;
  }
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3] = (rng.next() - 0.5) * 120;
    snowPos[i * 3 + 1] = rng.next() * 60;
    snowPos[i * 3 + 2] = (rng.next() - 0.5) * 120;
  }
  const rainGeo = new BufferGeometry();
  rainGeo.setAttribute("position", new BufferAttribute(rainPos, 3));
  const rain = new LineSegments(rainGeo, new LineBasicMaterial({ color: 0xaab4c4, transparent: true, opacity: 0.22, fog: false }));
  rain.visible = false;
  rain.frustumCulled = false;
  const snowGeo = new BufferGeometry();
  snowGeo.setAttribute("position", new BufferAttribute(snowPos, 3));
  const snow = new Points(snowGeo, new PointsMaterial({ color: 0xffffff, size: 3.6, transparent: true, opacity: 0.9, sizeAttenuation: false, fog: false }));
  snow.visible = false;
  snow.frustumCulled = false;

  return {
    lowEnd,
    gl,
    scene: scene as World["scene"],
    envTex,
    rng,
    mats,
    tex: { ground: groundTex },
    lights: { hemi, sun, stationLight, spots: [] },
    sky: { mesh: skyMesh, mat: skyMat, disc, stars },
    precip: { rain, rainPos, rainVel, RAIN_N, snow, snowPos, SNOW_N },
    refs: { mountain: null, mountainCols: null, bloom: null },
    trees: createTreeShading(treeAtlas, lowEnd),
    paintTrees: () => {
      if (treesPainted) return;
      treesPainted = true;
      paintTreeAtlas(treeAtlas);
    },
    fillEnvironment: () => {
      if (envFilled) return;
      envFilled = true;
      fillEnvironment(gl, env);
    },
    buildings: createBuildingMaterials(paintFacadeArrays(lowEnd), envTex, skyMat.uniforms),
    events: createEventLights(),
    shopGlow: { value: 0 },
    look: { cur: null, tgt: null, lastSeason: null },
    sunDir,
  };
}
