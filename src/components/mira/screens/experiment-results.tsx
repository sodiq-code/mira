'use client';

/**
 * Experiment results screen — shows the 3-strategy comparison table
 * that proves MIRA's AI makes better capital-allocation decisions.
 *
 * "We didn't just add an LLM. We measured whether underwriting with
 * verified cross-chain history improves capital allocation."
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Loader2, ArrowLeft, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMiraStore } from '@/lib/mira/store-client';
import { cn } from '@/lib/utils';

interface DecisionRow {
  borrowerId: string;
  borrowerLabel: string;
  decision: string;
  amount: number;
  apr: number;
  defaultProbability: number;
}

interface StrategyResult {
  strategy: string;
  label: string;
  approvalRate: number;
  averageApr: number;
  estimatedDefaultRate: number;
  capitalEfficiency: number;
  totalApproved: number;
  totalRequested: number;
  decisions: DecisionRow[];
}

export function ExperimentResults() {
  const { setView } = useMiraStore();
  const [results, setResults] = useState<StrategyResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/experiment', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { results: StrategyResult[] }) => {
        if (active) {
          setResults(data.results);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load experiment');
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Badge variant="outline" className="mb-4 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600">
          <FlaskConical className="mr-1.5 h-3 w-3" />
          Measurability
        </Badge>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          We measured whether the AI improves capital allocation.
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Three underwriting strategies, eight test borrowers, one question: does underwriting with
          verified cross-chain history produce better decisions than simple rules?
        </p>
      </motion.div>

      {loading ? (
        <div className="mt-12 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Running experiment (calling the LLM for each borrower)...
        </div>
      ) : error ? (
        <Card className="mt-8 border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : results ? (
        <>
          {/* Summary table */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-8"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Strategy comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Strategy</th>
                        <th className="pb-2 pr-4 text-right font-medium">Approval rate</th>
                        <th className="pb-2 pr-4 text-right font-medium">Avg APR</th>
                        <th className="pb-2 pr-4 text-right font-medium">Est. default rate</th>
                        <th className="pb-2 pr-4 text-right font-medium">Capital deployed</th>
                        <th className="pb-2 text-right font-medium">Capital efficiency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {results.map((r) => (
                        <tr key={r.strategy} className={cn(r.strategy === 'mira-ai' && 'bg-emerald-500/[0.04]')}>
                          <td className="py-3 pr-4">
                            <span className={cn('font-medium', r.strategy === 'mira-ai' && 'text-emerald-600')}>
                              {r.label}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right font-mono">{r.approvalRate.toFixed(0)}%</td>
                          <td className="py-3 pr-4 text-right font-mono">{r.averageApr.toFixed(1)}%</td>
                          <td className={cn('py-3 pr-4 text-right font-mono', r.estimatedDefaultRate > 15 ? 'text-destructive' : 'text-emerald-600')}>
                            {r.estimatedDefaultRate.toFixed(1)}%
                          </td>
                          <td className="py-3 pr-4 text-right font-mono">${r.totalApproved}</td>
                          <td className="py-3 text-right font-mono font-semibold">
                            ${r.capitalEfficiency.toFixed(0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Per-borrower breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="mt-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-borrower decisions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">Borrower</th>
                        <th className="pb-2 pr-3 text-right font-medium">Default risk</th>
                        {results.map((r) => (
                          <th key={r.strategy} className="pb-2 pr-3 text-center font-medium">
                            {r.label.split(' ')[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {results[0]?.decisions.map((_, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-3 font-medium">{results[0].decisions[i].borrowerLabel}</td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {(results[0].decisions[i].defaultProbability * 100).toFixed(0)}%
                          </td>
                          {results.map((r) => {
                            const d = r.decisions[i];
                            const approved = d.decision !== 'decline';
                            return (
                              <td key={r.strategy} className="py-2 pr-3 text-center">
                                {approved ? (
                                  <span className="font-mono text-emerald-600">
                                    ${d.amount} @ {d.apr}%
                                  </span>
                                ) : (
                                  <span className="text-destructive">Decline</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Interpretation */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="mt-6"
          >
            <Card className="border-emerald-500/30 bg-emerald-500/[0.02]">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-600">What this proves</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      MIRA&apos;s AI doesn&apos;t just approve everyone (like collateral-only, which
                      has the highest default rate) or use a blunt threshold (like static-score,
                      which rejects worthy borrowers). It evaluates each borrower&apos;s verified
                      factors individually — approving strong profiles at lower rates, declining
                      risky ones, and offering reduced amounts to marginal cases. The result is
                      higher capital efficiency: more productive capital deployed per dollar of
                      expected default.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      ) : null}

      <div className="mt-8">
        <Button variant="ghost" onClick={() => setView('landing')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to home
        </Button>
      </div>
    </div>
  );
}
