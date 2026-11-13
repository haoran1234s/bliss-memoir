/**
 * 相册（2D 总览）
 * ------------------------------------------------------------
 * 给想快速翻看、或者不习惯 3D 操作的客人：所有照片按章节排成网格，最后是影片。
 *   - 虚拟列表：只渲染屏幕里看得见的那几行，几百上千张照片也不卡；
 *   - 顶部的章节标签跟着滚动高亮，点一下直接跳到那一章；
 *   - 点照片 → 看大图（叠在相册上面，关掉后还在原来的位置）；点影片 → 去露天影院；
 *   - 往下拖顶部的把手可以收起。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, SyntheticEvent } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { Clapperboard, Images, Play, X } from 'lucide-react';
import { chapters, photos, videos } from '../../data/library';
import { useStore } from '../../store/useStore';
import { PALETTES } from '../../theme/palettes';
import { ordinal } from './NavBar';

const PAD = 14;
const HEADER_H = 64;
const VIDEO_COLOR = '#7c6cf0';

type Row =
  | { kind: 'header'; top: number; height: number; section: number }
  | { kind: 'photos'; top: number; height: number; first: number; count: number }
  | { kind: 'videos'; top: number; height: number; first: number; count: number };

interface Layout {
  rows: Row[];
  total: number;
  gap: number;
  cell: number;
  vcell: number;
  /** 每个分区（各章 + 影片）标题行的位置 */
  sections: number[];
}

/** @param short 矮屏（横着拿的手机）：格子小一点、列数多一点，一屏能多看几行 */
function buildLayout(width: number, short: boolean): Layout {
  const inner = Math.max(200, width - PAD * 2);
  const cols = short
    ? Math.max(5, Math.round(inner / 118))
    : inner < 420
      ? 3
      : inner < 640
        ? 4
        : inner < 860
          ? 5
          : 6;
  const gap = inner < 420 ? 5 : 8;
  const cell = (inner - gap * (cols - 1)) / cols;
  const rows: Row[] = [];
  const sections: number[] = [];
  let y = 0;

  for (const ch of chapters) {
    sections.push(y);
    rows.push({ kind: 'header', top: y, height: HEADER_H, section: ch.index });
    y += HEADER_H;
    for (let i = 0; i < ch.count; i += cols) {
      rows.push({ kind: 'photos', top: y, height: cell + gap, first: ch.start + i, count: Math.min(cols, ch.count - i) });
      y += cell + gap;
    }
    y += 10;
  }

  const vcols = inner < 520 ? 2 : 3;
  const vcell = (inner - gap * (vcols - 1)) / vcols;
  if (videos.length) {
    sections.push(y);
    rows.push({ kind: 'header', top: y, height: HEADER_H, section: chapters.length });
    y += HEADER_H;
    const h = vcell * (9 / 16) + 34 + gap;
    for (let i = 0; i < videos.length; i += vcols) {
      rows.push({ kind: 'videos', top: y, height: h, first: i, count: Math.min(vcols, videos.length - i) });
      y += h;
    }
  }
  return { rows, total: y + 28, gap, cell, vcell, sections };
}

const markLoaded = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.dataset.loaded = '';
};
const hideBroken = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = 'hidden';
};

export function GridDrawer() {
  const lastPhoto = useStore((s) => s.lastPhoto);
  const close = () => useStore.getState().closeGrid();
  const drag = useDragControls();

  const scroller = useRef<HTMLDivElement>(null);
  const tabRow = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<number, HTMLButtonElement>());
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const measure = () =>
      setBox((old) => (old.w === el.clientWidth && old.h === el.clientHeight ? old : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const short = box.h > 0 && window.innerHeight <= 520;
  const layout = useMemo(() => (box.w ? buildLayout(box.w, short) : null), [box.w, short]);

  const rowOf = (index: number) =>
    layout?.rows.find((r) => r.kind === 'photos' && index >= r.first && index < r.first + r.count) ?? null;

  /** 让某张照片所在的行出现在屏幕中间（已经看得见就不动） */
  const reveal = (index: number) => {
    const el = scroller.current;
    const row = rowOf(index);
    if (!el || !row) return;
    if (row.top >= el.scrollTop && row.top + row.height <= el.scrollTop + el.clientHeight) return;
    el.scrollTop = Math.max(0, row.top - (el.clientHeight - row.height) / 2);
    setScrollTop(el.scrollTop);
  };

  // 打开时滚到最近看过的那张；在大图里翻页时，相册也悄悄跟着滚
  const revealed = useRef(false);
  useLayoutEffect(() => {
    if (!layout || revealed.current) return;
    revealed.current = true;
    if (lastPhoto >= 0) reveal(lastPhoto);
  }, [layout]);
  useEffect(() => {
    if (revealed.current && lastPhoto >= 0) reveal(lastPhoto);
  }, [lastPhoto]);

  const raf = useRef(0);
  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (scroller.current) setScrollTop(scroller.current.scrollTop);
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* —— 当前在哪个分区 —— */
  let active = 0;
  if (layout) {
    layout.sections.forEach((top, i) => {
      if (top <= scrollTop + 16) active = i;
    });
    if (scrollTop + box.h >= layout.total - 4) active = layout.sections.length - 1;
  }
  useEffect(() => {
    const row = tabRow.current;
    const tab = tabs.current.get(active);
    if (!row || !tab) return;
    row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  const jump = (section: number) => {
    const top = layout?.sections[section];
    if (top !== undefined) scroller.current?.scrollTo({ top, behavior: 'smooth' });
  };

  const openPhoto = (index: number, e: ReactMouseEvent<HTMLButtonElement>) => {
    // 缩略图是方形裁切的：放大动画从「照片完整比例、刚好盖住方格」的矩形开始
    const r = e.currentTarget.getBoundingClientRect();
    const a = photos[index].aspect;
    const w = a >= 1 ? r.width * a : r.width;
    const h = a >= 1 ? r.height : r.height / a;
    useStore.getState().openPhoto(index, { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h }, true);
  };

  /* —— 只渲染看得见的行 —— */
  const visible: Row[] = [];
  if (layout) {
    const from = scrollTop - box.h * 0.6;
    const to = scrollTop + box.h * 1.6;
    for (const row of layout.rows) {
      if (row.top + row.height < from) continue;
      if (row.top > to) break;
      visible.push(row);
    }
  }

  const sectionTabs = [
    ...chapters.map((ch) => ({ key: ch.index, label: ch.title, color: (PALETTES[ch.palette] ?? PALETTES.blush).accent })),
    ...(videos.length ? [{ key: chapters.length, label: '影片', color: VIDEO_COLOR }] : []),
  ];

  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-end justify-center"
      initial="hidden"
      animate="shown"
      exit="hidden"
    >
      <motion.div
        className="absolute inset-0 bg-ink/25"
        variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
        transition={{ duration: 0.25 }}
        onClick={close}
      />

      <motion.div
        className="relative flex h-[92%] w-full max-w-[980px] flex-col overflow-hidden rounded-t-[28px] bg-paper shadow-print md:mb-[3vh] md:h-[88%] md:rounded-[28px] short:mb-0 short:h-[97%] short:rounded-b-none"
        variants={{ hidden: { y: '105%' }, shown: { y: 0 } }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 650) close();
        }}
      >
        {/* 把手 + 标题（按住往下拖可以收起） */}
        <div className="shrink-0 cursor-grab touch-none pt-2.5" onPointerDown={(e) => drag.start(e)}>
          <div className="mx-auto h-1.5 w-11 rounded-full bg-ink/15" />
          <div className="flex items-center justify-between gap-3 px-4 pt-2">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-fun text-[22px] leading-tight">
                <Images className="h-5 w-5 text-coral" />
                相册
              </h3>
              <p className="truncate text-[12px] text-ink-soft short:hidden">
                {chapters.length} 个章节 · {photos.length} 张照片
                {videos.length ? ` · ${videos.length} 段影片` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="关闭相册"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/5 transition-transform active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 章节标签 */}
        <div ref={tabRow} className="no-scrollbar relative flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2 pt-3 short:pt-1.5">
          {sectionTabs.map((tab, i) => {
            const on = i === active;
            return (
              <button
                key={tab.key}
                type="button"
                ref={(el) => {
                  if (el) tabs.current.set(i, el);
                  else tabs.current.delete(i);
                }}
                onClick={() => jump(i)}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-fun text-[14px] transition-colors duration-200 ${
                  on ? 'text-white' : 'bg-ink/[0.04] text-ink/75'
                }`}
                style={on ? { background: tab.color, boxShadow: `0 6px 14px -6px ${tab.color}` } : undefined}
              >
                {tab.key === chapters.length ? (
                  <Clapperboard className="h-4 w-4" />
                ) : (
                  !on && <span className="h-2 w-2 rounded-full" style={{ background: tab.color }} />
                )}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 照片网格 */}
        <div
          ref={scroller}
          onScroll={onScroll}
          className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="relative" style={{ height: layout?.total ?? 0 }}>
            {layout &&
              visible.map((row) => {
                if (row.kind === 'header') {
                  const isVideo = row.section === chapters.length;
                  const ch = chapters[row.section];
                  const color = isVideo ? VIDEO_COLOR : (PALETTES[ch.palette] ?? PALETTES.blush).accent;
                  return (
                    <div
                      key={`h${row.section}`}
                      className="absolute inset-x-0 flex items-end gap-3 pb-2.5"
                      style={{ top: row.top, height: row.height, paddingLeft: PAD, paddingRight: PAD }}
                    >
                      <span className="mb-1 h-8 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-fun text-[18px] leading-tight">
                          {isVideo ? '露天影院 · 影片' : `${ordinal(ch.index)} · ${ch.title}`}
                        </div>
                        <div className="truncate text-[12px] text-ink-soft">
                          {isVideo ? '点一下，去银幕前看' : ch.subtitle || '\u00a0'}
                        </div>
                      </div>
                      <span
                        className="mb-0.5 shrink-0 rounded-full px-2.5 py-0.5 font-display text-[12px] font-medium tabular-nums"
                        style={{ color, background: `${color}1f` }}
                      >
                        {isVideo ? `${videos.length} 段` : `${ch.count} 张`}
                      </span>
                    </div>
                  );
                }

                if (row.kind === 'photos') {
                  return (
                    <div key={`p${row.first}`} className="absolute inset-x-0" style={{ top: row.top, height: row.height }}>
                      {Array.from({ length: row.count }, (_, k) => {
                        const index = row.first + k;
                        const photo = photos[index];
                        const ring = index === lastPhoto;
                        return (
                          <button
                            key={index}
                            type="button"
                            aria-label={photo.title ?? `第 ${index + 1} 张照片`}
                            onClick={(e) => openPhoto(index, e)}
                            className="absolute overflow-hidden rounded-[10px] transition-transform duration-150 active:scale-95"
                            style={{
                              left: PAD + k * (layout.cell + layout.gap),
                              top: 0,
                              width: layout.cell,
                              height: layout.cell,
                              background: photo.color,
                              boxShadow: ring ? '0 0 0 3px #fffbf4, 0 0 0 6px var(--accent)' : undefined,
                              zIndex: ring ? 1 : undefined,
                            }}
                          >
                            <img
                              src={photo.thumb}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                              onLoad={markLoaded}
                              onError={hideBroken}
                              className="fade-img h-full w-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  );
                }

                return (
                  <div key={`v${row.first}`} className="absolute inset-x-0" style={{ top: row.top, height: row.height }}>
                    {Array.from({ length: row.count }, (_, k) => {
                      const video = videos[row.first + k];
                      return (
                        <button
                          key={video.id}
                          type="button"
                          onClick={() => useStore.getState().openCinema(video.id)}
                          className="absolute text-left transition-transform duration-150 active:scale-95"
                          style={{ left: PAD + k * (layout.vcell + layout.gap), top: 0, width: layout.vcell }}
                        >
                          <div
                            className="relative w-full overflow-hidden rounded-[12px]"
                            style={{
                              height: layout.vcell * (9 / 16),
                              background: 'linear-gradient(135deg, #ffd1dc, #ffe9c9 50%, #bfe6ff)',
                            }}
                          >
                            <img
                              src={video.posterUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                              onLoad={markLoaded}
                              onError={hideBroken}
                              className="fade-img h-full w-full object-cover"
                            />
                            <span className="absolute inset-0 grid place-items-center">
                              <span className="grid h-11 w-11 place-items-center rounded-full bg-white/85 text-[#7c6cf0] shadow-soft">
                                <Play className="ml-0.5 h-5 w-5" fill="currentColor" strokeWidth={0} />
                              </span>
                            </span>
                          </div>
                          <div className="truncate px-0.5 pt-1.5 font-fun text-[14px]">{video.title}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
