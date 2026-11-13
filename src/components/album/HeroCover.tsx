/**
 * 黑金精装扉页序言 + 35mm 底片接触印相全览抽屉
 * ------------------------------------------------------------
 * 提供两套暗房级抽屉/浮层组件：
 *   1. EditorialCoverModal：黑金扉页序言与章节直达目录；
 *   2. ContactSheetDrawer：35mm 接触印相底片全览（原比例未裁切，点击定位 3D 转轮）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Calendar, Heart, Play, Sparkles, X } from 'lucide-react';
import { chapters, photos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore, type AlbumFilter } from '../../store/useAlbumStore';
import {
  CALM_EASE,
  STORY_PHOTOS,
  formatFrameNo,
  getFilteredPhotos,
  toRoman,
} from './albumHelpers';

/** 黑金精装扉页序言浮层 */
export function EditorialCoverModal() {
  const { setCoverModalOpen, setFilter, setActivePhotoIndex, toggleAutoplay } =
    useAlbumStore.getState();
  const coverPhoto = photos[chapters[0]?.cover ?? 0] ?? photos[0];

  const jumpToChapter = (chapterIndex: number) => {
    const ch = chapters[chapterIndex];
    setFilter(chapterIndex);
    if (ch) setActivePhotoIndex(ch.start);
    setCoverModalOpen(false);
  };

  const startAutoTour = () => {
    unlockBgmNow();
    setFilter('all');
    setActivePhotoIndex(photos[0]?.index ?? 0);
    if (!useAlbumStore.getState().autoplay) toggleAutoplay();
    setCoverModalOpen(false);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="回忆录精装扉页"
      className="fixed inset-0 z-40 flex flex-col bg-[#08080a]/95 text-[#f3efea] backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: CALM_EASE }}
    >
      {/* 顶部栏 */}
      <div className="shrink-0 border-b border-white/[0.08] px-safe pt-safe">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-2 font-display text-[11px] tracking-[0.2em] text-[#c8b28e] uppercase">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>PREFACE · 回忆录序言</span>
          </div>
          <button
            type="button"
            onClick={() => setCoverModalOpen(false)}
            aria-label="关闭序言浮层"
            className="grid h-10 w-10 place-items-center border border-white/[0.12] bg-[#141418] text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-[0.97]"
            style={{ borderRadius: '8px' }}
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 主体 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-safe pb-safe">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
            {/* 左侧人文序言 */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 border border-[#c8b28e]/35 bg-[#c8b28e]/[0.08] px-3 py-1 font-display text-[11.5px] tracking-[0.16em] text-[#c8b28e] tabular-nums">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{couple.date}</span>
              </div>

              <h1 className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-serif text-[clamp(30px,6vw,48px)] font-medium leading-tight tracking-[0.06em] text-[#f3efea]">
                <span>{couple.groomName}</span>
                <Heart
                  className="h-5 w-5 shrink-0 text-[#c8b28e] sm:h-6 sm:w-6"
                  fill="currentColor"
                  strokeWidth={0}
                  aria-hidden="true"
                />
                <span>{couple.brideName}</span>
              </h1>

              <p className="mt-3 font-serif text-[17px] text-[#c8b28e] sm:text-[18px]">
                {couple.welcomeTitle}
              </p>
              <p className="mt-3 max-w-[58ch] whitespace-pre-line text-[14.5px] leading-relaxed text-[#a39e95] sm:text-[15.5px]">
                {couple.welcomeText}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCoverModalOpen(false)}
                  className="inline-flex h-11 items-center gap-2 bg-[#c8b28e] px-5 text-[13.5px] font-medium text-[#11100e] transition-opacity hover:opacity-90 active:scale-[0.98]"
                  style={{ borderRadius: '8px' }}
                >
                  <span>进入 3D 胶片转轮</span>
                </button>
                {photos.length > 0 && (
                  <button
                    type="button"
                    onClick={startAutoTour}
                    className="inline-flex h-11 items-center gap-2 border border-white/[0.15] bg-[#141418] px-5 text-[13.5px] text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-[0.98]"
                    style={{ borderRadius: '8px' }}
                  >
                    <Play className="h-3.5 w-3.5 text-[#c8b28e]" fill="currentColor" aria-hidden="true" />
                    <span>自动巡航放映</span>
                  </button>
                )}
              </div>

              {/* 章节直达网格 */}
              {chapters.length > 0 && (
                <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {chapters.map((ch) => {
                    const thumbPhoto = photos[ch.cover];
                    return (
                      <button
                        key={ch.index}
                        type="button"
                        onClick={() => jumpToChapter(ch.index)}
                        className="flex items-center gap-3 border border-white/[0.08] bg-[#141418] p-2.5 text-left transition-colors hover:border-[#c8b28e]/50 active:scale-[0.99]"
                        style={{ borderRadius: '8px' }}
                      >
                        <span
                          className="relative h-12 w-12 shrink-0 overflow-hidden bg-[#1e1e24]"
                          style={{
                            borderRadius: '6px',
                            backgroundColor: thumbPhoto?.color ?? '#1e1e24',
                          }}
                        >
                          {thumbPhoto && (
                            <img
                              src={thumbPhoto.thumb}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[10.5px] tracking-[0.14em] text-[#c8b28e]">
                            CHAPTER {toRoman(ch.index + 1)}
                          </span>
                          <span className="mt-0.5 block truncate font-serif text-[14.5px] text-[#f3efea]">
                            {ch.title}
                          </span>
                          <span className="block font-display text-[11px] text-[#a39e95] tabular-nums">
                            {ch.count} 帧
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 右侧装裱封面 */}
            {coverPhoto && (
              <div className="lg:col-span-5">
                <div
                  className="border border-[#c8b28e]/30 bg-[#141418] p-3"
                  style={{ borderRadius: '12px' }}
                >
                  <div
                    className="relative w-full overflow-hidden"
                    style={{
                      borderRadius: '8px',
                      aspectRatio: `${coverPhoto.w} / ${coverPhoto.h}`,
                      maxHeight: '420px',
                      backgroundColor: coverPhoto.color,
                    }}
                  >
                    <img
                      src={coverPhoto.full}
                      alt={coverPhoto.title ?? `${couple.groomName}与${couple.brideName}`}
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {(coverPhoto.title || coverPhoto.place || coverPhoto.date) && (
                    <div className="flex items-center justify-between gap-3 px-1 pt-3 text-[12.5px] text-[#a39e95]">
                      <span className="truncate font-serif text-[#f3efea]">{coverPhoto.title ?? ''}</span>
                      <span className="shrink-0 font-display text-[11px] text-[#c8b28e] tabular-nums">
                        {coverPhoto.date ?? coverPhoto.place ?? ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** 35mm 接触印相底片全览抽屉（Contact Sheet Index） */
export function ContactSheetDrawer() {
  const activePhotoIndex = useAlbumStore((s) => s.activePhotoIndex);
  const storeFilter = useAlbumStore((s) => s.filter);
  const { setIndexDrawerOpen, setFilter, setActivePhotoIndex } = useAlbumStore.getState();

  const [sheetFilter, setSheetFilter] = useState<AlbumFilter>(
    storeFilter === 'videos' ? 'all' : storeFilter,
  );

  const displayPhotos = useMemo(() => getFilteredPhotos(sheetFilter), [sheetFilter]);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = activeItemRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, []);

  const handleSelectPhoto = (photoIndex: number) => {
    // 若当前抽屉按筛选过滤，则同步更新主舞台筛选以保证直达定位准确
    if (sheetFilter !== storeFilter) {
      setFilter(sheetFilter);
    }
    setActivePhotoIndex(photoIndex);
    setIndexDrawerOpen(false);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="35mm 底片接触印相全览"
      className="fixed inset-0 z-40 flex flex-col bg-[#08080a]/96 text-[#f3efea] backdrop-blur-md"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.22, ease: CALM_EASE }}
    >
      {/* 顶部栏与筛选胶囊 */}
      <div className="shrink-0 border-b border-white/[0.08] px-safe pt-safe">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
            <div className="flex items-center gap-2.5">
              <span className="font-serif text-[17px] font-medium tracking-[0.06em] text-[#f3efea]">
                底片接触印相索引
              </span>
              <span className="font-display text-[11px] tracking-[0.12em] text-[#c8b28e] tabular-nums">
                {displayPhotos.length} FRAMES
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIndexDrawerOpen(false)}
              aria-label="关闭底片索引抽屉"
              className="grid h-10 w-10 place-items-center border border-white/[0.12] bg-[#141418] text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-[0.97]"
              style={{ borderRadius: '8px' }}
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>

          {/* 筛选切换条 */}
          <nav
            aria-label="底片章节筛选"
            className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6"
          >
            <button
              type="button"
              onClick={() => setSheetFilter('all')}
              className={`h-8 shrink-0 border px-3 text-[12px] transition-colors ${
                sheetFilter === 'all'
                  ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                  : 'border-white/[0.1] bg-[#141418] text-[#a39e95] hover:text-[#f3efea]'
              }`}
              style={{ borderRadius: '6px' }}
            >
              全部 ({photos.length})
            </button>
            {chapters.map((ch) => {
              const active = sheetFilter === ch.index;
              return (
                <button
                  key={ch.index}
                  type="button"
                  onClick={() => setSheetFilter(ch.index)}
                  className={`h-8 shrink-0 border px-3 text-[12px] transition-colors ${
                    active
                      ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                      : 'border-white/[0.1] bg-[#141418] text-[#a39e95] hover:text-[#f3efea]'
                  }`}
                  style={{ borderRadius: '6px' }}
                >
                  {toRoman(ch.index + 1)} · {ch.title} ({ch.count})
                </button>
              );
            })}
            {STORY_PHOTOS.length > 0 && (
              <button
                type="button"
                onClick={() => setSheetFilter('stories')}
                className={`h-8 shrink-0 border px-3 text-[12px] transition-colors ${
                  sheetFilter === 'stories'
                    ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                    : 'border-white/[0.1] bg-[#141418] text-[#a39e95] hover:text-[#f3efea]'
                }`}
                style={{ borderRadius: '6px' }}
              >
                手记 ({STORY_PHOTOS.length})
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* 原比例底片网格（禁止裁剪与 hover 图片形变） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-safe pb-safe">
        <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3.5 md:grid-cols-6">
            {displayPhotos.map((photo) => {
              const isCurrent = photo.index === activePhotoIndex;
              const hasNote = Boolean(photo.title ?? photo.story);
              return (
                <button
                  key={photo.id}
                  ref={isCurrent ? activeItemRef : undefined}
                  type="button"
                  onClick={() => handleSelectPhoto(photo.index)}
                  aria-label={
                    photo.title
                      ? `跳到第 ${formatFrameNo(photo.index + 1)} 帧：${photo.title}`
                      : `跳到第 ${formatFrameNo(photo.index + 1)} 帧`
                  }
                  className={`flex flex-col border bg-[#121216] p-1.5 text-left transition-colors ${
                    isCurrent
                      ? 'border-[#c8b28e] ring-1 ring-[#c8b28e]'
                      : 'border-white/[0.08] hover:border-white/25'
                  }`}
                  style={{ borderRadius: '6px' }}
                >
                  <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
                    <span
                      className={`font-display text-[10px] tracking-[0.08em] tabular-nums ${
                        isCurrent ? 'text-[#c8b28e]' : 'text-[#a39e95]'
                      }`}
                    >
                      {formatFrameNo(photo.index + 1)}
                    </span>
                    {hasNote && (
                      <Sparkles className="h-2.5 w-2.5 text-[#c8b28e]" aria-hidden="true" />
                    )}
                  </div>
                  <div
                    className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[#0b0b0e]"
                    style={{ borderRadius: '4px' }}
                  >
                    <img
                      src={photo.thumb}
                      alt={photo.title ?? ''}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
