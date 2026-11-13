/**
 * 相册查看器状态中枢（zustand）
 * ------------------------------------------------------------
 * 管理 Designeer 瑞士极简网格 × React Bits 三合一视图的全局状态：
 *   - viewMode: 'arc'（3D 环幕）| 'stack'（3D 叠片）| 'grid'（瑞士瀑布流）| 'videos'（婚礼影像）
 *   - theme: 'light'（美术馆柔白）| 'dark'（暗房碳黑）
 *   - filter: 章节与故事筛选（在三大看图模式下全局互通）
 *   - activePhotoIndex: 当前定位/定格的全局照片下标
 *   - coverModalOpen / lightboxIndex / autoplay / bgmEnabled / videoPlaying
 */
import { create } from 'zustand';
import { chapters, photos } from '../data/library';

export type AlbumFilter = 'all' | 'stories' | 'videos' | number;
export type ViewMode = 'arc' | 'stack' | 'grid' | 'videos';
export type ThemeMode = 'light' | 'dark';

const ALL_PHOTO_INDICES = photos.map((p) => p.index);
const STORY_PHOTO_INDICES = photos.filter((p) => Boolean(p.title ?? p.story)).map((p) => p.index);

/** 根据筛选条件返回有序的照片全局下标列表 */
function resolveFilteredList(filter: AlbumFilter): number[] {
  if (filter === 'stories') return STORY_PHOTO_INDICES;
  if (typeof filter === 'number') {
    const ch = chapters[filter];
    if (!ch) return ALL_PHOTO_INDICES;
    return photos.slice(ch.start, ch.start + ch.count).map((p) => p.index);
  }
  return ALL_PHOTO_INDICES;
}

export interface AlbumState {
  viewMode: ViewMode;
  theme: ThemeMode;
  filter: AlbumFilter;
  /** 当前中心/定位的全局照片下标 */
  activePhotoIndex: number;
  /** 3D 环幕或叠片自动巡航开关 */
  autoplay: boolean;
  /** 瑞士档案扉页与索引浮层开关 */
  coverModalOpen: boolean;
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
  stepReel: (delta: number) => void;
  toggleAutoplay: () => void;
  stopAutoplay: () => void;
  setCoverModalOpen: (open: boolean) => void;
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
  viewMode: 'arc',
  theme: 'light',
  filter: 'all',
  activePhotoIndex: photos[0]?.index ?? 0,
  autoplay: false,
  coverModalOpen: false,
  lightboxIndex: null,
  lightboxList: ALL_PHOTO_INDICES,
  lastViewedIndex: null,
  slideshow: false,
  bgmEnabled: true,
  videoPlaying: false,

  setViewMode: (viewMode) => {
    set({
      viewMode,
      autoplay: false,
      ...(viewMode !== 'videos' ? { videoPlaying: false } : {}),
    });
  },

  toggleTheme: () =>
    set((s) => ({
      theme: s.theme === 'light' ? 'dark' : 'light',
    })),

  setFilter: (filter) => {
    if (filter === 'videos') {
      set({ viewMode: 'videos', autoplay: false, slideshow: false });
      return;
    }
    const list = resolveFilteredList(filter);
    const current = get().activePhotoIndex;
    const nextIndex = list.includes(current) ? current : (list[0] ?? 0);
    set((s) => ({
      filter,
      activePhotoIndex: nextIndex,
      slideshow: false,
      viewMode: s.viewMode === 'videos' ? 'arc' : s.viewMode,
    }));
  },

  setActivePhotoIndex: (photoIndex) => {
    if (photos.length === 0) return;
    if (get().activePhotoIndex !== photoIndex) {
      set({ activePhotoIndex: photoIndex, lastViewedIndex: photoIndex });
    }
  },

  stepReel: (delta) => {
    const { filter, activePhotoIndex } = get();
    const list = resolveFilteredList(filter);
    if (list.length === 0) return;
    const pos = Math.max(0, list.indexOf(activePhotoIndex));
    const nextPos = (pos + delta + list.length) % list.length;
    const nextIndex = list[nextPos];
    set({ activePhotoIndex: nextIndex, lastViewedIndex: nextIndex });
  },

  toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),

  stopAutoplay: () => {
    if (get().autoplay) set({ autoplay: false });
  },

  setCoverModalOpen: (coverModalOpen) =>
    set({ coverModalOpen, ...(coverModalOpen ? { autoplay: false } : {}) }),

  openLightbox: (photoIndex, list, startSlideshow = false) => {
    if (photos.length === 0) return;
    const validList = list && list.length > 0 ? list : ALL_PHOTO_INDICES;
    const target = validList.includes(photoIndex) ? photoIndex : validList[0];
    set({
      autoplay: false,
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
