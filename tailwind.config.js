/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // 瑞士国际主义无衬线字体体系 + 等宽数字
        display: ['Inter', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: [
          'Inter',
          '"PingFang SC"',
          '"HarmonyOS Sans SC"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [
    ({ addVariant }) => {
      // 矮屏（横屏手机）：收紧灯箱底部缩略图栏，把高度留给照片
      addVariant('short', '@media (max-height: 520px)');
    },
  ],
};
