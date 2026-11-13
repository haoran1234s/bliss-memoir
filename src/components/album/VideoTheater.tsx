/**
 * 婚礼影像黑金暗房放映厅（Modal）
 * ------------------------------------------------------------
 * 专为手机端竖屏与桌面端设计的独立暗房放映浮层：
 *   - 100% 可靠的原生 <video> 内联播放（playsInline / webkit-playsinline / x5-playsinline）；
 *   - 有声播放期间自动通知背景音乐渐隐，暂停、播毕或关闭弹窗时自动恢复；
 *   - 底部 / 右侧选片列表展示 16:9 封面海报、编号与副标题，点击即刻切播。
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, Play, VideoOff, X } from 'lucide-react';
import { videos } from '../../data/library';
import { useAlbumStore } from '../../store/useAlbumStore';
import { CALM_EASE } from './albumHelpers';

export function VideoTheater() {
  const { setVideoModalOpen, setVideoPlaying } = useAlbumStore.getState();
  const [selectedId, setSelectedId] = useState<string>(videos[0]?.id ?? '');
  const [failedId, setFailedId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentVideo = videos.find((v) => v.id === selectedId) ?? videos[0];

  const syncAudioYield = () => {
    const el = videoRef.current;
    if (!el) return;
    setVideoPlaying(!el.paused && !el.ended && !el.muted);
  };

  useEffect(() => {
    return () => {
      useAlbumStore.getState().setVideoPlaying(false);
    };
  }, []);

  if (videos.length === 0 || !currentVideo) return null;

  const isFailed = failedId === currentVideo.id;

  const selectVideo = (id: string) => {
    if (id === currentVideo.id) return;
    setFailedId(null);
    setSelectedId(id);
    setVideoPlaying(false);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="婚礼影像暗房放映厅"
      className="fixed inset-0 z-40 flex flex-col bg-[#08080a]/95 text-[#f3efea] backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: CALM_EASE }}
    >
      {/* 顶部栏 */}
      <div className="shrink-0 border-b border-white/[0.08] px-safe pt-safe">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Clapperboard className="h-4 w-4 shrink-0 text-[#c8b28e]" aria-hidden="true" />
            <h2 className="truncate font-serif text-[17px] font-medium tracking-[0.06em] text-[#f3efea]">
              婚礼影像放映厅
            </h2>
            <span className="font-display text-[11px] tracking-[0.12em] text-[#a39e95] tabular-nums">
              {videos.length} REELS
            </span>
          </div>

          <button
            type="button"
            onClick={() => setVideoModalOpen(false)}
            aria-label="关闭影像放映厅"
            className="grid h-10 w-10 shrink-0 place-items-center border border-white/[0.12] bg-[#141418] text-[#f3efea] transition-colors hover:border-[#c8b28e]/60 active:scale-[0.97]"
            style={{ borderRadius: '8px' }}
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 主放映内容 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-safe pb-safe">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8 lg:grid lg:grid-cols-12 lg:gap-7">
          {/* 16:9 暗房主银幕 */}
          <div className="lg:col-span-8">
            <div className="overflow-hidden border border-white/[0.12] bg-black" style={{ borderRadius: '10px' }}>
              <div className="relative aspect-video w-full bg-black">
                {isFailed ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-[#a39e95]">
                    <VideoOff className="h-8 w-8 text-[#c8b28e]" aria-hidden="true" />
                    <p className="text-[13.5px]">这段视频暂时没能加载出来，请尝试切换其他影片或检查网络</p>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    key={currentVideo.id}
                    src={currentVideo.videoUrl}
                    poster={currentVideo.posterUrl}
                    controls
                    playsInline
                    webkit-playsinline="true"
                    x5-playsinline="true"
                    preload="metadata"
                    onPlay={syncAudioYield}
                    onPause={syncAudioYield}
                    onEnded={syncAudioYield}
                    onVolumeChange={syncAudioYield}
                    onError={() => {
                      setFailedId(currentVideo.id);
                      setVideoPlaying(false);
                    }}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
            </div>

            <div className="mt-3.5 border-b border-white/[0.08] pb-3.5">
              <div className="font-display text-[11px] tracking-[0.16em] text-[#c8b28e] uppercase">
                NOW SCREENING
              </div>
              <h3 className="mt-1 font-serif text-[20px] font-medium text-[#f3efea]">{currentVideo.title}</h3>
              {currentVideo.subtitle && (
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#a39e95]">{currentVideo.subtitle}</p>
              )}
            </div>
          </div>

          {/* 选片序列 */}
          <div className="flex flex-col gap-2.5 lg:col-span-4">
            <div className="font-display text-[11px] tracking-[0.16em] text-[#a39e95] uppercase">
              FILM INDEX · 共 {videos.length} 部
            </div>
            {videos.map((v, idx) => {
              const active = v.id === currentVideo.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVideo(v.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex items-center gap-3 border p-2.5 text-left transition-colors ${
                    active
                      ? 'border-[#c8b28e] bg-[#c8b28e]/[0.1] text-[#f3efea]'
                      : 'border-white/[0.08] bg-[#141418] text-[#a39e95] hover:border-white/20 hover:text-[#f3efea]'
                  }`}
                  style={{ borderRadius: '8px' }}
                >
                  <div
                    className="relative h-14 w-24 shrink-0 overflow-hidden bg-[#1b1b22]"
                    style={{ borderRadius: '6px' }}
                  >
                    <img
                      src={v.posterUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/30">
                      <Play
                        className={`h-4 w-4 ${active ? 'text-[#c8b28e]' : 'text-white/90'}`}
                        fill="currentColor"
                        strokeWidth={0}
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[11px] text-[#c8b28e] tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate font-serif text-[14.5px] font-medium text-[#f3efea]">
                        {v.title}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[12px] text-[#a39e95]">{v.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
