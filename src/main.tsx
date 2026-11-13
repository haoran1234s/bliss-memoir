/**
 * 应用入口
 * ------------------------------------------------------------
 * 字体随项目一起打包（不依赖任何在线字体服务，断网 / 内网也能正常显示）：
 *   - 标题与正文使用系统级高定人文衬线（Songti SC / Noto Serif SC）与无衬线体；
 *   - Fredoka：英文 / 等宽感数字字体。
 *
 * 这里没有用 React.StrictMode：3D 场景里的显存资源（贴图、几何体）在组件卸载时释放，
 * StrictMode 在开发环境会故意把组件「挂载 → 卸载 → 再挂载」一遍，白白重建整套 3D 显存资源。
 */
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fredoka/wght.css';
import './index.css';
import App from './App';

// iOS Safari 不理会 viewport 里的 user-scalable=no：手动拦下页面级的双指缩放，
// 否则在按钮或文字上捏一下，整个页面就被放大了（看大图的缩放是自己实现的，不受影响）
const stopPageZoom = (e: Event) => e.preventDefault();
document.addEventListener('gesturestart', stopPageZoom, { passive: false });
document.addEventListener('gesturechange', stopPageZoom, { passive: false });

const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root 挂载节点');

createRoot(container).render(<App />);
