/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // 矮屏：横着拿的手机。界面收紧，把高度让给 3D 画面
        short: { raw: '(max-height: 520px)' },
      },
      colors: {
        // —— 春日花园派对 调色板 ——
        ink: '#3a3355', // 梅子墨（正文）
        'ink-soft': '#6f6890', // 次级文字
        paper: '#fffbf4', // 奶油纸白
        coral: '#ff7e8a', // 珊瑚粉（主色）
        'coral-deep': '#f25c74',
        peach: '#ffb088', // 蜜桃
        butter: '#ffd76a', // 黄油黄
        mint: '#7fdcc0', // 薄荷
        sky: '#6cc4f5', // 晴空蓝
        lilac: '#b9a2ff', // 丁香紫
        grass: '#7fcb5e', // 草地绿
      },
      fontFamily: {
        // 人文衬线字体：高定画廊标题、章节与手记
        serif: [
          '"Songti SC"',
          '"Noto Serif SC"',
          '"STSong"',
          '"Source Han Serif SC"',
          '"Playfair Display"',
          '"Times New Roman"',
          'serif',
        ],
        fun: [
          '"Songti SC"',
          '"Noto Serif SC"',
          '"STSong"',
          '"Source Han Serif SC"',
          '"Playfair Display"',
          '"Times New Roman"',
          'serif',
        ],
        // 编号与刻度：等宽数字与几何无衬线
        display: ['"Fredoka Variable"', '"PingFang SC"', '"HarmonyOS Sans SC"', 'system-ui', 'sans-serif'],
        sans: [
          '"Fredoka Variable"',
          '"PingFang SC"',
          '"HarmonyOS Sans SC"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 10px 30px -8px rgba(58, 51, 85, 0.18)',
        pop: '0 14px 34px -10px rgba(242, 92, 116, 0.55)',
        print: '0 18px 50px -12px rgba(58, 51, 85, 0.35)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-14px) rotate(2deg)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-4deg)' },
          '50%': { transform: 'rotate(4deg)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        float: 'float 4.5s ease-in-out infinite',
        wiggle: 'wiggle 2.4s ease-in-out infinite',
        'pop-in': 'pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
