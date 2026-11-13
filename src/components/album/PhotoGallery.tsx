/**
 * 纯净照片画廊核心视图（3D Album Rail 扇形环幕 / 3D 叠片 / 原比例瀑布流）
 * ------------------------------------------------------------
 * 彻底去除所有单图对应的文字、编号、故事和顶部横幅文字，专注纯视觉看图体验：
 *   1. arc（3D 环幕，复刻 React Bits Album Rail）：
 *      - 统一圆角方正封套 + 水平 3D 扇形拱桥排布 + 透视折角 + SDF 层叠柔和投影；
 *      - 单指左右拨动/点击侧翼丝滑环绕切图，轻点中央大图即刻全屏查看完整原比例照片；
 *   2. stack（3D 叠片，复刻 react-bits/Stack）：
 *      - 单手拖拽甩牌切图 + 后排牌实时纵深跟进；
 *   3. grid（原比例瀑布流，复刻 react-bits/Masonry）：
 *      - 手机双列纯粹图片流，保留原图长宽比不裁切，无任何下方文字条。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, ImageOff, Pause, Play } from 'lucide-react';
import { atlas, photos } from '../../data/library';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore, type ThemeMode } from '../../store/useAlbumStore';
import { AtlasStreamer } from '../../three/atlas';
import type { Photo } from '../../types';
import { getFilteredPhotos } from './albumHelpers';

interface ReelPhysics {
  scrollPos: number;
  targetPos: number;
  dragging: boolean;
  velocity: number;
  count: number;
  moved: boolean;
}

function isWebGLSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function parseHexColor(hex: string): THREE.Color {
  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color('#d4d4d8');
  }
}

const RAIL_CARD_PAD = 1.22;

/** 计算 Album Rail 统一封套尺寸（保证移动端左右 7 张扇翼完整入画且中心主卡饱满） */
function computeArcCardSize(vpWidth: number, vpHeight: number) {
  const isCompactPortrait = vpWidth < vpHeight * 0.92;
  const cardAspect = isCompactPortrait ? 1 / 1.06 : 1 / 1.02;
  const maxW = vpWidth * (isCompactPortrait ? 0.5 : 0.44);
  const maxH = vpHeight * (isCompactPortrait ? 0.44 : 0.48);

  let w = maxW;
  let h = w / cardAspect;
  if (h > maxH) {
    h = maxH;
    w = h * cardAspect;
  }
  return { w: Math.max(0.65, w), h: Math.max(0.65, h) };
}

interface HiTexEntry {
  thumb: THREE.Texture | null;
  full: THREE.Texture | null;
  thumbState: 'idle' | 'loading' | 'ready' | 'error';
  fullState: 'idle' | 'loading' | 'ready' | 'error';
  lastUsed: number;
}

class FocusTextureCache {
  private entries = new Map<number, HiTexEntry>();
  private loadingCount = 0;
  private maxEntries = 18;
  private disposed = false;

  constructor(private gl: THREE.WebGLRenderer, private onDirty: () => void) {}

  private ensureEntry(photoIndex: number): HiTexEntry {
    let e = this.entries.get(photoIndex);
    if (!e) {
      e = {
        thumb: null,
        full: null,
        thumbState: 'idle',
        fullState: 'idle',
        lastUsed: performance.now(),
      };
      this.entries.set(photoIndex, e);
    }
    e.lastUsed = performance.now();
    return e;
  }

  getBestTexture(photoIndex: number): THREE.Texture | null {
    const e = this.entries.get(photoIndex);
    if (!e) return null;
    e.lastUsed = performance.now();
    return e.full ?? e.thumb;
  }

  requestAround(list: Photo[], centerSlot: number) {
    if (this.disposed || list.length === 0) return;
    const offsets = [0, 1, -1, 2, -2, 3, -3];
    for (const off of offsets) {
      const slot = centerSlot + off;
      if (slot < 0 || slot >= list.length) continue;
      const photo = list[slot];
      const e = this.ensureEntry(photo.index);

      if (e.thumbState === 'idle' && this.loadingCount < 4) {
        this.loadOne(photo, 'thumb', e);
      }
      if (Math.abs(off) <= 1 && e.fullState === 'idle' && this.loadingCount < 4) {
        this.loadOne(photo, 'full', e);
      }
    }
    this.evictOldest();
  }

  private loadOne(photo: Photo, kind: 'thumb' | 'full', entry: HiTexEntry) {
    const url = kind === 'full' ? photo.full : photo.thumb;
    if (kind === 'full') entry.fullState = 'loading';
    else entry.thumbState = 'loading';
    this.loadingCount++;

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.loadingCount--;
      if (this.disposed || !this.entries.has(photo.index)) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
      tex.needsUpdate = true;
      this.gl.initTexture(tex);

      if (kind === 'full') {
        entry.full?.dispose();
        entry.full = tex;
        entry.fullState = 'ready';
      } else {
        entry.thumb?.dispose();
        entry.thumb = tex;
        entry.thumbState = 'ready';
      }
      this.onDirty();
    };
    img.onerror = () => {
      this.loadingCount--;
      if (kind === 'full') entry.fullState = 'error';
      else entry.thumbState = 'error';
    };
    img.src = url;
  }

  private evictOldest() {
    if (this.entries.size <= this.maxEntries) return;
    const sorted = [...this.entries.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    let over = sorted.length - this.maxEntries;
    for (const [idx, e] of sorted) {
      if (over <= 0) break;
      e.thumb?.dispose();
      e.full?.dispose();
      this.entries.delete(idx);
      over--;
    }
  }

  reset() {
    for (const e of this.entries.values()) {
      e.thumb?.dispose();
      e.full?.dispose();
    }
    this.entries.clear();
  }

  dispose() {
    this.disposed = true;
    this.reset();
  }
}

/* ============================================================
   模式一：Album Rail WebGL Shader（圆角封套 + 居中裁切 + SDF 层叠投影）
   ============================================================ */
const CIRCULAR_VERTEX = /* glsl */ `
  precision highp float;
  uniform vec2 uCardSize;
  uniform float uPadFactor;
  uniform float uSpeed;
  varying vec2 vLocalPos;

  void main() {
    vec3 pos = position;
    pos.x *= uCardSize.x * uPadFactor;
    pos.y *= uCardSize.y * uPadFactor;
    vLocalPos = pos.xy;

    // 极轻柔的水平甩动空气阻力微弯（静止时绝对平直锐利）
    float normX = pos.x / max(uCardSize.x * 0.5, 0.01);
    pos.z -= (normX * normX) * clamp(abs(uSpeed), 0.0, 1.5) * 0.025;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const CIRCULAR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uHasAtlas;
  uniform vec4 uAtlasUv;
  uniform sampler2D uDirectTex;
  uniform float uHasDirect;
  uniform vec3 uBaseColor;
  uniform vec2 uCardSize;
  uniform float uPhotoAspect;
  uniform float uBrightness;
  uniform float uCardAlpha;
  uniform float uShadowStrength;

  varying vec2 vLocalPos;

  void main() {
    vec2 halfSize = uCardSize * 0.5;
    float radius = min(uCardSize.x, uCardSize.y) * 0.048;

    vec2 q = abs(vLocalPos) - halfSize + radius;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;

    vec2 shadowPos = vLocalPos - vec2(0.0, -uCardSize.y * 0.024);
    vec2 qs = abs(shadowPos) - halfSize + radius;
    float sdShadow = length(max(qs, 0.0)) + min(max(qs.x, qs.y), 0.0) - radius;
    float shadow = exp(-max(sdShadow, 0.0) * 14.5) * uShadowStrength;

    float aa = max(fwidth(sd), 0.0012);
    float cardMask = 1.0 - smoothstep(-aa, aa, sd);
    float totalAlpha = max(cardMask, shadow * (1.0 - cardMask)) * uCardAlpha;
    if (totalAlpha < 0.01) discard;

    // object-cover 居中裁切（竖图微微偏上取景保留人物头部）
    vec2 photoUv = vLocalPos / uCardSize + 0.5;
    float cardAspect = uCardSize.x / max(uCardSize.y, 0.001);
    if (uPhotoAspect > cardAspect) {
      float scaleX = cardAspect / uPhotoAspect;
      photoUv.x = (photoUv.x - 0.5) * scaleX + 0.5;
    } else if (uPhotoAspect < cardAspect) {
      float scaleY = uPhotoAspect / cardAspect;
      photoUv.y = (photoUv.y - 0.5) * scaleY + 0.53;
    }
    photoUv = clamp(photoUv, 0.002, 0.998);

    vec3 col = uBaseColor;
    if (uHasAtlas > 0.5) {
      vec2 aUv = vec2(
        uAtlasUv.x + photoUv.x * uAtlasUv.z,
        uAtlasUv.y + (1.0 - photoUv.y) * uAtlasUv.w
      );
      col = texture2D(uAtlas, aUv).rgb;
    }
    if (uHasDirect > 0.5) {
      vec3 dCol = texture2D(uDirectTex, photoUv).rgb;
      col = mix(col, dCol, uHasDirect);
    }

    // 侧翼景深聚光衰减 + 1px 微光边缘切线
    col *= clamp(uBrightness, 0.35, 1.0);
    float rim = smoothstep(-0.015, -0.001, sd) * cardMask;
    col = mix(col, vec3(1.0), rim * (0.04 + 0.1 * uBrightness));

    vec3 outCol = mix(vec3(0.0), col, cardMask);
    gl_FragColor = vec4(outCol, totalAlpha);
  }
`;

const VISIBLE_RADIUS = 4;
const POOL_SLOTS = VISIBLE_RADIUS * 2 + 1;

function ThreeArcContent({
  list,
  theme,
  physicsRef,
  onCenterSnapChange,
  reducedMotion,
}: {
  list: Photo[];
  theme: ThemeMode;
  physicsRef: MutableRefObject<ReelPhysics>;
  onCenterSnapChange: (photoIndex: number) => void;
  reducedMotion: boolean;
}) {
  const { gl, scene, viewport } = useThree();
  const tier = getDeviceTier();

  const cardGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 10, 10), []);
  useEffect(() => () => cardGeometry.dispose(), [cardGeometry]);

  const dirtyRef = useRef(true);
  const bgTarget = useMemo(
    () => new THREE.Color(theme === 'dark' ? '#0a0a0b' : '#f6f5f2'),
    [theme],
  );
  const bgCurrentRef = useRef(new THREE.Color(theme === 'dark' ? '#0a0a0b' : '#f6f5f2'));

  useEffect(() => {
    scene.background = bgCurrentRef.current;
  }, [scene]);

  const atlasStreamer = useMemo(
    () =>
      new AtlasStreamer(gl, {
        loSize: tier.atlasLo,
        maxLo: tier.atlasLoBudget,
        anisotropy: Math.min(8, gl.capabilities.getMaxAnisotropy()),
        onChange: () => {
          dirtyRef.current = true;
        },
      }),
    [gl, tier],
  );

  const focusCache = useMemo(
    () =>
      new FocusTextureCache(gl, () => {
        dirtyRef.current = true;
      }),
    [gl],
  );

  useEffect(() => {
    const canvas = gl.domElement;
    const onRestored = () => {
      atlasStreamer.reset();
      focusCache.reset();
      dirtyRef.current = true;
    };
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextrestored', onRestored);
      atlasStreamer.dispose();
      focusCache.dispose();
    };
  }, [gl, atlasStreamer, focusCache]);

  const slotMaterials = useMemo(() => {
    return Array.from({ length: POOL_SLOTS }, () => {
      return new THREE.ShaderMaterial({
        vertexShader: CIRCULAR_VERTEX,
        fragmentShader: CIRCULAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uCardSize: { value: new THREE.Vector2(1.5, 1.56) },
          uPadFactor: { value: RAIL_CARD_PAD },
          uSpeed: { value: 0 },
          uAtlas: { value: null },
          uHasAtlas: { value: 0 },
          uAtlasUv: { value: new THREE.Vector4(0, 0, 1, 1) },
          uDirectTex: { value: null },
          uHasDirect: { value: 0 },
          uBaseColor: { value: new THREE.Color('#e4e4e7') },
          uPhotoAspect: { value: 1 },
          uBrightness: { value: 1 },
          uCardAlpha: { value: 1 },
          uShadowStrength: { value: 0.44 },
        },
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const m of slotMaterials) m.dispose();
    };
  }, [slotMaterials]);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const prevScrollRef = useRef(physicsRef.current.scrollPos);
  const smoothSpeedRef = useRef(0);
  const lastFocusPageKey = useRef('');
  const lastSnappedPhotoRef = useRef(-1);

  useFrame((_, delta) => {
    const phy = physicsRef.current;
    const len = list.length;
    if (len === 0) return;

    const dt = Math.min(delta, 0.05);
    bgCurrentRef.current.lerp(bgTarget, Math.min(1, dt * 10));

    if (!phy.dragging) {
      if (reducedMotion) {
        phy.scrollPos = phy.targetPos;
      } else {
        const diff = phy.targetPos - phy.scrollPos;
        if (Math.abs(diff) < 0.0005) {
          phy.scrollPos = phy.targetPos;
        } else {
          phy.scrollPos += diff * (1 - Math.exp(-13 * dt));
        }
      }
    }

    const instVel = dt > 0.001 ? (phy.scrollPos - prevScrollRef.current) / dt : 0;
    prevScrollRef.current = phy.scrollPos;
    const targetSpeed = reducedMotion ? 0 : instVel * 0.14;
    smoothSpeedRef.current += (targetSpeed - smoothSpeedRef.current) * Math.min(1, dt * 14);
    phy.velocity = smoothSpeedRef.current;

    const centerSlot = Math.max(0, Math.min(len - 1, Math.round(phy.scrollPos)));
    const centerPhoto = list[centerSlot];
    if (centerPhoto && centerPhoto.index !== lastSnappedPhotoRef.current) {
      lastSnappedPhotoRef.current = centerPhoto.index;
      onCenterSnapChange(centerPhoto.index);
    }

    const pLo = Math.max(0, centerSlot - 4);
    const pHi = Math.min(len - 1, centerSlot + 4);
    const pageLo = list[pLo]?.page ?? 0;
    const pageHi = list[pHi]?.page ?? 0;
    const cPage = centerPhoto?.page ?? 0;
    const key = `${centerSlot}-${cPage}-${pageLo}-${pageHi}`;
    if (key !== lastFocusPageKey.current) {
      lastFocusPageKey.current = key;
      const hiMin = Math.min(cPage, pageLo, pageHi);
      const hiMax = Math.max(cPage, pageLo, pageHi);
      atlasStreamer.focus(
        cPage,
        cPage,
        Math.max(0, hiMin - 1),
        Math.min(atlas.pages - 1, hiMax + 1),
        tier.atlasHi,
      );
      focusCache.requestAround(list, centerSlot);
    }
    atlasStreamer.update(performance.now());

    const { w, h } = computeArcCardSize(viewport.width, viewport.height);
    const shadowStrength = theme === 'dark' ? 0.56 : 0.34;

    for (let s = 0; s < POOL_SLOTS; s++) {
      const offset = s - VISIBLE_RADIUS;
      const itemIdx = centerSlot + offset;
      const mesh = meshRefs.current[s];
      const mat = slotMaterials[s];
      if (!mesh) continue;

      if (itemIdx < 0 || itemIdx >= len) {
        mesh.visible = false;
        continue;
      }

      const photo = list[itemIdx];
      const d = itemIdx - phy.scrollPos;
      const absD = Math.abs(d);
      if (absD > VISIBLE_RADIUS + 0.15) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;

      // Album Rail 3D 水平扇形环绕坐标模型
      const x = Math.tanh(d * 0.95) * (w * 0.35) + d * (w * 0.165);
      const y = -Math.pow(absD, 1.35) * (h * 0.052) + h * 0.05;
      const z = -absD * 0.32 - Math.pow(absD, 1.35) * 0.12;
      const rotZ = -d * 0.082;
      const rotY = Math.tanh(d * 0.9) * 0.22 + d * 0.045;
      const scale = Math.max(0.66, 1 - absD * 0.082);

      mesh.position.set(x, y, z);
      mesh.rotation.set(0, rotY, rotZ);
      mesh.scale.set(scale, scale, 1);
      mesh.renderOrder = Math.round((10 - absD) * 100);

      const brightness = Math.max(0.38, 1 - absD * 0.175);
      const cardAlpha = absD <= 3.1 ? 1 : Math.max(0, 1 - (absD - 3.1) / 0.9);

      mat.uniforms.uCardSize.value.set(w, h);
      mat.uniforms.uSpeed.value = smoothSpeedRef.current;
      mat.uniforms.uPhotoAspect.value = Math.max(0.25, photo.aspect);
      mat.uniforms.uBrightness.value = brightness;
      mat.uniforms.uCardAlpha.value = cardAlpha;
      mat.uniforms.uShadowStrength.value = shadowStrength;
      mat.uniforms.uBaseColor.value.copy(parseHexColor(photo.color));

      const aTex = atlasStreamer.hi(photo.page) ?? atlasStreamer.lo(photo.page);
      mat.uniforms.uAtlas.value = aTex;
      mat.uniforms.uHasAtlas.value = aTex ? 1 : 0;
      const [rx, ry, rw, rh] = photo.rect;
      mat.uniforms.uAtlasUv.value.set(
        rx / atlas.page,
        ry / atlas.page,
        rw / atlas.page,
        rh / atlas.page,
      );

      const directTex = absD <= 2.6 ? focusCache.getBestTexture(photo.index) : null;
      mat.uniforms.uDirectTex.value = directTex;
      mat.uniforms.uHasDirect.value = directTex ? 1 : 0;
    }

    dirtyRef.current = false;
  });

  return (
    <>
      {slotMaterials.map((mat, slotIdx) => (
        <mesh
          key={slotIdx}
          ref={(el) => {
            meshRefs.current[slotIdx] = el;
          }}
          geometry={cardGeometry}
          material={mat}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

/* CSS 3D 降级 Album Rail 扇形画廊 */
function CssArcFallback({
  list,
  physicsRef,
  onCenterSnapChange,
}: {
  list: Photo[];
  physicsRef: MutableRefObject<ReelPhysics>;
  onCenterSnapChange: (photoIndex: number) => void;
}) {
  const [renderPos, setRenderPos] = useState(physicsRef.current.scrollPos);
  const lastSnapRef = useRef(-1);

  useEffect(() => {
    let raf = 0;
    let prevTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      const phy = physicsRef.current;

      if (!phy.dragging) {
        const diff = phy.targetPos - phy.scrollPos;
        if (Math.abs(diff) < 0.001) phy.scrollPos = phy.targetPos;
        else phy.scrollPos += diff * (1 - Math.exp(-13 * dt));
      }

      const centerSlot = Math.max(0, Math.min(list.length - 1, Math.round(phy.scrollPos)));
      const p = list[centerSlot];
      if (p && p.index !== lastSnapRef.current) {
        lastSnapRef.current = p.index;
        onCenterSnapChange(p.index);
      }
      setRenderPos((old) => (Math.abs(old - phy.scrollPos) > 0.0008 ? phy.scrollPos : old));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [list, physicsRef, onCenterSnapChange]);

  const centerSlot = Math.max(0, Math.min(list.length - 1, Math.round(renderPos)));
  const start = Math.max(0, centerSlot - 3);
  const end = Math.min(list.length - 1, centerSlot + 3);
  const visibleItems = list.slice(start, end + 1);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ perspective: '1100px' }}
    >
      <div
        className="relative flex h-full w-full items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {visibleItems.map((photo, localIdx) => {
          const slot = start + localIdx;
          const d = slot - renderPos;
          const absD = Math.abs(d);
          const x = Math.tanh(d * 0.95) * 68 + d * 32;
          const y = Math.pow(absD, 1.35) * 11 - 12;
          const z = -absD * 68 - Math.pow(absD, 1.35) * 24;
          const rotZ = -d * 4.7;
          const rotY = (Math.tanh(d * 0.9) * 0.22 + d * 0.045) * (180 / Math.PI);
          const scale = Math.max(0.66, 1 - absD * 0.082);
          const brightness = Math.max(0.4, 1 - absD * 0.175);

          return (
            <div
              key={photo.id}
              className="absolute overflow-hidden rounded-xl shadow-[0_22px_52px_-14px_rgba(0,0,0,0.45)]"
              style={{
                width: 'min(48vw, 290px)',
                aspectRatio: '1 / 1.05',
                backgroundColor: photo.color,
                transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
                filter: `brightness(${brightness.toFixed(2)})`,
                zIndex: 30 - Math.round(absD * 5),
              }}
            >
              <img
                src={absD <= 1.2 ? photo.full : photo.thumb}
                alt=""
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover object-top"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 底部 Album Rail 刻度拨盘 + 播放控制条（< | | | | | (▶) | | | | | >，无任何照片文字） */
const SCRUB_TICKS_PER_SIDE = 7;

function AlbumRailScrubber({
  list,
  activeSlot,
  autoplay,
  physicsRef,
  onStep,
  onToggleAutoplay,
  onScrubDelta,
}: {
  list: Photo[];
  activeSlot: number;
  autoplay: boolean;
  physicsRef: MutableRefObject<ReelPhysics>;
  onStep: (delta: number) => void;
  onToggleAutoplay: () => void;
  onScrubDelta: (targetSlot: number, snap: boolean) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [tickPhase, setTickPhase] = useState(0);
  const scrubRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startScroll: 0,
    moved: false,
  });
  const count = list.length;

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const sync = () => {
      const pos = physicsRef.current.scrollPos;
      if (Math.abs(pos - last) > 0.008) {
        last = pos;
        setTickPhase(pos);
      }
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, [physicsRef]);

  if (count <= 1) return null;

  const progressRatio = activeSlot / Math.max(1, count - 1);

  const onRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    const s = scrubRef.current;
    s.active = true;
    s.pointerId = e.pointerId;
    s.startX = e.clientX;
    s.startScroll = physicsRef.current.scrollPos;
    s.moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onRailPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = scrubRef.current;
    if (!s.active || s.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) > 4) s.moved = true;
    const width = Math.max(140, railRef.current?.clientWidth ?? 220);
    const spanSlots = Math.max(8, Math.min(count - 1, Math.round(count * 0.25)));
    const nextSlot = s.startScroll + (dx / width) * spanSlots;
    onScrubDelta(nextSlot, false);
  };

  const onRailPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = scrubRef.current;
    if (!s.active || s.pointerId !== e.pointerId) return;
    e.stopPropagation();
    s.active = false;
    if (!s.moved && railRef.current) {
      const rect = railRef.current.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / Math.max(1, rect.width);
      onStep(rel < 0.5 ? -1 : 1);
      return;
    }
    const width = Math.max(140, railRef.current?.clientWidth ?? 220);
    const spanSlots = Math.max(8, Math.min(count - 1, Math.round(count * 0.25)));
    const nextSlot = s.startScroll + ((e.clientX - s.startX) / width) * spanSlots;
    onScrubDelta(nextSlot, true);
  };

  const renderTicks = (side: 'left' | 'right') =>
    Array.from({ length: SCRUB_TICKS_PER_SIDE }).map((_, idx) => {
      const globalIdx = side === 'left' ? idx : SCRUB_TICKS_PER_SIDE + idx;
      const totalTicks = SCRUB_TICKS_PER_SIDE * 2 - 1;
      const tickNorm = globalIdx / Math.max(1, totalTicks);
      const isLit = Math.abs(tickNorm - progressRatio) < 0.11;
      const ripple = Math.sin(tickPhase * 1.4 - globalIdx * 0.75);
      const heightPx = isLit ? 12 : Math.round(7 + (ripple * 0.5 + 0.5) * 2.5);

      return (
        <span
          key={`${side}-${idx}`}
          className="block w-[1.5px] rounded-full transition-[height,opacity] duration-150"
          style={{
            height: `${heightPx}px`,
            backgroundColor: isLit ? 'var(--ink)' : 'var(--ink-soft)',
            opacity: isLit ? 0.92 : 0.34,
          }}
        />
      );
    });

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[78px] z-20 flex justify-center px-4 sm:bottom-[92px]">
      <div
        ref={railRef}
        className="pointer-events-auto flex items-center gap-2 rounded-full px-2 py-1 select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={onRailPointerDown}
        onPointerMove={onRailPointerMove}
        onPointerUp={onRailPointerUp}
        onPointerCancel={onRailPointerUp}
      >
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label="上一张照片"
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] active:scale-90"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 sm:gap-2.5" aria-hidden="true">
          {renderTicks('left')}
        </div>

        <button
          type="button"
          onClick={onToggleAutoplay}
          aria-label={autoplay ? '暂停自动轮播' : '开启自动轮播'}
          aria-pressed={autoplay}
          className="mx-1 grid h-8 w-8 place-items-center rounded-full border shadow-sm transition-transform active:scale-90"
          style={{
            backgroundColor: autoplay ? 'var(--ink)' : 'var(--dock-bg)',
            borderColor: 'var(--border)',
            color: autoplay ? 'var(--bg)' : 'var(--ink)',
          }}
        >
          {autoplay ? (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Play className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        <div className="flex items-center gap-2 sm:gap-2.5" aria-hidden="true">
          {renderTicks('right')}
        </div>

        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label="下一张照片"
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] active:scale-90"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function CircularArcGallery({ list, activeSlot }: { list: Photo[]; activeSlot: number }) {
  const theme = useAlbumStore((s) => s.theme);
  const autoplay = useAlbumStore((s) => s.autoplay);
  const { setActivePhotoIndex, toggleAutoplay, stopAutoplay, openLightbox } =
    useAlbumStore.getState();

  const listIndices = useMemo(() => list.map((p) => p.index), [list]);

  const physicsRef = useRef<ReelPhysics>({
    scrollPos: activeSlot,
    targetPos: activeSlot,
    dragging: false,
    velocity: 0,
    count: list.length,
    moved: false,
  });

  useEffect(() => {
    const phy = physicsRef.current;
    const lenChanged = phy.count !== list.length;
    phy.count = list.length;
    if (lenChanged) {
      phy.scrollPos = activeSlot;
      phy.targetPos = activeSlot;
    } else if (!phy.dragging && Math.round(phy.targetPos) !== activeSlot) {
      phy.targetPos = activeSlot;
    }
  }, [activeSlot, list.length]);

  const [webglOk, setWebglOk] = useState<boolean>(() => isWebGLSupported());
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleCenterSnapChange = useCallback(
    (photoIndex: number) => {
      setActivePhotoIndex(photoIndex);
    },
    [setActivePhotoIndex],
  );

  useEffect(() => {
    if (!autoplay || list.length <= 1) return;
    const timer = window.setInterval(() => {
      const phy = physicsRef.current;
      if (phy.dragging) return;
      const next = Math.round(phy.targetPos) + 1;
      phy.targetPos = next >= list.length ? 0 : next;
    }, 3200);
    return () => window.clearInterval(timer);
  }, [autoplay, list.length]);

  const touchRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    lastX: 0,
    lastT: 0,
    vx: 0,
    startScroll: 0,
    containerW: 390,
  });
  const stageRef = useRef<HTMLDivElement>(null);

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopAutoplay();
    const phy = physicsRef.current;
    const t = touchRef.current;
    t.active = true;
    t.pointerId = e.pointerId;
    t.startX = e.clientX;
    t.lastX = e.clientX;
    t.lastT = e.timeStamp;
    t.vx = 0;
    t.startScroll = phy.scrollPos;
    t.containerW = Math.max(280, stageRef.current?.clientWidth ?? 390);
    phy.dragging = true;
    phy.moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (!t.active || t.pointerId !== e.pointerId) return;
    const dx = e.clientX - t.startX;
    if (Math.abs(dx) > 7) physicsRef.current.moved = true;

    const dt = e.timeStamp - t.lastT;
    if (dt > 0) {
      t.vx = t.vx * 0.45 + ((e.clientX - t.lastX) / dt) * 0.55;
      t.lastX = e.clientX;
      t.lastT = e.timeStamp;
    }

    const sensitivity = 1 / Math.max(118, t.containerW * 0.28);
    const maxPos = Math.max(0, list.length - 1);
    const nextPos = Math.max(-0.35, Math.min(maxPos + 0.35, t.startScroll - dx * sensitivity));
    physicsRef.current.scrollPos = nextPos;
    physicsRef.current.targetPos = nextPos;
  };

  const onStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (!t.active || t.pointerId !== e.pointerId) return;
    t.active = false;
    const phy = physicsRef.current;
    phy.dragging = false;

    const maxPos = Math.max(0, list.length - 1);
    if (!phy.moved) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect && list[activeSlot]) {
        const relX = (e.clientX - (rect.left + rect.width * 0.5)) / Math.max(1, rect.width * 0.5);
        if (relX < -0.3) phy.targetPos = Math.max(0, activeSlot - 1);
        else if (relX > 0.3) phy.targetPos = Math.min(maxPos, activeSlot + 1);
        else {
          unlockBgmNow();
          openLightbox(list[activeSlot].index, listIndices, false);
        }
      }
      return;
    }

    const recent = e.timeStamp - t.lastT < 85 ? t.vx : 0;
    const dxTotal = e.clientX - t.startX;
    let projected = phy.scrollPos - recent * 3.4;
    if (Math.abs(dxTotal) > 32 && Math.round(projected) === Math.round(t.startScroll)) {
      projected = Math.round(t.startScroll) + (dxTotal < 0 ? 1 : -1);
    }
    phy.targetPos = Math.max(0, Math.min(maxPos, Math.round(projected)));
  };

  const wheelAccRef = useRef(0);
  const wheelLockRef = useRef(0);
  const onStageWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    stopAutoplay();
    const now = performance.now();
    if (now < wheelLockRef.current) return;
    const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAccRef.current += delta;
    if (Math.abs(wheelAccRef.current) > 32) {
      const step = wheelAccRef.current > 0 ? 1 : -1;
      const maxPos = Math.max(0, list.length - 1);
      physicsRef.current.targetPos = Math.max(
        0,
        Math.min(maxPos, Math.round(physicsRef.current.targetPos) + step),
      );
      wheelAccRef.current = 0;
      wheelLockRef.current = now + 90;
    }
  };

  const handleStep = useCallback(
    (delta: number) => {
      stopAutoplay();
      const maxPos = Math.max(0, list.length - 1);
      const next = Math.max(0, Math.min(maxPos, Math.round(physicsRef.current.targetPos) + delta));
      physicsRef.current.dragging = false;
      physicsRef.current.targetPos = next;
    },
    [list.length, stopAutoplay],
  );

  const handleDialScrub = useCallback(
    (slotFloat: number, snap: boolean) => {
      stopAutoplay();
      const maxPos = Math.max(0, list.length - 1);
      const clamped = Math.max(0, Math.min(maxPos, snap ? Math.round(slotFloat) : slotFloat));
      physicsRef.current.dragging = !snap;
      physicsRef.current.scrollPos = clamped;
      physicsRef.current.targetPos = clamped;
      const targetPhoto = list[Math.round(clamped)];
      if (targetPhoto) setActivePhotoIndex(targetPhoto.index);
    },
    [list, setActivePhotoIndex, stopAutoplay],
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={stageRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
        onWheel={onStageWheel}
      >
        {webglOk ? (
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, 0, 5.2], fov: 36, near: 0.1, far: 40 }}
            gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (ev) => {
                ev.preventDefault();
                setWebglOk(false);
              });
            }}
          >
            <ThreeArcContent
              list={list}
              theme={theme}
              physicsRef={physicsRef}
              onCenterSnapChange={handleCenterSnapChange}
              reducedMotion={prefersReducedMotion}
            />
          </Canvas>
        ) : (
          <CssArcFallback
            list={list}
            physicsRef={physicsRef}
            onCenterSnapChange={handleCenterSnapChange}
          />
        )}
      </div>

      <AlbumRailScrubber
        list={list}
        activeSlot={activeSlot}
        autoplay={autoplay}
        physicsRef={physicsRef}
        onStep={handleStep}
        onToggleAutoplay={toggleAutoplay}
        onScrubDelta={handleDialScrub}
      />
    </div>
  );
}

/* ============================================================
   模式二：纯图原比例瀑布流（无任何文字与横幅）
   ============================================================ */
function SwissMasonryGrid({ list }: { list: Photo[] }) {
  const lastViewedIndex = useAlbumStore((s) => s.lastViewedIndex);
  const { openLightbox } = useAlbumStore.getState();

  const containerRef = useRef<HTMLDivElement>(null);
  const [colCount, setColCount] = useState(2);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setColCount(w >= 960 ? 4 : w >= 640 ? 3 : 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const listIndices = useMemo(() => list.map((p) => p.index), [list]);

  const columns = useMemo(() => {
    const cols: Photo[][] = Array.from({ length: colCount }, () => []);
    const heights = new Array(colCount).fill(0);
    for (const p of list) {
      let minIdx = 0;
      for (let c = 1; c < colCount; c++) {
        if (heights[c] < heights[minIdx]) minIdx = c;
      }
      cols[minIdx].push(p);
      heights[minIdx] += 1 / Math.max(0.3, p.aspect);
    }
    return cols;
  }, [list, colCount]);

  return (
    <div className="h-full w-full overflow-y-auto overscroll-y-contain px-safe">
      <div
        ref={containerRef}
        className="mx-auto max-w-6xl px-2.5 pb-24 pt-16 sm:px-6 sm:pt-20"
      >
        <div
          className="grid gap-2 sm:gap-3"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-2 sm:gap-3">
              {col.map((photo) => {
                const isLastViewed = photo.index === lastViewedIndex;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => {
                      unlockBgmNow();
                      openLightbox(photo.index, listIndices, false);
                    }}
                    aria-label={`查看第 ${photo.index + 1} 张照片`}
                    className="overflow-hidden rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      borderColor: isLastViewed ? 'var(--ink)' : 'var(--border)',
                      backgroundColor: photo.color,
                    }}
                  >
                    <div
                      className="relative w-full overflow-hidden"
                      style={{
                        aspectRatio: `${photo.w} / ${photo.h}`,
                        backgroundColor: photo.color,
                      }}
                    >
                      <img
                        src={photo.thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onLoad={(e) => {
                          e.currentTarget.dataset.loaded = '';
                        }}
                        className="fade-img h-full w-full object-cover"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   主出口组件：PhotoGallery
   ============================================================ */
export function PhotoGallery() {
  const viewMode = useAlbumStore((s) => s.viewMode);
  const filter = useAlbumStore((s) => s.filter);
  const activePhotoIndex = useAlbumStore((s) => s.activePhotoIndex);

  const currentList = useMemo(() => getFilteredPhotos(filter), [filter]);
  const activeSlot = useMemo(() => {
    const idx = currentList.findIndex((p) => p.index === activePhotoIndex);
    return idx >= 0 ? idx : 0;
  }, [currentList, activePhotoIndex]);

  if (photos.length === 0 || currentList.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--ink-soft)]">
        <ImageOff className="h-8 w-8 opacity-60" aria-hidden="true" />
        <p className="text-[14px]">当前分类下暂无照片</p>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return <SwissMasonryGrid list={currentList} />;
  }

  return <CircularArcGallery list={currentList} activeSlot={activeSlot} />;
}
