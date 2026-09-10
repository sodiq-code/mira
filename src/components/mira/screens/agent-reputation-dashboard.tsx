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
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { RadialGauge, RepaymentRateRing } from '@/components/mira/ui/radial-gauge';
import { Sparkline } from '@/components/mira/ui/sparkline';
import { AreaChart, type AreaChartPoint } from '@/components/mira/ui/area-chart';
import { ReputationLoansTable } from '@/components/mira/ui/reputation-loans-table';
import { ExportMenu } from '@/components/mira/ui/export-menu';
import { useMiraStore } from '@/lib/mira/store-client';
import { cc3BlockUrl } from '@/lib/mira/explorer';

const SCORE_MAX = 1000;

interface ActivityResponse {
  series: Array<{ bucket: number; cumulative: number; delta: number }>;
  statusBreakdown: { originated: number; repaid: number; defaulted: number };
  window: { fromBlock: number; toBlock: number; buckets: number };
  fetchedAt: string;
}

export function AgentReputationDashboard() {
  const { reputation, reputationLoading, loadReputation, setView, resetFlow } = useMiraStore();
  const [activitySeries, setActivitySeries] = useState<number[]>([]);
  const [activityPoints, setActivityPoints] = useState<AreaChartPoint[]>([]);
  const [activityMeta, setActivityMeta] = useState<ActivityResponse | null>(null);

  useEffect(() => {
    void loadReputation();
  }, [loadReputation]);

  // Fetch the dedicated activity series + status breakdown from
  // /api/agent/activity so the chart spans the full loan history rather
  // than the recent-loans window the reputation endpoint returns.
  useEffect(() => {
    let active = true;
    fetch('/api/agent/activity', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: ActivityResponse) => {
        if (!active || !data?.series) return;
        const spark = data.series.map((p) => p.cumulative);
        const points: AreaChartPoint[] = data.series.map((p, i) => ({
          label: i === 0 ? 'Start' : i === data.series.length - 1 ? 'Now' : `Bucket ${i + 1}`,
          value: p.cumulative,
        }));
        setActivitySeries(spark);
        setActivityPoints(points);
        setActivityMeta(data);
      })
      .catch(() => {
        if (active) {
          setActivitySeries([0]);
          setActivityPoints([]);
        }
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
              {(reputation as any)?.onChain && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                  Live contract
                </span>
              )}
            </Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              MIRA&apos;s track record
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Every loan MIRA originates, every repayment it verifies, and every default it records
              updates an on-chain ledger the agent cannot tamper with.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {reputation && (
              <ExportMenu
                rows={reputation.recentLoans.map((l) => ({
                  loanId: l.loanId,
                  borrower: l.borrowerLabel ?? l.borrower,
                  amount: l.amount,
                  rate: l.rate,
                  term: l.term,
                  status: l.status,
                  originatedBlock: l.originatedBlock,
                  dueBlock: l.dueBlock,
                }))}
                data={{
                  agent: {
                    cumulativeLoans: reputation.cumulativeLoans,
                    cumulativeRepaid: reputation.cumulativeRepaid,
                    cumulativeDefaulted: reputation.cumulativeDefaulted,
                    currentScore: reputation.currentScore,
                    lastUpdatedBlock: reputation.lastUpdatedBlock,
                  },
                  activity: activityMeta,
                  loans: reputation.recentLoans,
                }}
                filenamePrefix="mira-reputation"
              />
            )}
            <Button variant="outline" size="sm" onClick={() => void loadReputation()}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${reputationLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
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

          {/* Capital authority + liquidity pool (on-chain) */}
          {(reputation as any).onChain && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Card className="border-emerald-500/30 bg-emerald-500/[0.02]">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">Capital authority</span>
                    <VerifiedBadge label="On-chain" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-emerald-600">
                    ${(((reputation as any).capitalAuthority ?? 0) / 100).toFixed(2)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Maximum loan the agent is trusted to originate, based on its reputation score.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    {(reputation as any).autoPaused ? (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        Auto-paused
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                        Active
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      Tier: score {reputation.currentScore} → {' '}
                      {reputation.currentScore >= 850 ? '$2,500' :
                       reputation.currentScore >= 750 ? '$500' :
                       reputation.currentScore >= 650 ? '$100' :
                       reputation.currentScore >= 500 ? '$25' : '$0'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {(reputation as any).liquidityPool && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold">Liquidity pool</span>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
                        ERC-20 custodian
                      </Badge>
                    </div>
                    <div className="font-mono text-2xl font-bold">
                      ${(((reputation as any).liquidityPool.available ?? 0) / 100).toLocaleString()}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Available capital backed by real ERC-20 token custody.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Deposits: ${(((reputation as any).liquidityPool.totalDeposits ?? 0) / 100).toLocaleString()}
                      </span>
                      <span>·</span>
                      <span>
                        Utilization: {Number((reputation as any).liquidityPool.utilization ?? 0) / 100}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

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

          {/* Activity trend — a real chart (not just a sparkline) */}
          <Card className="mt-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Activity trend</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cumulative loans originated over the agent&apos;s history.
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono">
                  {activityMeta ? `${activityMeta.window.buckets} buckets` : '…'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {activityPoints.length > 0 ? (
                <AreaChart
                  data={activityPoints}
                  ariaLabel="Cumulative loan activity over time"
                  height={200}
                />
              ) : (
                <Skeleton className="h-[200px] w-full" />
              )}
              {activityMeta && (
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/50 pt-4 text-center">
                  <TrendStat
                    label="Active"
                    value={activityMeta.statusBreakdown.originated}
                    tone="amber"
                  />
                  <TrendStat
                    label="Repaid"
                    value={activityMeta.statusBreakdown.repaid}
                    tone="emerald"
                  />
                  <TrendStat
                    label="Defaulted"
                    value={activityMeta.statusBreakdown.defaulted}
                    tone="red"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent loans — sortable + filterable table */}
          <ReputationLoansTable loans={reputation.recentLoans} />

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

/** A compact stat for the activity-trend breakdown row. */
function TrendStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'red';
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-600'
      : tone === 'red' && value > 0
        ? 'text-destructive'
        : tone === 'amber' && value > 0
          ? 'text-amber-600'
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
