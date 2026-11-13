/**
 * 云朵转场
 * ------------------------------------------------------------
 * 跳到很远的章节时，两大团白云从左右合拢，遮住镜头瞬移的那一下，再散开。
 * 由 store.wipe 驱动：合拢要在 store 里的 320ms 之内完成。
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store/useStore';

/** 一团云由几个圆叠成：[中心 x %, 中心 y %, 直径 vmax] */
const PUFFS: Array<[number, number, number]> = [
  [8, 6, 46],
  [34, 16, 34],
  [58, 30, 30],
  [76, 50, 28],
  [58, 70, 32],
  [34, 86, 40],
  [6, 62, 50],
  [36, 48, 42],
];

function Cloud({ side }: { side: -1 | 1 }) {
  return (
    <motion.div
      className="absolute inset-y-0 w-[78vw]"
      style={side < 0 ? { left: 0 } : { right: 0 }}
      variants={{
        out: { x: `${side * 105}%` },
        in: { x: '0%', transition: { duration: 0.3, ease: [0.2, 0.8, 0.3, 1] } },
        gone: { x: `${side * 110}%`, transition: { duration: 0.6, ease: [0.5, 0, 0.75, 0] } },
      }}
    >
      {PUFFS.map(([x, y, d], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${side < 0 ? x : 100 - x}%`,
            top: `${y}%`,
            width: `${d}vmax`,
            height: `${d}vmax`,
            transform: 'translate(-50%, -50%)',
            boxShadow: 'inset 0 -2.2vmax 3vmax rgba(150, 190, 235, 0.28)',
          }}
        />
      ))}
    </motion.div>
  );
}

export function CloudWipe() {
  const wipe = useStore((s) => s.wipe);
  return (
    <AnimatePresence>
      {wipe && (
        <motion.div
          key="wipe"
          className="pointer-events-none absolute inset-0 z-[45] overflow-hidden"
          initial="out"
          animate="in"
          exit="gone"
        >
          <motion.div
            className="absolute inset-0 bg-[#f6fbff]"
            variants={{
              out: { opacity: 0 },
              in: { opacity: 0.94, transition: { duration: 0.28 } },
              gone: { opacity: 0, transition: { duration: 0.45, delay: 0.05 } },
            }}
          />
          <Cloud side={-1} />
          <Cloud side={1} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
