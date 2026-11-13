/**
 * 幸福回忆录核心画廊视图（Designeer 瑞士网格 × React Bits 3D 组件体系）
 * ------------------------------------------------------------
 * 在手机单手操作下提供三种高度顺滑、零 AI 模板感的看图模式（通过底部 Dock 秒切）：
 *   1. arc（3D 环幕，复刻 react-bits/CircularGallery）：
 *      - 纯无框圆角 WebGL 平面 + 速度驱动流体波浪形变（Velocity Wave + Bend Shader）；
 *      - 静止时照片 100% 端正无畸变，手指滑动瞬间呈现柔和胶片弧度与深度层次；
 *      - 真实均值色 + AtlasStreamer 图集 + 焦点原片 Texture LRU + WebGL 异常降级 CSS 3D；
 *   2. stack（3D 叠片，复刻 react-bits/Stack）：
 *      - 实体相纸 3D 层叠手势切牌，支持任意方向拖曳、甩牌飞出与后牌跟进缩放；
 *   3. grid（瑞士瀑布流，复刻 designeer.xyz 裸露网格 × react-bits/Masonry）：
 *      - 手机端双列原比例瀑布流 + 1px 结构网格线 + 四角十字准星档案头卡，零裁切。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, ImageOff, MapPin, ZoomIn } from 'lucide-react';
import { atlas, chapters, photos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore, type ThemeMode } from '../../store/useAlbumStore';
import { AtlasStreamer } from '../../three/atlas';
import type { Photo } from '../../types';
import { formatFrameNo, getFilteredPhotos } from './albumHelpers';

/* ============================================================
   公共工具：WebGL 检测、配色解析、贴图 LRU 缓存
   ============================================================ */
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

function computeArcCardSize(aspect: number, vpWidth: number, vpHeight: number) {
  const maxW = vpWidth * 0.78;
  const maxH = vpHeight * 0.56;
  let w = maxW;
  let h = w / Math.max(0.25, aspect);
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w: Math.max(0.55, w), h: Math.max(0.55, h) };
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
   模式一：CircularGallery WebGL Shader（无框圆角 + 速度流体波浪）
   ============================================================ */
const CIRCULAR_VERTEX = /* glsl */ `
  precision highp float;
  uniform float uBend;
  uniform float uSpeed;
  uniform vec2 uCardSize;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.x *= uCardSize.x;
    pos.y *= uCardSize.y;

    // 复刻 react-bits/CircularGallery：滑动速度驱动丝绸波浪与纵深弯曲
    float normY = position.y;
    float wave = sin(uv.x * 3.1415926) * clamp(uSpeed, -1.6, 1.6) * 0.14;
    pos.z += wave - (normY * normY) * uBend;

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
  uniform vec3 uBgColor;
  uniform vec2 uCardSize;
  uniform float uFocus;
  uniform float uFade;

  varying vec2 vUv;

  void main() {
    // 纯净无外框：SDF 平滑裁切圆角（borderRadius = 0.042）
    vec2 size = uCardSize;
    vec2 p = (vUv - 0.5) * size;
    float radius = min(size.x, size.y) * 0.042;
    vec2 q = abs(p) - size * 0.5 + radius;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float aa = max(fwidth(sd), 0.0006);
    float alpha = 1.0 - smoothstep(-aa, aa, sd);
    if (alpha < 0.02) discard;

    vec2 photoUv = clamp(vUv, 0.0, 1.0);
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

    // 远端卡片平滑淡入画布背景色（日间融合为柔白，暗房融合为碳黑）
    col = mix(uBgColor, col, clamp(uFade, 0.12, 1.0));
    gl_FragColor = vec4(col, alpha * clamp(0.45 + 0.55 * uFocus, 0.45, 1.0));
  }
`;

const VISIBLE_RADIUS = 4;
const POOL_SLOTS = VISIBLE_RADIUS * 2 + 1;

interface ThreeArcContentProps {
  list: Photo[];
  theme: ThemeMode;
  physicsRef: MutableRefObject<ReelPhysics>;
  onCenterSnapChange: (photoIndex: number) => void;
  reducedMotion: boolean;
}

function ThreeArcContent({
  list,
  theme,
  physicsRef,
  onCenterSnapChange,
  reducedMotion,
}: ThreeArcContentProps) {
  const { gl, scene, viewport } = useThree();
  const tier = getDeviceTier();

  const cardGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 18, 22), []);
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
        depthWrite: true,
        uniforms: {
          uBend: { value: 0.04 },
          uSpeed: { value: 0 },
          uCardSize: { value: new THREE.Vector2(1.6, 1.2) },
          uAtlas: { value: null },
          uHasAtlas: { value: 0 },
          uAtlasUv: { value: new THREE.Vector4(0, 0, 1, 1) },
          uDirectTex: { value: null },
          uHasDirect: { value: 0 },
          uBaseColor: { value: new THREE.Color('#e4e4e7') },
          uBgColor: { value: new THREE.Color('#f6f5f2') },
          uFocus: { value: 1 },
          uFade: { value: 1 },
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

    // 同步画布背景色（丝滑过渡日间柔白 ↔ 暗房碳黑）
    bgCurrentRef.current.lerp(bgTarget, Math.min(1, dt * 10));

    // 平滑物理阻尼滚动
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

    // 计算实时滑动速度驱动流体弯曲
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

    const radiusY = viewport.height * 0.56;
    const radiusZ = 1.9;
    const angleStep = 0.45;
    const speedBendBoost = Math.min(0.14, Math.abs(smoothSpeedRef.current) * 0.09);

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
      if (Math.abs(d) > VISIBLE_RADIUS + 0.6) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      const theta = d * angleStep;

      // 垂直 3D 圆柱弧面排布：0° 水平中心、无左右甩动、无侧倾
      const y = -Math.sin(theta) * radiusY - d * 0.14 + 0.08;
      const z = -(1 - Math.cos(theta)) * radiusZ - Math.abs(d) * 0.36;
      const rotX = -theta * 0.72;

      mesh.position.set(0, y, z);
      mesh.rotation.set(rotX, 0, 0);

      const focusFactor = Math.max(0, 1 - Math.abs(d) * 1.15);
      const scale = 0.88 + 0.12 * focusFactor;
      mesh.scale.set(scale, scale, 1);

      const { w, h } = computeArcCardSize(photo.aspect, viewport.width, viewport.height);
      mat.uniforms.uCardSize.value.set(w, h);
      mat.uniforms.uBend.value = 0.045 * (1 - 0.65 * focusFactor) + speedBendBoost;
      mat.uniforms.uSpeed.value = smoothSpeedRef.current;
      mat.uniforms.uFocus.value = focusFactor;
      mat.uniforms.uFade.value = Math.exp(-d * d * 0.28);
      mat.uniforms.uBgColor.value.copy(bgCurrentRef.current);
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

      const directTex = Math.abs(d) <= 2.6 ? focusCache.getBestTexture(photo.index) : null;
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

/* CSS 3D 降级环幕（WebGL 不可用时保证 100% 正常看图） */
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
      style={{ perspective: '1050px' }}
    >
      <div
        className="relative flex h-full w-full items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {visibleItems.map((photo, localIdx) => {
          const slot = start + localIdx;
          const d = slot - renderPos;
          const absD = Math.abs(d);
          const theta = d * 22;
          const translateY = d * 200;
          const translateZ = -Math.pow(absD, 1.35) * 130;
          const fade = Math.max(0.28, Math.exp(-d * d * 0.34));

          return (
            <div
              key={photo.id}
              className="absolute overflow-hidden rounded-xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.28)]"
              style={{
                width: `min(74vw, ${Math.round(Math.min(440, 310 * photo.aspect))}px)`,
                aspectRatio: `${photo.w} / ${photo.h}`,
                maxHeight: '50vh',
                backgroundColor: photo.color,
                transform: `translate3d(0px, ${translateY.toFixed(1)}px, ${translateZ.toFixed(1)}px) rotateX(${(-theta).toFixed(2)}deg)`,
                opacity: fade,
                zIndex: 20 - Math.round(absD * 4),
              }}
            >
              <img
                src={absD <= 1.2 ? photo.full : photo.thumb}
                alt={photo.title ?? ''}
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 右侧瑞士极简进度拨盘（单手大拇指快拖定位） */
function SwissEdgeScrubber({
  list,
  activeSlot,
  onScrubTo,
}: {
  list: Photo[];
  activeSlot: number;
  onScrubTo: (slotFloat: number, snap: boolean) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const count = list.length;
  const activePhoto = list[activeSlot] ?? list[0];
  const activeChapter = activePhoto ? chapters[activePhoto.chapter] : undefined;

  const updateFromClientY = useCallback(
    (clientY: number, snap: boolean) => {
      const el = railRef.current;
      if (!el || count <= 1) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
      onScrubTo(ratio * (count - 1), snap);
    },
    [count, onScrubTo],
  );

  if (count <= 1) return null;
  const progress = (activeSlot / Math.max(1, count - 1)) * 100;

  return (
    <div className="pointer-events-none fixed bottom-44 right-2 top-28 z-20 flex items-center px-safe sm:right-4">
      <div
        ref={railRef}
        role="slider"
        aria-label="照片快速滚动滑轨"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={activeSlot + 1}
        tabIndex={0}
        className="pointer-events-auto relative flex h-full w-9 flex-col items-end justify-between py-2 pr-1.5"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setScrubbing(true);
          updateFromClientY(e.clientY, false);
        }}
        onPointerMove={(e) => {
          if (!scrubbing) return;
          e.stopPropagation();
          updateFromClientY(e.clientY, false);
        }}
        onPointerUp={(e) => {
          if (!scrubbing) return;
          e.stopPropagation();
          setScrubbing(false);
          updateFromClientY(e.clientY, true);
        }}
        onPointerCancel={() => setScrubbing(false)}
      >
        {Array.from({ length: 18 }).map((_, idx) => (
          <span
            key={idx}
            className="block h-[1px]"
            style={{
              width: idx % 3 === 0 ? '10px' : '5px',
              backgroundColor: 'var(--ink-soft)',
              opacity: idx % 3 === 0 ? 0.55 : 0.25,
            }}
          />
        ))}

        <div
          className="pointer-events-none absolute right-0.5 flex items-center transition-[top] duration-75"
          style={{ top: `calc(${progress}% - 7px)` }}
        >
          {scrubbing && activePhoto && (
            <div
              className="mr-3 whitespace-nowrap rounded-lg border px-2.5 py-1 shadow-md backdrop-blur-md"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--ink)',
              }}
            >
              <div className="text-[11.5px] font-medium">
                {activeChapter?.title ?? '照片档案'}
              </div>
              <div className="font-display text-[10.5px] text-[var(--ink-soft)] tabular-nums">
                {formatFrameNo(activeSlot + 1)} / {formatFrameNo(count)}
              </div>
            </div>
          )}
          <span
            className="h-3.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--ink)' }}
          />
        </div>
      </div>
    </div>
  );
}

function CircularArcGallery({ list, activeSlot }: { list: Photo[]; activeSlot: number }) {
  const theme = useAlbumStore((s) => s.theme);
  const autoplay = useAlbumStore((s) => s.autoplay);
  const { setActivePhotoIndex, stopAutoplay, openLightbox } = useAlbumStore.getState();

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
    }, 3600);
    return () => window.clearInterval(timer);
  }, [autoplay, list.length]);

  const touchRef = useRef({
    active: false,
    pointerId: -1,
    startY: 0,
    lastY: 0,
    lastT: 0,
    vy: 0,
    startScroll: 0,
    containerH: 600,
  });
  const stageRef = useRef<HTMLDivElement>(null);

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopAutoplay();
    const phy = physicsRef.current;
    const t = touchRef.current;
    t.active = true;
    t.pointerId = e.pointerId;
    t.startY = e.clientY;
    t.lastY = e.clientY;
    t.lastT = e.timeStamp;
    t.vy = 0;
    t.startScroll = phy.scrollPos;
    t.containerH = Math.max(320, stageRef.current?.clientHeight ?? 600);
    phy.dragging = true;
    phy.moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (!t.active || t.pointerId !== e.pointerId) return;
    const dy = e.clientY - t.startY;
    if (Math.abs(dy) > 7) physicsRef.current.moved = true;

    const dt = e.timeStamp - t.lastT;
    if (dt > 0) {
      t.vy = t.vy * 0.45 + ((e.clientY - t.lastY) / dt) * 0.55;
      t.lastY = e.clientY;
      t.lastT = e.timeStamp;
    }

    const sensitivity = 1 / Math.max(165, t.containerH * 0.34);
    const maxPos = Math.max(0, list.length - 1);
    const nextPos = Math.max(-0.32, Math.min(maxPos + 0.32, t.startScroll - dy * sensitivity));
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
        const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
        if (relY < 0.28) phy.targetPos = Math.max(0, activeSlot - 1);
        else if (relY > 0.72) phy.targetPos = Math.min(maxPos, activeSlot + 1);
        else {
          unlockBgmNow();
          openLightbox(list[activeSlot].index, listIndices, false);
        }
      }
      return;
    }

    const recent = e.timeStamp - t.lastT < 85 ? t.vy : 0;
    const dyTotal = e.clientY - t.startY;
    let projected = phy.scrollPos - recent * 3.4;
    if (Math.abs(dyTotal) > 36 && Math.round(projected) === Math.round(t.startScroll)) {
      projected = Math.round(t.startScroll) + (dyTotal < 0 ? 1 : -1);
    }
    phy.targetPos = Math.max(0, Math.min(maxPos, Math.round(projected)));
  };

  const wheelAccRef = useRef(0);
  const wheelLockRef = useRef(0);
  const onStageWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    stopAutoplay();
    const now = performance.now();
    if (now < wheelLockRef.current) return;
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    wheelAccRef.current += delta;
    if (Math.abs(wheelAccRef.current) > 34) {
      const step = wheelAccRef.current > 0 ? 1 : -1;
      const maxPos = Math.max(0, list.length - 1);
      physicsRef.current.targetPos = Math.max(
        0,
        Math.min(maxPos, Math.round(physicsRef.current.targetPos) + step),
      );
      wheelAccRef.current = 0;
      wheelLockRef.current = now + 95;
    }
  };

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

  const activePhoto = list[activeSlot] ?? list[0];
  const activeChapter = activePhoto ? chapters[activePhoto.chapter] : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={stageRef}
        className="absolute inset-0"
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

        {/* 上下自然羽化渐变，融入极简背景 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28"
          style={{
            background: 'linear-gradient(to bottom, var(--bg) 25%, transparent)',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-52"
          style={{
            background: 'linear-gradient(to top, var(--bg) 38%, transparent)',
          }}
          aria-hidden="true"
        />
      </div>

      <SwissEdgeScrubber list={list} activeSlot={activeSlot} onScrubTo={handleDialScrub} />

      {/* 底部极简瑞士展签（留出底部 Dock 高度） */}
      {activePhoto && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 px-safe pb-safe">
          <div className="pointer-events-auto mx-auto flex max-w-xl items-end justify-between gap-3 px-4 pr-10 sm:px-6 sm:pr-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] text-[var(--ink-soft)]">
                <span className="font-display tabular-nums">
                  {formatFrameNo(activeSlot + 1)} / {formatFrameNo(list.length)}
                </span>
                {activeChapter && <span>· {activeChapter.title}</span>}
              </div>
              {activePhoto.title && (
                <h2 className="mt-0.5 truncate text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink)] sm:text-[18px]">
                  {activePhoto.title}
                </h2>
              )}
              {activePhoto.story && (
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--ink-soft)]">
                  {activePhoto.story}
                </p>
              )}
              {(activePhoto.place || activePhoto.date) && (
                <div className="mt-1 flex items-center gap-2.5 text-[11px] text-[var(--ink-soft)]">
                  {activePhoto.place && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      <span>{activePhoto.place}</span>
                    </span>
                  )}
                  {activePhoto.date && (
                    <span className="font-display tabular-nums">{activePhoto.date}</span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                unlockBgmNow();
                openLightbox(activePhoto.index, listIndices, false);
              }}
              aria-label="全屏查看原片"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors active:scale-95"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
              }}
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>原片</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   模式二：3D 叠片（复刻 react-bits/Stack 物理层叠相纸手势甩牌）
   ============================================================ */
function InteractiveStackGallery({ list, activeSlot }: { list: Photo[]; activeSlot: number }) {
  const autoplay = useAlbumStore((s) => s.autoplay);
  const { setActivePhotoIndex, stopAutoplay, openLightbox } = useAlbumStore.getState();
  const listIndices = useMemo(() => list.map((p) => p.index), [list]);

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0, dragging: false });
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    moved: false,
  });

  const stepBy = useCallback(
    (delta: number) => {
      if (list.length <= 1) return;
      const nextSlot = (activeSlot + delta + list.length) % list.length;
      const nextPhoto = list[nextSlot];
      if (nextPhoto) setActivePhotoIndex(nextPhoto.index);
    },
    [activeSlot, list, setActivePhotoIndex],
  );

  // 自动放映支持
  useEffect(() => {
    if (!autoplay || list.length <= 1) return;
    const timer = window.setInterval(() => stepBy(1), 3600);
    return () => window.clearInterval(timer);
  }, [autoplay, list.length, stepBy]);

  // 后台预加载随后 3 张相纸原图
  useEffect(() => {
    const imgs: HTMLImageElement[] = [];
    for (let i = 1; i <= 3; i++) {
      const p = list[(activeSlot + i) % list.length];
      if (!p) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = i === 1 ? p.full : p.thumb;
      imgs.push(img);
    }
    return () => {
      for (const img of imgs) img.src = '';
    };
  }, [activeSlot, list]);

  const visibleCount = Math.min(4, list.length);
  const stackCards = useMemo(() => {
    const cards: { photo: Photo; depth: number }[] = [];
    for (let depth = visibleCount - 1; depth >= 0; depth--) {
      const slot = (activeSlot + depth) % list.length;
      cards.push({ photo: list[slot], depth });
    }
    return cards;
  }, [activeSlot, list, visibleCount]);

  const currentPhoto = list[activeSlot] ?? list[0];
  const currentChapter = currentPhoto ? chapters[currentPhoto.chapter] : undefined;

  const dragDist = Math.hypot(dragOffset.x, dragOffset.y);
  const progress = Math.min(1, dragDist / 120);

  const onTopPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopAutoplay();
    const d = dragRef.current;
    d.active = true;
    d.pointerId = e.pointerId;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragOffset({ x: 0, y: 0, dragging: true });
  };

  const onTopPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.hypot(dx, dy) > 8) d.moved = true;
    setDragOffset({ x: dx, y: dy, dragging: true });
  };

  const onTopPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active = false;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (!d.moved && currentPhoto) {
      setDragOffset({ x: 0, y: 0, dragging: false });
      unlockBgmNow();
      openLightbox(currentPhoto.index, listIndices, false);
      return;
    }

    if (Math.abs(dx) > 54 || Math.abs(dy) > 54) {
      // 左划 / 上划看下一张，右划 / 下划看上一张
      const dir = dx < -36 || dy < -36 ? 1 : -1;
      stepBy(dir);
    }
    setDragOffset({ x: 0, y: 0, dragging: false });
  };

  return (
    <div className="flex h-full w-full flex-col justify-between px-safe pb-24 pt-28 sm:pt-32">
      {/* 3D 叠牌主舞台 */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-6"
        style={{ perspective: '1200px' }}
      >
        {stackCards.map(({ photo, depth }) => {
          const isTop = depth === 0;
          // 后排卡片随拖拽进度向前轻微顶进，复刻 react-bits/Stack 物理联动
          const effectiveDepth = Math.max(0, depth - progress * 0.85);
          const rotateZ = isTop
            ? dragOffset.x * 0.04
            : (depth % 2 === 0 ? -1 : 1) * (effectiveDepth * 2.2);
          const translateY = isTop ? dragOffset.y : effectiveDepth * 14;
          const translateX = isTop ? dragOffset.x : (depth % 2 === 0 ? -1 : 1) * effectiveDepth * 8;
          const translateZ = -effectiveDepth * 42;
          const scale = 1 - effectiveDepth * 0.055;
          const opacity = Math.max(0.45, 1 - effectiveDepth * 0.18);

          return (
            <div
              key={`${photo.id}-${depth}`}
              onPointerDown={isTop ? onTopPointerDown : undefined}
              onPointerMove={isTop ? onTopPointerMove : undefined}
              onPointerUp={isTop ? onTopPointerUp : undefined}
              onPointerCancel={isTop ? onTopPointerUp : undefined}
              className="absolute overflow-hidden rounded-2xl border p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.3)]"
              style={{
                width: `min(82vw, ${Math.round(Math.min(460, 340 * photo.aspect))}px)`,
                aspectRatio: `${photo.w} / ${photo.h}`,
                maxHeight: '50vh',
                touchAction: isTop ? 'none' : 'auto',
                cursor: isTop ? 'grab' : 'default',
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface)',
                zIndex: 30 - depth,
                opacity,
                transform: `translate3d(${translateX.toFixed(1)}px, ${translateY.toFixed(1)}px, ${translateZ.toFixed(1)}px) rotateZ(${rotateZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
                transition:
                  isTop && dragOffset.dragging
                    ? 'none'
                    : 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.34s ease',
              }}
            >
              <div
                className="h-full w-full overflow-hidden rounded-xl"
                style={{ backgroundColor: photo.color }}
              >
                <img
                  src={depth <= 1 ? photo.full : photo.thumb}
                  alt={photo.title ?? ''}
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部翻牌控制器与展签 */}
      {currentPhoto && (
        <div className="mx-auto w-full max-w-xl px-4 pb-2 sm:px-6">
          <div
            className="flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--surface)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                stopAutoplay();
                stepBy(-1);
              }}
              aria-label="上一张照片"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors active:scale-95"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--ink-soft)]">
                <span className="font-display tabular-nums">
                  {formatFrameNo(activeSlot + 1)} / {formatFrameNo(list.length)}
                </span>
                {currentChapter && <span>· {currentChapter.title}</span>}
              </div>
              {currentPhoto.title ? (
                <div className="truncate text-[14.5px] font-semibold text-[var(--ink)]">
                  {currentPhoto.title}
                </div>
              ) : (
                <div className="text-[12.5px] text-[var(--ink-soft)]">左右划切牌 · 轻点看大图</div>
              )}
              {currentPhoto.story && (
                <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--ink-soft)]">
                  {currentPhoto.story}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                stopAutoplay();
                stepBy(1);
              }}
              aria-label="下一张照片"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors active:scale-95"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   模式三：瑞士瀑布流（Designeer 1px 网格 + React Bits Masonry）
   ============================================================ */
function SwissMasonryGrid({ list }: { list: Photo[] }) {
  const filter = useAlbumStore((s) => s.filter);
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

  // 最短列优先分配，确保双列/多列瀑布流视觉平衡且保持每张图原比例零裁切
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
        className="mx-auto max-w-6xl px-3 pb-28 pt-26 sm:px-6 sm:pt-30"
        style={{ paddingTop: '6.5rem' }}
      >
        {/* 全部视图顶部：designeer.xyz 建筑感十字准星档案头卡 */}
        {filter === 'all' && (
          <div
            className="relative mb-5 border p-4 sm:mb-7 sm:p-6"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--surface)',
            }}
          >
            <span className="swiss-cross absolute -left-[1px] -top-[1px]" aria-hidden="true" />
            <span className="swiss-cross absolute -right-[1px] -top-[1px]" aria-hidden="true" />
            <span className="swiss-cross absolute -bottom-[1px] -left-[1px]" aria-hidden="true" />
            <span className="swiss-cross absolute -bottom-[1px] -right-[1px]" aria-hidden="true" />

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[28px]">
                {couple.groomName} &amp; {couple.brideName}
              </h1>
              <span className="font-display text-[12px] text-[var(--ink-soft)] tabular-nums">
                {couple.date}
              </span>
            </div>
            <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
              {couple.welcomeTitle}
            </p>
          </div>
        )}

        {/* 原比例 Masonry 多列瀑布流（禁止 hover 对 <img> 做任何形变） */}
        <div
          className="grid gap-2.5 sm:gap-3.5"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-2.5 sm:gap-3.5">
              {col.map((photo) => {
                const ch = chapters[photo.chapter];
                const isLastViewed = photo.index === lastViewedIndex;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => {
                      unlockBgmNow();
                      openLightbox(photo.index, listIndices, false);
                    }}
                    aria-label={
                      photo.title
                        ? `查看大图：${photo.title}`
                        : `查看第 ${photo.index + 1} 张照片`
                    }
                    className="flex flex-col overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      borderColor: isLastViewed ? 'var(--ink)' : 'var(--border)',
                      backgroundColor: 'var(--surface)',
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
                        alt={photo.title ?? ''}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onLoad={(e) => {
                          e.currentTarget.dataset.loaded = '';
                        }}
                        className="fade-img h-full w-full object-cover"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        {photo.title ? (
                          <div className="truncate text-[12.5px] font-medium text-[var(--ink)]">
                            {photo.title}
                          </div>
                        ) : (
                          <div className="truncate text-[11.5px] text-[var(--ink-soft)]">
                            {ch?.title ?? '珍藏'}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 font-display text-[10.5px] text-[var(--ink-soft)] tabular-nums">
                        {formatFrameNo(photo.index + 1)}
                      </span>
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
        <p className="text-[14px]">当前筛选下暂无照片，可以切换到「全部」浏览全部瞬间。</p>
      </div>
    );
  }

  if (viewMode === 'stack') {
    return <InteractiveStackGallery list={currentList} activeSlot={activeSlot} />;
  }

  if (viewMode === 'grid') {
    return <SwissMasonryGrid list={currentList} />;
  }

  return <CircularArcGallery list={currentList} activeSlot={activeSlot} />;
}
