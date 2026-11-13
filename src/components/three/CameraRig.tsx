/**
 * 镜头控制器
 * ------------------------------------------------------------
 * 每帧做四件事：
 *   1. 让实际进度（cam.value）平滑地追上目标进度（cam.target）；
 *   2. 从轨道上取出这个进度对应的机位，叠加鼠标 / 陀螺仪带来的微视差、
 *      走动时的轻微侧倾，以及影院模式的近景机位；
 *   3. 把「现在离哪一站最近」写回 store，供导航栏高亮；
 *   4. 自动漫游：每站停留几秒，自己往前走。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';
import { cam, clamp, smoothDamp } from '../../three/cameraInput';
import { buildRail } from '../../three/rail';

const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const right = new THREE.Vector3();
const fwd = new THREE.Vector3();
const prev = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** 每一站自动漫游时停留多久（秒） */
const DWELL = { entrance: 2.2, board: 3.8, rack: 5.6, cinema: 0 } as const;

export function CameraRig() {
  const world = useStore((s) => s.world);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = size.width / Math.max(1, size.height);
  const rail = useMemo(() => buildRail(world, aspect, size.height), [world, aspect, size.height]);

  const s = useRef({
    cinema: 0,
    intro: 1,
    pointerX: 0,
    pointerY: 0,
    roll: 0,
    fov: 0,
    dwell: 0,
    time: 0,
    primed: false,
  });

  useEffect(() => {
    camera.near = 0.1;
    camera.far = 1700;
    camera.fov = rail.fov;
    camera.updateProjectionMatrix();
    s.current.fov = rail.fov;
    s.current.primed = false;
  }, [camera, rail]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const store = useStore.getState();
    const st = s.current;
    const max = rail.count - 1;
    st.time += dt;

    /* —— 1. 进度 —— */
    const target = clamp(cam.target, -0.18, max + 0.18);
    cam.value = smoothDamp(cam.value, target, cam.dragging ? 0.075 : 0.4, dt);
    const progress = clamp(cam.value, 0, max);
    rail.pose(progress, pos, look);

    /* —— 2. 机位修饰 —— */
    // 开场（加载 / 迎宾）：站得稍远一点，缓缓左右踱步；进入后推近
    const wantIntro = store.phase === 'gallery' ? 0 : 1;
    st.intro += (wantIntro - st.intro) * (1 - Math.exp(-dt * 1.6));
    if (st.intro > 0.001) {
      fwd.subVectors(look, pos).setY(0).normalize();
      right.crossVectors(fwd, UP);
      pos.addScaledVector(fwd, -1.1 * st.intro);
      pos.addScaledVector(right, Math.sin(st.time * 0.22) * 0.32 * st.intro);
      pos.y += 0.12 * st.intro;
    }

    // 影院模式：推到银幕前的近景机位
    const wantCinema = store.cinema.open ? 1 : 0;
    st.cinema += (wantCinema - st.cinema) * (1 - Math.exp(-dt * 2.4));
    if (st.cinema > 0.001) {
      const k = st.cinema * st.cinema * (3 - 2 * st.cinema);
      pos.lerp(rail.cinema.pos, k);
      look.lerp(rail.cinema.look, k);
    }

    // 微视差：鼠标 / 陀螺仪让镜头轻轻偏一点，画面有纵深感
    const ease = 1 - Math.exp(-dt * 4);
    st.pointerX += (cam.pointerX - st.pointerX) * ease;
    st.pointerY += (cam.pointerY - st.pointerY) * ease;
    fwd.subVectors(look, pos).normalize();
    right.crossVectors(fwd, UP).normalize();
    const calm = 1 - st.cinema * 0.7;
    pos.addScaledVector(right, st.pointerX * 0.16 * calm);
    pos.y += st.pointerY * 0.07 * calm + Math.sin(st.time * 0.7) * 0.008;
    look.addScaledVector(right, st.pointerX * -0.1 * calm);

    // 侧倾：横向滑动时身体跟着歪一点点
    if (!st.primed) {
      prev.copy(pos);
      st.primed = true;
    }
    const lateral = fwd.set(pos.x - prev.x, 0, pos.z - prev.z).dot(right) / Math.max(dt, 1e-3);
    prev.copy(pos);
    st.roll += (clamp(-lateral * 0.011, -0.035, 0.035) - st.roll) * (1 - Math.exp(-dt * 5));

    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    if (cam.gyroYaw || cam.gyroPitch) {
      camera.rotateY(cam.gyroYaw);
      camera.rotateX(cam.gyroPitch);
    }
    camera.rotateZ(st.roll);

    // 走得快时视角略微张开，停下来收回
    const wantFov = rail.fov + Math.min(3.5, Math.abs(cam.velocity) * 1.5);
    st.fov += (wantFov - st.fov) * (1 - Math.exp(-dt * 4));
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov;
      camera.updateProjectionMatrix();
    }

    /* —— 3. 当前站 —— */
    store.setStop(clamp(Math.round(cam.value), 0, max));

    /* —— 4. 自动漫游 —— */
    if (store.touring && store.phase === 'gallery' && store.detail === null && !store.gridOpen && !store.cinema.open) {
      const here = clamp(Math.round(cam.target), 0, max);
      if (Math.abs(cam.value - cam.target) < 0.03 && !cam.dragging) {
        st.dwell += dt;
        if (here >= max) store.stopTour();
        else if (st.dwell > DWELL[world.stops[here].kind]) {
          st.dwell = 0;
          store.step(1);
        }
      }
    } else {
      st.dwell = 0;
    }
    // 优先级 -1：先于其它组件的逐帧逻辑执行（草地、花瓣、图集加载都要读镜头位置）
  }, -1);

  return null;
}
