'use client';

/**
 * Agent Reputation Dashboard.
 *
 * The public page showing MIRA&apos;s on-chain track record: cumulative loans,
 * repaid, defaulted, the current score, and a recent-loans feed. This is the
 * &quot;the agent&apos;s reputation is on-chain and portable&quot; story — anyone can
 * audit MIRA&apos;s decision history by reading the AgentReputation contract.
 */

import { useEffect } from 'react';
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
import { useMiraStore } from '@/lib/mira/store-client';
import { cc3TxUrl, cc3BlockUrl } from '@/lib/mira/explorer';
import type { LoanStatus } from '@mira/shared';

export function AgentReputationDashboard() {
  const { reputation, reputationLoading, loadReputation, setView, resetFlow } = useMiraStore();

  useEffect(() => {
    void loadReputation();
  }, [loadReputation]);

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
          {/* Score + headline stats */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-emerald-500/40 bg-emerald-500/[0.03] sm:col-span-2 lg:col-span-1">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Award className="h-5 w-5 text-emerald-600" />
                  <VerifiedBadge label="Live" />
                </div>
                <CardTitle className="mt-3 font-mono text-4xl tracking-tight">
                  {reputation.currentScore}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">Reputation score</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Updated at block #{reputation.lastUpdatedBlock.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <StatCard
              icon={Activity}
              label="Cumulative loans"
              value={reputation.cumulativeLoans}
              href={cc3BlockUrl(reputation.lastUpdatedBlock)}
            />
            <StatCard
              icon={TrendingUp}
              label="Repaid"
              value={reputation.cumulativeRepaid}
              accent="emerald"
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
                  <table className="w-full text-sm">
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
                            <TxHash hash={loan.loanId} href={cc3TxUrl(loan.loanId)} />
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
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 flex items-center justify-between">
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

function StatusBadge({ status }: { status: LoanStatus }) {
  const map: Record<LoanStatus, string> = {
    Pending: 'border-border text-muted-foreground',
    Originated: 'border-amber-500/40 text-amber-600',
    Repaid: 'border-emerald-500/40 text-emerald-600',
    Defaulted: 'border-destructive/40 text-destructive',
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${map[status]}`}>
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
