/**
 * 运行时画质中枢（zustand）
 * ------------------------------------------------------------
 * 以设备静态档位为初值，运行时由场景里的帧率监测（Scene.tsx 的 Quality）动态调节：
 *   - setDpr：帧率波动时平滑升降画布像素比；
 *   - degrade：持续掉帧时逐级减少草叶 / 花朵 / 花瓣的数量，先保流畅。
 * 各 3D 组件订阅 density（0.35 ~ 1），按比例减少自己的实例数。
 */
import { create } from 'zustand';
import { getDeviceTier } from '../hooks/useDeviceTier';

const TIER = getDeviceTier();

interface QualityState {
  dpr: number;
  /** 植被 / 粒子密度系数 */
  density: number;
  setDpr: (dpr: number) => void;
  degrade: () => void;
}

export const useQuality = create<QualityState>((set, get) => ({
  dpr: TIER.dprMax,
  density: 1,

  setDpr: (dpr) => {
    const clamped = Math.max(1, Math.min(TIER.dprMax, Number(dpr.toFixed(2))));
    if (Math.abs(clamped - get().dpr) > 0.01) set({ dpr: clamped });
  },

  degrade: () => {
    const next = Math.max(0.35, get().density * 0.7);
    if (next !== get().density) set({ density: next });
  },
}));
