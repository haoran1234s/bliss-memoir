/**
 * 程序化几何体
 * ------------------------------------------------------------
 * 花园里所有的形状都是代码生成的，没有外部模型文件：
 * 气球、爱心、草叶、小花、麻绳、彩旗……全部走实例化渲染，
 * 一种形状只占一次绘制调用。
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RopeInfo } from './world';

const spheres = new Map<number, THREE.BufferGeometry>();

/** 顶点焊接过的单位球（法线就是位置），按细分级别缓存：1 → 80 面，2 → 320 面，3 → 1280 面。 */
export function sphereGeometry(detail: number) {
  let geo = spheres.get(detail);
  if (!geo) {
    const ico = new THREE.IcosahedronGeometry(1, detail);
    ico.deleteAttribute('uv');
    ico.deleteAttribute('normal');
    geo = mergeVertices(ico, 1e-4);
    geo.setAttribute('normal', geo.getAttribute('position').clone());
    ico.dispose();
    spheres.set(detail, geo);
  }
  return geo;
}

let trunk: THREE.BufferGeometry | null = null;

/** 上细下粗的圆柱（底面在原点，高 1），用作树干 / 立柱。 */
export function trunkGeometry() {
  if (!trunk) {
    trunk = new THREE.CylinderGeometry(0.66, 1, 1, 10, 1, true);
    trunk.translate(0, 0.5, 0);
    trunk.deleteAttribute('uv');
  }
  return trunk;
}

let pole: THREE.BufferGeometry | null = null;

/** 等粗的圆柱（底面在原点，高 1、半径 1）。 */
export function poleGeometry() {
  if (!pole) {
    pole = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    pole.translate(0, 0.5, 0);
    pole.deleteAttribute('uv');
  }
  return pole;
}

/** 水滴形气球（半径约 1，底部带一个小小的结）。 */
export function balloonGeometry(segments = 16, rings = 11) {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0001, -1.21),
    new THREE.Vector2(0.08, -1.2),
    new THREE.Vector2(0.03, -1.1),
  ];
  for (let i = 1; i <= rings; i++) {
    const a = (i / rings) * Math.PI;
    const r = Math.sin(a) * (1 - 0.17 * Math.cos(a));
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), -Math.cos(a) * 1.1));
  }
  return new THREE.LatheGeometry(pts, segments);
}

/** 鼓鼓的爱心铝膜气球（宽约 2，已居中）。 */
export function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.92);
  s.bezierCurveTo(-0.95, -0.2, -1.28, 0.42, -0.64, 0.84);
  s.bezierCurveTo(-0.3, 1.04, 0, 0.84, 0, 0.5);
  s.bezierCurveTo(0, 0.84, 0.3, 1.04, 0.64, 0.84);
  s.bezierCurveTo(1.28, 0.42, 0.95, -0.2, 0, -0.92);
  const extruded = new THREE.ExtrudeGeometry(s, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.3,
    bevelSize: 0.24,
    bevelSegments: 5,
    curveSegments: 12,
  });
  extruded.center();
  extruded.deleteAttribute('uv');
  extruded.deleteAttribute('normal');
  // 合并重合顶点后再算法线，棱角被抹平，才有「充了气」的圆润感
  const geo = mergeVertices(extruded, 1e-3);
  geo.computeVertexNormals();
  geo.scale(0.82, 0.82, 0.82);
  return geo;
}

/** 一片草叶：x ∈ [-0.5, 0.5]（已按高度收窄），y ∈ [0, 1]。 */
export function bladeGeometry(segments: 1 | 3) {
  const geo = new THREE.BufferGeometry();
  if (segments === 1) {
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0], 3));
  } else {
    // prettier-ignore
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, 0,   0.5, 0, 0,
      -0.42, 0.38, 0,   0.42, 0.38, 0,
      -0.26, 0.72, 0,   0.26, 0.72, 0,
      0, 1, 0,
    ], 3));
    geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  }
  return geo;
}

/**
 * 一朵小花：茎 + 六片花瓣 + 花心。
 * aPart：0 茎（position = 侧向, 高度比例, 哪一片十字面），1 花瓣，2 花心（position 为花头局部坐标）。
 * aShade：花瓣从根到尖的明暗。
 */
export function flowerGeometry() {
  const pos: number[] = [];
  const part: number[] = [];
  const shade: number[] = [];
  const index: number[] = [];
  const push = (x: number, y: number, z: number, p: number, s: number) => {
    pos.push(x, y, z);
    part.push(p);
    shade.push(s);
    return pos.length / 3 - 1;
  };

  // 茎：两片交叉的细长四边形
  for (const quad of [0, 1]) {
    const a = push(-0.5, 0, quad, 0, 0.8);
    const b = push(0.5, 0, quad, 0, 0.8);
    const c = push(-0.5, 1, quad, 0, 1);
    const d = push(0.5, 1, quad, 0, 1);
    index.push(a, b, c, b, d, c);
  }

  // 花瓣：微微上翘的风筝形
  const PETALS = 6;
  for (let i = 0; i < PETALS; i++) {
    const ang = (i / PETALS) * Math.PI * 2;
    const half = (Math.PI / PETALS) * 0.92;
    const at = (r: number, a: number, lift: number, s: number) =>
      push(Math.cos(a) * r, lift, Math.sin(a) * r, 1, s);
    const inner = at(0.16, ang, 0.02, 0.8);
    const left = at(0.64, ang - half, 0.12, 0.95);
    const right = at(0.64, ang + half, 0.12, 0.95);
    const tip = at(1.0, ang, 0.24, 1.05);
    index.push(inner, right, left, left, right, tip);
  }

  // 花心：六边形
  const centre = push(0, 0.1, 0, 2, 1);
  const ring: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ring.push(push(Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3, 2, 0.88));
  }
  for (let i = 0; i < 6; i++) index.push(centre, ring[(i + 1) % 6], ring[i]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  geo.setIndex(index);
  return geo;
}

/** 三角彩旗：上边缘中点在原点，向下垂。 */
export function flagGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, -1, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return geo;
}

/** 蝴蝶：左右两片翅膀。aWing = -1 / +1 表示左右。 */
export function butterflyGeometry() {
  const pos: number[] = [];
  const wing: number[] = [];
  const index: number[] = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    // 上翅 + 下翅，沿身体（z 轴）排列；x 为离身体的距离
    // prettier-ignore
    const pts = [
      [0, 0.0, 0.5],  [1.0, 0.0, 0.85],  [0.95, 0.0, 0.1],  [0, 0.0, -0.05],
      [0.7, 0.0, -0.75], [0, 0.0, -0.45],
    ];
    for (const [x, y, z] of pts) {
      pos.push(x, y, z);
      wing.push(side);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 3, base + 2, base + 4, base + 3, base + 4, base + 5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  geo.setIndex(index);
  return geo;
}

/**
 * 把所有麻绳 / 灯线合并成一个几何体：每根是一条四棱细管。
 * 带顶点色（color）和浮动种子（aBob；<0 表示固定不动）。
 */
export function ropeGeometry(ropes: RopeInfo[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const colors: number[] = [];
  const bob: number[] = [];
  const index: number[] = [];
  const t = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const c = new THREE.Color();
  const SIDES = 4;

  for (const rope of ropes) {
    const pts = rope.points;
    if (pts.length < 2) continue;
    c.set(rope.color);
    const start = pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      t.subVectors(b, a).normalize();
      ref.set(0, 1, 0);
      if (Math.abs(t.y) > 0.9) ref.set(1, 0, 0);
      n1.crossVectors(t, ref).normalize();
      n2.crossVectors(t, n1).normalize();
      for (let k = 0; k < SIDES; k++) {
        const ang = ((k + 0.5) / SIDES) * Math.PI * 2;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const nx = n1.x * dx + n2.x * dy;
        const ny = n1.y * dx + n2.y * dy;
        const nz = n1.z * dx + n2.z * dy;
        pos.push(pts[i].x + nx * rope.radius, pts[i].y + ny * rope.radius, pts[i].z + nz * rope.radius);
        nor.push(nx, ny, nz);
        colors.push(c.r, c.g, c.b);
        bob.push(rope.bob);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < SIDES; k++) {
        const a = start + i * SIDES + k;
        const b = start + i * SIDES + ((k + 1) % SIDES);
        const d = a + SIDES;
        const e = b + SIDES;
        index.push(a, d, b, b, d, e);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aBob', new THREE.Float32BufferAttribute(bob, 1));
  geo.setIndex(index);
  return geo;
}

/** 热气球：球囊 + 吊篮。aPart：0 球囊，1 吊篮。 */
export function hotAirBalloonGeometry() {
  const pts: THREE.Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    // 上圆下尖的倒水滴
    const r = Math.sin(a) * (1 + 0.28 * Math.cos(a)) + (i === 0 ? 0.16 : 0);
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), -Math.cos(a) * 1.18 + 0.1));
  }
  const envelope = new THREE.LatheGeometry(pts, 20);
  const basket = new THREE.BoxGeometry(0.34, 0.26, 0.34);
  basket.translate(0, -1.62, 0);

  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const index: number[] = [];
  for (const [geo, p] of [
    [envelope, 0],
    [basket, 1],
  ] as const) {
    const base = pos.length / 3;
    const gp = geo.getAttribute('position');
    const gn = geo.getAttribute('normal');
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      nor.push(gn.getX(i), gn.getY(i), gn.getZ(i));
      part.push(p);
    }
    const gi = geo.getIndex()!;
    for (let i = 0; i < gi.count; i++) index.push(base + gi.getX(i));
  }
  envelope.dispose();
  basket.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geo.setIndex(index);
  return geo;
}
