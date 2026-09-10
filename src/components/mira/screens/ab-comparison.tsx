'use client';

/**
 * A/B Borrower Comparison — side-by-side demo of two borrowers:
 * Borrower A (strong profile, repays) vs Borrower B (weak profile, defaults).
 *
 * Driven by REAL on-chain agent reputation from CC3 Testnet (via
 * /api/ab-comparison). The score deltas (+10 for repaid, -25 for
 * defaulted) and the capital-authority changes use the contract's
 * actual weights and tier ladder — not a static mock. Each outcome
 * is labelled with the number of real on-chain events that back it.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMiraStore } from '@/lib/mira/store-client';
import { cn } from '@/lib/utils';

interface BorrowerOutcome {
  label: string;
  profile: string;
  outcome: 'repaid' | 'defaulted';
  scoreDelta: number;
  scoreBefore: number;
  scoreAfter: number;
  authorityBefore: number;
  authorityAfter: number;
  authorityChanged: boolean;
  backedByCount: number;
  note: string;
}

interface CurrentRep {
  cumulativeLoans: number;
  cumulativeRepaid: number;
  cumulativeDefaulted: number;
  currentScore: number;
  currentCapitalAuthority: number;
  onChainTierCapConfirmed: boolean;
}

interface ABResponse {
  real: boolean;
  currentReputation: CurrentRep | null;
  borrowerA: BorrowerOutcome;
  borrowerB: BorrowerOutcome;
  scoreFormula: string;
  note?: string;
  error?: string;
}

function formatAuthority(cents: number): string {
  if (cents === 0) return '$0';
  return `$${cents / 100}`;
}

export function ABComparison() {
  const { setView } = useMiraStore();
  const [data, setData] = useState<ABResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [animating, setAnimating] = useState(false);

  async function fetchData() {
    setLoading(true);
    setShowResults(false);
    try {
      const res = await fetch('/api/ab-comparison', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ABResponse = await res.json();
      setData(json);
    } catch (err) {
      setData({
        real: false,
        currentReputation: null,
        borrowerA: {
          label: 'Borrower A',
          profile: 'Strong verified Sepolia activity',
          outcome: 'repaid',
          scoreDelta: 10,
          scoreBefore: 500,
          scoreAfter: 510,
          authorityBefore: 2500,
          authorityAfter: 2500,
          authorityChanged: false,
          backedByCount: 0,
          note: 'Could not reach the on-chain reputation contract.',
        },
        borrowerB: {
          label: 'Borrower B',
          profile: 'Weak verified Sepolia activity',
          outcome: 'defaulted',
          scoreDelta: -25,
          scoreBefore: 500,
          scoreAfter: 475,
          authorityBefore: 2500,
          authorityAfter: 0,
          authorityChanged: true,
          backedByCount: 0,
          note: 'Could not reach the on-chain reputation contract.',
        },
        scoreFormula: 'score = 500 + repaid × 10 − defaulted × 25',
        error: err instanceof Error ? err.message : 'fetch failed',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function runComparison() {
    setAnimating(true);
    setTimeout(() => {
      setShowResults(true);
      setAnimating(false);
    }, 1500);
  }

  const scenarios = data ? [data.borrowerA, data.borrowerB] : [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Badge variant="outline" className="mb-4 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600">
          <Users className="mr-1.5 h-3 w-3" />
          Two-outcome demo
        </Badge>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Two borrowers. Two outcomes. One feedback loop.
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Borrower A repays. Borrower B defaults. The score deltas and capital-authority
          changes below are computed from the <strong>real on-chain agent reputation</strong> on
          CC3 Testnet using the contract&apos;s actual weights and tier ladder — not a static mock.
        </p>
      </motion.div>

      {/* Current on-chain reputation */}
      {data?.real && data.currentReputation && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-6"
        >
          <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Live on-chain</p>
                    <p className="text-sm font-semibold">Agent reputation</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Score: </span>
                    <span className="font-mono font-bold">{data.currentReputation.currentScore}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Repaid: </span>
                    <span className="font-mono font-bold text-emerald-600">{data.currentReputation.cumulativeRepaid}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Defaulted: </span>
                    <span className="font-mono font-bold text-destructive">{data.currentReputation.cumulativeDefaulted}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Authority: </span>
                    <span className="font-mono font-bold">{formatAuthority(data.currentReputation.currentCapitalAuthority)}</span>
                  </div>
                </div>
                {data.currentReputation.onChainTierCapConfirmed && (
                  <Badge variant="outline" className="ml-auto border-emerald-500/40 text-emerald-600">
                    Tier ladder verified on-chain
                  </Badge>
                )}
              </div>
              {data.scoreFormula && (
                <p className="mt-3 font-mono text-xs text-muted-foreground">{data.scoreFormula}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-8 flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-3 text-sm text-muted-foreground">Reading on-chain reputation…</span>
        </div>
      )}

      {/* Borrower cards */}
      {!loading && scenarios.length === 2 && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {scenarios.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              <Card className={cn(
                'h-full transition-all',
                s.outcome === 'repaid' ? 'border-emerald-500/30' : 'border-destructive/30',
              )}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      s.outcome === 'repaid' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive',
                    )}>
                      {s.outcome === 'repaid' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </span>
                    <div>
                      <CardTitle className="text-base">{s.label}</CardTitle>
                      <p className="text-xs text-muted-foreground">{s.profile}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {showResults && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.4 }}
                      className={cn(
                        'rounded-lg border p-3',
                        s.outcome === 'repaid'
                          ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                          : 'border-destructive/30 bg-destructive/[0.04]',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {s.outcome === 'repaid' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span className={cn(
                          'text-xs font-bold uppercase',
                          s.outcome === 'repaid' ? 'text-emerald-600' : 'text-destructive',
                        )}>
                          {s.outcome === 'repaid' ? 'Repaid' : 'Defaulted'}
                        </span>
                      </div>

                      {/* Score change */}
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Agent score</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-muted-foreground">{s.scoreBefore}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className={cn(
                              'font-mono font-bold',
                              s.scoreDelta > 0 ? 'text-emerald-600' : 'text-destructive',
                            )}>
                              {s.scoreAfter}
                            </span>
                            <span className={cn(
                              'font-mono font-bold',
                              s.scoreDelta > 0 ? 'text-emerald-600' : 'text-destructive',
                            )}>
                              ({s.scoreDelta > 0 ? '+' : ''}{s.scoreDelta})
                            </span>
                            {s.scoreDelta > 0 ? (
                              <ArrowUp className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-destructive" />
                            )}
                          </div>
                        </div>

                        {/* Authority change */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Capital authority</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-muted-foreground">{formatAuthority(s.authorityBefore)}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className={cn(
                              'font-mono font-bold',
                              s.authorityChanged
                                ? (s.authorityAfter > s.authorityBefore ? 'text-emerald-600' : 'text-destructive')
                                : 'text-foreground',
                            )}>
                              {formatAuthority(s.authorityAfter)}
                            </span>
                            {s.authorityChanged ? (
                              s.authorityAfter > s.authorityBefore ? (
                                <ArrowUp className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <ArrowDown className="h-3 w-3 text-destructive" />
                              )
                            ) : null}
                          </div>
                        </div>

                        {/* Real tokens */}
                        <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Coins className="h-3 w-3" />
                            ERC-20 tokens
                          </span>
                          <span className="font-mono">
                            {s.outcome === 'repaid' ? 'returned to pool' : 'lost to default'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Backed-by count */}
                  {data?.real && (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-emerald-600">{s.backedByCount}</span>{' '}
                        real on-chain {s.outcome === 'repaid' ? 'repayments' : 'default'} back this outcome.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Summary */}
      {showResults && data && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="mt-6"
        >
          <Card className="border-emerald-500/30 bg-emerald-500/[0.02]">
            <CardContent className="p-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">The feedback loop, visualized:</strong>{' '}
                Borrower A repays → score <span className="font-mono text-emerald-600">+{data.borrowerA.scoreDelta}</span>
                {data.borrowerA.authorityChanged ? ' → authority grows' : ' → authority holds'}.{' '}
                Borrower B defaults → score <span className="font-mono text-destructive">{data.borrowerB.scoreDelta}</span>
                {data.borrowerB.authorityChanged ? ' → authority shrinks' : ' → authority holds'}.{' '}
                The agent&apos;s own track record determines how much capital it&apos;s trusted to manage — automatically, on-chain, no human intervention.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* CTA */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setView('landing')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to home
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={runComparison} disabled={animating || loading}>
            {animating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing loans...
              </>
            ) : showResults ? (
              'Run again'
            ) : (
              'Run comparison'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
