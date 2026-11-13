/**
 * 点击拾取
 * ------------------------------------------------------------
 * 照片卡是实例化渲染的（一页图集一次绘制），没法用 three 自带的射线检测，
 * 而且卡片还在跟着气球轻轻浮动。这里直接用布局数据做「射线 × 平面」求交：
 * 只检查镜头附近几个架子上的卡片，一次点击不到一百次乘加，手机上也是瞬间完成。
 */
import * as THREE from 'three';
import { env } from './env';
import { BOARD, CARD, SCREEN, type World } from './world';

export type Hit =
  | { kind: 'photo'; index: number }
  | { kind: 'board'; chapter: number }
  | { kind: 'screen' };

/** 鼠标正悬停在哪张照片上（-1 = 没有）。手势层写入，照片卡的着色器读取。 */
export const hover = { index: -1 };

/** 与着色器里的 rackBob() 完全一致：被气球吊着的东西的整体浮动。 */
export function rackBob(seed: number, out: THREE.Vector3) {
  const t = env.uTime.value;
  return out.set(
    Math.sin(t * 0.55 + seed * 31.4) * 0.016,
    Math.sin(t * 0.8 + seed * 57.1) * 0.028,
    Math.sin(t * 0.47 + seed * 13.7) * 0.012,
  );
}

const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const bob = new THREE.Vector3();
const point = new THREE.Vector3();
const local = new THREE.Vector3();

/** 射线与「过 p、法线为 n」的平面求交，返回距离；不相交返回 -1。 */
function hitPlane(p: THREE.Vector3, n: THREE.Vector3) {
  const denom = dir.dot(n);
  if (Math.abs(denom) < 1e-5) return -1;
  const t = local.subVectors(p, origin).dot(n) / denom;
  if (t <= 0.05) return -1;
  return t;
}

/**
 * @param ndcX,ndcY 归一化设备坐标（-1 ~ 1）
 * @param stop      镜头当前所在的站（只检查附近的架子）
 */
export function pick(world: World, camera: THREE.Camera, ndcX: number, ndcY: number, stop: number): Hit | null {
  origin.setFromMatrixPosition(camera.matrixWorld);
  dir.set(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();

  let best = Infinity;
  let hit: Hit | null = null;
  const pad = 0.012;

  for (const rack of world.racks) {
    if (Math.abs(rack.stop - stop) > 2) continue;
    rackBob(rack.seed, bob);
    for (let i = rack.first; i < rack.first + rack.count; i++) {
      const card = world.cards[i];
      point.copy(card.pos).add(bob);
      const t = hitPlane(point, card.normal);
      if (t < 0 || t >= best) continue;
      local.copy(dir).multiplyScalar(t).add(origin).sub(point);
      const x = local.dot(card.right);
      const y = local.dot(card.up);
      if (Math.abs(x) <= card.w / 2 + pad && y <= pad && y >= -card.h - pad) {
        best = t;
        hit = { kind: 'photo', index: card.photo };
      }
    }
  }

  for (const board of world.boards) {
    if (Math.abs(board.stop - stop) > 2) continue;
    rackBob(board.seed, bob);
    point.copy(board.center).add(bob);
    const t = hitPlane(point, board.normal);
    if (t < 0 || t >= best) continue;
    local.copy(dir).multiplyScalar(t).add(origin).sub(point);
    if (Math.abs(local.dot(board.right)) <= BOARD.W / 2 && Math.abs(local.y) <= BOARD.H / 2) {
      best = t;
      hit = { kind: 'board', chapter: board.chapter };
    }
  }

  if (stop >= world.stops.length - 2) {
    const c = world.cinema;
    const t = hitPlane(c.center, c.normal);
    if (t > 0 && t < best) {
      local.copy(dir).multiplyScalar(t).add(origin).sub(c.center);
      if (Math.abs(local.dot(c.right)) <= SCREEN.W / 2 && Math.abs(local.y) <= SCREEN.H / 2) {
        best = t;
        hit = { kind: 'screen' };
      }
    }
  }

  return hit;
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 某张照片（不含白边）此刻在屏幕上的矩形，供「从卡片放大到全屏」的转场使用。 */
export function photoScreenRect(
  world: World,
  index: number,
  camera: THREE.Camera,
  width: number,
  height: number,
): ScreenRect | null {
  const card = world.cards[index];
  if (!card) return null;
  rackBob(card.rackSeed, bob);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [
    [-1, 0],
    [1, 0],
    [1, 1],
    [-1, 1],
  ]) {
    point
      .copy(card.pos)
      .add(bob)
      .addScaledVector(card.right, (sx * card.pw) / 2)
      .addScaledVector(card.up, -CARD.BORDER - sy * card.ph)
      .project(camera);
    if (point.z > 1) return null;
    const x = (point.x * 0.5 + 0.5) * width;
    const y = (-point.y * 0.5 + 0.5) * height;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 8 || h < 8 || maxX < 0 || maxY < 0 || minX > width || minY > height) return null;
  return { x: minX, y: minY, w, h };
}
