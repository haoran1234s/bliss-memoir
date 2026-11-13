/**
 * 设备性能分级
 * ------------------------------------------------------------
 * 依据触控能力 / CPU 核心 / 内存粗略判定设备档位（low / mid / high），
 * 决定各项「画质 ↔ 开销」的初始值：画布像素比上限、草叶与花朵数量、
 * 照片图集取哪一档分辨率、同时保留多少页图集在显存里。
 * 另外探测能不能跑 3D（WebGL2），不能就整体改用平面版花园。
 * 只在模块加载时计算一次；运行时的动态降级交给 store/useQuality.ts。
 */
import { useMemo } from 'react';

export type TierLevel = 'low' | 'mid' | 'high';

export interface DeviceTier {
  isTouch: boolean;
  /** 能跑 3D 花园（WebGL2 + 硬件加速）；不能时改用平面版 */
  webgl2: boolean;
  level: TierLevel;
  /** 画布像素比上限 */
  dprMax: number;
  /** 草叶数量 */
  grass: number;
  /** 每片草叶的分段数（1 = 一个三角形） */
  grassSegments: 1 | 3;
  /** 花朵数量 */
  flowers: number;
  /** 空中花瓣数量 */
  petals: number;
  /** 蝴蝶数量 */
  butterflies: number;
  /** 树木 / 灌木密度系数 */
  flora: number;
  /** 近处照片用的图集分辨率 */
  atlasHi: number;
  /** 远处照片用的图集分辨率 */
  atlasLo: number;
  /** 镜头前后各多少站以内的照片，提前准备好低清图集 */
  atlasLoRadius: number;
  /** 显存里最多同时保留多少页低清图集 */
  atlasLoBudget: number;
  /** 章节封面牌的贴图宽度 */
  boardSize: number;
}

/**
 * 试着创建一个 WebGL2 上下文，测完马上释放（浏览器同时能开的上下文数量有限）。
 * 只有软件模拟渲染（显卡被浏览器拉黑等）时也算不支持：那样 3D 只有几帧，还不如平面版。
 */
function probeWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function detect(): DeviceTier {
  if (typeof window === 'undefined') return make('high', false, 2, true);
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
  const cores = navigator.hardwareConcurrency || 4;
  // deviceMemory 非标准，仅 Chromium 提供
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  // iOS 不暴露内存、核心数也常被压低，但近几年的 iPhone / iPad 性能都足够
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const weak = isTouch && !isApple && (cores <= 4 || mem <= 3);
  const level: TierLevel = !isTouch ? 'high' : weak ? 'low' : 'mid';
  const dpr = window.devicePixelRatio || 1;
  // 网址后面加 ?flat 可以在任何设备上预览平面版
  const flat = new URLSearchParams(window.location.search).has('flat');
  return make(level, isTouch, dpr, !flat && probeWebGL2());
}

function make(level: TierLevel, isTouch: boolean, dpr: number, webgl2: boolean): DeviceTier {
  const high = level === 'high';
  const low = level === 'low';
  return {
    isTouch,
    webgl2,
    level,
    dprMax: Math.min(dpr, low ? 1.5 : 2),
    grass: high ? 46000 : low ? 12000 : 24000,
    grassSegments: low ? 1 : 3,
    flowers: high ? 3200 : low ? 1000 : 1800,
    petals: high ? 150 : low ? 40 : 80,
    butterflies: high ? 14 : low ? 5 : 9,
    flora: high ? 1 : low ? 0.5 : 0.75,
    // 桌面高分屏才值得上 2048 的图集；手机上 1024 已经和屏幕像素对齐
    atlasHi: high && dpr >= 1.5 ? 2048 : 1024,
    atlasLo: 512,
    atlasLoRadius: high ? 8 : low ? 4 : 6,
    atlasLoBudget: high ? 64 : low ? 14 : 28,
    boardSize: low ? 768 : 1024,
  };
}

const TIER = detect();

/** 读取静态设备档位（非 React 环境，如 store / 场景初始化时用）。 */
export function getDeviceTier(): DeviceTier {
  return TIER;
}

export function useDeviceTier(): DeviceTier {
  return useMemo(() => TIER, []);
}
