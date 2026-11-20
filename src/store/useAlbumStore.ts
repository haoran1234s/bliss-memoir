/**
 * 相册查看器状态中枢（zustand）
 * ------------------------------------------------------------
 * 管理「网格 + 影像」双模式视图的全局状态：
 *   - viewMode: 'grid'（瑞士瀑布流）| 'videos'（婚礼影像）
 *   - theme: 'light'（美术馆柔白）| 'dark'（暗房碳黑），持久化至 localStorage
 *   - filter: 章节筛选（各章节，默认选中首个分类）
 *   - lightboxIndex / slideshow / bgmEnabled / videoPlaying
 */
import { create } from 'zustand';
import { chapters, photos } from '../data/library';

export type AlbumFilter = number;
export type ViewMode = 'grid' | 'videos';
export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'bliss-theme';
const ALL_PHOTO_INDICES = photos.map((p) => p.index);
const DEFAULT_FILTER: AlbumFilter = chapters[0]?.index ?? 0;

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* 隐私模式等场景下忽略 localStorage 读取异常 */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 根据筛选条件返回有序的照片全局下标列表 */
function resolveFilteredList(filter: AlbumFilter): number[] {
  const ch = chapters[filter];
  if (!ch) return ALL_PHOTO_INDICES;
  return photos.slice(ch.start, ch.start + ch.count).map((p) => p.index);
}

const DEFAULT_FILTERED_INDICES = resolveFilteredList(DEFAULT_FILTER);

export interface AlbumState {
  viewMode: ViewMode;
  theme: ThemeMode;
  filter: AlbumFilter;
  /** 当前定位的照片全局下标 */
  activePhotoIndex: number;
  /** 当前在全屏灯箱中查看的照片全局下标；null 表示关闭 */
  lightboxIndex: number | null;
  /** 当前灯箱可左右翻阅的照片全局下标列表 */
  lightboxList: number[];
  /** 最近查看过的照片全局下标 */
  lastViewedIndex: number | null;
  /** 灯箱幻灯片自动放映开关 */
  slideshow: boolean;
  /** 背景音乐开关 */
  bgmEnabled: boolean;
  /** 婚礼视频是否正在有声播放（用于背景音乐自动让路） */
  videoPlaying: boolean;

  setViewMode: (mode: ViewMode) => void;
  toggleTheme: () => void;
  setFilter: (filter: AlbumFilter) => void;
  setActivePhotoIndex: (photoIndex: number) => void;
  openLightbox: (photoIndex: number, list?: number[], startSlideshow?: boolean) => void;
  closeLightbox: () => void;
  stepLightbox: (delta: number) => void;
  jumpLightbox: (photoIndex: number) => void;
  toggleSlideshow: () => void;
  stopSlideshow: () => void;
  toggleBgm: () => void;
  setVideoPlaying: (playing: boolean) => void;
}

export const useAlbumStore = create<AlbumState>((set, get) => ({
  viewMode: 'grid',
  theme: getInitialTheme(),
  filter: DEFAULT_FILTER,
  activePhotoIndex: DEFAULT_FILTERED_INDICES[0] ?? 0,
  lightboxIndex: null,
  lightboxList: DEFAULT_FILTERED_INDICES,
  lastViewedIndex: null,
  slideshow: false,
  bgmEnabled: true,
  videoPlaying: false,

  setViewMode: (viewMode) => {
    set({
      viewMode,
      ...(viewMode !== 'videos' ? { videoPlaying: false } : {}),
    });
  },

  toggleTheme: () =>
    set((s) => {
      const next: ThemeMode = s.theme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* 忽略存储受限异常 */
      }
      return { theme: next };
    }),

  setFilter: (filter) => {
    const list = resolveFilteredList(filter);
    const current = get().activePhotoIndex;
    const nextIndex = list.includes(current) ? current : (list[0] ?? 0);
    set((s) => ({
      filter,
      activePhotoIndex: nextIndex,
      slideshow: false,
      viewMode: s.viewMode === 'videos' ? 'grid' : s.viewMode,
    }));
  },

  setActivePhotoIndex: (photoIndex) => {
    if (photos.length === 0) return;
    if (get().activePhotoIndex !== photoIndex) {
      set({ activePhotoIndex: photoIndex, lastViewedIndex: photoIndex });
    }
  },

  openLightbox: (photoIndex, list, startSlideshow = false) => {
    if (photos.length === 0) return;
    const validList = list && list.length > 0 ? list : ALL_PHOTO_INDICES;
    const target = validList.includes(photoIndex) ? photoIndex : validList[0];
    set({
      lightboxIndex: target,
      lightboxList: validList,
      lastViewedIndex: target,
      activePhotoIndex: target,
      slideshow: startSlideshow,
    });
  },

  closeLightbox: () => set({ lightboxIndex: null, slideshow: false }),

  stepLightbox: (delta) => {
    const { lightboxIndex, lightboxList } = get();
    if (lightboxIndex === null || lightboxList.length === 0) return;
    const pos = lightboxList.indexOf(lightboxIndex);
    const currentPos = pos >= 0 ? pos : 0;
    const nextPos = (currentPos + delta + lightboxList.length) % lightboxList.length;
    const nextIndex = lightboxList[nextPos];
    set({
      lightboxIndex: nextIndex,
      lastViewedIndex: nextIndex,
      activePhotoIndex: nextIndex,
    });
  },

  jumpLightbox: (photoIndex) => {
    const { lightboxList } = get();
    if (!lightboxList.includes(photoIndex)) return;
    set({
      lightboxIndex: photoIndex,
      lastViewedIndex: photoIndex,
      activePhotoIndex: photoIndex,
    });
  },

  toggleSlideshow: () => set((s) => ({ slideshow: !s.slideshow })),

  stopSlideshow: () => {
    if (get().slideshow) set({ slideshow: false });
  },

  toggleBgm: () => set((s) => ({ bgmEnabled: !s.bgmEnabled })),

  setVideoPlaying: (videoPlaying) => {
    if (get().videoPlaying !== videoPlaying) set({ videoPlaying });
  },
}));
