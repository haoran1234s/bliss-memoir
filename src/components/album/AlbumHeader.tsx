/**
 * 极简分类顶栏 + 底部悬浮 Dock
 * ------------------------------------------------------------
 *   1. AlbumHeader：仅保留一行纯净分类切换栏（全部 / 各章节）与日夜/音乐纯图标开关，
 *      彻底移除姓名、计数与多余按钮文字；
 *   2. FloatingDock：复刻 DavidHDev/react-bits 的底部悬浮交互 Dock。
 */
import { useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Disc3,
  LayoutGrid,
  Layers,
  Moon,
  Sun,
  VolumeX,
} from 'lucide-react';
import { chapters, videos } from '../../data/library';
import { unlockBgmNow, useBgmStatus } from '../../media/bgm';
import { useAlbumStore, type AlbumFilter, type ViewMode } from '../../store/useAlbumStore';

export function AlbumHeader() {
  const viewMode = useAlbumStore((s) => s.viewMode);
  const theme = useAlbumStore((s) => s.theme);
  const filter = useAlbumStore((s) => s.filter);
  const bgmEnabled = useAlbumStore((s) => s.bgmEnabled);
  const musicFailed = useBgmStatus((s) => s.musicFailed);

  const { setFilter, toggleTheme, toggleBgm } = useAlbumStore.getState();

  const tabRowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<AlbumFilter, HTMLButtonElement>());

  useEffect(() => {
    const row = tabRowRef.current;
    const btn = tabRefs.current.get(filter);
    if (!row || !btn) return;
    const targetLeft = btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [filter]);

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
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-3 sm:h-13 sm:px-6">
        {/* 单行纯净分类切换条 */}
        {viewMode !== 'videos' ? (
          <nav
            ref={tabRowRef}
            aria-label="照片分类"
            className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1"
          >
            <button
              type="button"
              ref={(el) => {
                if (el) tabRefs.current.set('all', el);
                else tabRefs.current.delete('all');
              }}
              onClick={() => setFilter('all')}
              className="inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors"
              style={{
                backgroundColor: filter === 'all' ? 'var(--ink)' : 'transparent',
                color: filter === 'all' ? 'var(--bg)' : 'var(--ink-soft)',
              }}
            >
              全部
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
                  className="inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--bg)' : 'var(--ink-soft)',
                  }}
                >
                  {ch.title}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="min-w-0 flex-1 px-1 text-[14px] font-medium text-[var(--ink)]">
            婚礼影像
          </div>
        )}

        {/* 右侧极简纯图标控制 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? '切换为暗房模式' : '切换为日间模式'}
            className="grid h-8 w-8 place-items-center rounded-full border transition-colors active:scale-95"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
            }}
          >
            {theme === 'light' ? (
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleMusic}
            disabled={musicFailed}
            aria-label={bgmEnabled && !musicFailed ? '关闭背景音乐' : '开启背景音乐'}
            aria-pressed={bgmEnabled && !musicFailed}
            className="grid h-8 w-8 place-items-center rounded-full border transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
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
        aria-label="视图切换"
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
              className="relative flex h-11 min-w-[66px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 transition-[transform,background-color,color] duration-200 active:scale-95 sm:min-w-[76px]"
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
