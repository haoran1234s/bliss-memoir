/**
 * 章节封面牌与入口木牌
 * ------------------------------------------------------------
 * 封面牌是一张被气球吊着的大拍立得：上面是这一章的封面照片，下面是标题。
 * 文字用 Canvas 2D 排版后作为贴图。为了省显存，只有镜头附近几块牌子
 * 持有真正的贴图，远处的牌子用「相纸白 + 照片平均色」两块纯色代替 ——
 * 隔着十几米看，和真的几乎没有区别。
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { chapters, photos } from '../../data/library';
import { couple } from '../../data/memoirData';
import { getDeviceTier } from '../../hooks/useDeviceTier';
import { useStore } from '../../store/useStore';
import { makeMaterial } from '../../three/env';
import { finishCanvasTexture, paintBoard, paintSign, SIGN_SIZE } from '../../three/textures';
import { paletteOf } from '../../theme/palettes';
import { BOARD, type BoardInfo, type World } from '../../three/world';

/* ------------------------------------------------------------------ */
/*  面板材质：一张带圆角的贴图牌子（封面牌 / 木牌 / 影院横幅共用）        */
/* ------------------------------------------------------------------ */
export interface PanelOptions {
  /** 牌子的实际尺寸（米） */
  width: number;
  height: number;
  /** 圆角半径（米） */
  radius: number;
  /** 随哪一束气球浮动；<0 固定不动 */
  bob?: number;
  /** 贴图没到之前的占位色 */
  tint?: THREE.ColorRepresentation;
  /** 占位时「照片区域」在牌面上的范围（uv：x, y, 宽, 高；y 从上往下） */
  photoRect?: [number, number, number, number];
  /** 夜里自发光的强度（影院横幅） */
  emissive?: number;
}

export function panelMaterial(o: PanelOptions) {
  return makeMaterial({
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    uniforms: {
      uMap: { value: null },
      uReady: { value: 0 },
      uSize: { value: new THREE.Vector3(o.width, o.height, o.radius) },
      uBob: { value: o.bob ?? -1 },
      uTint: { value: new THREE.Color(o.tint ?? '#fff6ea') },
      uPhotoRect: { value: new THREE.Vector4(...(o.photoRect ?? [0, 0, 0, 0])) },
      uEmissive: { value: o.emissive ?? 0 },
    },
    vertex: /* glsl */ `
      uniform float uBob;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        if (uBob >= 0.0) wp.xyz += rackBob(uBob);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragment: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uReady;
      uniform vec3 uSize;
      uniform vec3 uTint;
      uniform vec4 uPhotoRect;
      uniform float uEmissive;
      varying vec2 vUv;
      varying vec3 vWorld;

      void main() {
        vec2 p = (vUv - 0.5) * uSize.xy;
        vec2 q = abs(p) - uSize.xy * 0.5 + uSize.z;
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uSize.z;
        float aa = max(fwidth(sd), 1e-5);
        float alpha = 1.0 - smoothstep(-aa, aa, sd);
        if (alpha < 0.03) discard;

        vec3 paper = vec3(1.0, 0.982, 0.948);
        // 占位：相纸 + 一块照片平均色
        vec2 r = (vec2(vUv.x, 1.0 - vUv.y) - uPhotoRect.xy) / max(uPhotoRect.zw, vec2(1e-4));
        float inPhoto = step(0.0, r.x) * step(r.x, 1.0) * step(0.0, r.y) * step(r.y, 1.0);
        vec3 col = mix(paper, uTint, inPhoto);
        if (uReady > 0.0) col = mix(col, texture2D(uMap, vUv).rgb, uReady);
        if (!gl_FrontFacing) col = paper * 0.9;

        col *= mix(uCardLight, vec3(1.2), uEmissive * uAtmo.w);
        outColor(withFog(col, vWorld), alpha);
      }
    `,
  });
}

/* ------------------------------------------------------------------ */
/*  封面牌                                                             */
/* ------------------------------------------------------------------ */
interface Slot {
  info: BoardInfo;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  canvas: HTMLCanvasElement | null;
  texture: THREE.CanvasTexture | null;
  /** 每次激活 +1，异步加载回来时用它判断自己是否已经过期 */
  token: number;
}

/** 照片区域在封面牌画布（1024 × 1256）上的位置，与 paintBoard 保持一致 */
const BOARD_PHOTO: [number, number, number, number] = [62 / 1024, 62 / 1256, 900 / 1024, 752 / 1256];

let boardGeo: THREE.PlaneGeometry | null = null;
let signGeo: THREE.PlaneGeometry | null = null;

function build(world: World) {
  const root = new THREE.Group();
  boardGeo ??= new THREE.PlaneGeometry(BOARD.W, BOARD.H);
  signGeo ??= new THREE.PlaneGeometry(SIGN_SIZE.w, SIGN_SIZE.h);

  const slots: Slot[] = world.boards.map((info) => {
    const chapter = chapters[info.chapter];
    const material = panelMaterial({
      width: BOARD.W,
      height: BOARD.H,
      radius: 0.028,
      bob: info.seed,
      tint: photos[chapter.cover]?.color ?? '#ffe3ea',
      photoRect: BOARD_PHOTO,
    });
    const mesh = new THREE.Mesh(boardGeo!, material);
    mesh.position.copy(info.center);
    mesh.quaternion.copy(info.quat);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    return { info, mesh, material, canvas: null, texture: null, token: 0 };
  });

  // 入口木牌
  const signMaterial = panelMaterial({ width: SIGN_SIZE.w, height: SIGN_SIZE.h, radius: 0.105, tint: '#fff1dc' });
  const sign = new THREE.Mesh(signGeo, signMaterial);
  sign.position.copy(world.arch.signCenter);
  sign.quaternion.copy(world.arch.quat);
  sign.updateMatrix();
  sign.matrixAutoUpdate = false;
  root.add(sign);

  return { root, slots, signMaterial };
}

export function Boards() {
  const world = useStore((s) => s.world);
  const fonts = useStore((s) => s.boot.fonts);
  const gl = useThree((s) => s.gl);
  const tier = getDeviceTier();
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

  const built = useMemo(() => build(world), [world]);

  useEffect(
    () => () => {
      for (const slot of built.slots) {
        slot.token++;
        slot.texture?.dispose();
        slot.material.dispose();
      }
      built.signMaterial.uniforms.uMap.value?.dispose();
      built.signMaterial.dispose();
    },
    [built],
  );

  // 木牌：字体就绪后画一次
  useEffect(() => {
    if (!fonts) return;
    const canvas = document.createElement('canvas');
    paintSign(canvas, couple);
    const tex = finishCanvasTexture(canvas, anisotropy);
    const u = built.signMaterial.uniforms;
    u.uMap.value?.dispose();
    u.uMap.value = tex;
    u.uReady.value = 1;
  }, [built, fonts, anisotropy]);

  useFrame((_, delta) => {
    if (!fonts) return;
    const stop = useStore.getState().stop;
    for (const slot of built.slots) {
      const near = Math.abs(slot.info.stop - stop) <= 3;
      if (near && !slot.texture) activate(slot);
      else if (!near && slot.texture) release(slot);
      const ready = slot.material.uniforms.uReady;
      if (slot.texture && ready.value < 1) ready.value = Math.min(1, ready.value + delta * 2.4);
    }
  });

  function activate(slot: Slot) {
    const chapter = chapters[slot.info.chapter];
    const cover = photos[chapter.cover];
    const token = ++slot.token;
    const canvas = (slot.canvas ??= document.createElement('canvas'));
    const paint = (image: HTMLImageElement | null) =>
      paintBoard(canvas, tier.boardSize, {
        chapter,
        total: chapters.length,
        palette: paletteOf(chapter.palette, chapter.index),
        tint: cover?.color ?? '#ffe3ea',
        cover: image,
        coverW: image?.naturalWidth ?? 0,
        coverH: image?.naturalHeight ?? 0,
      });

    // 先画不带照片的版本，文字立刻可读；照片解码完再重画一次
    paint(null);
    const tex = finishCanvasTexture(canvas, anisotropy);
    slot.texture = tex;
    slot.material.uniforms.uMap.value = tex;

    if (!cover) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = cover.full;
    const done = () => {
      if (slot.token !== token || slot.texture !== tex) return;
      paint(img);
      tex.needsUpdate = true;
    };
    if (img.decode) img.decode().then(done, () => void 0);
    else img.onload = done;
  }

  function release(slot: Slot) {
    slot.token++;
    slot.texture?.dispose();
    slot.texture = null;
    slot.canvas = null;
    slot.material.uniforms.uMap.value = null;
    slot.material.uniforms.uReady.value = 0;
  }

  return <primitive object={built.root} />;
}
