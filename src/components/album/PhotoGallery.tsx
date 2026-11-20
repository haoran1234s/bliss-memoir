/**
 * 纯净照片画廊核心视图（原比例瀑布流网格）
 * ------------------------------------------------------------
 * 彻底去除所有单图对应的文字、编号、故事和顶部横幅文字，专注纯视觉看图体验：
 *   - 移动端双列 / 桌面端多列纯粹图片流，保留原图长宽比不裁切，轻点即刻全屏查看。
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { photos } from '../../data/library';
import { useAlbumStore } from '../../store/useAlbumStore';
import type { Photo } from '../../types';
import { getFilteredPhotos, registerPhotoThumbEl } from './albumHelpers';

const prefetchedFull = new Set<string>();
let lightboxPreloaded = false;

function getInitialColCount(): number {
  if (typeof window === 'undefined') return 2;
  const w = Math.min(window.innerWidth, 1152);
  return w >= 960 ? 4 : w >= 640 ? 3 : 2;
}

/** 悬停或触摸卡片时提前预加载高清图与灯箱代码，缩短点击打开后的等待时间 */
function prefetchFullPhoto(url: string) {
  if (!lightboxPreloaded) {
    lightboxPreloaded = true;
    void import('./PhotoLightbox');
  }
  if (prefetchedFull.has(url)) return;
  prefetchedFull.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}

/* ============================================================
   纯图原比例瀑布流（无任何文字与横幅）
   ============================================================ */
function SwissMasonryGrid({ list }: { list: Photo[] }) {
  const lastViewedIndex = useAlbumStore((s) => s.lastViewedIndex);
  const { openLightbox } = useAlbumStore.getState();

  const containerRef = useRef<HTMLDivElement>(null);
  const [colCount, setColCount] = useState(getInitialColCount);

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
              {col.map((photo, rowIdx) => {
                const isLastViewed = photo.index === lastViewedIndex;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onPointerEnter={() => prefetchFullPhoto(photo.full)}
                    onTouchStart={() => prefetchFullPhoto(photo.full)}
                    onFocus={() => prefetchFullPhoto(photo.full)}
                    onClick={() => {
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
                        ref={(el) => {
                          registerPhotoThumbEl(photo.index, el);
                          if (el && el.complete && el.naturalWidth > 0 && !('loaded' in el.dataset)) {
                            el.dataset.loaded = '';
                          }
                        }}
                        src={photo.thumb}
                        alt=""
                        loading={rowIdx < 2 ? 'eager' : 'lazy'}
                        fetchPriority={rowIdx === 0 ? 'high' : undefined}
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
  const filter = useAlbumStore((s) => s.filter);
  const currentList = useMemo(() => getFilteredPhotos(filter), [filter]);

  if (photos.length === 0 || currentList.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--ink-soft)]">
        <ImageOff className="h-8 w-8 opacity-60" aria-hidden="true" />
        <p className="text-[14px]">当前分类下暂无照片</p>
      </div>
    );
  }

  return <SwissMasonryGrid list={currentList} />;
}
