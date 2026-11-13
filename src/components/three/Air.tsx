/**
 * 空气里的小东西：飘落的花瓣、蝴蝶、夜里的萤火虫
 * ------------------------------------------------------------
 * 三者都只存在于镜头周围的一个盒子里：位置对盒子取模，
 * 镜头走到哪它们就跟到哪，数量恒定。运动全部在顶点着色器里计算。
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useQuality } from '../../store/useQuality';
import { makeMaterial } from '../../three/env';
import { butterflyGeometry } from '../../three/geometry';
import { writeColor } from '../../three/instancing';

/** 盒子中心（镜头前方一点） */
const uCentre = { value: new THREE.Vector3() };

const WRAP = /* glsl */ `
uniform vec3 uCentre;
// 把 0~1 的种子位置映射到以 uCentre 为中心的盒子里；fade 在盒子边缘渐隐，回绕时不会突然出现
vec3 wrapBox(vec3 seed, vec3 drift, vec3 box, out float fade) {
  vec3 p = (fract(seed + (drift - uCentre) / box) - 0.5) * box + uCentre;
  vec3 e = abs(p - uCentre) / (box * 0.5);
  fade = 1.0 - smoothstep(0.78, 1.0, max(e.x, max(e.y, e.z)));
  return p;
}
`;

/* ------------------------------------------------------------------ */
/*  花瓣                                                               */
/* ------------------------------------------------------------------ */
const petalMaterial = makeMaterial({
  side: THREE.DoubleSide,
  uniforms: { uCentre },
  vertex:
    WRAP +
    /* glsl */ `
    attribute vec3 aSeed;
    attribute vec4 aRand;
    varying vec3 vColor;
    varying float vFog;

    void main() {
      float t = uTime;
      vec3 drift = vec3(uWind.x * 0.6, -(0.2 + aRand.x * 0.22), uWind.y * 0.6) * t;
      drift.x += sin(t * (0.6 + aRand.y) + aRand.z * 30.0) * 0.55;
      drift.z += cos(t * (0.5 + aRand.z) + aRand.y * 30.0) * 0.55;
      float fade;
      vec3 centre = wrapBox(aSeed, drift, vec3(26.0, 9.0, 26.0), fade);
      centre.y += 0.6;

      // 翻滚
      float a = t * (1.1 + aRand.w * 2.2) + aRand.x * 40.0;
      float b = t * (0.8 + aRand.y * 1.6) + aRand.z * 20.0;
      vec3 l = position * (0.034 + aRand.x * 0.026) * fade;
      l = vec3(l.x, l.y * cos(a) - l.z * sin(a), l.y * sin(a) + l.z * cos(a));
      l = vec3(l.x * cos(b) + l.z * sin(b), l.y, -l.x * sin(b) + l.z * cos(b));

      vec4 mv = viewMatrix * vec4(centre + l, 1.0);
      // 贴着镜头飘过的花瓣会糊成一大片，离得太近就收起来
      float nearFade = smoothstep(0.7, 1.8, -mv.z);
      mv.xyz = mix((viewMatrix * vec4(centre, 1.0)).xyz, mv.xyz, nearFade);

      vec3 albedo = mix(vec3(1.0, 0.62, 0.74), vec3(1.0, 0.94, 0.95), aRand.w);
      float facing = abs(cos(a) * cos(b));
      vColor = albedo * (uAmbSky * 0.95 + uSunColor * (0.5 + 0.4 * facing));
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
/*  蝴蝶                                                               */
/* ------------------------------------------------------------------ */
const butterflyMaterial = makeMaterial({
  side: THREE.DoubleSide,
  uniforms: { uCentre },
  vertex:
    WRAP +
    /* glsl */ `
    attribute float aWing;
    attribute vec3 aSeed;
    attribute vec4 aRand;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vFog;

    void main() {
      float fade;
      // （竖直方向给一个极大的盒子：高度单独算，不参与回绕和渐隐）
      vec3 home = wrapBox(aSeed, vec3(0.0), vec3(34.0, 4000.0, 34.0), fade);
      home.y = 0.42 + aSeed.y * 1.25;

      // 绕着「家」兜圈子
      float t = uTime * (0.3 + aRand.x * 0.28) + aRand.y * 50.0;
      vec3 off = vec3(
        sin(t) * 1.7 + sin(t * 2.3) * 0.5,
        sin(t * 1.7) * 0.26 + sin(t * 5.1) * 0.05,
        cos(t * 0.8) * 1.7 + cos(t * 1.9) * 0.5
      );
      vec2 vel = vec2(cos(t) * 1.7 + cos(t * 2.3) * 1.15, -sin(t * 0.8) * 1.36 - sin(t * 1.9) * 0.95);
      float yaw = atan(vel.x, vel.y);

      // 扇翅膀：两片翅膀绕身体对称地上下拍
      float flap = sin(uTime * (11.0 + aRand.z * 5.0) + aRand.w * 30.0) * 0.95 + 0.3;
      vec3 w = position * (0.06 + aRand.w * 0.03) * fade;
      vec3 l = vec3(aWing * w.x * cos(flap), w.x * sin(flap), w.z);
      l = vec3(l.x * cos(yaw) + l.z * sin(yaw), l.y, -l.x * sin(yaw) + l.z * cos(yaw));

      vec4 mv = viewMatrix * vec4(home + off + l, 1.0);
      // 翅膀根部颜色深、边缘亮
      vec3 albedo = mix(aColor * 0.72, aColor, smoothstep(0.1, 0.8, position.x));
      vColor = albedo * (uAmbSky + uSunColor * 0.8);
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
/*  萤火虫                                                             */
/* ------------------------------------------------------------------ */
const fireflyMaterial = makeMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uCentre },
  vertex:
    WRAP +
    /* glsl */ `
    attribute vec3 aSeed;
    attribute vec4 aRand;
    varying vec2 vUv;
    varying float vGlow;

    void main() {
      vUv = position.xy * 2.0;
      float t = uTime * (0.25 + aRand.x * 0.25);
      vec3 drift = vec3(sin(t + aRand.y * 40.0) * 1.3, sin(t * 1.3 + aRand.z * 40.0) * 0.45, cos(t * 0.8 + aRand.w * 40.0) * 1.3);
      float fade;
      vec3 centre = wrapBox(aSeed, vec3(drift.x, 0.0, drift.z), vec3(26.0, 4000.0, 26.0), fade);
      centre.y = 0.35 + fract(aSeed.y + drift.y * 0.2) * 2.4;

      // 一明一灭；只有天色暗下来才出现
      float blink = pow(max(sin(uTime * (0.9 + aRand.z) + aRand.w * 60.0), 0.0), 2.0);
      vGlow = blink * fade * uAtmo.w;
      vec4 mv = viewMatrix * vec4(centre, 1.0);
      mv.xy += position.xy * (0.16 + aRand.x * 0.12) * step(0.01, vGlow);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: /* glsl */ `
    varying vec2 vUv;
    varying float vGlow;
    void main() {
      float d = dot(vUv, vUv);
      float a = (exp(-d * 6.0) * 0.7 + exp(-d * 45.0)) * (1.0 - smoothstep(0.7, 1.0, d));
      outColor(vec3(0.95, 1.0, 0.55) * a * vGlow, 1.0);
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

function scatter(base: THREE.BufferGeometry, count: number, seed: number, colors?: string[]) {
  const rand = mulberry32(seed);
  const seeds = new Float32Array(count * 3);
  const rands = new Float32Array(count * 4);
  const tint = colors ? new Float32Array(count * 3) : null;
  for (let i = 0; i < count; i++) {
    seeds.set([rand(), rand(), rand()], i * 3);
    rands.set([rand(), rand(), rand(), rand()], i * 4);
    if (tint && colors) writeColor(colors[Math.floor(rand() * colors.length)], tint, i * 3);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(base.getIndex());
  for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.getAttribute(name));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 4));
  if (tint) geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(tint, 3));
  geo.instanceCount = count;
  return geo;
}

function buildAir() {
  const tier = getDeviceTier();
  const root = new THREE.Group();

  // 花瓣：一片略弯的水滴形
  const petal = new THREE.BufferGeometry();
  petal.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, -1, 0, 0.62, -0.1, 0.12, 0, 1, 0, -0.62, -0.1, 0.12], 3),
  );
  petal.setIndex([0, 1, 2, 0, 2, 3]);
  const petalGeo = scatter(petal, tier.petals, 31);
  const petals = new THREE.Mesh(petalGeo, petalMaterial);

  const butterflyGeo = scatter(butterflyGeometry(), tier.butterflies, 57, [
    '#ffb347',
    '#ffd166',
    '#ff8fa3',
    '#8fd3ff',
    '#ffffff',
    '#c3a6ff',
  ]);
  const butterflies = new THREE.Mesh(butterflyGeo, butterflyMaterial);

  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const fireflyGeo = scatter(quad, tier.level === 'low' ? 24 : 60, 83);
  const fireflies = new THREE.Mesh(fireflyGeo, fireflyMaterial);
  fireflies.renderOrder = 21;

  for (const mesh of [petals, butterflies, fireflies]) {
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
  }
  return { root, petalGeo, butterflyGeo, fireflyGeo, petalCount: tier.petals };
}

const forward = new THREE.Vector3();

export function Air() {
  const density = useQuality((s) => s.density);
  const built = useMemo(buildAir, []);

  useEffect(
    () => () => {
      built.petalGeo.dispose();
      built.butterflyGeo.dispose();
      built.fireflyGeo.dispose();
    },
    [built],
  );

  useEffect(() => {
    built.petalGeo.instanceCount = Math.max(12, Math.round(built.petalCount * density));
  }, [built, density]);

  useFrame(({ camera }) => {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    uCentre.value.set(camera.position.x + forward.x * 7, 4.2, camera.position.z + forward.z * 7);
  });

  return <primitive object={built.root} />;
}
