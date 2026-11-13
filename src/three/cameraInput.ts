/**
 * 镜头输入中枢（模块级单例）
 * ------------------------------------------------------------
 * 手势层（DOM 事件）、导航栏、自动漫游都往这里写「目标进度」，
 * 镜头控制器（Canvas 内）每帧读取并平滑跟随。
 * 进度的单位是「站」：0 = 入口，1 = 第一块封面牌，……，最后一站 = 露天影院。
 * 用模块单例而不是 React 状态，避免每帧 setState 触发重渲染。
 */

export interface CamInput {
  /** 目标进度（拖动时带小数，松手后吸附到整数站） */
  target: number;
  /** 平滑后的实际进度，由镜头控制器维护 */
  value: number;
  /** 平滑用的速度（站 / 秒） */
  velocity: number;
  /** 正在用手指 / 鼠标拖动 */
  dragging: boolean;
  /** 桌面端鼠标位置带来的轻微视差（-1 ~ 1） */
  pointerX: number;
  pointerY: number;
  /** 陀螺仪视差（弧度） */
  gyroYaw: number;
  gyroPitch: number;
}

export const cam: CamInput = {
  target: 0,
  value: 0,
  velocity: 0,
  dragging: false,
  pointerX: 0,
  pointerY: 0,
  gyroYaw: 0,
  gyroPitch: 0,
};

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 临界阻尼平滑（与 Unity 的 SmoothDamp 相同）：起步柔、收尾稳，不会过冲。 */
export function smoothDamp(current: number, target: number, smoothTime: number, dt: number): number {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (cam.velocity + omega * change) * dt;
  cam.velocity = (cam.velocity - omega * temp) * decay;
  let out = target + (change + temp) * decay;
  if (target - current > 0 === out > target) {
    out = target;
    cam.velocity = 0;
  }
  return out;
}

/** 立刻把镜头放到某个进度（用于「云朵转场」后的瞬移）。 */
export function jumpTo(value: number, target = value) {
  cam.value = value;
  cam.target = target;
  cam.velocity = 0;
}
