/**
 * 全局状态中枢（zustand）
 * ------------------------------------------------------------
 * 只保存「离散的界面 / 逻辑状态」：当前阶段、走到第几站、正在看哪张照片、
 * 各个浮层的开关。连续变化的镜头进度放在 three/cameraInput.ts 的模块单例里，
 * 避免每帧 setState 造成 React 重渲染。
 *
 * 花园布局（world）也放在这里：屏幕从竖屏变成横屏时会换一种列数重新排布，
 * 所有 3D 组件订阅 world，自动跟着重建。
 */
import { create } from 'zustand';
import { photos, videos } from '../data/library';
import { getDeviceTier } from '../hooks/useDeviceTier';
import { buildWorld, colsForAspect, type Cols, type World } from '../three/world';
import { cam, clamp, jumpTo } from '../three/cameraInput';
import type { AppPhase } from '../types';

const tier = getDeviceTier();

const viewportAspect = () =>
  typeof window === 'undefined' ? 1.6 : window.innerWidth / Math.max(1, window.innerHeight);

interface CinemaState {
  open: boolean;
  videoId: string;
  /** 关灯观影（星空夜晚） */
  dark: boolean;
}

/** 屏幕上的一个矩形（CSS 像素） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 开场加载的各项进度 */
interface BootState {
  fonts: boolean;
  /** 3D 场景已经画出第一帧 */
  scene: boolean;
  /** 入口附近的照片图集加载进度 0~1 */
  photos: number;
}

interface MemoirStore {
  /* —— 状态 —— */
  phase: AppPhase;
  /** 平面版：设备跑不了 3D（或 3D 出错），花园换成一张静态页面，以相册为主 */
  flat: boolean;
  world: World;
  /** 镜头当前最靠近的站 */
  stop: number;
  boot: BootState;
  /** 正在高清检视的照片序号；null = 没有打开 */
  detail: number | null;
  /** 检视层从屏幕上哪个位置「长」出来（点的是 3D 里的照片卡或相册缩略图时才有） */
  detailFrom: Rect | null;
  /** 最近看过的照片（相册打开时滚到它附近，并描一圈边） */
  lastPhoto: number;
  gridOpen: boolean;
  cinema: CinemaState;
  /** 影院有声模式（true 时背景音乐让路） */
  cinemaSound: boolean;
  audioEnabled: boolean;
  gyroEnabled: boolean;
  /** 自动漫游 */
  touring: boolean;
  /** 「云朵转场」遮罩（远距离跳转时用） */
  wipe: boolean;
  /** 用户已经自己滑动过（之后不再显示手势提示） */
  hintsSeen: boolean;
  /** 撒花计数：每 +1 触发一次彩纸 */
  confetti: number;

  /* —— 动作 —— */
  goFlat: () => void;
  setBoot: (patch: Partial<BootState>) => void;
  showPrelude: () => void;
  enterGallery: () => void;
  setStop: (index: number) => void;
  goToStop: (index: number, instant?: boolean) => void;
  step: (delta: number) => void;
  goToChapter: (chapter: number) => void;
  /** keepGrid：从相册点开的大图叠在相册上面，关掉后回到相册原来的位置 */
  openPhoto: (index: number, from?: Rect | null, keepGrid?: boolean) => void;
  closePhoto: () => void;
  stepPhoto: (delta: number) => void;
  openCinema: (videoId?: string) => void;
  closeCinema: () => void;
  setVideo: (id: string) => void;
  toggleCinemaDark: () => void;
  toggleCinemaSound: () => void;
  openGrid: () => void;
  closeGrid: () => void;
  toggleGyro: () => void;
  toggleAudio: () => void;
  toggleTour: () => void;
  stopTour: () => void;
  markHintsSeen: () => void;
  celebrate: () => void;
  relayout: (cols: Cols) => void;
}

let wipeTimer = 0;

export const useStore = create<MemoirStore>((set, get) => ({
  phase: 'loading',
  flat: !tier.webgl2,
  world: buildWorld(colsForAspect(viewportAspect()), tier.flora),
  stop: 0,
  // 平面版没有 3D 第一帧和照片图集可等
  boot: { fonts: false, scene: !tier.webgl2, photos: photos.length && tier.webgl2 ? 0 : 1 },
  detail: null,
  detailFrom: null,
  lastPhoto: -1,
  gridOpen: false,
  cinema: { open: false, videoId: videos[0]?.id ?? '', dark: false },
  cinemaSound: false,
  audioEnabled: true,
  gyroEnabled: false,
  touring: false,
  wipe: false,
  hintsSeen: false,
  confetti: 0,

  goFlat: () => {
    if (get().flat) return;
    set({ flat: true, touring: false, wipe: false, boot: { ...get().boot, scene: true, photos: 1 } });
    if (get().phase === 'gallery' && !get().cinema.open) set({ gridOpen: true });
  },

  setBoot: (patch) => {
    const boot = get().boot;
    const next = { ...boot, ...patch };
    if (next.fonts !== boot.fonts || next.scene !== boot.scene || next.photos !== boot.photos) set({ boot: next });
  },

  showPrelude: () => {
    if (get().phase === 'loading') set({ phase: 'prelude' });
  },

  enterGallery: () => {
    // 平面版进门直接打开相册
    set({ phase: 'gallery', confetti: get().confetti + 1, gridOpen: get().flat });
    // 进门：从拱门外滑到第一块封面牌前
    cam.target = Math.min(1, get().world.stops.length - 1);
  },

  setStop: (index) => {
    if (get().stop !== index) set({ stop: index });
  },

  goToStop: (index, instant = false) => {
    const max = get().world.stops.length - 1;
    const to = clamp(Math.round(index), 0, max);
    window.clearTimeout(wipeTimer);
    if (get().flat) {
      // 平面版没有镜头可走，也不需要云朵转场
      jumpTo(to);
      return;
    }
    if (instant) {
      // 场景被浮层挡着（正在检视照片）：不用转场，直接到位
      if (Math.abs(to - cam.value) > 1.2) jumpTo(to);
      else cam.target = to;
      if (get().wipe) set({ wipe: false });
    } else if (Math.abs(to - cam.value) > 3.4) {
      // 离得远：云朵遮一下，直接落到目的地前一点，再滑进去
      set({ wipe: true });
      wipeTimer = window.setTimeout(() => {
        const dir = Math.sign(to - cam.value) || 1;
        jumpTo(clamp(to - dir * 0.7, 0, max), to);
        set({ wipe: false });
      }, 320);
    } else {
      cam.target = to;
    }
  },

  step: (delta) => {
    const max = get().world.stops.length - 1;
    get().goToStop(clamp(Math.round(cam.target) + delta, 0, max));
  },

  goToChapter: (chapter) => {
    const { world } = get();
    const stop = chapter < 0 ? 0 : (world.chapterStop[chapter] ?? world.stops.length - 1);
    set({ detail: null, gridOpen: false, touring: false });
    if (get().cinema.open) get().closeCinema();
    get().goToStop(stop);
  },

  openPhoto: (index, from = null, keepGrid = false) => {
    if (index < 0 || index >= photos.length) return;
    const { world } = get();
    set({
      detail: index,
      detailFrom: from,
      lastPhoto: index,
      gridOpen: keepGrid && get().gridOpen,
      touring: false,
    });
    if (get().cinema.open) get().closeCinema();
    // 镜头在背后同步走到这张照片所在的架子，关掉检视层时正好站在它面前
    get().goToStop(world.photoStop[index], true);
  },

  closePhoto: () => set({ detail: null, detailFrom: null }),

  stepPhoto: (delta) => {
    const cur = get().detail;
    if (cur === null || photos.length === 0) return;
    const next = (cur + delta + photos.length) % photos.length;
    set({ detail: next, lastPhoto: next });
    get().goToStop(get().world.photoStop[next], true);
  },

  openCinema: (videoId) => {
    const { world } = get();
    set({
      detail: null,
      gridOpen: false,
      touring: false,
      cinemaSound: true, // 进入影院即解除静音
      cinema: { ...get().cinema, open: true, videoId: videoId ?? get().cinema.videoId },
    });
    get().goToStop(world.stops.length - 1);
  },

  closeCinema: () =>
    set({
      cinemaSound: false,
      cinema: { ...get().cinema, open: false, dark: false },
    }),

  setVideo: (id) => set({ cinema: { ...get().cinema, videoId: id } }),

  toggleCinemaDark: () => set({ cinema: { ...get().cinema, dark: !get().cinema.dark } }),

  toggleCinemaSound: () => set({ cinemaSound: !get().cinemaSound }),

  openGrid: () => set({ gridOpen: true, touring: false }),
  closeGrid: () => set({ gridOpen: false }),

  toggleGyro: () => set({ gyroEnabled: !get().gyroEnabled }),
  toggleAudio: () => set({ audioEnabled: !get().audioEnabled }),

  toggleTour: () => {
    const on = !get().touring;
    set({ touring: on, hintsSeen: true });
    // 已经走到尽头时再点「自动漫游」，就从头开始
    if (on && Math.round(cam.target) >= get().world.stops.length - 1) get().goToStop(0);
  },
  stopTour: () => {
    if (get().touring) set({ touring: false });
  },

  markHintsSeen: () => {
    if (!get().hintsSeen) set({ hintsSeen: true });
  },

  celebrate: () => set({ confetti: get().confetti + 1 }),

  relayout: (cols) => {
    const old = get().world;
    if (old.cols === cols) return;
    // 记住当前站对应的第一张照片，重排后回到同一张照片所在的架子
    const here = old.stops[clamp(Math.round(cam.target), 0, old.stops.length - 1)];
    const world = buildWorld(cols, tier.flora);
    let stop = 0;
    if (here.kind === 'cinema') stop = world.stops.length - 1;
    else if (here.kind === 'board') stop = world.chapterStop[here.chapter] ?? 0;
    else if (here.kind === 'rack' && photos.length) stop = world.photoStop[clamp(here.first, 0, photos.length - 1)];
    jumpTo(stop);
    set({ world, stop });
  },
}));

/** 当前站的章节序号：入口 = -1，影院 = 章节数。 */
export const currentChapter = (s: MemoirStore) => s.world.stops[s.stop]?.chapter ?? -1;
