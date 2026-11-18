/**
 * 应用装配（Designeer 瑞士极简网格 × React Bits 手机相册）
 * ------------------------------------------------------------
 *   - 顶栏常驻 AlbumHeader（极简建筑线 + 双主题切换 + 章节横滑条）；
 *   - 主舞台按 Bottom Dock 的 viewMode 切换 瑞士网格 / 婚礼影像（影像按需懒加载）；
 *   - 底部悬浮 FloatingDock（单手拇指一键切模式）；
 *   - 顶层浮层：全屏放大灯箱 PhotoLightbox（点击看图时按需懒加载）；
 *   - 同步双主题（Swiss Paper / Studio Carbon）、键盘快捷键、手机返回键逐层退避。
 */
import { Suspense, lazy, useEffect, useRef } from 'react';
import { AlbumHeader, FloatingDock } from './components/album/AlbumHeader';
import { PhotoGallery } from './components/album/PhotoGallery';
import { initBgm } from './media/bgm';
import { useAlbumStore } from './store/useAlbumStore';

const LazyVideoTheater = lazy(() =>
  import('./components/album/VideoTheater').then((m) => ({ default: m.VideoTheater })),
);
const LazyPhotoLightbox = lazy(() =>
  import('./components/album/PhotoLightbox').then((m) => ({ default: m.PhotoLightbox })),
);

/** 将日间（Swiss Paper）/ 暗房（Studio Carbon）主题同步到 html.dark 与 theme-color */
function useThemeSync() {
  const theme = useAlbumStore((s) => s.theme);
  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0a0a0b' : '#f6f5f2');
  }, [theme]);
}

/** 键盘操作：支持灯箱翻页、幻灯片开关与 Esc 关闭浮层 */
function useKeyboardControls() {
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

/** 手机返回键：打开灯箱时拦截一次返回用于关闭 */
function useOverlayBackButton() {
  const lightboxOpen = useAlbumStore((s) => s.lightboxIndex !== null);
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
    if (lightboxOpen && !pushedRef.current) {
      window.history.pushState({ blissOverlay: true }, '');
      pushedRef.current = true;
    } else if (!lightboxOpen && pushedRef.current) {
      pushedRef.current = false;
      ignorePopRef.current += 1;
      window.history.back();
    }
  }, [lightboxOpen]);
}

export default function App() {
  const viewMode = useAlbumStore((s) => s.viewMode);
  const lightboxOpen = useAlbumStore((s) => s.lightboxIndex !== null);
  const everOpenedLightboxRef = useRef(false);
  if (lightboxOpen) everOpenedLightboxRef.current = true;

  useEffect(() => initBgm(), []);
  useThemeSync();
  useKeyboardControls();
  useOverlayBackButton();

  return (
    <div
      className="relative h-full w-full select-none overflow-hidden"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      <AlbumHeader />

      <main className="h-full w-full" aria-hidden={lightboxOpen}>
        {viewMode === 'videos' ? (
          <Suspense fallback={null}>
            <LazyVideoTheater />
          </Suspense>
        ) : (
          <PhotoGallery />
        )}
      </main>

      <FloatingDock />

      {everOpenedLightboxRef.current && (
        <Suspense fallback={null}>
          <LazyPhotoLightbox />
        </Suspense>
      )}
    </div>
  );
}
