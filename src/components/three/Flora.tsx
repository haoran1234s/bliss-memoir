/**
 * 树、灌木与远山
 * ------------------------------------------------------------
 * 都是「圆球拼出来的」：一棵树 = 一根树干 + 五团树冠，一丛灌木 = 两三团小球，
 * 远山 = 压扁的大球。位置与颜色来自 world.ts，这里只负责把它们实例化画出来。
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';
import { sphereGeometry, trunkGeometry } from '../../three/geometry';
import { disposeTree, instanced } from '../../three/instancing';
import { blobMaterial, solidMaterial } from '../../three/materials';
import type { BlobInfo, TreeInfo, World } from '../../three/world';

const IDENTITY = new THREE.Quaternion();
const scale = new THREE.Vector3();
const TRUNKS = ['#c9a07e', '#bf9573', '#d2ac8a'];

const seedAttribute = {
  aSeed: {
    size: 1,
    write: (b: BlobInfo, out: Float32Array, o: number) => {
      out[o] = b.seed;
    },
  },
};

function buildFlora(world: World) {
  const root = new THREE.Group();

  // 树冠 + 灌木
  root.add(
    instanced<BlobInfo>({
      items: world.blobs,
      geometry: sphereGeometry(2),
      material: blobMaterial('foliage'),
      pad: 0.5,
      position: (b) => b.pos,
      matrix: (b, m) => m.compose(b.pos, IDENTITY, b.scale),
      color: (b) => b.color,
      attributes: seedAttribute,
    }),
  );

  // 树干
  root.add(
    instanced<TreeInfo>({
      items: world.trees,
      geometry: trunkGeometry(),
      material: solidMaterial(),
      position: (t) => t.pos,
      matrix: (t, m) => {
        const r = 0.1 + t.crown * 0.075;
        return m.compose(t.pos, IDENTITY, scale.set(r, t.trunk + t.crown * 0.55, r));
      },
      color: (t) => TRUNKS[Math.floor(t.seed * TRUNKS.length) % TRUNKS.length],
    }),
  );

  // 远山
  root.add(
    instanced<BlobInfo>({
      items: world.hills,
      geometry: sphereGeometry(3),
      material: blobMaterial('hill'),
      chunked: false,
      position: (b) => b.pos,
      matrix: (b, m) => m.compose(b.pos, IDENTITY, b.scale),
      color: (b) => b.color,
      attributes: seedAttribute,
    }),
  );

  return root;
}

export function Flora() {
  const world = useStore((s) => s.world);
  const root = useMemo(() => buildFlora(world), [world]);
  useEffect(() => () => disposeTree(root), [root]);
  return <primitive object={root} />;
}
