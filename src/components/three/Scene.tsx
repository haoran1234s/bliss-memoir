/**
 * 3D 花园（画布 + 场景装配）
 * ------------------------------------------------------------
 * 画面不靠后期处理：所有材质都是自己写的轻量着色器，直接输出最终颜色，
 * 抗锯齿用画布自带的 MSAA。为了在手机上跑得稳、不发烫，帧循环由这里接管：
 *   - 先在加载页背后把所有着色器一次编译好，再开始渲染：
 *     走到影院之类的新东西面前时，不会因为现编着色器突然卡一下；
 *   - 高刷屏（120Hz）上隔一帧画一次，稳定 60 帧，GPU 不白干一倍的活；
 *   - 浮层（看大图、相册）完全盖住画面后暂停渲染；切到后台时浏览器也会自动停；
 *   - 帧率不够时先降画布像素比，再减少草叶 / 花瓣数量。
 * 每帧推进一次环境时钟与昼夜（白天漫游 → 进影院变黄昏 → 关灯变星空）。
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useQuality } from '../../store/useQuality';
import { useStore } from '../../store/useStore';
import { tickEnv } from '../../three/env';
import { Air } from './Air';
import { Balloons } from './Balloons';
import { Boards } from './Boards';
import { CameraRig } from './CameraRig';
import { Cinema } from './Cinema';
import { Flora } from './Flora';
import { Gestures } from './Gestures';
import { Hardware } from './Hardware';
import { Meadow } from './Meadow';
import { PhotoCards } from './PhotoCards';
import { Sky } from './Sky';

const tier = getDeviceTier();
const DPR_MIN = Math.max(1, Math.min(tier.dprMax, tier.dprMax * 0.62));
/** 两帧之间至少隔多久（ms）：60Hz 每帧都画；120Hz 隔一帧画一次 = 60 帧；90Hz 照常 */
const MIN_FRAME_MS = 10.5;

/** 环境时钟 + 「画面已经画出来」的通知。 */
function Driver() {
  const frames = useRef(0);
  useFrame((_, delta) => {
    const s = useStore.getState();
    tickEnv(Math.min(delta, 0.05), s.cinema.open ? (s.cinema.dark ? 2 : 1) : 0);
    if (frames.current < 2 && ++frames.current === 2) s.setBoot({ scene: true });
  }, -2);
  return null;
}

/** 帧循环：着色器预编译完成后开始；限制最高帧率；被浮层盖住时暂停。 */
function Loop({ paused }: { paused: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);
  const [warm, setWarm] = useState(false);

  // 等所有组件把物体挂上场景（下一帧），再一次性编译全部着色器；最多等 8 秒
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setWarm(true);
    };
    const timer = window.setTimeout(finish, 8000);
    const raf = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera).then(finish, finish);
    });
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    if (!warm || paused) return;
    let raf = 0;
    let last = -1e9;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < MIN_FRAME_MS) return;
      last = t;
      advance(t / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [warm, paused, advance]);

  // 显存吃紧时手机会收回 WebGL 上下文，一般回到前台就会恢复；
  // 页面可见 5 秒后还没恢复，就换成平面版，别让客人对着一块空白
  useEffect(() => {
    const canvas = gl.domElement;
    let timer = 0;
    let visibleSince = document.hidden ? Infinity : performance.now();
    const onVisibility = () => {
      visibleSince = document.hidden ? Infinity : performance.now();
    };
    const check = () => {
      if (performance.now() - visibleSince > 5000) useStore.getState().goFlat();
      else timer = window.setTimeout(check, 1000);
    };
    const onLost = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 1000);
    };
    const onRestored = () => window.clearTimeout(timer);
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl]);

  // 开发时方便在控制台调试：__bliss.gl.info 看渲染统计，__bliss.store.getState() 看状态
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __bliss: unknown }).__bliss = { gl, scene, camera, store: useStore };
  }, [gl, scene, camera]);

  return null;
}

/**
 * 按实时帧率调节画质：每 1.5 秒量一次帧率，连续两次低于 45 帧就降一档像素比，
 * 降到底还卡再减少草叶和花瓣；连续流畅 7.5 秒再升回去，最多升 3 次，避免来回横跳。
 * 暂停 / 切后台回来的第一帧不计入。
 */
function Quality() {
  const m = useRef({ time: 0, frames: 0, bad: 0, good: 0, ups: 0 });
  useFrame((_, delta) => {
    const s = m.current;
    if (delta > 0.25) return;
    s.time += delta;
    s.frames++;
    if (s.time < 1.5) return;
    const fps = s.frames / s.time;
    s.time = 0;
    s.frames = 0;

    const q = useQuality.getState();
    const step = (tier.dprMax - DPR_MIN) / 4;
    if (fps < 45) {
      s.good = 0;
      if (++s.bad < 2) return;
      s.bad = 0;
      if (q.dpr > DPR_MIN + 0.01) q.setDpr(Math.max(DPR_MIN, q.dpr - step));
      else q.degrade();
    } else {
      s.bad = 0;
      if (fps < 56 || q.dpr >= tier.dprMax - 0.01 || s.ups >= 3) return;
      if (++s.good < 5) return;
      s.good = 0;
      s.ups++;
      q.setDpr(Math.min(tier.dprMax, q.dpr + step));
    }
  });
  return null;
}

/** 浮层盖住画面一小会儿之后，暂停 3D 渲染。 */
function usePaused() {
  const covered = useStore((s) => s.detail !== null || s.gridOpen);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!covered) {
      setPaused(false);
      return;
    }
    const timer = window.setTimeout(() => setPaused(true), 650);
    return () => window.clearTimeout(timer);
  }, [covered]);
  return paused;
}

export function Scene() {
  const dpr = useQuality((s) => s.dpr);
  const paused = usePaused();

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      flat
      dpr={dpr}
      frameloop="never"
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      camera={{ fov: 56, near: 0.1, far: 1700, position: [0, 1.85, 4] }}
      onCreated={({ gl }) => gl.setClearColor('#bfe3fb')}
    >
      <Loop paused={paused} />
      <Driver />
      <CameraRig />
      <Sky />
      <Meadow />
      <Flora />
      <Hardware />
      <Balloons />
      <PhotoCards />
      <Boards />
      <Cinema />
      <Air />
      <Gestures />
      <Quality />
    </Canvas>
  );
}
