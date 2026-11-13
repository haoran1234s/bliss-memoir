/**
 * 照片库
 * ------------------------------------------------------------
 * 把「流水线生成的清单」和「memoirData.ts 里手写的文字」合并成
 * 运行时使用的章节 / 照片列表。界面与 3D 场景都只从这里取数据。
 */
import manifestJson from './manifest.json';
import { chapters as chapterMeta, notes, videos as videoList, music as musicInfo } from './memoirData';
import { PALETTE_ORDER } from '../theme/palettes';
import type { Chapter, Manifest, MemoirVideo, MusicInfo, Photo } from '../types';

const manifest = manifestJson as unknown as Manifest;

/** public/ 下的资源路径 → 可访问的地址（兼容部署在子目录）。完整的 http(s) 地址原样返回。 */
export function asset(path: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

/** '01-求婚' → '求婚'；'2023_summer' 之类没有序号前缀的名字保持不变。 */
function prettyFolder(folder: string): string {
  const name = folder.replace(/^\d+\s*[-_.、\s]\s*/, '').trim();
  return name || folder || '我们的照片';
}

/** '2023-08-18' → '2023.08.18' */
const prettyDate = (d?: string) => (d ? d.replace(/-/g, '.') : undefined);

/* ------------------------------------------------------------------ */
/*  章节                                                               */
/* ------------------------------------------------------------------ */
export const chapters: Chapter[] = [];
{
  let start = 0;
  manifest.chapters.forEach((ch, index) => {
    const meta = chapterMeta[ch.folder] ?? {};
    chapters.push({
      index,
      folder: ch.folder,
      title: meta.title ?? prettyFolder(ch.folder),
      subtitle: meta.subtitle ?? '',
      palette: meta.palette ?? PALETTE_ORDER[index % PALETTE_ORDER.length],
      start,
      count: ch.count,
      cover: start,
    });
    start += ch.count;
  });
}

/* ------------------------------------------------------------------ */
/*  照片                                                               */
/* ------------------------------------------------------------------ */
export const photos: Photo[] = manifest.photos.map((p, index) => {
  const chapter = chapters[p.c];
  const note = notes[`${chapter.folder}/${p.f}`] ?? notes[p.f] ?? {};
  return {
    index,
    id: p.id,
    chapter: p.c,
    indexInChapter: index - chapter.start,
    name: p.f,
    w: p.w,
    h: p.h,
    aspect: p.w / Math.max(1, p.h),
    color: p.col,
    page: p.pg,
    rect: p.r,
    thumb: asset(`memoir/thumb/${p.id}.webp`),
    full: asset(`memoir/full/${p.id}.webp`),
    date: note.date ?? prettyDate(p.d),
    title: note.title,
    story: note.story,
    place: note.place,
  };
});

// 指定了封面文件名的章节，把封面换成对应那张
for (const ch of chapters) {
  const want = chapterMeta[ch.folder]?.cover;
  if (!want) continue;
  const hit = photos.find((p) => p.chapter === ch.index && p.name === want);
  if (hit) ch.cover = hit.index;
}

/* ------------------------------------------------------------------ */
/*  图集                                                               */
/* ------------------------------------------------------------------ */
export const atlas = {
  /** 清单里矩形坐标所基于的页面边长 */
  page: manifest.atlas.page,
  perPage: manifest.atlas.perPage,
  pages: manifest.atlas.pages,
  sizes: manifest.atlas.sizes,
  url: (size: number, page: number) => asset(`memoir/atlas/${size}/page-${page}.webp`),
};

/* ------------------------------------------------------------------ */
/*  影音                                                               */
/* ------------------------------------------------------------------ */
export const videos: MemoirVideo[] = videoList.map((v) => ({
  ...v,
  videoUrl: asset(v.videoUrl),
  posterUrl: asset(v.posterUrl),
}));

export const music: MusicInfo = { ...musicInfo, url: asset(musicInfo.url) };

export const hasPhotos = photos.length > 0;
