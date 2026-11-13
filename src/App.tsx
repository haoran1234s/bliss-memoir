/**
 * 应用装配（精装摄影画册 + 暗房全屏看图器）
 * ------------------------------------------------------------
 * 扁平直达、零晃动、零复杂层级：
 *   - 主滚动容器内：吸顶导航 → 精装扉页（全部视图）→ 无眩晕照片画廊 → 婚礼影像 → 页脚；
 *   - 顶层浮层：暗房级全屏照片检视器（PhotoLightbox）；
 *   - 统一处理：背景音乐初始化与清理、章节强调色同步、键盘翻页与 Esc/空格控制、移动端返回键关灯箱。
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import { AlbumHeader } from './components/album/AlbumHeader';
import { HeroCover } from './components/album/HeroCover';
import { PhotoGallery } from './components/album/PhotoGallery';
import { PhotoLightbox } from './components/album/PhotoLightbox';
import { VideoTheater } from './components/album/VideoTheater';
import { chapters, photos, videos } from './data/library';
import { couple } from './data/memoirData';
import { initBgm } from './media/bgm';
import { useAlbumStore } from './store/useAlbumStore';
import { DEFAULT_ACCENT, mixHex, paletteOf } from './theme/palettes';

/** 界面强调色跟着当前选中章节（打开大图时跟着照片所属章节） */
function useAccentColor() {
  const chapterIndex = useAlbumStore((s) => {
    if (s.lightboxIndex !== null) return photos[s.lightboxIndex]?.chapter ?? -1;
    if (typeof s.filter === 'number') return s.filter;
    return -1;
  });

  useEffect(() => {
    const ch = chapters[chapterIndex];
    const p = ch ? paletteOf(ch.palette, ch.index) : DEFAULT_ACCENT;
    const root = document.documentElement.style;
    root.setProperty('--accent', p.accent);
    root.setProperty('--accent-deep', mixHex(p.accent, '#1e1b2e', 0.22));
    root.setProperty('--accent-soft', p.soft);
  }, [chapterIndex]);
}

/** 键盘操作：仅在全屏灯箱打开时接管左右切图、空格放映与 Esc 关闭 */
function useLightboxKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      const s = useAlbumStore.getState();
      if (s.lightboxIndex === null) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        s.closeLightbox();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        s.stopSlideshow();
        s.stepLightbox(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        s.stopSlideshow();
        s.stepLightbox(-1);
      } else if (e.key === ' ') {
        if (tag === 'BUTTON') return;
        e.preventDefault();
        s.toggleSlideshow();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** 手机返回键：打开大图时拦截一次返回，用于关闭灯箱而非离开页面 */
function useLightboxBackButton() {
  const isOpen = useAlbumStore((s) => s.lightboxIndex !== null);
  const pushedRef = useRef(false);
  const ignorePopRef = useRef(0);

  useEffect(() => {
    const onPopState = () => {
      if (ignorePopRef.current > 0) {
        ignorePopRef.current -= 1;
        return;
      }
      if (!pushedRef.current) return;
      pushedRef.current = false;
      const s = useAlbumStore.getState();
      if (s.lightboxIndex !== null) s.closeLightbox();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (isOpen && !pushedRef.current) {
      window.history.pushState({ blissLightbox: true }, '');
      pushedRef.current = true;
    } else if (!isOpen && pushedRef.current) {
      pushedRef.current = false;
      ignorePopRef.current += 1;
      window.history.back();
    }
  }, [isOpen]);
}

export default function App() {
  const filter = useAlbumStore((s) => s.filter);
  const lightboxOpen = useAlbumStore((s) => s.lightboxIndex !== null);
  const scrollRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => initBgm(), []);
  useAccentColor();
  useLightboxKeyboard();
  useLightboxBackButton();

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#fcfafb] text-[#1e1b2e]">
      {/* 主纵向滚动容器：打开全屏灯箱时底层天然不产生页面级跳动 */}
      <div
        ref={scrollRootRef}
        className="h-full w-full overflow-y-auto overscroll-y-contain"
        aria-hidden={lightboxOpen}
      >
        <AlbumHeader scrollRootRef={scrollRootRef} />

        <main className="px-safe">
          {filter === 'all' && <HeroCover scrollRootRef={scrollRootRef} />}
          {filter !== 'videos' && <PhotoGallery />}
          {(filter === 'all' || filter === 'videos') && videos.length > 0 && <VideoTheater />}
        </main>

        <footer className="px-safe pb-safe">
          <div className="mx-auto max-w-6xl border-t border-[#1e1b2e]/[0.08] px-4 py-10 text-center sm:px-6">
            <div className="inline-flex items-center gap-2 font-fun text-[17px] text-[#1e1b2e]">
              <span>{couple.groomName}</span>
              <Heart className="h-4 w-4 text-[#e04f65]" fill="currentColor" strokeWidth={0} aria-hidden="true" />
              <span>{couple.brideName}</span>
            </div>
            <p className="mt-2 text-[14px] text-[#494361]">{couple.farewell}</p>
            <p className="mt-1 font-display text-[12px] tracking-[0.16em] text-[#494361]/80">{couple.date}</p>
          </div>
        </footer>
      </div>

      <AnimatePresence>{lightboxOpen && <PhotoLightbox key="lightbox" />}</AnimatePresence>
    </div>
  );
}
