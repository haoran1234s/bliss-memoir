/**
 * 胶片转轮剧场公共辅助函数
 * ------------------------------------------------------------
 * 提供筛选照片列表、罗马章节编号、3 位底片档案编号及和缓动画曲线常量，
 * 供顶栏、3D 转轮舞台、底片抽屉与全屏看图器共享。
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

/** 罗马数字映射（覆盖全部章节序号） */
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** 将从 1 开始的序号转换为罗马数字 */
export function toRoman(num: number): string {
  if (num >= 1 && num <= ROMAN_NUMERALS.length) {
    return ROMAN_NUMERALS[num - 1];
  }
  return String(num);
}

/** 格式化 3 位档案底片编号（如 001..216） */
export function formatFrameNo(n: number): string {
  return String(Math.max(1, n)).padStart(3, '0');
}

/** 根据当前筛选条件返回对应的照片下标列表 */
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

/** 根据当前筛选条件返回对应的 Photo 对象数组 */
export function getFilteredPhotos(filter: AlbumFilter): Photo[] {
  if (filter === 'stories') {
    return STORY_PHOTOS;
  }
  if (typeof filter === 'number') {
    const ch = chapters[filter];
    if (!ch) return photos;
    return photos.slice(ch.start, ch.start + ch.count);
  }
  return photos;
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
 */
export function accessiblePillColor(accentHex: string): string {
  let color = mixHex(accentHex, '#121216', 0.24);
  let ratio = 1.05 / (relativeLuminance(color) + 0.05);
  let step = 0.28;
  while (ratio < 4.6 && step <= 0.68) {
    color = mixHex(accentHex, '#121216', step);
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
