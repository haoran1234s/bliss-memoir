/**
 * Designeer 瑞士建筑风格扉页序言与章节速览浮层
 * ------------------------------------------------------------
 * 极简瑞士网格：1px 结构线 + 四角十字准星 + 干净人文排版与章节直达。
 */
import { motion } from 'framer-motion';
import { Play, X } from 'lucide-react';
import { chapters, photos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore } from '../../store/useAlbumStore';
import { CALM_EASE, formatFrameNo } from './albumHelpers';

export function EditorialCoverModal() {
  const { setCoverModalOpen, setFilter, setActivePhotoIndex, setViewMode, toggleAutoplay } =
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
    setViewMode('arc');
    setActivePhotoIndex(photos[0]?.index ?? 0);
    if (!useAlbumStore.getState().autoplay) toggleAutoplay();
    setCoverModalOpen(false);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="回忆录序言与章节目录"
      className="fixed inset-0 z-40 flex flex-col backdrop-blur-md"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: CALM_EASE }}
    >
      {/* 顶栏 */}
      <div
        className="shrink-0 border-b px-safe pt-safe"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:h-14 sm:px-6">
          <span className="font-display text-[12px] tracking-[0.06em] text-[var(--ink-soft)] tabular-nums">
            {couple.date}
          </span>
          <button
            type="button"
            onClick={() => setCoverModalOpen(false)}
            aria-label="关闭目录"
            className="grid h-9 w-9 place-items-center rounded-full border transition-colors active:scale-95"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-safe pb-safe">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-12">
            {/* 左侧序言与章节目录 */}
            <div className="lg:col-span-7">
              <div
                className="relative border p-5 sm:p-7"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--surface)',
                }}
              >
                {/* designeer 四角十字准星 */}
                <span className="swiss-cross absolute -left-[1px] -top-[1px]" aria-hidden="true" />
                <span className="swiss-cross absolute -right-[1px] -top-[1px]" aria-hidden="true" />
                <span className="swiss-cross absolute -bottom-[1px] -left-[1px]" aria-hidden="true" />
                <span className="swiss-cross absolute -bottom-[1px] -right-[1px]" aria-hidden="true" />

                <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[36px]">
                  {couple.groomName} &amp; {couple.brideName}
                </h1>
                <p className="mt-2 text-[16px] font-medium text-[var(--ink)]">
                  {couple.welcomeTitle}
                </p>
                <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-[var(--ink-soft)]">
                  {couple.welcomeText}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCoverModalOpen(false)}
                    className="inline-flex h-10 items-center rounded-full px-5 text-[13px] font-medium transition-opacity hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--ink)', color: 'var(--bg)' }}
                  >
                    继续浏览照片
                  </button>
                  {photos.length > 0 && (
                    <button
                      type="button"
                      onClick={startAutoTour}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors active:scale-95"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: 'var(--surface-muted)',
                        color: 'var(--ink)',
                      }}
                    >
                      <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                      <span>自动巡航</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 章节列表 */}
              {chapters.length > 0 && (
                <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {chapters.map((ch) => {
                    const thumbPhoto = photos[ch.cover];
                    return (
                      <button
                        key={ch.index}
                        type="button"
                        onClick={() => jumpToChapter(ch.index)}
                        className="flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:opacity-90"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface)',
                        }}
                      >
                        <span
                          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg"
                          style={{ backgroundColor: thumbPhoto?.color ?? 'var(--surface-muted)' }}
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
                          <span className="block font-display text-[11px] text-[var(--ink-soft)] tabular-nums">
                            {formatFrameNo(ch.index + 1)}
                          </span>
                          <span className="block truncate text-[14.5px] font-medium text-[var(--ink)]">
                            {ch.title}
                          </span>
                          <span className="block font-display text-[11px] text-[var(--ink-soft)] tabular-nums">
                            {ch.count} 张照片
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 右侧封面大图 */}
            {coverPhoto && (
              <div className="lg:col-span-5">
                <div
                  className="overflow-hidden rounded-xl border p-2.5"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface)',
                  }}
                >
                  <div
                    className="relative w-full overflow-hidden rounded-lg"
                    style={{
                      aspectRatio: `${coverPhoto.w} / ${coverPhoto.h}`,
                      maxHeight: '440px',
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
                    <div className="flex items-center justify-between gap-2 px-1 pt-2.5 text-[12px] text-[var(--ink-soft)]">
                      <span className="truncate font-medium text-[var(--ink)]">
                        {coverPhoto.title ?? ''}
                      </span>
                      <span className="shrink-0 font-display tabular-nums">
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
