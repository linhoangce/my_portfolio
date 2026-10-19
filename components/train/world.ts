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
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  type Scene,
  ShaderMaterial,
  SphereGeometry,
  type SpotLight,
  type Texture,
  Vector3,
  type WebGLRenderer,
  type IUniform,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { createBuildingMaterials, paintFacadeArrays, type BuildingMaterials } from "./buildings/facadeArray";
import { Rng } from "./cityModel";
import { createEventLights, type EventLights } from "./eventLights";
import type { Season } from "./lookTypes";
import type { LookTargets } from "./lookModel";
import { fernTexture, groundTexture, interiorTextures, personTexture, streetLightTexture } from "./textures";
import { paintTreeAtlas } from "./trees/atlas";
import { createTreeShading, type TreeShading } from "./trees/treeMaterial";
import { PEOPLE_VARIANTS } from "./constants";

export type SkyUniforms = { top: IUniform<Color>; hor: IUniform<Color> };

export type World = {
  lowEnd: boolean;
  gl: WebGLRenderer;
  scene: Scene & { background: Color; fog: FogExp2 };
  envTex: Texture;
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
    /** Lamp-post banners in the event's two colours; hidden when no event is on. */
    bannerA: MeshStandardMaterial;
    bannerB: MeshStandardMaterial;
    fern: MeshStandardMaterial;
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
    car: MeshStandardMaterial;
    carTrim: MeshStandardMaterial;
    people: MeshStandardMaterial[];
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
  sunDir: Vector3;
};

export const WorldContext = createContext<World | null>(null);
export function useWorld(): World {
  const w = useContext(WorldContext);
  if (!w) throw new Error("useWorld outside <WorldProvider>");
  return w;
}

export function createWorld(gl: WebGLRenderer, scene: Scene, lowEnd: boolean): World {
  const rng = new Rng(20261018);
  const pmrem = new PMREMGenerator(gl);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

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
  // the street tile and its lights show only where the vertex `street` weight says the city is; elsewhere plain
  // ground (grass by day, near-black by night), whose colour applyLook sets with the map
  const groundPlain = { value: new Color(0x10161f) };
  ground.userData.plain = groundPlain;
  ground.onBeforeCompile = (shader) => {
    shader.uniforms.uPlain = groundPlain;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float street;\nvarying float vStreet;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStreet = street;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uPlain;\nvarying float vStreet;")
      .replace(
        "#include <map_fragment>",
        "#ifdef USE_MAP\n  vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n  diffuseColor *= mix( vec4( uPlain, 1.0 ), sampledDiffuseColor, clamp( vStreet, 0.0, 1.0 ) );\n#endif",
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= clamp( vStreet, 0.0, 1.0 );");
  };

  const mats: World["mats"] = {
    concrete: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    walk: new MeshStandardMaterial({ color: 0x9b8b74, roughness: 0.95 }),
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
    mountain: new MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: true }),
    plat: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    canopy: new MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.5, metalness: 0.2, side: 2 }),
    post: new MeshStandardMaterial({ color: 0x8e95a3, roughness: 0.5, metalness: 0.6 }),
    lamp: new MeshStandardMaterial({ color: 0x222222, emissive: 0xffdcb0, emissiveIntensity: 1.4 }),
    edge: [],
    girder: new MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.55, envMap: envTex, envMapIntensity: 0.25 }),
    planter: new MeshStandardMaterial({ color: 0x43683a, roughness: 1 }),
    bannerA: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: 2 }),
    bannerB: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: 2 }),
    fern: new MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.4, side: 2, roughness: 1 }),
    pane: new MeshStandardMaterial({ color: 0xd6e6f0, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.26, depthWrite: false, side: 2, envMap: envTex, envMapIntensity: 1 }),
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
    car: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35, envMap: envTex, envMapIntensity: 0.5 }),
    carTrim: new MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.35, metalness: 0.2, envMap: envTex, envMapIntensity: 0.6 }),
    people: Array.from({ length: PEOPLE_VARIANTS }, (_, v) => new MeshStandardMaterial({ map: personTexture(v + 1), alphaTest: 0.5, side: 2, roughness: 1 })),
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
  const skyMat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { top: { value: new Color() }, hor: { value: new Color() } },
    vertexShader:
      "varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "uniform vec3 top; uniform vec3 hor; varying vec3 vW; void main(){ float h = normalize(vW).y; float m = smoothstep(-0.02, 0.45, h); gl_FragColor = vec4(mix(hor, top, m), 1.0); }",
  }) as ShaderMaterial & { uniforms: SkyUniforms };
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
    rainPos[i * 6] = (rng.next() - 0.5) * 120;
    rainPos[i * 6 + 1] = rng.next() * 60;
    rainPos[i * 6 + 2] = (rng.next() - 0.5) * 120;
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
    trees: createTreeShading(paintTreeAtlas(), lowEnd),
    buildings: createBuildingMaterials(paintFacadeArrays(lowEnd), envTex),
    events: createEventLights(),
    look: { cur: null, tgt: null, lastSeason: null },
    sunDir: new Vector3(0, 1, 0),
  };
}
