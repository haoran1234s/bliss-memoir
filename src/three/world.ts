/**
 * 花园布局（纯数据，不含任何渲染）
 * ------------------------------------------------------------
 * 根据照片库自动「长」出整座花园：
 *
 *   入口气球拱门 → [章节封面牌 → 照片架 × N] × 章节数 → 露天影院
 *
 *   - 小路是一条平缓的 S 形曲线，镜头沿着它前进；
 *   - 照片架和封面牌左右交替地摆在小路两侧，正对着走来的镜头，
 *     所以每划一下，镜头就向前、向另一侧滑一步，始终正面看照片；
 *   - 每个照片架是 cols × 3 的格子（竖屏 3 列、方屏 4 列、宽屏 6 列），
 *     由两束气球吊着，照片用小夹子夹在麻绳上；
 *   - 一章的照片会尽量平均地分到各个架子上，不会出现「最后一架只挂两张」。
 *
 * 这里输出的全是位置 / 朝向 / 尺寸等数据，3D 组件、镜头轨道、点击拾取、
 * 地面阴影贴图都从同一份数据读取，保证彼此对得上。
 */
import * as THREE from 'three';
import { chapters, photos } from '../data/library';
import { PALETTES, RAINBOW } from '../theme/palettes';
import { SUN_DAY } from './env';

export type Cols = 3 | 4 | 6;

/** 小路中心线：x = A·(1 − cos(K·s))，z = −s。起点处切线正对 −z。 */
export const PATH = { A: 4.2, K: (Math.PI * 2) / 78, HALF_W: 0.95 } as const;

export const CARD = {
  COL_PITCH: 0.62,
  /** 照片长边（米） */
  LONG: 0.5,
  /** 拍立得白边：左右上 */
  BORDER: 0.026,
  /** 拍立得白边：下 */
  BOTTOM: 0.072,
  /** 三根麻绳的高度 */
  TWINE_Y: [2.62, 1.92, 1.22],
  /** 麻绳中段的下垂量 */
  SAG: 0.035,
  /** 气球束系在架子两端的高度 */
  KNOT_Y: 2.76,
} as const;

export const BOARD = { W: 1.5, H: 1.84, CENTER_Y: 1.86 } as const;
export const SCREEN = { W: 6.4, H: 3.6, CENTER_Y: 2.75 } as const;
export const ARCH = { S: 7, HALF_W: 1.55, LEG_TOP: 2.3 } as const;

const ROWS = 3;
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** 各种列数下：架子离小路中线的横向距离 a、设计观看距离 d、相邻两站的纵向间距 pitch。 */
const LAYOUT: Record<Cols, { a: number; d: number; pitch: number }> = {
  3: { a: 1.2, d: 3.45, pitch: 3.9 },
  4: { a: 1.55, d: 4.1, pitch: 4.5 },
  6: { a: 2.3, d: 4.8, pitch: 5.2 },
};

/* ------------------------------------------------------------------ */
/*  类型                                                               */
/* ------------------------------------------------------------------ */
export type StopKind = 'entrance' | 'board' | 'rack' | 'cinema';

export interface StopInfo {
  kind: StopKind;
  /** 所属章节；入口 = -1，影院 = 章节数 */
  chapter: number;
  /** 照片架序号（仅 rack） */
  rack: number;
  /** 镜头看向的点 */
  target: THREE.Vector3;
  /** 从 target 指向镜头的水平单位向量 */
  normal: THREE.Vector3;
  /** 这一站需要完整入画的宽 / 高（米）；镜头距离由它和屏幕比例算出 */
  fitW: number;
  fitH: number;
  /** 镜头高度 */
  camY: number;
  /** 到达这一站之前要经过的中途点（绕开障碍） */
  via?: THREE.Vector3;
  /** 这一站附近的照片序号范围（用于图集流式加载） */
  first: number;
  last: number;
}

export interface RackInfo {
  index: number;
  chapter: number;
  stop: number;
  origin: THREE.Vector3;
  right: THREE.Vector3;
  normal: THREE.Vector3;
  halfW: number;
  seed: number;
  first: number;
  count: number;
}

export interface CardInfo {
  photo: number;
  rack: number;
  /** 夹子夹住的那一点（卡片上边缘中点） */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** 卡片自身的右 / 上 / 法线方向（含随机歪斜），供点击拾取 */
  right: THREE.Vector3;
  up: THREE.Vector3;
  normal: THREE.Vector3;
  /** 整张卡片的宽高 */
  w: number;
  h: number;
  /** 照片区域的宽高 */
  pw: number;
  ph: number;
  seed: number;
  rackSeed: number;
}

export interface BoardInfo {
  chapter: number;
  stop: number;
  center: THREE.Vector3;
  quat: THREE.Quaternion;
  right: THREE.Vector3;
  normal: THREE.Vector3;
  seed: number;
}

export interface BalloonInfo {
  pos: THREE.Vector3;
  /** 绳子另一端系在哪；没有绳子的气球（拱门）anchor 与 pos 相同 */
  anchor: THREE.Vector3;
  radius: number;
  color: string;
  seed: number;
  /** 所属架子的浮动种子；<0 表示固定不动 */
  bob: number;
  /** 晃动幅度系数 */
  sway: number;
  string: boolean;
  heart: boolean;
}

export interface RopeInfo {
  points: THREE.Vector3[];
  radius: number;
  bob: number;
  color: string;
}

export interface ClipInfo {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  color: string;
  bob: number;
}

export interface TreeInfo {
  pos: THREE.Vector3;
  /** 树干高度 */
  trunk: number;
  /** 树冠半径 */
  crown: number;
  kind: 'green' | 'lime' | 'blossom';
  seed: number;
}

export interface BlobInfo {
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  color: string;
  seed: number;
}

export interface PoleInfo {
  pos: THREE.Vector3;
  height: number;
  color: string;
}

export interface FlagInfo {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  color: string;
  seed: number;
}

export interface BulbInfo {
  pos: THREE.Vector3;
  color: string;
  seed: number;
}

export interface BlanketInfo {
  pos: THREE.Vector3;
  rotation: number;
  w: number;
  h: number;
  color: string;
}

/** 地面假阴影：world XZ 平面上的椭圆或多边形 */
export type ShadowShape =
  | { kind: 'ellipse'; x: number; z: number; rx: number; rz: number; rot: number; alpha: number }
  | { kind: 'poly'; pts: Array<[number, number]>; alpha: number };

export interface FlowerBed {
  x: number;
  z: number;
  r: number;
}

export interface World {
  cols: Cols;
  layout: { a: number; d: number; pitch: number; halfW: number };
  stops: StopInfo[];
  racks: RackInfo[];
  cards: CardInfo[];
  boards: BoardInfo[];
  balloons: BalloonInfo[];
  ropes: RopeInfo[];
  clips: ClipInfo[];
  trees: TreeInfo[];
  blobs: BlobInfo[];
  hills: BlobInfo[];
  poles: PoleInfo[];
  flags: FlagInfo[];
  bulbs: BulbInfo[];
  blankets: BlanketInfo[];
  cushions: BlobInfo[];
  shadows: ShadowShape[];
  beds: FlowerBed[];
  arch: {
    center: THREE.Vector3;
    right: THREE.Vector3;
    normal: THREE.Vector3;
    quat: THREE.Quaternion;
    signCenter: THREE.Vector3;
  };
  cinema: {
    s: number;
    center: THREE.Vector3;
    right: THREE.Vector3;
    normal: THREE.Vector3;
    quat: THREE.Quaternion;
    /** 进入影院模式后的近景机位参数 */
    view: { target: THREE.Vector3; fitW: number; fitH: number; camY: number };
  };
  /** 小路的有效范围（起点之前、影院之后渐隐） */
  pathRange: [number, number];
  /** 世界总长度（s 的最大值） */
  length: number;
  /** 地面贴图覆盖的世界矩形：[xMin, zMin, 宽, 深] */
  mapRect: [number, number, number, number];
  /** 照片序号 → 所在的站 / 架 */
  photoStop: Int32Array;
  /** 章节序号 → 封面牌所在的站 */
  chapterStop: number[];
}

/* ------------------------------------------------------------------ */
/*  小路几何                                                           */
/* ------------------------------------------------------------------ */
export const pathX = (s: number) => PATH.A * (1 - Math.cos(PATH.K * s));
export const pathSlope = (s: number) => PATH.A * PATH.K * Math.sin(PATH.K * s);

/** s 处的局部坐标系：中心点 c、前进方向 t、右手方向 r。 */
export function frameAt(s: number) {
  const slope = pathSlope(s);
  const inv = 1 / Math.hypot(slope, 1);
  const t = new THREE.Vector3(slope * inv, 0, -inv);
  const r = new THREE.Vector3(-t.z, 0, t.x);
  return { c: new THREE.Vector3(pathX(s), 0, -s), t, r };
}

/** 小路坐标 (s, 横向偏移, 高度) → 世界坐标 */
export function place(s: number, lateral: number, y: number) {
  const f = frameAt(s);
  return f.c.addScaledVector(f.r, lateral).setY(y);
}

/* ------------------------------------------------------------------ */
/*  工具                                                               */
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

/** 把 n 个东西尽量平均地分成 k 份（前面的份多拿余数）。 */
function distribute(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

const SHADOW_X = -SUN_DAY.x / SUN_DAY.y;
const SHADOW_Z = -SUN_DAY.z / SUN_DAY.y;
/** 把空中的一点沿太阳光方向投到地面上 */
const drop = (p: THREE.Vector3): [number, number] => [p.x + SHADOW_X * p.y, p.z + SHADOW_Z * p.y];

/** 一束气球里各个气球相对系绳点的位置模板 */
const BUNCH: Array<[number, number, number]> = [
  [0.0, 1.0, 0.0],
  [-0.27, 0.8, 0.08],
  [0.28, 0.77, -0.06],
  [-0.1, 0.57, -0.18],
  [0.13, 0.54, 0.19],
  [0.02, 0.33, 0.02],
  [-0.36, 0.5, -0.04],
  [0.38, 0.47, 0.06],
];

/* ------------------------------------------------------------------ */
/*  生成                                                               */
/* ------------------------------------------------------------------ */
export function buildWorld(cols: Cols, flora = 1): World {
  const L = LAYOUT[cols];
  const rand = mulberry32(20241020);
  const halfW = ((cols - 1) / 2) * CARD.COL_PITCH + (CARD.LONG + CARD.BORDER * 2) / 2;
  const span = halfW + 0.13;
  const perRack = cols * ROWS;

  const stops: StopInfo[] = [];
  const racks: RackInfo[] = [];
  const cards: CardInfo[] = [];
  const boards: BoardInfo[] = [];
  const balloons: BalloonInfo[] = [];
  const ropes: RopeInfo[] = [];
  const clips: ClipInfo[] = [];
  const poles: PoleInfo[] = [];
  const flags: FlagInfo[] = [];
  const shadows: ShadowShape[] = [];
  const beds: FlowerBed[] = [];
  const photoStop = new Int32Array(photos.length);
  const chapterStop: number[] = [];

  const TWINE = '#cfa97a';

  /** 以某个系绳点为根，放一束气球 */
  const addBunch = (
    anchor: THREE.Vector3,
    right: THREE.Vector3,
    normal: THREE.Vector3,
    colors: string[],
    count: number,
    scale: number,
    bob: number,
  ) => {
    const start = Math.floor(rand() * colors.length);
    for (let i = 0; i < count; i++) {
      const t = BUNCH[i % BUNCH.length];
      const j = () => (rand() - 0.5) * 0.07;
      const pos = anchor
        .clone()
        .addScaledVector(right, (t[0] + j()) * scale)
        .addScaledVector(UP, (t[1] + j()) * scale)
        .addScaledVector(normal, (t[2] + j()) * scale);
      balloons.push({
        pos,
        anchor: anchor.clone(),
        radius: (0.165 + rand() * 0.03) * scale,
        color: colors[(start + i) % colors.length],
        seed: rand(),
        bob,
        sway: 1,
        string: true,
        heart: false,
      });
    }
    const top = anchor.clone().addScaledVector(UP, 0.7 * scale);
    const [sx, sz] = drop(top);
    shadows.push({ kind: 'ellipse', x: sx, z: sz, rx: 0.5 * scale, rz: 0.42 * scale, rot: 0, alpha: 0.5 });
  };

  /** 小路两侧某个「槽位」的局部坐标系 */
  const slot = (s: number, side: number) => {
    const f = frameAt(s);
    const origin = f.c.clone().addScaledVector(f.r, side * L.a);
    const right = f.r.clone();
    const normal = f.t.clone().negate();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, UP, normal));
    const local = (x: number, y: number, z = 0) =>
      origin.clone().addScaledVector(right, x).addScaledVector(UP, y).addScaledVector(normal, z);
    return { origin, right, normal, quat, local };
  };

  /* —— 入口拱门 —— */
  const af = frameAt(ARCH.S);
  const archNormal = af.t.clone().negate();
  const archQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(af.r, UP, archNormal));
  {
    const leg = ARCH.LEG_TOP - 0.28;
    const arcLen = Math.PI * ARCH.HALF_W;
    const total = leg * 2 + arcLen;
    let k = 0;
    for (let u = 0; u <= total; u += 0.104, k++) {
      let x: number;
      let y: number;
      let nx: number;
      let ny: number;
      if (u < leg) {
        x = -ARCH.HALF_W;
        y = 0.28 + u;
        nx = -1;
        ny = 0;
      } else if (u < leg + arcLen) {
        const ang = Math.PI - (u - leg) / ARCH.HALF_W;
        nx = Math.cos(ang);
        ny = Math.sin(ang);
        x = nx * ARCH.HALF_W;
        y = ARCH.LEG_TOP + ny * ARCH.HALF_W;
      } else {
        x = ARCH.HALF_W;
        y = ARCH.LEG_TOP - (u - leg - arcLen);
        nx = 1;
        ny = 0;
      }
      const twist = k * 2.39996;
      const off = 0.15;
      const pos = af.c
        .clone()
        .addScaledVector(af.r, x + nx * Math.cos(twist) * off)
        .addScaledVector(UP, y + ny * Math.cos(twist) * off)
        .addScaledVector(af.t, Math.sin(twist) * off);
      const band = Math.min(RAINBOW.length - 1, Math.floor((u / total) * RAINBOW.length));
      balloons.push({
        pos,
        anchor: pos.clone(),
        radius: 0.2 + rand() * 0.055,
        color: rand() < 0.16 ? '#ffffff' : RAINBOW[band],
        seed: rand(),
        bob: -1,
        sway: 0.22,
        string: false,
        heart: false,
      });
      if (k % 6 === 0) {
        const [sx, sz] = drop(pos);
        shadows.push({ kind: 'ellipse', x: sx, z: sz, rx: 0.55, rz: 0.5, rot: 0, alpha: 0.45 });
      }
    }
    // 拱门脚下的花坛
    for (const sx of [-1, 1]) {
      const p = af.c.clone().addScaledVector(af.r, sx * (ARCH.HALF_W + 0.25));
      beds.push({ x: p.x, z: p.z, r: 1.5 });
    }
  }
  const signCenter = af.c.clone().addScaledVector(UP, 2.74);
  for (const sx of [-1, 1]) {
    ropes.push({
      points: [
        signCenter.clone().addScaledVector(af.r, sx * 0.72).addScaledVector(UP, 0.3),
        signCenter.clone().addScaledVector(af.r, sx * 0.66).addScaledVector(UP, 0.72),
      ],
      radius: 0.006,
      bob: -1,
      color: TWINE,
    });
  }

  stops.push({
    kind: 'entrance',
    chapter: -1,
    rack: -1,
    target: af.c.clone().addScaledVector(UP, 2.15),
    normal: archNormal.clone(),
    fitW: 4.4,
    fitH: 5.4,
    camY: 1.85,
    first: 0,
    last: Math.min(photos.length, perRack) - 1,
  });

  /* —— 章节：封面牌 + 照片架 —— */
  let s = ARCH.S + 2.6 + L.d;
  let side = -1;
  let lastS = ARCH.S + 2;
  let lastSide = 0;
  let pendingVia: THREE.Vector3 | undefined = place(ARCH.S + 0.3, 0, 1.75);

  chapters.forEach((chapter, ci) => {
    const palette = PALETTES[chapter.palette] ?? PALETTES.blush;
    const colors = palette.balloons;

    /* 章节入口：两根糖果色立柱拉起一串彩旗 */
    {
      const ps = s - 1.3;
      const reach = L.a + halfW + 1.7;
      const height = 5.3;
      const a = place(ps, -reach, 0);
      const b = place(ps, reach, 0);
      poles.push({ pos: a, height, color: colors[0] }, { pos: b, height, color: colors[2 % colors.length] });
      const f = frameAt(ps);
      const n = Math.max(6, Math.round((reach * 2) / 0.44));
      const flagQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(f.r, UP, f.t.clone().negate()),
      );
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const x = -reach + u * reach * 2;
        const y = height - 0.12 - 0.62 * (1 - (2 * u - 1) ** 2);
        flags.push({
          pos: place(ps, x, y),
          quat: flagQuat,
          color: colors[i % colors.length],
          seed: rand(),
        });
      }
      const rope: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        rope.push(place(ps, -reach + u * reach * 2, height - 0.1 - 0.62 * (1 - (2 * u - 1) ** 2)));
      }
      ropes.push({ points: rope, radius: 0.008, bob: -1, color: '#ffffff' });
      for (const p of [a, b]) {
        beds.push({ x: p.x, z: p.z, r: 1.3 });
        const [sx, sz] = drop(new THREE.Vector3(p.x, height * 0.5, p.z));
        shadows.push({ kind: 'ellipse', x: sx, z: sz, rx: 0.22, rz: 2.3, rot: Math.atan2(SHADOW_X, SHADOW_Z), alpha: 0.4 });
      }
    }

    /* 封面牌 */
    {
      const g = slot(s, side);
      const seed = rand();
      const center = g.local(0, BOARD.CENTER_Y, 0);
      const top = BOARD.CENTER_Y + BOARD.H / 2;
      chapterStop[ci] = stops.length;
      boards.push({ chapter: ci, stop: stops.length, center, quat: g.quat, right: g.right, normal: g.normal, seed });
      for (const sx of [-1, 1]) {
        const knot = g.local(sx * 0.68, top + 0.26, -0.01);
        ropes.push({ points: [g.local(sx * 0.6, top - 0.02, -0.01), knot], radius: 0.006, bob: seed, color: TWINE });
        addBunch(knot, g.right, g.normal, colors, 6, 1.12, seed);
      }
      // 正中一只爱心气球
      const heartAnchor = g.local(0, top - 0.02, -0.01);
      balloons.push({
        pos: g.local(0, top + 0.95, -0.02),
        anchor: heartAnchor,
        radius: 0.3,
        color: palette.accent,
        seed: rand(),
        bob: seed,
        sway: 0.8,
        string: true,
        heart: true,
      });
      shadows.push({
        kind: 'poly',
        pts: [
          drop(g.local(-BOARD.W / 2, top)),
          drop(g.local(BOARD.W / 2, top)),
          drop(g.local(BOARD.W / 2, top - BOARD.H)),
          drop(g.local(-BOARD.W / 2, top - BOARD.H)),
        ],
        alpha: 0.85,
      });
      beds.push({ x: g.origin.x, z: g.origin.z, r: 1.7 });
      stops.push({
        kind: 'board',
        chapter: ci,
        rack: -1,
        target: g.local(0, 1.95),
        normal: g.normal.clone(),
        fitW: 2.1,
        fitH: 4.7,
        camY: 1.74,
        via: pendingVia,
        first: chapter.start,
        last: Math.min(chapter.start + perRack, photos.length) - 1,
      });
      pendingVia = undefined;
      lastS = s;
      lastSide = side;
      s += L.pitch;
      side = -side;
    }

    /* 照片架 */
    const rackCount = Math.ceil(chapter.count / perRack);
    const perRackCounts = rackCount ? distribute(chapter.count, rackCount) : [];
    let next = chapter.start;
    for (const m of perRackCounts) {
      const g = slot(s, side);
      const seed = rand();
      const rackIndex = racks.length;
      const rows = distribute(m, Math.min(ROWS, m));
      const first = next;

      rows.forEach((n, row) => {
        const twineY = CARD.TWINE_Y[row];
        const sag = (x: number) => CARD.SAG * (1 - (x / span) ** 2);
        for (let c = 0; c < n; c++) {
          const photo = photos[next];
          const x = (c - (n - 1) / 2) * CARD.COL_PITCH;
          const pw = photo.aspect >= 1 ? CARD.LONG : CARD.LONG * photo.aspect;
          const ph = photo.aspect >= 1 ? CARD.LONG / photo.aspect : CARD.LONG;
          const w = pw + CARD.BORDER * 2;
          const h = ph + CARD.BORDER + CARD.BOTTOM;
          const tilt = (rand() - 0.5) * 0.09;
          const quat = g.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, tilt));
          // 相邻两张前后错开一点，晃动时即使边角相碰也不会闪烁
          const depth = c % 2 === 0 ? 0.006 : 0.013;
          const pos = g.local(x, twineY - sag(x) - 0.012, depth);
          cards.push({
            photo: next,
            rack: rackIndex,
            pos,
            quat,
            right: new THREE.Vector3(1, 0, 0).applyQuaternion(quat),
            up: new THREE.Vector3(0, 1, 0).applyQuaternion(quat),
            normal: g.normal.clone(),
            w,
            h,
            pw,
            ph,
            seed: rand(),
            rackSeed: seed,
          });
          clips.push({
            pos: g.local(x, twineY - sag(x) - 0.004, depth + 0.006),
            quat,
            color: colors[(c + row) % colors.length],
            bob: seed,
          });
          photoStop[next] = stops.length;
          next += 1;
        }
        const line: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const x = -span + (i / 10) * span * 2;
          line.push(g.local(x, twineY - sag(x), 0));
        }
        ropes.push({ points: line, radius: 0.0065, bob: seed, color: TWINE });
      });

      const lowY = CARD.TWINE_Y[rows.length - 1];
      for (const sx of [-1, 1]) {
        const knot = g.local(sx * span, CARD.KNOT_Y, 0);
        ropes.push({
          points: [knot, g.local(sx * span, lowY, 0), g.local(sx * (span + 0.015), lowY - 0.2, 0)],
          radius: 0.0055,
          bob: seed,
          color: TWINE,
        });
        addBunch(knot, g.right, g.normal, colors, 5, 1, seed);
      }
      shadows.push({
        kind: 'poly',
        pts: [
          drop(g.local(-span, CARD.TWINE_Y[0] + 0.05)),
          drop(g.local(span, CARD.TWINE_Y[0] + 0.05)),
          drop(g.local(span, lowY - 0.62)),
          drop(g.local(-span, lowY - 0.62)),
        ],
        alpha: 0.62,
      });

      racks.push({
        index: rackIndex,
        chapter: ci,
        stop: stops.length,
        origin: g.origin,
        right: g.right,
        normal: g.normal,
        halfW,
        seed,
        first,
        count: m,
      });
      stops.push({
        kind: 'rack',
        chapter: ci,
        rack: rackIndex,
        target: g.local(0, 1.75),
        normal: g.normal.clone(),
        fitW: halfW * 2 + 0.36,
        fitH: 4.5,
        camY: 1.68,
        first,
        last: next - 1,
      });
      lastS = s;
      lastSide = side;
      s += L.pitch;
      side = -side;
    }
    s += 1.4;
  });

  /* —— 露天影院 —— */
  const screenS = lastS + 15.5;
  const cf = frameAt(screenS);
  const cinemaNormal = cf.t.clone().negate();
  const cinemaQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(cf.r, UP, cinemaNormal));
  const screenCenter = cf.c.clone().addScaledVector(UP, SCREEN.CENTER_Y);
  /** 影院局部坐标：x 向右、y 向上、z 朝观众 */
  const cine = (x: number, y: number, z: number) =>
    cf.c.clone().addScaledVector(cf.r, x).addScaledVector(UP, y).addScaledVector(cinemaNormal, z);

  const bulbs: BulbInfo[] = [];
  const blankets: BlanketInfo[] = [];
  const cushions: BlobInfo[] = [];
  {
    // 四根灯柱 + 灯串
    const corners: Array<[number, number, number]> = [
      [-5.0, 5.7, -0.5],
      [5.0, 5.7, -0.5],
      [5.5, 4.7, 9.6],
      [-5.5, 4.7, 9.6],
    ];
    corners.forEach(([x, h, z], i) => {
      poles.push({ pos: cine(x, 0, z), height: h, color: RAINBOW[(i * 2) % RAINBOW.length] });
      const p = cine(x, 0, z);
      beds.push({ x: p.x, z: p.z, r: 1.2 });
    });
    const runs: Array<[number, number, number]> = [
      [0, 1, 0.5],
      [1, 2, 0.9],
      [2, 3, 0.8],
      [3, 0, 0.9],
      [0, 2, 1.1],
      [1, 3, 1.1],
    ];
    const WARM = ['#fff1c9', '#ffe2a6', '#fff6e0', '#ffd9b0'];
    for (const [ia, ib, sagAmount] of runs) {
      const a = cine(corners[ia][0], corners[ia][1] - 0.08, corners[ia][2]);
      const b = cine(corners[ib][0], corners[ib][1] - 0.08, corners[ib][2]);
      const len = a.distanceTo(b);
      const n = Math.max(6, Math.round(len / 0.5));
      const line: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const p = a.clone().lerp(b, u);
        p.y -= sagAmount * (1 - (2 * u - 1) ** 2);
        line.push(p);
        if (i > 0 && i < n) {
          bulbs.push({ pos: p.clone().setY(p.y - 0.07), color: WARM[bulbs.length % WARM.length], seed: rand() });
        }
      }
      ropes.push({ points: line, radius: 0.007, bob: -1, color: '#6f6890' });
    }

    // 野餐垫与靠垫
    const mats: Array<[number, number, number, number, number, string]> = [
      [-2.3, 4.7, 0.22, 2.3, 1.7, '#ff8fa3'],
      [2.1, 5.7, -0.26, 2.1, 1.6, '#7ed9b7'],
      [-0.4, 8.0, 0.08, 2.4, 1.7, '#ffd166'],
      [3.4, 8.6, 0.35, 1.9, 1.5, '#7ec8f8'],
    ];
    const yaw = Math.atan2(cf.r.z, cf.r.x);
    for (const [x, z, rot, w, h, color] of mats) {
      blankets.push({ pos: cine(x, 0.02, z), rotation: rot - yaw, w, h, color });
      const count = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < count; i++) {
        const r = 0.24 + rand() * 0.08;
        cushions.push({
          pos: cine(x + (rand() - 0.5) * w * 0.6, r * 0.42, z + (rand() - 0.5) * h * 0.5),
          scale: new THREE.Vector3(r, r * 0.45, r),
          color: RAINBOW[Math.floor(rand() * RAINBOW.length)],
          seed: rand(),
        });
      }
    }

    // 银幕两侧各一大束气球 + 爱心
    for (const sx of [-1, 1]) {
      const anchor = cine(sx * (SCREEN.W / 2 + 0.2), SCREEN.CENTER_Y + SCREEN.H / 2 + 0.1, 0.1);
      addBunch(anchor, cf.r, cinemaNormal, RAINBOW, 8, 1.3, -1);
      balloons.push({
        pos: cine(sx * (SCREEN.W / 2 + 0.75), SCREEN.CENTER_Y + SCREEN.H / 2 + 0.95, 0.3),
        anchor,
        radius: 0.34,
        color: '#ff7e8a',
        seed: rand(),
        bob: -1,
        sway: 0.8,
        string: true,
        heart: true,
      });
    }
    // 银幕的影子
    const top = SCREEN.CENTER_Y + SCREEN.H / 2 + 0.14;
    const bottom = SCREEN.CENTER_Y - SCREEN.H / 2 - 0.14;
    shadows.push({
      kind: 'poly',
      pts: [
        drop(cine(-SCREEN.W / 2 - 0.14, top, 0)),
        drop(cine(SCREEN.W / 2 + 0.14, top, 0)),
        drop(cine(SCREEN.W / 2 + 0.14, bottom, 0)),
        drop(cine(-SCREEN.W / 2 - 0.14, bottom, 0)),
      ],
      alpha: 0.9,
    });
  }

  stops.push({
    kind: 'cinema',
    chapter: chapters.length,
    rack: -1,
    target: cine(0, 2.5, 0),
    normal: cinemaNormal.clone(),
    fitW: 8.4,
    fitH: 6.6,
    camY: 1.85,
    via: pendingVia ?? place(lastS + 0.3, -lastSide * 0.75, 1.72),
    first: Math.max(0, photos.length - perRack),
    last: photos.length - 1,
  });

  const length = screenS + 8;

  /* —— 树、灌木、远山 —— */
  const trees: TreeInfo[] = [];
  const blobs: BlobInfo[] = [];
  const hills: BlobInfo[] = [];
  {
    const GREENS = ['#7fcf6a', '#6cc36a', '#8ed86f', '#74c98a'];
    const LIMES = ['#b5e36c', '#a6dc74', '#c4e97a'];
    const BLOSSOMS = ['#ffb7cf', '#ffc9da', '#ff9fc0', '#ffd6e3'];
    const want = Math.round(Math.min(150, (length + 90) * 0.48) * flora);
    let guard = 0;
    while (trees.length < want && guard++ < want * 30) {
      const ts = -42 + rand() * (length + 100);
      const lateral = (rand() < 0.5 ? -1 : 1) * (10.5 + rand() ** 1.3 * 36);
      // 影院正前方留出开阔的草坪
      if (ts > screenS - 16 && ts < screenS + 4 && Math.abs(lateral) < 12) continue;
      const pos = place(ts, lateral, 0);
      if (trees.some((t) => t.pos.distanceToSquared(pos) < 30)) continue;
      const roll = rand();
      trees.push({
        pos,
        trunk: 1.5 + rand() * 1.2,
        crown: 1.5 + rand() * 1.0,
        kind: roll < 0.3 ? 'blossom' : roll < 0.52 ? 'lime' : 'green',
        seed: rand(),
      });
    }
    for (const t of trees) {
      const tints = t.kind === 'blossom' ? BLOSSOMS : t.kind === 'lime' ? LIMES : GREENS;
      const cy = t.trunk + t.crown * 0.72;
      const puffs: Array<[number, number, number, number]> = [
        [0, 0, 0, 1],
        [0.62, -0.18, 0.2, 0.68],
        [-0.6, -0.12, -0.25, 0.7],
        [0.1, 0.42, -0.3, 0.62],
        [-0.15, -0.05, 0.6, 0.6],
      ];
      const rot = rand() * Math.PI * 2;
      for (const [px, py, pz, ps] of puffs) {
        const x = px * Math.cos(rot) - pz * Math.sin(rot);
        const z = px * Math.sin(rot) + pz * Math.cos(rot);
        const r = t.crown * ps * (0.92 + rand() * 0.16);
        blobs.push({
          pos: new THREE.Vector3(t.pos.x + x * t.crown, cy + py * t.crown, t.pos.z + z * t.crown),
          scale: new THREE.Vector3(r, r * 0.86, r),
          color: tints[Math.floor(rand() * tints.length)],
          seed: rand(),
        });
      }
      const [sx, sz] = drop(new THREE.Vector3(t.pos.x, cy, t.pos.z));
      shadows.push({ kind: 'ellipse', x: sx, z: sz, rx: t.crown * 1.25, rz: t.crown * 1.1, rot: 0, alpha: 0.8 });
      if (t.kind === 'blossom') beds.push({ x: t.pos.x, z: t.pos.z, r: t.crown * 1.6 });
    }

    // 小路两旁的圆灌木
    const bushCount = Math.round(length * 0.3 * flora);
    const inner = L.a + halfW + 1.9;
    for (let i = 0; i < bushCount; i++) {
      const bs = -14 + rand() * (length + 10);
      const lateral = (rand() < 0.5 ? -1 : 1) * (inner + rand() * 3.6);
      if (bs > screenS - 14 && bs < screenS + 3 && Math.abs(lateral) < 7.5) continue;
      const pos = place(bs, lateral, 0);
      const r = 0.42 + rand() * 0.42;
      const tint = rand() < 0.25 ? BLOSSOMS : rand() < 0.5 ? LIMES : GREENS;
      const n = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const rr = r * (k === 0 ? 1 : 0.62 + rand() * 0.2);
        const ang = rand() * Math.PI * 2;
        const dist = k === 0 ? 0 : r * 0.75;
        blobs.push({
          pos: new THREE.Vector3(pos.x + Math.cos(ang) * dist, rr * 0.62, pos.z + Math.sin(ang) * dist),
          scale: new THREE.Vector3(rr, rr * 0.8, rr),
          color: tint[Math.floor(rand() * tint.length)],
          seed: rand(),
        });
      }
      const [sx, sz] = drop(new THREE.Vector3(pos.x, r * 0.6, pos.z));
      shadows.push({ kind: 'ellipse', x: sx, z: sz, rx: r * 1.5, rz: r * 1.3, rot: 0, alpha: 0.6 });
    }

    // 远处的圆润山丘
    const HILLS = ['#a8dd8a', '#9bd68f', '#b6e596', '#8fd0a0'];
    const addHill = (hs: number, lateral: number) => {
      const p = place(hs, lateral, 0);
      const r = 46 + rand() * 40;
      const h = 10 + rand() * 12;
      hills.push({
        pos: new THREE.Vector3(p.x, -h * 0.28, p.z),
        scale: new THREE.Vector3(r, h, r * (0.7 + rand() * 0.5)),
        color: HILLS[Math.floor(rand() * HILLS.length)],
        seed: rand(),
      });
    };
    for (let hs = -90; hs < length + 160; hs += 50) {
      addHill(hs + rand() * 20, -(105 + rand() * 60));
      addHill(hs + rand() * 20, 105 + rand() * 60);
    }
    for (let i = 0; i < 4; i++) addHill(length + 150 + rand() * 60, -110 + i * 75 + rand() * 20);
    for (let i = 0; i < 3; i++) addHill(-150 - rand() * 40, -90 + i * 90);
  }

  return {
    cols,
    layout: { ...L, halfW },
    stops,
    racks,
    cards,
    boards,
    balloons,
    ropes,
    clips,
    trees,
    blobs,
    hills,
    poles,
    flags,
    bulbs,
    blankets,
    cushions,
    shadows,
    beds,
    arch: { center: af.c.clone(), right: af.r.clone(), normal: archNormal, quat: archQuat, signCenter },
    cinema: {
      s: screenS,
      center: screenCenter,
      right: cf.r.clone(),
      normal: cinemaNormal,
      quat: cinemaQuat,
      view: { target: screenCenter.clone(), fitW: SCREEN.W + 0.7, fitH: SCREEN.H + 1.1, camY: 2.25 },
    },
    pathRange: [-60, screenS - 3],
    length,
    mapRect: [-52, -(length + 70), 112, length + 70 + 48],
    photoStop,
    chapterStop,
  };
}

/** 按屏幕宽高比决定每个照片架的列数。 */
export function colsForAspect(aspect: number): Cols {
  if (aspect < 0.85) return 3;
  if (aspect < 1.45) return 4;
  return 6;
}
