'use client';

/**
 * Reputation loans table — the recent-loans feed on the agent reputation
 * dashboard, with sortable columns and a status filter.
 *
 * Sorting: click any sortable header to sort ascending; click again to
 * reverse. The active sort column shows a chevron indicator.
 * Filtering: a row of status pills (All / Active / Repaid / Defaulted)
 * narrows the table. Counts are shown on each pill.
 *
 * Desktop renders a real <table>; mobile collapses to stacked cards (the
 * sort/filter controls apply to both).
 */

import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { cc3TxUrl } from '@/lib/mira/explorer';
import { cn } from '@/lib/utils';
import type { LoanStatus } from '@mira/shared';

type SortKey = 'originatedBlock' | 'amount' | 'rate' | 'status';
type SortDir = 'asc' | 'desc';

interface LoanRow {
  loanId: string;
  borrower: string;
  borrowerLabel?: string;
  amount: number;
  rate: number;
  term: number;
  status: LoanStatus;
  originatedBlock: number;
  dueBlock: number;
}

const FILTERS: Array<{ key: 'all' | LoanStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Originated', label: 'Active' },
  { key: 'Repaid', label: 'Repaid' },
  { key: 'Defaulted', label: 'Defaulted' },
];

// Status sort rank so the Status column sorts by severity, not alphabetically.
const STATUS_RANK: Record<LoanStatus, number> = {
  Pending: 0,
  Originated: 1,
  Repaid: 2,
  Defaulted: 3,
};

const SORT_LABELS: Record<SortKey, string> = {
  originatedBlock: 'Block',
  amount: 'Amount',
  rate: 'Rate',
  status: 'Status',
};

export function ReputationLoansTable({ loans }: { loans: LoanRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('originatedBlock');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<'all' | LoanStatus>('all');

  const filtered = useMemo(() => {
    let rows = loans;
    if (filter !== 'all') rows = rows.filter((l) => l.status === filter);
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'rate':
          cmp = a.rate - b.rate;
          break;
        case 'status':
          cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status];
          break;
        case 'originatedBlock':
        default:
          cmp = a.originatedBlock - b.originatedBlock;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [loans, sortKey, sortDir, filter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'originatedBlock' ? 'desc' : 'asc');
    }
  }

  const counts = useMemo(() => {
    const c = { all: loans.length, Originated: 0, Repaid: 0, Defaulted: 0 } as Record<string, number>;
    for (const l of loans) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [loans]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Recent loans</CardTitle>
          <Badge variant="secondary" className="font-mono">
            {filtered.length} shown
          </Badge>
        </div>
        {/* Filter pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count = counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-border text-muted-foreground hover:border-emerald-500/40 hover:text-foreground',
                )}
              >
                {f.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px]',
                    active ? 'bg-emerald-500/20' : 'bg-muted',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {loans.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No loans yet. Be the first.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No loans match this filter.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto pr-1">
            {/* Desktop: sortable table */}
            <table className="hidden w-full text-sm sm:table">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Loan</th>
                  <th className="pb-2 pr-3 font-medium">Borrower</th>
                  <SortableTh
                    label="Amount"
                    active={sortKey === 'amount'}
                    dir={sortDir}
                    onClick={() => toggleSort('amount')}
                    align="right"
                  />
                  <SortableTh
                    label="Rate"
                    active={sortKey === 'rate'}
                    dir={sortDir}
                    onClick={() => toggleSort('rate')}
                    align="right"
                  />
                  <SortableTh
                    label="Status"
                    active={sortKey === 'status'}
                    dir={sortDir}
                    onClick={() => toggleSort('status')}
                  />
                  <SortableTh
                    label="Block"
                    active={sortKey === 'originatedBlock'}
                    dir={sortDir}
                    onClick={() => toggleSort('originatedBlock')}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((loan) => (
                  <tr key={loan.loanId} className="text-xs transition-colors hover:bg-muted/30">
                    <td className="py-2.5 pr-3">
                      <TxHash hash={loan.loanId} href={cc3TxUrl(loan.loanId)} copyable={false} />
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {loan.borrowerLabel ?? loan.borrower.slice(0, 8) + '…'}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono">${loan.amount}</td>
                    <td className="py-2.5 pr-3 text-right font-mono">{loan.rate.toFixed(1)}%</td>
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

            {/* Mobile: stacked cards (sorted + filtered the same way) */}
            <ul className="space-y-2 sm:hidden">
              {filtered.map((loan) => (
                <li
                  key={loan.loanId}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <TxHash hash={loan.loanId} href={cc3TxUrl(loan.loanId)} copyable={false} />
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
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'right';
}) {
  return (
    <th className={cn('pb-2 pr-3 font-medium', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          active && 'text-foreground',
        )}
        aria-label={`Sort by ${label}, currently ${active ? dir : 'inactive'}`}
      >
        <span>{label}</span>
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
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

export function LoansTableSkeleton() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-3 h-7 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-40 w-full" />
      </CardContent>
    </Card>
  );
}

// Re-export the sort labels for any consumer that needs them.
export { SORT_LABELS };
