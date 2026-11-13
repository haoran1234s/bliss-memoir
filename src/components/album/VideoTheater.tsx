/**
 * 婚礼影像瑞士极简放映厅
 * ------------------------------------------------------------
 * 当底部 Dock 切换到「影像」时直接呈现：
 *   - 上方 16:9 原生 <video> 播放器（支持手机端 iOS/微信内联播放）；
 *   - 下方 Designeer 风格裸露细线选片网格；
 *   - 有声播放时自动让背景音乐渐隐，切出或关闭时恢复。
 */
import { useEffect, useRef, useState } from 'react';
import { Play, VideoOff } from 'lucide-react';
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
    <section
      aria-label="婚礼影像放映"
      className="h-full w-full overflow-y-auto overscroll-y-contain px-safe"
    >
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-16 sm:px-6 sm:pt-20">
        {/* 标题区 */}
        <div
          className="mb-4 flex items-baseline justify-between border-b pb-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[24px]">
            婚礼影像
          </h2>
          <span className="font-display text-[12px] text-[var(--ink-soft)] tabular-nums">
            共 {videos.length} 段影片
          </span>
        </div>

        {/* 主播放器 */}
        <div
          className="overflow-hidden rounded-xl border bg-black"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="relative aspect-video w-full bg-black">
            {isFailed ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-[#a1a1aa]">
                <VideoOff className="h-8 w-8" aria-hidden="true" />
                <p className="text-[13.5px]">这段视频暂时没能加载出来，请尝试切换其他影片</p>
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

        <div
          className="mt-3 border-b pb-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-[17px] font-semibold text-[var(--ink)]">{currentVideo.title}</h3>
          {currentVideo.subtitle && (
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
              {currentVideo.subtitle}
            </p>
          )}
        </div>

        {/* 选片列表（瑞士网格） */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {videos.map((v, idx) => {
            const active = v.id === currentVideo.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => selectVideo(v.id)}
                aria-current={active ? 'true' : undefined}
                className="flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors"
                style={{
                  borderColor: active ? 'var(--ink)' : 'var(--border)',
                  backgroundColor: active ? 'var(--surface)' : 'transparent',
                }}
              >
                <div
                  className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-muted)]"
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
                  <span className="absolute inset-0 grid place-items-center bg-black/25">
                    <Play
                      className="h-4 w-4 text-white"
                      fill="currentColor"
                      strokeWidth={0}
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[11px] text-[var(--ink-soft)] tabular-nums">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[14px] font-semibold text-[var(--ink)]">
                      {v.title}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--ink-soft)]">
                    {v.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
