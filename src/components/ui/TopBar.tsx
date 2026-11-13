/**
 * 顶栏
 * ------------------------------------------------------------
 * 左：新人名字（点一下回到入口）。
 * 右：自动漫游 / 背景音乐 / 体感视差（仅触屏设备）/ 相册；平面版只有音乐和相册。
 */
import { Compass, Heart, LayoutGrid, Music, Pause, Play, VolumeX } from 'lucide-react';
import { couple } from '../../data/memoirData';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { requestGyroPermission } from '../../hooks/useGyro';
import { useCinema } from '../../media/cinema';
import { useStore } from '../../store/useStore';
import { IconButton } from './IconButton';

const tier = getDeviceTier();

export function TopBar() {
  // 平面版没有可以漫游、可以视差的 3D 镜头
  const flat = useStore((s) => s.flat);
  const touring = useStore((s) => s.touring);
  const audioEnabled = useStore((s) => s.audioEnabled);
  const gyroEnabled = useStore((s) => s.gyroEnabled);
  const musicFailed = useCinema((s) => s.musicFailed);
  const { toggleTour, toggleAudio, toggleGyro, openGrid, goToChapter } = useStore.getState();

  const onGyro = async () => {
    if (!gyroEnabled && !(await requestGyroPermission())) return;
    toggleGyro();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-safe pt-safe">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <button
          type="button"
          onClick={() => goToChapter(-1)}
          aria-label="回到入口"
          title="回到入口"
          className="glass pointer-events-auto flex h-11 min-w-0 items-center gap-1.5 rounded-full pl-3.5 pr-4 transition-transform duration-150 active:scale-95"
        >
          <Heart className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--accent)' }} fill="currentColor" strokeWidth={0} />
          <span className="hidden truncate font-fun text-[15px] min-[390px]:inline">
            {couple.groomName} {couple.connector} {couple.brideName}
          </span>
        </button>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {!flat && (
            <IconButton label={touring ? '停止自动漫游' : '自动漫游'} onClick={toggleTour} active={touring}>
              {touring ? <Pause className="h-[18px] w-[18px]" fill="currentColor" /> : <Play className="h-[18px] w-[18px]" fill="currentColor" />}
            </IconButton>
          )}
          <IconButton
            label={audioEnabled ? '关闭背景音乐' : '打开背景音乐'}
            onClick={toggleAudio}
            disabled={musicFailed}
          >
            {audioEnabled && !musicFailed ? (
              <Music className="h-[18px] w-[18px] animate-wiggle" />
            ) : (
              <VolumeX className="h-[18px] w-[18px]" />
            )}
          </IconButton>
          {tier.isTouch && !flat && (
            <IconButton label="体感视差" onClick={onGyro} active={gyroEnabled}>
              <Compass className="h-[18px] w-[18px]" />
            </IconButton>
          )}
          <IconButton label="相册" onClick={openGrid}>
            <LayoutGrid className="h-[18px] w-[18px]" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
