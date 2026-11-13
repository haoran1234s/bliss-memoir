# 幸福回忆录 · Bliss Memoir

一座开在春日花园里的 3D 婚礼回忆录：彩虹气球拱门、气球托起的照片架、每一章一块封面牌，小路尽头是一座露天影院。
手机优先，几百张照片也能顺滑地逛。

## 快速开始

需要 Node.js 20 或更新版本。

```bash
npm install
npm run demo:fetch   # 可选：下载一套演示素材（照片 / 视频 / 音乐）
npm run photos       # 处理照片（第一次会久一点，之后只处理有变化的）
npm run dev          # 本地预览
```

**用手机真机预览**：电脑和手机连同一个 Wi-Fi，运行 `npm run dev` 后，
用手机浏览器打开终端里 `Network:` 那一行的地址（形如 `http://192.168.x.x:5173`）。

## 怎么逛

- **走路**：左右滑动（电脑上用滚轮或 ← →）沿着小路走；底部的胶囊按钮可以直接跳到任意章节。
- **看照片**：点一下照片就会放大成一张拍立得。双指捏合或双击放大，左右滑切换，往下拉关闭。
- **右上角**：自动漫游、背景音乐、体感视差（手机上，转动手机画面会跟着动）、相册（所有照片的平铺总览）。
- **露天影院**：走到小路尽头，点「坐下来看电影」。可以关灯观影（天色变成星空），也可以全屏。
- 手机上按**返回**（安卓返回键、微信左上角、iPhone 边缘右滑）会先关掉当前打开的大图、相册或影院，不会直接退出页面。

## 换成你们自己的内容

所有要改的地方只有两处：`photos/` 文件夹，和 `src/data/memoirData.ts`。

### 1. 照片

1. 删掉 `photos/` 里的演示照片，按章节建文件夹。文件夹按名字排序就是章节顺序，建议加数字前缀：

   ```
   photos/
     01-相识/
     02-求婚/
     03-婚礼当天/
     04-蜜月旅行/
   ```

2. 运行 `npm run photos`。它会生成高清图、缩略图、3D 场景用的图集和照片清单，花园里会自动长出对应的章节和照片架。
   - 只处理新增或改动过的照片；加 `-- --force` 全部重新生成；
   - 加 `-- --sort=date` 让每个章节内按拍摄时间排序（默认按文件名）。
3. 支持 JPG / PNG / WebP / AVIF / TIFF / GIF。
   **iPhone 的 HEIC 格式读不了**，请先导出为 JPG（或在 iPhone「设置 › 相机 › 格式」里选「兼容性最佳」再拍）。
4. 照片多也没关系：3D 场景只加载镜头附近的照片，相册只渲染屏幕里看得见的那几行。

### 2. 文字：名字、章节标题、照片小故事

都在 `src/data/memoirData.ts`，文件里每一项都有注释：

- `couple`：新人名字、纪念日、迎宾页的标题和欢迎语；
- `chapters`：键是 `photos/` 下的文件夹名，可以设置标题、一句话副标题、配色
  （`blush` 蜜桃粉、`pearl` 珍珠香槟、`party` 彩虹派对、`ocean` 海盐蓝、`meadow` 青草绿、`candy` 糖果紫）。
  不写也行：标题默认取文件夹名（去掉数字前缀），配色轮流分配；
- `notes`：给特别想讲的照片写标题、小故事和地点，键是 `文件夹名/文件名`（不带扩展名），例如 `'02-求婚/IMG_0123'`。

### 3. 视频

1. 把视频放到 `public/memoir/video/`，再在 `memoirData.ts` 的 `videos` 里登记，第一段是银幕默认播放的片子。
2. 每段配一张同比例的 JPG 封面（`posterUrl`），视频加载出来之前显示它。
3. 建议格式：**MP4（H.264 + AAC），720p，码率 2~4 Mbps**。iPhone、安卓和微信里都能直接在页面内播放，也省客人的流量。
   用 [ffmpeg](https://ffmpeg.org/) 转码和截封面：

   ```bash
   ffmpeg -i 原片.mov -vf "scale=-2:720" -c:v libx264 -profile:v high -crf 23 -preset slow \
          -c:a aac -b:a 128k -movflags +faststart ceremony.mp4
   ffmpeg -ss 3 -i ceremony.mp4 -frames:v 1 -q:v 3 ceremony.jpg
   ```

### 4. 背景音乐

把 mp3 放到 `public/memoir/audio/`，修改 `memoirData.ts` 里 `music` 的 `url`、`title`、`artist`。
浏览器规定要先点一下页面才能出声，迎宾页的「开启回忆之旅」按钮就是这一下。

## 部署

```bash
npm run build
```

把生成的 `dist/` 整个文件夹上传到任意静态网站托管即可（GitHub Pages、Vercel、Netlify、腾讯云 COS、阿里云 OSS……），
放在子目录下也能用。拿到网址后生成一个二维码发给亲友，扫码就能看。

视频文件比较大，如果托管服务带宽有限，建议把 `public/memoir/video/` 放到 CDN 上，再把 `videos` 里的地址改成完整网址。

## 手机适配与性能

- **按设备分档**：根据是不是触屏、CPU 核心数和内存大致判断手机性能，草叶、花朵、花瓣的数量和照片图集的分辨率按档位取。
- **实时看帧率**：卡了先降画面清晰度，还卡再减少草叶和花瓣；流畅时再慢慢升回去。
- **省电**：120Hz 高刷屏上限制在 60 帧左右；看大图或相册把画面完全盖住时暂停 3D 渲染；切到后台自动停止，视频和音乐也会暂停。
- **不卡顿**：所有着色器在加载页一次编译完，逛到影院这些新地方时不会突然卡一下；照片解码放在后台线程，每帧最多上传一张图集到显卡。
- **手机上不用实时背景模糊**（这个效果在 3D 画面上很耗电），面板换成实色；电脑上才开磨砂玻璃。
- **横屏也好看**：横着拿手机时，镜头会站近一点，照片更大；导航、看大图、相册、影院控制条都会收紧，把高度让给画面。
- 适配刘海屏安全区；禁止页面被误捏放大（看大图的缩放不受影响）。
- **跑不了 3D 也能看**：不支持 WebGL2 的旧手机或浏览器（或显卡被浏览器禁用、3D 中途出错），会自动换成平面版：
  一张晴空草地的页面，相册、看大图、露天影院都照常可用。在网址后面加 `?flat` 可以在任何设备上预览平面版。

## 目录结构

```
photos/                    原始照片（每个子文件夹是一个章节）
public/memoir/             生成的照片素材，以及视频、音乐
scripts/build-photos.mjs   照片处理流水线（npm run photos）
scripts/fetch-demo.mjs     演示素材下载（npm run demo:fetch）
src/data/memoirData.ts     ← 你们要改的配置都在这里
src/components/three/      3D 花园
src/components/ui/         界面与各个浮层
src/three/                 花园布局、镜头轨道、材质、图集加载
```

## 进阶

- 照片特别多（上千张）、又想进一步省显存时，可以把图集换成 KTX2（Basis Universal）压缩纹理，
  显存占用能降到原来的四分之一左右。需要额外的转码工具链，大多数情况下用不到。

## 参考与致谢

- 性能思路参考了 three.js、react-three-fiber、drei 的官方文档与性能建议（实例化渲染、贴图复用与释放、自适应画布像素比），
  以及 three.js 论坛上关于「多段视频 + 背景音乐时用原生 `<video>` 驱动视频纹理」的讨论；
  iOS 页面内自动播放的条件（`muted` + `playsinline`）参考 Apple WebKit 的文档。
- 演示照片来自 [Unsplash](https://unsplash.com)（Unsplash License）与 [Lorem Picsum](https://picsum.photos)；
  演示视频来自 [Mixkit](https://mixkit.co)（Mixkit Free License）；
  背景音乐 "Carefree" — Kevin MacLeod ([incompetech.com](https://incompetech.com))，
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授权，使用时需要保留署名。
- 字体：[站酷快乐体](https://fonts.google.com/specimen/ZCOOL+KuaiLe)、[Fredoka](https://fonts.google.com/specimen/Fredoka)（均为 SIL Open Font License）。
