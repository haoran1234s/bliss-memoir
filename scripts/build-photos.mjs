/**
 * 照片流水线
 * ------------------------------------------------------------
 *   npm run photos                 处理 photos/ 下的全部照片（增量：没改动的会跳过）
 *   npm run photos -- --force      忽略缓存，全部重新生成
 *   npm run photos -- --sort=date  每个章节内按拍摄时间排序（默认按文件名）
 *
 * 把「几百张原图」变成网页能丝滑加载的三档素材：
 *   public/memoir/full/<id>.webp     高清检视图（长边 ≤ 2048）
 *   public/memoir/thumb/<id>.webp    缩略图（长边 ≤ 512，相册网格 / 检视层占位）
 *   public/memoir/atlas/<尺寸>/page-N.webp
 *                                    3D 场景用的图集：每页拼 16 张，按 2048 / 1024 / 512
 *                                    三种分辨率各出一份，运行时按设备档位取用
 *   src/data/manifest.json           照片清单（尺寸、主色、图集坐标、拍摄日期）
 *
 * 目录约定：photos/ 下每个子文件夹是一个章节，按文件夹名排序（建议加数字前缀）。
 * 直接放在 photos/ 根目录的图片会归入一个默认章节。
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

/* ------------------------------------------------------------------ */
/*  参数                                                               */
/* ------------------------------------------------------------------ */
const ROOT = process.cwd();
const SRC = path.join(ROOT, 'photos');
const OUT = path.join(ROOT, 'public', 'memoir');
const MANIFEST = path.join(ROOT, 'src', 'data', 'manifest.json');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'bliss-memoir');
const CELL_DIR = path.join(CACHE_DIR, 'cells');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

const FULL_MAX = 2048;
const FULL_QUALITY = 82;
const THUMB_MAX = 512;
const THUMB_QUALITY = 76;

/** 图集：一页 2048² 分成 4×4 格，每格 512，四周留 12px 防渗色边。 */
const PAGE = 2048;
const GRID = 4;
const CELL = PAGE / GRID;
const GUTTER = 12;
const PER_PAGE = GRID * GRID;
const ATLAS_SIZES = [2048, 1024, 512];
const ATLAS_QUALITY = 80;

/** 缓存版本：改了上面的输出规格就加一，旧缓存自动作废。 */
const PIPELINE_VERSION = 1;

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|tiff?|gif)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const SORT = (args.find((a) => a.startsWith('--sort=')) ?? '--sort=name').split('=')[1];

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a, b);

/* ------------------------------------------------------------------ */
/*  工具                                                               */
/* ------------------------------------------------------------------ */
async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function dirSize(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await fs.stat(p)).size;
  }
  return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        await fn(items[k], k);
      }
    }),
  );
}

/** 从 EXIF 原始字节里找拍摄时间。同一张图里可能有多个时间戳，取最早的那个（拍摄时间不晚于修改时间）。 */
function exifDate(buf) {
  if (!buf) return undefined;
  const text = buf.toString('latin1');
  const re = /(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}/g;
  let best;
  for (const m of text.matchAll(re)) {
    const [, y, mo, d] = m;
    if (+y < 1990 || +y > 2100 || +mo < 1 || +mo > 12 || +d < 1 || +d > 31) continue;
    const s = `${y}-${mo}-${d}`;
    if (!best || s < best) best = s;
  }
  return best;
}

const hex = (n) => Math.round(n).toString(16).padStart(2, '0');

/* ------------------------------------------------------------------ */
/*  扫描                                                               */
/* ------------------------------------------------------------------ */
async function scan() {
  if (!(await exists(SRC))) {
    await fs.mkdir(SRC, { recursive: true });
    return { chapters: [], heic: [] };
  }
  const entries = await fs.readdir(SRC, { withFileTypes: true });
  const heic = [];
  const chapters = [];

  const listImages = async (dir) => {
    const files = await fs.readdir(dir, { withFileTypes: true });
    const out = [];
    for (const f of files) {
      if (!f.isFile() || f.name.startsWith('.')) continue;
      if (IMAGE_EXT.test(f.name)) out.push(f.name);
      else if (HEIC_EXT.test(f.name)) heic.push(path.join(dir, f.name));
    }
    return out.sort(byName);
  };

  const rootFiles = await listImages(SRC);
  if (rootFiles.length) chapters.push({ folder: '', dir: SRC, files: rootFiles });

  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort(byName);
  for (const name of dirs) {
    const dir = path.join(SRC, name);
    const files = await listImages(dir);
    if (files.length) chapters.push({ folder: name, dir, files });
  }
  return { chapters, heic };
}

/* ------------------------------------------------------------------ */
/*  单张处理                                                           */
/* ------------------------------------------------------------------ */
async function processPhoto(p) {
  const meta = await sharp(p.abs, { failOn: 'none' }).metadata();

  // 只解码一次：自动按 EXIF 旋正 → 去透明 → 缩到高清档，后面两档都从它派生
  const { data, info } = await sharp(p.abs, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
  const work = () => sharp(data, raw);

  await work().webp({ quality: FULL_QUALITY, effort: 4 }).toFile(p.full);
  await work()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .toFile(p.thumb);

  // 图集格子：照片等比放进格子中央，四周用同一张图的模糊放大版垫底。
  // 这样多级渐远纹理在边缘取到的仍是这张照片自己的颜色，不会渗进邻居。
  const box = CELL - GUTTER * 2;
  const fit = await work()
    .resize({ width: box, height: box, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((CELL - fit.info.width) / 2);
  const top = Math.round((CELL - fit.info.height) / 2);
  await work()
    .resize(CELL, CELL, { fit: 'cover' })
    .blur(10)
    .composite([{ input: fit.data, left, top }])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(p.cell);

  const avg = await work().resize(1, 1, { fit: 'cover' }).raw().toBuffer();

  return {
    w: info.width,
    h: info.height,
    col: `#${hex(avg[0])}${hex(avg[1])}${hex(avg[2])}`,
    rect: [left, top, fit.info.width, fit.info.height],
    d: exifDate(meta.exif),
  };
}

/* ------------------------------------------------------------------ */
/*  主流程                                                             */
/* ------------------------------------------------------------------ */
const t0 = Date.now();
const { chapters, heic } = await scan();

for (const dir of [path.join(OUT, 'full'), path.join(OUT, 'thumb'), CELL_DIR]) {
  await fs.mkdir(dir, { recursive: true });
}
for (const size of ATLAS_SIZES) await fs.mkdir(path.join(OUT, 'atlas', String(size)), { recursive: true });

let cache = { version: PIPELINE_VERSION, photos: {}, atlasKey: '' };
if (!FORCE && (await exists(CACHE_FILE))) {
  try {
    const loaded = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    if (loaded.version === PIPELINE_VERSION) cache = loaded;
  } catch {
    /* 缓存损坏就当没有 */
  }
}

/* —— 汇总待处理列表 —— */
const all = [];
chapters.forEach((ch, c) => {
  for (const file of ch.files) {
    const rel = `${ch.folder}/${file}`;
    const id = `p${createHash('sha1').update(rel).digest('hex').slice(0, 10)}`;
    all.push({
      id,
      c,
      file,
      name: file.replace(/\.[^.]+$/, ''),
      abs: path.join(ch.dir, file),
      full: path.join(OUT, 'full', `${id}.webp`),
      thumb: path.join(OUT, 'thumb', `${id}.webp`),
      cell: path.join(CELL_DIR, `${id}.jpg`),
    });
  }
});

console.log(`扫描到 ${chapters.length} 个章节、${all.length} 张照片`);

let processed = 0;
let reused = 0;
const broken = [];
const nextCache = {};

await pool(all, Math.max(2, Math.min(6, os.cpus().length - 1)), async (p) => {
  const st = await fs.stat(p.abs);
  const key = `${st.size}-${Math.round(st.mtimeMs)}`;
  const hit = cache.photos[p.id];
  if (hit && hit.key === key && (await exists(p.full)) && (await exists(p.thumb)) && (await exists(p.cell))) {
    Object.assign(p, hit.info);
    nextCache[p.id] = hit;
    reused += 1;
  } else {
    try {
      const info = await processPhoto(p);
      Object.assign(p, info);
      nextCache[p.id] = { key, info };
      processed += 1;
    } catch (err) {
      p.failed = true;
      broken.push(`${chapters[p.c].folder}/${p.file} — ${err.message}`);
    }
  }
  const done = processed + reused + broken.length;
  if (done % 25 === 0 || done === all.length) {
    process.stdout.write(`\r  处理中 ${done}/${all.length}（新生成 ${processed}，复用缓存 ${reused}）   `);
  }
});
if (all.length) process.stdout.write('\n');

/* —— 排序并去掉损坏的 —— */
const photos = [];
chapters.forEach((ch, c) => {
  const list = all.filter((p) => p.c === c && !p.failed);
  if (SORT === 'date') {
    list.sort((a, b) => (a.d ?? '9999').localeCompare(b.d ?? '9999') || byName(a.file, b.file));
  }
  ch.count = list.length;
  photos.push(...list);
});

/* —— 拼图集 —— */
const pageCount = Math.ceil(photos.length / PER_PAGE);
const atlasKey = createHash('sha1')
  .update(photos.map((p) => `${p.id}:${nextCache[p.id].key}`).join('|'))
  .digest('hex');

photos.forEach((p, i) => {
  const slot = i % PER_PAGE;
  p.pg = Math.floor(i / PER_PAGE);
  p.cellX = (slot % GRID) * CELL;
  p.cellY = Math.floor(slot / GRID) * CELL;
});

let atlasReady = atlasKey === cache.atlasKey && !FORCE;
if (atlasReady) {
  for (let pg = 0; pg < pageCount && atlasReady; pg++) {
    for (const size of ATLAS_SIZES) {
      if (!(await exists(path.join(OUT, 'atlas', String(size), `page-${pg}.webp`)))) atlasReady = false;
    }
  }
}

if (!atlasReady) {
  for (let pg = 0; pg < pageCount; pg++) {
    const members = photos.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE);
    const sheet = await sharp({
      create: { width: PAGE, height: PAGE, channels: 3, background: '#f4efe6' },
    })
      .composite(members.map((p) => ({ input: p.cell, left: p.cellX, top: p.cellY })))
      .png({ compressionLevel: 1 })
      .toBuffer();
    for (const size of ATLAS_SIZES) {
      const out = path.join(OUT, 'atlas', String(size), `page-${pg}.webp`);
      const img = size === PAGE ? sharp(sheet) : sharp(sheet).resize(size, size, { kernel: 'lanczos3' });
      await img.webp({ quality: ATLAS_QUALITY, effort: 4 }).toFile(out);
    }
    process.stdout.write(`\r  拼图集 ${pg + 1}/${pageCount}   `);
  }
  if (pageCount) process.stdout.write('\n');
}

/* —— 清理已删除照片留下的旧文件 —— */
const keep = new Set(photos.map((p) => `${p.id}.webp`));
let removed = 0;
for (const dir of ['full', 'thumb']) {
  for (const f of await fs.readdir(path.join(OUT, dir))) {
    if (!keep.has(f)) {
      await fs.rm(path.join(OUT, dir, f), { force: true });
      removed += 1;
    }
  }
}
const keepCells = new Set(photos.map((p) => `${p.id}.jpg`));
for (const f of await fs.readdir(CELL_DIR)) {
  if (!keepCells.has(f)) await fs.rm(path.join(CELL_DIR, f), { force: true });
}
for (const size of ATLAS_SIZES) {
  const dir = path.join(OUT, 'atlas', String(size));
  for (const f of await fs.readdir(dir)) {
    const m = /^page-(\d+)\.webp$/.exec(f);
    if (!m || Number(m[1]) >= pageCount) await fs.rm(path.join(dir, f), { force: true });
  }
}

/* —— 写清单与缓存 —— */
const manifest = {
  version: 1,
  atlas: { page: PAGE, perPage: PER_PAGE, sizes: ATLAS_SIZES, pages: pageCount },
  chapters: chapters.filter((ch) => ch.count > 0).map((ch) => ({ folder: ch.folder, count: ch.count })),
  photos: [],
};
const chapterIndex = new Map(manifest.chapters.map((ch, i) => [ch.folder, i]));
for (const p of photos) {
  const entry = {
    id: p.id,
    c: chapterIndex.get(chapters[p.c].folder),
    f: p.name,
    w: p.w,
    h: p.h,
    col: p.col,
    pg: p.pg,
    r: [p.cellX + p.rect[0], p.cellY + p.rect[1], p.rect[2], p.rect[3]],
  };
  if (p.d) entry.d = p.d;
  manifest.photos.push(entry);
}
await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
await fs.writeFile(MANIFEST, `${JSON.stringify(manifest)}\n`);
await fs.mkdir(CACHE_DIR, { recursive: true });
await fs.writeFile(CACHE_FILE, JSON.stringify({ version: PIPELINE_VERSION, photos: nextCache, atlasKey }));

/* —— 报告 —— */
const sizes = {
  full: await dirSize(path.join(OUT, 'full')),
  thumb: await dirSize(path.join(OUT, 'thumb')),
  atlas: await dirSize(path.join(OUT, 'atlas')),
};
console.log('');
for (const ch of manifest.chapters) console.log(`  ${(ch.folder || '(根目录)').padEnd(16)} ${ch.count} 张`);
console.log('');
console.log(`  合计 ${photos.length} 张 · 图集 ${pageCount} 页 × ${ATLAS_SIZES.length} 档`);
console.log(`  高清图 ${mb(sizes.full)} · 缩略图 ${mb(sizes.thumb)} · 图集 ${mb(sizes.atlas)}`);
console.log(`  新生成 ${processed} · 复用缓存 ${reused} · 清理旧文件 ${removed} · 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (broken.length) {
  console.log(`\n  有 ${broken.length} 张无法读取，已跳过：`);
  broken.slice(0, 20).forEach((b) => console.log(`    - ${b}`));
}
if (heic.length) {
  console.log(`\n  发现 ${heic.length} 张 HEIC/HEIF（iPhone 默认格式），本工具读不了，已跳过。`);
  console.log('  请先转成 JPG：iPhone「设置 › 相机 › 格式 › 兼容性最佳」，或用系统相册导出为 JPG。');
}
if (!photos.length) {
  console.log('\n  photos/ 里还没有照片。把照片按章节放进子文件夹后再运行一次即可。');
}
