/**
 * 看大图
 * ------------------------------------------------------------
 * 点 3D 里的照片卡（或相册里的缩略图）后，照片从它原来的位置「长」到屏幕中央，
 * 变成一张大拍立得：
 *   - 先显示缩略图，高清图加载完成后无缝换上；
 *   - 双指捏合 / 双击 / 滚轮缩放，放大后单指拖动看细节；
 *   - 没放大时左右滑切换上一张 / 下一张，往下拉关闭；轻点照片隐藏 / 显示文字，点空白处关闭；
 *   - 键盘 ← → 切换、Esc 关闭（在 App.tsx 里统一处理）。
 * 背后的 3D 镜头同步走到这张照片所在的架子，关掉后正好站在它面前。
 *
 * 拖动和缩放直接改 DOM 的 transform，不经过 React 状态，手指跟手不掉帧。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import type { MotionProps } from 'framer-motion';
import { ChevronLeft, ChevronRight, ImageOff, MapPin, X } from 'lucide-react';
import { chapters, photos } from '../../data/library';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useStore, type Rect } from '../../store/useStore';
import { paletteOf } from '../../theme/palettes';
import { clamp } from '../../three/cameraInput';
import { ordinal } from './NavBar';

const tier = getDeviceTier();

/** 相纸白边（左右上）的宽度（px） */
const BORDER = 12;
const MAX_ZOOM = 5;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

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

function cardLayout(stage: StageBox, aspect: number) {
  // 下边写字的区域：横屏手机上收窄一点，把高度让给照片
  const bottom = stage.h < 440 ? 40 : 54;
  const availW = Math.max(160, stage.w - 28);
  const availH = Math.max(160, stage.h - 24);
  const pw = Math.max(100, Math.min(availW - BORDER * 2, (availH - BORDER - bottom) * aspect));
  const ph = pw / aspect;
  return { pw, ph, bottom, w: pw + BORDER * 2, h: ph + BORDER + bottom };
}

interface SlideCustom {
  dir: number;
  width: number;
}

const slide = {
  enter: (c: SlideCustom) => ({ x: c.dir * c.width * 0.55, y: 0, opacity: 0, scale: 0.92, rotate: c.dir * 5 }),
  center: { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 },
  exit: (c: SlideCustom) => ({
    x: -c.dir * c.width * 0.55,
    opacity: 0,
    scale: 0.92,
    rotate: -c.dir * 5,
    transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] },
  }),
};

/* ------------------------------------------------------------------ */
/*  一张拍立得                                                         */
/* ------------------------------------------------------------------ */
interface CardProps {
  index: number;
  stage: StageBox;
  custom: SlideCustom;
  /** 打开检视层时的第一张 */
  first: boolean;
  /** 从屏幕上哪个矩形放大出来（只有第一张可能有） */
  intro: Rect | null;
  register: (els: CardEls | null, index: number) => void;
}

function Card({ index, stage, custom, first, intro, register }: CardProps) {
  const photo = photos[index];
  const chapter = chapters[photo.chapter];
  const palette = paletteOf(chapter.palette, chapter.index);
  const { pw, ph, bottom, w, h } = cardLayout(stage, photo.aspect);

  const drag = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const [thumbOk, setThumbOk] = useState(true);
  const [full, setFull] = useState<'loading' | 'ready' | 'failed'>('loading');

  // 快速来回切换时，正在退场的卡片可能又被「请回来」，所以按在场状态注册
  const present = useIsPresent();
  useEffect(() => {
    if (!present) return;
    register({ index, drag: drag.current!, zoom: zoom.current!, win: win.current! }, index);
    return () => register(null, index);
  }, [index, present, register]);

  // 第一张：从被点的那张卡片的位置放大过来；没有来源位置就轻轻弹出
  let initial: MotionProps['initial'] = 'enter';
  if (first && intro) {
    const s = clamp((intro.w / pw + intro.h / ph) / 2, 0.05, 1);
    const cx = stage.left + stage.w / 2;
    const cy = stage.top + stage.h / 2;
    const offsetY = (BORDER - bottom) / 2;
    initial = {
      x: intro.x + intro.w / 2 - cx,
      y: intro.y + intro.h / 2 - cy - s * offsetY,
      scale: s,
      opacity: 1,
      rotate: 0,
    };
  } else if (first) {
    initial = { x: 0, y: 26, scale: 0.9, opacity: 0, rotate: 0 };
  }

  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2 }}
      custom={custom}
      variants={slide}
      initial={initial}
      animate="center"
      exit="exit"
      transition={first ? { type: 'spring', stiffness: 230, damping: 27 } : { duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div ref={drag} className="h-full w-full will-change-transform" data-card="">
        <div
          className="relative h-full w-full rounded-[6px] bg-[#fffdf8] shadow-print"
          style={{ padding: `${BORDER}px ${BORDER}px 0` }}
        >
          {/* 和纸胶带 */}
          <div
            className="absolute left-1/2 top-0 h-[22px] w-[92px] -translate-x-1/2 -translate-y-1/2 -rotate-3 rounded-[3px] opacity-85"
            style={{
              background: `repeating-linear-gradient(135deg, ${palette.soft} 0 8px, ${palette.balloons[0]}55 8px 16px)`,
              boxShadow: '0 1px 3px rgba(58,51,85,0.12)',
            }}
          />
          <div
            ref={win}
            className="relative overflow-hidden rounded-[2px]"
            style={{ width: pw, height: ph, background: photo.color }}
          >
            <div ref={zoom} className="absolute inset-0 origin-top-left will-change-transform">
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
              {full !== 'failed' && (
                <img
                  src={photo.full}
                  alt={photo.title ?? chapter.title}
                  draggable={false}
                  decoding="async"
                  onLoad={() => setFull('ready')}
                  onError={() => setFull('failed')}
                  className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                  style={{ opacity: full === 'ready' ? 1 : 0 }}
                />
              )}
            </div>
            {!thumbOk && full === 'failed' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper/60 text-ink-soft">
                <ImageOff className="h-8 w-8" />
                <span className="text-[13px]">这张照片暂时没能加载出来</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 px-1" style={{ height: bottom }}>
            <span className="truncate font-fun text-[18px] text-ink short:text-[16px]">{photo.title ?? chapter.title}</span>
            {photo.date && (
              <span className="shrink-0 font-display text-[13px] font-medium tracking-wider text-ink-soft">
                {photo.date}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  检视层                                                             */
/* ------------------------------------------------------------------ */
export function PhotoDetail() {
  const detail = useStore((s) => s.detail);
  const from = useStore((s) => s.detailFrom);

  // 关闭动画期间 detail 已经是 null，继续显示最后那张
  const kept = useRef(detail ?? 0);
  if (detail !== null) kept.current = detail;
  const index = kept.current;
  const photo = photos[index];
  const chapter = chapters[photo.chapter];
  const palette = paletteOf(chapter.palette, chapter.index);

  // 切换方向由序号变化推断：键盘、按钮、滑动都一样
  const prevIndex = useRef(index);
  const dir = useRef(0);
  if (prevIndex.current !== index) {
    const n = photos.length;
    const d = (index - prevIndex.current + n) % n;
    dir.current = d <= n / 2 ? 1 : -1;
    prevIndex.current = index;
  }

  const introUsed = useRef(false);
  const [chrome, setChrome] = useState(true);

  /* —— 舞台尺寸 —— */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<StageBox | null>(null);
  useLayoutEffect(() => {
    const el = stageRef.current!;
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

  /* —— 预载前后几张 —— */
  useEffect(() => {
    const n = photos.length;
    const keep: HTMLImageElement[] = [];
    for (const d of [1, -1, 2]) {
      const p = photos[(index + d + n) % n];
      const img = new Image();
      img.decoding = 'async';
      img.src = Math.abs(d) === 1 ? p.full : p.thumb;
      keep.push(img);
    }
    return () => keep.forEach((img) => (img.src = ''));
  }, [index]);

  /* —— 手势 —— */
  const els = useRef<CardEls | null>(null);
  const veil = useRef<HTMLDivElement>(null);
  const g = useRef({
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

  const register = useCallback((next: CardEls | null, i: number) => {
    if (next) {
      els.current = next;
      const s = g.current;
      s.s = 1;
      s.tx = 0;
      s.ty = 0;
      next.zoom.style.transform = '';
      next.drag.style.transform = '';
      introUsed.current = true;
    } else if (els.current?.index === i) {
      els.current = null;
    }
  }, []);

  const applyZoom = (animate: boolean) => {
    const e = els.current;
    if (!e) return;
    const s = g.current;
    e.zoom.style.transition = animate ? `transform 0.32s ${EASE}` : 'none';
    e.zoom.style.transform = `translate3d(${s.tx}px, ${s.ty}px, 0) scale(${s.s})`;
  };

  const applyDrag = (x: number, y: number, animate: boolean) => {
    const e = els.current;
    if (!e) return;
    const k = 1 - clamp(y / 1400, 0, 0.22);
    e.drag.style.transition = animate ? `transform 0.36s ${EASE}` : 'none';
    e.drag.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${x * 0.014}deg) scale(${k})`;
    if (veil.current) {
      veil.current.style.transition = animate ? `opacity 0.36s ${EASE}` : 'none';
      veil.current.style.opacity = String(1 - clamp(y / 520, 0, 0.6));
    }
  };

  const bounds = () => {
    const e = els.current!;
    const s = g.current;
    return { minX: e.win.clientWidth * (1 - s.s), minY: e.win.clientHeight * (1 - s.s) };
  };
  const clampPan = () => {
    const s = g.current;
    const b = bounds();
    s.tx = clamp(s.tx, b.minX, 0);
    s.ty = clamp(s.ty, b.minY, 0);
  };
  const rubber = (v: number, min: number, max: number) =>
    v < min ? min - (min - v) * 0.35 : v > max ? max + (v - max) * 0.35 : v;
  /** 以照片窗口里的 (px, py) 为中心缩放到 next 倍 */
  const zoomAt = (px: number, py: number, next: number) => {
    const s = g.current;
    const ix = (px - s.tx) / s.s;
    const iy = (py - s.ty) / s.s;
    s.s = next;
    s.tx = px - ix * next;
    s.ty = py - iy * next;
  };
  const winPoint = (x: number, y: number) => {
    const r = els.current!.win.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  };

  const close = () => useStore.getState().closePhoto();
  const go = (delta: number) => useStore.getState().stepPhoto(delta);

  const pinchStart = () => {
    const s = g.current;
    const [a, b] = [...s.pointers.values()];
    s.d0 = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    s.s0 = s.s;
    const m = winPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    s.ix = (m.x - s.tx) / s.s;
    s.iy = (m.y - s.ty) / s.s;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const s = g.current;
    if (!els.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pointers.size === 1) {
      s.mode = 'pending';
      s.startX = s.lastX = e.clientX;
      s.startY = s.lastY = e.clientY;
      s.lastT = e.timeStamp;
      s.vx = s.vy = 0;
      s.tx0 = s.tx;
      s.ty0 = s.ty;
    } else if (s.pointers.size === 2) {
      if (s.mode === 'swipe-x' || s.mode === 'swipe-y') applyDrag(0, 0, true);
      s.mode = 'pinch';
      pinchStart();
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s.pointers.has(e.pointerId) || !els.current) return;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (s.mode === 'pinch' && s.pointers.size >= 2) {
      const [a, b] = [...s.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clamp((s.s0 * d) / s.d0, 0.7, MAX_ZOOM * 1.3);
      const m = winPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      s.s = next;
      s.tx = m.x - s.ix * next;
      s.ty = m.y - s.iy * next;
      applyZoom(false);
      return;
    }
    if (s.pointers.size !== 1) return;

    const dt = e.timeStamp - s.lastT;
    if (dt > 0) {
      s.vx = s.vx * 0.4 + ((e.clientX - s.lastX) / dt) * 0.6;
      s.vy = s.vy * 0.4 + ((e.clientY - s.lastY) / dt) * 0.6;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.lastT = e.timeStamp;
    }
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (s.mode === 'pending') {
      if (Math.hypot(dx, dy) < 8) return;
      if (s.s > 1.02) s.mode = 'pan';
      else if (Math.abs(dx) >= Math.abs(dy)) s.mode = 'swipe-x';
      else s.mode = dy > 0 ? 'swipe-y' : 'done';
    }
    if (s.mode === 'pan') {
      const b = bounds();
      s.tx = rubber(s.tx0 + dx, b.minX, 0);
      s.ty = rubber(s.ty0 + dy, b.minY, 0);
      applyZoom(false);
    } else if (s.mode === 'swipe-x') {
      applyDrag(dx, 0, false);
    } else if (s.mode === 'swipe-y') {
      applyDrag(dx * 0.35, Math.max(0, dy), false);
    }
  };

  const singleTap = (x: number, y: number) => {
    const card = els.current?.drag.getBoundingClientRect();
    if (card && x >= card.left && x <= card.right && y >= card.top && y <= card.bottom) setChrome((c) => !c);
    else close();
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s.pointers.delete(e.pointerId)) return;
    const cancelled = e.type === 'pointercancel';

    if (s.mode === 'pinch') {
      if (s.s < 1) {
        s.s = 1;
        s.tx = 0;
        s.ty = 0;
      } else if (s.s > MAX_ZOOM) {
        const e2 = els.current;
        if (e2) zoomAt(e2.win.clientWidth / 2, e2.win.clientHeight / 2, MAX_ZOOM);
      }
      if (els.current) {
        clampPan();
        applyZoom(true);
      }
      if (s.pointers.size === 1) {
        // 松开一根手指：剩下那根接着拖
        const [p] = [...s.pointers.values()];
        s.startX = p.x;
        s.startY = p.y;
        s.tx0 = s.tx;
        s.ty0 = s.ty;
        s.mode = s.s > 1.02 ? 'pan' : 'done';
      } else if (s.pointers.size === 0) {
        s.mode = 'idle';
      }
      return;
    }
    if (s.pointers.size > 0) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const flickX = e.timeStamp - s.lastT < 90 ? s.vx : 0;
    const flickY = e.timeStamp - s.lastT < 90 ? s.vy : 0;

    if (s.mode === 'pending' && !cancelled) {
      // 轻点：双击缩放，单击隐藏文字 / 关闭
      if (e.timeStamp - s.lastTap < 300 && Math.hypot(e.clientX - s.tapX, e.clientY - s.tapY) < 32) {
        window.clearTimeout(s.tapTimer);
        s.lastTap = 0;
        if (els.current) {
          if (s.s > 1.05) {
            s.s = 1;
            s.tx = 0;
            s.ty = 0;
          } else {
            const p = winPoint(e.clientX, e.clientY);
            zoomAt(p.x, p.y, 2.6);
            clampPan();
          }
          applyZoom(true);
        }
      } else {
        s.lastTap = e.timeStamp;
        s.tapX = e.clientX;
        s.tapY = e.clientY;
        const x = e.clientX;
        const y = e.clientY;
        s.tapTimer = window.setTimeout(() => singleTap(x, y), 300);
      }
    } else if (s.mode === 'pan') {
      if (els.current) {
        clampPan();
        applyZoom(true);
      }
    } else if (s.mode === 'swipe-x') {
      if (!cancelled && (dx < -70 || (flickX < -0.45 && dx < -16))) go(1);
      else if (!cancelled && (dx > 70 || (flickX > 0.45 && dx > 16))) go(-1);
      else applyDrag(0, 0, true);
    } else if (s.mode === 'swipe-y') {
      if (!cancelled && (dy > 110 || (flickY > 0.55 && dy > 24))) close();
      else applyDrag(0, 0, true);
    }
    s.mode = 'idle';
  };

  /* —— 滚轮缩放 / 触控板左右滑切换 —— */
  useEffect(() => {
    const el = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = g.current;
      const c = els.current;
      if (!c) return;
      const now = performance.now();
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) && s.s <= 1.02) {
        if (now < s.wheelLock) return;
        s.wheelX += e.deltaX;
        if (Math.abs(s.wheelX) > 60) {
          useStore.getState().stepPhoto(s.wheelX > 0 ? 1 : -1);
          s.wheelX = 0;
          s.wheelLock = now + 450;
        }
        return;
      }
      const unit = e.deltaMode === 1 ? 32 : 1;
      const next = clamp(s.s * Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)), 1, MAX_ZOOM);
      const r = c.win.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, next);
      clampPan();
      applyZoom(false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(g.current.tapTimer);
    };
  }, []);

  const custom: SlideCustom = { dir: dir.current, width: stage?.w ?? 400 };
  const place = photo.place;
  const n = photos.length;

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col"
      exit={{ opacity: 0, transition: { duration: 0.24 } }}
    >
      {/* 背景：奶油色磨砂 + 章节颜色的柔光 */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div ref={veil} className="veil absolute inset-0">
          <div
            className="absolute inset-0 transition-[background] duration-500"
            style={{ background: `radial-gradient(120% 70% at 50% 35%, ${palette.soft}cc 0%, transparent 70%)` }}
          />
        </div>
      </motion.div>

      {/* 顶栏（横屏手机上浮在照片上方，不占高度） */}
      <motion.div
        className="relative z-10 px-safe pt-safe short:absolute short:inset-x-0 short:top-0"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: chrome ? 1 : 0, y: chrome ? 0 : -10 }}
        transition={{ duration: 0.25 }}
        style={{ pointerEvents: chrome ? 'auto' : 'none' }}
      >
        <div className="flex items-center justify-between gap-3 px-3 pt-3">
          <div className="glass flex h-11 min-w-0 items-center gap-2 rounded-full pl-3 pr-4">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: palette.accent }} />
            <span className="truncate font-fun text-[15px]">
              {ordinal(chapter.index)} · {chapter.title}
            </span>
            <span className="shrink-0 font-display text-[12px] font-medium text-ink-soft tabular-nums">
              {photo.indexInChapter + 1}/{chapter.count}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            title="关闭（Esc）"
            className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </motion.div>

      {/* 照片 */}
      <div
        ref={stageRef}
        className="relative z-0 min-h-0 flex-1"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {stage && (
          <AnimatePresence custom={custom}>
            <Card
              key={index}
              index={index}
              stage={stage}
              custom={custom}
              first={!introUsed.current}
              intro={!introUsed.current ? from : null}
              register={register}
            />
          </AnimatePresence>
        )}
      </div>

      {/* 横屏手机：底栏收起，翻页按钮挪到两侧 */}
      <motion.div
        className="pointer-events-none absolute inset-y-0 left-0 right-0 z-10 hidden items-center justify-between px-safe short:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: chrome ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      >
        {[-1, 1].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => go(d)}
            aria-label={d < 0 ? '上一张' : '下一张'}
            className={`glass mx-3 grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90 ${
              chrome ? 'pointer-events-auto' : ''
            }`}
          >
            {d < 0 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        ))}
      </motion.div>

      {/* 底部：小故事 + 翻页 */}
      <motion.div
        className="relative z-10 px-safe pb-safe short:hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: chrome ? 1 : 0, y: chrome ? 0 : 10 }}
        transition={{ duration: 0.25 }}
        style={{ pointerEvents: chrome ? 'auto' : 'none' }}
      >
        <div className="mx-auto flex h-[118px] max-w-xl items-center gap-3 px-3 pb-3">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="上一张"
            title="上一张（←）"
            className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="w-full"
              >
                {photo.story ? (
                  <p className="line-clamp-3 text-[14px] leading-relaxed text-ink">{photo.story}</p>
                ) : (
                  <p className="text-[12.5px] text-ink-soft">
                    {tier.isTouch ? '左右滑动切换 · 双击放大 · 下拉关闭' : '← → 切换 · 滚轮缩放 · Esc 关闭'}
                  </p>
                )}
                {place && (
                  <p className="mt-1 flex items-center justify-center gap-1 text-[12px] text-ink-soft">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{place}</span>
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="mt-1.5 font-display text-[12px] font-medium tabular-nums text-ink-soft/80">
              {index + 1} / {n}
            </div>
          </div>

          <button
            type="button"
            onClick={() => go(1)}
            aria-label="下一张"
            title="下一张（→）"
            className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
