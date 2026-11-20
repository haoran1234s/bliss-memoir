/**
 * 相册辅助函数
 * ------------------------------------------------------------
 * 提供筛选照片列表与和缓动画曲线常量，供画廊与全屏看图器共享。
 */
import { chapters, photos } from '../../data/library';
import type { AlbumFilter } from '../../store/useAlbumStore';
import type { Photo } from '../../types';

/** 平稳克制的指数缓出曲线，无回弹无晃动 */
export const CALM_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const thumbRegistry = new Map<number, HTMLElement>();

/** 注册或注销画廊中指定照片的缩略图 DOM，供灯箱缩放飞出与归位定位使用 */
export function registerPhotoThumbEl(photoIndex: number, el: HTMLElement | null): void {
  if (el) thumbRegistry.set(photoIndex, el);
  else thumbRegistry.delete(photoIndex);
}

/** 获取画廊中指定照片对应的在场缩略图 DOM */
export function getPhotoThumbEl(photoIndex: number): HTMLElement | null {
  const el = thumbRegistry.get(photoIndex) ?? null;
  return el && el.isConnected ? el : null;
}

/** 根据当前筛选条件返回对应的 Photo 对象数组 */
export function getFilteredPhotos(filter: AlbumFilter): Photo[] {
  if (typeof filter === 'number') {
    const ch = chapters[filter];
    if (!ch) return photos;
    return photos.slice(ch.start, ch.start + ch.count);
  }
  return photos;
}
