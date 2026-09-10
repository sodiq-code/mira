'use client';

/**
 * Attack MIRA — the adversarial demo screen.
 *
 * Five attacks, each proving a different rejection path. The headline
 * message is "We don't trust the AI" — every attack shows the on-chain
 * Policy or Loan contract rejecting a malicious or invalid input.
 *
 * Each attack card has a trigger button. Clicking it calls /api/attack
 * with the scenario name, and the response shows the revert reason from
 * the real CC3 Testnet contract (or a simulated reason when contracts
 * aren't configured).
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldX,
  Skull,
  FileX,
  UserX,
  Clock,
  Droplet,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Fingerprint,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMiraStore } from '@/lib/mira/store-client';
import { cn } from '@/lib/utils';

interface AttackDef {
  id: string;
  icon: typeof Skull;
  title: string;
  description: string;
  expectedResult: string;
  accent: 'red' | 'amber';
}

const ATTACKS: AttackDef[] = [
  {
    id: 'malicious-llm',
    icon: Skull,
    title: 'Malicious LLM output',
    description: 'The AI proposes a $10,000 loan at 1% APR — far above the agent\'s authority and below the rate floor.',
    expectedResult: 'Policy rejects: exceeds tier cap + below rate floor',
    accent: 'red',
  },
  {
    id: 'fake-repayment',
    icon: FileX,
    title: 'Fake repayment proof',
    description: 'A fabricated repayment proof hash is submitted for a non-existent loan.',
    expectedResult: 'Loan contract reverts: loan does not exist',
    accent: 'red',
  },
  {
    id: 'fabricated-proof',
    icon: Fingerprint,
    title: 'Fabricated Attestcoin proof',
    description: 'A fabricated proof is submitted to markRepaidWithProof. The Loan contract calls the BlockProver precompile itself to verify — a compromised worker key cannot fabricate a repayment.',
    expectedResult: 'Contract reverts: Attestcoin proof verification failed',
    accent: 'red',
  },
  {
    id: 'wrong-borrower',
    icon: UserX,
    title: 'Wrong borrower binding',
    description: 'A valid-looking loan decision is submitted for a borrower whose address doesn\'t match the verified evidence.',
    expectedResult: 'Proof verification fails: borrower binding mismatch',
    accent: 'amber',
  },
  {
    id: 'expired-evidence',
    icon: Clock,
    title: 'Expired evidence',
    description: 'A loan decision is submitted with an attestation proof past its validity window.',
    expectedResult: 'Policy rejects: evidence outside validity window',
    accent: 'amber',
  },
  {
    id: 'insufficient-liquidity',
    icon: Droplet,
    title: 'Insufficient liquidity',
    description: 'A perfect borrower applies for a loan larger than the pool\'s available capital.',
    expectedResult: 'Policy rejects: exceeds available liquidity',
    accent: 'red',
  },
];

interface AttackResponse {
  attack: string;
  title: string;
  description: string;
  expectedResult: string;
  reverted: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

export function AttackMIRA() {
  const { setView } = useMiraStore();
  const [results, setResults] = useState<Record<string, AttackResponse>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function runAttack(id: string) {
    setLoading(id);
    try {
      const res = await fetch('/api/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attack: id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AttackResponse = await res.json();
      setResults((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [id]: {
          attack: id,
          title: ATTACKS.find((a) => a.id === id)?.title ?? id,
          description: '',
          expectedResult: '',
          reverted: true,
          reason: err instanceof Error ? err.message : 'Attack failed',
        },
      }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Badge variant="outline" className="mb-4 border-destructive/40 bg-destructive/[0.04] text-destructive">
          <ShieldX className="mr-1.5 h-3 w-3" />
          Adversarial demo
        </Badge>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          We don&apos;t trust the AI.
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Six attacks against MIRA. Each one submits a malicious or invalid input to the
          on-chain Policy and Loan contracts. Every attack is rejected — the agent cannot
          approve a loan above its tier cap, accept a fake proof, fabricate an Attestcoin
          repayment proof, bind the wrong borrower, use expired evidence, or draw more
          capital than the pool holds.
        </p>
      </motion.div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ATTACKS.map((attack, i) => {
          const result = results[attack.id];
          const isLoading = loading === attack.id;
          return (
            <motion.div
              key={attack.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Card className={cn(
                'h-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
                result?.reverted && 'border-emerald-500/30',
                result && !result.reverted && 'border-destructive/40',
              )}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      attack.accent === 'red'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-amber-500/10 text-amber-600',
                    )}>
                      <attack.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{attack.title}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">{attack.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Expected result
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{attack.expectedResult}</p>
                  </div>

                  {result && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                      className={cn(
                        'rounded-lg border p-3',
                        result.reverted
                          ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                          : 'border-destructive/30 bg-destructive/[0.04]',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {result.reverted ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span className={cn(
                          'text-xs font-semibold',
                          result.reverted ? 'text-emerald-600' : 'text-destructive',
                        )}>
                          {result.reverted ? 'REJECTED' : 'PASSED (unexpected!)'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Reason:</span> {result.reason}
                      </p>
                      {result.details && Object.keys(result.details).length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                          {Object.entries(result.details).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">{k}</span>
                              <span className="font-mono text-foreground">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}

                  <Button
                    onClick={() => runAttack(attack.id)}
                    disabled={isLoading}
                    variant={result?.reverted ? 'outline' : 'default'}
                    size="sm"
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Running attack...
                      </>
                    ) : result ? (
                      'Run again'
                    ) : (
                      `Run attack #${i + 1}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setView('landing')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to home
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldX className="h-4 w-4 text-destructive" />
          Every attack is rejected on-chain.
        </div>
      </div>
    </div>
  );
}
