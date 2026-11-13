/**
 * 背景音乐控制器（零 Three.js 依赖）
 * ------------------------------------------------------------
 * 独立管理 <audio> 播放、音量渐入渐出、首次用户交互解锁、
 * 页面切后台暂停与视频有声播放时的自动让路。
 */
import { create } from 'zustand';
import { music } from '../data/library';
import { useAlbumStore } from '../store/useAlbumStore';

interface BgmStatusState {
  musicFailed: boolean;
  unlocked: boolean;
}

export const useBgmStatus = create<BgmStatusState>(() => ({
  musicFailed: false,
  unlocked: false,
}));

const BGM_MAX_VOLUME = 0.5;

let audioEl: HTMLAudioElement | null = null;
let targetVolume = 0;
let fadeRaf = 0;

function cancelFade() {
  if (fadeRaf) {
    cancelAnimationFrame(fadeRaf);
    fadeRaf = 0;
  }
}

function fadeTo(target: number) {
  targetVolume = target;
  if (fadeRaf || !audioEl) return;

  const step = () => {
    if (!audioEl) {
      fadeRaf = 0;
      return;
    }
    const diff = targetVolume - audioEl.volume;
    if (Math.abs(diff) < 0.015) {
      audioEl.volume = Math.max(0, Math.min(1, targetVolume));
      if (audioEl.volume === 0 && !audioEl.paused) {
        audioEl.pause();
      }
      fadeRaf = 0;
      return;
    }
    audioEl.volume = Math.max(0, Math.min(1, audioEl.volume + diff * 0.1));
    fadeRaf = requestAnimationFrame(step);
  };

  fadeRaf = requestAnimationFrame(step);
}

function syncBgmPlayback() {
  if (!audioEl) return;
  const { bgmEnabled, videoPlaying } = useAlbumStore.getState();
  const { unlocked, musicFailed } = useBgmStatus.getState();
  const wantPlay = unlocked && !musicFailed && bgmEnabled && !videoPlaying && !document.hidden;

  if (wantPlay) {
    if (audioEl.paused) {
      audioEl.play().catch(() => void 0);
    }
    fadeTo(BGM_MAX_VOLUME);
  } else {
    fadeTo(0);
  }
}

/**
 * 在用户点击手势回调中主动解锁并同步播放背景音乐。
 */
export function unlockBgmNow() {
  if (!useBgmStatus.getState().unlocked) {
    useBgmStatus.setState({ unlocked: true });
  }
  syncBgmPlayback();
}

/**
 * 初始化背景音乐播放器，返回完整的资源释放与事件清理函数。
 */
export function initBgm(): () => void {
  if (typeof document === 'undefined') return () => void 0;

  const audio = document.createElement('audio');
  audio.className = 'media-hidden';
  audio.loop = true;
  audio.preload = 'metadata';
  audio.volume = 0;
  audio.src = music.url;

  const onError = () => {
    useBgmStatus.setState({ musicFailed: true });
  };
  audio.addEventListener('error', onError);
  document.body.appendChild(audio);
  audioEl = audio;
  useBgmStatus.setState({ musicFailed: false });

  const onFirstGesture = () => {
    unlockBgmNow();
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
  };
  window.addEventListener('pointerdown', onFirstGesture, { passive: true });
  window.addEventListener('keydown', onFirstGesture);

  const onVisibilityChange = () => {
    if (document.hidden) {
      cancelFade();
      if (audioEl && !audioEl.paused) audioEl.pause();
    } else {
      syncBgmPlayback();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  let prevBgm = useAlbumStore.getState().bgmEnabled;
  let prevVideo = useAlbumStore.getState().videoPlaying;
  const unsubStore = useAlbumStore.subscribe((state) => {
    if (state.bgmEnabled !== prevBgm || state.videoPlaying !== prevVideo) {
      prevBgm = state.bgmEnabled;
      prevVideo = state.videoPlaying;
      syncBgmPlayback();
    }
  });

  return () => {
    cancelFade();
    unsubStore();
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    audio.removeEventListener('error', onError);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio.remove();
    if (audioEl === audio) audioEl = null;
  };
}
