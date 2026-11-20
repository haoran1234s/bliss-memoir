/**
 * 照片库
 * ------------------------------------------------------------
 * 把「流水线生成的清单」和「memoirData.ts 里手写的文字」合并成
 * 运行时使用的章节 / 照片列表。
 */
import manifestJson from './manifest.json';
import { chapters as chapterMeta, notes, videos as videoList, music as musicInfo } from './memoirData';
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
      start,
      count: ch.count,
      cover: start,
    });
    start += ch.count;
  });
}

/* ------------------------------------------------------------------ */
/*  照片（支持按章节配置的 order 重排）                                  */
/* ------------------------------------------------------------------ */
const orderedManifestPhotos = (() => {
  const byChapter = new Map<number, typeof manifest.photos>();
  for (const p of manifest.photos) {
    const bucket = byChapter.get(p.c);
    if (bucket) bucket.push(p);
    else byChapter.set(p.c, [p]);
  }

  const result: typeof manifest.photos = [];
  for (const ch of chapters) {
    const list = byChapter.get(ch.index) ?? [];
    const customOrder = chapterMeta[ch.folder]?.order;
    if (!customOrder || customOrder.length === 0) {
      result.push(...list);
      continue;
    }

    const byName = new Map(list.map((p) => [p.f, p]));
    const picked = new Set<string>();
    for (const name of customOrder) {
      if (picked.has(name)) continue;
      const item = byName.get(name);
      if (item) {
        result.push(item);
        picked.add(name);
      }
    }
    // 未列入 order 的新照片保留在后，防止后续增量运行 npm run photos 时遗漏
    for (const item of list) {
      if (!picked.has(item.f)) result.push(item);
    }
  }
  return result;
})();

export const photos: Photo[] = orderedManifestPhotos.map((p, index) => {
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
/*  影音                                                               */
/* ------------------------------------------------------------------ */
export const videos: MemoirVideo[] = videoList.map((v) => ({
  ...v,
  videoUrl: asset(v.videoUrl),
  posterUrl: asset(v.posterUrl),
}));

export const music: MusicInfo = { ...musicInfo, url: asset(musicInfo.url) };

export const hasPhotos = photos.length > 0;
