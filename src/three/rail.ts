/**
 * 镜头轨道
 * ------------------------------------------------------------
 * 布局（world.ts）只规定「每一站要看什么、需要多宽多高入画」，
 * 这里再结合当前屏幕的宽高比，算出每一站镜头该站在哪，
 * 然后用 Catmull-Rom 样条把所有机位串成一条顺滑的轨道。
 *
 * 所以同一座花园，竖屏手机会站得近一点、视角广一点，
 * 横屏电脑会站得远一点，照片架始终刚好撑满画面。
 */
import * as THREE from 'three';
import type { World } from './world';

export interface Rail {
  /** 垂直视角（度） */
  fov: number;
  /** 站数 */
  count: number;
  /** 取进度 progress（可带小数）处的机位与注视点 */
  pose: (progress: number, pos: THREE.Vector3, look: THREE.Vector3) => void;
  /** 影院模式下的近景机位 */
  cinema: { pos: THREE.Vector3; look: THREE.Vector3 };
}

/** 竖屏用更广的视角（68°），横屏收窄到 50°，中间平滑过渡。 */
export function fovForAspect(aspect: number) {
  return THREE.MathUtils.lerp(68, 50, THREE.MathUtils.smoothstep(aspect, 0.6, 1.5));
}

/**
 * 矮屏（横着拿的手机，高度只有 360~430px）上，竖直方向不必把整束气球都框进来：
 * 按比例少框一点，镜头站近，照片就大了。640px 及以上的屏幕不受影响。
 */
function heightFactor(heightPx: number, min: number) {
  return THREE.MathUtils.clamp(heightPx / 640, min, 1);
}

/** 让 fitW × fitH（米）的区域入画时，镜头离目标的距离。minK 是矮屏上最多能少框多少。 */
export function viewDistance(fitW: number, fitH: number, aspect: number, heightPx: number, minK = 0.66) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovForAspect(aspect)) / 2);
  return Math.max(2.2, fitW / 2 / (tanV * aspect), (fitH * heightFactor(heightPx, minK)) / 2 / tanV);
}

function cameraFor(
  target: THREE.Vector3,
  normal: THREE.Vector3,
  fitW: number,
  fitH: number,
  camY: number,
  aspect: number,
  heightPx: number,
  minK?: number,
) {
  const d = viewDistance(fitW, fitH, aspect, heightPx, minK);
  return target.clone().addScaledVector(normal, d).setY(camY);
}

/** 入口和影院要看的是整体（拱门、整块银幕），矮屏上也少裁一些 */
const MIN_K = { entrance: 0.74, board: 0.66, rack: 0.66, cinema: 0.86 } as const;

/**
 * @param aspect   画布宽高比
 * @param heightPx 画布高度（CSS 像素）
 */
export function buildRail(world: World, aspect: number, heightPx: number): Rail {
  const fov = fovForAspect(aspect);
  const { stops } = world;

  const posPts: THREE.Vector3[] = [];
  const lookPts: THREE.Vector3[] = [];
  /** 每一站对应样条上的第几个控制点（中途点会插在两站之间） */
  const knot: number[] = [];

  stops.forEach((st, i) => {
    if (st.via && i > 0) {
      posPts.push(st.via.clone());
      lookPts.push(stops[i - 1].target.clone().lerp(st.target, 0.55));
    }
    knot.push(posPts.length);
    posPts.push(cameraFor(st.target, st.normal, st.fitW, st.fitH, st.camY, aspect, heightPx, MIN_K[st.kind]));
    lookPts.push(st.target.clone());
  });

  const posCurve = new THREE.CatmullRomCurve3(posPts, false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(lookPts, false, 'centripetal');
  const lastKnot = Math.max(1, posPts.length - 1);
  const count = stops.length;

  const v = world.cinema.view;
  return {
    fov,
    count,
    pose(progress, pos, look) {
      const p = THREE.MathUtils.clamp(progress, 0, count - 1);
      const i = Math.min(count - 2, Math.floor(p));
      const f = p - i;
      const u = (knot[i] + (knot[i + 1] - knot[i]) * f) / lastKnot;
      posCurve.getPoint(u, pos);
      lookCurve.getPoint(u, look);
    },
    cinema: {
      pos: cameraFor(v.target, world.cinema.normal, v.fitW, v.fitH, v.camY, aspect, heightPx, MIN_K.cinema),
      look: v.target.clone(),
    },
  };
}
