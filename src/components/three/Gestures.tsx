/**
 * 手势层
 * ------------------------------------------------------------
 * 直接监听画布上的原生指针事件（不走 R3F 的射线事件，照片卡是实例化的）：
 *   - 拖动：一次滑动最多前进 / 后退一站，松手后吸附。向左滑或向上滑都是「往前走」；
 *   - 轻点：点照片 → 高清检视；点封面牌 → 走过去 / 看封面大图；点银幕 → 进入影院；
 *   - 滚轮 / 触控板：一格一站；
 *   - 鼠标悬停：照片卡微微放大，并带一点镜头视差。
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { chapters } from '../../data/library';
import { cinemaTogglePlay } from '../../media/cinema';
import { useStore } from '../../store/useStore';
import { cam, clamp } from '../../three/cameraInput';
import { hover, photoScreenRect, pick } from '../../three/picking';

export function Gestures() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';

    const store = () => useStore.getState();
    /** 花园里可以自由走动（没有浮层挡着） */
    const roaming = () => {
      const s = store();
      return s.phase === 'gallery' && s.detail === null && !s.gridOpen;
    };

    let pointer = -1;
    let startX = 0;
    let startY = 0;
    let base = 0;
    let moved = false;
    let axis: 'x' | 'y' = 'x';
    let lastPos = 0;
    let lastTime = 0;
    let speed = 0;
    let hoverFrame = 0;
    let hoverX = 0;
    let hoverY = 0;

    const ndc = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return {
        x: ((clientX - r.left) / r.width) * 2 - 1,
        y: -((clientY - r.top) / r.height) * 2 + 1,
        rect: r,
      };
    };

    const onDown = (e: PointerEvent) => {
      if (!roaming() || (e.pointerType === 'mouse' && e.button !== 0) || pointer !== -1) return;
      pointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      base = clamp(Math.round(cam.target), 0, store().world.stops.length - 1);
      moved = false;
      speed = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointer) {
        // 没有按下：鼠标悬停
        if (e.pointerType === 'mouse' && pointer === -1) {
          const r = el.getBoundingClientRect();
          cam.pointerX = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
          cam.pointerY = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1, 1);
          hoverX = e.clientX;
          hoverY = e.clientY;
          if (!hoverFrame) hoverFrame = requestAnimationFrame(updateHover);
        }
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const s = store();
      if (!moved) {
        if (Math.hypot(dx, dy) < 8) return;
        moved = true;
        axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        hover.index = -1;
        el.style.cursor = 'grabbing';
        if (!s.cinema.open) {
          cam.dragging = true;
          s.markHintsSeen();
          s.stopTour();
        }
        lastPos = axis === 'x' ? e.clientX : e.clientY;
        lastTime = e.timeStamp;
      }
      if (s.cinema.open) return;

      const r = el.getBoundingClientRect();
      const max = s.world.stops.length - 1;
      // 滑过大半个屏幕 = 走一站
      const raw = axis === 'x' ? -dx / (r.width * 0.72) : -dy / (r.height * 0.5);
      let t = base + clamp(raw, -1.12, 1.12);
      // 到头了再拉会有阻尼
      if (t < 0) t *= 0.28;
      if (t > max) t = max + (t - max) * 0.28;
      cam.target = t;

      const p = axis === 'x' ? e.clientX : e.clientY;
      const dtMs = e.timeStamp - lastTime;
      if (dtMs > 4) {
        const v = -(p - lastPos) / dtMs; // px / ms，正值 = 往前
        speed = speed * 0.5 + v * 0.5;
        lastPos = p;
        lastTime = e.timeStamp;
      }
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== pointer) return;
      pointer = -1;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = '';
      const s = store();

      if (!moved) {
        if (!cancelled) tap(e);
        return;
      }
      if (!cam.dragging) return;
      cam.dragging = false;
      const max = s.world.stops.length - 1;
      const delta = cam.target - base;
      const flick = e.timeStamp - lastTime < 120 ? speed : 0;
      let to = base;
      if (delta > 0.2 || (delta > 0.05 && flick > 0.45)) to = base + 1;
      else if (delta < -0.2 || (delta < -0.05 && flick < -0.45)) to = base - 1;
      cam.target = clamp(to, 0, max);
    };

    const tap = (e: PointerEvent) => {
      const s = store();
      if (!roaming()) return;
      const p = ndc(e.clientX, e.clientY);
      const hit = pick(s.world, camera, p.x, p.y, s.stop);
      if (s.cinema.open) {
        if (hit?.kind === 'screen') cinemaTogglePlay();
        return;
      }
      if (!hit) return;
      s.markHintsSeen();
      if (hit.kind === 'photo') {
        const rect = photoScreenRect(s.world, hit.index, camera, p.rect.width, p.rect.height);
        s.openPhoto(hit.index, rect ? { x: rect.x + p.rect.left, y: rect.y + p.rect.top, w: rect.w, h: rect.h } : null);
      } else if (hit.kind === 'board') {
        const at = s.world.chapterStop[hit.chapter];
        s.stopTour();
        // 远远看见封面牌：先走过去；已经站在它面前：打开封面照片
        if (Math.round(cam.target) !== at) s.goToStop(at);
        else s.openPhoto(chapters[hit.chapter].cover);
      } else {
        s.openCinema();
      }
    };

    const updateHover = () => {
      hoverFrame = 0;
      if (!roaming() || pointer !== -1) {
        hover.index = -1;
        return;
      }
      const s = store();
      const p = ndc(hoverX, hoverY);
      const hit = pick(s.world, camera, p.x, p.y, s.stop);
      hover.index = hit?.kind === 'photo' && !s.cinema.open ? hit.index : -1;
      el.style.cursor = hit ? 'pointer' : '';
    };

    const onLeave = () => {
      hover.index = -1;
      cam.pointerX = 0;
      cam.pointerY = 0;
    };

    /* 滚轮 / 触控板：累计到一定量走一站，之后锁一小会儿，避免一次滚动连跳好几站 */
    let wheelSum = 0;
    let wheelLock = 0;
    let wheelLast = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = store();
      if (!roaming() || s.cinema.open) return;
      const now = performance.now();
      if (now - wheelLast > 240) wheelSum = 0;
      wheelLast = now;
      if (now < wheelLock) return;
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
      wheelSum += (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
      if (Math.abs(wheelSum) > 46) {
        s.markHintsSeen();
        s.stopTour();
        s.step(wheelSum > 0 ? 1 : -1);
        wheelSum = 0;
        wheelLock = now + 520;
      }
    };

    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      cam.dragging = false;
      hover.index = -1;
    };
  }, [gl, camera]);

  return null;
}
