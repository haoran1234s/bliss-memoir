/**
 * 画册状态中枢（zustand）
 * ------------------------------------------------------------
 * 管理扁平画册与暗房全屏看图器的离散状态：
 *   - 筛选视图（全部 / 故事手记 / 婚礼影像 / 指定章节）
 *   - 排版模式（原比例画廊 / 紧凑方格）
 *   - 全屏灯箱当前照片、翻页队列、自动放映开关
 *   - 背景音乐开关与视频有声播放让路状态
 */
import { create } from 'zustand';
import { photos } from '../data/library';

export type AlbumFilter = 'all' | 'stories' | 'videos' | number;
export type LayoutMode = 'justified' | 'grid';

const ALL_PHOTO_INDICES = photos.map((p) => p.index);

export interface AlbumState {
  filter: AlbumFilter;
  layoutMode: LayoutMode;
  /** 当前在全屏灯箱中查看的照片全局下标；null 表示关闭 */
  lightboxIndex: number | null;
  /** 当前灯箱可左右翻阅的照片全局下标列表 */
  lightboxList: number[];
  /** 最近查看过的照片全局下标（用于在画册中描边标记位置） */
  lastViewedIndex: number | null;
  /** 幻灯片自动放映开关 */
  slideshow: boolean;
  /** 背景音乐开关 */
  bgmEnabled: boolean;
  /** 婚礼视频是否正在有声播放（用于背景音乐自动让路） */
  videoPlaying: boolean;

  setFilter: (filter: AlbumFilter) => void;
  setLayoutMode: (mode: LayoutMode) => void;
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
  layoutMode: 'justified',
  lightboxIndex: null,
  lightboxList: ALL_PHOTO_INDICES,
  lastViewedIndex: null,
  slideshow: false,
  bgmEnabled: true,
  videoPlaying: false,

  setFilter: (filter) => set({ filter, slideshow: false }),

  setLayoutMode: (layoutMode) => set({ layoutMode }),

  openLightbox: (photoIndex, list, startSlideshow = false) => {
    if (photos.length === 0) return;
    const validList = list && list.length > 0 ? list : ALL_PHOTO_INDICES;
    const target = validList.includes(photoIndex) ? photoIndex : validList[0];
    set({
      lightboxIndex: target,
      lightboxList: validList,
      lastViewedIndex: target,
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
    set({ lightboxIndex: nextIndex, lastViewedIndex: nextIndex });
  },

  jumpLightbox: (photoIndex) => {
    const { lightboxList } = get();
    if (!lightboxList.includes(photoIndex)) return;
    set({ lightboxIndex: photoIndex, lastViewedIndex: photoIndex });
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
