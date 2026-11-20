/**
 * iOS 相册级全屏照片检视器（基于 PhotoSwipe v5）
 * ------------------------------------------------------------
 * 核心能力：
 *   - 打开/关闭：从画廊对应缩略图 1:1 飞出放大，下拉或捏合缩小飞回原位置（自动滚动定位）；
 *   - 缩放与惯性：突破原相框的全屏无框自由缩放（双指任意锚点捏合、双击定点放大、鼠标滚轮直缩），
 *     拖拽带惯性滑行与弹簧阻尼回弹；
 *   - 横向切图：三屏跟手滑动与边界橡皮筋回弹；
 *   - 业务融合：保留极简暗房顶栏、自动放映 + BGM 联动、底部 35mm 胶片导览条、键盘快捷键与返回键逐层关闭。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PhotoSwipe, { type Bounds, type SlideData } from 'photoswipe';
import 'photoswipe/style.css';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  X,
  ZoomIn,
} from 'lucide-react';
import { photos } from '../../data/library';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore } from '../../store/useAlbumStore';
import { getPhotoThumbEl } from './albumHelpers';

const SLIDESHOW_INTERVAL_MS = 4000;

interface LightboxSession {
  id: number;
  initialIndex: number;
  list: number[];
}

interface PhotoLightboxSessionProps {
  session: LightboxSession;
  closingRequested: boolean;
  onDestroyed: (sessionId: number) => void;
}

/** 测量并确保目标缩略图滚入可视区域后返回其视口坐标 Bounds */
function resolveThumbBounds(photoIndex: number, scrollIntoViewIfNeeded: boolean): Bounds | undefined {
  const el = getPhotoThumbEl(photoIndex);
  if (!el) return undefined;

  let rect = el.getBoundingClientRect();
  if (scrollIntoViewIfNeeded && (rect.bottom < 56 || rect.top > window.innerHeight - 16)) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    rect = el.getBoundingClientRect();
  }

  if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) {
    return undefined;
  }

  return {
    x: rect.left,
    y: rect.top,
    w: rect.width,
  };
}

function PhotoLightboxSession({ session, closingRequested, onDestroyed }: PhotoLightboxSessionProps) {
  const slideshow = useAlbumStore((s) => s.slideshow);
  const { toggleSlideshow, stopSlideshow } = useAlbumStore.getState();

  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(session.initialIndex);
  const [chromeVisible, setChromeVisible] = useState<boolean>(true);
  const [interactingClose, setInteractingClose] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  const pswpRef = useRef<PhotoSwipe | null>(null);
  const hiddenThumbRef = useRef<HTMLElement | null>(null);
  const onDestroyedRef = useRef(onDestroyed);
  onDestroyedRef.current = onDestroyed;

  const filmstripRef = useRef<HTMLDivElement>(null);
  const stripBtnRefs = useRef(new Map<number, HTMLButtonElement>());
  const didInitialCenter = useRef(false);

  const listLen = Math.max(1, session.list.length);
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setHiddenThumb = useCallback((nextEl: HTMLElement | null) => {
    const prev = hiddenThumbRef.current;
    if (prev && prev !== nextEl) {
      prev.style.visibility = '';
    }
    if (nextEl) {
      nextEl.style.visibility = 'hidden';
    }
    hiddenThumbRef.current = nextEl;
  }, []);

  /* —— 初始化并挂载 PhotoSwipe v5 实例 —— */
  useEffect(() => {
    const dataSource: SlideData[] = session.list.map((photoIdx) => {
      const p = photos[photoIdx];
      return {
        src: p.full,
        msrc: p.thumb,
        width: p.w,
        height: p.h,
        alt: p.title ?? '',
        element: getPhotoThumbEl(photoIdx) ?? undefined,
      };
    });

    const startSlideIndex = Math.max(0, session.list.indexOf(session.initialIndex));
    const initialPhotoIdx = session.list[startSlideIndex] ?? session.initialIndex;

    let lastClickTime = 0;
    let lastClickX = 0;
    let lastClickY = 0;
    let clickTimer = 0;

    const pswp = new PhotoSwipe({
      dataSource,
      index: startSlideIndex,
      mainClass: 'bliss-pswp',
      showHideAnimationType: prefersReducedMotion ? 'fade' : 'zoom',
      showAnimationDuration: 320,
      hideAnimationDuration: 280,
      bgOpacity: 1,
      spacing: 0.06,
      loop: session.list.length > 1,
      pinchToClose: true,
      closeOnVerticalDrag: true,
      allowPanToNext: true,
      wheelToZoom: true,
      preload: [1, 2],
      initialZoomLevel: 'fit',
      secondaryZoomLevel: (z) => Math.max(z.fit * 2.5, 1.5),
      maxZoomLevel: (z) => Math.max(z.fit * 5, 4),
      paddingFn: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
      escKey: true,
      arrowKeys: true,
      trapFocus: false,
      returnFocus: false,
      clickToCloseNonZoomable: false,
      errorMsg: '这张照片暂时没能加载出来',
      arrowPrev: false,
      arrowNext: false,
      zoom: false,
      close: false,
      counter: false,
      preloaderDelay: 400,
      doubleTapAction: 'zoom',
      tapAction: () => {
        setChromeVisible((v) => !v);
      },
      imageClickAction: (pt) => {
        // PhotoSwipe 鼠标点击不触发 doubleTapAction，在此补充 260ms 内鼠标双击定点放大/还原
        const now = performance.now();
        if (now - lastClickTime < 260 && Math.hypot(pt.x - lastClickX, pt.y - lastClickY) < 24) {
          window.clearTimeout(clickTimer);
          clickTimer = 0;
          lastClickTime = 0;
          useAlbumStore.getState().stopSlideshow();
          pswp.currSlide?.toggleZoom(pt);
          return;
        }
        lastClickTime = now;
        lastClickX = pt.x;
        lastClickY = pt.y;
        window.clearTimeout(clickTimer);
        clickTimer = window.setTimeout(() => {
          clickTimer = 0;
          setChromeVisible((v) => !v);
        }, 260);
      },
      bgClickAction: (_pt, originalEvent) => {
        // 仅鼠标端未放大时点击黑边背景直接关闭，已放大或触屏端误触只切换控制栏显隐
        const isMouse =
          typeof PointerEvent !== 'undefined' && originalEvent instanceof PointerEvent
            ? originalEvent.pointerType === 'mouse'
            : typeof TouchEvent === 'undefined' || !(originalEvent instanceof TouchEvent);
        const slide = pswp.currSlide;
        const zoomed = Boolean(slide && slide.currZoomLevel > slide.zoomLevels.initial + 0.05);
        if (isMouse && !zoomed) {
          pswp.close();
        } else {
          setChromeVisible((v) => !v);
        }
      },
    });

    pswp.on('uiRegister', () => {
      // 禁用 PhotoSwipe 自带加载菊花元素，防止与右上角自定义栏重叠
      if (pswp.ui) {
        pswp.ui.uiElementsData = pswp.ui.uiElementsData.filter(
          (item) => item.name !== 'preloader',
        );
      }
    });

    pswp.addFilter('thumbBounds', (_bounds, _itemData, slideIndex) => {
      const targetPhotoIdx = session.list[slideIndex];
      if (targetPhotoIdx === undefined) return undefined as unknown as Bounds;
      // 刚打开时不强制滚动列表（用户刚点了可视区缩略图）；关闭时若不在可视区则滚回视野
      const needScroll = pswp.opener.isClosing;
      // 注意：若目标缩略图已被滚出/切章节不可见，必须返回 undefined 退化为渐隐关闭，
      // 避免复用 PhotoSwipe 基于 itemData.element 计算出来的视口外坐标导致飞出画面外
      return resolveThumbBounds(targetPhotoIdx, needScroll) as Bounds;
    });

    pswp.on('openingAnimationStart', () => {
      setHiddenThumb(getPhotoThumbEl(initialPhotoIdx));
    });

    pswp.on('change', () => {
      const nextPhotoIdx = session.list[pswp.currIndex];
      if (nextPhotoIdx === undefined) return;
      setActivePhotoIdx(nextPhotoIdx);
      useAlbumStore.getState().jumpLightbox(nextPhotoIdx);
      setHiddenThumb(getPhotoThumbEl(nextPhotoIdx));
      const slide = pswp.currSlide;
      setIsZoomed(Boolean(slide && slide.currZoomLevel > slide.zoomLevels.initial + 0.05));
    });

    pswp.on('zoomPanUpdate', ({ slide }) => {
      const zoomed = slide.currZoomLevel > slide.zoomLevels.initial + 0.05;
      setIsZoomed((prev) => (prev === zoomed ? prev : zoomed));
      if (zoomed && useAlbumStore.getState().slideshow) {
        useAlbumStore.getState().stopSlideshow();
      }
    });

    pswp.on('verticalDrag', ({ panY }) => {
      const slide = pswp.currSlide;
      const centerY = slide?.bounds.center.y ?? 0;
      setInteractingClose(Math.abs(panY - centerY) > 6);
    });

    pswp.on('pinchClose', ({ bgOpacity }) => {
      setInteractingClose(bgOpacity < 0.98);
    });

    pswp.on('pointerDown', () => {
      if (useAlbumStore.getState().slideshow) {
        useAlbumStore.getState().stopSlideshow();
      }
    });

    pswp.on('pointerUp', () => {
      if (!pswp.isDestroying) {
        setInteractingClose(false);
      }
    });

    pswp.on('closingAnimationStart', () => {
      setInteractingClose(true);
    });

    pswp.on('destroy', () => {
      window.clearTimeout(clickTimer);
      setHiddenThumb(null);
      if (pswpRef.current === pswp) {
        pswpRef.current = null;
      }
      const st = useAlbumStore.getState();
      if (st.lightboxIndex !== null) {
        st.closeLightbox();
      }
      onDestroyedRef.current(session.id);
    });

    pswpRef.current = pswp;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    pswp.init();

    return () => {
      window.clearTimeout(clickTimer);
      setHiddenThumb(null);
      if (pswpRef.current === pswp) {
        pswpRef.current = null;
      }
      // React 卸载前若实例仍未销毁，静默销毁避免残留节点
      if (!pswp.isDestroying) {
        pswp.options.showHideAnimationType = 'none';
        pswp.destroy();
      }
    };
  }, [prefersReducedMotion, session, setHiddenThumb]);

  /* —— 响应外部关闭请求（如手机返回键）：先播放完整缩回原图动画 —— */
  useEffect(() => {
    if (closingRequested) {
      pswpRef.current?.close();
    }
  }, [closingRequested]);

  /* —— 自动放映定时器 —— */
  useEffect(() => {
    if (!slideshow || closingRequested || listLen <= 1) return;
    const timer = window.setInterval(() => {
      pswpRef.current?.next();
    }, SLIDESHOW_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [slideshow, closingRequested, listLen]);

  /* —— 键盘快捷键补充：空格切换放映、上下方向键切图 —— */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      const pswp = pswpRef.current;
      if (!pswp || pswp.isDestroying) return;

      if (e.key === ' ') {
        if (tag === 'BUTTON') return;
        e.preventDefault();
        if (!useAlbumStore.getState().slideshow) unlockBgmNow();
        useAlbumStore.getState().toggleSlideshow();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (useAlbumStore.getState().slideshow) {
          useAlbumStore.getState().stopSlideshow();
        }
      } else if (e.key === 'ArrowDown' && listLen > 1) {
        e.preventDefault();
        useAlbumStore.getState().stopSlideshow();
        pswp.next();
      } else if (e.key === 'ArrowUp' && listLen > 1) {
        e.preventDefault();
        useAlbumStore.getState().stopSlideshow();
        pswp.prev();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [listLen]);

  /* —— 底部胶片缩略图条自动居中 —— */
  useEffect(() => {
    const strip = filmstripRef.current;
    const activeBtn = stripBtnRefs.current.get(activePhotoIdx);
    if (!strip || !activeBtn) return;
    const targetLeft = activeBtn.offsetLeft - (strip.clientWidth - activeBtn.offsetWidth) / 2;
    strip.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: !didInitialCenter.current || prefersReducedMotion ? 'auto' : 'smooth',
    });
    didInitialCenter.current = true;
  }, [activePhotoIdx, prefersReducedMotion]);

  const toggleButtonZoom = () => {
    const pswp = pswpRef.current;
    const slide = pswp?.currSlide;
    if (!pswp || !slide) return;
    stopSlideshow();
    const center = pswp.getViewportCenterPoint();
    const targetZoom =
      slide.currZoomLevel > slide.zoomLevels.initial + 0.05
        ? slide.zoomLevels.initial
        : slide.zoomLevels.secondary;
    pswp.zoomTo(targetZoom, center, 260);
  };

  const manualStep = (delta: number) => {
    const pswp = pswpRef.current;
    if (!pswp) return;
    stopSlideshow();
    if (delta > 0) pswp.next();
    else pswp.prev();
  };

  const onToggleSlideshow = () => {
    if (!slideshow) unlockBgmNow();
    toggleSlideshow();
  };

  const showUi = chromeVisible && !interactingClose && !closingRequested;

  const overlay = (
    <div
      role="presentation"
      className="pointer-events-none fixed inset-0 z-[60] flex flex-col justify-between text-[#f3efea]"
    >
      {/* 极简纯图标顶栏 */}
      <div
        className={`relative px-safe pt-safe transition-opacity duration-200 ${
          showUi ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <header className="flex items-center justify-end gap-2 px-4 pt-3 sm:px-6">
          <button
            type="button"
            onClick={toggleButtonZoom}
            aria-label={isZoomed ? '还原照片比例' : '放大照片'}
            className={`grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/65 active:scale-95 ${
              showUi ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {isZoomed ? (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {listLen > 1 && (
            <button
              type="button"
              onClick={onToggleSlideshow}
              aria-pressed={slideshow}
              aria-label={slideshow ? '暂停自动放映' : '开始自动放映'}
              className={`grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md transition-colors active:scale-95 ${
                slideshow
                  ? 'border-white bg-white text-zinc-950'
                  : 'border-white/10 bg-black/45 text-white hover:bg-black/65'
              } ${showUi ? 'pointer-events-auto' : 'pointer-events-none'}`}
            >
              {slideshow ? (
                <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => pswpRef.current?.close()}
            aria-label="关闭大图查看"
            className={`grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/65 active:scale-95 ${
              showUi ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </header>
      </div>

      {/* 桌面端两侧快捷翻页按钮 */}
      {listLen > 1 && (
        <div
          className={`pointer-events-none fixed inset-y-0 left-0 right-0 hidden items-center justify-between px-4 transition-opacity duration-200 md:flex ${
            showUi ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            type="button"
            onClick={() => manualStep(-1)}
            aria-label="上一张"
            title="上一张（←）"
            className={`grid h-11 w-11 place-items-center border border-white/[0.12] bg-black/55 text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-95 ${
              showUi ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{ borderRadius: '8px' }}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => manualStep(1)}
            aria-label="下一张"
            title="下一张（→）"
            className={`grid h-11 w-11 place-items-center border border-white/[0.12] bg-black/55 text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-95 ${
              showUi ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{ borderRadius: '8px' }}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 底部 35mm 缩略图导览条（无单图文字说明） */}
      <div
        className={`relative bg-gradient-to-t from-black/70 via-black/30 to-transparent px-safe pb-safe transition-opacity duration-200 ${
          showUi ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <footer className="flex flex-col items-center px-4 pb-3 pt-4 sm:px-6">
          {listLen > 1 && (
            <div className="w-full max-w-4xl short:hidden">
              <div
                ref={filmstripRef}
                className={`no-scrollbar mx-auto flex w-fit max-w-full items-center gap-1.5 overflow-x-auto px-2 py-1 ${
                  showUi ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                {session.list.map((photoIdx) => {
                  const p = photos[photoIdx];
                  if (!p) return null;
                  const active = photoIdx === activePhotoIdx;
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
                        const targetSlideIdx = session.list.indexOf(photoIdx);
                        if (targetSlideIdx >= 0) pswpRef.current?.goTo(targetSlideIdx);
                      }}
                      aria-label={p.title ? `跳到照片：${p.title}` : `跳到第 ${photoIdx + 1} 张照片`}
                      aria-current={active ? 'true' : undefined}
                      className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-md transition-opacity duration-150 ${
                        active ? 'opacity-100 ring-2 ring-white' : 'opacity-45 hover:opacity-85'
                      }`}
                      style={{ backgroundColor: p.color }}
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
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : null;
}

export function PhotoLightbox() {
  const lightboxIndex = useAlbumStore((s) => s.lightboxIndex);
  const lightboxList = useAlbumStore((s) => s.lightboxList);

  const [session, setSession] = useState<LightboxSession | null>(null);
  const nextSessionIdRef = useRef(1);

  useEffect(() => {
    if (lightboxIndex !== null && !session) {
      setSession({
        id: nextSessionIdRef.current++,
        initialIndex: lightboxIndex,
        list: lightboxList.length > 0 ? [...lightboxList] : [lightboxIndex],
      });
    }
  }, [lightboxIndex, lightboxList, session]);

  const handleDestroyed = useCallback((destroyedId: number) => {
    setSession((prev) => (prev?.id === destroyedId ? null : prev));
  }, []);

  if (!session) return null;

  return (
    <PhotoLightboxSession
      key={session.id}
      session={session}
      closingRequested={lightboxIndex === null}
      onDestroyed={handleDestroyed}
    />
  );
}
