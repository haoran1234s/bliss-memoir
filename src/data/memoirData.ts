/**
 * ============================================================
 *  幸福回忆录 · Bliss Memoir —— 你们的专属配置
 * ============================================================
 *
 *  照片不用在这里一张张登记：
 *    1. 把照片按章节放进  photos/<章节文件夹>/
 *    2. 运行  npm run photos
 *  花园里就会自动长出对应的章节和照片架（几百张也没问题）。
 *
 *  这个文件只负责「文字和影音」：
 *    - couple    新人姓名、纪念日、迎宾文案
 *    - chapters  给每个章节文件夹起标题、配一句话、选配色（可不填）
 *    - notes     给特别想讲的照片写一段小故事（可不填）
 *    - videos    露天影院里放的视频
 *    - music     背景音乐
 *
 *  详细步骤见 README。
 */
import type { ChapterMeta, CoupleInfo, MemoirVideo, MusicInfo, PhotoNote } from '../types';

/* ------------------------------------------------------------------ */
/*  一、新人信息与迎宾文案                                              */
/* ------------------------------------------------------------------ */
export const couple: CoupleInfo = {
  groomName: '沐深',
  brideName: '苏念',
  connector: '♥',
  date: '2024.10.20',
  welcomeTitle: '欢迎来到我们的花园派对',
  welcomeText: '气球已经升起，照片挂满了整片草地。\n沿着小路慢慢走，把我们的故事从头看一遍吧。',
  enterLabel: '开启回忆之旅',
  farewell: '谢谢你，来看我们的故事',
};

/* ------------------------------------------------------------------ */
/*  二、章节                                                            */
/* ------------------------------------------------------------------ */
// 键 = photos/ 下的文件夹名。没写在这里的文件夹也会正常显示：
// 标题默认取文件夹名（自动去掉前面的数字序号），配色按顺序轮流分配。
// palette 可选：blush 蜜桃粉 | pearl 珍珠香槟 | party 彩虹派对 | ocean 海盐蓝 | meadow 青草绿 | candy 糖果紫
export const chapters: Record<string, ChapterMeta> = {
  '01-婚礼当天': {
    title: '婚礼当天',
    subtitle: '所有爱我们的人，都来了',
    palette: 'party',
    // 按色温、横竖比例与故事节奏打散排列：避免晨袍集中在前排，保持瀑布流视觉平衡
    order: [
      'ZXF_5764', 'ZXF_5794', 'ZXF_5330', 'ZXF_5123',
      'ZXF_5425', 'ZXF_5654', 'ZXF_5833', 'ZXF_5234',
      'ZXF_5592', 'ZXF_5446', 'ZXF_5154', 'ZXF_5918',
      'ZXF_5909', 'ZXF_5389', 'ZXF_5756', 'ZXF_5665',
      'ZXF_5189', 'ZXF_5481', 'ZXF_5919', 'ZXF_5347',
      'ZXF_5124', 'ZXF_5398', 'ZXF_5880', 'ZXF_5613',
      'ZXF_5559', 'ZXF_5178', 'ZXF_5897', 'ZXF_5631',
      'ZXF_5473', 'ZXF_5768', 'ZXF_5983', 'ZXF_5217',
      'ZXF_5724', 'ZXF_5458', 'ZXF_5373', 'ZXF_5134',
      'ZXF_5703', 'ZXF_5867', 'ZXF_5212', 'ZXF_5992',
      'ZXF_5609', 'ZXF_5336', 'ZXF_5130', 'ZXF_5960',
    ],
  },
  '02-婚纱照': {
    title: '婚纱照',
    subtitle: '白纱很美，但你看我的眼神更美',
    palette: 'pearl',
  },
};

/* ------------------------------------------------------------------ */
/*  三、照片小故事（可选）                                              */
/* ------------------------------------------------------------------ */
// 键 = '文件夹名/文件名（不带扩展名）'。点开这张照片时会显示标题和故事。
export const notes: Record<string, PhotoNote> = {
  '01-求婚/001': {
    title: '答应啦',
    story: '你跳到我背上的那一刻，我就知道，这辈子都得背着你了。',
    place: '城郊 · 小树林',
  },
  '01-求婚/002': {
    title: '骑到日落',
    story: '说好只骑一小段，结果我们一路骑到了天黑。',
  },
  '01-求婚/003': {
    title: '海边的篝火',
    story: '火光很暖，你靠过来的时候更暖。',
    place: '海边露营地',
  },
  '01-求婚/006': {
    title: '把太阳装进心里',
    story: '你说要比一个最大的心，于是我们把整颗落日都框了进去。',
  },
  '01-求婚/007': {
    title: '沙滩上的小秘密',
    story: '灯串是我偷偷摆的，摆歪了三次，你假装没看见。',
  },
  '01-求婚/016': {
    title: '戴上了就不许摘',
    story: '戒指有点紧，你说刚刚好，这样就跑不掉了。',
  },
};

/* ------------------------------------------------------------------ */
/*  四、露天影院的视频                                                  */
/* ------------------------------------------------------------------ */
// 把 MP4（H.264 + AAC）放到 public/memoir/video/ 下，再在这里登记即可。
// 第一段会作为大屏默认播放的片子。posterUrl 是视频加载出来之前显示的封面。
export const videos: MemoirVideo[] = [
  {
    id: 'preview',
    title: '预告',
    subtitle: '',
    videoUrl: 'memoir/video/preview.mp4',
    posterUrl: 'memoir/video/preview.jpg',
  },
  {
    id: 'pickup',
    title: '接亲',
    subtitle: '',
    videoUrl: 'memoir/video/pickup.mp4',
    posterUrl: 'memoir/video/pickup.jpg',
  },
  {
    id: 'ceremony',
    title: '典礼',
    subtitle: '',
    videoUrl: 'memoir/video/ceremony.mp4',
    posterUrl: 'memoir/video/ceremony.jpg',
  },
];

/* ------------------------------------------------------------------ */
/*  五、背景音乐                                                        */
/* ------------------------------------------------------------------ */
// 演示曲目："Carefree" — Kevin MacLeod (incompetech.com)，CC BY 4.0 授权，使用需署名。
// 换成自己的音乐：把 mp3 放到 public/memoir/audio/ 下并修改 url。
export const music: MusicInfo = {
  url: 'memoir/audio/bgm.mp3',
  title: 'Carefree',
  artist: 'Kevin MacLeod',
};
