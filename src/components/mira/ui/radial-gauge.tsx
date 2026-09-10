'use client';

/**
 * Radial gauge — a circular progress ring with a centered value.
 *
 * Used on the agent reputation dashboard to give the score geometric
 * context (a number out of a maximum) rather than presenting it as bare
 * text. The ring fills clockwise from 12 o'clock; the arc color shifts with
 * the score band so the visual matches the textual verdict.
 */

import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface RadialGaugeProps {
  /** Current value. */
  value: number;
  /** Maximum value (the ring fills proportionally to value/max). */
  max: number;
  /** Center label, rendered large. */
  label: number | string;
  /** Small caption under the label. */
  caption?: string;
  /** Diameter in pixels. */
  size?: number;
  /** Stroke width in pixels. */
  stroke?: number;
  /** Optional className for the outer wrapper. */
  className?: string;
}

const BANDS: Array<{ upto: number; stroke: string; text: string }> = [
  { upto: 0.4, stroke: '#B23A3A', text: 'text-destructive' }, // red
  { upto: 0.7, stroke: '#C96B12', text: 'text-amber-600' }, // amber
  { upto: 1.01, stroke: '#10b981', text: 'text-emerald-600' }, // emerald
];

export function RadialGauge({
  value,
  max,
  label,
  caption,
  size = 140,
  stroke = 10,
  className,
}: RadialGaugeProps) {
  const prefersReduced = useReducedMotion();
  const ratio = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const band = BANDS.find((b) => ratio < b.upto) ?? BANDS[BANDS.length - 1];

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // The arc starts at 12 o'clock (rotate -90deg) and fills clockwise.
  const dash = circumference * ratio;
  const gap = circumference - dash;
  const center = size / 2;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} out of ${max}${caption ? `, ${caption}` : ''}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/40"
        />
        {/* Filled arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={band.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          initial={prefersReduced ? false : { strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${dash} ${gap}` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-mono text-2xl font-bold tracking-tight', band.text)}>
          {label}
        </span>
        {caption && (
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A thin repayment-rate ring — the fraction of cumulative loans that were
 * repaid. Smaller than the score gauge; used as a secondary health indicator
 * on the dashboard.
 */
export function RepaymentRateRing({
  repaid,
  total,
  size = 56,
  stroke = 6,
}: {
  repaid: number;
  total: number;
  size?: number;
  stroke?: number;
}) {
  const prefersReduced = useReducedMotion();
  const ratio = total > 0 ? repaid / total : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const gap = circumference - dash;
  const center = size / 2;
  const pct = Math.round(ratio * 100);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Repayment rate ${pct}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/40"
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#10b981"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          initial={prefersReduced ? false : { strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${dash} ${gap}` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute font-mono text-[10px] font-semibold text-emerald-600">
        {pct}%
      </span>
    </div>
  );
}
