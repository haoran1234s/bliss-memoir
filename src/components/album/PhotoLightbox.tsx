/**
 * 零眩晕暗房级全屏照片检视器
 * ------------------------------------------------------------
 * 交互与动效原则：
 *   - 彻底去除旋转、倾斜与弹簧回弹，只使用克制的透明度与微距平直位移；
 *   - 手动切换：±32px 平直滑入 + 透明度过渡（200ms）；
 *   - 自动放映 / 减弱动态模式：0 位移纯叠化（Crossfade，380ms）；
 *   - 手势：双指捏合 / 双击 / 滚轮 1x–4x 定点缩放；未放大时左右滑切图、下拉平直关闭；
 *   - 底部胶片缩略图导览条（Filmstrip）：支持一眼定位与点击直达任意照片。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  X,
  ZoomIn,
} from 'lucide-react';
import { chapters, photos } from '../../data/library';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore } from '../../store/useAlbumStore';
import { paletteOf } from '../../theme/palettes';
import { CALM_EASE } from './albumHelpers';

const MAX_ZOOM = 4;
const SLIDESHOW_INTERVAL_MS = 4000;
const EASE_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';

const clampVal = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface StageBox {
  w: number;
  h: number;
  left: number;
  top: number;
}

interface CardEls {
  index: number;
  drag: HTMLDivElement;
  zoom: HTMLDivElement;
  win: HTMLDivElement;
}

function fitPhotoSize(stage: StageBox, aspect: number) {
  const short = stage.h < 460;
  const padX = short ? 24 : 32;
  const padY = short ? 14 : 24;
  const availW = Math.max(160, stage.w - padX);
  const availH = Math.max(140, stage.h - padY);
  const pw = Math.max(100, Math.min(availW, availH * aspect));
  const ph = pw / aspect;
  return { pw, ph };
}

interface SlideCustom {
  dir: number;
  crossfadeOnly: boolean;
}

const slideVariants = {
  enter: (c: SlideCustom) =>
    c.crossfadeOnly
      ? { x: 0, opacity: 0 }
      : { x: c.dir * 32, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: (c: SlideCustom) =>
    c.crossfadeOnly
      ? { x: 0, opacity: 0, transition: { duration: 0.36, ease: CALM_EASE } }
      : { x: -c.dir * 32, opacity: 0, transition: { duration: 0.18, ease: CALM_EASE } },
};

interface LightboxPhotoProps {
  index: number;
  stage: StageBox;
  custom: SlideCustom;
  register: (els: CardEls | null, index: number) => void;
}

function LightboxPhoto({ index, stage, custom, register }: LightboxPhotoProps) {
  const photo = photos[index];
  const { pw, ph } = fitPhotoSize(stage, photo.aspect);
  const present = useIsPresent();

  const dragRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const winRef = useRef<HTMLDivElement>(null);

  const [thumbOk, setThumbOk] = useState(true);
  const [fullState, setFullState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    if (!present) return;
    if (!dragRef.current || !zoomRef.current || !winRef.current) return;
    register({ index, drag: dragRef.current, zoom: zoomRef.current, win: winRef.current }, index);
    return () => register(null, index);
  }, [index, present, register]);

  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: pw, height: ph, marginLeft: -pw / 2, marginTop: -ph / 2 }}
      custom={custom}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: custom.crossfadeOnly ? 0.38 : 0.2, ease: CALM_EASE }}
    >
      <div ref={dragRef} className="h-full w-full will-change-transform">
        <div
          ref={winRef}
          className="relative h-full w-full overflow-hidden border border-[#c8b28e]/25 shadow-[0_24px_70px_rgba(0,0,0,0.75)]"
          style={{ backgroundColor: photo.color, borderRadius: '6px' }}
        >
          <div ref={zoomRef} className="absolute inset-0 origin-top-left will-change-transform">
            {thumbOk && (
              <img
                src={photo.thumb}
                alt=""
                draggable={false}
                decoding="async"
                onError={() => setThumbOk(false)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {fullState !== 'failed' && (
              <img
                src={photo.full}
                alt={photo.title ?? ''}
                draggable={false}
                decoding="async"
                onLoad={() => setFullState('ready')}
                onError={() => setFullState('failed')}
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
                style={{ opacity: fullState === 'ready' ? 1 : 0 }}
              />
            )}
          </div>
          {!thumbOk && fullState === 'failed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#141418] text-[#a39e95]">
              <ImageOff className="h-8 w-8 text-[#c8b28e]" aria-hidden="true" />
              <span className="text-[13px]">这张照片暂时没能加载出来</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function PhotoLightbox() {
  const lightboxIndex = useAlbumStore((s) => s.lightboxIndex);
  const lightboxList = useAlbumStore((s) => s.lightboxList);
  const slideshow = useAlbumStore((s) => s.slideshow);
  const { closeLightbox, stepLightbox, jumpLightbox, toggleSlideshow, stopSlideshow } =
    useAlbumStore.getState();

  // 退场动画期间 lightboxIndex 变为 null，保留最后查看的图片下标防止空指针
  const keptRef = useRef(lightboxIndex ?? 0);
  if (lightboxIndex !== null) keptRef.current = lightboxIndex;
  const index = keptRef.current;
  const photo = photos[index] ?? photos[0];
  const chapter = chapters[photo.chapter];
  const palette = paletteOf(chapter?.palette, photo.chapter);

  const posInList = Math.max(0, lightboxList.indexOf(index));
  const listLen = Math.max(1, lightboxList.length);

  // 根据队列中的位置变化计算平直滑行方向
  const prevPosRef = useRef(posInList);
  const dirRef = useRef(1);
  if (prevPosRef.current !== posInList) {
    const diff = (posInList - prevPosRef.current + listLen) % listLen;
    dirRef.current = diff <= listLen / 2 ? 1 : -1;
    prevPosRef.current = posInList;
  }

  const [chromeVisible, setChromeVisible] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* —— 自动放映定时器 —— */
  useEffect(() => {
    if (!slideshow || lightboxIndex === null || listLen <= 1) return;
    const timer = window.setInterval(() => {
      useAlbumStore.getState().stepLightbox(1);
    }, SLIDESHOW_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [slideshow, lightboxIndex, listLen]);

  /* —— 测量舞台尺寸 —— */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<StageBox | null>(null);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStage((old) =>
        old && old.w === r.width && old.h === r.height && old.left === r.left && old.top === r.top
          ? old
          : { w: r.width, h: r.height, left: r.left, top: r.top },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* —— 后台预加载前后各 2 张高清图 —— */
  useEffect(() => {
    if (listLen <= 1) return;
    const preloads: HTMLImageElement[] = [];
    for (const offset of [1, -1, 2, -2]) {
      const targetIdx = lightboxList[(posInList + offset + listLen) % listLen];
      const targetPhoto = photos[targetIdx];
      if (!targetPhoto) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = Math.abs(offset) === 1 ? targetPhoto.full : targetPhoto.thumb;
      preloads.push(img);
    }
    return () => {
      preloads.forEach((img) => {
        img.src = '';
      });
    };
  }, [posInList, listLen, lightboxList]);

  /* —— 底部胶片缩略图条自动居中 —— */
  const filmstripRef = useRef<HTMLDivElement>(null);
  const stripBtnRefs = useRef(new Map<number, HTMLButtonElement>());
  const didInitialCenter = useRef(false);

  useEffect(() => {
    const strip = filmstripRef.current;
    const activeBtn = stripBtnRefs.current.get(index);
    if (!strip || !activeBtn) return;
    const targetLeft = activeBtn.offsetLeft - (strip.clientWidth - activeBtn.offsetWidth) / 2;
    strip.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: !didInitialCenter.current || prefersReducedMotion ? 'auto' : 'smooth',
    });
    didInitialCenter.current = true;
  }, [index, prefersReducedMotion]);

  /* —— 指针缩放与滑动手势 —— */
  const cardElsRef = useRef<CardEls | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    mode: 'idle' as 'idle' | 'pending' | 'pan' | 'pinch' | 'swipe-x' | 'swipe-y' | 'done',
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    vx: 0,
    vy: 0,
    s: 1,
    tx: 0,
    ty: 0,
    s0: 1,
    tx0: 0,
    ty0: 0,
    d0: 1,
    ix: 0,
    iy: 0,
    lastTap: 0,
    tapX: 0,
    tapY: 0,
    tapTimer: 0,
    wheelX: 0,
    wheelLock: 0,
  });

  const syncZoomFlag = useCallback((scale: number) => {
    const next = scale > 1.05;
    setIsZoomed((prev) => (prev === next ? prev : next));
  }, []);

  const registerCard = useCallback(
    (next: CardEls | null, cardIndex: number) => {
      if (next) {
        cardElsRef.current = next;
        const g = gestureRef.current;
        g.s = 1;
        g.tx = 0;
        g.ty = 0;
        next.zoom.style.transform = '';
        next.drag.style.transform = '';
        if (backdropRef.current) backdropRef.current.style.opacity = '1';
        syncZoomFlag(1);
      } else if (cardElsRef.current?.index === cardIndex) {
        cardElsRef.current = null;
      }
    },
    [syncZoomFlag],
  );

  const applyZoom = useCallback(
    (animate: boolean) => {
      const c = cardElsRef.current;
      if (!c) return;
      const g = gestureRef.current;
      c.zoom.style.transition = animate ? `transform 0.24s ${EASE_CSS}` : 'none';
      c.zoom.style.transform = `translate3d(${g.tx}px, ${g.ty}px, 0) scale(${g.s})`;
      syncZoomFlag(g.s);
    },
    [syncZoomFlag],
  );

  const applyDrag = (x: number, y: number, animate: boolean) => {
    const c = cardElsRef.current;
    if (!c) return;
    c.drag.style.transition = animate ? `transform 0.24s ${EASE_CSS}` : 'none';
    // 纯平直位移，不加任何旋转
    c.drag.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (backdropRef.current) {
      backdropRef.current.style.transition = animate ? `opacity 0.24s ${EASE_CSS}` : 'none';
      backdropRef.current.style.opacity = String(1 - clampVal(y / 480, 0, 0.55));
    }
  };

  const bounds = () => {
    const c = cardElsRef.current!;
    const g = gestureRef.current;
    return {
      minX: c.win.clientWidth * (1 - g.s),
      minY: c.win.clientHeight * (1 - g.s),
    };
  };

  const clampPan = () => {
    const g = gestureRef.current;
    const b = bounds();
    g.tx = clampVal(g.tx, b.minX, 0);
    g.ty = clampVal(g.ty, b.minY, 0);
  };

  const rubber = (v: number, min: number, max: number) =>
    v < min ? min - (min - v) * 0.32 : v > max ? max + (v - max) * 0.32 : v;

  const zoomAt = (px: number, py: number, nextScale: number) => {
    const g = gestureRef.current;
    const ix = (px - g.tx) / g.s;
    const iy = (py - g.ty) / g.s;
    g.s = nextScale;
    g.tx = px - ix * nextScale;
    g.ty = py - iy * nextScale;
  };

  const winPoint = (clientX: number, clientY: number) => {
    const r = cardElsRef.current!.win.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const toggleButtonZoom = () => {
    const c = cardElsRef.current;
    if (!c) return;
    stopSlideshow();
    const g = gestureRef.current;
    if (g.s > 1.05) {
      g.s = 1;
      g.tx = 0;
      g.ty = 0;
    } else {
      zoomAt(c.win.clientWidth / 2, c.win.clientHeight / 2, 2.2);
      clampPan();
    }
    applyZoom(true);
  };

  const manualStep = (delta: number) => {
    stopSlideshow();
    stepLightbox(delta);
  };

  const pinchStart = () => {
    const g = gestureRef.current;
    const [a, b] = [...g.pointers.values()];
    g.d0 = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    g.s0 = g.s;
    const m = winPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    g.ix = (m.x - g.tx) / g.s;
    g.iy = (m.y - g.ty) / g.s;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!cardElsRef.current) return;
    const g = gestureRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.pointers.size === 1) {
      g.mode = 'pending';
      g.startX = g.lastX = e.clientX;
      g.startY = g.lastY = e.clientY;
      g.lastT = e.timeStamp;
      g.vx = 0;
      g.vy = 0;
      g.tx0 = g.tx;
      g.ty0 = g.ty;
    } else if (g.pointers.size === 2) {
      if (g.mode === 'swipe-x' || g.mode === 'swipe-y') applyDrag(0, 0, true);
      stopSlideshow();
      g.mode = 'pinch';
      pinchStart();
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g.pointers.has(e.pointerId) || !cardElsRef.current) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.mode === 'pinch' && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clampVal((g.s0 * d) / g.d0, 0.75, MAX_ZOOM * 1.25);
      const m = winPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.s = next;
      g.tx = m.x - g.ix * next;
      g.ty = m.y - g.iy * next;
      applyZoom(false);
      return;
    }
    if (g.pointers.size !== 1) return;

    const dt = e.timeStamp - g.lastT;
    if (dt > 0) {
      g.vx = g.vx * 0.4 + ((e.clientX - g.lastX) / dt) * 0.6;
      g.vy = g.vy * 0.4 + ((e.clientY - g.lastY) / dt) * 0.6;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.lastT = e.timeStamp;
    }
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) < 8) return;
      if (g.s > 1.02) g.mode = 'pan';
      else if (Math.abs(dx) >= Math.abs(dy)) g.mode = 'swipe-x';
      else g.mode = dy > 0 ? 'swipe-y' : 'done';
    }

    if (g.mode === 'pan') {
      const b = bounds();
      g.tx = rubber(g.tx0 + dx, b.minX, 0);
      g.ty = rubber(g.ty0 + dy, b.minY, 0);
      applyZoom(false);
    } else if (g.mode === 'swipe-x' && listLen > 1) {
      applyDrag(dx, 0, false);
    } else if (g.mode === 'swipe-y') {
      applyDrag(0, Math.max(0, dy), false);
    }
  };

  const handleSingleTap = (clientX: number, clientY: number) => {
    const winRect = cardElsRef.current?.win.getBoundingClientRect();
    if (
      winRect &&
      clientX >= winRect.left &&
      clientX <= winRect.right &&
      clientY >= winRect.top &&
      clientY <= winRect.bottom
    ) {
      setChromeVisible((v) => !v);
    } else {
      closeLightbox();
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g.pointers.delete(e.pointerId)) return;
    const cancelled = e.type === 'pointercancel';

    if (g.mode === 'pinch') {
      if (g.s < 1) {
        g.s = 1;
        g.tx = 0;
        g.ty = 0;
      } else if (g.s > MAX_ZOOM) {
        const c = cardElsRef.current;
        if (c) zoomAt(c.win.clientWidth / 2, c.win.clientHeight / 2, MAX_ZOOM);
      }
      if (cardElsRef.current) {
        clampPan();
        applyZoom(true);
      }
      if (g.pointers.size === 1) {
        const [p] = [...g.pointers.values()];
        g.startX = p.x;
        g.startY = p.y;
        g.tx0 = g.tx;
        g.ty0 = g.ty;
        g.mode = g.s > 1.02 ? 'pan' : 'done';
      } else if (g.pointers.size === 0) {
        g.mode = 'idle';
      }
      return;
    }

    if (g.pointers.size > 0) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const flickX = e.timeStamp - g.lastT < 90 ? g.vx : 0;
    const flickY = e.timeStamp - g.lastT < 90 ? g.vy : 0;

    if (g.mode === 'pending' && !cancelled) {
      if (e.timeStamp - g.lastTap < 280 && Math.hypot(e.clientX - g.tapX, e.clientY - g.tapY) < 32) {
        window.clearTimeout(g.tapTimer);
        g.lastTap = 0;
        stopSlideshow();
        if (cardElsRef.current) {
          if (g.s > 1.05) {
            g.s = 1;
            g.tx = 0;
            g.ty = 0;
          } else {
            const pt = winPoint(e.clientX, e.clientY);
            zoomAt(pt.x, pt.y, 2.2);
            clampPan();
          }
          applyZoom(true);
        }
      } else {
        g.lastTap = e.timeStamp;
        g.tapX = e.clientX;
        g.tapY = e.clientY;
        const x = e.clientX;
        const y = e.clientY;
        g.tapTimer = window.setTimeout(() => handleSingleTap(x, y), 280);
      }
    } else if (g.mode === 'pan') {
      if (cardElsRef.current) {
        clampPan();
        applyZoom(true);
      }
    } else if (g.mode === 'swipe-x' && listLen > 1) {
      if (!cancelled && (dx < -52 || (flickX < -0.4 && dx < -16))) manualStep(1);
      else if (!cancelled && (dx > 52 || (flickX > 0.4 && dx > 16))) manualStep(-1);
      else applyDrag(0, 0, true);
    } else if (g.mode === 'swipe-y') {
      if (!cancelled && (dy > 95 || (flickY > 0.5 && dy > 24))) closeLightbox();
      else applyDrag(0, 0, true);
    }

    g.mode = 'idle';
  };

  /* —— 滚轮缩放与触控板横向切图 —— */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const g = gestureRef.current;
      const c = cardElsRef.current;
      if (!c) return;
      const now = performance.now();

      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) && g.s <= 1.02 && listLen > 1) {
        if (now < g.wheelLock) return;
        g.wheelX += e.deltaX;
        if (Math.abs(g.wheelX) > 60) {
          stopSlideshow();
          stepLightbox(g.wheelX > 0 ? 1 : -1);
          g.wheelX = 0;
          g.wheelLock = now + 420;
        }
        return;
      }

      stopSlideshow();
      const unit = e.deltaMode === 1 ? 32 : 1;
      const next = clampVal(g.s * Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)), 1, MAX_ZOOM);
      const r = c.win.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, next);
      clampPan();
      applyZoom(false);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(gestureRef.current.tapTimer);
    };
  }, [applyZoom, listLen, stepLightbox, stopSlideshow]);

  const onToggleSlideshow = () => {
    if (!slideshow) unlockBgmNow();
    toggleSlideshow();
  };

  const slideCustom: SlideCustom = {
    dir: dirRef.current,
    crossfadeOnly: slideshow || prefersReducedMotion,
  };

  const hasMetaText = Boolean(photo.title || photo.story || photo.place || photo.date);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="照片全屏查看"
      className="fixed inset-0 z-50 flex flex-col text-[#f3efea]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: CALM_EASE }}
    >
      {/* 沉静黑金暗房背景 */}
      <div ref={backdropRef} className="absolute inset-0 bg-[#070709]" />

      {/* 顶栏 */}
      <div
        className={`relative z-20 px-safe pt-safe transition-opacity duration-200 ${
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <header className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <div
            className="flex min-w-0 items-center gap-2.5 border border-white/[0.12] bg-[#141418]/90 px-3.5 py-2 text-[13px]"
            style={{ borderRadius: '8px' }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: palette.accent }}
              aria-hidden="true"
            />
            <span className="truncate font-serif font-medium text-[#f3efea]">
              {chapter?.title ?? '回忆'}
            </span>
            {chapter && (
              <span className="shrink-0 font-display text-[11.5px] text-[#c8b28e] tabular-nums">
                {photo.indexInChapter + 1} / {chapter.count}
              </span>
            )}
            {chapter && listLen > chapter.count && (
              <span className="hidden shrink-0 font-display text-[11.5px] text-[#a39e95] tabular-nums sm:inline">
                · {posInList + 1} / {listLen}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleButtonZoom}
              aria-label={isZoomed ? '还原照片比例' : '放大照片'}
              title={isZoomed ? '还原 1:1' : '放大细节'}
              className="inline-flex h-10 items-center gap-1.5 border border-white/[0.12] bg-[#141418]/90 px-3 text-[12.5px] text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-95"
              style={{ borderRadius: '8px' }}
            >
              {isZoomed ? (
                <>
                  <RotateCcw className="h-3.5 w-3.5 text-[#c8b28e]" aria-hidden="true" />
                  <span className="hidden sm:inline">还原</span>
                </>
              ) : (
                <>
                  <ZoomIn className="h-3.5 w-3.5 text-[#c8b28e]" aria-hidden="true" />
                  <span className="hidden sm:inline">放大</span>
                </>
              )}
            </button>

            {listLen > 1 && (
              <button
                type="button"
                onClick={onToggleSlideshow}
                aria-pressed={slideshow}
                aria-label={slideshow ? '暂停自动放映' : '开始自动放映'}
                title={slideshow ? '暂停放映（空格）' : '自动放映（空格）'}
                className={`inline-flex h-10 items-center gap-1.5 border px-3 text-[12.5px] transition-colors active:scale-95 ${
                  slideshow
                    ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                    : 'border-white/[0.12] bg-[#141418]/90 text-[#f3efea] hover:border-[#c8b28e]/60'
                }`}
                style={{ borderRadius: '8px' }}
              >
                {slideshow ? (
                  <>
                    <Pause className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                    <span>暂停</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 text-[#c8b28e]" fill="currentColor" aria-hidden="true" />
                    <span>放映</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={closeLightbox}
              aria-label="关闭大图查看"
              title="关闭（Esc）"
              className="grid h-10 w-10 place-items-center border border-white/[0.12] bg-[#141418]/90 text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-95"
              style={{ borderRadius: '8px' }}
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>
        </header>
      </div>

      {/* 中央看图舞台 */}
      <div
        ref={stageRef}
        className="relative z-10 min-h-0 flex-1"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {stage && (
          <AnimatePresence custom={slideCustom} initial={false}>
            <LightboxPhoto
              key={index}
              index={index}
              stage={stage}
              custom={slideCustom}
              register={registerCard}
            />
          </AnimatePresence>
        )}

        {/* 桌面端两侧快捷翻页按钮 */}
        {listLen > 1 && chromeVisible && (
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-4 md:flex">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => manualStep(-1)}
              aria-label="上一张"
              title="上一张（←）"
              className="pointer-events-auto grid h-11 w-11 place-items-center border border-white/[0.12] bg-black/55 text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-95"
              style={{ borderRadius: '8px' }}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => manualStep(1)}
              aria-label="下一张"
              title="下一张（→）"
              className="pointer-events-auto grid h-11 w-11 place-items-center border border-white/[0.12] bg-black/55 text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-95"
              style={{ borderRadius: '8px' }}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* 底部信息 + 35mm 胶片缩略图导览条 */}
      <div
        className={`relative z-20 px-safe pb-safe transition-opacity duration-200 ${
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <footer className="flex flex-col items-center gap-2.5 px-4 pb-3 sm:px-6">
          {hasMetaText && (
            <div className="max-w-2xl text-center">
              {photo.title && (
                <div className="font-serif text-[18px] leading-snug tracking-[0.04em] text-[#f3efea]">
                  {photo.title}
                </div>
              )}
              {photo.story && (
                <p className="mt-1 max-h-[4.8em] overflow-y-auto text-[13px] leading-relaxed text-[#a39e95]">
                  {photo.story}
                </p>
              )}
              {(photo.place || photo.date) && (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11.5px] text-[#c8b28e]">
                  {photo.place && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{photo.place}</span>
                    </span>
                  )}
                  {photo.date && <span className="font-display tabular-nums">{photo.date}</span>}
                </div>
              )}
            </div>
          )}

          {/* 胶片缩略图条（矮屏横屏时隐藏以把高度留给照片） */}
          {listLen > 1 && (
            <div className="w-full max-w-4xl short:hidden">
              <div
                ref={filmstripRef}
                className="no-scrollbar mx-auto flex w-fit max-w-full items-center gap-1.5 overflow-x-auto px-2 py-1"
              >
                {lightboxList.map((photoIdx) => {
                  const p = photos[photoIdx];
                  if (!p) return null;
                  const active = photoIdx === index;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      ref={(el) => {
                        if (el) stripBtnRefs.current.set(photoIdx, el);
                        else stripBtnRefs.current.delete(photoIdx);
                      }}
                      onClick={() => {
                        stopSlideshow();
                        jumpLightbox(photoIdx);
                      }}
                      aria-label={p.title ? `跳到照片：${p.title}` : `跳到第 ${photoIdx + 1} 张照片`}
                      aria-current={active ? 'true' : undefined}
                      className={`relative h-11 w-11 shrink-0 overflow-hidden transition-opacity duration-150 ${
                        active ? 'opacity-100 ring-2 ring-[#c8b28e]' : 'opacity-45 hover:opacity-85'
                      }`}
                      style={{ backgroundColor: p.color, borderRadius: '4px' }}
                    >
                      <img
                        src={p.thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </footer>
      </div>
    </motion.div>
  );
}
