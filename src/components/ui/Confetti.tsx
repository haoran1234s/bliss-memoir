/**
 * 撒彩纸
 * ------------------------------------------------------------
 * 走进花园的那一刻，从屏幕两个下角「砰」地喷出两把彩纸。
 * 用一块 2D 画布画，喷完就停，平时不占任何开销。
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { RAINBOW } from '../../theme/palettes';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rot: number;
  spin: number;
  /** 翻转相位：模拟纸片在空中翻面 */
  flip: number;
  flipSpeed: number;
  round: boolean;
}

const GRAVITY = 1100;
const COLORS = [...RAINBOW, '#ffffff', '#ff7e8a'];

export function Confetti() {
  const count = useStore((s) => s.confetti);
  const canvas = useRef<HTMLCanvasElement>(null);
  const seen = useRef(count);

  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(W * dpr);
    el.height = Math.round(H * dpr);

    const pieces: Piece[] = [];
    const n = Math.round(Math.min(170, 80 + W * 0.07));
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      // 朝屏幕中间斜着往上喷，能冲到屏幕高度的 45% ~ 95%
      const angle = ((12 + Math.random() * 32) * Math.PI) / 180;
      const reach = H * (0.45 + Math.random() * 0.5);
      const speed = Math.sqrt(2 * GRAVITY * reach) * 1.25;
      const size = 6 + Math.random() * 6;
      pieces.push({
        x: side < 0 ? -6 : W + 6,
        y: H + 6,
        vx: -side * Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        w: size,
        h: size * (0.45 + Math.random() * 0.3),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 12,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 6 + Math.random() * 8,
        round: Math.random() < 0.22,
      });
    }

    let raf = 0;
    let last = performance.now();
    const started = last;
    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      const fade = Math.min(1, Math.max(0, (5.2 - (now - started) / 1000) / 0.8));
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        // 空气阻力：上升时减速很快，落下时像纸片一样飘
        const drag = Math.exp(-dt * (p.vy > 0 ? 2.6 : 1.5));
        p.vx *= drag;
        p.vy = p.vy * drag + GRAVITY * dt * (p.vy > 0 ? 0.42 : 1);
        p.x += (p.vx + (p.vy > 0 ? Math.sin(p.flip) * 40 : 0)) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        p.flip += p.flipSpeed * dt;
        if (p.y > H + 20) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (alive > 0 && fade > 0) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
    };
  }, [count]);

  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 z-[45] h-full w-full" aria-hidden="true" />;
}
