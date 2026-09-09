/**
 * The "Attestcoin-verified" badge.
 *
 * Used to mark every number MIRA displays that was backed by an on-chain
 * proof. Per the design spec, the verified badge is the single most
 * repeated visual element in the app — it is what makes the data feel
 * trustworthy at a glance.
 */

import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function VerifiedBadge({
  className,
  label = 'Attestcoin-verified',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600',
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
