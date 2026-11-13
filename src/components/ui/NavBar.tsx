/**
 * 底部导航
 * ------------------------------------------------------------
 * 上面一行小字说明「现在走到哪了」：第几章、这一架是第几到第几张；
 * 下面一排胶囊按钮可以直接跳到任意章节（远的地方会有云朵转场）。
 * 桌面端两侧多一对前进 / 后退按钮，手机上直接滑动即可。
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Clapperboard, Flower2 } from 'lucide-react';
import { chapters } from '../../data/library';
import { couple } from '../../data/memoirData';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useStore } from '../../store/useStore';
import { DEFAULT_ACCENT, PALETTES } from '../../theme/palettes';

const tier = getDeviceTier();

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
export const ordinal = (i: number) => (i < CN.length ? `第${CN[i]}章` : `第 ${i + 1} 章`);

interface Caption {
  title: string;
  sub: string;
  /** 在本章里的进度 0~1；不属于任何章节时为 null */
  progress: number | null;
}

function useCaption(): Caption {
  const world = useStore((s) => s.world);
  const stop = useStore((s) => s.stop);
  const info = world.stops[stop] ?? world.stops[0];

  if (info.kind === 'entrance') {
    return {
      title: couple.welcomeTitle,
      sub: tier.isTouch ? '向左滑，沿着小路出发' : '滚动滚轮或按 → 键，沿着小路出发',
      progress: null,
    };
  }
  if (info.kind === 'cinema') {
    return { title: '露天影院', sub: couple.farewell, progress: null };
  }

  const chapter = chapters[info.chapter];
  const from = world.chapterStop[info.chapter];
  const to = world.chapterStop[info.chapter + 1] ?? world.stops.length - 1;
  const progress = (stop - from + 1) / Math.max(1, to - from);
  if (info.kind === 'board') {
    return {
      title: `${ordinal(info.chapter)} · ${chapter.title}`,
      sub: chapter.subtitle || `${chapter.count} 张照片`,
      progress,
    };
  }
  const a = info.first - chapter.start + 1;
  const b = info.last - chapter.start + 1;
  return {
    title: chapter.title,
    sub: `${a === b ? `第 ${a} 张` : `第 ${a}–${b} 张`} · 共 ${chapter.count} 张`,
    progress,
  };
}

export function NavBar() {
  const world = useStore((s) => s.world);
  const stop = useStore((s) => s.stop);
  const active = world.stops[stop]?.chapter ?? -1;
  const caption = useCaption();
  const { goToChapter, step, stopTour, markHintsSeen, openCinema } = useStore.getState();
  const max = world.stops.length - 1;
  const atCinema = world.stops[stop]?.kind === 'cinema';

  const row = useRef<HTMLDivElement>(null);
  const chips = useRef(new Map<number, HTMLButtonElement>());

  // 当前章节的按钮自动滚到中间
  useEffect(() => {
    const box = row.current;
    const chip = chips.current.get(active);
    if (!box || !chip) return;
    box.scrollTo({ left: chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  const go = (chapter: number) => {
    markHintsSeen();
    goToChapter(chapter);
  };
  const nudge = (delta: number) => {
    markHintsSeen();
    stopTour();
    step(delta);
  };

  const items: Array<{ key: number; label: string; color: string; icon?: 'home' | 'cinema' }> = [
    { key: -1, label: '入口', color: DEFAULT_ACCENT.accent, icon: 'home' },
    ...chapters.map((ch) => ({ key: ch.index, label: ch.title, color: (PALETTES[ch.palette] ?? PALETTES.blush).accent })),
    { key: chapters.length, label: '影院', color: '#7c6cf0', icon: 'cinema' },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-safe pb-safe">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2.5 px-3 pb-3 short:gap-1.5 short:pb-2">
        {/* 走到哪了（横屏手机上省掉，高度留给画面；当前章节看下面高亮的胶囊就知道） */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${stop}-${caption.title}`}
            className="glass max-w-full rounded-[22px] px-4 py-2 text-center short:hidden"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="truncate font-fun text-[16px] leading-snug text-ink">{caption.title}</div>
            <div className="truncate text-[12px] leading-snug text-ink-soft">{caption.sub}</div>
            {caption.progress !== null && (
              <div className="mx-auto mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.round(caption.progress * 100)}%`, background: 'var(--accent)' }}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {atCinema && (
          <motion.button
            type="button"
            onClick={() => openCinema()}
            className="btn-candy pointer-events-auto flex h-12 items-center gap-2 px-7 font-fun text-[17px] tracking-wider short:h-10 short:text-[15px]"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.25 }}
          >
            <Clapperboard className="h-5 w-5" />
            坐下来看电影
          </motion.button>
        )}

        <div className="flex w-full items-center justify-center gap-2">
          {!tier.isTouch && (
            <button
              type="button"
              aria-label="上一站"
              title="上一站（←）"
              disabled={stop <= 0}
              onClick={() => nudge(-1)}
              className="glass pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          <div
            ref={row}
            className="glass no-scrollbar pointer-events-auto relative flex min-w-0 items-center gap-1 overflow-x-auto rounded-full p-1.5"
          >
            {items.map((item) => {
              const on = item.key === active;
              return (
                <button
                  key={item.key}
                  type="button"
                  ref={(el) => {
                    if (el) chips.current.set(item.key, el);
                    else chips.current.delete(item.key);
                  }}
                  onClick={() => go(item.key)}
                  aria-current={on ? 'true' : undefined}
                  className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-fun text-[14px] transition-colors duration-200 short:h-8 ${
                    on ? 'text-white' : 'text-ink/80'
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full"
                      style={{ background: item.color, boxShadow: `0 6px 14px -6px ${item.color}` }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {item.icon === 'home' ? (
                      <Flower2 className="h-4 w-4" />
                    ) : item.icon === 'cinema' ? (
                      <Clapperboard className="h-4 w-4" />
                    ) : (
                      !on && <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                    )}
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {!tier.isTouch && (
            <button
              type="button"
              aria-label="下一站"
              title="下一站（→）"
              disabled={stop >= max}
              onClick={() => nudge(1)}
              className="glass pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
