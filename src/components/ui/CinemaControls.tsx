/**
 * 露天影院控制条
 * ------------------------------------------------------------
 * 进入影院后镜头推到银幕前，天色变成黄昏、灯串亮起。这一层只放控制：
 *   - 左上角「回到花园」；
 *   - 底部：片名、播放 / 暂停、进度条、声音、关灯（变成星空夜晚）、全屏、选片；
 *   - 播放中 3 秒没有操作，控制条自动隐去，碰一下屏幕就回来。
 * 键盘：空格播放 / 暂停，← → 快退 / 快进 5 秒，Esc 离开（在 App.tsx 里统一处理）。
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize, Moon, Pause, Play, Sun, Volume2, VolumeX, VideoOff } from 'lucide-react';
import { videos } from '../../data/library';
import { cinemaFullscreen, cinemaSeekRatio, cinemaTogglePlay, useCinema } from '../../media/cinema';
import { useStore } from '../../store/useStore';

const IDLE_MS = 3000;

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CinemaControls() {
  const videoId = useStore((s) => s.cinema.videoId);
  const dark = useStore((s) => s.cinema.dark);
  const sound = useStore((s) => s.cinemaSound);
  const { closeCinema, setVideo, toggleCinemaDark, toggleCinemaSound } = useStore.getState();

  const isPlaying = useCinema((s) => s.isPlaying);
  const current = useCinema((s) => s.current);
  const duration = useCinema((s) => s.duration);
  const failed = useCinema((s) => s.failed);

  const index = Math.max(0, videos.findIndex((v) => v.id === videoId));
  const video = videos[index];
  const ratio = duration > 0 ? Math.min(1, current / duration) : 0;

  /* —— 自动隐藏 —— */
  const [awake, setAwake] = useState(true);
  const scrubbing = useRef(false);
  useEffect(() => {
    let timer = 0;
    const poke = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!scrubbing.current) setAwake(false);
      }, IDLE_MS);
    };
    poke();
    window.addEventListener('pointerdown', poke);
    window.addEventListener('pointermove', poke);
    window.addEventListener('keydown', poke);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', poke);
      window.removeEventListener('pointermove', poke);
      window.removeEventListener('keydown', poke);
    };
  }, []);
  const shown = awake || !isPlaying || failed;

  const panel = dark ? 'glass-night' : 'glass';
  const sub = dark ? 'text-white/65' : 'text-ink-soft';
  const chip = dark ? 'bg-white/10 text-white/80' : 'bg-ink/[0.05] text-ink/80';

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between px-safe"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* 左上：回到花园 */}
      <motion.div
        className="pt-safe"
        animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : -8 }}
        transition={{ duration: 0.3 }}
      >
        <button
          type="button"
          onClick={closeCinema}
          title="回到花园（Esc）"
          className={`${panel} ml-3 mt-3 flex h-11 items-center gap-1 rounded-full pl-2.5 pr-4 font-fun text-[15px] transition-transform active:scale-95 ${
            shown ? 'pointer-events-auto' : ''
          }`}
        >
          <ChevronLeft className="h-5 w-5" />
          回到花园
        </button>
      </motion.div>

      {/* 底部控制条 */}
      <motion.div
        className="pb-safe"
        animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 16 }}
        transition={{ duration: 0.3 }}
      >
        <div
          className={`${panel} mx-auto mb-3 w-[min(94vw,560px)] rounded-[26px] px-4 pb-3.5 pt-3 transition-colors duration-500 short:mb-2 short:w-[min(76vw,600px)] short:pb-2.5 short:pt-2 ${
            shown ? 'pointer-events-auto' : ''
          }`}
        >
          {/* 片名 */}
          <div className="flex items-start justify-between gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={video?.id ?? 'none'}
                className="min-w-0"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <div className="truncate font-fun text-[18px] leading-snug">{video?.title ?? '露天影院'}</div>
                <div className={`truncate text-[12px] short:hidden ${sub}`}>{video?.subtitle ?? '还没有放映的影片'}</div>
              </motion.div>
            </AnimatePresence>
            {videos.length > 1 && (
              <button
                type="button"
                onClick={() => setVideo(videos[(index + 1) % videos.length].id)}
                title="下一段"
                className={`-mr-1 flex shrink-0 items-center rounded-full py-1 pl-2 pr-1 font-display text-[12px] font-medium tabular-nums transition-transform active:scale-95 ${sub}`}
              >
                {index + 1} / {videos.length}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 播放 + 进度 */}
          {failed || !video ? (
            <div className={`mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] ${chip}`}>
              <VideoOff className="h-4 w-4 shrink-0" />
              {video ? '这段视频暂时没能加载出来，换一段试试吧' : '在 memoirData.ts 里登记视频后，这里就能放映啦'}
            </div>
          ) : (
            <div className="mt-2.5 flex items-center gap-3 short:mt-1.5">
              <button
                type="button"
                onClick={cinemaTogglePlay}
                aria-label={isPlaying ? '暂停' : '播放'}
                title={isPlaying ? '暂停（空格）' : '播放（空格）'}
                className="btn-candy grid h-12 w-12 shrink-0 place-items-center"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play className="ml-0.5 h-5 w-5" fill="currentColor" strokeWidth={0} />
                )}
              </button>
              <span className={`w-10 text-right font-display text-[12px] tabular-nums ${sub}`}>{fmt(current)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={ratio}
                aria-label="播放进度"
                onPointerDown={() => (scrubbing.current = true)}
                onPointerUp={() => (scrubbing.current = false)}
                onPointerCancel={() => (scrubbing.current = false)}
                onChange={(e) => cinemaSeekRatio(parseFloat(e.target.value))}
                className="scrubber min-w-0 flex-1"
                style={
                  {
                    '--fill': `${ratio * 100}%`,
                    '--scrub-track': dark ? 'rgba(255,255,255,0.22)' : 'rgba(58,51,85,0.14)',
                  } as CSSProperties
                }
              />
              <span className={`w-10 font-display text-[12px] tabular-nums ${sub}`}>{fmt(duration)}</span>
            </div>
          )}

          {/* 声音 / 关灯 / 全屏 */}
          <div className="mt-3 flex items-center gap-2 short:mt-2">
            <button
              type="button"
              onClick={toggleCinemaSound}
              aria-pressed={sound}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors active:scale-95 ${chip}`}
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {sound ? '有声' : '静音'}
            </button>
            <button
              type="button"
              onClick={toggleCinemaDark}
              aria-pressed={dark}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors active:scale-95 ${chip}`}
              style={dark ? { background: '#ffd76a', color: '#3a3355' } : undefined}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {dark ? '开灯' : '关灯观影'}
            </button>
            <button
              type="button"
              onClick={cinemaFullscreen}
              disabled={failed || !video}
              className={`ml-auto flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors active:scale-95 disabled:opacity-40 ${chip}`}
            >
              <Maximize className="h-4 w-4" />
              全屏
            </button>
          </div>

          {/* 选片（横屏手机上收起，用右上角的「1 / 4 ›」换片） */}
          {videos.length > 1 && (
            <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 short:hidden">
              {videos.map((v, i) => {
                const on = v.id === videoId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVideo(v.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-2xl p-1 pr-3 text-left transition-all active:scale-95 ${
                      on ? '' : chip
                    }`}
                    style={on ? { background: 'var(--accent)', color: '#fff' } : undefined}
                  >
                    <span
                      className="relative block h-9 w-16 shrink-0 overflow-hidden rounded-xl"
                      style={{ background: 'linear-gradient(135deg, #ffd1dc, #ffe9c9 50%, #bfe6ff)' }}
                    >
                      <img
                        src={v.posterUrl}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="h-full w-full object-cover"
                        onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                      />
                    </span>
                    <span className="max-w-[9em] truncate text-[13px]">
                      <span className="mr-1 font-display tabular-nums opacity-70">{String(i + 1).padStart(2, '0')}</span>
                      {v.title}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
