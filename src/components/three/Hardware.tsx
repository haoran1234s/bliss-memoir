/**
 * 小五金：麻绳、夹子、糖果色立柱和彩旗
 * ------------------------------------------------------------
 * 这些零碎的东西让照片架「真的挂在那里」：照片夹在麻绳上，麻绳系在气球上，
 * 每章入口有两根立柱拉起一串彩旗。全部实例化，一种东西一次绘制调用。
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';
import { flagGeometry, poleGeometry, ropeGeometry, sphereGeometry } from '../../three/geometry';
import { disposeTree, instanced } from '../../three/instancing';
import { flagMaterial, glossyMaterial, ropeMaterial, solidMaterial } from '../../three/materials';
import type { ClipInfo, FlagInfo, PoleInfo, World } from '../../three/world';

const IDENTITY = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);
const scale = new THREE.Vector3();
const top = new THREE.Vector3();

let clipGeo: THREE.BufferGeometry | null = null;
let flagGeo: THREE.BufferGeometry | null = null;

function buildHardware(world: World) {
  const root = new THREE.Group();

  /* 麻绳、灯线：合并成一个网格 */
  const ropes = new THREE.Mesh(ropeGeometry(world.ropes), ropeMaterial());
  ropes.frustumCulled = false;
  ropes.matrixAutoUpdate = false;
  ropes.userData.ownGeometry = true;
  root.add(ropes);

  /* 小夹子 */
  clipGeo ??= new THREE.BoxGeometry(0.02, 0.052, 0.016);
  root.add(
    instanced<ClipInfo>({
      items: world.clips,
      geometry: clipGeo,
      material: solidMaterial({ bob: true }),
      position: (c) => c.pos,
      matrix: (c, m) => m.compose(c.pos, c.quat, ONE),
      color: (c) => c.color,
      attributes: {
        aBob: {
          size: 1,
          write: (c, out, o) => {
            out[o] = c.bob;
          },
        },
      },
    }),
  );

  /* 立柱：白色糖果条纹 + 顶上一颗亮晶晶的圆球 */
  root.add(
    instanced<PoleInfo>({
      items: world.poles,
      geometry: poleGeometry(),
      material: solidMaterial({ stripes: true }),
      position: (p) => p.pos,
      matrix: (p, m) => m.compose(p.pos, IDENTITY, scale.set(0.05, p.height, 0.05)),
      color: (p) => p.color,
    }),
  );
  root.add(
    instanced<PoleInfo>({
      items: world.poles,
      geometry: sphereGeometry(2),
      material: glossyMaterial(),
      position: (p) => p.pos,
      matrix: (p, m) => m.compose(top.copy(p.pos).setY(p.height + 0.07), IDENTITY, scale.setScalar(0.12)),
      color: (p) => p.color,
      attributes: {
        aMotion: {
          size: 3,
          write: (_p, out, o) => {
            out[o] = 0;
            out[o + 1] = -1;
            out[o + 2] = 0;
          },
        },
      },
    }),
  );

  /* 彩旗 */
  flagGeo ??= flagGeometry();
  root.add(
    instanced<FlagInfo>({
      items: world.flags,
      geometry: flagGeo,
      material: flagMaterial(),
      pad: 0.5,
      position: (f) => f.pos,
      matrix: (f, m) => m.compose(f.pos, f.quat, scale.set(0.37, 0.46, 1)),
      color: (f) => f.color,
      attributes: {
        aSeed: {
          size: 1,
          write: (f, out, o) => {
            out[o] = f.seed;
          },
        },
      },
    }),
  );

  return root;
}

export function Hardware() {
  const world = useStore((s) => s.world);
  const root = useMemo(() => buildHardware(world), [world]);
  useEffect(() => () => disposeTree(root), [root]);
  return <primitive object={root} />;
}
