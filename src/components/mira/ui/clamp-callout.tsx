'use client';

/**
 * Amount-clamp callout.
 *
 * Shown on the decision and loan-originated screens when MIRA approved less
 * than the borrower asked for. The reduction comes from one of two places:
 *   1. The LLM returned `approve_reduced` (its own underwriting judgement).
 *   2. The on-chain Policy contract's effective borrower cap (the minimum of
 *      the agent tier cap and the borrower tier cap) is below the LLM's
 *      approved amount, so the route clamps before originating.
 *
 * Rendered as an amber info alert (NOT an error) — the loan still originated,
 * the borrower just got less than they asked for. Repaying this smaller loan
 * lifts the borrower's reputation and unlocks higher amounts next time.
 */

import { TrendingDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatUsd } from '@/lib/mira/format';

export function ClampCallout({
  requestedAmount,
  approvedAmount,
  effectiveCap,
  agentScore,
}: {
  requestedAmount: number;
  approvedAmount: number;
  /** On-chain borrower tier cap (USD), if known. */
  effectiveCap?: number;
  /** Agent reputation score at decision time, if known. */
  agentScore?: number;
}) {
  if (!Number.isFinite(requestedAmount) || !Number.isFinite(approvedAmount)) return null;
  if (approvedAmount >= requestedAmount) return null;

  const capHint =
    effectiveCap !== undefined && Number.isFinite(effectiveCap)
      ? ` — limited by your tier cap (${effectiveCap >= approvedAmount ? '$' + effectiveCap : 'see Policy contract'})`
      : '';
  const scoreHint = agentScore !== undefined && Number.isFinite(agentScore)
    ? `score ${agentScore} → ${formatUsd(approvedAmount)}`
    : `approved ${formatUsd(approvedAmount)}`;

  return (
    <Alert className="border-amber-500/40 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300">
      <TrendingDown className="text-amber-600" />
      <AlertTitle className="text-amber-700 dark:text-amber-300">
        Approved for less than you requested
      </AlertTitle>
      <AlertDescription className="text-amber-700/90 dark:text-amber-300/90">
        You requested <span className="font-mono font-medium">{formatUsd(requestedAmount)}</span>.
        MIRA approved <span className="font-mono font-medium">{formatUsd(approvedAmount)}</span>
        {capHint}. {scoreHint}. Repay this loan to unlock higher amounts.
      </AlertDescription>
    </Alert>
  );
}
