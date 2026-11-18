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
  },
});
