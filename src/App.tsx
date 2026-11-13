/**
 * 应用装配
 * ------------------------------------------------------------
 * 3D 花园常驻在最底层（加载页和迎宾页的背后就已经在渲染，进门时画面早已就绪），
 * 上面按阶段叠 2D 界面：
 *   loading（加载页）→ prelude（迎宾页）→ gallery（顶栏 + 底部导航）
 * 以及三种浮层：看大图、相册、露天影院控制条。
 *
 * 这里还统一处理：字体预载、媒体初始化、横竖屏切换时重新排布花园、键盘操作、
 * 手机的「返回」关浮层、界面强调色跟着当前章节变。
 * 跑不了 3D 的设备（或 3D 出错时）换成平面版花园，相册、看大图、影院照常可用。
 */
import { Component, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Scene } from './components/three/Scene';
import { CinemaControls } from './components/ui/CinemaControls';
import { CloudWipe } from './components/ui/CloudWipe';
import { Confetti } from './components/ui/Confetti';
import { FlatGarden } from './components/ui/FlatGarden';
import { GridDrawer } from './components/ui/GridDrawer';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { NavBar } from './components/ui/NavBar';
import { PhotoDetail } from './components/ui/PhotoDetail';
import { Prelude } from './components/ui/Prelude';
import { SwipeHint } from './components/ui/SwipeHint';
import { TopBar } from './components/ui/TopBar';
import { chapters, photos, videos } from './data/library';
import { couple } from './data/memoirData';
import { getDeviceTier } from './hooks/useDeviceTier';
import { useGyro } from './hooks/useGyro';
import { cinemaSeekBy, cinemaTogglePlay, initCinema, unlockMedia } from './media/cinema';
import { useStore } from './store/useStore';
import { DEFAULT_ACCENT, mixHex, paletteOf } from './theme/palettes';
import { ensureFonts } from './three/textures';
import { colsForAspect } from './three/world';

const tier = getDeviceTier();

/** 画布贴图上会出现的所有文字：中文字体按字分片，必须按内容预载 */
const CANVAS_TEXT = [
  couple.groomName,
  couple.brideName,
  couple.connector,
  couple.date,
  couple.farewell,
  '张照片我们的影像',
  ...chapters.flatMap((c) => [c.title, c.subtitle]),
  ...videos.map((v) => v.title),
].join('');

function useBoot() {
  useEffect(() => {
    initCinema();
    ensureFonts(CANVAS_TEXT).then(() => useStore.getState().setBoot({ fonts: true }));
  }, []);
}

/** 横竖屏切换：照片架的列数跟着变，整座花园重新排布 */
function useRelayout() {
  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        useStore.getState().relayout(colsForAspect(window.innerWidth / Math.max(1, window.innerHeight)));
      }, 180);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
}

/** 界面强调色跟着当前章节（看大图时跟着照片所在的章节） */
function useAccent() {
  const chapter = useStore((s) =>
    s.detail !== null ? (photos[s.detail]?.chapter ?? -1) : (s.world.stops[s.stop]?.chapter ?? -1),
  );
  useEffect(() => {
    const ch = chapters[chapter];
    const p = ch ? paletteOf(ch.palette, ch.index) : DEFAULT_ACCENT;
    const root = document.documentElement.style;
    root.setProperty('--accent', p.accent);
    root.setProperty('--accent-deep', mixHex(p.accent, '#3a3355', 0.2));
    root.setProperty('--accent-soft', p.soft);
  }, [chapter]);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range')) return;
      // 焦点在按钮上时，空格 / 回车交给按钮自己
      if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;

      const s = useStore.getState();
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown';
      const backward = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp';

      if (s.phase === 'prelude') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          unlockMedia();
          s.enterGallery();
        }
        return;
      }
      if (s.phase !== 'gallery') return;

      if (s.detail !== null) {
        if (e.key === 'Escape') s.closePhoto();
        else if (forward || e.key === ' ') {
          e.preventDefault();
          s.stepPhoto(1);
        } else if (backward) {
          e.preventDefault();
          s.stepPhoto(-1);
        }
        return;
      }
      if (s.gridOpen) {
        if (e.key === 'Escape') s.closeGrid();
        return;
      }
      if (s.cinema.open) {
        if (e.key === 'Escape') s.closeCinema();
        else if (e.key === ' ' || e.key === 'k') {
          e.preventDefault();
          cinemaTogglePlay();
        } else if (e.key === 'ArrowRight') cinemaSeekBy(5);
        else if (e.key === 'ArrowLeft') cinemaSeekBy(-5);
        return;
      }

      const last = s.world.stops.length - 1;
      if (forward || backward || e.key === ' ') {
        e.preventDefault();
        s.markHintsSeen();
        s.stopTour();
        s.step(backward ? -1 : 1);
      } else if (e.key === 'Home') {
        s.goToChapter(-1);
      } else if (e.key === 'End') {
        s.goToChapter(chapters.length);
      } else if (e.key === 'Enter' && s.stop === last) {
        s.openCinema();
      } else if (e.key === 'g' || e.key === 'G') {
        s.openGrid();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * 手机上的「返回」（安卓返回键、微信左上角、iOS 边缘右滑）关掉最上层的浮层，而不是直接离开页面：
 * 每多打开一层浮层就压一条历史记录；用按钮或 Esc 关掉浮层时，再把多出来的记录退掉。
 */
function useBackButton() {
  const depth = useStore((s) => (s.detail !== null ? 1 : 0) + (s.gridOpen ? 1 : 0) + (s.cinema.open ? 1 : 0));
  /** 压进去、还没退掉的记录数 */
  const pushed = useRef(0);
  /** 自己调用 history.go 引起的 popstate，不当作用户按了返回 */
  const ignore = useRef(0);

  useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) {
        ignore.current--;
        return;
      }
      if (pushed.current === 0) return;
      pushed.current--;
      const s = useStore.getState();
      if (s.detail !== null) s.closePhoto();
      else if (s.gridOpen) s.closeGrid();
      else if (s.cinema.open) s.closeCinema();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    while (pushed.current < depth) {
      window.history.pushState({ bliss: true }, '');
      pushed.current++;
    }
    if (pushed.current > depth) {
      const n = pushed.current - depth;
      pushed.current = depth;
      ignore.current++;
      window.history.go(-n);
    }
  }, [depth]);
}

/** 3D 场景出错（创建不了 WebGL 上下文、着色器编译失败等）时，整体换成平面版。 */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[bliss] 3D 场景出错，改用平面版', error);
    useStore.getState().goFlat();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function App() {
  const phase = useStore((s) => s.phase);
  const flat = useStore((s) => s.flat);
  const detailOpen = useStore((s) => s.detail !== null);
  const gridOpen = useStore((s) => s.gridOpen);
  const cinemaOpen = useStore((s) => s.cinema.open);

  useBoot();
  useRelayout();
  useAccent();
  useKeyboard();
  useBackButton();
  useGyro();

  const hud = phase === 'gallery' && !detailOpen && !gridOpen && !cinemaOpen;

  return (
    // 磨砂玻璃（实时背景模糊）只在电脑上开，手机上用实色面板
    <div className={`relative h-full w-full overflow-hidden ${tier.level === 'high' ? 'fx-blur' : ''}`}>
      {flat ? (
        <FlatGarden />
      ) : (
        <SceneBoundary>
          <Scene />
        </SceneBoundary>
      )}

      <AnimatePresence>
        {hud && (
          <motion.div
            key="hud"
            className="pointer-events-none absolute inset-0 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TopBar />
            {!flat && <SwipeHint />}
            {!flat && <NavBar />}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{cinemaOpen && <CinemaControls key="cinema" />}</AnimatePresence>
      <AnimatePresence>{gridOpen && <GridDrawer key="grid" />}</AnimatePresence>
      <AnimatePresence>{detailOpen && <PhotoDetail key="detail" />}</AnimatePresence>
      <AnimatePresence>{phase === 'prelude' && <Prelude key="prelude" />}</AnimatePresence>
      <AnimatePresence>{phase === 'loading' && <LoadingScreen key="loading" />}</AnimatePresence>

      <CloudWipe />
      <Confetti />
    </div>
  );
}
