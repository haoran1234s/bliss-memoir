/**
 * 精装画册扉页
 * ------------------------------------------------------------
 * 仅在「全部」视图顶部展示：
 *   - 端正的双栏画册封面（0° 静止摆放，无晃动与浮动动画）
 *   - 主视觉封面照片（点击直达全屏看图）
 *   - 章节快速入口（点击直接切到对应章节）
 */
import type { RefObject } from 'react';
import { Calendar, Heart, Images, Play } from 'lucide-react';
import { chapters, photos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { unlockBgmNow } from '../../media/bgm';
import { useAlbumStore } from '../../store/useAlbumStore';
import { paletteOf } from '../../theme/palettes';
import { ALL_PHOTO_INDICES } from './albumHelpers';

interface HeroCoverProps {
  scrollRootRef: RefObject<HTMLDivElement>;
}

export function HeroCover({ scrollRootRef }: HeroCoverProps) {
  const { openLightbox, setFilter } = useAlbumStore.getState();
  const coverPhoto = photos[chapters[0]?.cover ?? 0] ?? photos[0];

  const startFromFirst = () => {
    if (photos.length === 0) return;
    unlockBgmNow();
    openLightbox(0, ALL_PHOTO_INDICES, false);
  };

  const startSlideshow = () => {
    if (photos.length === 0) return;
    unlockBgmNow();
    openLightbox(0, ALL_PHOTO_INDICES, true);
  };

  const jumpToChapter = (chapterIndex: number) => {
    setFilter(chapterIndex);
    scrollRootRef.current?.scrollTo({ top: 0 });
  };

  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-10">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
        {/* 文案与快速入口区 */}
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#1e1b2e]/10 bg-white px-3.5 py-1 font-display text-[13px] font-medium tracking-[0.12em] text-[#494361]">
            <Calendar className="h-3.5 w-3.5 text-[#e04f65]" aria-hidden="true" />
            <span>{couple.date}</span>
          </div>

          <h1 className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-fun text-[clamp(32px,5vw,52px)] leading-tight text-[#1e1b2e]">
            <span>{couple.groomName}</span>
            <Heart
              className="h-7 w-7 shrink-0 text-[#e04f65] sm:h-9 sm:w-9"
              fill="currentColor"
              strokeWidth={0}
              aria-hidden="true"
            />
            <span>{couple.brideName}</span>
          </h1>

          <p className="mt-3 text-[17px] font-semibold text-[#1e1b2e] sm:text-[18px]">{couple.welcomeTitle}</p>
          <p className="mt-2 max-w-[60ch] whitespace-pre-line text-[14.5px] leading-relaxed text-[#494361] sm:text-[15.5px]">
            {couple.welcomeText}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {photos.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={startFromFirst}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#e04f65] px-6 text-[14.5px] font-medium text-white shadow-sm transition-colors hover:bg-[#cc3e54] active:scale-[0.98]"
                >
                  <Images className="h-4 w-4" aria-hidden="true" />
                  <span>从第一张开始看</span>
                </button>
                <button
                  type="button"
                  onClick={startSlideshow}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[#1e1b2e]/15 bg-white px-5 text-[14.5px] font-medium text-[#1e1b2e] transition-colors hover:bg-[#1e1b2e]/[0.04] active:scale-[0.98]"
                >
                  <Play className="h-4 w-4 text-[#e04f65]" fill="currentColor" aria-hidden="true" />
                  <span>自动放映幻灯片</span>
                </button>
              </>
            )}
          </div>

          {/* 章节快速入口条 */}
          {chapters.length > 0 && (
            <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {chapters.map((ch) => {
                const thumbPhoto = photos[ch.cover];
                const accent = paletteOf(ch.palette, ch.index).accent;
                return (
                  <button
                    key={ch.index}
                    type="button"
                    onClick={() => jumpToChapter(ch.index)}
                    className="flex items-center gap-2.5 rounded-2xl border border-[#1e1b2e]/10 bg-white p-2 text-left transition-shadow hover:border-[#1e1b2e]/20 hover:shadow-sm active:scale-[0.99]"
                  >
                    <span
                      className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl"
                      style={{ backgroundColor: thumbPhoto?.color ?? '#ece9f1' }}
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
                      <span className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-[#1e1b2e]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: accent }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{ch.title}</span>
                      </span>
                      <span className="mt-0.5 block font-display text-[12px] text-[#494361] tabular-nums">
                        {ch.count} 张照片
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 主视觉相框区（0° 端正静止摆放） */}
        {coverPhoto && (
          <div className="lg:col-span-5">
            <button
              type="button"
              onClick={() => openLightbox(coverPhoto.index, ALL_PHOTO_INDICES, false)}
              aria-label={coverPhoto.title ? `查看封面照片：${coverPhoto.title}` : '查看封面照片'}
              className="block w-full rounded-[22px] border border-[#1e1b2e]/10 bg-white p-3 text-left shadow-[0_12px_36px_-18px_rgba(30,27,46,0.22)] transition-shadow hover:border-[#1e1b2e]/20 hover:shadow-[0_18px_42px_-16px_rgba(30,27,46,0.28)]"
            >
              <div
                className="relative w-full overflow-hidden rounded-[14px]"
                style={{
                  aspectRatio: `${coverPhoto.w} / ${coverPhoto.h}`,
                  maxHeight: '420px',
                  backgroundColor: coverPhoto.color,
                }}
              >
                <img
                  src={coverPhoto.full}
                  alt={coverPhoto.title ?? `${couple.groomName}与${couple.brideName}的回忆封面`}
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </div>
              {(coverPhoto.title || coverPhoto.place || coverPhoto.date) && (
                <div className="flex items-center justify-between gap-3 px-1 pt-2.5 text-[13px] text-[#494361]">
                  <span className="truncate font-medium text-[#1e1b2e]">{coverPhoto.title ?? ''}</span>
                  <div className="flex shrink-0 items-center gap-2 font-display text-[12px] tabular-nums">
                    {coverPhoto.place && <span>{coverPhoto.place}</span>}
                    {coverPhoto.date && <span>{coverPhoto.date}</span>}
                  </div>
                </div>
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
