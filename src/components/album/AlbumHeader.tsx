/**
 * 画册吸顶导航栏
 * ------------------------------------------------------------
 * 扁平直达的信息入口：
 *   - 左：新人名称（点击回到「全部」并回顶）；
 *   - 中 / 次行：全部、各章节、故事手记、婚礼影像筛选胶囊；
 *   - 右：画廊/方格排版切换、自动放映幻灯片、背景音乐开关。
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { BookOpen, Clapperboard, Heart, LayoutGrid, Music, Play, Rows3, VolumeX } from 'lucide-react';
import { chapters, photos, videos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { unlockBgmNow, useBgmStatus } from '../../media/bgm';
import { useAlbumStore, type AlbumFilter } from '../../store/useAlbumStore';
import { DEFAULT_ACCENT, paletteOf } from '../../theme/palettes';
import {
  STORY_PHOTOS,
  accessiblePillColor,
  chapterPillColor,
  getFilteredPhotoIndices,
} from './albumHelpers';

interface AlbumHeaderProps {
  scrollRootRef: RefObject<HTMLDivElement>;
}

interface FilterTab {
  key: AlbumFilter;
  label: string;
  count: number;
  dotColor?: string;
  activeBg: string;
  icon?: 'stories' | 'videos';
}

const DEFAULT_PILL_BG = accessiblePillColor(DEFAULT_ACCENT.accent);

export function AlbumHeader({ scrollRootRef }: AlbumHeaderProps) {
  const filter = useAlbumStore((s) => s.filter);
  const layoutMode = useAlbumStore((s) => s.layoutMode);
  const bgmEnabled = useAlbumStore((s) => s.bgmEnabled);
  const musicFailed = useBgmStatus((s) => s.musicFailed);
  const { setFilter, setLayoutMode, openLightbox, toggleBgm } = useAlbumStore.getState();

  const tabRowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<AlbumFilter, HTMLButtonElement>());

  const tabs: FilterTab[] = [
    { key: 'all', label: '全部', count: photos.length, activeBg: DEFAULT_PILL_BG },
    ...chapters.map((ch) => ({
      key: ch.index as AlbumFilter,
      label: ch.title,
      count: ch.count,
      dotColor: paletteOf(ch.palette, ch.index).accent,
      activeBg: chapterPillColor(ch.index),
    })),
    ...(STORY_PHOTOS.length > 0
      ? [
          {
            key: 'stories' as AlbumFilter,
            label: '故事手记',
            count: STORY_PHOTOS.length,
            activeBg: '#3f385c',
            icon: 'stories' as const,
          },
        ]
      : []),
    ...(videos.length > 0
      ? [
          {
            key: 'videos' as AlbumFilter,
            label: '婚礼影像',
            count: videos.length,
            activeBg: '#52469e',
            icon: 'videos' as const,
          },
        ]
      : []),
  ];

  // 选中标签变化时，仅将横向标签栏滚动到视图中，不触发页面纵向甩动
  useEffect(() => {
    const row = tabRowRef.current;
    const btn = tabRefs.current.get(filter);
    if (!row || !btn) return;
    const targetLeft = btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [filter]);

  const selectTab = (next: AlbumFilter) => {
    setFilter(next);
    scrollRootRef.current?.scrollTo({ top: 0 });
  };

  const startSlideshow = () => {
    unlockBgmNow();
    const list = getFilteredPhotoIndices(filter === 'videos' ? 'all' : filter);
    if (list.length === 0) return;
    openLightbox(list[0], list, true);
  };

  const onToggleMusic = () => {
    if (!bgmEnabled) unlockBgmNow();
    toggleBgm();
  };

  const showLayoutToggle = filter !== 'videos' && filter !== 'stories' && photos.length > 0;

  return (
    <header className="sticky top-0 z-30 border-b border-[#1e1b2e]/[0.08] bg-[#fcfafb]/95 px-safe pt-safe md:backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
          {/* 左侧：新人标识 */}
          <button
            type="button"
            onClick={() => selectTab('all')}
            aria-label="回到全部照片顶部"
            title="回到全部照片"
            className="inline-flex min-w-0 items-center gap-2 rounded-full py-1.5 pr-2 text-left transition-opacity hover:opacity-80"
          >
            <Heart
              className="h-4 w-4 shrink-0 text-[#e04f65]"
              fill="currentColor"
              strokeWidth={0}
              aria-hidden="true"
            />
            <span className="truncate font-fun text-[17px] text-[#1e1b2e] sm:text-[19px]">
              {couple.groomName} {couple.connector} {couple.brideName}
            </span>
          </button>

          {/* 桌面端：内联筛选胶囊 */}
          <nav
            aria-label="画册章节筛选"
            className="no-scrollbar hidden min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto px-2 lg:flex"
          >
            {tabs.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={String(tab.key)}
                  type="button"
                  onClick={() => selectTab(tab.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors duration-150 ${
                    active
                      ? 'text-white shadow-sm'
                      : 'bg-[#1e1b2e]/[0.045] text-[#1e1b2e] hover:bg-[#1e1b2e]/[0.09]'
                  }`}
                  style={active ? { backgroundColor: tab.activeBg } : undefined}
                >
                  {!active && tab.dotColor && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tab.dotColor }}
                      aria-hidden="true"
                    />
                  )}
                  {tab.icon === 'stories' && <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {tab.icon === 'videos' && <Clapperboard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  <span>{tab.label}</span>
                  <span className={`font-display text-[12px] tabular-nums ${active ? 'text-white/85' : 'text-[#494361]'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* 右侧：工具按钮 */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {showLayoutToggle && (
              <button
                type="button"
                onClick={() => setLayoutMode(layoutMode === 'justified' ? 'grid' : 'justified')}
                aria-label={layoutMode === 'justified' ? '切换为紧凑方格排版' : '切换为原比例画廊排版'}
                title={layoutMode === 'justified' ? '切换紧凑方格' : '切换原比例画廊'}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#1e1b2e]/12 bg-white px-3 text-[13px] font-medium text-[#1e1b2e] transition-colors hover:bg-[#1e1b2e]/[0.04] active:scale-95"
              >
                {layoutMode === 'justified' ? (
                  <>
                    <LayoutGrid className="h-4 w-4 text-[#494361]" aria-hidden="true" />
                    <span className="hidden sm:inline">方格</span>
                  </>
                ) : (
                  <>
                    <Rows3 className="h-4 w-4 text-[#494361]" aria-hidden="true" />
                    <span className="hidden sm:inline">画廊</span>
                  </>
                )}
              </button>
            )}

            {photos.length > 0 && (
              <button
                type="button"
                onClick={startSlideshow}
                aria-label="自动放映幻灯片"
                title="自动放映幻灯片"
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#1e1b2e]/12 bg-white px-3 text-[13px] font-medium text-[#1e1b2e] transition-colors hover:bg-[#1e1b2e]/[0.04] active:scale-95"
              >
                <Play className="h-3.5 w-3.5 text-[#e04f65]" fill="currentColor" aria-hidden="true" />
                <span className="hidden sm:inline">自动放映</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleMusic}
              disabled={musicFailed}
              aria-label={bgmEnabled && !musicFailed ? '关闭背景音乐' : '开启背景音乐'}
              title={musicFailed ? '背景音乐未能加载' : bgmEnabled ? '关闭背景音乐' : '开启背景音乐'}
              aria-pressed={bgmEnabled && !musicFailed}
              className={`grid h-10 w-10 place-items-center rounded-full border transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
                bgmEnabled && !musicFailed
                  ? 'border-[#e04f65]/30 bg-[#e04f65]/10 text-[#c93b52]'
                  : 'border-[#1e1b2e]/12 bg-white text-[#494361] hover:bg-[#1e1b2e]/[0.04]'
              }`}
            >
              {bgmEnabled && !musicFailed ? (
                <Music className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* 移动端与平板端：第二行横向可滑动筛选栏 */}
        <nav
          ref={tabRowRef}
          aria-label="画册章节筛选"
          className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 lg:hidden"
        >
          {tabs.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={String(tab.key)}
                type="button"
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.key, el);
                  else tabRefs.current.delete(tab.key);
                }}
                onClick={() => selectTab(tab.key)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150 ${
                  active
                    ? 'text-white shadow-sm'
                    : 'bg-[#1e1b2e]/[0.045] text-[#1e1b2e] active:bg-[#1e1b2e]/[0.09]'
                }`}
                style={active ? { backgroundColor: tab.activeBg } : undefined}
              >
                {!active && tab.dotColor && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tab.dotColor }}
                    aria-hidden="true"
                  />
                )}
                {tab.icon === 'stories' && <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {tab.icon === 'videos' && <Clapperboard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>{tab.label}</span>
                <span className={`font-display text-[11.5px] tabular-nums ${active ? 'text-white/85' : 'text-[#494361]'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
