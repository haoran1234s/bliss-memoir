/**
 * 气球：拱门、吊着照片架的气球束、爱心气球，以及它们的细绳
 * ------------------------------------------------------------
 * 所有气球只用两次绘制调用（水滴形一次、爱心一次），再按小路分段剔除。
 * 浮动和晃动都在顶点着色器里算，CPU 每帧什么都不用做。
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useStore } from '../../store/useStore';
import { makeMaterial } from '../../three/env';
import { balloonGeometry, heartGeometry } from '../../three/geometry';
import { disposeTree, instanced } from '../../three/instancing';
import { glossyMaterial } from '../../three/materials';
import { pathSlope, type BalloonInfo, type World } from '../../three/world';

const UP = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const scale = new THREE.Vector3();
const quat = new THREE.Quaternion();

/** 气球的朝向：结朝着系绳点；没有绳子的（拱门）随机朝外。 */
function balloonAxis(b: BalloonInfo, out: THREE.Vector3) {
  if (b.string) {
    out.subVectors(b.pos, b.anchor);
    if (out.lengthSq() < 1e-6) out.copy(UP);
    return out.normalize();
  }
  const a = b.seed * Math.PI * 2;
  const tilt = 0.25 + ((b.seed * 7.13) % 1) * 0.9;
  return out.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
}

const motionAttribute = {
  aMotion: {
    size: 3,
    write: (b: BalloonInfo, out: Float32Array, o: number) => {
      out[o] = b.seed;
      out[o + 1] = b.bob;
      out[o + 2] = b.sway;
    },
  },
};

/* 细绳：每根绳子是一条折线，两端位置写在顶点属性里，摆动在着色器里算 */
const stringMaterial = makeMaterial({
  transparent: true,
  depthWrite: false,
  vertex: /* glsl */ `
    attribute vec3 aEnd;
    attribute vec4 aMotion;
    varying vec3 vWorld;

    void main() {
      float t = aMotion.w;
      vec3 a = position;
      vec3 b = aEnd;
      if (aMotion.y >= 0.0) {
        vec3 bob = rackBob(aMotion.y);
        a += bob;
        b += bob;
      }
      b += balloonSway(aMotion.x) * aMotion.z;
      vec3 p = mix(a, b, t);
      // 绳子不是绷直的：中段向旁边鼓出一点
      float belly = sin(t * 3.14159);
      p.x += belly * 0.018 * sin(aMotion.x * 50.0);
      p.z += belly * 0.014 * cos(aMotion.x * 31.0);
      vWorld = p;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
  `,
  fragment: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec3 col = vec3(0.93, 0.9, 0.88) * (uAmbSky + uSunColor * 0.7);
      outColor(withFog(col, vWorld), 0.78);
    }
  `,
});

const STRING_SEGMENTS = 5;

function buildStrings(balloons: BalloonInfo[]) {
  const withString = balloons.filter((b) => b.string);
  const verts = withString.length * STRING_SEGMENTS * 2;
  const start = new Float32Array(verts * 3);
  const end = new Float32Array(verts * 3);
  const motion = new Float32Array(verts * 4);
  let v = 0;
  for (const b of withString) {
    balloonAxis(b, dir);
    // 绳子系在气球底部的小结上
    const knot = b.heart ? 0.86 : 1.2;
    const ex = b.pos.x - dir.x * b.radius * knot;
    const ey = b.pos.y - dir.y * b.radius * knot;
    const ez = b.pos.z - dir.z * b.radius * knot;
    for (let s = 0; s < STRING_SEGMENTS; s++) {
      for (const t of [s / STRING_SEGMENTS, (s + 1) / STRING_SEGMENTS]) {
        start[v * 3] = b.anchor.x;
        start[v * 3 + 1] = b.anchor.y;
        start[v * 3 + 2] = b.anchor.z;
        end[v * 3] = ex;
        end[v * 3 + 1] = ey;
        end[v * 3 + 2] = ez;
        motion[v * 4] = b.seed;
        motion[v * 4 + 1] = b.bob;
        motion[v * 4 + 2] = b.sway;
        motion[v * 4 + 3] = t;
        v++;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(start, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
  geo.setAttribute('aMotion', new THREE.BufferAttribute(motion, 4));
  const lines = new THREE.LineSegments(geo, stringMaterial);
  lines.frustumCulled = false;
  lines.matrixAutoUpdate = false;
  lines.userData.ownGeometry = true;
  return lines;
}

let balloonGeo: THREE.BufferGeometry | null = null;
let heartGeo: THREE.BufferGeometry | null = null;

function buildBalloons(world: World) {
  const root = new THREE.Group();
  const low = getDeviceTier().level === 'low';
  balloonGeo ??= low ? balloonGeometry(12, 8) : balloonGeometry(18, 12);
  heartGeo ??= heartGeometry();

  root.add(
    instanced<BalloonInfo>({
      items: world.balloons.filter((b) => !b.heart),
      geometry: balloonGeo,
      material: glossyMaterial(),
      pad: 0.35,
      position: (b) => b.pos,
      matrix: (b, m) => {
        quat.setFromUnitVectors(UP, balloonAxis(b, dir));
        return m.compose(b.pos, quat, scale.setScalar(b.radius));
      },
      color: (b) => b.color,
      attributes: motionAttribute,
    }),
  );

  root.add(
    instanced<BalloonInfo>({
      items: world.balloons.filter((b) => b.heart),
      geometry: heartGeo,
      material: glossyMaterial(),
      pad: 0.35,
      position: (b) => b.pos,
      matrix: (b, m) => {
        // 爱心正面朝着走来的方向（与照片架同向），再带一点随机的歪头
        const slope = pathSlope(-b.pos.z);
        quat.setFromAxisAngle(UP, Math.atan2(-slope, 1) + (b.seed - 0.5) * 0.5);
        return m.compose(b.pos, quat, scale.setScalar(b.radius));
      },
      color: (b) => b.color,
      attributes: motionAttribute,
    }),
  );

  root.add(buildStrings(world.balloons));
  return root;
}

export function Balloons() {
  const world = useStore((s) => s.world);
  const root = useMemo(() => buildBalloons(world), [world]);
  useEffect(() => () => disposeTree(root), [root]);
  return <primitive object={root} />;
}
