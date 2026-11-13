/**
 * 平面版花园（没有 3D 时的退路）
 * ------------------------------------------------------------
 * 少数旧手机 / 内置浏览器跑不了 WebGL2，或者 3D 场景意外出错时，花园换成这一页：
 * 晴空、云朵、草坡、一束气球和新人的名字，下面两个大按钮——翻看相册、去露天影院。
 * 看大图、相册、影院控制条都和 3D 版共用；影院直接在页面上播放视频。
 */
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, Heart, Images } from 'lucide-react';
import { photos, videos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { getVideoElement } from '../../media/cinema';
import { useStore } from '../../store/useStore';
import { BalloonBunch } from './BalloonBunch';

function Cloud({ className }: { className: string }) {
  return (
    <div className={`pointer-events-none absolute ${className}`}>
      <div className="absolute bottom-0 left-0 h-[55%] w-full rounded-full bg-white/85" />
      <div className="absolute bottom-[18%] left-[16%] h-[78%] w-[42%] rounded-full bg-white/85" />
      <div className="absolute bottom-[14%] left-[46%] h-[62%] w-[36%] rounded-full bg-white/85" />
    </div>
  );
}

/** 影院打开时，把视频元素挪进页面里正常显示；关掉后放回原处。 */
function FlatScreen() {
  const dark = useStore((s) => s.cinema.dark);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = getVideoElement();
    const el = box.current;
    if (!video || !el) return;
    const home = video.parentElement ?? document.body;
    el.appendChild(video);
    video.classList.add('flat-video');
    return () => {
      video.classList.remove('flat-video');
      home.appendChild(video);
    };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 px-safe pb-[150px] pt-[64px] transition-colors duration-700 short:pb-0 short:pt-0"
      style={{ background: dark ? '#0b0b22' : '#2a2650' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div ref={box} className="h-full w-full" />
    </motion.div>
  );
}

export function FlatGarden() {
  const phase = useStore((s) => s.phase);
  const cinemaOpen = useStore((s) => s.cinema.open);
  const { openGrid, openCinema } = useStore.getState();

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #7cc6f7 0%, #c9e9fd 55%, #fff6e6 100%)' }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,#fff7c2_0%,rgba(255,247,194,0)_70%)]" />
      <Cloud className="left-[6%] top-[12%] h-14 w-36" />
      <Cloud className="right-[4%] top-[24%] h-12 w-28" />
      <Cloud className="left-[30%] top-[38%] h-10 w-24 opacity-70" />

      {/* 两层草坡 */}
      <div
        className="absolute -left-[10%] bottom-0 h-[24%] w-[75%] rounded-[50%_50%_0_0/100%_100%_0_0]"
        style={{ background: 'linear-gradient(180deg, #b8ea8a, #8fd46a)' }}
      />
      <div
        className="absolute -right-[12%] bottom-0 h-[19%] w-[80%] rounded-[50%_50%_0_0/100%_100%_0_0]"
        style={{ background: 'linear-gradient(180deg, #a3e07a, #7cc95a)' }}
      />

      {phase === 'gallery' && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-safe pb-safe pt-safe short:flex-row short:gap-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        >
          <div className="flex flex-col items-center text-center">
            <BalloonBunch className="h-40 w-32 animate-float drop-shadow-[0_14px_18px_rgba(58,51,85,0.18)] short:h-28 short:w-24" />
            <div className="mt-2 flex items-center gap-2 font-fun text-[26px] text-ink">
              <span>{couple.groomName}</span>
              <Heart className="heartbeat h-5 w-5 text-coral" fill="currentColor" strokeWidth={0} />
              <span>{couple.brideName}</span>
            </div>
            <div className="mt-1 rounded-full bg-white/60 px-3 py-0.5 font-display text-[13px] font-medium tracking-[0.18em] text-ink/75">
              {couple.date}
            </div>
          </div>

          <div className="flex w-[min(80vw,300px)] flex-col gap-3">
            <button
              type="button"
              onClick={() => openGrid()}
              className="btn-candy flex h-14 items-center justify-center gap-2 font-fun text-[18px] tracking-wider"
            >
              <Images className="h-5 w-5" />
              翻看相册 · {photos.length} 张
            </button>
            {videos.length > 0 && (
              <button
                type="button"
                onClick={() => openCinema()}
                className="glass flex h-14 items-center justify-center gap-2 rounded-full font-fun text-[18px] tracking-wider text-ink transition-transform active:scale-95"
              >
                <Clapperboard className="h-5 w-5" />
                露天影院 · {videos.length} 段
              </button>
            )}
          </div>
        </motion.div>
      )}

      {cinemaOpen && <FlatScreen />}
    </div>
  );
}
