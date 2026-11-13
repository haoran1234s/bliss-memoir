/**
 * 婚礼影像放映室
 * ------------------------------------------------------------
 * 沉稳深色圆角放映容器：
 *   - 左侧/上方 16:9 原生 <video> 播放器，有声播放时自动让背景音乐渐隐；
 *   - 右侧/下方选片列表，展示封面、片名与副标题，点击即刻切播；
 *   - 组件卸载或暂停/结束时确保恢复背景音乐状态。
 */
import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Play, VideoOff } from 'lucide-react';
import { videos } from '../../data/library';
import { useAlbumStore } from '../../store/useAlbumStore';

export function VideoTheater() {
  const setVideoPlaying = useAlbumStore((s) => s.setVideoPlaying);
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
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="rounded-3xl bg-[#161422] p-5 text-[#f4f3f8] shadow-[0_18px_46px_-20px_rgba(15,14,21,0.55)] sm:p-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-[#ff8a98]" aria-hidden="true" />
              <h2 className="font-fun text-[22px] leading-tight text-white sm:text-[26px]">婚礼影像</h2>
            </div>
            <p className="mt-1 text-[14px] text-[#c4c0d4]">
              {currentVideo.title} · {currentVideo.subtitle}
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 font-display text-[12px] font-medium text-[#e4e1f0] tabular-nums">
            共 {videos.length} 段影片
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* 主播放器 */}
          <div className="lg:col-span-8">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              {isFailed ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-[#c4c0d4]">
                  <VideoOff className="h-8 w-8 text-[#ff8a98]" aria-hidden="true" />
                  <p className="text-[14px]">这段视频暂时没能加载出来，试试切换其他影片</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  key={currentVideo.id}
                  src={currentVideo.videoUrl}
                  poster={currentVideo.posterUrl}
                  controls
                  playsInline
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

          {/* 选片列表 */}
          <div className="flex flex-col gap-2.5 lg:col-span-4">
            {videos.map((v, idx) => {
              const active = v.id === currentVideo.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVideo(v.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                    active
                      ? 'border-[#ff8a98]/60 bg-white/[0.11] text-white'
                      : 'border-white/10 bg-white/[0.04] text-[#d9d5e6] hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-[#27233b]">
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
                    <span className="absolute inset-0 grid place-items-center bg-black/25">
                      <Play className="h-4 w-4 text-white" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-[11.5px] text-[#c4c0d4] tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate text-[14.5px] font-semibold text-white">{v.title}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[12.5px] text-[#c4c0d4]">{v.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
