'use client';

/**
 * Area chart — a larger inline time-series chart with a gradient fill,
 * baseline grid, and a hover tooltip showing the value at each point.
 *
 * Used on the reputation dashboard to surface the loan-activity trend as a
 * real chart (not just a sparkline) so the page reads as analytics. Pure
 * SVG — no chart library dependency — so it scales crisply and stays light.
 */

import { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface AreaChartPoint {
  /** Bucket label (e.g. "Day 1", or a block-height bracket). */
  label: string;
  /** Cumulative value at this point. */
  value: number;
}

export function AreaChart({
  data,
  height = 180,
  className,
  stroke = '#10b981',
  ariaLabel,
}: {
  data: AreaChartPoint[];
  height?: number;
  className?: string;
  stroke?: string;
  ariaLabel: string;
}) {
  const prefersReduced = useReducedMotion();
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Layout constants. Width is responsive (viewBox scales to container).
  const width = 600;
  const padX = 8;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  if (!data.length) {
    return (
      <div
        className={cn('flex items-center justify-center text-xs text-muted-foreground', className)}
        style={{ height }}
      >
        No activity yet.
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  const points = data.map((d, i) => {
    const x = padX + (i / Math.max(1, data.length - 1)) * innerW;
    const y = padY + (1 - (d.value - min) / span) * innerH;
    return { x, y, ...d };
  });

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  const areaPath =
    `M ${points[0].x} ${padY + innerH} ` +
    points.map((p) => `L ${p.x} ${p.y}`).join(' ') +
    ` L ${points[points.length - 1].x} ${padY + innerH} Z`;

  return (
    <div className={cn('relative w-full', className)} style={{ minHeight: height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline grid lines (3 horizontal) */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={padX + innerW}
            y1={padY + t * innerH}
            y2={padY + t * innerH}
            stroke="currentColor"
            strokeWidth="1"
            className="text-border/40"
            strokeDasharray="3 4"
          />
        ))}

        {/* Area fill */}
        <motion.path
          d={areaPath}
          fill={`url(#${gradientId})`}
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* Line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={prefersReduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* Hover hit-areas + points */}
        {points.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - innerW / data.length / 2}
              y={0}
              width={innerW / data.length}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
            {hoverIdx === i && (
              <>
                <line
                  x1={p.x}
                  x2={p.x}
                  y1={padY}
                  y2={padY + innerH}
                  stroke={stroke}
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  opacity="0.5"
                />
                <circle cx={p.x} cy={p.y} r="4" fill={stroke} stroke="white" strokeWidth="1.5" />
              </>
            )}
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hoverIdx !== null && points[hoverIdx] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border/60 bg-popover px-2 py-1 text-xs shadow-md"
          style={{
            left: `${(points[hoverIdx].x / width) * 100}%`,
            top: `${(points[hoverIdx].y / height) * 100}%`,
          }}
        >
          <div className="font-mono font-semibold">{points[hoverIdx].value}</div>
          <div className="text-[10px] text-muted-foreground">{points[hoverIdx].label}</div>
        </div>
      )}

      {/* X-axis labels (first, middle, last) */}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
