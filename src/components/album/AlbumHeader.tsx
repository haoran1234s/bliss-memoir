/**
 * 黑金档案 HUD 顶栏
 * ------------------------------------------------------------
 * 专为手机单手竖屏安全区设计的极简悬浮导航：
 *   - 左侧：新人名录铭牌（点击打开黑金精装扉页序言）；
 *   - 右侧：影像放映厅、35mm 底片全览、3D 巡航放映、背景音乐开关；
 *   - 遵循安全区与常规内边距分离原则，避免 Tailwind 类覆盖冲突。
 */
import { Film, Grid3X3, Pause, Play, VolumeX } from 'lucide-react';
import { photos, videos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { unlockBgmNow, useBgmStatus } from '../../media/bgm';
import { useAlbumStore } from '../../store/useAlbumStore';

export function AlbumHeader() {
  const autoplay = useAlbumStore((s) => s.autoplay);
  const bgmEnabled = useAlbumStore((s) => s.bgmEnabled);
  const musicFailed = useBgmStatus((s) => s.musicFailed);
  const {
    toggleAutoplay,
    toggleBgm,
    setIndexDrawerOpen,
    setVideoModalOpen,
    setCoverModalOpen,
  } = useAlbumStore.getState();

  const onToggleAutoplay = () => {
    if (!autoplay) unlockBgmNow();
    toggleAutoplay();
  };

  const onToggleMusic = () => {
    if (!bgmEnabled) unlockBgmNow();
    toggleBgm();
  };

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 border-b border-white/[0.08] bg-[#0b0b0e]/80 px-safe pt-safe backdrop-blur-md">
      <div className="pointer-events-auto mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
        {/* 左侧：新人铭牌（点击弹出扉页序言） */}
        <button
          type="button"
          onClick={() => setCoverModalOpen(true)}
          aria-label="打开回忆录扉页序言"
          className="group flex min-w-0 flex-col items-start py-1 pr-2 text-left transition-opacity hover:opacity-85 active:opacity-70"
        >
          <span className="truncate font-serif text-[16px] font-medium tracking-[0.08em] text-[#f3efea] sm:text-[18px]">
            {couple.groomName} <span className="text-[#c8b28e]">·</span> {couple.brideName}
          </span>
          <span className="font-display text-[9.5px] tracking-[0.2em] text-[#c8b28e] uppercase">
            BLISS MEMOIR · 序言
          </span>
        </button>

        {/* 右侧：功能按钮组（满足 >= 40x40px 触控热区） */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {videos.length > 0 && (
            <button
              type="button"
              onClick={() => setVideoModalOpen(true)}
              aria-label={`打开婚礼影像放映厅，共 ${videos.length} 段影片`}
              className="inline-flex h-10 items-center gap-1.5 border border-white/[0.12] bg-[#141418] px-2.5 text-[12px] text-[#f3efea] transition-colors hover:border-[#c8b28e]/50 hover:text-[#c8b28e] active:scale-[0.97] sm:px-3"
              style={{ borderRadius: '8px' }}
            >
              <Film className="h-3.5 w-3.5 text-[#c8b28e]" aria-hidden="true" />
              <span>影像</span>
              <span className="font-display text-[11px] text-[#a39e95] tabular-nums">{videos.length}</span>
            </button>
          )}

          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => setIndexDrawerOpen(true)}
              aria-label={`打开底片全览索引，共 ${photos.length} 张照片`}
              className="inline-flex h-10 items-center gap-1.5 border border-white/[0.12] bg-[#141418] px-2.5 text-[12px] text-[#f3efea] transition-colors hover:border-[#c8b28e]/50 hover:text-[#c8b28e] active:scale-[0.97] sm:px-3"
              style={{ borderRadius: '8px' }}
            >
              <Grid3X3 className="h-3.5 w-3.5 text-[#c8b28e]" aria-hidden="true" />
              <span>底片</span>
              <span className="hidden font-display text-[11px] text-[#a39e95] tabular-nums xs:inline sm:inline">
                {photos.length}
              </span>
            </button>
          )}

          {photos.length > 0 && (
            <button
              type="button"
              onClick={onToggleAutoplay}
              aria-pressed={autoplay}
              aria-label={autoplay ? '暂停自动巡航' : '开启自动巡航'}
              title={autoplay ? '暂停巡航' : '自动巡航'}
              className={`inline-flex h-10 items-center gap-1.5 border px-2.5 text-[12px] transition-colors active:scale-[0.97] sm:px-3 ${
                autoplay
                  ? 'border-[#c8b28e] bg-[#c8b28e] font-medium text-[#11100e]'
                  : 'border-white/[0.12] bg-[#141418] text-[#f3efea] hover:border-[#c8b28e]/50'
              }`}
              style={{ borderRadius: '8px' }}
            >
              {autoplay ? (
                <Pause className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5 text-[#c8b28e]" fill="currentColor" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{autoplay ? '巡航中' : '巡航'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMusic}
            disabled={musicFailed}
            aria-label={bgmEnabled && !musicFailed ? '关闭背景音乐' : '开启背景音乐'}
            title={musicFailed ? '背景音乐未能加载' : bgmEnabled ? '关闭背景音乐' : '开启背景音乐'}
            aria-pressed={bgmEnabled && !musicFailed}
            className={`grid h-10 w-10 place-items-center border transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${
              bgmEnabled && !musicFailed
                ? 'border-[#c8b28e]/55 bg-[#c8b28e]/[0.12] text-[#c8b28e]'
                : 'border-white/[0.12] bg-[#141418] text-[#a39e95] hover:text-[#f3efea]'
            }`}
            style={{ borderRadius: '8px' }}
          >
            {bgmEnabled && !musicFailed ? (
              <span className="flex h-3.5 items-end gap-[2.5px]" aria-hidden="true">
                <span className="w-[2px] h-2 bg-current animate-pulse" />
                <span className="w-[2px] h-3.5 bg-current animate-pulse" style={{ animationDelay: '180ms' }} />
                <span className="w-[2px] h-2.5 bg-current animate-pulse" style={{ animationDelay: '360ms' }} />
              </span>
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
