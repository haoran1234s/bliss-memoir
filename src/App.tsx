/**
 * 应用装配（黑金 3D 弧形胶片转轮剧场 + 暗房全屏检视器）
 * ------------------------------------------------------------
 * 全屏固定零眩晕剧场布局：
 *   - 顶层常驻 HUD 档案栏（AlbumHeader）+ 全屏 3D 弧形胶片转轮（PhotoGallery）；
 *   - 顶层按需浮层：35mm 底片抽屉、婚礼影像放映厅、精装扉页序言、暗房缩放灯箱；
 *   - 统一处理：背景音乐初始化、章节主题变量、键盘上下/左右操作与手机返回键逐层关闭弹窗。
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlbumHeader } from './components/album/AlbumHeader';
import { ContactSheetDrawer, EditorialCoverModal } from './components/album/HeroCover';
import { PhotoGallery } from './components/album/PhotoGallery';
import { PhotoLightbox } from './components/album/PhotoLightbox';
import { VideoTheater } from './components/album/VideoTheater';
import { chapters, photos } from './data/library';
import { initBgm } from './media/bgm';
import { useAlbumStore } from './store/useAlbumStore';
import { DEFAULT_ACCENT, mixHex, paletteOf } from './theme/palettes';

/** 界面 CSS 强调色变量同步（保持香槟金主体与章节数据关联） */
function useAccentColor() {
  const chapterIndex = useAlbumStore((s) => {
    if (s.lightboxIndex !== null) return photos[s.lightboxIndex]?.chapter ?? -1;
    if (typeof s.filter === 'number') return s.filter;
    return photos[s.activePhotoIndex]?.chapter ?? -1;
  });

  useEffect(() => {
    const ch = chapters[chapterIndex];
    const p = ch ? paletteOf(ch.palette, ch.index) : DEFAULT_ACCENT;
    const root = document.documentElement.style;
    root.setProperty('--accent', '#c8b28e');
    root.setProperty('--accent-deep', mixHex(p.accent, '#121216', 0.45));
    root.setProperty('--accent-soft', 'rgba(200, 178, 142, 0.14)');
  }, [chapterIndex]);
}

/** 键盘操作：支持上下左右翻动 3D 转轮、灯箱内部切图与 Esc 逐层关闭浮层 */
function useKeyboardControls() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      const s = useAlbumStore.getState();

      // 优先处理全屏灯箱快捷键
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

      // 优先 Esc 关闭当前最上层模态框
      if (e.key === 'Escape') {
        if (s.videoModalOpen) {
          e.preventDefault();
          s.setVideoModalOpen(false);
        } else if (s.indexDrawerOpen) {
          e.preventDefault();
          s.setIndexDrawerOpen(false);
        } else if (s.coverModalOpen) {
          e.preventDefault();
          s.setCoverModalOpen(false);
        }
        return;
      }

      // 主舞台活跃时支持上下/左右键步进 3D 胶片转轮
      if (s.videoModalOpen || s.indexDrawerOpen || s.coverModalOpen) return;
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

/** 手机返回键：打开灯箱、影像放映厅、底片抽屉或序言时拦截返回用于关闭浮层 */
function useOverlayBackButton() {
  const anyOverlayOpen = useAlbumStore(
    (s) =>
      s.lightboxIndex !== null ||
      s.videoModalOpen ||
      s.indexDrawerOpen ||
      s.coverModalOpen,
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
      else if (s.videoModalOpen) s.setVideoModalOpen(false);
      else if (s.indexDrawerOpen) s.setIndexDrawerOpen(false);
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
  const lightboxOpen = useAlbumStore((s) => s.lightboxIndex !== null);
  const indexDrawerOpen = useAlbumStore((s) => s.indexDrawerOpen);
  const videoModalOpen = useAlbumStore((s) => s.videoModalOpen);
  const coverModalOpen = useAlbumStore((s) => s.coverModalOpen);

  useEffect(() => initBgm(), []);
  useAccentColor();
  useKeyboardControls();
  useOverlayBackButton();

  const overlayActive = lightboxOpen || indexDrawerOpen || videoModalOpen || coverModalOpen;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#0b0b0e] text-[#f3efea]">
      {/* 顶层极简 HUD 档案导航 */}
      <AlbumHeader />

      {/* 主舞台：3D 弧形胶片转轮剧场 */}
      <main className="h-full w-full" aria-hidden={overlayActive}>
        <PhotoGallery />
      </main>

      {/* 按需挂载黑金暗房抽屉、放映厅与全屏缩放灯箱 */}
      <AnimatePresence>
        {indexDrawerOpen && <ContactSheetDrawer key="contact-sheet" />}
        {videoModalOpen && <VideoTheater key="video-theater" />}
        {coverModalOpen && <EditorialCoverModal key="editorial-cover" />}
        {lightboxOpen && <PhotoLightbox key="lightbox" />}
      </AnimatePresence>
    </div>
  );
}
