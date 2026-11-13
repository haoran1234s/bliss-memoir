/**
 * 露天影院：小路尽头的大银幕
 * ------------------------------------------------------------
 * 银幕贴的是真实的 <video>（由 media/cinema.ts 统一管理）。镜头走近才开始
 * 静音预览，走远就暂停。白天它是草坪上的一块幕布；点进影院天色转为黄昏，
 * 灯串亮起；「关灯」之后变成星空，银幕和灯串把草坪照亮。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { videos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { getVideoTexture, setCinemaNear, useCinema } from '../../media/cinema';
import { useStore } from '../../store/useStore';
import { cam } from '../../three/cameraInput';
import { makeMaterial } from '../../three/env';
import { sphereGeometry } from '../../three/geometry';
import { disposeTree, instanced, writeColor } from '../../three/instancing';
import { blobMaterial, glowMaterial, solidMaterial } from '../../three/materials';
import { finishCanvasTexture, MARQUEE_SIZE, paintMarquee, paintPosterFallback } from '../../three/textures';
import { SCREEN, type BlanketInfo, type BlobInfo, type BulbInfo, type World } from '../../three/world';
import { panelMaterial } from './Boards';

const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY = new THREE.Quaternion();
const scale = new THREE.Vector3();
const quat = new THREE.Quaternion();

/* ------------------------------------------------------------------ */
/*  银幕                                                               */
/* ------------------------------------------------------------------ */
const screenUniforms = {
  uVideo: { value: null as THREE.Texture | null },
  uPoster: { value: null as THREE.Texture | null },
  /** x 视频淡入 · y 封面淡入 */
  uShow: { value: new THREE.Vector2(0, 0) },
  /** x 视频宽高比 · y 封面宽高比 · z 银幕宽高比 */
  uAspect: { value: new THREE.Vector3(16 / 9, 16 / 9, SCREEN.W / SCREEN.H) },
};

const screenMaterial = makeMaterial({
  uniforms: screenUniforms,
  vertex: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragment: /* glsl */ `
    uniform sampler2D uVideo;
    uniform sampler2D uPoster;
    uniform vec2 uShow;
    uniform vec3 uAspect;
    varying vec2 vUv;
    varying vec3 vWorld;

    // 视频贴图不走显卡的 sRGB 解码，手动转到线性空间
    vec3 toLinear(vec3 c) {
      return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    }

    // 完整显示（不裁切）：返回取样坐标；xy 超出 0~1 的部分是黑边
    vec2 contain(vec2 uv, float aspect) {
      vec2 s = aspect > uAspect.z ? vec2(1.0, aspect / uAspect.z) : vec2(uAspect.z / aspect, 1.0);
      return (uv - 0.5) * s + 0.5;
    }

    float inside(vec2 uv) {
      vec2 e = abs(uv - 0.5) - 0.5;
      float d = max(e.x, e.y);
      return 1.0 - smoothstep(-0.002, 0.002, d);
    }

    void main() {
      vec3 bars = vec3(0.035, 0.03, 0.06);
      vec3 img = mix(vec3(0.93, 0.9, 0.86), bars, max(uShow.x, uShow.y));

      vec2 pu = contain(vUv, uAspect.y);
      vec3 poster = mix(bars, texture2D(uPoster, clamp(pu, 0.0, 1.0)).rgb, inside(pu));
      img = mix(img, poster, uShow.y);

      vec2 vu = contain(vUv, uAspect.x);
      vec3 video = mix(bars, toLinear(texture2D(uVideo, clamp(vu, 0.0, 1.0)).rgb), inside(vu));
      img = mix(img, video, uShow.x);

      // 白天幕布被天光冲淡一点；天黑以后画面更亮更通透
      float lights = uAtmo.w;
      vec3 col = img * mix(0.95, 1.12, lights);
      col = mix(col, uSkyHorizon, (1.0 - lights) * 0.05);
      outColor(withFog(col, vWorld), 1.0);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  灯泡、野餐垫                                                        */
/* ------------------------------------------------------------------ */
const bulbMaterial = makeMaterial({
  vertex: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying vec3 vColor;
    void main() {
      vec4 wp = instanceMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vNormal = normalize(mat3(instanceMatrix) * normal);
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
      // 白天是一颗颗磨砂玻璃球；天黑以后自己发光
      vec3 day = vColor * (hemi(n) + softSun(n)) * 0.96
        + uSunColor * pow(max(dot(n, normalize(uSunDir + v)), 0.0), 60.0) * 0.5;
      vec3 night = vColor * 1.3 + 0.2;
      outColor(withFog(mix(day, night, uAtmo.w), vWorld), 1.0);
    }
  `,
});

const blanketMaterial = makeMaterial({
  vertex: /* glsl */ `
    varying vec2 vMeters;
    varying vec2 vEdge;
    varying vec3 vWorld;
    varying vec3 vColor;
    void main() {
      vec4 wp = instanceMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
      vMeters = position.xz * size;
      vEdge = (0.5 - abs(position.xz)) * size;
      vColor = instanceColor;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragment: /* glsl */ `
    varying vec2 vMeters;
    varying vec2 vEdge;
    varying vec3 vWorld;
    varying vec3 vColor;
    void main() {
      // 格子布：横竖两组条纹叠在一起
      vec2 g = step(0.5, fract(vMeters / 0.26));
      vec3 albedo = mix(vec3(1.0, 0.985, 0.95), vColor, (g.x + g.y) * 0.5);
      // 四周一圈白色包边
      float edge = min(vEdge.x, vEdge.y);
      albedo = mix(vec3(1.0, 0.985, 0.95), albedo, smoothstep(0.035, 0.05, edge));
      vec3 light = uAmbSky + uSunColor * 0.95 + vec3(1.0, 0.8, 0.52) * uAtmo.w * 0.5;
      outColor(withFog(albedo * light, vWorld), 1.0);
    }
  `,
});

/* ------------------------------------------------------------------ */
/*  组装                                                               */
/* ------------------------------------------------------------------ */
interface Part {
  pos: THREE.Vector3;
  size: THREE.Vector3;
  color: string;
}

let boxGeo: THREE.BufferGeometry | null = null;
let blanketGeo: THREE.BufferGeometry | null = null;
let glowQuad: THREE.BufferGeometry | null = null;

function build(world: World) {
  const root = new THREE.Group();
  const c = world.cinema;
  /** 影院局部坐标 → 世界坐标（x 向右、y 离地高度、z 朝观众） */
  const at = (x: number, y: number, z: number) =>
    c.center.clone().addScaledVector(c.right, x).addScaledVector(UP, y - SCREEN.CENTER_Y).addScaledVector(c.normal, z);

  /* 银幕 */
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.W, SCREEN.H), screenMaterial);
  screen.position.copy(c.center);
  screen.quaternion.copy(c.quat);
  screen.updateMatrix();
  screen.matrixAutoUpdate = false;
  screen.userData.ownGeometry = true;
  root.add(screen);

  /* 画框与支架 */
  const top = SCREEN.CENTER_Y + SCREEN.H / 2;
  const bottom = SCREEN.CENTER_Y - SCREEN.H / 2;
  const bar = 0.15;
  const WHITE = '#fffaf2';
  const parts: Part[] = [
    { pos: at(0, top + bar / 2, 0), size: new THREE.Vector3(SCREEN.W + bar * 2, bar, 0.13), color: WHITE },
    { pos: at(0, bottom - bar / 2, 0), size: new THREE.Vector3(SCREEN.W + bar * 2, bar, 0.13), color: WHITE },
    { pos: at(-SCREEN.W / 2 - bar / 2, (top + bar) / 2, 0), size: new THREE.Vector3(bar, top + bar, 0.13), color: WHITE },
    { pos: at(SCREEN.W / 2 + bar / 2, (top + bar) / 2, 0), size: new THREE.Vector3(bar, top + bar, 0.13), color: WHITE },
    // 幕布背板
    { pos: at(0, SCREEN.CENTER_Y, -0.05), size: new THREE.Vector3(SCREEN.W, SCREEN.H, 0.02), color: '#f3ead9' },
  ];
  boxGeo ??= new THREE.BoxGeometry(1, 1, 1);
  root.add(
    instanced<Part>({
      items: parts,
      geometry: boxGeo,
      material: solidMaterial(),
      chunked: false,
      position: (p) => p.pos,
      matrix: (p, m) => m.compose(p.pos, c.quat, p.size),
      color: (p) => p.color,
    }),
  );

  /* 顶上的横幅 */
  const marqueeMaterial = panelMaterial({
    width: MARQUEE_SIZE.w,
    height: MARQUEE_SIZE.h,
    radius: MARQUEE_SIZE.h / 2,
    tint: '#ff7e8a',
    emissive: 1,
  });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(MARQUEE_SIZE.w, MARQUEE_SIZE.h), marqueeMaterial);
  marquee.position.copy(at(0, top + bar + MARQUEE_SIZE.h / 2 - 0.04, 0.08));
  marquee.quaternion.copy(c.quat);
  marquee.updateMatrix();
  marquee.matrixAutoUpdate = false;
  marquee.userData.ownGeometry = true;
  root.add(marquee);

  /* 灯串：玻璃球 + 夜里的柔光 */
  root.add(
    instanced<BulbInfo>({
      items: world.bulbs,
      geometry: sphereGeometry(1),
      material: bulbMaterial,
      chunked: false,
      position: (b) => b.pos,
      matrix: (b, m) => m.compose(b.pos, IDENTITY, scale.setScalar(0.052)),
      color: (b) => b.color,
    }),
  );
  {
    if (!glowQuad) {
      glowQuad = new THREE.BufferGeometry();
      glowQuad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
      glowQuad.setIndex([0, 1, 2, 0, 2, 3]);
    }
    const n = world.bulbs.length;
    const centre = new Float32Array(n * 3);
    const glow = new Float32Array(n * 4);
    const seed = new Float32Array(n);
    world.bulbs.forEach((b, i) => {
      b.pos.toArray(centre, i * 3);
      writeColor(b.color, glow, i * 4);
      glow[i * 4 + 3] = 0.62;
      seed[i] = b.seed;
    });
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(glowQuad.getIndex());
    geo.setAttribute('position', glowQuad.getAttribute('position'));
    geo.setAttribute('aCentre', new THREE.InstancedBufferAttribute(centre, 3));
    geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 4));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.instanceCount = n;
    const halos = new THREE.Mesh(geo, glowMaterial());
    halos.frustumCulled = false;
    halos.matrixAutoUpdate = false;
    halos.renderOrder = 20;
    halos.userData.ownGeometry = true;
    root.add(halos);
  }

  /* 野餐垫与靠垫 */
  if (!blanketGeo) {
    blanketGeo = new THREE.PlaneGeometry(1, 1);
    blanketGeo.rotateX(-Math.PI / 2);
  }
  root.add(
    instanced<BlanketInfo>({
      items: world.blankets,
      geometry: blanketGeo,
      material: blanketMaterial,
      chunked: false,
      position: (b) => b.pos,
      matrix: (b, m) => m.compose(b.pos, quat.setFromAxisAngle(UP, b.rotation), scale.set(b.w, 1, b.h)),
      color: (b) => b.color,
    }),
  );
  root.add(
    instanced<BlobInfo>({
      items: world.cushions,
      geometry: sphereGeometry(2),
      material: blobMaterial('cushion'),
      chunked: false,
      position: (b) => b.pos,
      matrix: (b, m) => m.compose(b.pos, IDENTITY, b.scale),
      color: (b) => b.color,
      attributes: {
        aSeed: {
          size: 1,
          write: (b, out, o) => {
            out[o] = b.seed;
          },
        },
      },
    }),
  );

  return { root, marqueeMaterial };
}

export function Cinema() {
  const world = useStore((s) => s.world);
  const fonts = useStore((s) => s.boot.fonts);
  const videoId = useStore((s) => s.cinema.videoId);
  const gl = useThree((s) => s.gl);
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

  const built = useMemo(() => build(world), [world]);
  useEffect(
    () => () => {
      disposeTree(built.root);
      built.marqueeMaterial.uniforms.uMap.value?.dispose();
      built.marqueeMaterial.dispose();
    },
    [built],
  );

  // 横幅上的结束语
  useEffect(() => {
    if (!fonts) return;
    const canvas = document.createElement('canvas');
    paintMarquee(canvas, couple.farewell);
    const u = built.marqueeMaterial.uniforms;
    u.uMap.value?.dispose();
    u.uMap.value = finishCanvasTexture(canvas, anisotropy);
    u.uReady.value = 1;
  }, [built, fonts, anisotropy]);

  // 当前影片的封面
  const posterReady = useRef(false);
  useEffect(() => {
    const video = videos.find((v) => v.id === videoId) ?? videos[0];
    posterReady.current = false;
    let cancelled = false;
    let texture: THREE.Texture | null = null;
    const apply = (tex: THREE.Texture, aspect: number) => {
      if (cancelled) {
        tex.dispose();
        return;
      }
      texture = tex;
      screenUniforms.uPoster.value = tex;
      screenUniforms.uAspect.value.y = aspect;
      posterReady.current = true;
    };
    const fallback = () => {
      const canvas = document.createElement('canvas');
      paintPosterFallback(canvas, video?.title ?? '');
      apply(finishCanvasTexture(canvas, anisotropy), canvas.width / canvas.height);
    };
    if (!video) fallback();
    else {
      new THREE.TextureLoader().load(
        video.posterUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = anisotropy;
          const img = tex.image as HTMLImageElement;
          apply(tex, img.width / Math.max(1, img.height));
        },
        undefined,
        fallback,
      );
    }
    return () => {
      cancelled = true;
      if (texture) {
        if (screenUniforms.uPoster.value === texture) screenUniforms.uPoster.value = null;
        texture.dispose();
      }
    };
  }, [videoId, anisotropy]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const max = world.stops.length - 1;
    // 走到离影院两三站的地方就开始静音预览
    const near = cam.value > max - 2.6;
    setCinemaNear(near);

    const tex = getVideoTexture();
    const media = useCinema.getState();
    const show = screenUniforms.uShow.value;
    const videoReady = !!tex && media.ready && !media.failed;
    if (videoReady) {
      screenUniforms.uVideo.value = tex;
      const el = tex!.image as HTMLVideoElement;
      if (el.videoWidth > 0 && el.videoHeight > 0) screenUniforms.uAspect.value.x = el.videoWidth / el.videoHeight;
    }
    show.x = THREE.MathUtils.clamp(show.x + (videoReady ? dt : -dt) * 2.6, 0, 1);
    show.y = THREE.MathUtils.clamp(show.y + (posterReady.current ? dt : -dt) * 2.6, 0, 1);
  });

  return <primitive object={built.root} />;
}
