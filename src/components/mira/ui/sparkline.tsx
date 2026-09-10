'use client';

/**
 * Sparkline — a tiny inline line chart for showing a trend without axes.
 *
 * Used on the reputation dashboard to turn the static "cumulative loans"
 * number into a small cumulative-growth trend, so the page reads as
 * analytics rather than a snapshot. Rendered as an inline SVG path so it
 * scales to any width and stays crisp.
 */

import { useId } from 'react';
import { cn } from '@/lib/utils';

export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
  stroke = '#10b981',
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Stroke color (CSS string). */
  stroke?: string;
  /** Fill the area under the line with a faint gradient. */
  fill?: boolean;
}) {
  const gradientId = useId();

  if (!data.length) {
    return <span className={cn('inline-block', className)} style={{ width, height }} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2; // vertical padding so the line never touches the edges

  const points = data.map((value, i) => {
    const x = (i / Math.max(1, data.length - 1)) * width;
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ');

  const areaPath =
    `M ${points[0][0]} ${height} ` +
    points.map(([x, y]) => `L ${x} ${y}`).join(' ') +
    ` L ${points[points.length - 1][0]} ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End-point dot for emphasis */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r="1.75"
          fill={stroke}
        />
      )}
    </svg>
  );
}
