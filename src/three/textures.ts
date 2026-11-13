/**
 * 程序化贴图
 * ------------------------------------------------------------
 * 除了照片和视频，花园里所有贴图都是运行时现画的：
 *   - 一张可平铺的噪声图（草色深浅、风的阵列、树叶斑驳都从它取样）；
 *   - 一张「地面图」：把所有东西在草地上的影子、花坛的位置、野餐垫的范围
 *     烘焙进一张贴图，代替实时阴影（零开销，移动端也流畅）；
 *   - 章节封面牌、入口木牌、影院横幅：用 Canvas 2D 排版文字后当贴图用。
 */
import * as THREE from 'three';
import type { Palette } from '../theme/palettes';
import type { Chapter, CoupleInfo } from '../types';
import type { World } from './world';

export const FONT_FUN = '"ZCOOL KuaiLe", "Fredoka Variable", "PingFang SC", "Microsoft YaHei", sans-serif';
export const FONT_DISPLAY = '"Fredoka Variable", "ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif';

const INK = '#3a3355';
const INK_SOFT = '#7a7398';

/* ------------------------------------------------------------------ */
/*  噪声                                                               */
/* ------------------------------------------------------------------ */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 可平铺的分形噪声。periods 是每一层在整张图上重复的格数。 */
function tileableFbm(size: number, periods: number[], weights: number[], seed: number) {
  const rand = mulberry32(seed);
  const out = new Float32Array(size * size);
  periods.forEach((period, layer) => {
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const at = (x: number, y: number) => grid[(y % period) * period + (x % period)];
    const weight = weights[layer];
    for (let py = 0; py < size; py++) {
      const y = (py / size) * period;
      const y0 = Math.floor(y);
      const fy = y - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let px = 0; px < size; px++) {
        const x = (px / size) * period;
        const x0 = Math.floor(x);
        const fx = x - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        out[py * size + px] += (a + (b - a) * sy) * weight;
      }
    }
  });
  // 拉满 0~1
  let min = Infinity;
  let max = -Infinity;
  for (const v of out) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const k = 1 / Math.max(1e-6, max - min);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) * k;
  return out;
}

/**
 * 四通道噪声：R 大块斑驳 · G 细碎颗粒 · B 平滑起伏（风）· A 另一组大块斑驳。
 */
export function noiseTexture() {
  const size = 256;
  const r = tileableFbm(size, [4, 8, 16, 32], [0.5, 0.26, 0.15, 0.09], 11);
  const g = tileableFbm(size, [16, 32, 64], [0.5, 0.3, 0.2], 23);
  const b = tileableFbm(size, [5, 10], [0.7, 0.3], 37);
  const a = tileableFbm(size, [3, 6, 12, 24], [0.5, 0.25, 0.15, 0.1], 51);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.round(b[i] * 255);
    data[i * 4 + 3] = Math.round(a[i] * 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

let sharedNoise: THREE.DataTexture | null = null;
/** 全局共用的那一张噪声图。 */
export function getNoise() {
  return (sharedNoise ??= noiseTexture());
}

/* ------------------------------------------------------------------ */
/*  地面图：R 阴影 · G 花坛 · B 不长草的地方                            */
/* ------------------------------------------------------------------ */
export function groundMapTexture(world: World, pxPerMeter: number, maxSize: number) {
  const [x0, z0, w, d] = world.mapRect;
  const ppm = Math.min(pxPerMeter, maxSize / w, maxSize / d);
  const W = Math.max(16, Math.round(w * ppm));
  const H = Math.max(16, Math.round(d * ppm));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // 用「取较亮者」叠加：两片影子重叠的地方不会变得更黑；三个通道互不干扰
  ctx.globalCompositeOperation = 'lighten';

  const X = (x: number) => (x - x0) * ppm;
  const Z = (z: number) => (z - z0) * ppm;

  const softDisc = (x: number, z: number, rx: number, rz: number, rot: number, rgb: string, inner: number) => {
    ctx.save();
    ctx.translate(X(x), Z(z));
    ctx.rotate(-rot);
    ctx.scale(rx * ppm, rz * ppm);
    const grad = ctx.createRadialGradient(0, 0, inner, 0, 0, 1);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  };

  // R：影子
  for (const s of world.shadows) {
    const v = Math.round(255 * s.alpha);
    if (s.kind === 'ellipse') {
      softDisc(s.x, s.z, s.rx, s.rz, s.rot, `${v},0,0`, 0.45);
    } else {
      ctx.fillStyle = `rgb(${v},0,0)`;
      ctx.beginPath();
      s.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.closePath();
      ctx.fill();
    }
  }

  // G：花坛（花更密、草色更亮）
  for (const b of world.beds) softDisc(b.x, b.z, b.r, b.r, 0, '0,255,0', 0.15);

  // B：野餐垫底下不长草；影院前的草坪修剪得短一些
  {
    const c = world.cinema;
    const lawn = c.center.clone().addScaledVector(c.normal, 6.2);
    softDisc(lawn.x, lawn.z, 7.6, 7.6, 0, '0,0,150', 0.55);
    const corner = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const b of world.blankets) {
      ctx.fillStyle = 'rgb(0,0,255)';
      ctx.beginPath();
      const hw = b.w / 2 + 0.22;
      const hh = b.h / 2 + 0.22;
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ].forEach(([lx, lz], i) => {
        corner.set(lx, 0, lz).applyAxisAngle(up, b.rotation).add(b.pos);
        if (i) ctx.lineTo(X(corner.x), Z(corner.z));
        else ctx.moveTo(X(corner.x), Z(corner.z));
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  // 柔化：缩小再放大（比 ctx.filter 兼容性好，Safari 也能用）
  const soften = (factor: number) => {
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.ceil(W / factor));
    small.height = Math.max(1, Math.ceil(H / factor));
    const sctx = small.getContext('2d')!;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, W, H);
  };
  soften(2);
  soften(3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  画布小工具                                                         */
/* ------------------------------------------------------------------ */
type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 以 (cx, cy) 为中心画一颗爱心，size 为宽度。 */
export function drawHeart(ctx: Ctx, cx: number, cy: number, size: number, color: string) {
  const s = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.86);
  ctx.bezierCurveTo(-s * 1.02, s * 0.2, -s * 1.18, -s * 0.5, -s * 0.56, -s * 0.8);
  ctx.bezierCurveTo(-s * 0.24, -s * 0.94, 0, -s * 0.72, 0, -s * 0.42);
  ctx.bezierCurveTo(0, -s * 0.72, s * 0.24, -s * 0.94, s * 0.56, -s * 0.8);
  ctx.bezierCurveTo(s * 1.18, -s * 0.5, s * 1.02, s * 0.2, 0, s * 0.86);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** 把字号缩到刚好不超过 maxWidth。 */
function fitFont(ctx: Ctx, text: string, weight: string, size: number, family: string, maxWidth: number) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) {
    px = Math.max(12, Math.floor((px * maxWidth) / width));
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

/** 带字间距的居中文字（ctx.letterSpacing 兼容性一般，手动逐字排）。 */
function spacedText(ctx: Ctx, text: string, cx: number, y: number, spacing: number) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = align;
}

/** 按宽度把一句话拆成最多两行。 */
function wrapTwo(ctx: Ctx, text: string, maxWidth: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const chars = Array.from(text);
  // 优先在标点后断行
  let best = Math.ceil(chars.length / 2);
  for (let i = Math.floor(chars.length * 0.35); i < Math.ceil(chars.length * 0.7); i++) {
    if (/[，。、；！？,.;!?\s]/.test(chars[i])) {
      best = i + 1;
      break;
    }
  }
  return [chars.slice(0, best).join('').trim(), chars.slice(best).join('').trim()];
}

function washiTape(ctx: Ctx, cx: number, cy: number, w: number, h: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = 0.86;
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = h * 0.16;
  for (let x = -w; x < w; x += h * 0.52) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h * 1.2, -h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/** 等待画布文字要用到的字体子集加载完（中文字体按 unicode 分片，必须按内容请求）。 */
export async function ensureFonts(text: string) {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const sample = text || '幸福回忆录';
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 64px "ZCOOL KuaiLe"`, sample),
        document.fonts.load(`600 64px "Fredoka Variable"`, 'CHAPTER 0123456789.'),
        document.fonts.load(`500 64px "Fredoka Variable"`, 'CHAPTER 0123456789.'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 3500)),
    ]);
  } catch {
    /* 字体加载失败就用系统字体，照常显示 */
  }
}

export function finishCanvasTexture(canvas: HTMLCanvasElement, anisotropy: number) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  章节封面牌（一张大大的拍立得）                                       */
/* ------------------------------------------------------------------ */
export interface BoardPaint {
  chapter: Chapter;
  total: number;
  palette: Palette;
  /** 封面照片的平均色（照片加载出来之前先铺上） */
  tint: string;
  cover: CanvasImageSource | null;
  coverW: number;
  coverH: number;
}

/** 封面牌画布的宽高比与 world.BOARD 一致：1.5 : 1.84。 */
export function paintBoard(canvas: HTMLCanvasElement, width: number, p: BoardPaint) {
  const W = width;
  const H = Math.round((width * 1.84) / 1.5);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const k = W / 1024;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 1024, 1256);

  // 相纸
  const paper = ctx.createLinearGradient(0, 0, 0, 1256);
  paper.addColorStop(0, '#fffefb');
  paper.addColorStop(1, '#fff6ea');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1024, 1256);

  // 照片区
  const px = 62;
  const py = 62;
  const pw = 900;
  const ph = 752;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 14);
  ctx.clip();
  const bg = ctx.createLinearGradient(px, py, px + pw, py + ph);
  bg.addColorStop(0, p.tint);
  bg.addColorStop(1, p.palette.soft);
  ctx.fillStyle = bg;
  ctx.fillRect(px, py, pw, ph);
  if (p.cover && p.coverW > 0 && p.coverH > 0) {
    // object-fit: cover，竖图略偏上取景（人脸通常在上半部分）
    const scale = Math.max(pw / p.coverW, ph / p.coverH);
    const sw = pw / scale;
    const sh = ph / scale;
    const sx = (p.coverW - sw) / 2;
    const sy = (p.coverH - sh) * 0.38;
    ctx.drawImage(p.cover, sx, sy, sw, sh, px, py, pw, ph);
  } else {
    drawHeart(ctx, px + pw / 2, py + ph / 2, 150, 'rgba(255,255,255,0.55)');
  }
  // 照片边缘一圈极淡的内阴影，像真的嵌在相纸里
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(58,51,85,0.10)';
  roundRect(ctx, px + 3, py + 3, pw - 6, ph - 6, 12);
  ctx.stroke();
  ctx.restore();

  // 两条和纸胶带
  washiTape(ctx, px + 46, py + 10, 210, 54, -0.6, p.palette.balloons[0]);
  washiTape(ctx, px + pw - 46, py + 10, 210, 54, 0.6, p.palette.balloons[2 % p.palette.balloons.length]);

  // 文字
  const cx = 512;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const no = String(p.chapter.index + 1).padStart(2, '0');
  ctx.fillStyle = p.palette.accent;
  ctx.font = `600 34px ${FONT_DISPLAY}`;
  spacedText(ctx, `CHAPTER ${no}`, cx, 892, 9);
  // 标签两侧的小短线
  const labelW = ctx.measureText(`CHAPTER ${no}`).width + 9 * 9;
  ctx.strokeStyle = p.palette.accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * (labelW / 2 + 22), 880);
    ctx.lineTo(cx + side * (labelW / 2 + 82), 880);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = INK;
  const titleSize = fitFont(ctx, p.chapter.title, '400', 132, FONT_FUN, 860);
  ctx.fillText(p.chapter.title, cx, 962 + titleSize * 0.52);

  let y = 1040 + titleSize * 0.18;
  if (p.chapter.subtitle) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = `400 40px ${FONT_FUN}`;
    const lines = wrapTwo(ctx, p.chapter.subtitle, 860);
    if (lines.length === 1) {
      fitFont(ctx, lines[0], '400', 40, FONT_FUN, 860);
      ctx.fillText(lines[0], cx, y + 40);
      y += 62;
    } else {
      ctx.font = `400 36px ${FONT_FUN}`;
      lines.forEach((line, i) => {
        fitFont(ctx, line, '400', 36, FONT_FUN, 860);
        ctx.fillText(line, cx, y + 34 + i * 46);
      });
      y += 96;
    }
  }

  // 张数小标签
  const label = `${p.chapter.count} 张照片`;
  ctx.font = `400 30px ${FONT_FUN}`;
  const lw = ctx.measureText(label).width + 86;
  const ly = Math.min(1256 - 78, y + 26);
  ctx.fillStyle = p.palette.soft;
  roundRect(ctx, cx - lw / 2, ly, lw, 52, 26);
  ctx.fill();
  drawHeart(ctx, cx - lw / 2 + 32, ly + 27, 22, p.palette.accent);
  ctx.fillStyle = p.palette.accent;
  ctx.fillText(label, cx + 14, ly + 37);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ------------------------------------------------------------------ */
/*  入口拱门下的木牌                                                    */
/* ------------------------------------------------------------------ */
export const SIGN_SIZE = { w: 1.56, h: 0.64 } as const;

export function paintSign(canvas: HTMLCanvasElement, couple: CoupleInfo) {
  const W = 1024;
  const H = 420;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 整张画布先铺满边框色（圆角由着色器裁出来，贴图本身不带透明，缩小时边缘不会发黑）
  ctx.fillStyle = '#ff9aa8';
  ctx.fillRect(0, 0, W, H);
  // 牌面
  roundRect(ctx, 13, 13, W - 26, H - 26, 56);
  const face = ctx.createLinearGradient(0, 0, 0, H);
  face.addColorStop(0, '#fffdf6');
  face.addColorStop(1, '#fff1dc');
  ctx.fillStyle = face;
  ctx.fill();
  // 缝线
  roundRect(ctx, 30, 30, W - 60, H - 60, 46);
  ctx.setLineDash([16, 14]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,154,168,0.6)';
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // 小标题
  ctx.fillStyle = '#ff7e8a';
  ctx.font = `600 32px ${FONT_DISPLAY}`;
  spacedText(ctx, 'OUR HAPPY MEMOIR', W / 2, 102, 8);

  // 名字 + 爱心
  const isHeart = /[♥❤♡]/.test(couple.connector);
  let size = 138;
  const gap = 34;
  const measure = () => {
    ctx.font = `400 ${size}px ${FONT_FUN}`;
    const a = ctx.measureText(couple.groomName).width;
    const b = ctx.measureText(couple.brideName).width;
    const c = isHeart ? size * 0.62 : ctx.measureText(couple.connector).width;
    return { a, b, c, total: a + b + c + gap * 2 };
  };
  let m = measure();
  if (m.total > W - 150) {
    size = Math.floor((size * (W - 150)) / m.total);
    m = measure();
  }
  const baseline = 250;
  let x = W / 2 - m.total / 2;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(couple.groomName, x, baseline);
  x += m.a + gap;
  if (isHeart) drawHeart(ctx, x + m.c / 2, baseline - size * 0.36, m.c, '#ff6f91');
  else {
    ctx.fillStyle = '#ff6f91';
    ctx.fillText(couple.connector, x, baseline);
    ctx.fillStyle = INK;
  }
  x += m.c + gap;
  ctx.fillText(couple.brideName, x, baseline);
  ctx.textAlign = 'center';

  // 日期
  ctx.fillStyle = '#ff7e8a';
  ctx.font = `600 50px ${FONT_DISPLAY}`;
  spacedText(ctx, couple.date, W / 2, 344, 10);
  // 日期两侧的小花点
  const dw = ctx.measureText(couple.date).width + 10 * (couple.date.length - 1);
  for (const side of [-1, 1]) {
    drawHeart(ctx, W / 2 + side * (dw / 2 + 46), 327, 26, '#ffc2d1');
  }
}

/* ------------------------------------------------------------------ */
/*  露天影院顶上的横幅                                                  */
/* ------------------------------------------------------------------ */
export const MARQUEE_SIZE = { w: 4.3, h: 0.62 } as const;

export function paintMarquee(canvas: HTMLCanvasElement, text: string) {
  const W = 1400;
  const H = 202;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#ff8fa3');
  g.addColorStop(0.5, '#ff7e8a');
  g.addColorStop(1, '#ffa27a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 内侧一圈奶白色描边
  roundRect(ctx, 14, 14, W - 28, H - 28, 87);
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(255,250,240,0.9)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  const size = fitFont(ctx, text, '400', 92, FONT_FUN, W - 360);
  ctx.fillText(text, W / 2, H / 2 + size * 0.36);
  const tw = ctx.measureText(text).width;
  for (const side of [-1, 1]) {
    drawHeart(ctx, W / 2 + side * (tw / 2 + 70), H / 2 + 2, 52, '#fff3c4');
  }
}

/** 视频封面加载失败时的占位图。 */
export function paintPosterFallback(canvas: HTMLCanvasElement, title: string) {
  const W = 960;
  const H = 540;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ffd1dc');
  g.addColorStop(0.5, '#ffe9c9');
  g.addColorStop(1, '#bfe6ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawHeart(ctx, W / 2, H / 2 - 40, 130, 'rgba(255,255,255,0.85)');
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `400 54px ${FONT_FUN}`;
  ctx.fillText(title || '我们的影像', W / 2, H / 2 + 110);
}
