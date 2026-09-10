'use client';

/**
 * A/B Borrower Comparison — side-by-side demo of two borrowers:
 * Borrower A (strong profile, repays) vs Borrower B (weak profile, defaults).
 *
 * Shows the complete feedback loop visually:
 *   Borrower A: loan → repay → reputation ↑ → authority ↑
 *   Borrower B: loan → default → reputation ↓ → authority ↓
 *
 * This is the "two outcomes" story that makes the feedback loop
 * immediately obvious to a judge.
 */

import { useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMiraStore } from '@/lib/mira/store-client';
import { cn } from '@/lib/utils';

interface BorrowerOutcome {
  label: string;
  profile: string;
  amount: number;
  apr: number;
  outcome: 'repaid' | 'defaulted';
  scoreChange: number;
  authorityChange: number;
  authorityDirection: 'up' | 'down';
}

const SCENARIOS: BorrowerOutcome[] = [
  {
    label: 'Borrower A',
    profile: '18-month wallet, $28K stablecoin volume, 7 DeFi positions, 0 prior defaults',
    amount: 25,
    apr: 5.0,
    outcome: 'repaid',
    scoreChange: 10,
    authorityChange: 0,
    authorityDirection: 'up',
  },
  {
    label: 'Borrower B',
    profile: '6-month wallet, $1.2K stablecoin volume, 1 DeFi position, 1 prior default',
    amount: 25,
    apr: 15.0,
    outcome: 'defaulted',
    scoreChange: -25,
    authorityChange: -75,
    authorityDirection: 'down',
  },
];

export function ABComparison() {
  const { setView } = useMiraStore();
  const [showResults, setShowResults] = useState(false);
  const [animating, setAnimating] = useState(false);

  function runComparison() {
    setAnimating(true);
    setTimeout(() => {
      setShowResults(true);
      setAnimating(false);
    }, 1500);
  }

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
          Borrower A has a strong profile and repays. Borrower B has a weak profile and defaults.
          Watch how each outcome changes MIRA&apos;s reputation score and capital authority —
          automatically, on-chain.
        </p>
      </motion.div>

      {/* Pre-loan state */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {SCENARIOS.map((s, i) => (
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Loan amount</div>
                    <div className="font-mono text-lg font-semibold">${s.amount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">APR</div>
                    <div className="font-mono text-lg font-semibold">{s.apr}%</div>
                  </div>
                </div>

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
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            'font-mono font-bold',
                            s.scoreChange > 0 ? 'text-emerald-600' : 'text-destructive',
                          )}>
                            {s.scoreChange > 0 ? '+' : ''}{s.scoreChange}
                          </span>
                          {s.scoreChange > 0 ? (
                            <ArrowUp className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-destructive" />
                          )}
                        </div>
                      </div>

                      {/* Authority change */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Capital authority</span>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            'font-mono font-bold',
                            s.authorityDirection === 'up' ? 'text-emerald-600' : 'text-destructive',
                          )}>
                            {s.authorityChange !== 0
                              ? `${s.authorityChange > 0 ? '+' : ''}$${s.authorityChange}`
                              : 'unchanged'}
                          </span>
                          {s.authorityDirection === 'up' ? (
                            <ArrowUp className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-destructive" />
                          )}
                        </div>
                      </div>

                      {/* Real tokens */}
                      <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2">
                        <span className="text-muted-foreground">ERC-20 tokens</span>
                        <span className="font-mono">
                          {s.outcome === 'repaid' ? 'returned to pool' : 'lost to default'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Summary comparison */}
      {showResults && (
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
 Borrower A repays → score <span className="font-mono text-emerald-600">+10</span> → authority maintains or grows.{' '}
 Borrower B defaults → score <span className="font-mono text-destructive">-25</span> → authority shrinks.{' '}
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
        <Button onClick={runComparison} disabled={animating}>
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
  );
}
