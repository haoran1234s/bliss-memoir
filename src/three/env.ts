/**
 * 环境中枢：天光、昼夜与共享着色器片段
 * ------------------------------------------------------------
 * 整个花园不用任何后期处理，画面的统一感来自这里：
 *   - 所有自定义材质共用同一组 uniform（太阳方向 / 颜色、天空三段色、雾、风……），
 *     每帧只在这里更新一次；
 *   - 「时间」是一个 0 → 2 的连续值：0 晴朗白天，1 粉金色黄昏，2 星空夜晚。
 *     漫游时是白天，走进露天影院变黄昏，点「关灯」变成星空；
 *   - HEADER 里是每个着色器都会用到的小函数：半球环境光、柔和的太阳光、
 *     大气雾、气球架的轻微浮动。
 *
 * 颜色全部在线性空间里计算，片元着色器最后统一调用 outColor() 转回 sRGB。
 */
import * as THREE from 'three';

/** 白天的太阳方向（指向太阳）。地面上的假阴影按这个方向烘焙。 */
export const SUN_DAY = new THREE.Vector3(-0.46, 0.73, 0.5).normalize();

const col = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

interface Key {
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  sun: THREE.Color;
  ambSky: THREE.Color;
  ambGround: THREE.Color;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  card: THREE.Color;
  sunDir: THREE.Vector3;
  /** 雾浓度 */
  fog: number;
  /** 地面假阴影的强度 */
  shadow: number;
  /** 星星 */
  stars: number;
  /** 灯串 / 萤火虫 */
  lights: number;
  /** 天空里太阳（月亮）光晕的强度 */
  glow: number;
}

const KEYS: Key[] = [
  // 0 · 晴朗白天
  {
    skyTop: col('#3f9fee'),
    skyMid: col('#86cbf8'),
    skyHorizon: col('#dcf1ff'),
    sun: col('#fff2d8', 0.8),
    ambSky: col('#cfe5ff', 0.52),
    ambGround: col('#dcf0bc', 0.4),
    cloudLit: col('#ffffff'),
    cloudShade: col('#c3d9f4'),
    card: col('#ffffff'),
    sunDir: SUN_DAY.clone(),
    fog: 0.0092,
    shadow: 0.36,
    stars: 0,
    lights: 0,
    glow: 0.5,
  },
  // 1 · 粉金色黄昏
  {
    skyTop: col('#5a6fd2'),
    skyMid: col('#f29db6'),
    skyHorizon: col('#ffd2a0'),
    sun: col('#ffb07a', 0.78),
    ambSky: col('#cdb8f2', 0.46),
    ambGround: col('#f2c4a2', 0.36),
    cloudLit: col('#ffd6c0'),
    cloudShade: col('#a987c9'),
    card: col('#ffeedd'),
    sunDir: new THREE.Vector3(-0.22, 0.17, -0.96).normalize(),
    fog: 0.0105,
    shadow: 0.2,
    stars: 0.12,
    lights: 0.85,
    glow: 1.25,
  },
  // 2 · 星空夜晚
  {
    skyTop: col('#0c123c'),
    skyMid: col('#1f2a6c'),
    skyHorizon: col('#4d52a0'),
    sun: col('#a9c2ff', 0.42),
    ambSky: col('#8094e2', 0.34),
    ambGround: col('#4d5894', 0.26),
    cloudLit: col('#7f8dd2'),
    cloudShade: col('#3a4488'),
    card: col('#8f9be0'),
    sunDir: new THREE.Vector3(0.34, 0.56, -0.76).normalize(),
    fog: 0.0098,
    shadow: 0.1,
    stars: 1,
    lights: 1,
    glow: 0.8,
  },
];

/** 所有自定义材质共享的 uniform。把这个对象展开进 ShaderMaterial.uniforms 即可（引用相同，值同步）。 */
export const env = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DAY.clone() },
  uSunColor: { value: KEYS[0].sun.clone() },
  uAmbSky: { value: KEYS[0].ambSky.clone() },
  uAmbGround: { value: KEYS[0].ambGround.clone() },
  uSkyTop: { value: KEYS[0].skyTop.clone() },
  uSkyMid: { value: KEYS[0].skyMid.clone() },
  uSkyHorizon: { value: KEYS[0].skyHorizon.clone() },
  uCloudLit: { value: KEYS[0].cloudLit.clone() },
  uCloudShade: { value: KEYS[0].cloudShade.clone() },
  uCardLight: { value: KEYS[0].card.clone() },
  /** x 雾浓度 · y 阴影强度 · z 星星 · w 灯光 */
  uAtmo: { value: new THREE.Vector4(KEYS[0].fog, KEYS[0].shadow, 0, 0) },
  /** x 太阳光晕强度 · y 当前「时间」0~2 */
  uSky: { value: new THREE.Vector2(KEYS[0].glow, 0) },
  /** 风：xy 方向（已归一），z 强度 */
  uWind: { value: new THREE.Vector3(0.86, 0.5, 1) },
};

let timeOfDay = 0;

/** 当前「时间」：0 白天 · 1 黄昏 · 2 夜晚（连续值）。 */
export const getTimeOfDay = () => timeOfDay;

/** 每帧调用一次：推进时钟，并让天光朝目标「时间」平滑过渡。 */
export function tickEnv(dt: number, target: number) {
  env.uTime.value += dt;
  // 约 1.3 秒走完一次昼夜切换
  const k = 1 - Math.exp(-dt * 2.2);
  timeOfDay += (target - timeOfDay) * k;
  if (Math.abs(target - timeOfDay) < 0.0005) timeOfDay = target;

  const i = Math.min(KEYS.length - 2, Math.max(0, Math.floor(timeOfDay)));
  const f = THREE.MathUtils.clamp(timeOfDay - i, 0, 1);
  const a = KEYS[i];
  const b = KEYS[i + 1];

  env.uSunColor.value.lerpColors(a.sun, b.sun, f);
  env.uAmbSky.value.lerpColors(a.ambSky, b.ambSky, f);
  env.uAmbGround.value.lerpColors(a.ambGround, b.ambGround, f);
  env.uSkyTop.value.lerpColors(a.skyTop, b.skyTop, f);
  env.uSkyMid.value.lerpColors(a.skyMid, b.skyMid, f);
  env.uSkyHorizon.value.lerpColors(a.skyHorizon, b.skyHorizon, f);
  env.uCloudLit.value.lerpColors(a.cloudLit, b.cloudLit, f);
  env.uCloudShade.value.lerpColors(a.cloudShade, b.cloudShade, f);
  env.uCardLight.value.lerpColors(a.card, b.card, f);
  env.uSunDir.value.lerpVectors(a.sunDir, b.sunDir, f).normalize();
  env.uAtmo.value.set(
    THREE.MathUtils.lerp(a.fog, b.fog, f),
    THREE.MathUtils.lerp(a.shadow, b.shadow, f),
    THREE.MathUtils.lerp(a.stars, b.stars, f),
    THREE.MathUtils.lerp(a.lights, b.lights, f),
  );
  env.uSky.value.set(THREE.MathUtils.lerp(a.glow, b.glow, f), timeOfDay);
}

/* ------------------------------------------------------------------ */
/*  共享 GLSL                                                          */
/* ------------------------------------------------------------------ */
export const HEADER = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uCardLight;
uniform vec4 uAtmo;
uniform vec2 uSky;
uniform vec3 uWind;

// 半球环境光：朝上的面受天空照亮，朝下的面受草地反光
vec3 hemi(vec3 n) {
  return mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
}

// 柔和的太阳光：明暗交界被拉得很宽，暗部不会发黑
vec3 softSun(vec3 n) {
  return uSunColor * smoothstep(-0.35, 0.85, dot(n, uSunDir));
}

vec3 lit(vec3 albedo, vec3 n) {
  return albedo * (hemi(n) + softSun(n));
}

// 大气雾：越远越融进地平线的颜色
float fogAmount(float dist) {
  float x = dist * uAtmo.x;
  return 1.0 - exp(-x * sqrt(x));
}

// 被气球吊着的东西（照片架、封面牌）整体轻轻浮动。同一个 seed 的部件动作完全一致。
vec3 rackBob(float seed) {
  return vec3(
    sin(uTime * 0.55 + seed * 31.4) * 0.016,
    sin(uTime * 0.8 + seed * 57.1) * 0.028,
    sin(uTime * 0.47 + seed * 13.7) * 0.012
  );
}

// 气球在绳子末端的晃动
vec3 balloonSway(float seed) {
  float a = uTime * 0.9 + seed * 43.0;
  return vec3(sin(a) * 0.05 + sin(a * 0.37) * 0.035, sin(a * 1.3) * 0.02, cos(a * 0.8) * 0.045);
}

vec3 rotateQ(vec3 v, vec4 q) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
`;

const FRAGMENT_TAIL = /* glsl */ `
vec3 withFog(vec3 color, vec3 worldPos) {
  return mix(color, uSkyHorizon, fogAmount(distance(worldPos, cameraPosition)));
}

void outColor(vec3 color, float alpha) {
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;

type MaterialOptions = Omit<THREE.ShaderMaterialParameters, 'uniforms' | 'vertexShader' | 'fragmentShader'> & {
  vertex: string;
  fragment: string;
  uniforms?: Record<string, THREE.IUniform>;
};

/** 创建一个接入了共享环境 uniform 与公共函数的着色器材质。 */
export function makeMaterial({ vertex, fragment, uniforms, ...rest }: MaterialOptions) {
  return new THREE.ShaderMaterial({
    ...rest,
    uniforms: { ...env, ...uniforms },
    vertexShader: HEADER + vertex,
    fragmentShader: HEADER + FRAGMENT_TAIL + fragment,
  });
}
