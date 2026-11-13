/**
 * 照片卡：夹在麻绳上的拍立得
 * ------------------------------------------------------------
 * 几百张照片只用「图集页数」那么多次绘制调用：
 *   - 同一页图集里的 16 张照片合成一个实例化网格，共用一张贴图；
 *   - 拍立得的白边、圆角、照片边缘的细微内凹都在片元着色器里画，
 *     不需要为每张照片生成单独的贴图；
 *   - 卡片像钟摆一样绕着夹子轻轻摆动，全在顶点着色器里完成；
 *   - 贴图由 AtlasStreamer 按「镜头在哪」流式加载：加载完成前显示照片的平均色，
 *     然后淡入低清图，走近后再淡入高清图。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { atlas, photos } from '../../data/library';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useStore } from '../../store/useStore';
import { AtlasStreamer } from '../../three/atlas';
import { cam, clamp } from '../../three/cameraInput';
import { makeMaterial } from '../../three/env';
import { disposeTree, writeColor } from '../../three/instancing';
import { hover } from '../../three/picking';
import { fovForAspect, viewDistance } from '../../three/rail';
import { CARD, type CardInfo, type World } from '../../three/world';

/** 鼠标悬停的那张照片：x 照片序号，y 强度 0~1。所有图集页共用。 */
const uHot = { value: new THREE.Vector2(-1, 0) };

const VERTEX = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec4 aQuat;
  attribute vec4 aSize;
  attribute vec4 aUv;
  attribute vec3 aTint;
  attribute vec3 aSeed;
  uniform vec2 uHot;
  varying vec2 vCard;
  varying vec4 vSize;
  varying vec4 vUvRect;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vHot;

  void main() {
    float hot = abs(aSeed.z - uHot.x) < 0.5 ? uHot.y : 0.0;
    float seed = aSeed.y;
    vec2 size = aSize.xy;

    // 卡片坐标：原点在夹子处（上边缘中点），向下垂
    vec3 local = vec3(position.x * size.x, position.y * size.y, 0.0);
    vCard = vec2(local.x, -local.y);

    // 悬停：以卡片中心放大一点
    vec2 centre = vec2(0.0, -size.y * 0.5);
    local.xy = centre + (local.xy - centre) * (1.0 + 0.085 * hot);

    // 钟摆：在架子平面内左右摆，同时下摆微微朝镜头掀起
    float calm = (1.0 - hot) * uWind.z;
    float swing = (sin(uTime * (1.0 + seed * 0.6) + seed * 40.0) * 0.03 + sin(uTime * 2.3 + seed * 17.0) * 0.011) * calm;
    float lift = (sin(uTime * 1.45 + seed * 70.0) * 0.5 + 0.5) * 0.075 * calm;
    float cs = cos(swing);
    float sn = sin(swing);
    local.xy = vec2(local.x * cs - local.y * sn, local.x * sn + local.y * cs);
    local = vec3(local.x, local.y * cos(lift), -local.y * sin(lift) + 0.035 * hot);

    vec3 wp = aOrigin + rotateQ(local, aQuat) + rackBob(aSeed.x);
    vWorld = wp;
    vSize = aSize;
    vUvRect = aUv;
    vTint = aTint;
    vHot = hot;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uLo;
  uniform sampler2D uHi;
  uniform vec2 uMix;
  varying vec2 vCard;
  varying vec4 vSize;
  varying vec4 vUvRect;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vHot;

  const float BORDER = ${CARD.BORDER.toFixed(4)};
  const float RADIUS = 0.009;

  void main() {
    vec2 size = vSize.xy;
    vec2 photoSize = vSize.zw;

    // 圆角矩形的有向距离（米），负数在卡片内
    vec2 q = abs(vCard - vec2(0.0, size.y * 0.5)) - size * 0.5 + RADIUS;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - RADIUS;
    float aa = max(fwidth(sd), 1e-5);
    float alpha = 1.0 - smoothstep(-aa, aa, sd);
    if (alpha < 0.03) discard;

    // 照片区域
    vec2 uvp = vec2(vCard.x / photoSize.x + 0.5, (vCard.y - BORDER) / photoSize.y);
    vec2 e = (abs(uvp - 0.5) - 0.5) * photoSize;
    float sdPhoto = max(e.x, e.y);
    float inPhoto = 1.0 - smoothstep(-aa, aa, sdPhoto);

    vec2 uv = vUvRect.xy + clamp(uvp, 0.0, 1.0) * vUvRect.zw;
    vec3 photo = vTint;
    if (uMix.x > 0.0) photo = mix(photo, texture2D(uLo, uv, -0.3).rgb, uMix.x);
    if (uMix.y > 0.0) photo = mix(photo, texture2D(uHi, uv, -0.3).rgb, uMix.y);
    // 照片像是嵌在相纸里：边缘一圈极窄的暗线
    photo *= mix(0.84, 1.0, smoothstep(0.0, 0.0035, -sdPhoto));

    // 相纸：暖白，边缘略暗
    vec3 paper = vec3(1.0, 0.982, 0.948) * (0.93 + 0.07 * smoothstep(0.0, 0.016, -sd));
    vec3 col = mix(paper, photo, inPhoto);
    if (!gl_FrontFacing) col = paper * 0.9;

    col *= uCardLight * (1.0 + vHot * 0.06);
    outColor(withFog(col, vWorld), alpha);
  }
`;

interface Page {
  page: number;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** 低清 / 高清贴图当前的淡入进度 */
  lo: number;
  hi: number;
}

let quad: THREE.BufferGeometry | null = null;
function getQuad() {
  if (!quad) {
    quad = new THREE.BufferGeometry();
    // 原点在上边缘中点
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, -1, 0, -0.5, -1, 0], 3));
    quad.setIndex([0, 3, 2, 0, 2, 1]);
  }
  return quad;
}

function buildPages(world: World) {
  const root = new THREE.Group();
  const groups = new Map<number, CardInfo[]>();
  for (const card of world.cards) {
    const page = photos[card.photo].page;
    let list = groups.get(page);
    if (!list) groups.set(page, (list = []));
    list.push(card);
  }

  const pages: Page[] = [];
  const base = getQuad();
  const box = new THREE.Box3();

  for (const [page, cards] of groups) {
    const n = cards.length;
    const origin = new Float32Array(n * 3);
    const quat = new Float32Array(n * 4);
    const size = new Float32Array(n * 4);
    const uv = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    const seed = new Float32Array(n * 3);
    box.makeEmpty();

    cards.forEach((card, i) => {
      const photo = photos[card.photo];
      card.pos.toArray(origin, i * 3);
      card.quat.toArray(quat, i * 4);
      size.set([card.w, card.h, card.pw, card.ph], i * 4);
      const [x, y, w, h] = photo.rect;
      uv.set([x / atlas.page, y / atlas.page, w / atlas.page, h / atlas.page], i * 4);
      writeColor(photo.color, tint, i * 3);
      seed.set([card.rackSeed, card.seed, card.photo], i * 3);
      box.expandByPoint(card.pos);
    });

    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(base.getIndex());
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    geo.setAttribute('aQuat', new THREE.InstancedBufferAttribute(quat, 4));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 4));
    geo.setAttribute('aUv', new THREE.InstancedBufferAttribute(uv, 4));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    geo.instanceCount = n;
    // 手动给包围球：实例的位置在属性里，three 自己算不出来
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    geo.boundingSphere.radius += 0.9;

    const material = makeMaterial({
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      uniforms: {
        uLo: { value: null },
        uHi: { value: null },
        uMix: { value: new THREE.Vector2(0, 0) },
        uHot,
      },
      vertex: VERTEX,
      fragment: FRAGMENT,
    });

    const mesh = new THREE.Mesh(geo, material);
    mesh.matrixAutoUpdate = false;
    mesh.userData.ownGeometry = true;
    mesh.userData.ownMaterial = material;
    root.add(mesh);
    pages.push({ page, mesh, material, lo: 0, hi: 0 });
  }

  pages.sort((a, b) => a.page - b.page);
  return { root, pages };
}

export function PhotoCards() {
  const world = useStore((s) => s.world);
  const gl = useThree((s) => s.gl);
  const tier = getDeviceTier();

  const built = useMemo(() => buildPages(world), [world]);
  useEffect(() => () => disposeTree(built.root), [built]);

  /** 贴图有变化、需要重新绑定的页 */
  const dirty = useRef(new Set<number>());

  const streamer = useMemo(
    () =>
      new AtlasStreamer(gl, {
        loSize: tier.atlasLo,
        maxLo: tier.atlasLoBudget,
        anisotropy: Math.min(8, gl.capabilities.getMaxAnisotropy()),
        onChange: (page) => dirty.current.add(page),
      }),
    [gl, tier],
  );
  useEffect(() => {
    const canvas = gl.domElement;
    const onRestored = () => streamer.reset();
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextrestored', onRestored);
      streamer.dispose();
    };
  }, [gl, streamer]);

  const focusKey = useRef('');
  const hot = useRef({ index: -1, amount: 0 });
  const bootProgress = useRef(-1);

  // 布局重建后（横竖屏切换），把已经在显存里的贴图直接接上，不重新淡入
  useEffect(() => {
    for (const p of built.pages) {
      const lo = streamer.lo(p.page);
      const hi = streamer.hi(p.page);
      p.material.uniforms.uLo.value = lo;
      p.material.uniforms.uHi.value = hi;
      p.lo = lo ? 1 : 0;
      p.hi = hi ? 1 : 0;
      p.material.uniforms.uMix.value.set(p.lo, p.hi);
    }
    focusKey.current = '';
  }, [built, streamer]);

  useFrame((state, delta) => {
    if (!photos.length) return;
    const dt = Math.min(delta, 0.05);
    const stops = world.stops;
    const max = stops.length - 1;

    /* —— 告诉加载器镜头在哪 —— */
    const a = clamp(Math.round(Math.min(cam.value, cam.target)), 0, max);
    const b = clamp(Math.round(Math.max(cam.value, cam.target)), 0, max);
    // 一张照片在屏幕上大约占多少像素，决定高清档用哪个分辨率
    const { width, height } = state.size;
    const aspect = width / Math.max(1, height);
    const tanV = Math.tan(THREE.MathUtils.degToRad(fovForAspect(aspect)) / 2);
    const rackStop = stops.find((s) => s.kind === 'rack') ?? stops[0];
    const dist = viewDistance(rackStop.fitW, rackStop.fitH, aspect, height);
    const photoPx = (CARD.LONG * height * state.viewport.dpr) / (2 * dist * tanV);
    const hiSize = Math.min(tier.atlasHi, photoPx > 270 ? 2048 : photoPx > 110 ? 1024 : 512);

    const key = `${a}-${b}-${hiSize}`;
    if (key !== focusKey.current) {
      focusKey.current = key;
      const pageOf = (stop: number, end: 'first' | 'last') =>
        photos[clamp(stops[clamp(stop, 0, max)][end], 0, photos.length - 1)].page;
      const r = tier.atlasLoRadius;
      streamer.focus(pageOf(a - 1, 'first'), pageOf(b + 1, 'last'), pageOf(a - r, 'first'), pageOf(b + r, 'last'), hiSize);
    }
    streamer.update(performance.now());

    /* —— 把新到的贴图接到材质上，并推进淡入 —— */
    for (const p of built.pages) {
      const u = p.material.uniforms;
      if (dirty.current.has(p.page)) {
        const lo = streamer.lo(p.page);
        const hi = streamer.hi(p.page);
        u.uLo.value = lo;
        u.uHi.value = hi;
        if (!lo) p.lo = 0;
        if (!hi) p.hi = 0;
      }
      const loTarget = u.uLo.value ? 1 : 0;
      const hiTarget = u.uHi.value ? 1 : 0;
      if (p.lo !== loTarget) p.lo = loTarget ? Math.min(1, p.lo + dt * 2.6) : 0;
      if (p.hi !== hiTarget) p.hi = hiTarget ? Math.min(1, p.hi + dt * 3.2) : 0;
      u.uMix.value.set(p.lo, p.hi);
    }
    dirty.current.clear();

    /* —— 悬停高亮 —— */
    const h = hot.current;
    if (hover.index >= 0) {
      if (h.index !== hover.index) {
        h.index = hover.index;
        h.amount = 0;
      }
      h.amount = Math.min(1, h.amount + dt * 7);
    } else {
      h.amount = Math.max(0, h.amount - dt * 6);
    }
    uHot.value.set(h.index, h.amount * h.amount * (3 - 2 * h.amount));

    /* —— 开场：入口附近的照片就绪后通知加载页 —— */
    if (bootProgress.current < 1) {
      const first = photos[0].page;
      const last = photos[clamp(stops[Math.min(2, max)].last, 0, photos.length - 1)].page;
      const progress = streamer.progress(first, last);
      if (progress !== bootProgress.current) {
        bootProgress.current = progress;
        useStore.getState().setBoot({ photos: progress });
      }
    }
  });

  return <primitive object={built.root} />;
}
