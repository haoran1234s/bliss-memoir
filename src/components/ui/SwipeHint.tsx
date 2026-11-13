/**
 * 手势提示
 * ------------------------------------------------------------
 * 刚进花园时出现一次：告诉客人怎么逛。自己动手滑过 / 点过之后，或者 8 秒后自动消失。
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pointer } from 'lucide-react';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useStore } from '../../store/useStore';

const tier = getDeviceTier();

export function SwipeHint() {
  const seen = useStore((s) => s.hintsSeen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (seen) return;
    const show = window.setTimeout(() => setReady(true), 1500);
    const hide = window.setTimeout(() => useStore.getState().markHintsSeen(), 9500);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [seen]);

  return (
    <AnimatePresence>
      {ready && !seen && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-[46%] z-20 flex justify-center px-6"
          initial={{ opacity: 0, y: 14, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <div className="glass flex items-center gap-3 rounded-full py-2.5 pl-4 pr-5">
            <Pointer className="hand-swipe h-6 w-6 text-coral-deep" />
            <div className="text-left leading-tight">
              <div className="font-fun text-[15px] text-ink">
                {tier.isTouch ? '左右滑动，逛逛花园' : '滚轮 / 方向键 / 拖动，逛逛花园'}
              </div>
              <div className="text-[12px] text-ink-soft">点照片可以看高清大图</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
