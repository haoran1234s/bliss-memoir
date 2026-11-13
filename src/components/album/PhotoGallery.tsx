/**
 * 3D 弧形胶片转轮剧场核心舞台（Kinetic 3D Curved Reel）
 * ------------------------------------------------------------
 * 专为手机端竖屏单手操作设计的 Apple 设计奖级 3D 交互体验：
 *   - 相机 100% 静止端正（[0, 0, 5.2], fov: 36），彻底零眩晕；
 *   - 照片沿垂直 3D 圆柱弧面排布，中心卡片端正明亮，上下卡片沿弧面沉入暗房纵深；
 *   - 共享物理惯性与磁吸状态：1:1 跟手滑动、快速拨动飞掠多张、松手精准磁吸居中；
 *   - 四重贴图保障：真实均值色基底 + AtlasStreamer 图集流式加载 + 焦点周边原图 Texture LRU + WebGL 异常自动降级 CSS 3D 转轮；
 *   - 右侧精密拇指刻度拨盘（Scrubber）+ 底部展签铭牌 + 单手章节切换坞。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Calendar, ImageOff, MapPin, ZoomIn } from 'lucide-react';
import { atlas, chapters, photos } from '../../data/library';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore } from '../../store/useAlbumStore';
import { AtlasStreamer } from '../../three/atlas';
import type { Photo } from '../../types';
import { STORY_PHOTOS, formatFrameNo, getFilteredPhotos, toRoman } from './albumHelpers';

/** 共享连续滚动物理状态（供手势、3D 渲染与刻度拨盘零重绘同步） */
interface ReelPhysics {
  /** 当前瞬时浮点索引 [0, len - 1] */
  scrollPos: number;
  /** 目标磁吸索引（支持惯性飞掠与点击跳转） */
  targetPos: number;
  /** 用户是否正在按住拖动 */
  dragging: boolean;
  /** 当前列表长度 */
  count: number;
  /** 本次触摸手势是否产生了有效位移（用于区分轻点与滑动） */
  moved: boolean;
}

/** 检测 WebGL 可用性，异常时无缝降级为 CSS 3D 转轮 */
function isWebGLSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** 将 #rrggbb 转为 THREE.Color 浮点 RGB */
function parseHexColor(hex: string): THREE.Color {
  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color('#1c1b20');
  }
}

/** 根据视口尺寸计算焦点 3D 卡片的安全宽高（保证竖图不超上下遮罩、横图左右留有呼吸边） */
function computeCardBox(aspect: number, vpWidth: number, vpHeight: number) {
  const maxW = vpWidth * 0.78;
  const maxH = vpHeight * 0.62;
  let w = maxW;
  let h = w / Math.max(0.25, aspect);
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  // 留一点装裱安全上限
  return { w: Math.max(0.55, w), h: Math.max(0.55, h) };
}

/* ============================================================
   焦点附近独立高清贴图 LRU 缓存（保障单张 Retina 原片锐度）
   ============================================================ */
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

      // 优先加载 thumb 保底
      if (e.thumbState === 'idle' && this.loadingCount < 4) {
        this.loadOne(photo, 'thumb', e);
      }
      // 紧邻 3 张加载 full 高清原图
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
   3D 弧形卡片 Shader（内置黑曜石香槟金装裱框 + 圆柱弯曲 + 暗房聚光灯）
   ============================================================ */
const REEL_VERTEX = /* glsl */ `
  precision highp float;
  uniform float uBend;
  uniform vec2 uCardSize;
  varying vec2 vUv;
  varying vec3 vNormalPos;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // 在本地宽面上产生细腻的圆柱弧度，模拟高端 3D 弧形胶片滚筒
    pos.x *= uCardSize.x;
    pos.y *= uCardSize.y;
    float normY = position.y;
    pos.z -= (normY * normY) * uBend;
    vNormalPos = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const REEL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uHasAtlas;
  uniform vec4 uAtlasUv;
  uniform sampler2D uDirectTex;
  uniform float uHasDirect;
  uniform vec3 uBaseColor;
  uniform float uBrightness;
  uniform float uFocus;
  uniform vec2 uCardSize;

  varying vec2 vUv;

  void main() {
    // 卡片外圆角距离场
    vec2 size = uCardSize;
    vec2 p = (vUv - 0.5) * size;
    float radius = 0.032;
    vec2 q = abs(p) - size * 0.5 + radius;
    float sdCard = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float aa = max(fwidth(sdCard), 0.0005);
    float alpha = 1.0 - smoothstep(-aa, aa, sdCard);
    if (alpha < 0.02) discard;

    // 极细香槟金边框（中心焦点卡片更清晰，两侧微隐）
    float borderThick = 0.022;
    vec2 innerSize = max(vec2(0.05), size - borderThick * 2.0);
    float innerRadius = 0.020;
    vec2 qi = abs(p) - innerSize * 0.5 + innerRadius;
    float sdPhoto = length(max(qi, 0.0)) + min(max(qi.x, qi.y), 0.0) - innerRadius;
    float inPhoto = 1.0 - smoothstep(-aa, aa, sdPhoto);

    // 装裱边框色调：黑曜石边框 + 焦点香槟金细线高光
    float rimLine = 1.0 - smoothstep(0.0, 0.009, abs(sdCard + 0.006));
    vec3 obsidian = vec3(0.078, 0.075, 0.088);
    vec3 champagne = vec3(0.784, 0.698, 0.557);
    vec3 frameCol = mix(obsidian, champagne, rimLine * (0.28 + 0.58 * uFocus));

    // 采样照片贴图（图集页贴图 flipY=false 坐标系需对应 y 翻转）
    vec2 photoUv = clamp((p / innerSize) + 0.5, 0.0, 1.0);
    vec3 photoCol = uBaseColor;

    if (uHasAtlas > 0.5) {
      vec2 aUv = vec2(
        uAtlasUv.x + photoUv.x * uAtlasUv.z,
        uAtlasUv.y + (1.0 - photoUv.y) * uAtlasUv.w
      );
      photoCol = texture2D(uAtlas, aUv).rgb;
    }
    if (uHasDirect > 0.5) {
      vec3 dCol = texture2D(uDirectTex, photoUv).rgb;
      photoCol = mix(photoCol, dCol, uHasDirect);
    }

    // 相纸内嵌微影与轻微高光质感
    float innerVignette = smoothstep(0.0, 0.015, -sdPhoto);
    photoCol *= mix(0.86, 1.0, innerVignette);

    vec3 finalCol = mix(frameCol, photoCol, inPhoto);
    finalCol *= uBrightness;

    // 暗房环境雾化混合（远端沉入 #0B0B0E）
    vec3 bg = vec3(0.043, 0.043, 0.055);
    finalCol = mix(bg, finalCol, clamp(uBrightness * 1.12, 0.14, 1.0));

    gl_FragColor = vec4(finalCol, alpha);
  }
`;

/* ============================================================
   Three.js 3D 弧形转轮场景内容
   ============================================================ */
interface ThreeReelContentProps {
  list: Photo[];
  physicsRef: React.MutableRefObject<ReelPhysics>;
  onCenterSnapChange: (photoIndex: number) => void;
  reducedMotion: boolean;
}

const VISIBLE_RADIUS = 5;
const POOL_SLOTS = VISIBLE_RADIUS * 2 + 1;

function ThreeReelContent({
  list,
  physicsRef,
  onCenterSnapChange,
  reducedMotion,
}: ThreeReelContentProps) {
  const { gl, viewport } = useThree();
  const tier = getDeviceTier();

  // 共享细分平面几何体（带轻微曲率细分）
  const cardGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 8, 22), []);
  useEffect(() => () => cardGeometry.dispose(), [cardGeometry]);

  // 触发贴图重绑标记
  const dirtyRef = useRef(true);

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

  // 固定大小的 3D 卡片网格池（避免切换照片时反复创建材质导致卡顿）
  const slotMaterials = useMemo(() => {
    return Array.from({ length: POOL_SLOTS }, () => {
      return new THREE.ShaderMaterial({
        vertexShader: REEL_VERTEX,
        fragmentShader: REEL_FRAGMENT,
        transparent: true,
        depthWrite: true,
        uniforms: {
          uBend: { value: 0.05 },
          uCardSize: { value: new THREE.Vector2(1.6, 1.2) },
          uAtlas: { value: null },
          uHasAtlas: { value: 0 },
          uAtlasUv: { value: new THREE.Vector4(0, 0, 1, 1) },
          uDirectTex: { value: null },
          uHasDirect: { value: 0 },
          uBaseColor: { value: new THREE.Color('#1c1b20') },
          uBrightness: { value: 1 },
          uFocus: { value: 1 },
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
  const ringLeftRef = useRef<THREE.Mesh>(null);
  const ringRightRef = useRef<THREE.Mesh>(null);
  const lastFocusPageKey = useRef('');
  const lastSnappedPhotoRef = useRef(-1);

  // 两侧 3D 香槟金刻度环几何体
  const ringGeo = useMemo(() => new THREE.TorusGeometry(2.65, 0.0055, 8, 96), []);
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#c8b28e',
        transparent: true,
        opacity: 0.24,
      }),
    [],
  );
  useEffect(() => {
    return () => {
      ringGeo.dispose();
      ringMat.dispose();
    };
  }, [ringGeo, ringMat]);

  useFrame((_, delta) => {
    const phy = physicsRef.current;
    const len = list.length;
    if (len === 0) return;

    const dt = Math.min(delta, 0.05);

    // 1. 平滑物理阻尼逼近目标位置（拖动时由 pointerMove 直接驱动）
    if (!phy.dragging) {
      if (reducedMotion) {
        phy.scrollPos = phy.targetPos;
      } else {
        const diff = phy.targetPos - phy.scrollPos;
        if (Math.abs(diff) < 0.0005) {
          phy.scrollPos = phy.targetPos;
        } else {
          const factor = 1 - Math.exp(-13.5 * dt);
          phy.scrollPos += diff * factor;
        }
      }
    }

    const centerSlot = Math.max(0, Math.min(len - 1, Math.round(phy.scrollPos)));
    const centerPhoto = list[centerSlot];
    if (centerPhoto && centerPhoto.index !== lastSnappedPhotoRef.current) {
      lastSnappedPhotoRef.current = centerPhoto.index;
      onCenterSnapChange(centerPhoto.index);
    }

    // 2. 驱动流式图集与焦点原片缓存
    const pLo = Math.max(0, centerSlot - 5);
    const pHi = Math.min(len - 1, centerSlot + 5);
    const pageLo = list[pLo]?.page ?? 0;
    const pageHi = list[pHi]?.page ?? 0;
    const cPage = centerPhoto?.page ?? 0;
    const key = `${centerSlot}-${cPage}-${pageLo}-${pageHi}`;
    if (key !== lastFocusPageKey.current) {
      lastFocusPageKey.current = key;
      const hiMin = Math.min(cPage, pageLo, pageHi);
      const hiMax = Math.max(cPage, pageLo, pageHi);
      atlasStreamer.focus(cPage, cPage, Math.max(0, hiMin - 1), Math.min(atlas.pages - 1, hiMax + 1), tier.atlasHi);
      focusCache.requestAround(list, centerSlot);
    }
    atlasStreamer.update(performance.now());

    // 3. 更新两侧 3D 机械弧环旋转（营造精准镜头转轮空间感）
    const ringRotX = phy.scrollPos * 0.36;
    const ringXOffset = Math.min(2.2, viewport.width * 0.45);
    if (ringLeftRef.current) {
      ringLeftRef.current.position.set(-ringXOffset, 0, -1.85);
      ringLeftRef.current.rotation.set(ringRotX, Math.PI / 2, 0);
    }
    if (ringRightRef.current) {
      ringRightRef.current.position.set(ringXOffset, 0, -1.85);
      ringRightRef.current.rotation.set(ringRotX, Math.PI / 2, 0);
    }

    // 4. 更新池内每个可见 3D 卡片的空间位置、圆柱倾角与材质参数
    const radiusY = viewport.height * 0.56;
    const radiusZ = 1.95;
    const angleStep = 0.46;

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

      // 垂直圆柱弧面排布：绝对零左右 X 晃动、零 Z 侧倾，彻底消除眩晕
      const y = -Math.sin(theta) * radiusY - d * 0.16;
      const z = -(1 - Math.cos(theta)) * radiusZ - Math.abs(d) * 0.34;
      const rotX = -theta * 0.78;

      mesh.position.set(0, y, z);
      mesh.rotation.set(rotX, 0, 0);

      // 焦点卡片轻微朝观众呼吸浮起（不越界）
      const focusFactor = Math.max(0, 1 - Math.abs(d) * 1.15);
      const scale = 0.88 + 0.12 * focusFactor;
      mesh.scale.set(scale, scale, 1);

      const { w, h } = computeCardBox(photo.aspect, viewport.width, viewport.height);
      mat.uniforms.uCardSize.value.set(w, h);
      mat.uniforms.uBend.value = 0.055 * (1 - 0.55 * focusFactor);

      // 暗房聚光灯：焦点卡片 100% 明亮，远离中心平滑压暗
      const brightness = Math.exp(-d * d * 0.36);
      mat.uniforms.uBrightness.value = Math.max(0.18, brightness);
      mat.uniforms.uFocus.value = focusFactor;
      mat.uniforms.uBaseColor.value.copy(parseHexColor(photo.color));

      // 图集贴图绑定
      const aTex = atlasStreamer.hi(photo.page) ?? atlasStreamer.lo(photo.page);
      mat.uniforms.uAtlas.value = aTex;
      mat.uniforms.uHasAtlas.value = aTex ? 1 : 0;
      const [rx, ry, rw, rh] = photo.rect;
      mat.uniforms.uAtlasUv.value.set(rx / atlas.page, ry / atlas.page, rw / atlas.page, rh / atlas.page);

      // 独立高清贴图绑定（焦点附近卡片启用高清晰度）
      const directTex = Math.abs(d) <= 3.2 ? focusCache.getBestTexture(photo.index) : null;
      mat.uniforms.uDirectTex.value = directTex;
      mat.uniforms.uHasDirect.value = directTex ? 1 : 0;
    }

    dirtyRef.current = false;
  });

  return (
    <>
      <color attach="background" args={['#0b0b0e']} />
      {/* 两侧精密 3D 香槟金旋转弧环 */}
      <mesh ref={ringLeftRef} geometry={ringGeo} material={ringMat} />
      <mesh ref={ringRightRef} geometry={ringGeo} material={ringMat} />

      {/* 3D 弧形胶片转轮卡片池 */}
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

/* ============================================================
   CSS 3D 降级转轮（当设备不支持 WebGL 或发生异常时自动无缝接管）
   ============================================================ */
interface CssCurvedReelProps {
  list: Photo[];
  physicsRef: React.MutableRefObject<ReelPhysics>;
  onCenterSnapChange: (photoIndex: number) => void;
}

function CssCurvedReel({ list, physicsRef, onCenterSnapChange }: CssCurvedReelProps) {
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
        if (Math.abs(diff) < 0.001) {
          phy.scrollPos = phy.targetPos;
        } else {
          phy.scrollPos += diff * (1 - Math.exp(-13.5 * dt));
        }
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
  const start = Math.max(0, centerSlot - 4);
  const end = Math.min(list.length - 1, centerSlot + 4);
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
          const theta = d * 24;
          const translateY = d * 210;
          const translateZ = -Math.pow(absD, 1.35) * 135;
          const brightness = Math.max(0.2, Math.exp(-d * d * 0.36));
          const isFocus = absD < 0.5;

          return (
            <div
              key={photo.id}
              className="absolute flex items-center justify-center overflow-hidden border bg-[#141317] shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
              style={{
                width: `min(74vw, ${Math.round(Math.min(460, 320 * photo.aspect))}px)`,
                aspectRatio: `${photo.w} / ${photo.h}`,
                maxHeight: '52vh',
                borderRadius: '8px',
                borderColor: isFocus ? 'rgba(200, 178, 142, 0.72)' : 'rgba(255, 255, 255, 0.1)',
                backgroundColor: photo.color,
                transform: `translate3d(0px, ${translateY.toFixed(1)}px, ${translateZ.toFixed(1)}px) rotateX(${(-theta).toFixed(2)}deg)`,
                opacity: Math.min(1, brightness * 1.15),
                filter: `brightness(${brightness.toFixed(2)})`,
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

/* ============================================================
   右侧精密拇指刻度拨盘（Right Edge Precision Dial Scrubber）
   ============================================================ */
interface RightDialScrubberProps {
  list: Photo[];
  activeSlot: number;
  onScrubTo: (slotFloat: number, snap: boolean) => void;
}

function RightDialScrubber({ list, activeSlot, onScrubTo }: RightDialScrubberProps) {
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
  const tickCount = 24;

  return (
    <div className="pointer-events-none fixed bottom-36 right-2 top-20 z-20 flex items-center px-safe sm:right-4">
      <div
        ref={railRef}
        role="slider"
        aria-label="照片胶片刻度快速拨盘"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={activeSlot + 1}
        tabIndex={0}
        className="pointer-events-auto relative flex h-full w-10 flex-col items-end justify-between py-2 pr-1.5"
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
        {/* 24 道精密金属刻度线 */}
        {Array.from({ length: tickCount }).map((_, idx) => {
          const major = idx % 4 === 0;
          return (
            <span
              key={idx}
              className="block transition-colors"
              style={{
                width: major ? '12px' : '6px',
                height: '1px',
                backgroundColor: major ? 'rgba(200, 178, 142, 0.55)' : 'rgba(243, 239, 234, 0.2)',
              }}
            />
          );
        })}

        {/* 当前游标指示灯 */}
        <div
          className="pointer-events-none absolute right-0.5 flex items-center transition-[top] duration-75"
          style={{ top: `calc(${progress}% - 8px)` }}
        >
          {scrubbing && activePhoto && (
            <div
              className="mr-3 whitespace-nowrap border border-[#c8b28e]/60 bg-[#141418]/95 px-2.5 py-1 shadow-lg backdrop-blur-sm"
              style={{ borderRadius: '6px' }}
            >
              <div className="font-serif text-[11.5px] text-[#f3efea]">
                {activeChapter ? `${toRoman(activeChapter.index + 1)} · ${activeChapter.title}` : '回忆档案'}
              </div>
              <div className="font-display text-[10.5px] text-[#c8b28e] tabular-nums">
                {formatFrameNo(activeSlot + 1)} / {formatFrameNo(count)}
              </div>
            </div>
          )}
          <span className="h-4 w-1.5 rounded-full bg-[#c8b28e] shadow-[0_0_10px_rgba(200,178,142,0.85)]" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   主出口组件：PhotoGallery（3D 弧形胶片转轮舞台）
   ============================================================ */
export function PhotoGallery() {
  const filter = useAlbumStore((s) => s.filter);
  const activePhotoIndex = useAlbumStore((s) => s.activePhotoIndex);
  const autoplay = useAlbumStore((s) => s.autoplay);
  const { setFilter, setActivePhotoIndex, stopAutoplay, openLightbox } = useAlbumStore.getState();

  const currentList = useMemo(() => getFilteredPhotos(filter), [filter]);
  const currentIndices = useMemo(() => currentList.map((p) => p.index), [currentList]);

  const activeSlot = useMemo(() => {
    const idx = currentList.findIndex((p) => p.index === activePhotoIndex);
    return idx >= 0 ? idx : 0;
  }, [currentList, activePhotoIndex]);

  const physicsRef = useRef<ReelPhysics>({
    scrollPos: activeSlot,
    targetPos: activeSlot,
    dragging: false,
    count: currentList.length,
    moved: false,
  });

  // 当外部点击（如章节切换、底片抽屉跳转、灯箱切图）改变 activeSlot 时，平滑把 3D 转轮对齐过去
  useEffect(() => {
    const phy = physicsRef.current;
    const lenChanged = phy.count !== currentList.length;
    phy.count = currentList.length;
    if (lenChanged) {
      phy.scrollPos = activeSlot;
      phy.targetPos = activeSlot;
    } else if (!phy.dragging && Math.round(phy.targetPos) !== activeSlot) {
      phy.targetPos = activeSlot;
    }
  }, [activeSlot, currentList.length]);

  const [webglOk, setWebglOk] = useState<boolean>(() => isWebGLSupported());
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleCenterSnapChange = useCallback(
    (photoIndex: number) => {
      setActivePhotoIndex(photoIndex);
    },
    [setActivePhotoIndex],
  );

  // 自动巡航定时推进（无眩晕平稳步进）
  useEffect(() => {
    if (!autoplay || currentList.length <= 1) return;
    const timer = window.setInterval(() => {
      const phy = physicsRef.current;
      if (phy.dragging) return;
      const next = Math.round(phy.targetPos) + 1;
      phy.targetPos = next >= currentList.length ? 0 : next;
    }, 3600);
    return () => window.clearInterval(timer);
  }, [autoplay, currentList.length]);

  // 舞台触摸手势记录（惯性速度追踪 + 轻点直达放大/跳帧）
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
    if (Math.abs(dy) > 7) {
      physicsRef.current.moved = true;
    }

    const dt = e.timeStamp - t.lastT;
    if (dt > 0) {
      const instVy = (e.clientY - t.lastY) / dt;
      t.vy = t.vy * 0.45 + instVy * 0.55;
      t.lastY = e.clientY;
      t.lastT = e.timeStamp;
    }

    // 向上滑 dy < 0 → 推进到下一张；向下滑 dy > 0 → 退回上一张
    const sensitivity = 1 / Math.max(165, t.containerH * 0.34);
    const maxPos = Math.max(0, currentList.length - 1);
    const nextPos = Math.max(-0.35, Math.min(maxPos + 0.35, t.startScroll - dy * sensitivity));
    physicsRef.current.scrollPos = nextPos;
    physicsRef.current.targetPos = nextPos;
  };

  const onStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (!t.active || t.pointerId !== e.pointerId) return;
    t.active = false;
    const phy = physicsRef.current;
    phy.dragging = false;

    const maxPos = Math.max(0, currentList.length - 1);

    // 未滑动则是轻点：点中屏中央焦点区域打开全屏放大检视；点上下相邻卡直接拨过来
    if (!phy.moved) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect && currentList[activeSlot]) {
        const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
        if (relY < 0.3) {
          phy.targetPos = Math.max(0, activeSlot - 1);
        } else if (relY > 0.7) {
          phy.targetPos = Math.min(maxPos, activeSlot + 1);
        } else {
          unlockBgmNow();
          openLightbox(currentList[activeSlot].index, currentIndices, false);
        }
      }
      return;
    }

    // 根据松手速度估算惯性落点，并磁吸到整数照片下标
    const recent = e.timeStamp - t.lastT < 85 ? t.vy : 0;
    const dyTotal = e.clientY - t.startY;
    let projected = phy.scrollPos - recent * 3.4;

    // 防止轻轻划过 20px 却回弹回原位：给明显意图一个最小翻页助力
    if (Math.abs(dyTotal) > 36 && Math.round(projected) === Math.round(t.startScroll)) {
      projected = Math.round(t.startScroll) + (dyTotal < 0 ? 1 : -1);
    }

    phy.targetPos = Math.max(0, Math.min(maxPos, Math.round(projected)));
  };

  // 桌面端滚轮控制转轮滚动
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
      const maxPos = Math.max(0, currentList.length - 1);
      physicsRef.current.targetPos = Math.max(0, Math.min(maxPos, Math.round(physicsRef.current.targetPos) + step));
      wheelAccRef.current = 0;
      wheelLockRef.current = now + 95;
    }
  };

  const handleDialScrub = useCallback(
    (slotFloat: number, snap: boolean) => {
      stopAutoplay();
      const maxPos = Math.max(0, currentList.length - 1);
      const clamped = Math.max(0, Math.min(maxPos, snap ? Math.round(slotFloat) : slotFloat));
      physicsRef.current.dragging = !snap;
      physicsRef.current.scrollPos = clamped;
      physicsRef.current.targetPos = clamped;
      const targetPhoto = currentList[Math.round(clamped)];
      if (targetPhoto) setActivePhotoIndex(targetPhoto.index);
    },
    [currentList, setActivePhotoIndex, stopAutoplay],
  );

  const activePhoto = currentList[activeSlot] ?? photos[0];
  const activeChapter = activePhoto ? chapters[activePhoto.chapter] : undefined;

  if (photos.length === 0 || !activePhoto) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0b0b0e] px-6 text-center text-[#a39e95]">
        <ImageOff className="h-8 w-8 text-[#c8b28e]" aria-hidden="true" />
        <p className="text-[14px]">还没有照片，请把照片放入 `photos/` 并运行 `npm run photos`。</p>
      </div>
    );
  }

  return (
    <section
      aria-label="3D 弧形胶片转轮舞台"
      className="relative h-full w-full overflow-hidden bg-[#0b0b0e]"
    >
      {/* 中央手势与 3D 渲染舞台 */}
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
            <ThreeReelContent
              list={currentList}
              physicsRef={physicsRef}
              onCenterSnapChange={handleCenterSnapChange}
              reducedMotion={prefersReducedMotion}
            />
          </Canvas>
        ) : (
          <CssCurvedReel
            list={currentList}
            physicsRef={physicsRef}
            onCenterSnapChange={handleCenterSnapChange}
          />
        )}

        {/* 上下暗房暗角遮罩，让 HUD 文字与顶部/底部融入极深空间 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0b0b0e] via-[#0b0b0e]/60 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#0b0b0e] via-[#0b0b0e]/90 to-transparent"
          aria-hidden="true"
        />
      </div>

      {/* 右侧精密刻度快速拨盘 */}
      <RightDialScrubber list={currentList} activeSlot={activeSlot} onScrubTo={handleDialScrub} />

      {/* 底部展签铭牌 + 单手章节切换坞 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-safe pb-safe">
        <div className="pointer-events-auto mx-auto max-w-2xl px-4 pb-3 pt-2 sm:px-6">
          {/* 当前焦点照片展签 */}
          <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/[0.1] pb-2.5 pr-7 sm:pr-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-[#c8b28e]">
                <span className="font-display tabular-nums">
                  {formatFrameNo(activeSlot + 1)} / {formatFrameNo(currentList.length)}
                </span>
                {activeChapter && (
                  <>
                    <span className="text-white/25">·</span>
                    <span className="truncate font-serif text-[12px]">
                      {toRoman(activeChapter.index + 1)} {activeChapter.title}
                    </span>
                  </>
                )}
              </div>

              {activePhoto.title ? (
                <h2 className="mt-1 truncate font-serif text-[18px] font-medium leading-snug text-[#f3efea] sm:text-[20px]">
                  {activePhoto.title}
                </h2>
              ) : (
                <h2 className="mt-1 truncate font-serif text-[16px] text-[#f3efea]/90">
                  {activeChapter?.title ?? '珍藏光影'}
                </h2>
              )}

              {activePhoto.story && (
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[#a39e95]">
                  {activePhoto.story}
                </p>
              )}

              {(activePhoto.place || activePhoto.date) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-[#a39e95]">
                  {activePhoto.place && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-[#c8b28e]" aria-hidden="true" />
                      <span>{activePhoto.place}</span>
                    </span>
                  )}
                  {activePhoto.date && (
                    <span className="inline-flex items-center gap-1 font-display tabular-nums">
                      <Calendar className="h-3 w-3 text-[#c8b28e]" aria-hidden="true" />
                      <span>{activePhoto.date}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                unlockBgmNow();
                openLightbox(activePhoto.index, currentIndices, false);
              }}
              aria-label="全屏缩放查看原片"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 border border-[#c8b28e]/50 bg-[#141418]/90 px-3 text-[12px] text-[#c8b28e] transition-colors hover:bg-[#c8b28e] hover:text-[#11100e] active:scale-[0.97]"
              style={{ borderRadius: '8px' }}
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>原片</span>
            </button>
          </div>

          {/* 单手章节切换条 */}
          <nav
            aria-label="章节切换栏"
            className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5"
          >
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`h-8 shrink-0 border px-3 text-[12px] transition-colors ${
                filter === 'all'
                  ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                  : 'border-white/[0.1] bg-[#141418]/85 text-[#a39e95] hover:text-[#f3efea]'
              }`}
              style={{ borderRadius: '6px' }}
            >
              全部
            </button>

            {chapters.map((ch) => {
              const active = filter === ch.index;
              return (
                <button
                  key={ch.index}
                  type="button"
                  onClick={() => setFilter(ch.index)}
                  className={`h-8 shrink-0 border px-3 text-[12px] transition-colors ${
                    active
                      ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                      : 'border-white/[0.1] bg-[#141418]/85 text-[#a39e95] hover:text-[#f3efea]'
                  }`}
                  style={{ borderRadius: '6px' }}
                >
                  {toRoman(ch.index + 1)} {ch.title}
                </button>
              );
            })}

            {STORY_PHOTOS.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter('stories')}
                className={`h-8 shrink-0 border px-3 text-[12px] transition-colors ${
                  filter === 'stories'
                    ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                    : 'border-white/[0.1] bg-[#141418]/85 text-[#a39e95] hover:text-[#f3efea]'
                }`}
                style={{ borderRadius: '6px' }}
              >
                手记
              </button>
            )}
          </nav>
        </div>
      </div>
    </section>
  );
}
