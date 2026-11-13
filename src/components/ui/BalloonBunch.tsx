/**
 * 一束矢量气球（加载页的小装饰）
 */
import { useId } from 'react';

interface BalloonProps {
  cx: number;
  cy: number;
  r: number;
  color: string;
  id: string;
}

function Balloon({ cx, cy, r, color, id }: BalloonProps) {
  const ry = r * 1.16;
  return (
    <g>
      <defs>
        <radialGradient id={id} cx="0.34" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.28" stopColor={color} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      <path d={`M${cx - 5} ${cy + ry - 2} L${cx + 5} ${cy + ry - 2} L${cx} ${cy + ry + 8} Z`} fill={color} />
      <ellipse cx={cx} cy={cy} rx={r} ry={ry} fill={`url(#${id})`} />
      <ellipse
        cx={cx - r * 0.4}
        cy={cy - ry * 0.42}
        rx={r * 0.13}
        ry={r * 0.26}
        fill="#ffffff"
        opacity="0.7"
        transform={`rotate(28 ${cx - r * 0.4} ${cy - ry * 0.42})`}
      />
    </g>
  );
}

export function BalloonBunch({ className = '' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 200 250" className={className} aria-hidden="true">
      <g stroke="#ffffff" strokeOpacity="0.95" strokeWidth="1.8" fill="none" strokeLinecap="round">
        <path d="M58 118 Q 76 170 100 244" />
        <path d="M100 100 Q 94 170 100 244" />
        <path d="M144 122 Q 126 176 100 244" />
      </g>
      <Balloon cx={58} cy={66} r={37} color="#ff8fa3" id={`${uid}a`} />
      <Balloon cx={144} cy={70} r={37} color="#7ec8f8" id={`${uid}b`} />
      <Balloon cx={100} cy={48} r={40} color="#ffd166" id={`${uid}c`} />
    </svg>
  );
}
