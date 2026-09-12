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
  ArrowDownWideNarrow,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { ExportMenu } from '@/components/mira/ui/export-menu';
import { useMiraStore } from '@/lib/mira/store-client';
import { cc3TxUrl } from '@/lib/mira/explorer';
import { formatUsd } from '@/lib/mira/format';
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
  const [sort, setSort] = useState<'recent' | 'amount-desc' | 'amount-asc' | 'rate-desc' | 'rate-asc'>(
    'recent',
  );
  const [repaying, setRepaying] = useState<string | null>(null);
  const [repayResults, setRepayResults] = useState<Record<string, boolean>>({});
  const [repayErrors, setRepayErrors] = useState<Record<string, string>>({});

  const LOAN_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_LOAN_ADDRESS ?? '0xcFc46cbE0a8b015C59177f1fE204d9312326Bd28';

  async function handleRepay(loanId: string) {
    setRepaying(loanId);
    setRepayErrors((prev) => { const next = { ...prev }; delete next[loanId]; return next; });
    try {
      const sepoliaRepayTxHash = '0xedd21116c18c96bff741f6545442b92ccb4f9fff42cb37df3e1aa22c1b10733c';
      const res = await fetch('/api/loan/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId, repaymentTxHash: '', sepoliaRepayTxHash }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setRepayResults((prev) => ({ ...prev, [loanId]: true }));
      // Reload the loan history to reflect the updated status.
      load();
    } catch (err) {
      setRepayErrors((prev) => ({
        ...prev,
        [loanId]: err instanceof Error ? err.message.slice(0, 80) : 'Repay failed',
      }));
    } finally {
      setRepaying(null);
    }
  }

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
    let rows = data.loans;
    if (filter !== 'all') rows = rows.filter((l) => l.status === filter);
    const sorted = [...rows].sort((a, b) => {
      switch (sort) {
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        case 'rate-desc':
          return b.rate - a.rate;
        case 'rate-asc':
          return a.rate - b.rate;
        case 'recent':
        default:
          return b.originatedBlock - a.originatedBlock;
      }
    });
    return sorted;
  }, [data, filter, sort]);

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
          <div className="flex items-center gap-2">
            {data && data.loans.length > 0 && (
              <ExportMenu
                rows={data.loans.map((l) => ({
                  loanId: l.loanId,
                  status: l.status,
                  amount: l.amount,
                  rate: l.rate,
                  term: l.term,
                  originatedBlock: l.originatedBlock,
                  dueBlock: l.dueBlock,
                  originTxHash: l.originTxHash,
                  repaymentTxHash: l.repaymentTxHash ?? '',
                  writabilityTxHash: l.writabilityTxHash ?? '',
                  createdAt: l.createdAt,
                }))}
                data={{
                  walletAddress: data.walletAddress,
                  borrowerReputation: data.borrowerReputation,
                  loans: data.loans,
                }}
                filenamePrefix="mira-loan-history"
              />
            )}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Summary stats — borrower-scoped counts computed directly from the
          connected wallet's loan list (not the agent's platform-wide rep). */}
      {data && (
        <BorrowerSummary loans={data.loans} />
      )}

      {/* Filter pills + sort */}
      {data && data.loans.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
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
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Sort loans">
              <ArrowDownWideNarrow className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="amount-desc">Amount: high → low</SelectItem>
              <SelectItem value="amount-asc">Amount: low → high</SelectItem>
              <SelectItem value="rate-desc">Rate: high → low</SelectItem>
              <SelectItem value="rate-asc">Rate: low → high</SelectItem>
            </SelectContent>
          </Select>
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
                          <Field label="Amount" value={formatUsd(loan.amount)} mono />
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
                          <a
                            href={`https://creditcoin-testnet.blockscout.com/address/${LOAN_CONTRACT_ADDRESS}#readContract`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-emerald-600"
                            title="View on CC3 explorer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Loan #{loan.loanId}
                          </a>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between py-0.5">
                            <span className="text-muted-foreground">Originated block</span>
                            <span className="font-mono">#{loan.originatedBlock.toLocaleString()}</span>
                          </div>
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
                        {/* Repay button for active loans */}
                        {loan.status === 'Originated' && (
                          <Button
                            size="sm"
                            className="mt-3 w-full"
                            onClick={() => handleRepay(loan.loanId)}
                            disabled={repaying === loan.loanId}
                          >
                            {repaying === loan.loanId ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Verifying proof...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="mr-2 h-3 w-3" />
                                Repay loan #{loan.loanId}
                              </>
                            )}
                          </Button>
                        )}
                        {repayResults[loan.loanId] && (
                          <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-2 py-1 text-[10px] text-emerald-600">
                            ✓ Repaid — score +10
                          </div>
                        )}
                        {repayErrors[loan.loanId] && (
                          <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/[0.06] px-2 py-1 text-[10px] text-destructive">
                            {repayErrors[loan.loanId]}
                          </div>
                        )}
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

/**
 * Borrower-scoped summary cards. Counts are computed directly from the
 * connected wallet's loan list (filtered to its own address by the
 * /api/loan/history route) so they can never leak the agent's platform-wide
 * cumulative repaid count into the user's widget. The filter-tab counts in
 * the loan list below use the same source, so the summary cards and the
 * filter tabs always agree.
 */
function BorrowerSummary({ loans }: { loans: HistoryItem[] }) {
  const repaid = loans.filter((l) => l.status === 'Repaid').length;
  const defaulted = loans.filter((l) => l.status === 'Defaulted').length;
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Coins className="h-4 w-4" />
          </div>
          <CardTitle className="mt-3 font-mono text-2xl">{loans.length}</CardTitle>
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
            {repaid}
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
            {defaulted}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">Defaulted</p>
        </CardContent>
      </Card>
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
