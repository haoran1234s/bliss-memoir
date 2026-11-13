/**
 * 演示素材下载器（可选）
 * ------------------------------------------------------------
 *   npm run demo:fetch
 *
 * 把一套精选的免费素材下载到本地，让项目「开箱即有几百张照片」：
 *   - photos/<章节>/NNN.jpg      331 张演示照片（Unsplash / Lorem Picsum，Unsplash License）
 *   - public/memoir/video/       4 段婚礼短片 + 封面（Mixkit Free License）
 *   - public/memoir/audio/bgm.mp3  背景音乐 "Carefree" — Kevin MacLeod (incompetech.com)，CC BY 4.0
 *
 * 这些只是占位素材。换成你们自己的照片后，这个脚本就用不到了。
 * 已存在的文件会跳过，可放心重复执行。下载完成后请运行 `npm run photos`。
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TMP = path.join(os.tmpdir(), 'bliss-memoir-demo');
const LOCAL_CACHE = path.join(ROOT, '.demo-cache', 'unsplash');

/* ------------------------------------------------------------------ */
/*  精选清单                                                           */
/* ------------------------------------------------------------------ */
const U = (s) => s.trim().split(/\s+/);
const N = (s) => s.trim().split(/[\s,]+/).map(Number);

const CHAPTERS = [
  {
    folder: '01-求婚',
    unsplash: U(`
      1501901609772-df0848060b33 1474552226712-ac0f0961a954 1503516459261-40c66117780a 1494774157365-9e04c6720e47
      1522098543979-ffc7f79a56c4 1516589178581-6cd7833ae3b2 1518568814500-bf0f8d125f46 1532712938310-34cb3982ef74
      1526047932273-341f2a7631f9 1518895949257-7621c3c786d7 1518621736915-f3b1c41bfd00 1518199266791-5375a83190b7
      1522673607200-164d1b6ce486 1606800052052-a08af7148866 1515934751635-c81c6bc9a2d8 1529519195486-16945f0fb37f
      1520854221256-17451cc331bf 1465495976277-4387d4b0b4c6 1529634806980-85c3dd6d34ac 1545232979-8bf68ee9b1af`),
    picsum: [],
  },
  {
    folder: '02-婚纱照',
    unsplash: U(`
      1537633552985-df8429e8048b 1460978812857-470ed1c77af0 1591604466107-ec97de577aff 1546032996-6dfacbacbf3f
      1606216794074-735e91aa2c92 1544078751-58fee2d8a03b 1541250848049-b4f7141dca3f 1482482097755-0b595893ba63
      1549417229-7686ac5595fd 1606490194859-07c18c9f0968 1604017011826-d3b4c23f8914 1520342868574-5fa3804e551c
      1550005809-91ad75fb315f 1478146896981-b80fe463b330 1519741497674-611481863552 1509927083803-4bd519298ac4
      1529636798458-92182e662485 1487530811176-3780de880c2d 1563241527-3004b7be0ffd 1561181286-d3fee7d55364`),
    picsum: [],
  },
  {
    folder: '03-婚礼当天',
    unsplash: U(`
      1469371670807-013ccf25f16a 1523438885200-e635ba2c371e 1507504031003-b417219a0fde 1525772764200-be829a350797
      1502635385003-ee1e6a1a742d 1519225421980-715cb0215aed 1522413452208-996ff3f3e740 1464366400600-7168b8af9bc3
      1519167758481-83f550bb49b3 1524824267900-2fa9cbf7a506 1587271407850-8d438ca9fdf2 1510076857177-7470076d4098
      1511285560929-80b456fea0bc 1583939003579-730e3918a45a 1595407753234-0882f1e77954 1583939411023-14783179e581
      1481653125770-b78c206c59d4 1519671482749-fd09be7ccebf 1527529482837-4698179dc6ce 1510812431401-41d2bd2722f3
      1511795409834-ef04bbd61622 1561912774-79769a0a0a7a 1535254973040-607b474cb50d 1464349095431-e9a21285b5f3
      1464347744102-11db6282f854 1488477181946-6428a0291777 1486427944299-d1955d23e34d 1530103862676-de8c9debad1d
      1504196606672-aef5c9cefc92 1513151233558-d860c5398176 1492684223066-81342ee5ff30 1549465220-1a8b9238cd48
      1523301343968-6a6ebf63c672 1528605248644-14dd04022da1`),
    picsum: [],
  },
  {
    folder: '04-蜜月旅行',
    unsplash: U(`
      1519046904884-53103b34b206 1507525428034-b723cf961d3e 1505142468610-359e7d316be0 1490730141103-6cac27aaab94
      1506377247377-2a5b3b417ebb 1515488764276-beab7607c1e6 1548268770-66184a21657e 1529333166437-7750a6dd5a70
      1511988617509-a57c8a288659`),
    picsum: N(`
      12 13 14 16 27 37 47 49 50 52 57 74 77 78
      100 101 108 129 134 141 142 147 153 154 155 156 158 162 164
      176 179 182 184 185 188 193 195 196 199 203 211 212 213 215 218 230 234 244 249
      257 259 261 264 265 266 269 270 271 273 274 275 280 281 283 288 293 294 295 299 308 313 317 320 322 323 328 334 338
      342 347 349 350 351 354 362 364 369 371 372 374 376 382 384 385 390 391 392 397 398`),
  },
  {
    folder: '05-山野与远方',
    unsplash: U(`
      1476514525535-07fb3b4ae5f1 1501785888041-af3ef285b470 1439066615861-d1af74d74000 1493246507139-91e8fad9978e
      1470071459604-3b5ec3a7fe05 1441974231531-c6227db76b6e 1469474968028-56623f02e42e 1447752875215-b2761acb3c5d
      1433086966358-54859d0ed716 1472214103451-9374bd1c798e 1506905925346-21bda4d32df4 1464822759023-fed622ff2c3b
      1454496522488-7a8e488e8606 1519681393784-d120267933ba 1500530855697-b586d89ba3ee 1502082553048-f009c37129b9
      1522748906645-95d8adfd52c7 1490750967868-88aa4486c946 1455659817273-f96807779a8a 1511632765486-a01980e01a18`),
    picsum: N(`
      10 11 15 17 19 25 28 29 38 46 53 54 59 62 66 69 70 71 76
      85 89 93 94 95 98 107 109 110 112 116 118 125 127 128 132 136 140 165
      168 170 174 177 186 190 191 197 198 202 204 206 216 217 222 227 229 231 235 243 247 251
      255 256 260 267 268 277 278 287 289 296 301 314 316 324 327 330 335 337
      340 344 353 361 368 379 380 381 387 388 393`),
  },
  {
    folder: '06-小日子',
    unsplash: [],
    picsum: N(`
      18 55 56 63 64 65 75 82 102 103 104 106 133 146 152 159 163 167 169 173 183 189 200 219 225 239 248 250
      292 305 306 309 312 319 325 326 336 360 389 399`),
  },
];

const VIDEOS = [
  { id: '4829', name: 'proposal' },
  { id: '5183', name: 'morning' },
  { id: '5217', name: 'ceremony' },
  { id: '40584', name: 'garden' },
];

const BGM = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3';

/* ------------------------------------------------------------------ */
/*  工具                                                               */
/* ------------------------------------------------------------------ */
async function exists(file, minSize = 1) {
  try {
    return (await fs.stat(file)).size >= minSize;
  } catch {
    return false;
  }
}

/** 先下载到纯英文临时路径，再由 Node 移动到目标位置（规避 curl 对中文路径的兼容问题）。 */
function download(url, dest, { minSize = 8000, type = '' } = {}) {
  return new Promise((resolve) => {
    const tmp = path.join(TMP, `${Math.random().toString(36).slice(2)}.part`);
    execFile(
      CURL,
      ['-s', '-L', '-m', '180', '--retry', '2', '-A', UA, '-o', tmp, '-w', '%{http_code} %{content_type}', url],
      { windowsHide: true },
      async (err, stdout) => {
        const [code, ctype = ''] = String(stdout || '').trim().split(' ');
        const ok = !err && code === '200' && (!type || ctype.startsWith(type)) && (await exists(tmp, minSize));
        if (ok) {
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.copyFile(tmp, dest);
        }
        await fs.rm(tmp, { force: true });
        resolve(ok);
      },
    );
  });
}

async function pool(items, n, fn) {
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
        done += 1;
        if (done % 20 === 0 || done === items.length) {
          process.stdout.write(`\r  进度 ${done}/${items.length}   `);
        }
      }
    }),
  );
  process.stdout.write('\n');
}

/** picsum 的裁切比例：按序号制造横 / 竖 / 方的自然混排。 */
function picsumSize(k) {
  if (k % 9 === 4) return [1400, 1400];
  if (k % 4 === 1) return [1067, 1600];
  return [1600, 1067];
}

/* ------------------------------------------------------------------ */
/*  主流程                                                             */
/* ------------------------------------------------------------------ */
await fs.mkdir(TMP, { recursive: true });

const jobs = [];
for (const ch of CHAPTERS) {
  const dir = path.join(ROOT, 'photos', ch.folder);
  let n = 0;
  for (const id of ch.unsplash) {
    n += 1;
    jobs.push({
      dest: path.join(dir, `${String(n).padStart(3, '0')}.jpg`),
      url: `https://images.unsplash.com/photo-${id}?ixlib=rb-4.0.3&fm=jpg&fit=max&w=1800&q=82`,
      cache: path.join(LOCAL_CACHE, `${id}.jpg`),
    });
  }
  ch.picsum.forEach((id, k) => {
    n += 1;
    const [w, h] = picsumSize(k);
    jobs.push({
      dest: path.join(dir, `${String(n).padStart(3, '0')}.jpg`),
      url: `https://picsum.photos/id/${id}/${w}/${h}`,
    });
  });
}

console.log(`照片：共 ${jobs.length} 张`);
const failed = [];
await pool(jobs, 10, async (job) => {
  if (await exists(job.dest, 8000)) return;
  if (job.cache && (await exists(job.cache, 8000))) {
    await fs.mkdir(path.dirname(job.dest), { recursive: true });
    await fs.copyFile(job.cache, job.dest);
    return;
  }
  const ok = await download(job.url, job.dest, { type: 'image/' });
  if (!ok) failed.push(job.url);
});

console.log('视频：4 段 + 封面');
const videoDir = path.join(ROOT, 'public', 'memoir', 'video');
for (const v of VIDEOS) {
  const mp4 = path.join(videoDir, `${v.name}.mp4`);
  const jpg = path.join(videoDir, `${v.name}.jpg`);
  if (!(await exists(mp4, 200000))) {
    const ok = await download(`https://assets.mixkit.co/videos/${v.id}/${v.id}-720.mp4`, mp4, {
      minSize: 200000,
    });
    if (!ok) failed.push(`${v.name}.mp4`);
  }
  if (!(await exists(jpg, 8000))) {
    const ok = await download(`https://assets.mixkit.co/videos/${v.id}/${v.id}-thumb-720-0.jpg`, jpg, {
      type: 'image/',
    });
    if (!ok) failed.push(`${v.name}.jpg`);
  }
}

console.log('音乐：bgm.mp3');
const bgm = path.join(ROOT, 'public', 'memoir', 'audio', 'bgm.mp3');
if (!(await exists(bgm, 500000))) {
  const ok = await download(BGM, bgm, { minSize: 500000 });
  if (!ok) failed.push('bgm.mp3');
}

await fs.rm(TMP, { recursive: true, force: true });

if (failed.length) {
  console.log(`\n有 ${failed.length} 个文件下载失败（可稍后重试，已下载的会跳过）：`);
  failed.slice(0, 20).forEach((f) => console.log('  -', f));
  process.exitCode = 1;
} else {
  console.log('\n全部下载完成。接下来运行：npm run photos');
}
