/**
 * 照片图集的流式加载
 * ------------------------------------------------------------
 * 几百上千张照片不可能各占一张贴图。流水线已经把它们拼成了「图集页」
 * （每页 16 张，同一页有 2048 / 1024 / 512 三档分辨率），这里负责：
 *
 *   - 两圈细节：镜头附近的页加载高清档，稍远的只要 512 低清档，
 *     再远的不加载（卡片显示照片的平均色，远看几乎没有区别）；
 *   - 由近及远排队下载，最多同时 3 个请求；镜头走开了就取消还没下完的；
 *   - 图片在后台线程解码（createImageBitmap），每帧最多往显卡上传一页，
 *     翻页时不会卡顿；
 *   - 低清页很小（一页约 1.4 MB 显存），在预算内一直留着，往回走不用重新下载；
 *     高清页只保留镜头周围那几页。
 */
import * as THREE from 'three';
import { atlas } from '../data/library';

export interface AtlasOptions {
  loSize: number;
  /** 显存里最多保留多少页低清图集 */
  maxLo: number;
  anisotropy: number;
  /** 某一页的贴图发生变化（加载完成 / 被释放）时回调 */
  onChange: (page: number) => void;
}

type Level = 0 | 1 | 2;

interface Slot {
  lo: THREE.Texture | null;
  hi: THREE.Texture | null;
  hiSize: number;
  want: Level;
  dist: number;
  loading: Level;
  loadingSize: number;
  ctrl: AbortController | null;
  retryAt: number;
  fails: number;
}

interface Decoded {
  page: number;
  level: Level;
  size: number;
  image: ImageBitmap | HTMLImageElement;
}

const MAX_PARALLEL = 3;

async function decode(url: string, signal: AbortSignal): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    try {
      return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch {
      // 旧版 Safari 不认识选项参数
      return await createImageBitmap(blob);
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image error'));
    signal.addEventListener('abort', () => {
      img.src = '';
      reject(new DOMException('aborted', 'AbortError'));
    });
    img.src = url;
  });
}

export class AtlasStreamer {
  private slots: Slot[];
  private ready: Decoded[] = [];
  private active = 0;
  private hiSize: number;
  private disposed = false;

  constructor(
    private gl: THREE.WebGLRenderer,
    private opts: AtlasOptions,
  ) {
    this.hiSize = opts.loSize;
    this.slots = Array.from({ length: atlas.pages }, () => ({
      lo: null,
      hi: null,
      hiSize: 0,
      want: 0 as Level,
      dist: Infinity,
      loading: 0 as Level,
      loadingSize: 0,
      ctrl: null,
      retryAt: 0,
      fails: 0,
    }));
  }

  /** 这一页当前最好的贴图。 */
  lo(page: number) {
    return this.slots[page]?.lo ?? null;
  }
  hi(page: number) {
    return this.slots[page]?.hi ?? null;
  }

  /** 低清图集已经就绪的页数占 [from, to] 的比例（加载页用来显示进度）。 */
  progress(from: number, to: number) {
    let done = 0;
    let total = 0;
    for (let p = Math.max(0, from); p <= Math.min(this.slots.length - 1, to); p++) {
      total++;
      if (this.slots[p].lo || this.slots[p].fails > 1) done++;
    }
    return total ? done / total : 1;
  }

  /**
   * 告诉加载器镜头现在在哪。
   * @param hiFrom,hiTo 需要高清的页范围
   * @param loFrom,loTo 需要低清的页范围
   * @param hiSize      高清档用哪个分辨率
   */
  focus(hiFrom: number, hiTo: number, loFrom: number, loTo: number, hiSize: number) {
    this.hiSize = hiSize;
    const centre = (hiFrom + hiTo) / 2;
    this.slots.forEach((slot, page) => {
      slot.dist = Math.abs(page - centre);
      slot.want = page >= hiFrom && page <= hiTo ? 2 : page >= loFrom && page <= loTo ? 1 : 0;

      // 不再需要高清：立刻释放（低清还在，画面不会空）
      if (slot.want < 2 && slot.hi) {
        slot.hi.dispose();
        slot.hi = null;
        slot.hiSize = 0;
        this.opts.onChange(page);
      }
      // 正在下载的东西已经不需要了：取消
      if (slot.ctrl && slot.loading > slot.want) {
        slot.ctrl.abort();
      }
    });
    this.evict();
  }

  /** 低清页超出预算时，从最远的开始释放。 */
  private evict() {
    const held: number[] = [];
    this.slots.forEach((slot, page) => {
      if (slot.lo) held.push(page);
    });
    let over = held.length - this.opts.maxLo;
    if (over <= 0) return;
    held.sort((a, b) => this.slots[b].dist - this.slots[a].dist);
    for (const page of held) {
      if (over <= 0) break;
      const slot = this.slots[page];
      if (slot.want > 0) continue; // 还在需要范围内的不动
      slot.lo!.dispose();
      slot.lo = null;
      over--;
      this.opts.onChange(page);
    }
  }

  /** 每帧调用：上传一页已解码的图，并补满下载队列。 */
  update(now: number) {
    if (this.disposed) return;
    const item = this.ready.shift();
    if (item) this.upload(item);
    if (this.active < MAX_PARALLEL) this.pump(now);
  }

  private upload(item: Decoded) {
    const slot = this.slots[item.page];
    const closeImage = () => {
      if ('close' in item.image) item.image.close();
    };
    // 解码期间镜头已经走远，不要了
    if (slot.want < item.level) {
      closeImage();
      return;
    }
    const tex = new THREE.Texture(item.image);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = this.opts.anisotropy;
    tex.needsUpdate = true;
    // 上传完成后立刻释放解码出来的位图，显存里那一份就够了
    tex.onUpdate = closeImage;
    this.gl.initTexture(tex);

    if (item.level === 1) {
      slot.lo?.dispose();
      slot.lo = tex;
    } else {
      slot.hi?.dispose();
      slot.hi = tex;
      slot.hiSize = item.size;
    }
    this.opts.onChange(item.page);
  }

  private pump(now: number) {
    // 候选：缺低清的页，以及缺高清（或高清档位不对）的页；近的优先，高清略让位于同页低清
    let best = -1;
    let bestLevel: Level = 0;
    let bestScore = Infinity;
    for (let page = 0; page < this.slots.length; page++) {
      const slot = this.slots[page];
      if (slot.want === 0 || slot.loading !== 0 || now < slot.retryAt) continue;
      let level: Level = 0;
      if (!slot.lo) level = 1;
      else if (slot.want === 2 && (!slot.hi || slot.hiSize !== this.hiSize) && this.hiSize !== this.opts.loSize) level = 2;
      if (!level) continue;
      const score = slot.dist + (level === 2 ? 0.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = page;
        bestLevel = level;
      }
    }
    if (best < 0) return;
    this.load(best, bestLevel);
    if (this.active < MAX_PARALLEL) this.pump(now);
  }

  private load(page: number, level: Level) {
    const slot = this.slots[page];
    const size = level === 1 ? this.opts.loSize : this.hiSize;
    const ctrl = new AbortController();
    slot.loading = level;
    slot.loadingSize = size;
    slot.ctrl = ctrl;
    this.active++;
    decode(atlas.url(size, page), ctrl.signal)
      .then((image) => {
        if (this.disposed || ctrl.signal.aborted) {
          if ('close' in image) image.close();
          return;
        }
        slot.fails = 0;
        this.ready.push({ page, level, size, image });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        slot.fails++;
        slot.retryAt = performance.now() + Math.min(30000, 1500 * 2 ** slot.fails);
        if (slot.fails === 1) console.warn(`[atlas] 图集页 ${page}（${size}）加载失败，稍后重试`, err);
      })
      .finally(() => {
        this.active--;
        if (slot.ctrl === ctrl) {
          slot.ctrl = null;
          slot.loading = 0;
        }
      });
  }

  /** WebGL 上下文丢失后重来：丢掉所有贴图，按当前需求重新加载。 */
  reset() {
    this.slots.forEach((slot, page) => {
      slot.ctrl?.abort();
      slot.lo?.dispose();
      slot.hi?.dispose();
      slot.lo = slot.hi = null;
      slot.hiSize = 0;
      this.opts.onChange(page);
    });
    for (const item of this.ready) if ('close' in item.image) item.image.close();
    this.ready = [];
  }

  dispose() {
    this.disposed = true;
    for (const slot of this.slots) {
      slot.ctrl?.abort();
      slot.lo?.dispose();
      slot.hi?.dispose();
      slot.lo = slot.hi = null;
    }
    for (const item of this.ready) if ('close' in item.image) item.image.close();
    this.ready = [];
  }
}
