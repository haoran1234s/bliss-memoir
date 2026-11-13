/**
 * 加载页
 * ------------------------------------------------------------
 * 等三样东西：标题字体、3D 花园的第一帧、入口附近的照片图集。
 * 进度条跟着真实进度走，但做了两道保险：
 *   - 至少展示一小会儿（进度条不会「啪」地一下闪过去）；
 *   - 最多等 12 秒，网络再慢也先让人进去，没到的照片会在花园里继续加载。
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { BalloonBunch } from './BalloonBunch';

const MIN_MS = 1300;
const MAX_MS = 12000;

const TIPS = ['正在给气球打气…', '正在修剪草坪…', '正在把照片夹到麻绳上…', '马上就好…'];

export function LoadingScreen() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    let value = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      const s = useStore.getState();
      const b = s.boot;
      const real = (b.fonts ? 0.15 : 0) + (b.scene ? 0.3 : 0) + b.photos * 0.55;
      const target = elapsed > MAX_MS ? 1 : Math.min(real, elapsed / MIN_MS);
      value += (target - value) * 0.16;
      if (target - value < 0.004) value = target;
      setShown(value);
      if (value >= 1) {
        s.showPrelude();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const percent = Math.round(shown * 100);
  const tip = TIPS[Math.min(TIPS.length - 1, Math.floor(shown * TIPS.length))];

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #7cc6f7 0%, #c9e9fd 55%, #fff6e6 100%)' }}
      exit={{ opacity: 0, transition: { duration: 0.7, ease: 'easeInOut' } }}
    >
      {/* 远处的几朵云 */}
      <div className="pointer-events-none absolute left-[-8%] top-[14%] h-16 w-44 rounded-full bg-white/70 blur-md" />
      <div className="pointer-events-none absolute right-[-6%] top-[26%] h-14 w-40 rounded-full bg-white/60 blur-md" />
      <div className="pointer-events-none absolute left-[18%] top-[68%] h-12 w-36 rounded-full bg-white/50 blur-md" />

      <BalloonBunch className="h-44 w-36 animate-float drop-shadow-[0_14px_18px_rgba(58,51,85,0.18)] short:h-28 short:w-24" />

      <h1 className="title-pop mt-2 font-fun text-[40px] leading-none tracking-wider short:text-[34px]">幸福回忆录</h1>
      <p className="mt-2 font-display text-[13px] font-medium uppercase tracking-[0.42em] text-white/90">
        Bliss Memoir
      </p>

      <div className="mt-9 w-[min(68vw,280px)] short:mt-5">
        <div className="h-4 overflow-hidden rounded-full border-2 border-white bg-white/50 shadow-soft">
          <div
            className="candy-stripes h-full rounded-full"
            style={{
              width: `${Math.max(6, percent)}%`,
              backgroundColor: '#ff7e8a',
            }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-[13px] text-ink/70">
          <span>{tip}</span>
          <span className="font-display font-semibold tabular-nums">{percent}%</span>
        </div>
      </div>
    </motion.div>
  );
}
