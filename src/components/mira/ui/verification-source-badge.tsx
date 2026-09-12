'use client';

/**
 * VerificationSourceBadge — renders the credit-check provenance label.
 *
 * The credit-check API returns one of four `verificationSource` values that
 * the UI must never blur:
 *
 *   - 'attestcoin'       : real runCreditCheck — factors proven via the
 *                          BlockProver precompile. (emerald, ShieldCheck)
 *   - 'preset-verified'  : the known verified demo wallet — real data from
 *                          a prior credit-check run, cached. (emerald, ShieldCheck)
 *   - 'synthetic'        : a preset demo profile or hash-derived synthetic
 *                          vector. (amber, FlaskConical)
 *   - 'fallback'         : real verification was attempted but failed/timed
 *                          out, so synthetic data stood in. (amber, AlertTriangle)
 *
 * Older responses omit the field — treated as 'synthetic'.
 */

import { ShieldCheck, FlaskConical, AlertTriangle, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreditCheckResponse } from '@mira/shared';

type Source = NonNullable<CreditCheckResponse['verificationSource']>;

interface Props {
  source?: Source;
  demoMode?: boolean;
  scannedTxCount?: number;
  verifiedTxCount?: number;
  className?: string;
}

const STYLES: Record<
  Source,
  { border: string; bg: string; text: string; icon: typeof ShieldCheck; label: string }
> = {
  attestcoin: {
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/[0.08]',
    text: 'text-emerald-600',
    icon: ShieldCheck,
    label: 'Attestcoin-verified',
  },
  'preset-verified': {
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/[0.08]',
    text: 'text-emerald-600',
    icon: Database,
    label: 'Verified data (cached)',
  },
  synthetic: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/[0.08]',
    text: 'text-amber-600',
    icon: FlaskConical,
    label: 'Demo-mode data',
  },
  fallback: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/[0.08]',
    text: 'text-amber-600',
    icon: AlertTriangle,
    label: 'Demo data (verification unavailable)',
  },
};

export function VerificationSourceBadge({
  source,
  demoMode,
  scannedTxCount,
  verifiedTxCount,
  className,
}: Props) {
  // Treat omitted source as 'synthetic' (the historical behavior).
  const resolved: Source = source ?? (demoMode ? 'synthetic' : 'attestcoin');
  const style = STYLES[resolved];
  const Icon = style.icon;

  // For real-verified results with counts, enrich the label: "5/5 txs verified".
  const detail =
    resolved === 'attestcoin' &&
    typeof verifiedTxCount === 'number' &&
    typeof scannedTxCount === 'number'
      ? ` · ${verifiedTxCount}/${scannedTxCount} txs`
      : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
        style.border,
        style.bg,
        style.text,
        className,
      )}
      title={`Verification source: ${resolved}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {style.label}
      {detail}
    </span>
  );
}
