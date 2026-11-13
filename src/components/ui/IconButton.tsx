/**
 * 圆形图标按钮（顶栏、影院控制条等处通用）
 */
import type { ReactNode } from 'react';

interface Props {
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** 开关处于「开」的状态：填充当前章节的强调色 */
  active?: boolean;
  /** 夜晚（关灯观影）配色 */
  night?: boolean;
  disabled?: boolean;
  className?: string;
}

export function IconButton({ label, onClick, children, active, night, disabled, className = '' }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90 disabled:opacity-45 ${
        night ? 'glass-night' : 'glass'
      } ${className}`}
      style={active ? { background: 'var(--accent)', color: '#fff' } : undefined}
    >
      {children}
    </button>
  );
}
