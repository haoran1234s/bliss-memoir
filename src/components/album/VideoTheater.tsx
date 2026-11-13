/**
 * 婚礼影像瑞士极简放映厅
 * ------------------------------------------------------------
 * 当底部 Dock 切换到「影像」时直接呈现：
 *   - 上方 16:9 原生 <video> 播放器（支持 MP4、iOS/微信原生 HLS 与桌面/Android MSE fMP4）；
 *   - 下方 Designeer 风格裸露细线选片网格；
 *   - 有声播放时自动让背景音乐渐隐，切出或关闭时恢复。
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Play, VideoOff } from 'lucide-react';
import { videos } from '../../data/library';
import { useAlbumStore } from '../../store/useAlbumStore';

interface HlsSegment {
  url: string;
  start: number;
  duration: number;
}

interface ParsedM3u8 {
  initUrl: string | null;
  segments: HlsSegment[];
  totalDuration: number;
}

function parseM3u8Playlist(text: string, playlistUrl: string): ParsedM3u8 {
  const base = new URL(playlistUrl, window.location.href);
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let initUrl: string | null = null;
  const segments: HlsSegment[] = [];
  let pendingDuration = 0;
  let hasDuration = false;
  let cursor = 0;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXT-X-MAP:')) {
      const m = /URI="([^"]+)"/.exec(line);
      if (m?.[1]) initUrl = new URL(m[1], base).href;
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const val = parseFloat(line.slice(8).split(',')[0] ?? '0');
      pendingDuration = Number.isFinite(val) && val > 0 ? val : 0;
      hasDuration = true;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (hasDuration) {
      segments.push({
        url: new URL(line, base).href,
        start: cursor,
        duration: pendingDuration,
      });
      cursor += pendingDuration;
      hasDuration = false;
    }
  }

  return { initUrl, segments, totalDuration: cursor };
}

function pickSupportedFmp4Mime(): string | null {
  if (typeof MediaSource === 'undefined') return null;
  const candidates = [
    'video/mp4; codecs="avc1.4D4028, mp4a.40.2"',
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    'video/mp4',
  ];
  for (const m of candidates) {
    if (MediaSource.isTypeSupported(m)) return m;
  }
  return null;
}

function useHlsOrMp4Source(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string,
  onFatalError: () => void,
) {
  const fatalRef = useRef(onFatalError);
  fatalRef.current = onFatalError;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;

    const isHls = /\.m3u8(\?.*)?$/i.test(src);
    if (!isHls) {
      el.src = src;
      el.load();
      return () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
      };
    }

    const canNativeHls =
      el.canPlayType('application/vnd.apple.mpegurl') !== '' ||
      el.canPlayType('application/x-mpegURL') !== '';
    if (canNativeHls) {
      el.src = src;
      el.load();
      return () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
      };
    }

    const mime = pickSupportedFmp4Mime();
    if (!mime) {
      fatalRef.current();
      return;
    }

    let disposed = false;
    const ac = new AbortController();
    const ms = new MediaSource();
    const objectUrl = URL.createObjectURL(ms);

    let sb: SourceBuffer | null = null;
    let parsed: ParsedM3u8 | null = null;
    let initLoaded = false;
    let loadEpoch = 0;
    let pumpActive = false;
    const loadedSegs = new Set<number>();

    const waitUpdateEnd = (buffer: SourceBuffer): Promise<void> =>
      buffer.updating
        ? new Promise((resolve) => {
            const done = () => {
              buffer.removeEventListener('updateend', done);
              resolve();
            };
            buffer.addEventListener('updateend', done);
          })
        : Promise.resolve();

    let appendChain: Promise<void> = Promise.resolve();
    const enqueueAppend = (data: ArrayBuffer, currentTimeRef: () => number) => {
      appendChain = appendChain.then(async () => {
        if (disposed || !sb || ms.readyState !== 'open') return;
        await waitUpdateEnd(sb);
        if (disposed || ms.readyState !== 'open') return;
        try {
          sb.appendBuffer(data);
          await waitUpdateEnd(sb);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            const cutEnd = Math.max(0, currentTimeRef() - 12);
            if (cutEnd > 0 && parsed) {
              sb.remove(0, cutEnd);
              await waitUpdateEnd(sb);
              for (let i = 0; i < parsed.segments.length; i++) {
                if (parsed.segments[i].start + parsed.segments[i].duration <= cutEnd) {
                  loadedSegs.delete(i);
                }
              }
              sb.appendBuffer(data);
              await waitUpdateEnd(sb);
            }
          }
        }
      });
      return appendChain;
    };

    const ensureBufferedAround = async (targetTime: number) => {
      if (disposed || !parsed || !sb || !initLoaded) return;
      if (pumpActive) return;
      pumpActive = true;
      const myEpoch = loadEpoch;

      try {
        while (!disposed && myEpoch === loadEpoch && parsed) {
          const anchorTime = Math.max(targetTime, el.currentTime);
          const windowEnd = anchorTime + 18;
          let nextIdx = -1;
          for (let i = 0; i < parsed.segments.length; i++) {
            const seg = parsed.segments[i];
            if (seg.start + seg.duration <= Math.max(0, targetTime - 1)) continue;
            if (seg.start > windowEnd) break;
            if (!loadedSegs.has(i)) {
              nextIdx = i;
              break;
            }
          }
          if (nextIdx < 0) break;

          const res = await fetch(parsed.segments[nextIdx].url, { signal: ac.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          if (disposed) break;
          loadedSegs.add(nextIdx);
          await enqueueAppend(buf, () => el.currentTime);

          if (
            nextIdx === parsed.segments.length - 1 &&
            ms.readyState === 'open' &&
            el.currentTime >= parsed.totalDuration - 4
          ) {
            await waitUpdateEnd(sb);
            if (!disposed && ms.readyState === 'open') {
              try {
                ms.endOfStream();
              } catch {
                /* 忽略状态竞态 */
              }
            }
          }
        }
      } catch (err) {
        if (!disposed && !(err instanceof DOMException && err.name === 'AbortError')) {
          fatalRef.current();
        }
      } finally {
        pumpActive = false;
      }
    };

    const onTimeUpdate = () => {
      void ensureBufferedAround(el.currentTime);
    };

    const onSeeking = () => {
      loadEpoch += 1;
      pumpActive = false;
      void ensureBufferedAround(el.currentTime);
    };

    const onSourceOpen = async () => {
      try {
        const res = await fetch(src, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (disposed || ms.readyState !== 'open') return;

        parsed = parseM3u8Playlist(text, src);
        if (parsed.segments.length === 0) throw new Error('Empty HLS playlist');
        if (parsed.totalDuration > 0) ms.duration = parsed.totalDuration;

        sb = ms.addSourceBuffer(mime);
        if (parsed.initUrl) {
          const initRes = await fetch(parsed.initUrl, { signal: ac.signal });
          if (!initRes.ok) throw new Error(`HTTP ${initRes.status}`);
          const initBuf = await initRes.arrayBuffer();
          if (disposed) return;
          await enqueueAppend(initBuf, () => el.currentTime);
        }
        initLoaded = true;
        await ensureBufferedAround(el.currentTime || 0);
      } catch (err) {
        if (!disposed && !(err instanceof DOMException && err.name === 'AbortError')) {
          fatalRef.current();
        }
      }
    };

    ms.addEventListener('sourceopen', onSourceOpen, { once: true });
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('seeking', onSeeking);
    el.src = objectUrl;

    return () => {
      disposed = true;
      ac.abort();
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('seeking', onSeeking);
      ms.removeEventListener('sourceopen', onSourceOpen);
      el.pause();
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoRef, src]);
}

export function VideoTheater() {
  const setVideoPlaying = useAlbumStore((s) => s.setVideoPlaying);
  const [selectedId, setSelectedId] = useState<string>(videos[0]?.id ?? '');
  const [failedId, setFailedId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentVideo = videos.find((v) => v.id === selectedId) ?? videos[0];
  const isFailed = currentVideo ? failedId === currentVideo.id : false;

  useHlsOrMp4Source(
    videoRef,
    currentVideo && !isFailed ? currentVideo.videoUrl : '',
    () => {
      if (!currentVideo) return;
      setFailedId(currentVideo.id);
      setVideoPlaying(false);
    },
  );

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

        {/* 选片列表（瑞士网格，不附加多余文案） */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
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
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
