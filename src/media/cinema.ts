/**
 * 媒体中枢（模块级单例）
 * ------------------------------------------------------------
 * 统一拥有：
 *   - 露天银幕的 <video>（内联、静音自动预览、循环）→ 生成 VideoTexture 供 3D 使用
 *   - 背景音乐 <audio>（进入花园后渐入；影院有声时自动让路）
 *
 * 用「模块单例 + 小型 zustand store」承载：
 *   - 非响应对象（video / audio / texture）放模块作用域
 *   - 响应式状态（播放中 / 时长 / 进度 / 是否失败）放 useCinema，供界面订阅
 *
 * 全程订阅主 store：当片源、有声模式、阶段、音乐开关变化时，
 * 命令式地驱动真实媒体元素，保证只有一份状态来源。
 */
import * as THREE from 'three';
import { create } from 'zustand';
import { music, videos } from '../data/library';
import { useStore } from '../store/useStore';

/* ------------------------------------------------------------------ */
/*  响应式媒体状态                                                      */
/* ------------------------------------------------------------------ */
interface CinemaMediaState {
  /** 视频首帧是否可渲染（决定是否撤下封面） */
  ready: boolean;
  isPlaying: boolean;
  current: number;
  duration: number;
  /** 视频加载失败 → 一直显示封面 */
  failed: boolean;
  /** 背景音乐加载失败 */
  musicFailed: boolean;
}

export const useCinema = create<CinemaMediaState>(() => ({
  ready: false,
  isPlaying: false,
  current: 0,
  duration: 0,
  failed: false,
  musicFailed: false,
}));

/* ------------------------------------------------------------------ */
/*  模块单例对象                                                        */
/* ------------------------------------------------------------------ */
let videoEl: HTMLVideoElement | null = null;
let audioEl: HTMLAudioElement | null = null;
let videoTexture: THREE.VideoTexture | null = null;
let inited = false;

const BGM_FULL = 0.55;
let bgmTarget = 0;
let bgmRaf = 0;

const findVideo = (id: string) => videos.find((v) => v.id === id) ?? videos[0];

/** 背景音乐音量平滑过渡到目标值。 */
function fadeBgmTo(target: number) {
  bgmTarget = target;
  if (bgmRaf) return;
  const step = () => {
    if (!audioEl) {
      bgmRaf = 0;
      return;
    }
    const diff = bgmTarget - audioEl.volume;
    if (Math.abs(diff) < 0.012) {
      audioEl.volume = Math.max(0, Math.min(1, bgmTarget));
      if (audioEl.volume === 0) audioEl.pause();
      bgmRaf = 0;
      return;
    }
    audioEl.volume = Math.max(0, Math.min(1, audioEl.volume + diff * 0.08));
    bgmRaf = requestAnimationFrame(step);
  };
  bgmRaf = requestAnimationFrame(step);
}

/** 依据主 store 当前状态，计算并应用背景音乐目标音量。 */
function syncBgm() {
  const s = useStore.getState();
  const wantOn = s.phase === 'gallery' && s.audioEnabled && !s.cinemaSound;
  const target = wantOn ? BGM_FULL : 0;
  if (target > 0 && audioEl && audioEl.paused) {
    audioEl.play().catch(() => void 0);
  }
  fadeBgmTo(target);
}

/** 镜头是否在影院附近。离得远时暂停预览，省电也省流量。 */
let near = false;
const wantPlay = () => near || useStore.getState().cinema.open;

/** 切换银幕片源。 */
function selectVideo(id: string) {
  if (!videoEl) return;
  const v = findVideo(id);
  if (!v || videoEl.dataset.vid === v.id) return;
  videoEl.dataset.vid = v.id;
  useCinema.setState({ ready: false, failed: false, current: 0, duration: 0 });
  videoEl.src = v.videoUrl;
  videoEl.load();
  if (wantPlay()) videoEl.play().catch(() => void 0);
}

/** 由 3D 场景每隔一小会儿调用：镜头靠近影院就开始静音预览，走远就暂停。 */
export function setCinemaNear(value: boolean) {
  if (value === near) return;
  near = value;
  if (!videoEl || useStore.getState().cinema.open) return;
  if (near) videoEl.play().catch(() => void 0);
  else videoEl.pause();
}

/* ------------------------------------------------------------------ */
/*  初始化（幂等，供 App 首次挂载调用）                                  */
/* ------------------------------------------------------------------ */
export function initCinema() {
  if (inited || typeof document === 'undefined') return;
  inited = true;

  /* —— 银幕视频元素 —— */
  const v = document.createElement('video');
  v.className = 'media-hidden';
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'metadata';
  v.crossOrigin = 'anonymous';
  // iOS Safari / 微信 X5 内核内联播放关键属性，避免被系统劫持为原生全屏
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', 'true');
  v.setAttribute('x5-playsinline', 'true');
  v.setAttribute('x5-video-player-type', 'h5');
  v.setAttribute('x5-video-player-fullscreen', 'false');
  document.body.appendChild(v);
  videoEl = v;

  videoTexture = new THREE.VideoTexture(v);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;

  v.addEventListener('loadeddata', () => useCinema.setState({ ready: true, failed: false }));
  v.addEventListener('playing', () => useCinema.setState({ ready: true, isPlaying: true, failed: false }));
  v.addEventListener('play', () => useCinema.setState({ isPlaying: true }));
  v.addEventListener('pause', () => useCinema.setState({ isPlaying: false }));
  v.addEventListener('durationchange', () =>
    useCinema.setState({ duration: Number.isFinite(v.duration) ? v.duration : 0 }),
  );
  v.addEventListener('timeupdate', () => useCinema.setState({ current: v.currentTime }));
  v.addEventListener('error', () => useCinema.setState({ failed: true, ready: false }));
  // 系统全屏播放时显示浏览器自带的控制条，退出全屏后收起
  const onFullscreen = () => {
    const d = document as Document & { webkitFullscreenElement?: Element | null };
    v.controls = (d.fullscreenElement ?? d.webkitFullscreenElement) === v;
  };
  document.addEventListener('fullscreenchange', onFullscreen);
  document.addEventListener('webkitfullscreenchange', onFullscreen);

  /* —— 背景音乐元素 —— */
  const a = document.createElement('audio');
  a.className = 'media-hidden';
  a.loop = true;
  // 进门之前不需要音乐：只取元信息，省下手机流量（点「进入」时才开始缓冲）
  a.preload = 'metadata';
  a.volume = 0;
  a.addEventListener('error', () => useCinema.setState({ musicFailed: true }));
  a.src = music.url;
  document.body.appendChild(a);
  audioEl = a;

  /* —— 初始片源：第一段视频作为静音预览 —— */
  if (videos.length) selectVideo(useStore.getState().cinema.videoId);

  /* —— 切到后台（锁屏、切 App、换标签页）时暂停，回来再按状态恢复 —— */
  let resumeVideo = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeVideo = !!videoEl && !videoEl.paused;
      videoEl?.pause();
      if (audioEl && !audioEl.paused) audioEl.pause();
    } else {
      if (resumeVideo && wantPlay()) videoEl?.play().catch(() => void 0);
      syncBgm();
    }
  });

  /* —— 订阅主 store：命令式驱动真实媒体 —— */
  let lastVid = useStore.getState().cinema.videoId;
  let lastSound = useStore.getState().cinemaSound;
  let lastPhase = useStore.getState().phase;
  let lastAudio = useStore.getState().audioEnabled;
  let lastOpen = useStore.getState().cinema.open;

  useStore.subscribe((s) => {
    if (s.cinema.videoId !== lastVid) {
      lastVid = s.cinema.videoId;
      selectVideo(lastVid);
    }
    if (s.cinema.open !== lastOpen) {
      lastOpen = s.cinema.open;
      if (videoEl) {
        if (lastOpen) videoEl.play().catch(() => void 0);
        else if (!near) videoEl.pause();
      }
    }
    if (s.cinemaSound !== lastSound) {
      lastSound = s.cinemaSound;
      if (videoEl) {
        videoEl.muted = !lastSound;
        if (lastSound) videoEl.play().catch(() => void 0);
      }
      syncBgm();
    }
    if (s.phase !== lastPhase) {
      lastPhase = s.phase;
      syncBgm();
    }
    if (s.audioEnabled !== lastAudio) {
      lastAudio = s.audioEnabled;
      syncBgm();
    }
  });
}

/* ------------------------------------------------------------------ */
/*  对外控制 API                                                       */
/* ------------------------------------------------------------------ */
export function getVideoTexture(): THREE.VideoTexture | null {
  return videoTexture;
}

/** 平面版的影院直接把这个视频元素放进页面里播放。 */
export function getVideoElement(): HTMLVideoElement | null {
  return videoEl;
}

/** 用户手势解锁媒体播放（在「开启回忆之旅」按钮里调用）。 */
export function unlockMedia() {
  // 在手势回调里「碰」一下视频，之后就可以随时由脚本播放（iOS 的自动播放策略）
  if (videoEl) {
    const p = videoEl.play();
    if (p) p.then(() => !wantPlay() && videoEl?.pause()).catch(() => void 0);
  }
  syncBgm();
}

export function cinemaTogglePlay() {
  if (!videoEl) return;
  if (videoEl.paused) videoEl.play().catch(() => void 0);
  else videoEl.pause();
}

export function cinemaSeekRatio(r: number) {
  if (videoEl && videoEl.duration) videoEl.currentTime = videoEl.duration * Math.min(1, Math.max(0, r));
}

export function cinemaSeekBy(seconds: number) {
  if (videoEl && videoEl.duration) {
    videoEl.currentTime = Math.min(videoEl.duration, Math.max(0, videoEl.currentTime + seconds));
  }
}

/** 唤起系统全屏播放（兼容 iOS webkit）。 */
export function cinemaFullscreen() {
  const v = videoEl as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
  if (!v) return;
  // 全屏观影默认有声
  if (!useStore.getState().cinemaSound) useStore.getState().toggleCinemaSound();
  v.muted = false;
  if (v.requestFullscreen) v.requestFullscreen().catch(() => void 0);
  else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
}
