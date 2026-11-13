/**
 * Designeer 瑞士极简结构顶栏 + React Bits 底部灵动 Dock
 * ------------------------------------------------------------
 *   1. AlbumHeader：顶部极简建筑网格栏
 *      - 第一行：新人名称 + 帧数计数 + 巡航放映 + 日间/暗房主题切换 + 背景音乐开关；
 *      - 第二行：可横滑章节与手记筛选条（高对比瑞士反色激活态）；
 *   2. FloatingDock：复刻 DavidHDev/react-bits 的底部悬浮交互 Dock
 *      - 位于手机拇指自然触区，切换 3D 环幕 / 3D 叠片 / 画廊网格 / 婚礼影像。
 */
import { useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Disc3,
  LayoutGrid,
  Layers,
  Moon,
  Pause,
  Play,
  Sun,
  VolumeX,
} from 'lucide-react';
import { chapters, photos, videos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { unlockBgmNow, useBgmStatus } from '../../media/bgm';
import { useAlbumStore, type AlbumFilter, type ViewMode } from '../../store/useAlbumStore';
import {
  STORY_PHOTOS,
  formatFrameNo,
  getFilteredPhotoIndices,
  getFilteredPhotos,
} from './albumHelpers';

export function AlbumHeader() {
  const viewMode = useAlbumStore((s) => s.viewMode);
  const theme = useAlbumStore((s) => s.theme);
  const filter = useAlbumStore((s) => s.filter);
  const activePhotoIndex = useAlbumStore((s) => s.activePhotoIndex);
  const autoplay = useAlbumStore((s) => s.autoplay);
  const bgmEnabled = useAlbumStore((s) => s.bgmEnabled);
  const musicFailed = useBgmStatus((s) => s.musicFailed);

  const {
    setFilter,
    toggleAutoplay,
    toggleTheme,
    toggleBgm,
    setCoverModalOpen,
    openLightbox,
  } = useAlbumStore.getState();

  const currentList = getFilteredPhotos(filter);
  const posInList = Math.max(
    0,
    currentList.findIndex((p) => p.index === activePhotoIndex),
  );

  const tabRowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<AlbumFilter, HTMLButtonElement>());

  useEffect(() => {
    const row = tabRowRef.current;
    const btn = tabRefs.current.get(filter);
    if (!row || !btn) return;
    const targetLeft = btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [filter]);

  const onToggleAutoplay = () => {
    unlockBgmNow();
    if (viewMode === 'grid') {
      const indices = getFilteredPhotoIndices(filter);
      if (indices.length > 0) openLightbox(activePhotoIndex, indices, true);
      return;
    }
    toggleAutoplay();
  };

  const onToggleMusic = () => {
    if (!bgmEnabled) unlockBgmNow();
    toggleBgm();
  };

  return (
    <header
      className="fixed inset-x-0 top-0 z-30 border-b px-safe pt-safe backdrop-blur-md transition-colors duration-200"
      style={{
        backgroundColor: 'var(--dock-bg)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* 主行：品牌与实用工具 */}
        <div className="flex h-12 items-center justify-between gap-2 sm:h-14">
          <button
            type="button"
            onClick={() => setCoverModalOpen(true)}
            aria-label="查看回忆录扉页与目录"
            className="flex min-w-0 items-center gap-2.5 py-1 text-left transition-opacity hover:opacity-75"
          >
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink)] sm:text-[16px]">
              {couple.groomName} &amp; {couple.brideName}
            </span>
            {photos.length > 0 && viewMode !== 'videos' && (
              <span className="shrink-0 font-display text-[11px] text-[var(--ink-soft)] tabular-nums">
                {formatFrameNo(posInList + 1)} / {formatFrameNo(currentList.length)}
              </span>
            )}
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            {photos.length > 0 && viewMode !== 'videos' && (
              <button
                type="button"
                onClick={onToggleAutoplay}
                aria-pressed={autoplay}
                aria-label={autoplay ? '暂停自动巡航' : '开启自动巡航'}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors active:scale-95"
                style={{
                  borderColor: autoplay ? 'var(--ink)' : 'var(--border)',
                  backgroundColor: autoplay ? 'var(--ink)' : 'var(--surface)',
                  color: autoplay ? 'var(--bg)' : 'var(--ink)',
                }}
              >
                {autoplay ? (
                  <Pause className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                )}
                <span>{autoplay ? '暂停' : '放映'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? '切换为暗房碳黑模式' : '切换为美术馆柔白模式'}
              title={theme === 'light' ? '暗房模式' : '美术馆柔白'}
              className="grid h-9 w-9 place-items-center rounded-full border transition-colors active:scale-95"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
              }}
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleMusic}
              disabled={musicFailed}
              aria-label={bgmEnabled && !musicFailed ? '关闭背景音乐' : '开启背景音乐'}
              aria-pressed={bgmEnabled && !musicFailed}
              className="grid h-9 w-9 place-items-center rounded-full border transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: bgmEnabled && !musicFailed ? 'var(--ink)' : 'var(--border)',
                backgroundColor: bgmEnabled && !musicFailed ? 'var(--ink)' : 'var(--surface)',
                color: bgmEnabled && !musicFailed ? 'var(--bg)' : 'var(--ink-soft)',
              }}
            >
              {bgmEnabled && !musicFailed ? (
                <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                  <span className="h-1.5 w-[2px] animate-pulse bg-current" />
                  <span
                    className="h-3 w-[2px] animate-pulse bg-current"
                    style={{ animationDelay: '180ms' }}
                  />
                  <span
                    className="h-2 w-[2px] animate-pulse bg-current"
                    style={{ animationDelay: '360ms' }}
                  />
                </span>
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* 次行：瑞士网格横向章节筛选条 */}
        {viewMode !== 'videos' && (
          <nav
            ref={tabRowRef}
            aria-label="章节筛选"
            className="no-scrollbar -mx-4 flex h-10 items-center gap-1.5 overflow-x-auto border-t px-4 sm:-mx-6 sm:px-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              ref={(el) => {
                if (el) tabRefs.current.set('all', el);
                else tabRefs.current.delete('all');
              }}
              onClick={() => setFilter('all')}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: filter === 'all' ? 'var(--ink)' : 'transparent',
                color: filter === 'all' ? 'var(--bg)' : 'var(--ink-soft)',
              }}
            >
              <span>全部</span>
              <span className="font-display text-[10.5px] opacity-75 tabular-nums">
                {photos.length}
              </span>
            </button>

            {chapters.map((ch) => {
              const active = filter === ch.index;
              return (
                <button
                  key={ch.index}
                  type="button"
                  ref={(el) => {
                    if (el) tabRefs.current.set(ch.index, el);
                    else tabRefs.current.delete(ch.index);
                  }}
                  onClick={() => setFilter(ch.index)}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--bg)' : 'var(--ink-soft)',
                  }}
                >
                  <span className="font-display text-[10.5px] opacity-65 tabular-nums">
                    {String(ch.index + 1).padStart(2, '0')}
                  </span>
                  <span>{ch.title}</span>
                </button>
              );
            })}

            {STORY_PHOTOS.length > 0 && (
              <button
                type="button"
                ref={(el) => {
                  if (el) tabRefs.current.set('stories', el);
                  else tabRefs.current.delete('stories');
                }}
                onClick={() => setFilter('stories')}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-medium transition-colors"
                style={{
                  backgroundColor: filter === 'stories' ? 'var(--ink)' : 'transparent',
                  color: filter === 'stories' ? 'var(--bg)' : 'var(--ink-soft)',
                }}
              >
                <span>手记</span>
                <span className="font-display text-[10.5px] opacity-75 tabular-nums">
                  {STORY_PHOTOS.length}
                </span>
              </button>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

/* ============================================================
   React Bits 风格底部悬浮灵动坞（Floating Dock）
   ============================================================ */
interface DockItem {
  mode: ViewMode;
  label: string;
  icon: typeof Disc3;
}

export function FloatingDock() {
  const viewMode = useAlbumStore((s) => s.viewMode);
  const { setViewMode } = useAlbumStore.getState();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const items: DockItem[] = [
    { mode: 'arc', label: '3D 环幕', icon: Disc3 },
    { mode: 'stack', label: '3D 叠片', icon: Layers },
    { mode: 'grid', label: '网格', icon: LayoutGrid },
    ...(videos.length > 0 ? [{ mode: 'videos' as const, label: '影像', icon: Clapperboard }] : []),
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-safe pb-safe">
      <nav
        aria-label="相册视图切换 Dock"
        onPointerLeave={() => setHoveredIdx(null)}
        className="pointer-events-auto mb-3 flex items-center gap-1 rounded-2xl border p-1.5 shadow-[0_14px_38px_-12px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:mb-4"
        style={{
          backgroundColor: 'var(--dock-bg)',
          borderColor: 'var(--border)',
        }}
      >
        {items.map((item, idx) => {
          const Icon = item.icon;
          const active = viewMode === item.mode;
          const dist = hoveredIdx === null ? 99 : Math.abs(hoveredIdx - idx);
          const scale = dist === 0 ? 1.12 : dist === 1 ? 1.05 : 1;

          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => setViewMode(item.mode)}
              onPointerEnter={() => setHoveredIdx(idx)}
              aria-current={active ? 'page' : undefined}
              className="relative flex h-11 min-w-[68px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 transition-[transform,background-color,color] duration-200 active:scale-95 sm:min-w-[78px]"
              style={{
                transform: `scale(${scale})`,
                backgroundColor: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--bg)' : 'var(--ink-soft)',
              }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-[10.5px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
