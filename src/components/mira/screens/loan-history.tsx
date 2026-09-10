'use client';

/**
 * Borrower loan history view.
 *
 * Shows every loan MIRA originated against the connected wallet — the
 * borrower-side counterpart to the public agent reputation dashboard. A
 * connected wallet can audit its own MIRA track record (amounts, rates,
 * statuses, due blocks, repayment / writability evidence) the same way the
 * public can audit the agent's.
 *
 * Renders an empty state when the wallet has no prior MIRA loans, and a
 * status-filtered list otherwise. Reachable from the originated screen and
 * the nav.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ExternalLink,
  History,
  Coins,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { useMiraStore } from '@/lib/mira/store-client';
import { cc3TxUrl } from '@/lib/mira/explorer';
import type { LoanStatus } from '@mira/shared';

interface HistoryItem {
  loanId: string;
  status: LoanStatus;
  amount: number;
  rate: number;
  term: number;
  originatedBlock: number;
  dueBlock: number;
  originTxHash: string;
  repaymentTxHash?: string;
  writabilityTxHash?: string;
  createdAt: string;
}

interface HistoryResponse {
  walletAddress: string;
  loans: HistoryItem[];
  borrowerReputation: { repaid: number; defaulted: number };
}

const FILTERS: Array<{ key: 'all' | LoanStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Originated', label: 'Active' },
  { key: 'Repaid', label: 'Repaid' },
  { key: 'Defaulted', label: 'Defaulted' },
];

export function LoanHistory() {
  const { wallet, setView, resetFlow } = useMiraStore();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | LoanStatus>('all');

  async function load() {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/loan/history?walletAddress=${encodeURIComponent(wallet.address)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json: HistoryResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [wallet?.address]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.loans;
    return data.loans.filter((l) => l.status === filter);
  }, [data, filter]);

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
              <History className="mr-1 h-3 w-3" />
              Your loan history
            </Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Your MIRA track record
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Every loan originated against this wallet, with on-chain evidence. Your repayment
              history feeds straight back into your next credit decision.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Summary stats */}
      {data && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Coins className="h-4 w-4" />
              </div>
              <CardTitle className="mt-3 font-mono text-2xl">{data.loans.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">Total loans</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <TrendingUp className="h-4 w-4" />
              </div>
              <CardTitle className="mt-3 font-mono text-2xl text-emerald-600">
                {data.borrowerReputation.repaid}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">Repaid</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <TrendingDown className="h-4 w-4" />
              </div>
              <CardTitle className="mt-3 font-mono text-2xl text-destructive">
                {data.borrowerReputation.defaulted}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">Defaulted</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter pills */}
      {data && data.loans.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count =
              f.key === 'all'
                ? data.loans.length
                : data.loans.filter((l) => l.status === f.key).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-border text-muted-foreground hover:border-emerald-500/40 hover:text-foreground'
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] ${
                    active ? 'bg-emerald-500/20' : 'bg-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className="mt-6">
        {loading ? (
          <HistorySkeleton />
        ) : error ? (
          <Card className="border-destructive/40 bg-destructive/[0.03]">
            <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : !data || data.loans.length === 0 ? (
          <EmptyState onConnectAnother={resetFlow} />
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No loans match this filter.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {filtered.map((loan, i) => (
              <motion.li
                key={loan.loanId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
              >
                <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/30 hover:shadow-md">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      {/* Left: identity + terms */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={loan.status} />
                          <VerifiedBadge label="On-chain" />
                          <span className="text-xs text-muted-foreground">
                            {formatRelative(loan.createdAt)}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                          <Field label="Amount" value={`$${loan.amount}`} mono />
                          <Field label="Rate" value={`${loan.rate.toFixed(1)}% APR`} mono />
                          <Field label="Term" value={`${loan.term} days`} mono />
                          <Field
                            label="Due block"
                            value={`#${loan.dueBlock.toLocaleString()}`}
                            mono
                          />
                        </div>
                      </div>

                      {/* Right: evidence */}
                      <div className="w-full shrink-0 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs sm:w-64">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Evidence
                          </span>
                          <TxHash hash={loan.loanId} href={cc3TxUrl(loan.loanId)} copyable={false} label="Loan" />
                        </div>
                        <div className="space-y-1">
                          <TxHash
                            hash={loan.originTxHash}
                            href={cc3TxUrl(loan.originTxHash)}
                            label="Origin"
                            copyable={false}
                          />
                          {loan.repaymentTxHash && (
                            <TxHash
                              hash={loan.repaymentTxHash}
                              href={cc3TxUrl(loan.repaymentTxHash)}
                              label="Repay"
                              copyable={false}
                            />
                          )}
                          {loan.writabilityTxHash && (
                            <TxHash
                              hash={loan.writabilityTxHash}
                              href={`https://sepolia.etherscan.io/tx/${loan.writabilityTxHash}`}
                              label="Writability"
                              copyable={false}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={() => setView('landing')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to home
        </Button>
        <Button onClick={resetFlow}>
          Start a new application
          <ExternalLink className="ml-2 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: LoanStatus }) {
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

function EmptyState({ onConnectAnother }: { onConnectAnother: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold">No MIRA loans yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          This wallet has no prior MIRA history. Apply for a loan and your repayment record will
          appear here — and feed back into your next credit decision.
        </p>
        <Button className="mt-5" onClick={onConnectAnother}>
          Apply for a loan
        </Button>
      </CardContent>
    </Card>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-12 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
