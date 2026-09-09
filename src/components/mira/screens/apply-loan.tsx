'use client';

/**
 * Apply screen — the wow moment.
 *
 * The borrower picks an amount + term and hits Apply. The screen then shows
 * three concurrent progress states that mirror the real pipeline:
 *
 *   1. "Generating Attestcoin proof…"   (~2-5s, progress bar)
 *   2. "Verifying on Creditcoin…"        (~15s, block-mining animation)
 *   3. "MIRA is deciding…"               (~2-4s, animated avatar)
 *
 * The API call returns once the whole pipeline finishes; the UI paces the
 * three phases so the audience can feel the verification happening rather
 * than staring at a black box.
 */

import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  FileSignature,
  Boxes,
  Brain,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useMiraStore } from '@/lib/mira/store-client';

const TERMS = [7, 30, 90] as const;
const MAX_AMOUNT = 1000;

export function ApplyLoan() {
  const prefersReduced = useReducedMotion();
  const { credit, applyLoading, applyPhase, applyError, setView, runApply } = useMiraStore();
  const [amount, setAmount] = useState(250);
  const [term, setTerm] = useState<number>(30);

  // Keep the block-height ticker lively during the verify phase.
  const [blockTick, setBlockTick] = useState(4_821_400);
  useEffect(() => {
    if (!applyLoading || applyPhase !== 'verify') return;
    const id = setInterval(() => setBlockTick((b) => b + 1), 1200);
    return () => clearInterval(id);
  }, [applyLoading, applyPhase]);

  const monthlyRate = (amount * (term === 7 ? 0.12 : term === 30 ? 0.14 : 0.2)) / 12;

  function handleApply() {
    void runApply(amount, term);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Badge
          variant="outline"
          className="mb-4 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600"
        >
          Step 3 — Apply
        </Badge>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Request a loan
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Pick an amount and term. MIRA will verify your factors, ask the bounded agent for a
          decision, and originate the loan on Creditcoin — in roughly one block.
        </p>
      </motion.div>

      {!applyLoading ? (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mt-8 space-y-6"
        >
          {/* Amount */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Loan amount</CardTitle>
                <span className="font-mono text-2xl font-semibold tracking-tight">
                  ${amount}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Slider
                value={[amount]}
                onValueChange={(v) => setAmount(v[0] ?? amount)}
                min={50}
                max={MAX_AMOUNT}
                step={50}
                aria-label="Loan amount in USD"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$50</span>
                <span>${MAX_AMOUNT}</span>
              </div>
            </CardContent>
          </Card>

          {/* Term */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Term</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {TERMS.map((t) => {
                  const active = term === t;
                  const apr = t === 7 ? '12%' : t === 30 ? '14%' : '20%';
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTerm(t)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-xl border p-4 text-left transition-all',
                        active
                          ? 'border-emerald-500 bg-emerald-500/[0.06] shadow-sm shadow-emerald-500/10'
                          : 'border-border hover:border-emerald-500/40 hover:bg-emerald-500/[0.02]',
                      )}
                    >
                      <div className="font-mono text-xl font-semibold">{t} days</div>
                      <div className="mt-1 text-xs text-muted-foreground">~{apr} APR</div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Indicative APR — the agent sets the final rate based on your verified factors.
              </p>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-muted/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Indicative first-month interest</span>
                <span className="font-mono font-medium">
                  ~${monthlyRate.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Due</span>
                <span className="font-medium">In {term} days</span>
              </div>
            </CardContent>
          </Card>

          {applyError && (
            <p className="rounded-lg bg-destructive/[0.06] p-3 text-sm text-destructive">
              {applyError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setView('factors')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button size="lg" onClick={handleApply} disabled={!credit?.verified}>
              Apply for ${amount}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      ) : (
        <VerificationWait phase={applyPhase} blockTick={blockTick} />
      )}
    </div>
  );
}

function VerificationWait({
  phase,
  blockTick,
}: {
  phase: 'proof' | 'verify' | 'decide' | 'done' | 'idle';
  blockTick: number;
}) {
  const steps = [
    {
      key: 'proof',
      icon: FileSignature,
      label: 'Generating Attestcoin proof',
      hint: 'Worker calls the ProofBuilder API',
    },
    {
      key: 'verify',
      icon: Boxes,
      label: 'Verifying on Creditcoin',
      hint: 'BlockProver precompile · ~15s',
    },
    {
      key: 'decide',
      icon: Brain,
      label: 'MIRA is deciding',
      hint: 'Bounded LLM underwriting',
    },
  ] as const;

  const order = ['proof', 'verify', 'decide'] as const;
  const activeIndex = order.indexOf(phase as (typeof order)[number]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mt-8"
    >
      <Card className="overflow-hidden border-emerald-500/30">
        <div className="bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-amber-500/[0.05] p-6 sm:p-8">
          <div className="mx-auto max-w-md text-center">
            <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
              <motion.span
                className="absolute inset-0 rounded-full bg-emerald-500/20"
                animate={useReducedMotion() ? {} : { scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/30">
                <motion.div
                  animate={useReducedMotion() ? {} : { rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 className="h-7 w-7" />
                </motion.div>
              </div>
            </div>
            <h2 className="text-xl font-semibold">Verifying your credit</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every factor is proven on-chain before the agent decides.
            </p>
          </div>

          {/* Steps */}
          <ol className="mx-auto mt-8 max-w-md space-y-3">
            {steps.map((step, i) => {
              const done = i < activeIndex || phase === 'done';
              const active = i === activeIndex && phase !== 'done';
              const StepIcon = done ? CheckCircle2 : step.icon;
              return (
                <li
                  key={step.key}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                    done
                      ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                      : active
                        ? 'border-emerald-500/50 bg-emerald-500/[0.08]'
                        : 'border-border bg-background/50 opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      done
                        ? 'bg-emerald-500 text-emerald-950'
                        : active
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {active ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{step.label}</div>
                    <div className="text-xs text-muted-foreground">{step.hint}</div>
                  </div>
                  {step.key === 'verify' && active && (
                    <span className="font-mono text-xs text-emerald-600">
                      #{blockTick.toLocaleString()}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Progress bar */}
          <div className="mx-auto mt-6 max-w-md">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                initial={{ width: '0%' }}
                animate={{
                  width:
                    phase === 'proof'
                      ? '30%'
                      : phase === 'verify'
                        ? '70%'
                        : phase === 'decide'
                          ? '90%'
                          : '100%',
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
