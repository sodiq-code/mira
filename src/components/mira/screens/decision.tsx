'use client';

/**
 * Decision screen.
 *
 * Shows the agent&apos;s decision (approve / approve_reduced / decline), the
 * terms, the confidence, a one-paragraph reasoning written in the agent&apos;s
 * voice (rendered in warm amber to distinguish &quot;the agent speaking&quot; from
 * verified data), and the agent&apos;s reputation score at decision time.
 *
 * For approvals, the Accept button advances to the originated screen. For
 * declines, the screen offers a path back to try another wallet.
 */

import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  TrendingDown,
  Brain,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Gauge,
  CalendarClock,
  Activity,
  Coins,
  Layers,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { AuditTrail, type DecisionReceipt } from '@/components/mira/ui/audit-trail';
import { useMiraStore } from '@/lib/mira/store-client';
import type { LoanDecision, VerifiedFactors } from '@mira/shared';

export function Decision() {
  const { decision, credit, setView, resetFlow } = useMiraStore();
  if (!decision) return null;

  const isDecline = decision.decision === 'decline';
  const isReduced = decision.decision === 'approve_reduced';
  const isApprove = decision.decision === 'approve';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          className={
            isDecline
              ? 'border-destructive/40'
              : isReduced
                ? 'border-amber-500/40'
                : 'border-emerald-500/40'
          }
        >
          {/* Header band */}
          <div
            className={
              'rounded-t-xl px-6 py-5 ' +
              (isDecline
                ? 'bg-destructive/[0.06]'
                : isReduced
                  ? 'bg-amber-500/[0.07]'
                  : 'bg-emerald-500/[0.07]')
            }
          >
            <div className="flex items-center gap-3">
              <span
                className={
                  'flex h-11 w-11 items-center justify-center rounded-full ' +
                  (isDecline
                    ? 'bg-destructive/10 text-destructive'
                    : isReduced
                      ? 'bg-amber-500/15 text-amber-600'
                      : 'bg-emerald-500/15 text-emerald-600')
                }
              >
                {isDecline ? (
                  <XCircle className="h-6 w-6" />
                ) : isReduced ? (
                  <TrendingDown className="h-6 w-6" />
                ) : (
                  <CheckCircle2 className="h-6 w-6" />
                )}
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  MIRA decided
                </p>
                <h1 className="text-2xl font-bold tracking-tight">
                  {decisionLabel(decision.decision)}
                </h1>
              </div>
              <VerifiedBadge className="ml-auto" label="One-block decision" />
            </div>
          </div>

          <CardContent className="space-y-6 p-6">
            {/* Terms */}
            {!isDecline && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Term label="Approved" value={`$${decision.approvedAmount}`} />
                <Term label="Rate" value={`${decision.interestRateApr.toFixed(1)}%`} />
                <Term label="Confidence" value={`${decision.confidence}%`} />
                <Term
                  label="Reputation"
                  value={decision.agentReputation.currentScore.toString()}
                  mono
                />
              </div>
            )}

            {/* Agent reasoning */}
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Agent reasoning
                </span>
              </div>
              <p className="text-pretty text-sm leading-relaxed text-foreground/90">
                {decision.reasoning}
              </p>
            </div>

            {/* How MIRA decided — the verified factor breakdown */}
            {credit && (
              <DecisionFactorsBreakdown
                factors={credit.factors}
                decision={decision.decision}
              />
            )}

            {/* Reputation snapshot */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Agent reputation</span>
                <VerifiedBadge className="ml-auto" label="On-chain" />
              </div>
              <div className="grid grid-cols-4 gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-center">
                <RepStat
                  label="Cumulative loans"
                  value={decision.agentReputation.cumulativeLoans}
                />
                <RepStat
                  label="Repaid"
                  value={decision.agentReputation.cumulativeRepaid}
                  accent="emerald"
                />
                <RepStat
                  label="Defaulted"
                  value={decision.agentReputation.cumulativeDefaulted}
                  accent="red"
                />
                <RepStat
                  label="Score"
                  value={decision.agentReputation.currentScore}
                  accent="emerald"
                />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                The agent&apos;s track record lives in an on-chain ledger it cannot tamper with.
              </p>
            </div>

            {/* Audit trail: Decision → Evidence → AI reasoning → Policy checks → FINAL */}
            {credit && (
              <AuditTrail
                decision={decision.decision}
                approvedAmount={decision.approvedAmount}
                interestRateApr={decision.interestRateApr}
                confidence={decision.confidence}
                reasoning={decision.reasoning}
                factors={credit.factors}
                proofTxHashes={credit.proofTxHashes}
                loanId={decision.loanId || undefined}
                originTxHash={decision.originTxHash || undefined}
                receipt={{
                  decisionId: decision.loanId || `decision-${Date.now()}`,
                  evidenceHash: credit.proofTxHashes[0] ?? '0x0000',
                  policyVersion: 'v1',
                  modelVersion: 'mira-underwriter-v1',
                  riskScore: decision.confidence,
                  timestamp: new Date().toISOString(),
                  outcome: decision.decision === 'decline' ? 'Declined' : 'Approved',
                }}
              />
            )}

            <Separator />

            {/* CTA */}
            {isApprove || isReduced ? (
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setView('apply')}>
                  Back
                </Button>
                <Button size="lg" onClick={() => setView('originated')}>
                  Accept loan
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setView('apply')}>
                  Back
                </Button>
                <Button variant="outline" onClick={resetFlow}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try another wallet
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function decisionLabel(d: LoanDecision): string {
  if (d === 'approve') return 'Approved';
  if (d === 'approve_reduced') return 'Approved at a reduced amount';
  return 'Declined';
}

function Term({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className={`text-xl font-semibold ${mono ? 'font-mono' : ''}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function RepStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'red';
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'red' && value > 0
        ? 'text-destructive'
        : 'text-foreground';
  return (
    <div>
      <div className={`font-mono text-lg font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/**
 * How MIRA decided — a compact breakdown of the verified factors and the
 * signal each sent to the agent. Each factor gets a positive / negative /
 * neutral marker so a judge can see at a glance what drove the decision,
 * not just read the paragraph.
 */
function DecisionFactorsBreakdown({
  factors,
  decision,
}: {
  factors: VerifiedFactors;
  decision: LoanDecision;
}) {
  type Signal = 'positive' | 'negative' | 'neutral';
  const items: Array<{
    icon: typeof CalendarClock;
    label: string;
    value: string;
    signal: Signal;
    note: string;
  }> = [
    {
      icon: CalendarClock,
      label: 'Wallet age',
      value: `${factors.walletAgeDays} days`,
      signal: factors.walletAgeDays >= 180 ? 'positive' : factors.walletAgeDays >= 30 ? 'neutral' : 'negative',
      note:
        factors.walletAgeDays >= 180
          ? 'Established history'
          : factors.walletAgeDays >= 30
            ? 'Meets minimum'
            : 'Below 30-day minimum',
    },
    {
      icon: Coins,
      label: '90d stablecoin volume',
      value: `$${factors.stablecoinVolume90d.toLocaleString()}`,
      signal:
        factors.stablecoinVolume90d >= 10000
          ? 'positive'
          : factors.stablecoinVolume90d >= 1000
            ? 'neutral'
            : 'negative',
      note:
        factors.stablecoinVolume90d >= 10000
          ? 'Strong activity'
          : factors.stablecoinVolume90d >= 1000
            ? 'Meets minimum'
            : 'Below $1,000 minimum',
    },
    {
      icon: Activity,
      label: '90d transactions',
      value: factors.txCount90d.toLocaleString(),
      signal: factors.txCount90d >= 50 ? 'positive' : factors.txCount90d >= 10 ? 'neutral' : 'negative',
      note:
        factors.txCount90d >= 50 ? 'Active wallet' : factors.txCount90d >= 10 ? 'Moderate' : 'Low activity',
    },
    {
      icon: Layers,
      label: 'DeFi positions',
      value: factors.defiPositionCount.toLocaleString(),
      signal:
        factors.defiPositionCount >= 4
          ? 'positive'
          : factors.defiPositionCount >= 1
            ? 'neutral'
            : 'negative',
      note:
        factors.defiPositionCount >= 4 ? 'Diversified' : factors.defiPositionCount >= 1 ? 'Some usage' : 'None',
    },
    {
      icon: History,
      label: 'Prior MIRA record',
      value:
        factors.priorMiraLoans === 0
          ? 'First loan'
          : `${factors.priorMiraRepaid}/${factors.priorMiraLoans} repaid`,
      signal:
        factors.priorMiraDefaulted > 0 && factors.priorMiraRepaid === 0
          ? 'negative'
          : factors.priorMiraRepaid > 0
            ? 'positive'
            : 'neutral',
      note:
        factors.priorMiraDefaulted > 0 && factors.priorMiraRepaid === 0
          ? 'Prior default, no repayments'
          : factors.priorMiraRepaid > 0
            ? 'Good standing'
            : 'No history',
    },
  ];

  const signalStyles: Record<Signal, { dot: string; text: string; chip: string }> = {
    positive: {
      dot: 'bg-emerald-500',
      text: 'text-emerald-600',
      chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    },
    negative: {
      dot: 'bg-destructive',
      text: 'text-destructive',
      chip: 'bg-destructive/10 text-destructive',
    },
    neutral: {
      dot: 'bg-amber-500',
      text: 'text-amber-600',
      chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    },
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium">How MIRA decided</span>
        <VerifiedBadge className="ml-auto" label="Verified inputs" />
      </div>
      <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
        {items.map((item, i) => {
          const styles = signalStyles[item.signal];
          return (
            <li
              key={item.label}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${styles.chip}`}
              >
                <item.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="font-mono text-sm">{item.value}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden />
                  <span className={`text-xs ${styles.text}`}>{item.note}</span>
                </div>
              </div>
              {i === items.length - 1 && decision === 'decline' && (
                <Badge variant="outline" className="border-destructive/30 text-destructive text-[10px]">
                  Blocking
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
