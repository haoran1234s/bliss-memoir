/**
 * 迎宾页
 * ------------------------------------------------------------
 * 背后就是实时渲染的花园入口（气球拱门 + 写着新人名字的木牌），
 * 这一层只放标题、一段欢迎的话和「进入」按钮。
 * 点按钮的这一下同时是浏览器要求的「用户手势」：音乐和视频从这里解锁。
 */
import { motion } from 'framer-motion';
import { Heart, Volume2 } from 'lucide-react';
import { couple } from '../../data/memoirData';
import { unlockMedia } from '../../media/cinema';
import { useStore } from '../../store/useStore';

const rise = {
  hidden: { opacity: 0, y: 26, scale: 0.96 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: 0.25 + i * 0.12, type: 'spring' as const, stiffness: 240, damping: 20 },
  }),
};

export function Prelude() {
  const enter = () => {
    unlockMedia();
    useStore.getState().enterGallery();
  };

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-between px-safe short:justify-end"
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
    >
      {/* 上：标题（横屏手机上省掉，花园入口的木牌上已经写着） */}
      <div className="pt-safe text-center short:hidden">
        <motion.p
          custom={0}
          variants={rise}
          className="mt-[5vh] font-display text-[12px] font-semibold uppercase tracking-[0.46em] text-white drop-shadow-[0_2px_6px_rgba(58,51,85,0.35)]"
        >
          Bliss Memoir
        </motion.p>
        <motion.h1
          custom={1}
          variants={rise}
          className="title-pop mt-1 font-fun text-[clamp(40px,11vw,64px)] leading-tight tracking-wider"
        >
          幸福回忆录
        </motion.h1>
      </div>

      {/* 下：欢迎卡片（横屏手机上变成左文右按钮的扁卡片） */}
      <div className="w-full pb-safe">
        <motion.div
          custom={2}
          variants={rise}
          className="glass mx-auto mb-[4.5vh] w-[min(92vw,420px)] rounded-[30px] px-6 pb-6 pt-5 text-center short:mb-3 short:flex short:w-[min(88vw,640px)] short:items-center short:gap-6 short:py-4 short:text-left"
        >
          <div className="min-w-0 short:flex-1">
            <div className="flex items-center justify-center gap-2 font-fun text-[22px] text-ink short:justify-start">
              <span>{couple.groomName}</span>
              <Heart className="heartbeat h-5 w-5 text-coral" fill="currentColor" strokeWidth={0} />
              <span>{couple.brideName}</span>
            </div>
            <div className="mx-auto mt-1.5 w-fit rounded-full bg-butter/55 px-3 py-0.5 font-display text-[13px] font-medium tracking-[0.18em] text-ink/80 short:mx-0">
              {couple.date}
            </div>

            <h2 className="mt-4 font-fun text-[19px] text-coral-deep short:mt-2">{couple.welcomeTitle}</h2>
            <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft short:line-clamp-2">
              {couple.welcomeText}
            </p>
          </div>

          <div className="short:w-[210px] short:shrink-0">
            <button
              type="button"
              onClick={enter}
              className="btn-candy mt-5 h-14 w-full font-fun text-[20px] tracking-widest short:mt-0"
            >
              <span className="flex items-center justify-center gap-2">
                {couple.enterLabel}
                <Heart className="h-5 w-5" fill="currentColor" strokeWidth={0} />
              </span>
            </button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-ink-soft/80 short:mt-2.5">
              <Volume2 className="h-3.5 w-3.5" />
              打开声音，效果更好
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
