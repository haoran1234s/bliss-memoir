/**
 * 类型中心
 * ------------------------------------------------------------
 * 上半部分是「你在 memoirData.ts 里填写的内容」，
 * 下半部分是「照片流水线生成的清单」和运行时合并出来的数据结构。
 */

/* ------------------------------------------------------------------ */
/*  一、手写配置（src/data/memoirData.ts）                              */
/* ------------------------------------------------------------------ */

/** 应用阶段：加载 → 迎宾 → 花园漫游 */
export type AppPhase = 'loading' | 'prelude' | 'gallery';

/** 章节的气球 / 界面配色主题 */
export type PaletteName = 'blush' | 'pearl' | 'party' | 'ocean' | 'meadow' | 'candy';

export interface CoupleInfo {
  groomName: string;
  brideName: string;
  /** 两个名字之间的连接符，比如 ♥ 或 & */
  connector: string;
  /** 纪念日，显示在迎宾页与入口拱门的木牌上 */
  date: string;
  /** 迎宾页小标题 */
  welcomeTitle: string;
  /** 迎宾页正文，可用 \n 换行 */
  welcomeText: string;
  /** 进入按钮上的字 */
  enterLabel: string;
  /** 露天影院那一站的结束语 */
  farewell: string;
}

/** 给某个章节（photos/ 下的一个子文件夹）起标题、配副标题和配色。全部可省略。 */
export interface ChapterMeta {
  title?: string;
  subtitle?: string;
  palette?: PaletteName;
  /** 封面照片的文件名（不带扩展名）。不填则用该章节第一张。 */
  cover?: string;
}

/** 给某一张照片写的小故事。全部可省略。 */
export interface PhotoNote {
  title?: string;
  story?: string;
  place?: string;
  /** 手写日期；不填则尝试读取照片 EXIF 里的拍摄日期 */
  date?: string;
}

export interface MemoirVideo {
  id: string;
  title: string;
  subtitle: string;
  /** 相对 public/ 的路径，或完整的 https 地址 */
  videoUrl: string;
  posterUrl: string;
}

export interface MusicInfo {
  /** 相对 public/ 的路径，或完整的 https 地址 */
  url: string;
  title: string;
  artist: string;
}

/* ------------------------------------------------------------------ */
/*  二、流水线清单（src/data/manifest.json，由 npm run photos 生成）     */
/* ------------------------------------------------------------------ */

export interface ManifestPhoto {
  id: string;
  /** 章节序号 */
  c: number;
  /** 文件名（不带扩展名） */
  f: string;
  /** 高清图像素尺寸 */
  w: number;
  h: number;
  /** 主色 #rrggbb */
  col: string;
  /** 所在图集页 */
  pg: number;
  /** 在 2048 图集页里的像素矩形 [x, y, w, h] */
  r: [number, number, number, number];
  /** 拍摄日期 YYYY-MM-DD（来自 EXIF） */
  d?: string;
}

export interface Manifest {
  version: number;
  atlas: { page: number; perPage: number; sizes: number[]; pages: number };
  chapters: Array<{ folder: string; count: number }>;
  photos: ManifestPhoto[];
}

/* ------------------------------------------------------------------ */
/*  三、运行时数据（src/data/library.ts 合并得到）                       */
/* ------------------------------------------------------------------ */

export interface Photo {
  /** 全局序号（也是在 photos 数组里的下标） */
  index: number;
  id: string;
  chapter: number;
  /** 在所属章节里的序号（从 0 起） */
  indexInChapter: number;
  name: string;
  w: number;
  h: number;
  aspect: number;
  color: string;
  page: number;
  rect: [number, number, number, number];
  thumb: string;
  full: string;
  date?: string;
  title?: string;
  story?: string;
  place?: string;
}

export interface Chapter {
  index: number;
  folder: string;
  title: string;
  subtitle: string;
  palette: PaletteName;
  /** 第一张照片的全局序号 */
  start: number;
  count: number;
  /** 封面照片的全局序号 */
  cover: number;
}
