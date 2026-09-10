'use client';

/**
 * Agent Reputation Dashboard.
 *
 * The public page showing MIRA&apos;s on-chain track record: cumulative loans,
 * repaid, defaulted, the current score, and a recent-loans feed. This is the
 * &quot;the agent&apos;s reputation is on-chain and portable&quot; story — anyone can
 * audit MIRA&apos;s decision history by reading the AgentReputation contract.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Award,
  Activity,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { RadialGauge, RepaymentRateRing } from '@/components/mira/ui/radial-gauge';
import { Sparkline } from '@/components/mira/ui/sparkline';
import { useMiraStore } from '@/lib/mira/store-client';
import { cc3TxUrl, cc3BlockUrl } from '@/lib/mira/explorer';
import type { LoanStatus } from '@mira/shared';

const SCORE_MAX = 1000;

export function AgentReputationDashboard() {
  const { reputation, reputationLoading, loadReputation, setView, resetFlow } = useMiraStore();
  const [activitySeries, setActivitySeries] = useState<number[]>([]);

  useEffect(() => {
    void loadReputation();
  }, [loadReputation]);

  // Fetch the loan-activity sparkline series from the agent reputation
  // endpoint's recent-loans window — computed server-side so the chart
  // matches the table below it.
  useEffect(() => {
    let active = true;
    fetch('/api/agent/reputation', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!active || !data?.recentLoans) return;
        // Reconstruct a cumulative series from the recent-loans block heights.
        const loans = [...data.recentLoans].sort(
          (a: { originatedBlock: number }, b: { originatedBlock: number }) =>
            a.originatedBlock - b.originatedBlock,
        );
        if (loans.length === 0) {
          setActivitySeries([0]);
          return;
        }
        const min = loans[0].originatedBlock;
        const max = loans[loans.length - 1].originatedBlock;
        const span = Math.max(1, max - min);
        const buckets = 12;
        const size = span / buckets;
        const series = new Array(buckets).fill(0);
        for (const l of loans) {
          const idx = Math.min(buckets - 1, Math.floor((l.originatedBlock - min) / size));
          series[idx] += 1;
        }
        for (let i = 1; i < series.length; i++) series[i] += series[i - 1];
        if (active) setActivitySeries(series);
      })
      .catch(() => {
        if (active) setActivitySeries([0]);
      });
    return () => {
      active = false;
    };
  }, [reputation?.lastUpdatedBlock]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge
              variant="outline"
              className="mb-3 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600"
            >
              On-chain reputation
            </Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              MIRA&apos;s track record
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Every loan MIRA originates, every repayment it verifies, and every default it records
              updates an on-chain ledger the agent cannot tamper with.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadReputation()}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${reputationLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </motion.div>

      {reputationLoading && !reputation ? (
        <DashboardSkeleton />
      ) : reputation ? (
        <>
          {/* Score hero + repayment-rate ring */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.06] to-transparent">
              <CardContent className="flex items-center gap-5 p-5 sm:p-6">
                <RadialGauge
                  value={reputation.currentScore}
                  max={SCORE_MAX}
                  label={reputation.currentScore}
                  caption={`/ ${SCORE_MAX}`}
                  size={128}
                  stroke={11}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold">Reputation score</span>
                    <VerifiedBadge className="ml-auto" label="Live" />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {scoreVerdict(reputation.currentScore, SCORE_MAX)}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Activity className="h-3 w-3" />
                    Updated at block #{reputation.lastUpdatedBlock.toLocaleString()}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-5 p-5 sm:p-6">
                <RepaymentRateRing
                  repaid={reputation.cumulativeRepaid}
                  total={reputation.cumulativeLoans}
                  size={84}
                  stroke={8}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold">Repayment rate</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {reputation.cumulativeRepaid} of {reputation.cumulativeLoans} loans repaid in
                    full.
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {reputation.cumulativeRepaid} repaid
                    </span>
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      {reputation.cumulativeDefaulted} defaulted
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cumulative activity sparkline + counts */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Card className="sm:col-span-1">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Loan activity</span>
                  <VerifiedBadge label="On-chain" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-2xl font-semibold">
                      {reputation.cumulativeLoans}
                    </div>
                    <div className="text-xs text-muted-foreground">cumulative</div>
                  </div>
                  <Sparkline data={activitySeries} width={120} height={36} />
                </div>
              </CardContent>
            </Card>

            <StatCard
              icon={Activity}
              label="Total originated"
              value={reputation.cumulativeLoans}
              href={cc3BlockUrl(reputation.lastUpdatedBlock)}
            />
            <StatCard
              icon={TrendingDown}
              label="Defaulted"
              value={reputation.cumulativeDefaulted}
              accent="red"
            />
          </div>

          {/* Recent loans */}
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent loans</CardTitle>
                <Badge variant="secondary" className="font-mono">
                  {reputation.recentLoans.length} shown
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {reputation.recentLoans.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No loans yet. Be the first.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto pr-1">
                  {/* Desktop: full table */}
                  <table className="hidden w-full text-sm sm:table">
                    <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2 pr-3 font-medium">Loan</th>
                        <th className="pb-2 pr-3 font-medium">Borrower</th>
                        <th className="pb-2 pr-3 text-right font-medium">Amount</th>
                        <th className="pb-2 pr-3 text-right font-medium">Rate</th>
                        <th className="pb-2 pr-3 font-medium">Status</th>
                        <th className="pb-2 font-medium">Block</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {reputation.recentLoans.map((loan) => (
                        <tr key={loan.loanId} className="text-xs">
                          <td className="py-2.5 pr-3">
                            <TxHash hash={loan.loanId} href={cc3TxUrl(loan.loanId)} copyable={false} />
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground">
                            {loan.borrowerLabel ?? loan.borrower.slice(0, 8) + '…'}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono">${loan.amount}</td>
                          <td className="py-2.5 pr-3 text-right font-mono">
                            {loan.rate.toFixed(1)}%
                          </td>
                          <td className="py-2.5 pr-3">
                            <StatusBadge status={loan.status} />
                          </td>
                          <td className="py-2.5 font-mono text-muted-foreground">
                            #{loan.originatedBlock.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Mobile: stacked cards */}
                  <ul className="space-y-2 sm:hidden">
                    {reputation.recentLoans.map((loan) => (
                      <li
                        key={loan.loanId}
                        className="rounded-lg border border-border/60 bg-muted/20 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <TxHash
                            hash={loan.loanId}
                            href={cc3TxUrl(loan.loanId)}
                            copyable={false}
                          />
                          <StatusBadge status={loan.status} />
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-muted-foreground">Borrower</div>
                            <div className="truncate font-medium">
                              {loan.borrowerLabel ?? loan.borrower.slice(0, 8) + '…'}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Amount</div>
                            <div className="font-mono font-medium">${loan.amount}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Rate</div>
                            <div className="font-mono font-medium">{loan.rate.toFixed(1)}%</div>
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] font-mono text-muted-foreground">
                          Block #{loan.originatedBlock.toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setView('landing')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to home
            </Button>
            <Button onClick={resetFlow}>
              Start a new application
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Could not load reputation. Try refreshing.
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  accent?: 'emerald' | 'red';
  href?: string;
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'red' && value > 0
        ? 'text-destructive'
        : 'text-foreground';
  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <CardTitle className={`mt-3 font-mono text-2xl ${color}`}>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium">{label}</p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            View block
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A short textual verdict for the score band, shown next to the radial gauge
 * so the number has qualitative context (not just a fill ratio).
 */
function scoreVerdict(score: number, max: number): string {
  const ratio = score / max;
  if (ratio >= 0.75) return 'Excellent — the agent has built a strong, reliable track record.';
  if (ratio >= 0.5) return 'Solid — the agent is dependable with room to grow.';
  if (ratio >= 0.3) return 'Developing — early history; repayments will lift this over time.';
  return 'Limited — insufficient history to support larger loans yet.';
}

function StatusBadge({ status }: { status: LoanStatus }) {
  // Solid fills for stronger contrast than the outline variant — a status
  // badge should read as a state signal, not a label.
  const map: Record<LoanStatus, string> = {
    Pending: 'bg-muted text-muted-foreground border-border',
    Originated: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    Repaid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    Defaulted: 'bg-destructive/15 text-destructive border-destructive/30',
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${map[status]}`}>
      {status}
    </Badge>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="mt-3 h-8 w-16" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
