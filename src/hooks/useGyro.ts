/**
 * 陀螺仪微视差
 * ------------------------------------------------------------
 * 开启后，手机的轻微倾斜会转化为镜头的微小偏航 / 俯仰（写入 cam 的 gyro*，
 * 由镜头控制器叠加），像端着一扇窗在看花园。以首次读数为基准做相对偏移，
 * 幅度有上限，不会迷失方向。iOS 13+ 需要在用户手势里申请权限。
 */
import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { cam, clamp } from '../three/cameraInput';

type DOEvent = DeviceOrientationEvent;

/** 在用户手势中调用：如需权限则申请，返回是否可用。 */
export async function requestGyroPermission(): Promise<boolean> {
  const DOE = (
    window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<PermissionState> } }
  ).DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

export function useGyro() {
  const enabled = useStore((s) => s.gyroEnabled);

  useEffect(() => {
    if (!enabled) {
      cam.gyroYaw = 0;
      cam.gyroPitch = 0;
      return;
    }
    let base: { beta: number; gamma: number } | null = null;

    const handler = (e: DOEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) base = { beta: e.beta, gamma: e.gamma };
      cam.gyroYaw = clamp(-(e.gamma - base.gamma) * 0.005, -0.22, 0.22);
      cam.gyroPitch = clamp(-(e.beta - base.beta) * 0.005, -0.16, 0.16);
    };

    window.addEventListener('deviceorientation', handler);
    return () => {
      window.removeEventListener('deviceorientation', handler);
      cam.gyroYaw = 0;
      cam.gyroPitch = 0;
    };
  }, [enabled]);
}
