/**
 * 配色主题
 * ------------------------------------------------------------
 * 每个章节有一套自己的气球颜色，界面上的强调色也跟着章节走，
 * 所以走到哪一章，气球、彩旗和按钮就是哪一章的颜色。
 */
import type { PaletteName } from '../types';

export interface Palette {
  /** 界面强调色（按钮、标签） */
  accent: string;
  /** 强调色的浅底 */
  soft: string;
  /** 气球 / 彩旗 / 夹子的颜色 */
  balloons: string[];
}

export const PALETTES: Record<PaletteName, Palette> = {
  blush: {
    accent: '#ff6f91',
    soft: '#ffe3ea',
    balloons: ['#ff8fa3', '#ffc2d1', '#ff6b81', '#ffffff', '#ffd6a5'],
  },
  pearl: {
    accent: '#e9a04e',
    soft: '#fff1da',
    balloons: ['#ffffff', '#ffdfa8', '#ffd1dc', '#e3d4ff', '#fff1c1'],
  },
  party: {
    accent: '#ff8a5b',
    soft: '#ffe9dd',
    balloons: ['#ff8a80', '#ffd166', '#7ed9b7', '#7ec8f8', '#c3a6ff'],
  },
  ocean: {
    accent: '#3fa9f5',
    soft: '#ddf1ff',
    balloons: ['#7ec8f8', '#a0e7e5', '#ffffff', '#ffe08a', '#b4f8c8'],
  },
  meadow: {
    accent: '#45b872',
    soft: '#e0f7e6',
    balloons: ['#b4f8c8', '#8fd694', '#ffe08a', '#ffffff', '#9ad7fa'],
  },
  candy: {
    accent: '#a77bff',
    soft: '#efe6ff',
    balloons: ['#ffd166', '#ffb3c6', '#c3a6ff', '#a0e7e5', '#ffffff'],
  },
};

/** 没有指定配色的章节，按这个顺序轮流取用。 */
export const PALETTE_ORDER: PaletteName[] = ['blush', 'pearl', 'party', 'ocean', 'meadow', 'candy'];

/** 彩虹拱门、露天影院等「不属于任何章节」的地方用的综合配色。 */
export const RAINBOW = ['#ff8a80', '#ffb088', '#ffd76a', '#8fe0a8', '#7ec8f8', '#b9a2ff', '#ffa6c9'];

export const paletteOf = (name: PaletteName | undefined, fallbackIndex = 0): Palette =>
  PALETTES[name ?? PALETTE_ORDER[fallbackIndex % PALETTE_ORDER.length]] ?? PALETTES.blush;

/** 入口、影院等不属于任何章节的地方，界面用的默认强调色。 */
export const DEFAULT_ACCENT: Pick<Palette, 'accent' | 'soft'> = { accent: '#ff7e8a', soft: '#ffe3ea' };

/** 把一个 #rrggbb 颜色朝另一个颜色混合 amount（0~1）。 */
export function mixHex(hex: string, toward: string, amount: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = parse(hex);
  const b = parse(toward);
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
