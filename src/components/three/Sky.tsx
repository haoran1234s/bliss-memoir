/**
 * 天空：渐变天穹、太阳 / 月亮与星星、蓬松的云、远处的彩虹和热气球
 * ------------------------------------------------------------
 * 全部是程序化着色，没有一张贴图。颜色来自 env.ts 的共享 uniform，
 * 所以白天 → 黄昏 → 星空的过渡是整片天一起渐变的。
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useStore } from '../../store/useStore';
import { makeMaterial } from '../../three/env';
import { hotAirBalloonGeometry, sphereGeometry } from '../../three/geometry';
import { disposeTree, instanced, writeColor } from '../../three/instancing';
import { pathX } from '../../three/world';

/* ------------------------------------------------------------------ */
/*  天穹                                                               */
/* ------------------------------------------------------------------ */
const skyMaterial = makeMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  vertex: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      // 只取相机的旋转，天穹永远罩在镜头外面；深度钉在最远处，最后画、被一切遮挡
      vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
      gl_Position = p.xyww;
    }
  `,
  fragment: /* glsl */ `
    varying vec3 vDir;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;

      vec3 col = mix(uSkyHorizon, uSkyMid, smoothstep(-0.02, 0.26, h));
      col = mix(col, uSkyTop, smoothstep(0.2, 0.82, h));

      // 太阳 / 月亮：一个小圆盘 + 两层光晕
      float sd = dot(d, uSunDir);
      float night = smoothstep(1.25, 1.9, uSky.y);
      float edge = mix(0.99935, 0.9983, night);
      float disc = smoothstep(edge, edge + 0.0003, sd);
      float halo = pow(max(sd, 0.0), 240.0) * 0.6 + pow(max(sd, 0.0), 14.0) * 0.22;
      col += uSunColor * (disc * mix(1.5, 2.6, night) + halo * uSky.x);

      // 星星：把方向投到平面上分格，每格随机放一颗，各自闪烁
      float stars = uAtmo.z * smoothstep(0.02, 0.32, h);
      if (stars > 0.003) {
        vec2 uv = d.xz / (h + 0.45) * 26.0;
        vec2 cell = floor(uv);
        vec2 f = fract(uv);
        float rnd = hash21(cell);
        vec2 c = vec2(hash21(cell + 7.1), hash21(cell + 13.7)) * 0.7 + 0.15;
        float s = smoothstep(0.1 * (0.45 + rnd), 0.0, length(f - c)) * step(0.7, rnd);
        s *= 0.62 + 0.38 * sin(uTime * (1.4 + rnd * 2.2) + rnd * 60.0);
        col += vec3(1.0, 0.97, 0.9) * s * stars;
      }

      outColor(col, 1.0);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  云                                                                 */
/* ------------------------------------------------------------------ */
const CLOUD_RANGE = 1300;

const cloudMaterial = makeMaterial({
  uniforms: { uDrift: { value: new THREE.Vector2(1.1, CLOUD_RANGE) } },
  vertex: /* glsl */ `
    attribute vec2 aCloud;
    uniform vec2 uDrift;
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying float vLocalY;

    void main() {
      vec4 wp = instanceMatrix * vec4(position, 1.0);
      // 整朵云一起随风飘，飘出范围后从另一头回来
      float cx = aCloud.x + uTime * uDrift.x;
      float wrapped = mod(cx + uDrift.y * 0.5, uDrift.y) - uDrift.y * 0.5;
      wp.x += wrapped - aCloud.x;
      wp.y += sin(uTime * 0.11 + aCloud.y * 20.0) * 1.4;
      vWorld = wp.xyz;

      vec3 m0 = instanceMatrix[0].xyz;
      vec3 m1 = instanceMatrix[1].xyz;
      vec3 m2 = instanceMatrix[2].xyz;
      vNormal = normalize(mat3(instanceMatrix) * (normal / vec3(dot(m0, m0), dot(m1, m1), dot(m2, m2))));
      vLocalY = position.y;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragment: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying float vLocalY;

    void main() {
      vec3 n = normalize(vNormal);
      float up = n.y * 0.5 + 0.5;
      float sun = dot(n, uSunDir) * 0.5 + 0.5;
      float l = up * 0.6 + sun * 0.5;
      vec3 col = mix(uCloudShade, uCloudLit, smoothstep(0.2, 0.84, l));
      // 云底压暗一点，显得有厚度
      col = mix(col, uCloudShade, smoothstep(-0.15, -0.8, vLocalY) * 0.4);
      // 越远越融进天色
      float haze = clamp(distance(vWorld, cameraPosition) / 950.0, 0.0, 1.0);
      col = mix(col, uSkyHorizon, 0.04 + haze * haze * 0.7);
      outColor(col, 1.0);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  彩虹                                                               */
/* ------------------------------------------------------------------ */
const RAINBOW_INNER = 0.84;

const rainbowMaterial = makeMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertex: /* glsl */ `
    varying vec2 vP;
    void main() {
      vP = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: /* glsl */ `
    varying vec2 vP;

    void main() {
      float r = length(vP);
      float t = clamp((r - ${RAINBOW_INNER.toFixed(2)}) / ${(1 - RAINBOW_INNER).toFixed(2)}, 0.0, 1.0);

      vec3 violet = vec3(0.70, 0.58, 1.0);
      vec3 blue = vec3(0.42, 0.72, 1.0);
      vec3 green = vec3(0.48, 0.92, 0.62);
      vec3 yellow = vec3(1.0, 0.93, 0.45);
      vec3 orange = vec3(1.0, 0.70, 0.42);
      vec3 red = vec3(1.0, 0.46, 0.5);
      float x = t * 5.0;
      vec3 col = mix(violet, blue, smoothstep(0.0, 1.0, x));
      col = mix(col, green, smoothstep(1.0, 2.0, x));
      col = mix(col, yellow, smoothstep(2.0, 3.0, x));
      col = mix(col, orange, smoothstep(3.0, 4.0, x));
      col = mix(col, red, smoothstep(4.0, 5.0, x));

      float a = pow(sin(t * 3.14159), 0.75);
      // 两端落进远山的地方渐隐；只在白天出现
      a *= smoothstep(0.02, 0.5, atan(vP.y, abs(vP.x)));
      a *= 0.42 * (1.0 - smoothstep(0.1, 0.85, uSky.y));
      outColor(mix(col, vec3(1.0), 0.12), a);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  热气球                                                             */
/* ------------------------------------------------------------------ */
const hotAirMaterial = makeMaterial({
  vertex: /* glsl */ `
    attribute float aPart;
    attribute vec4 aAlt;
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying vec3 vLocal;
    varying vec3 vMain;
    varying vec3 vAlt;
    varying float vPart;

    void main() {
      vec4 wp = instanceMatrix * vec4(position, 1.0);
      float seed = aAlt.a;
      wp.y += sin(uTime * 0.23 + seed * 30.0) * 2.6;
      wp.x += sin(uTime * 0.045 + seed * 12.0) * 16.0;
      wp.z += cos(uTime * 0.036 + seed * 7.0) * 12.0;
      vWorld = wp.xyz;
      vNormal = normalize(mat3(instanceMatrix) * normal);
      vLocal = position;
      vMain = instanceColor;
      vAlt = aAlt.rgb;
      vPart = aPart;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragment: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying vec3 vLocal;
    varying vec3 vMain;
    varying vec3 vAlt;
    varying float vPart;

    void main() {
      vec3 n = normalize(vNormal);
      // 竖条纹 + 腰间一圈白
      float stripe = step(0.0, sin(atan(vLocal.z, vLocal.x) * 7.0));
      vec3 albedo = mix(vMain, vAlt, stripe);
      albedo = mix(albedo, vec3(1.0), step(abs(vLocal.y - 0.28), 0.07));
      albedo = mix(albedo, vec3(0.5, 0.33, 0.2), step(0.5, vPart));
      vec3 col = lit(albedo, n);
      col = mix(col, uSkyHorizon, fogAmount(distance(vWorld, cameraPosition)) * 0.5);
      outColor(col, 1.0);
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

interface Puff {
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  cloudX: number;
  seed: number;
}

interface HotAir {
  pos: THREE.Vector3;
  size: number;
  main: string;
  alt: string;
  seed: number;
}

let skyGeometry: THREE.BufferGeometry | null = null;
let hotAirGeometry: THREE.BufferGeometry | null = null;

function buildSky(length: number, cinemaZ: number, level: 'low' | 'mid' | 'high') {
  const root = new THREE.Group();
  const rand = mulberry32(777);

  /* 天穹 */
  skyGeometry ??= new THREE.SphereGeometry(1, 32, 20);
  const dome = new THREE.Mesh(skyGeometry, skyMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = 1000;
  dome.matrixAutoUpdate = false;
  root.add(dome);

  /* 云：每朵由 6~8 个压扁的球拼成 */
  const puffs: Puff[] = [];
  const cloudCount = level === 'low' ? 16 : level === 'mid' ? 24 : 32;
  const zMin = -(length + 620);
  const zMax = 460;
  for (let i = 0; i < cloudCount; i++) {
    // 多数在两侧远处，少数在路的尽头和身后
    const along = zMin + ((i + rand()) / cloudCount) * (zMax - zMin);
    const sideways = rand() < 0.78;
    const x = sideways
      ? (rand() < 0.5 ? -1 : 1) * (190 + rand() * 420)
      : (rand() - 0.5) * 320;
    const z = sideways ? along : rand() < 0.6 ? zMin - rand() * 160 : zMax + rand() * 120;
    const y = 78 + rand() * 96;
    const S = 34 + rand() * 40;
    const seed = rand();
    const add = (dx: number, dy: number, dz: number, r: number) => {
      puffs.push({
        pos: new THREE.Vector3(x + dx * S, y + dy * S + r * S * 0.3, z + dz * S),
        scale: new THREE.Vector3(r * S, r * S * 0.66, r * S * 0.86),
        cloudX: x,
        seed,
      });
    };
    add(0, 0, 0, 0.52);
    add(-0.52 - rand() * 0.1, -0.06, 0.05, 0.38);
    add(0.5 + rand() * 0.12, -0.05, -0.04, 0.4);
    add(-0.96 - rand() * 0.1, -0.1, 0.0, 0.25);
    add(0.95 + rand() * 0.14, -0.1, 0.06, 0.27);
    add(0.16, 0.2 + rand() * 0.06, -0.1, 0.36);
    if (rand() < 0.7) add(-0.26, 0.15, 0.12, 0.32);
    if (rand() < 0.5) add(0.3, -0.08, 0.3, 0.3);
  }
  root.add(
    instanced<Puff>({
      items: puffs,
      geometry: sphereGeometry(3),
      material: cloudMaterial,
      chunked: false,
      position: (p) => p.pos,
      matrix: (p, m) => m.compose(p.pos, IDENTITY_QUAT, p.scale),
      attributes: {
        aCloud: {
          size: 2,
          write: (p, out, o) => {
            out[o] = p.cloudX;
            out[o + 1] = p.seed;
          },
        },
      },
    }),
  );

  /* 彩虹：立在路的尽头，被远山挡住两只脚 */
  {
    const ring = new THREE.RingGeometry(RAINBOW_INNER, 1, 72, 1, 0, Math.PI);
    const mesh = new THREE.Mesh(ring, rainbowMaterial);
    const radius = 250;
    mesh.position.set(pathX(-cinemaZ) + 40, -26, cinemaZ - 540);
    mesh.scale.setScalar(radius);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.userData.ownGeometry = true;
    root.add(mesh);
  }

  /* 热气球 */
  {
    hotAirGeometry ??= hotAirBalloonGeometry();
    const schemes: Array<[string, string]> = [
      ['#ff8fa3', '#fff3c4'],
      ['#7ec8f8', '#ffffff'],
      ['#ffd166', '#ff8a5b'],
      ['#b9a2ff', '#ffe3ea'],
      ['#7ed9b7', '#fff6d8'],
    ];
    const count = level === 'low' ? 3 : 5;
    const items: HotAir[] = [];
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -(((i + 0.5) / count) * (length + 120)) + 20;
      items.push({
        pos: new THREE.Vector3(pathX(-z) + side * (120 + rand() * 130), 46 + rand() * 46, z - rand() * 60),
        size: 8.5 + rand() * 4.5,
        main: schemes[i % schemes.length][0],
        alt: schemes[i % schemes.length][1],
        seed: rand(),
      });
    }
    const scale = new THREE.Vector3();
    root.add(
      instanced<HotAir>({
        items,
        geometry: hotAirGeometry,
        material: hotAirMaterial,
        chunked: false,
        position: (b) => b.pos,
        matrix: (b, m) => m.compose(b.pos, IDENTITY_QUAT, scale.setScalar(b.size)),
        color: (b) => b.main,
        attributes: {
          aAlt: {
            size: 4,
            write: (b, out, o) => {
              writeColor(b.alt, out, o);
              out[o + 3] = b.seed;
            },
          },
        },
      }),
    );
  }

  return root;
}

const IDENTITY_QUAT = new THREE.Quaternion();

export function Sky() {
  const length = useStore((s) => s.world.length);
  const cinemaZ = useStore((s) => s.world.cinema.center.z);
  const level = getDeviceTier().level;
  const root = useMemo(() => buildSky(length, cinemaZ, level), [length, cinemaZ, level]);
  useEffect(() => () => disposeTree(root), [root]);
  return <primitive object={root} />;
}
