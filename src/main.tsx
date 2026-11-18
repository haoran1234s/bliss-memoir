/**
 * 应用入口
 * ------------------------------------------------------------
 * 使用系统级无衬线字体与等宽数字，零外部字体网络依赖。
 */
import { createRoot } from 'react-dom/client';
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
