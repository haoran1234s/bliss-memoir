/**
 * 画册公共辅助函数
 * ------------------------------------------------------------
 * 提供筛选照片列表、对比度安全色计算与和缓动画曲线常量，
 * 供画册导航、扉页、画廊与看图器共享，避免重复逻辑。
 */
import { chapters, photos } from '../../data/library';
import type { AlbumFilter } from '../../store/useAlbumStore';
import { mixHex, paletteOf } from '../../theme/palettes';
import type { Photo } from '../../types';

/** 平稳克制的指数缓出曲线，无回弹无晃动 */
export const CALM_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** 所有带标题或故事手记的照片 */
export const STORY_PHOTOS: Photo[] = photos.filter((p) => Boolean(p.title ?? p.story));

/** 所有照片的全局下标列表 */
export const ALL_PHOTO_INDICES: number[] = photos.map((p) => p.index);

/** 根据当前筛选条件返回对应的照片下标列表（用于打开灯箱与自动放映） */
export function getFilteredPhotoIndices(filter: AlbumFilter): number[] {
  if (filter === 'stories') {
    return STORY_PHOTOS.map((p) => p.index);
  }
  if (typeof filter === 'number') {
    const ch = chapters[filter];
    if (!ch) return ALL_PHOTO_INDICES;
    return photos.slice(ch.start, ch.start + ch.count).map((p) => p.index);
  }
  return ALL_PHOTO_INDICES;
}

/** 计算 #rrggbb 颜色的 WCAG 相对亮度 */
function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0.5;
  const channels = [0, 2, 4].map((offset) => {
    const c = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * 为白字胶囊按钮生成对比度达标（≥ 4.6:1）的主题底色。
 * 对较亮的章节色向深梅子墨 #1e1b2e 混色加深。
 */
export function accessiblePillColor(accentHex: string): string {
  let color = mixHex(accentHex, '#1e1b2e', 0.18);
  let ratio = 1.05 / (relativeLuminance(color) + 0.05);
  let step = 0.24;
  while (ratio < 4.6 && step <= 0.65) {
    color = mixHex(accentHex, '#1e1b2e', step);
    ratio = 1.05 / (relativeLuminance(color) + 0.05);
    step += 0.08;
  }
  return color;
}

/** 获取指定章节对比度安全的强调色 */
export function chapterPillColor(chapterIndex: number): string {
  const ch = chapters[chapterIndex];
  const palette = paletteOf(ch?.palette, chapterIndex);
  return accessiblePillColor(palette.accent);
}
