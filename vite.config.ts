import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 使用相对基础路径，方便直接部署到任意静态托管 / 子目录（手机扫码即开）
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true, // 允许局域网内用手机访问 http://<你的电脑IP>:5173 真机调试
    port: 5173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // 把体积较大的三方库拆分，利于移动端增量加载与缓存
        // maath 被 drei 依赖，必须与 r3f 同组，否则产生循环分包警告
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', 'maath'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
