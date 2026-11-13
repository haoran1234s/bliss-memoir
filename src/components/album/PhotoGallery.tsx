/**
 * 无眩晕照片画廊
 * ------------------------------------------------------------
 * 提供三种直达的浏览方式：
 *   1. 原比例等高画廊（Justified）：保留每张横图/竖图原始构图，端正排布；
 *   2. 紧凑方格速览（Grid）：一屏容纳更多缩略图，快速定位；
 *   3. 故事手记专题（Stories）：图文并茂集中展示带文字记忆的照片。
 * 严格禁止对 <img> 做 hover 缩放、旋转或位移动画。
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { BookOpen, Calendar, ImageOff, MapPin } from 'lucide-react';
import { chapters, photos } from '../../data/library';
import { useAlbumStore } from '../../store/useAlbumStore';
import { paletteOf } from '../../theme/palettes';
import type { Photo } from '../../types';
import {
  ALL_PHOTO_INDICES,
  STORY_PHOTOS,
  accessiblePillColor,
  chapterPillColor,
} from './albumHelpers';

interface JustifiedItem {
  photo: Photo;
  width: number;
  height: number;
}

interface JustifiedRow {
  items: JustifiedItem[];
  height: number;
}

/**
 * 纯函数：把照片列表按原比例排成等高画廊行，最后一行保持自然左对齐不强行拉伸。
 */
function buildJustifiedRows(
  list: Photo[],
  containerWidth: number,
  targetHeight: number,
  gap: number,
): JustifiedRow[] {
  if (containerWidth <= 0 || list.length === 0) return [];

  const rows: JustifiedRow[] = [];
  let bucket: Photo[] = [];
  let sumAspect = 0;

  const isNarrow = containerWidth < 500;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    bucket.push(p);
    sumAspect += p.aspect;

    const totalGap = gap * (bucket.length - 1);
    const estWidth = sumAspect * targetHeight + totalGap;
    const minPerRow = isNarrow && p.aspect < 2.1 && list.length - (i - bucket.length + 1) > 1 ? 2 : 1;

    if (estWidth >= containerWidth && bucket.length >= minPerRow) {
      const rowHeight = Math.max(88, (containerWidth - totalGap) / sumAspect);
      rows.push({
        height: rowHeight,
        items: bucket.map((item) => ({
          photo: item,
          width: rowHeight * item.aspect,
          height: rowHeight,
        })),
      });
      bucket = [];
      sumAspect = 0;
    }
  }

  if (bucket.length > 0) {
    const totalGap = gap * (bucket.length - 1);
    const naturalHeight = (containerWidth - totalGap) / sumAspect;
    const rowHeight = Math.min(targetHeight, naturalHeight);
    rows.push({
      height: rowHeight,
      items: bucket.map((item) => ({
        photo: item,
        width: rowHeight * item.aspect,
        height: rowHeight,
      })),
    });
  }

  return rows;
}

const onImgLoad = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.dataset.loaded = '';
};

const onImgError = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = 'hidden';
};

export function PhotoGallery() {
  const filter = useAlbumStore((s) => s.filter);
  const layoutMode = useAlbumStore((s) => s.layoutMode);
  const lastViewedIndex = useAlbumStore((s) => s.lastViewedIndex);
  const openLightbox = useAlbumStore((s) => s.openLightbox);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const next = el.clientWidth;
      setContainerWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 根据视口宽度动态决定目标行高与间隙
  const targetHeight = containerWidth < 500 ? 168 : containerWidth < 840 ? 220 : 265;
  const gap = containerWidth < 500 ? 8 : 12;

  // 当前需要展示的章节列表（'all' 展示全部章节，数字只展示单章）
  const visibleChapters = useMemo(() => {
    if (typeof filter === 'number') {
      const ch = chapters[filter];
      return ch ? [ch] : chapters;
    }
    return chapters;
  }, [filter]);

  // 故事手记视图
  if (filter === 'stories') {
    const storyIndices = STORY_PHOTOS.map((p) => p.index);
    return (
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-fun text-[24px] text-[#1e1b2e] sm:text-[28px]">故事手记</h2>
            <p className="mt-1 text-[14px] text-[#494361]">记录下文字与心情的珍贵瞬间</p>
          </div>
          <span className="rounded-full bg-[#1e1b2e]/[0.06] px-3 py-1 font-display text-[12.5px] font-medium text-[#494361] tabular-nums">
            共 {STORY_PHOTOS.length} 篇
          </span>
        </div>

        {STORY_PHOTOS.length === 0 ? (
          <div className="rounded-2xl border border-[#1e1b2e]/10 bg-white px-6 py-12 text-center text-[14.5px] text-[#494361]">
            还没有填写照片故事，可以在 `src/data/memoirData.ts` 的 `notes` 中补充。
          </div>
        ) : (
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}
          >
            {STORY_PHOTOS.map((photo) => {
              const ch = chapters[photo.chapter];
              const accent = paletteOf(ch?.palette, photo.chapter).accent;
              const isLastViewed = photo.index === lastViewedIndex;
              return (
                <article
                  key={photo.id}
                  className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md ${
                    isLastViewed ? 'border-[#e04f65] ring-2 ring-[#e04f65]/25' : 'border-[#1e1b2e]/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openLightbox(photo.index, storyIndices, false)}
                    aria-label={photo.title ? `查看照片：${photo.title}` : `查看第 ${photo.index + 1} 张照片`}
                    className="relative w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e1b2e]"
                    style={{
                      aspectRatio: `${photo.w} / ${photo.h}`,
                      maxHeight: '360px',
                      backgroundColor: photo.color,
                    }}
                  >
                    <img
                      src={photo.full}
                      alt={photo.title ?? ''}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onLoad={onImgLoad}
                      onError={onImgError}
                      className="fade-img h-full w-full object-cover"
                    />
                  </button>
                  <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center gap-2 text-[12px] font-medium text-[#494361]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: accent }}
                          aria-hidden="true"
                        />
                        <span>{ch?.title ?? ''}</span>
                      </div>
                      {photo.title && (
                        <h3 className="mt-1.5 font-fun text-[19px] leading-snug text-[#1e1b2e]">{photo.title}</h3>
                      )}
                      {photo.story && (
                        <p className="mt-1.5 text-[14px] leading-relaxed text-[#494361]">{photo.story}</p>
                      )}
                    </div>
                    {(photo.place || photo.date) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#1e1b2e]/[0.06] pt-2.5 text-[12.5px] text-[#494361]">
                        {photo.place && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{photo.place}</span>
                          </span>
                        )}
                        {photo.date && (
                          <span className="inline-flex items-center gap-1 font-display tabular-nums">
                            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{photo.date}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div ref={containerRef} className="w-full space-y-12 sm:space-y-16">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#1e1b2e]/10 bg-white px-6 py-16 text-center text-[#494361]">
            <ImageOff className="h-8 w-8 opacity-60" aria-hidden="true" />
            <p className="text-[15px]">还没有照片，请把照片放入 `photos/` 并运行 `npm run photos`。</p>
          </div>
        ) : (
          visibleChapters.map((ch) => {
            const chapterPhotos = photos.slice(ch.start, ch.start + ch.count);
            const chapterIndices =
              typeof filter === 'number' ? chapterPhotos.map((p) => p.index) : ALL_PHOTO_INDICES;
            const palette = paletteOf(ch.palette, ch.index);
            const pillBg = chapterPillColor(ch.index);
            const ringColor = accessiblePillColor(palette.accent);
            const rows =
              layoutMode === 'justified'
                ? buildJustifiedRows(chapterPhotos, containerWidth, targetHeight, gap)
                : [];

            return (
              <div key={ch.index} id={`chapter-${ch.index}`}>
                {/* 章节标题区 */}
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#1e1b2e]/[0.08] pb-3 sm:mb-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: palette.accent }}
                        aria-hidden="true"
                      />
                      <h2 className="font-fun text-[22px] leading-tight text-[#1e1b2e] sm:text-[26px]">
                        {ch.title}
                      </h2>
                    </div>
                    {ch.subtitle && (
                      <p className="mt-1 max-w-[65ch] text-[14px] text-[#494361]">{ch.subtitle}</p>
                    )}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-3 py-1 font-display text-[12px] font-medium text-white tabular-nums"
                    style={{ backgroundColor: pillBg }}
                  >
                    {ch.count} 张
                  </span>
                </div>

                {/* 排版 A：原比例等高画廊 */}
                {layoutMode === 'justified' ? (
                  <div className="flex flex-col" style={{ gap: `${gap}px` }}>
                    {rows.map((row, rowIdx) => (
                      <div key={rowIdx} className="flex" style={{ gap: `${gap}px`, height: `${row.height}px` }}>
                        {row.items.map(({ photo, width, height }) => {
                          const hasNote = Boolean(photo.title ?? photo.story);
                          const isLastViewed = photo.index === lastViewedIndex;
                          const caption = photo.title ?? photo.story ?? '';
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => openLightbox(photo.index, chapterIndices, false)}
                              aria-label={
                                photo.title
                                  ? `查看大图：${photo.title}`
                                  : `查看 ${ch.title} 第 ${photo.indexInChapter + 1} 张照片`
                              }
                              className="relative shrink-0 overflow-hidden rounded-[10px] text-left transition-shadow duration-150 hover:shadow-md hover:ring-2 hover:ring-[#1e1b2e]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e1b2e]"
                              style={{
                                width: `${width}px`,
                                height: `${height}px`,
                                backgroundColor: photo.color,
                                boxShadow: isLastViewed
                                  ? `0 0 0 2px #fcfafb, 0 0 0 4.5px ${ringColor}`
                                  : undefined,
                              }}
                            >
                              <img
                                src={photo.thumb}
                                alt={photo.title ?? ''}
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                                onLoad={onImgLoad}
                                onError={onImgError}
                                className="fade-img h-full w-full object-cover"
                              />
                              {hasNote && (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2 pt-6 text-white">
                                  <span className="truncate text-[12.5px] font-medium leading-tight drop-shadow-sm">
                                    {caption}
                                  </span>
                                  {photo.place && (
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-white/90" aria-hidden="true" />
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* 排版 B：紧凑方格速览 */
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6">
                    {chapterPhotos.map((photo) => {
                      const hasNote = Boolean(photo.title ?? photo.story);
                      const isLastViewed = photo.index === lastViewedIndex;
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => openLightbox(photo.index, chapterIndices, false)}
                          aria-label={
                            photo.title
                              ? `查看大图：${photo.title}`
                              : `查看 ${ch.title} 第 ${photo.indexInChapter + 1} 张照片`
                          }
                          className="relative aspect-square w-full overflow-hidden rounded-[10px] text-left transition-shadow duration-150 hover:shadow-md hover:ring-2 hover:ring-[#1e1b2e]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e1b2e]"
                          style={{
                            backgroundColor: photo.color,
                            boxShadow: isLastViewed
                              ? `0 0 0 2px #fcfafb, 0 0 0 4.5px ${ringColor}`
                              : undefined,
                          }}
                        >
                          <img
                            src={photo.thumb}
                            alt={photo.title ?? ''}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            onLoad={onImgLoad}
                            onError={onImgError}
                            className="fade-img h-full w-full object-cover"
                          />
                          {hasNote && (
                            <span
                              className="pointer-events-none absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"
                              aria-hidden="true"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
