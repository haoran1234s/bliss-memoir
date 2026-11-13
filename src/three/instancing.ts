/**
 * 实例化渲染小工具
 * ------------------------------------------------------------
 * 花园里成百上千个重复的小东西（气球、夹子、树冠、彩旗……）都用实例化渲染：
 * 同一种形状一次绘制调用。再沿小路把它们切成一段一段，
 * 每段单独做视锥剔除 —— 镜头看不到的那几段完全不占显卡。
 */
import * as THREE from 'three';

/** 沿小路每隔这么多米切一段 */
export const CHUNK = 44;

export interface InstanceSpec<T> {
  items: T[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** 用来决定分到哪一段 */
  position: (item: T) => THREE.Vector3;
  /** 写入这个实例的变换矩阵 */
  matrix: (item: T, out: THREE.Matrix4) => void;
  color?: (item: T) => THREE.ColorRepresentation;
  /** 额外的逐实例属性 */
  attributes?: Record<string, { size: number; write: (item: T, out: Float32Array, offset: number) => void }>;
  /** 顶点动画会让物体超出原包围球多少米 */
  pad?: number;
  /** false = 不分段、不剔除（数量很少或会四处移动的东西） */
  chunked?: boolean;
  renderOrder?: number;
}

/** 共享顶点数据的浅拷贝：每一段有自己的实例属性，但顶点缓冲只有一份。 */
export function shareGeometry(base: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry();
  g.setIndex(base.getIndex());
  for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
  return g;
}

const matrix = new THREE.Matrix4();
const color = new THREE.Color();

export function instanced<T>(spec: InstanceSpec<T>): THREE.Group {
  const group = new THREE.Group();
  const chunks = new Map<number, T[]>();
  for (const item of spec.items) {
    const key = spec.chunked === false ? 0 : Math.floor(-spec.position(item).z / CHUNK);
    let list = chunks.get(key);
    if (!list) chunks.set(key, (list = []));
    list.push(item);
  }

  for (const list of chunks.values()) {
    const geometry = shareGeometry(spec.geometry);
    if (spec.attributes) {
      for (const [name, def] of Object.entries(spec.attributes)) {
        const data = new Float32Array(list.length * def.size);
        list.forEach((item, i) => def.write(item, data, i * def.size));
        geometry.setAttribute(name, new THREE.InstancedBufferAttribute(data, def.size));
      }
    }
    const mesh = new THREE.InstancedMesh(geometry, spec.material, list.length);
    list.forEach((item, i) => {
      spec.matrix(item, matrix);
      mesh.setMatrixAt(i, matrix);
      if (spec.color) mesh.setColorAt(i, color.set(spec.color(item)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    if (spec.renderOrder !== undefined) mesh.renderOrder = spec.renderOrder;
    if (spec.chunked === false) {
      mesh.frustumCulled = false;
    } else {
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += spec.pad ?? 0.3;
    }
    mesh.userData.ownGeometry = true;
    group.add(mesh);
  }
  return group;
}

/** 释放一棵对象树占用的显存（材质是全局共享的，不在这里释放）。 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh & { dispose?: () => void };
    if (mesh.userData.ownGeometry && mesh.geometry) mesh.geometry.dispose();
    if ((obj as THREE.InstancedMesh).isInstancedMesh) (obj as THREE.InstancedMesh).dispose();
    const material = mesh.userData.ownMaterial as THREE.Material | undefined;
    if (material) material.dispose();
  });
}

/** 颜色字符串 → 线性空间 RGB，写进数组。 */
export function writeColor(hex: THREE.ColorRepresentation, out: Float32Array | number[], offset: number) {
  color.set(hex);
  out[offset] = color.r;
  out[offset + 1] = color.g;
  out[offset + 2] = color.b;
}
