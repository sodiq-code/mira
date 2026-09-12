'use client';

/**
 * Loan Originated screen.
 *
 * Confirms the loan is live on Creditcoin and exposes the two lifecycle
 * actions a demo audience cares about:
 *
 *   - Mark repaid: verifies a repayment via Attestcoin and increments the
 *     agent&apos;s repaid counter.
 *   - Trigger default (demo-only): forces a default to demonstrate the
 *     Attestcoin Writability path — a Creditcoin-initiated action on
 *     Ethereum Sepolia. Clearly labelled so it is never mistaken for a real
 *     default.
 *
 * Every transaction hash is a clickable explorer link.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ExternalLink,
  Coins,
  CalendarClock,
  Hash,
  RotateCcw,
  AlertTriangle,
  Zap,
  PartyPopper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { ClampCallout } from '@/components/mira/ui/clamp-callout';
import { formatUsd } from '@/lib/mira/format';
import { useMiraStore } from '@/lib/mira/store-client';
import { cc3TxUrl } from '@/lib/mira/explorer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export function LoanOriginated() {
  const {
    loan,
    decision,
    repayLoading,
    repayResult,
    defaultLoading,
    defaultResult,
    runRepay,
    runTriggerDefault,
    resetFlow,
    setView,
  } = useMiraStore();
  const { toast } = useToast();
  const [repayed, setRepayed] = useState(false);

  useEffect(() => {
    if (repayResult && !repayed) {
      setRepayed(true);
      toast({
        title: 'Repayment verified',
        description: 'The agent reputation has been updated on-chain.',
      });
    }
  }, [repayResult, repayed, toast]);

  if (!loan || !decision) return null;

  const repaid = !!repayResult;
  const defaulted = !!defaultResult;

  async function handleRepay() {
    try {
      await runRepay();
    } catch (err) {
      toast({
        title: 'Repayment failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function handleDefault() {
    try {
      await runTriggerDefault();
      toast({
        title: 'Writability action fired',
        description: 'A Creditcoin-initiated transaction was sent to Ethereum Sepolia.',
      });
    } catch (err) {
      toast({
        title: 'Default trigger failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          className={
            repaid
              ? 'border-emerald-500/50'
              : defaulted
                ? 'border-destructive/50'
                : 'border-emerald-500/40'
          }
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <span
                className={
                  'flex h-11 w-11 items-center justify-center rounded-full ' +
                  (defaulted
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-emerald-500/15 text-emerald-600')
                }
              >
                {repaid ? (
                  <PartyPopper className="h-6 w-6" />
                ) : defaulted ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <CheckCircle2 className="h-6 w-6" />
                )}
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {repaid ? 'Loan repaid' : defaulted ? 'Loan defaulted' : 'Loan originated'}
                </p>
                <CardTitle className="text-xl">
                  {repaid
                    ? 'Repayment verified on-chain'
                    : defaulted
                      ? 'Default recorded · Writability fired'
                      : 'Your loan is live on Creditcoin'}
                </CardTitle>
              </div>
              <Badge
                variant="outline"
                className={
                  'ml-auto ' +
                  (defaulted
                    ? 'border-destructive/40 text-destructive'
                    : repaid
                      ? 'border-emerald-500/40 text-emerald-600'
                      : 'border-amber-500/40 text-amber-600')
                }
              >
                {defaulted ? 'Defaulted' : repaid ? 'Repaid' : 'Originated'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Amount-clamp callout — surfaces the silent reduction that
                happens when the LLM or the on-chain tier cap clamps the
                approved amount below what the borrower asked for. */}
            {!repaid && !defaulted && decision.wasClamped && decision.requestedAmount && (
              <ClampCallout
                requestedAmount={decision.requestedAmount}
                approvedAmount={decision.approvedAmount}
                effectiveCap={decision.effectiveCap}
                agentScore={decision.agentReputation.currentScore}
              />
            )}

            {/* Loan terms */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Detail icon={Coins} label="Amount" value={formatUsd(loan.amount)} />
              <Detail label="Rate" value={`${loan.rate.toFixed(1)}% APR`} />
              <Detail label="Term" value={`${loan.term} days`} />
              <Detail icon={CalendarClock} label="Status" value={statusText(repaid, defaulted)} />
            </div>

            <Separator />

            {/* On-chain evidence */}
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  On-chain evidence
                </span>
                <VerifiedBadge className="ml-auto" />
              </div>
              <Row label="Loan ID">
                <TxHash hash={loan.loanId} href={cc3TxUrl(loan.loanId)} />
              </Row>
              <Row label="Origin tx">
                <TxHash hash={loan.originTxHash} href={cc3TxUrl(loan.originTxHash)} />
              </Row>
              {repayResult && (
                <Row label="Repayment verify tx">
                  <TxHash
                    hash={repayResult.verificationTxHash}
                    href={cc3TxUrl(repayResult.verificationTxHash)}
                  />
                </Row>
              )}
              {defaultResult && (
                <Row label="Writability tx (Sepolia)">
                  <TxHash
                    hash={defaultResult.writabilityTxHash}
                    href={`https://sepolia.etherscan.io/tx/${defaultResult.writabilityTxHash}`}
                  />
                </Row>
              )}
            </div>

            {/* Reputation delta after lifecycle action */}
            {(repayResult || defaultResult) && (
              <div className="grid grid-cols-3 gap-3 rounded-lg border border-border/60 p-4 text-center">
                <RepStat
                  label="Loans"
                  value={
                    (defaultResult ?? repayResult)?.agentReputationAfter?.cumulativeLoans ??
                    decision.agentReputation.cumulativeLoans
                  }
                />
                <RepStat
                  label="Repaid"
                  value={
                    repayResult?.newAgentReputation.cumulativeRepaid ??
                    decision.agentReputation.cumulativeRepaid
                  }
                  accent="emerald"
                />
                <RepStat
                  label="Defaulted"
                  value={
                    defaultResult?.agentReputationAfter.cumulativeDefaulted ??
                    decision.agentReputation.cumulativeDefaulted
                  }
                  accent="red"
                />
              </div>
            )}

            {/* Actions */}
            {!repaid && !defaulted && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button onClick={handleRepay} disabled={repayLoading}>
                  {repayLoading ? 'Verifying repayment…' : 'Mark loan repaid'}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={defaultLoading}>
                      <Zap className="mr-2 h-4 w-4 text-amber-600" />
                      {defaultLoading ? 'Firing writability…' : 'Trigger default (demo)'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Trigger a demo default?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This is a demo-only action that forces the loan into Defaulted state to
                        show the Attestcoin Writability path — a Creditcoin-initiated transaction
                        on Ethereum Sepolia. The agent&apos;s defaulted counter will increment and
                        its reputation score will decrease.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDefault}>
                        Trigger default
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setView('decision')}>
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setView('reputation')}>
                  View agent reputation
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Button>
                <Button variant="secondary" onClick={resetFlow}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  New application
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function statusText(repaid: boolean, defaulted: boolean): string {
  if (repaid) return 'Repaid';
  if (defaulted) return 'Defaulted';
  return 'Originated';
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Coins;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-base font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function RepStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'red';
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'red' && value > 0
        ? 'text-destructive'
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
