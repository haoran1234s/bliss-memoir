/**
 * 共用材质
 * ------------------------------------------------------------
 * 几种在花园里反复出现的质感，各写一份着色器，全局只创建一次：
 *   - glossy  气球那种亮晶晶的乳胶 / 铝膜
 *   - blob    树冠、灌木、远山、靠垫这类圆滚滚的哑光物体
 *   - solid   树干、立柱、夹子、画框这类普通实心物体（可选糖果条纹）
 *   - rope    麻绳与灯线
 *   - flag    随风摆动的三角彩旗
 *   - glow    灯泡外面那圈柔光（始终朝向镜头的小面片，叠加混合）
 *
 * 它们都通过 makeMaterial 接入 env.ts 的天光，昼夜切换时会一起变色。
 */
import * as THREE from 'three';
import { makeMaterial } from './env';
import { getNoise } from './textures';

/** 带非等比缩放的实例也能得到正确的法线。 */
const INSTANCE_NORMAL = /* glsl */ `
vec3 instanceNormal(vec3 n) {
  vec3 m0 = instanceMatrix[0].xyz;
  vec3 m1 = instanceMatrix[1].xyz;
  vec3 m2 = instanceMatrix[2].xyz;
  return normalize(mat3(instanceMatrix) * (n / vec3(dot(m0, m0), dot(m1, m1), dot(m2, m2))));
}
`;

/* ------------------------------------------------------------------ */
/*  glossy：气球                                                       */
/* ------------------------------------------------------------------ */
let glossy: THREE.ShaderMaterial | null = null;

/**
 * 需要的逐实例属性：
 *   instanceColor
 *   aMotion (vec3)：x 随机种子 · y 所属架子的浮动种子（<0 固定不动）· z 晃动幅度
 */
export function glossyMaterial() {
  return (glossy ??= makeMaterial({
    vertex:
      INSTANCE_NORMAL +
      /* glsl */ `
      attribute vec3 aMotion;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;

      void main() {
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        if (aMotion.y >= 0.0) wp.xyz += rackBob(aMotion.y);
        wp.xyz += balloonSway(aMotion.x) * aMotion.z;
        vWorld = wp.xyz;
        vNormal = instanceNormal(normal);
        vColor = instanceColor;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragment: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);
        float ndv = max(dot(n, v), 0.0);

        // 乳胶略微透光：背光面不会死黑，中间比边缘更亮更透
        float wrap = smoothstep(-0.65, 0.9, dot(n, uSunDir));
        vec3 col = vColor * (hemi(n) * 1.05 + uSunColor * wrap);
        col *= 0.82 + 0.24 * ndv;

        // 边缘映出天空
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(r.y * 0.6 + 0.4, 0.0, 1.0));
        col = mix(col, sky, pow(1.0 - ndv, 3.0) * 0.3);

        // 一个锐利的高光点 + 一圈柔和的光斑
        float nh = max(dot(n, normalize(uSunDir + v)), 0.0);
        col += uSunColor * (pow(nh, 140.0) * 1.15 + pow(nh, 20.0) * 0.14);
        col += uAmbSky * pow(max(r.y, 0.0), 8.0) * 0.16;

        outColor(withFog(col, vWorld), 1.0);
      }
    `,
  }));
}

/* ------------------------------------------------------------------ */
/*  blob：圆滚滚的哑光物体                                              */
/* ------------------------------------------------------------------ */
export interface BlobOptions {
  /** 随风晃动的幅度（米） */
  sway: number;
  /** 表面起伏 */
  lump: number;
  /** 叶片斑驳 */
  speckle: number;
  /** 底部压暗 */
  ao: number;
  /** 大气雾的倍率（远山用小一点的值，保留一点颜色） */
  fog: number;
}

const blobs = new Map<string, THREE.ShaderMaterial>();

/** 需要的逐实例属性：instanceColor、aSeed (float) */
export function blobMaterial(key: 'foliage' | 'hill' | 'cushion') {
  let mat = blobs.get(key);
  if (mat) return mat;
  const options: Record<typeof key, BlobOptions> = {
    foliage: { sway: 0.07, lump: 0.1, speckle: 0.24, ao: 0.3, fog: 1 },
    hill: { sway: 0, lump: 0.05, speckle: 0.1, ao: 0, fog: 0.86 },
    cushion: { sway: 0, lump: 0.03, speckle: 0, ao: 0.22, fog: 1 },
  };
  const o = options[key];
  mat = makeMaterial({
    uniforms: {
      uNoise: { value: getNoise() },
      uBlob: { value: new THREE.Vector4(o.sway, o.lump, o.speckle, o.ao) },
      uFogScale: { value: o.fog },
    },
    vertex:
      INSTANCE_NORMAL +
      /* glsl */ `
      attribute float aSeed;
      uniform vec4 uBlob;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying float vSeed;

      void main() {
        vec3 p = position;
        float lump = sin(p.x * 3.1 + aSeed * 40.0) * sin(p.y * 2.7 + aSeed * 17.0) * sin(p.z * 3.3 + aSeed * 29.0);
        p += normal * lump * uBlob.y;
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        // 上半部分随风轻晃
        float sway = sin(uTime * 1.15 + wp.x * 0.31 + wp.z * 0.27 + aSeed * 6.28) * uBlob.x * uWind.z;
        wp.xz += uWind.xy * sway * (0.35 + 0.65 * (position.y * 0.5 + 0.5));
        vWorld = wp.xyz;
        vNormal = instanceNormal(normal);
        vColor = instanceColor;
        vLocal = position;
        vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragment: /* glsl */ `
      uniform sampler2D uNoise;
      uniform vec4 uBlob;
      uniform float uFogScale;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying float vSeed;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 albedo = vColor;

        // 叶片的斑驳：两个方向各取一次噪声
        float leaf = texture2D(uNoise, vLocal.xy * 0.9 + vSeed * 3.0).g * 0.5
          + texture2D(uNoise, vLocal.zy * 0.9 + vSeed * 7.0).g * 0.5;
        albedo *= 1.0 + (leaf - 0.5) * uBlob.z * 2.0;

        // 顶上受光更亮，底部压暗一点，体积感就出来了
        float ao = mix(1.0 - uBlob.w, 1.0, smoothstep(-0.95, 0.35, vLocal.y));
        vec3 col = albedo * (hemi(n) + softSun(n)) * ao;
        // 逆光的轮廓泛一圈亮边
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * smoothstep(-0.2, 0.6, n.y);
        col += albedo * uAmbSky * rim * 0.45;

        float fog = fogAmount(distance(vWorld, cameraPosition)) * uFogScale;
        outColor(mix(col, uSkyHorizon, fog), 1.0);
      }
    `,
  });
  blobs.set(key, mat);
  return mat;
}

/* ------------------------------------------------------------------ */
/*  solid：普通实心物体                                                 */
/* ------------------------------------------------------------------ */
const solids = new Map<string, THREE.ShaderMaterial>();

/**
 * 需要的逐实例属性：instanceColor；bob 版本另需 aBob (float，<0 固定不动)。
 * stripes：沿高度缠一圈圈白条纹（糖果棍）。
 */
export function solidMaterial(opts: { bob?: boolean; stripes?: boolean; doubleSide?: boolean } = {}) {
  const key = `${opts.bob ? 'b' : ''}${opts.stripes ? 's' : ''}${opts.doubleSide ? 'd' : ''}`;
  let mat = solids.get(key);
  if (mat) return mat;
  const defines: Record<string, string> = {};
  if (opts.bob) defines.USE_BOB = '';
  if (opts.stripes) defines.USE_STRIPES = '';
  mat = makeMaterial({
    defines,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    vertex:
      INSTANCE_NORMAL +
      /* glsl */ `
      #ifdef USE_BOB
      attribute float aBob;
      #endif
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;
      varying vec3 vLocal;

      void main() {
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        #ifdef USE_BOB
        if (aBob >= 0.0) wp.xyz += rackBob(aBob);
        #endif
        vWorld = wp.xyz;
        vNormal = instanceNormal(normal);
        vColor = instanceColor;
        vLocal = position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragment: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;
      varying vec3 vLocal;

      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 albedo = vColor;
        #ifdef USE_STRIPES
        float turn = atan(vLocal.z, vLocal.x) / 6.2832;
        float tri = abs(fract(vWorld.y * 1.9 + turn) - 0.5) * 2.0;
        albedo = mix(vec3(1.0), albedo, smoothstep(0.42, 0.58, tri));
        #endif
        outColor(withFog(lit(albedo, n), vWorld), 1.0);
      }
    `,
  });
  solids.set(key, mat);
  return mat;
}

/* ------------------------------------------------------------------ */
/*  rope：麻绳（合并成一个网格，顶点带颜色与浮动种子）                    */
/* ------------------------------------------------------------------ */
let rope: THREE.ShaderMaterial | null = null;

export function ropeMaterial() {
  return (rope ??= makeMaterial({
    vertex: /* glsl */ `
      attribute vec3 aColor;
      attribute float aBob;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;

      void main() {
        vec3 p = position;
        if (aBob >= 0.0) p += rackBob(aBob);
        vWorld = p;
        vNormal = normal;
        vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragment: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;
      void main() {
        outColor(withFog(lit(vColor, normalize(vNormal)), vWorld), 1.0);
      }
    `,
  }));
}

/* ------------------------------------------------------------------ */
/*  flag：三角彩旗                                                     */
/* ------------------------------------------------------------------ */
let flag: THREE.ShaderMaterial | null = null;

/** 需要的逐实例属性：instanceColor、aSeed (float) */
export function flagMaterial() {
  return (flag ??= makeMaterial({
    side: THREE.DoubleSide,
    vertex: /* glsl */ `
      attribute float aSeed;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;

      void main() {
        vec3 p = position;
        // 上边缘系在绳子上不动，越往旗尖摆得越厉害
        float t = -p.y;
        float wave = (sin(uTime * 3.1 + aSeed * 30.0 + t * 2.6) * 0.2 + sin(uTime * 1.25 + aSeed * 11.0) * 0.14) * t * uWind.z;
        p.z += wave;
        p.x += wave * 0.2;
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(instanceMatrix) * vec3(0.0, wave * 0.9, 1.0));
        vColor = instanceColor;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragment: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vColor;
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        // 薄布透光：背着太阳的一面也是亮的
        float sun = abs(dot(n, uSunDir)) * 0.55 + 0.4;
        vec3 col = vColor * (hemi(n) + uSunColor * sun);
        outColor(withFog(col, vWorld), 1.0);
      }
    `,
  }));
}

/* ------------------------------------------------------------------ */
/*  glow：灯泡的柔光                                                   */
/* ------------------------------------------------------------------ */
let glow: THREE.ShaderMaterial | null = null;

/**
 * 用在 InstancedBufferGeometry 上（一个单位方片 + 逐实例属性）：
 *   aCentre (vec3) 位置 · aGlow (vec4)：rgb 颜色、a 尺寸（米）· aSeed (float)
 * 亮度跟着 uAtmo.w（黄昏 / 夜晚才亮）。
 */
export function glowMaterial() {
  return (glow ??= makeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertex: /* glsl */ `
      attribute vec3 aCentre;
      attribute vec4 aGlow;
      attribute float aSeed;
      varying vec2 vUv;
      varying vec3 vColor;

      void main() {
        vUv = position.xy * 2.0;
        // 每颗灯泡各自轻微闪烁
        float flicker = 0.88 + 0.12 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 50.0);
        vColor = aGlow.rgb * uAtmo.w * flicker;
        vec4 mv = viewMatrix * vec4(aCentre, 1.0);
        mv.xy += position.xy * aGlow.a * step(0.01, uAtmo.w);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragment: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        float d = dot(vUv, vUv);
        float a = exp(-d * 5.5) * 0.85 + exp(-d * 40.0) * 0.9;
        a *= 1.0 - smoothstep(0.7, 1.0, d);
        outColor(vColor * a, 1.0);
      }
    `,
  }));
}
