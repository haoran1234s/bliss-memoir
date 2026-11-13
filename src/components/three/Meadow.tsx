/**
 * 草地：地面、随风起伏的草叶、花
 * ------------------------------------------------------------
 *   - 地面是一整块平面，草色深浅、小路、所有东西的影子都在片元着色器里合成
 *     （影子来自 textures.ts 烘焙的「地面图」，没有实时阴影的开销）；
 *   - 草叶是实例化的小三角片，只铺在镜头周围：位置对一块方形区域取模，
 *     镜头走到哪草就「长」到哪，世界再长草叶数量也不变；
 *   - 花是静态摆放的（花坛里密、草地上稀），沿小路分段剔除。
 *
 * 三者共用同一套取色 / 阴影函数，所以草叶的根部颜色和脚下的地面完全一致，
 * 远处没有草叶的地方也看不出接缝。
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useQuality } from '../../store/useQuality';
import { useStore } from '../../store/useStore';
import { makeMaterial } from '../../three/env';
import { bladeGeometry, flowerGeometry } from '../../three/geometry';
import { disposeTree, instanced, writeColor } from '../../three/instancing';
import { getNoise, groundMapTexture } from '../../three/textures';
import { PATH, place, type World } from '../../three/world';

/* ------------------------------------------------------------------ */
/*  共享 uniform 与 GLSL                                                */
/* ------------------------------------------------------------------ */
const c = (hex: string) => new THREE.Color(hex);

const meadow = {
  uNoise: { value: null as THREE.Texture | null },
  uMap: { value: null as THREE.Texture | null },
  /** 地面图覆盖的世界矩形：xMin, zMin, 宽, 深 */
  uMapRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  /** 小路：A, K, 半宽 */
  uPath: { value: new THREE.Vector3(PATH.A, PATH.K, PATH.HALF_W) },
  uPathRange: { value: new THREE.Vector2(-60, 100) },
  uGrassA: { value: c('#8ed45f') },
  uGrassB: { value: c('#b3e56c') },
  uGrassC: { value: c('#6fc566') },
  uPathA: { value: c('#fbe9cb') },
  uPathB: { value: c('#f0d7ad') },
  /** 影院的位置（xz）与朝向（xz），夜里银幕和灯串会照亮草坪 */
  uGlow: { value: new THREE.Vector4() },
};

const MEADOW = /* glsl */ `
uniform sampler2D uNoise;
uniform sampler2D uMap;
uniform vec4 uMapRect;
uniform vec3 uPath;
uniform vec2 uPathRange;
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uGrassC;
uniform vec4 uGlow;

// x 阴影 · y 花坛 · z 不长草
vec3 groundMap(vec2 xz) {
  return texture2D(uMap, (xz - uMapRect.xy) / uMapRect.zw).rgb;
}

// 0 草地 · 1 小路
float pathMask(vec2 xz, float grow) {
  float s = -xz.y;
  float ks = uPath.y * s;
  float px = uPath.x * (1.0 - cos(ks));
  float slope = uPath.x * uPath.y * sin(ks);
  float d = abs(xz.x - px) / sqrt(1.0 + slope * slope);
  float w = uPath.z + grow;
  float m = 1.0 - smoothstep(w - 0.06, w + 0.06, d);
  return m * smoothstep(uPathRange.x, uPathRange.x + 8.0, s) * (1.0 - smoothstep(uPathRange.y - 3.0, uPathRange.y, s));
}

vec3 grassAlbedo(vec2 xz, float bed) {
  float n = texture2D(uNoise, xz * 0.019).r;
  vec3 col = mix(uGrassC, uGrassA, smoothstep(0.15, 0.6, n));
  col = mix(col, uGrassB, smoothstep(0.55, 0.95, n) * 0.75);
  // 花坛里的草更嫩一点
  return mix(col, uGrassB, bed * 0.35);
}

// 朝上的面受到的光：天光 + 没被挡住的阳光 + 夜里影院的暖光
vec3 groundLight(vec2 xz, float shadow) {
  vec3 light = uAmbSky + uSunColor * 0.97 * (1.0 - shadow * uAtmo.y * 1.5);
  vec2 rel = xz - uGlow.xy;
  float front = dot(rel, uGlow.zw);
  float side = length(rel - uGlow.zw * front) / 6.0;
  float along = (front - 5.0) / 6.5;
  float glow = exp(-(along * along + side * side)) * step(-0.5, front);
  return light + vec3(1.0, 0.8, 0.52) * glow * uAtmo.w * 0.55;
}

// 风：一阵一阵扫过草地（0~1）
float gustAt(vec2 xz) {
  return texture2D(uNoise, xz * 0.017 - uWind.xy * uTime * 0.03).b;
}
`;

/* ------------------------------------------------------------------ */
/*  地面                                                               */
/* ------------------------------------------------------------------ */
const groundMaterial = makeMaterial({
  uniforms: meadow,
  vertex: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragment:
    MEADOW +
    /* glsl */ `
    uniform vec3 uPathA;
    uniform vec3 uPathB;
    varying vec3 vWorld;

    void main() {
      vec2 xz = vWorld.xz;
      vec3 map = groundMap(xz);
      vec3 col = grassAlbedo(xz, map.y);
      // 草地上细碎的明暗，近看不至于一片平
      float fine = texture2D(uNoise, xz * 0.37).g;
      col *= 0.93 + fine * 0.14;

      // 小路：边缘微微起伏，路面带一点颗粒和小石子
      // （贴图取样都放在分支外面：分支里取样时 mip 级别不确定，路沿会出现闪点）
      vec4 mid = texture2D(uNoise, xz * 0.1);
      vec4 tiny = texture2D(uNoise, xz * 1.7);
      float path = pathMask(xz, (mid.a - 0.5) * 0.22);
      vec3 sand = mix(uPathB, uPathA, smoothstep(0.2, 0.8, mid.r));
      sand *= 0.95 + tiny.g * 0.1;
      sand = mix(sand, vec3(1.0, 0.98, 0.94), smoothstep(0.83, 0.9, tiny.a) * 0.5);
      // 路沿留一道略深的边
      float rim = smoothstep(0.02, 0.5, path) * (1.0 - smoothstep(0.5, 1.0, path));
      sand = mix(sand, uPathB * 0.86, rim * 0.5);
      col = mix(col, sand, path);

      col *= groundLight(xz, map.x);
      outColor(withFog(col, vWorld), 1.0);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  草叶                                                               */
/* ------------------------------------------------------------------ */
const grassUniforms = {
  ...meadow,
  /** xy：草丛中心（世界 xz）；z、w：近 / 远两层的铺设边长 */
  uGrass: { value: new THREE.Vector4(0, 0, 16, 58) },
  /** x 叶宽 · y 叶高 */
  uBlade: { value: new THREE.Vector2(0.05, 0.3) },
  uTip: { value: c('#d6f58a') },
};

const grassMaterial = makeMaterial({
  side: THREE.DoubleSide,
  uniforms: grassUniforms,
  vertex:
    MEADOW +
    /* glsl */ `
    attribute vec3 aOffset;
    attribute vec4 aRand;
    uniform vec4 uGrass;
    uniform vec2 uBlade;
    uniform vec3 uTip;
    varying vec3 vColor;
    varying float vFog;

    void main() {
      float far = aOffset.z;
      float S = mix(uGrass.z, uGrass.w, far);
      // 对铺设边长取模：镜头走到哪，这片草就跟到哪
      vec2 root = (fract(aOffset.xy - uGrass.xy / S) - 0.5) * S + uGrass.xy;
      vec2 e = abs(root - uGrass.xy) / (S * 0.5);
      float fade = 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));

      vec3 map = groundMap(root);
      float keep = fade * (1.0 - pathMask(root, 0.04)) * (1.0 - map.z);
      float size = mix(1.0, 1.75, far) * (0.6 + aRand.y * 0.8);
      float height = uBlade.y * size * keep;
      float width = uBlade.x * mix(1.0, 1.7, far) * (0.75 + aRand.y * 0.4) * step(0.02, keep);

      float t = position.y;
      float gust = gustAt(root);
      float bend = ((gust - 0.4) * 0.9 + sin(uTime * 2.1 + root.x * 1.3 + root.y * 0.9 + aRand.x * 6.28) * 0.09) * uWind.z
        + (aRand.w - 0.5) * 0.5;

      float yaw = (aRand.x - 0.5) * 2.4;
      vec2 side = vec2(cos(yaw), sin(yaw));
      vec2 lean = normalize(uWind.xy + vec2(-side.y, side.x) * 0.45);

      vec3 p = vec3(root.x, 0.0, root.y);
      p.xz += side * position.x * width;
      p.xz += lean * bend * t * t * height * 0.85;
      p.y += t * height * (1.0 - 0.22 * bend * bend * t);

      // 根部与地面同色，越往叶尖越亮越黄；被风压弯的草会泛一层光
      vec3 base = grassAlbedo(root, map.y);
      vec3 albedo = mix(base * 0.9, mix(base, uTip, 0.42 + aRand.z * 0.3), t);
      vec3 light = groundLight(root, map.x);
      vColor = albedo * light + albedo * uSunColor * max(gust - 0.45, 0.0) * t * 0.5;

      vec4 mv = viewMatrix * vec4(p, 1.0);
      vFog = fogAmount(length(mv.xyz));
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: /* glsl */ `
    varying vec3 vColor;
    varying float vFog;
    void main() {
      outColor(mix(vColor, uSkyHorizon, vFog), 1.0);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  花                                                                 */
/* ------------------------------------------------------------------ */
const flowerMaterial = makeMaterial({
  side: THREE.DoubleSide,
  uniforms: { ...meadow, uStem: { value: c('#6dbb5a') } },
  vertex:
    MEADOW +
    /* glsl */ `
    attribute float aPart;
    attribute float aShade;
    attribute vec3 aShape;
    attribute vec3 aCentre;
    uniform vec3 uStem;
    varying vec3 vColor;
    varying float vFog;

    void main() {
      vec3 root = instanceMatrix[3].xyz;
      float seed = aShape.z;
      vec3 map = groundMap(root.xz);
      float keep = (1.0 - step(0.3, pathMask(root.xz, 0.12))) * (1.0 - step(0.5, map.z));
      float stem = aShape.x * keep;
      float head = aShape.y * keep;

      float gust = gustAt(root.xz);
      vec2 sway = uWind.xy * ((gust - 0.4) * 0.5 + sin(uTime * 1.7 + seed * 40.0) * 0.07) * stem * 0.7 * uWind.z;

      vec3 p;
      vec3 albedo;
      if (aPart < 0.5) {
        // 茎：两片交叉的细长面片
        float t = position.y;
        vec2 dir = position.z < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        p = vec3(dir.x * position.x * 0.014, t * stem, dir.y * position.x * 0.014);
        p.xz += sway * t * t;
        albedo = uStem * (0.8 + 0.2 * t);
      } else {
        // 花头：实例矩阵里带着朝向（略微仰向镜头，平视时也能看到花瓣正面）
        p = vec3(0.0, stem, 0.0) + mat3(instanceMatrix) * (position * head);
        p.xz += sway;
        albedo = (aPart < 1.5 ? instanceColor : aCentre) * aShade;
      }

      vec3 wp = root + p;
      vColor = albedo * groundLight(root.xz, map.x * 0.8) * 1.04;
      vec4 mv = viewMatrix * vec4(wp, 1.0);
      vFog = fogAmount(length(mv.xyz));
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: /* glsl */ `
    varying vec3 vColor;
    varying float vFog;
    void main() {
      outColor(mix(vColor, uSkyHorizon, vFog), 1.0);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  组装                                                               */
/* ------------------------------------------------------------------ */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Flower {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  stem: number;
  head: number;
  seed: number;
  color: string;
  centre: string;
}

/** 花瓣颜色 → 花心颜色 */
const FLOWERS: Array<[string, string]> = [
  ['#ffffff', '#ffc94d'],
  ['#ffffff', '#ffc94d'],
  ['#ffb3cf', '#fff1a8'],
  ['#ff8f9e', '#ffe08a'],
  ['#ffd866', '#ff9f5a'],
  ['#c9b0ff', '#fff1a8'],
  ['#a6dcff', '#fff6d0'],
];

function makeFlowers(world: World, budget: number): Flower[] {
  const rand = mulberry32(4242);
  const flowers: Flower[] = [];
  const euler = new THREE.Euler();

  const add = (x: number, z: number, boost: number) => {
    const scheme = FLOWERS[Math.floor(rand() * FLOWERS.length)];
    // 先绕竖轴随机转，再朝镜头方向（+z）仰起 20°~50°
    euler.set(0.35 + rand() * 0.55, rand() * Math.PI * 2, 0, 'XYZ');
    flowers.push({
      pos: new THREE.Vector3(x, 0, z),
      quat: new THREE.Quaternion().setFromEuler(euler),
      stem: (0.16 + rand() * 0.24) * boost,
      head: (0.05 + rand() * 0.04) * boost,
      seed: rand(),
      color: scheme[0],
      centre: scheme[1],
    });
  };

  // 花坛：越靠中心越密
  const bedShare = Math.round(budget * 0.62);
  const weights = world.beds.map((b) => (b.r <= 2 ? b.r * b.r * 9 : b.r * 13));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const k = Math.min(1, bedShare / total);
  world.beds.forEach((b, i) => {
    const n = Math.round(weights[i] * k);
    for (let j = 0; j < n; j++) {
      const r = b.r * Math.pow(rand(), 0.7);
      const a = rand() * Math.PI * 2;
      add(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r, 1);
    }
  });

  // 草地上零星的野花：靠近小路的地方多一些
  const scattered = budget - flowers.length;
  for (let i = 0; i < scattered; i++) {
    const s = -26 + rand() * (world.length + 30);
    const lateral = (rand() < 0.5 ? -1 : 1) * (PATH.HALF_W + 0.35 + Math.pow(rand(), 1.8) * 17);
    const p = place(s, lateral, 0);
    add(p.x, p.z, 0.85 + rand() * 0.3);
  }
  return flowers;
}

let bladeLow: THREE.BufferGeometry | null = null;
let bladeHigh: THREE.BufferGeometry | null = null;
let flowerGeo: THREE.BufferGeometry | null = null;

function buildMeadow(world: World, maxTexture: number) {
  const tier = getDeviceTier();
  const root = new THREE.Group();

  meadow.uNoise.value = getNoise();
  meadow.uMap.value?.dispose();
  meadow.uMap.value = groundMapTexture(world, tier.level === 'high' ? 9 : tier.level === 'mid' ? 7 : 5, Math.min(4096, maxTexture));
  meadow.uMapRect.value.set(...world.mapRect);
  meadow.uPathRange.value.set(world.pathRange[0], world.pathRange[1]);
  meadow.uGlow.value.set(world.cinema.center.x, world.cinema.center.z, world.cinema.normal.x, world.cinema.normal.z);

  /* 地面 */
  const plane = new THREE.PlaneGeometry(3600, 3600);
  plane.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(plane, groundMaterial);
  ground.position.set(PATH.A, 0, -world.length / 2);
  ground.updateMatrix();
  ground.matrixAutoUpdate = false;
  ground.frustumCulled = false;
  ground.userData.ownGeometry = true;
  // 地面盖住的屏幕面积最大，放到不透明物体的最后画，让前面的东西先占住深度
  ground.renderOrder = 900;
  root.add(ground);

  /* 草叶 */
  const count = tier.grass;
  const rand = mulberry32(99);
  const offsets = new Float32Array(count * 3);
  const rands = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    offsets[i * 3] = rand();
    offsets[i * 3 + 1] = rand();
    // 每三片里有一片属于「远层」（铺得更开、叶片更大）。两层交错存放，
    // 降画质时从数组末尾砍，远近密度按比例一起降
    offsets[i * 3 + 2] = i % 3 === 2 ? 1 : 0;
    rands[i * 4] = rand();
    rands[i * 4 + 1] = rand();
    rands[i * 4 + 2] = rand();
    rands[i * 4 + 3] = rand();
  }
  const base = tier.grassSegments === 1 ? (bladeLow ??= bladeGeometry(1)) : (bladeHigh ??= bladeGeometry(3));
  const grassGeo = new THREE.InstancedBufferGeometry();
  grassGeo.setIndex(base.getIndex());
  grassGeo.setAttribute('position', base.getAttribute('position'));
  grassGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  grassGeo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 4));
  grassGeo.instanceCount = count;
  const grass = new THREE.Mesh(grassGeo, grassMaterial);
  grass.frustumCulled = false;
  grass.matrixAutoUpdate = false;
  grass.userData.ownGeometry = true;
  grass.name = 'grass';
  root.add(grass);

  /* 花 */
  flowerGeo ??= flowerGeometry();
  const flowers = instanced<Flower>({
    items: makeFlowers(world, tier.flowers),
    geometry: flowerGeo,
    material: flowerMaterial,
    pad: 0.6,
    position: (f) => f.pos,
    matrix: (f, m) => m.compose(f.pos, f.quat, ONE),
    color: (f) => f.color,
    attributes: {
      aShape: {
        size: 3,
        write: (f, out, o) => {
          out[o] = f.stem;
          out[o + 1] = f.head;
          out[o + 2] = f.seed;
        },
      },
      aCentre: { size: 3, write: (f, out, o) => writeColor(f.centre, out, o) },
    },
  });
  root.add(flowers);

  return { root, grassGeo, count };
}

const ONE = new THREE.Vector3(1, 1, 1);
const forward = new THREE.Vector3();

export function Meadow() {
  const world = useStore((s) => s.world);
  const density = useQuality((s) => s.density);
  const maxTexture = useThree((s) => s.gl.capabilities.maxTextureSize);
  const built = useMemo(() => buildMeadow(world, maxTexture), [world, maxTexture]);

  useEffect(() => () => disposeTree(built.root), [built]);

  // 掉帧时按比例减少草叶
  useEffect(() => {
    built.grassGeo.instanceCount = Math.max(1000, Math.round(built.count * density));
  }, [built, density]);

  useFrame(({ camera }) => {
    // 草丛中心放在镜头前方一点：身后看不见的地方不浪费草叶
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    grassUniforms.uGrass.value.x = camera.position.x + forward.x * 6.2;
    grassUniforms.uGrass.value.y = camera.position.z + forward.z * 6.2;
  });

  return <primitive object={built.root} />;
}
