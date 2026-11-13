/**
 * 胶片转轮状态中枢（zustand）
 * ------------------------------------------------------------
 * 管理 3D 弧形胶片转轮、暗房抽屉、影像放映厅与全屏检视器的离散状态：
 *   - 筛选视图（全部 / 故事手记 / 指定章节）
 *   - 3D 转轮当前定格照片下标与自动巡航开关
 *   - 底片全览抽屉、婚礼影像放映厅、扉页序言浮层开关
 *   - 全屏灯箱当前照片、翻页队列、自动放映开关
 *   - 背景音乐开关与视频有声播放让路状态
 */
import { create } from 'zustand';
import { chapters, photos } from '../data/library';

export type AlbumFilter = 'all' | 'stories' | 'videos' | number;

const ALL_PHOTO_INDICES = photos.map((p) => p.index);
const STORY_PHOTO_INDICES = photos.filter((p) => Boolean(p.title ?? p.story)).map((p) => p.index);

/** 计算筛选条件对应的照片全局下标队列 */
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
  filter: AlbumFilter;
  /** 当前 3D 转轮定格的照片全局下标 */
  activePhotoIndex: number;
  /** 3D 转轮自动巡航开关 */
  autoplay: boolean;
  /** 35mm 底片全览抽屉开关 */
  indexDrawerOpen: boolean;
  /** 婚礼影像暗房放映厅开关 */
  videoModalOpen: boolean;
  /** 黑金扉页序言浮层开关 */
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

  setFilter: (filter: AlbumFilter) => void;
  setActivePhotoIndex: (photoIndex: number) => void;
  stepReel: (delta: number) => void;
  toggleAutoplay: () => void;
  stopAutoplay: () => void;
  setIndexDrawerOpen: (open: boolean) => void;
  setVideoModalOpen: (open: boolean) => void;
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
  filter: 'all',
  activePhotoIndex: photos[0]?.index ?? 0,
  autoplay: false,
  indexDrawerOpen: false,
  videoModalOpen: false,
  coverModalOpen: false,
  lightboxIndex: null,
  lightboxList: ALL_PHOTO_INDICES,
  lastViewedIndex: null,
  slideshow: false,
  bgmEnabled: true,
  videoPlaying: false,

  setFilter: (filter) => {
    if (filter === 'videos') {
      set({ videoModalOpen: true, autoplay: false, slideshow: false });
      return;
    }
    const list = resolveFilteredList(filter);
    const current = get().activePhotoIndex;
    const nextIndex = list.includes(current) ? current : (list[0] ?? 0);
    set({
      filter,
      activePhotoIndex: nextIndex,
      slideshow: false,
    });
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

  setIndexDrawerOpen: (indexDrawerOpen) =>
    set({ indexDrawerOpen, ...(indexDrawerOpen ? { autoplay: false } : {}) }),

  setVideoModalOpen: (videoModalOpen) =>
    set({
      videoModalOpen,
      ...(videoModalOpen ? { autoplay: false } : { videoPlaying: false }),
    }),

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
