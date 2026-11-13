/**
 * 应用装配（Designeer 瑞士极简网格 × React Bits 手机相册）
 * ------------------------------------------------------------
 *   - 顶栏常驻 AlbumHeader（极简建筑线 + 双主题切换 + 章节横滑条）；
 *   - 主舞台按 Bottom Dock 的 viewMode 切换 3D 环幕 / 3D 叠片 / 瑞士网格 / 婚礼影像；
 *   - 底部悬浮 FloatingDock（单手拇指一键切模式）；
 *   - 顶层浮层：瑞士档案序言弹窗 EditorialCoverModal、全屏放大灯箱 PhotoLightbox；
 *   - 同步双主题（Swiss Paper / Studio Carbon）、键盘快捷键、手机返回键逐层退避。
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlbumHeader, FloatingDock } from './components/album/AlbumHeader';
import { PhotoGallery } from './components/album/PhotoGallery';
import { PhotoLightbox } from './components/album/PhotoLightbox';
import { VideoTheater } from './components/album/VideoTheater';
import { initBgm } from './media/bgm';
import { useAlbumStore } from './store/useAlbumStore';

/** 将日间（Swiss Paper）/ 暗房（Studio Carbon）主题同步到 html.dark 类名 */
function useThemeSync() {
  const theme = useAlbumStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
}

/** 键盘操作：支持上下左右翻页、灯箱缩放与 Esc 关闭浮层 */
function useKeyboardControls() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      const s = useAlbumStore.getState();

      if (s.lightboxIndex !== null) {
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
        return;
      }

      if (e.key === 'Escape' && s.coverModalOpen) {
        e.preventDefault();
        s.setCoverModalOpen(false);
        return;
      }

      if (s.coverModalOpen || s.viewMode === 'videos' || s.viewMode === 'grid') return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        s.stopAutoplay();
        s.stepReel(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        s.stopAutoplay();
        s.stepReel(-1);
      } else if (e.key === ' ') {
        if (tag === 'BUTTON') return;
        e.preventDefault();
        s.toggleAutoplay();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** 手机返回键：打开灯箱或序言浮层时拦截一次返回用于关闭 */
function useOverlayBackButton() {
  const anyOverlayOpen = useAlbumStore(
    (s) => s.lightboxIndex !== null || s.coverModalOpen,
  );
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
      else if (s.coverModalOpen) s.setCoverModalOpen(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (anyOverlayOpen && !pushedRef.current) {
      window.history.pushState({ blissOverlay: true }, '');
      pushedRef.current = true;
    } else if (!anyOverlayOpen && pushedRef.current) {
      pushedRef.current = false;
      ignorePopRef.current += 1;
      window.history.back();
    }
  }, [anyOverlayOpen]);
}

export default function App() {
  const viewMode = useAlbumStore((s) => s.viewMode);
  const lightboxOpen = useAlbumStore((s) => s.lightboxIndex !== null);
  const coverModalOpen = useAlbumStore((s) => s.coverModalOpen);

  useEffect(() => initBgm(), []);
  useThemeSync();
  useKeyboardControls();
  useOverlayBackButton();

  const overlayActive = lightboxOpen || coverModalOpen;

  return (
    <div
      className="relative h-full w-full select-none overflow-hidden"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      <AlbumHeader />

      <main className="h-full w-full" aria-hidden={overlayActive}>
        {viewMode === 'videos' ? <VideoTheater /> : <PhotoGallery />}
      </main>

      <FloatingDock />

      <AnimatePresence>
        {lightboxOpen && <PhotoLightbox key="lightbox" />}
      </AnimatePresence>
    </div>
  );
}
